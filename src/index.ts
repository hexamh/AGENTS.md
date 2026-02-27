// ============================================================
// src/index.ts — Cloudflare Worker: AGENTS.md Bot Entry Point
// ============================================================

import { TelegramClient, TelegramUpdate } from "./telegram";
import { SessionManager, SessionState } from "./session";
import { handleAgentStep, buildProjectSummary, STEP_FLOW } from "./agent";
import { generateAgentsMd } from "./agentsmd";

// ── Environment Types ─────────────────────────────────────────

export interface Env {
  SESSIONS: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  WEBHOOK_SECRET: string;
  ENVIRONMENT: string;
}

// ── Cloudflare Worker Export ──────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Route: /webhook — Telegram webhook handler
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    // Route: /setup — register webhook with Telegram
    if (request.method === "GET" && url.pathname === "/setup") {
      return setupWebhook(request, env);
    }

    // Route: /health — health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: "AGENTS.md Bot", env: env.ENVIRONMENT }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("AGENTS.md Bot is running. 🤖", { status: 200 });
  },
};

// ── Webhook Handler ───────────────────────────────────────────

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  // Verify Telegram webhook secret
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) {
    console.warn("Unauthorized webhook request");
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const sessions = new SessionManager(env.SESSIONS);

  try {
    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, telegram, sessions, env);
      return new Response("OK");
    }

    // Handle text messages
    if (update.message?.text) {
      await handleMessage(update.message, telegram, sessions, env);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
  }

  return new Response("OK");
}

// ── Message Handler ───────────────────────────────────────────

async function handleMessage(
  message: NonNullable<TelegramUpdate["message"]>,
  telegram: TelegramClient,
  sessions: SessionManager,
  env: Env
): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim() || "";

  // ── Command Routing ──────────────────────────────────────

  if (text === "/start") {
    await sessions.delete(chatId);
    await sessions.create(chatId);
    await telegram.sendMessage(
      chatId,
      `👋 *Welcome to AgentsMD Bot!*

I'll help you generate a professional \`AGENTS.md\` file for your project through a structured interview.

*What is AGENTS.md?*
It's an open standard — a "README for AI agents" — that gives coding assistants like OpenAI Codex, GitHub Copilot, Cursor, and Claude Code the context they need to work effectively with your codebase.

I'll ask about your:
• Project description & tech stack
• Build, test, lint & dev commands
• Architecture & conventions
• Git workflow & external services
• Security notes & agent boundaries
• MCP server configuration

_This typically takes 5–10 minutes._

Let's begin! 👇`,
      { parse_mode: "Markdown" }
    );

    // Ask first question
    const firstStep = STEP_FLOW["ask_project_name"]!;
    await telegram.sendMessage(
      chatId,
      `${firstStep.question}\n\n_${firstStep.exampleHint}_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "/help") {
    await telegram.sendMessage(
      chatId,
      `*AgentsMD Bot — Commands*

/start — Start a new AGENTS.md interview
/cancel — Cancel current session
/preview — Preview collected data so far
/help — Show this help message

*Tips:*
• Type \`skip\` to skip optional sections
• You can use /start at any time to restart
• Generated files follow the [AGENTS.md open standard](https://agents.md/)`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
    return;
  }

  if (text === "/cancel") {
    await sessions.delete(chatId);
    await telegram.sendMessage(chatId, "❌ Session cancelled. Use /start to begin again.");
    return;
  }

  if (text === "/preview") {
    const session = await sessions.get(chatId);
    if (!session || session.step === "idle") {
      await telegram.sendMessage(chatId, "No active session. Use /start to begin.");
      return;
    }
    const summary = buildProjectSummary(session.data);
    await telegram.sendMessage(chatId, summary, { parse_mode: "Markdown" });
    return;
  }

  // ── Session Flow ─────────────────────────────────────────

  let session = await sessions.get(chatId);

  if (!session || session.step === "idle" || session.step === "done") {
    await telegram.sendMessage(
      chatId,
      "Use /start to begin generating your AGENTS.md file! 🚀"
    );
    return;
  }

  // Show typing indicator
  await telegram.sendChatAction(chatId, "typing");

  // Process the user's input through the agent engine
  const result = await handleAgentStep(session, text, env.ANTHROPIC_API_KEY);

  // Update session state
  const updatedHistory = [
    ...session.conversationHistory,
    { role: "user" as const, content: text },
    { role: "assistant" as const, content: result.message },
  ];

  session = await sessions.update(chatId, {
    step: result.nextStep,
    data: result.updatedData,
    conversationHistory: updatedHistory.slice(-20), // keep last 10 exchanges
    messageCount: session.messageCount + 1,
  });

  // Show summary before confirm step
  if (result.showSummary) {
    const summary = buildProjectSummary(result.updatedData);
    await telegram.sendMessage(chatId, summary, { parse_mode: "Markdown" });

    await telegram.sendMessage(
      chatId,
      result.message,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Generate AGENTS.md", callback_data: "generate" },
              { text: "🔄 Start Over", callback_data: "restart" },
            ],
          ],
        },
      }
    );
    return;
  }

  // Send agent response
  const replyMarkup = buildStepKeyboard(result.nextStep);

  await telegram.sendMessage(chatId, result.message, {
    parse_mode: "Markdown",
    ...(replyMarkup && { reply_markup: replyMarkup }),
  });
}

// ── Callback Query Handler ────────────────────────────────────

async function handleCallbackQuery(
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>,
  telegram: TelegramClient,
  sessions: SessionManager,
  env: Env
): Promise<void> {
  const chatId = callbackQuery.from.id;
  const data = callbackQuery.data;

  await telegram.answerCallbackQuery(callbackQuery.id);

  if (data === "generate") {
    const session = await sessions.get(chatId);
    if (!session) {
      await telegram.sendMessage(chatId, "Session expired. Use /start to begin again.");
      return;
    }

    await telegram.sendChatAction(chatId, "typing");
    await telegram.sendMessage(chatId, "⚙️ Generating your AGENTS.md file...");

    try {
      const content = generateAgentsMd(session.data);
      const filename = `AGENTS.md`;

      // Send as downloadable document
      await telegram.sendDocument(
        chatId,
        filename,
        content,
        `✅ Your *AGENTS.md* is ready!\n\nPlace this file at the root of your repository. Agents will automatically discover and read it.\n\n_Generated with [AgentsMD Bot](https://agents.md/)_`
      );

      // Also send as code block for easy copy-paste
      if (content.length < 3500) {
        await telegram.sendMessage(
          chatId,
          `\`\`\`markdown\n${content}\n\`\`\``,
          { parse_mode: "Markdown" }
        );
      }

      await telegram.sendMessage(
        chatId,
        `🎉 *Done!* Your AGENTS.md has been generated.\n\n*Next steps:*\n• Place it at the root of your repo\n• For monorepos, add sub-project AGENTS.md files too\n• Update it as your project evolves\n• Keep it under 150 lines for best agent performance\n\n_Use /start to generate another one!_`,
        { parse_mode: "Markdown" }
      );

      await sessions.update(chatId, { step: "done" });
    } catch (err) {
      console.error("Generation error:", err);
      await telegram.sendMessage(
        chatId,
        "❌ An error occurred during generation. Please try again with /start."
      );
    }
  }

  if (data === "restart") {
    await sessions.delete(chatId);
    await telegram.sendMessage(chatId, "🔄 Session reset. Use /start to begin again.");
  }

  if (data === "skip") {
    // Re-route as a skip message
    const fakeMessage = {
      message_id: 0,
      chat: { id: chatId, type: "private" as const },
      text: "skip",
      date: Date.now(),
      from: callbackQuery.from,
    };
    await handleMessage(fakeMessage, telegram, sessions, env);
  }
}

// ── Keyboard Builder ──────────────────────────────────────────

function buildStepKeyboard(step: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | null {
  const config = STEP_FLOW[step as keyof typeof STEP_FLOW];
  if (!config || !config.skipLabel) return null;

  return {
    inline_keyboard: [
      [{ text: `⏭ ${config.skipLabel}`, callback_data: "skip" }],
    ],
  };
}

// ── Webhook Setup ─────────────────────────────────────────────

async function setupWebhook(request: Request, env: Env): Promise<Response> {
  const workerUrl = new URL(request.url);
  const webhookUrl = `${workerUrl.origin}/webhook`;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    }
  );

  const result = await response.json();
  return new Response(
    JSON.stringify({ webhookUrl, telegramResponse: result }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}
