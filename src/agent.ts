// ============================================================
// src/agent.ts — Conversational AI agent engine (Claude-powered)
// ============================================================

import { SessionState, AgentStep, ConversationMessage, ProjectData } from "./session";

// ── Step Configuration ────────────────────────────────────────

interface StepConfig {
  field: keyof ProjectData | null;
  nextStep: AgentStep;
  question: string;
  exampleHint?: string;
  skipLabel?: string; // label for skip button
}

export const STEP_FLOW: Record<AgentStep, StepConfig | null> = {
  idle: null,
  ask_project_name: {
    field: "projectName",
    nextStep: "ask_description",
    question: "🚀 *What's the name of your project?*",
    exampleHint: "e.g. `my-saas-app`, `payment-service`, `design-system`",
  },
  ask_description: {
    field: "description",
    nextStep: "ask_tech_stack",
    question: "📝 *Describe your project in 1–3 sentences.*\n\nThis acts as the agent's role-based prompt — make it precise.",
    exampleHint: "e.g. _A GraphQL API for a multi-tenant SaaS billing platform. Uses Stripe for payments and PostgreSQL for storage._",
  },
  ask_tech_stack: {
    field: "techStack",
    nextStep: "ask_package_manager",
    question: "🛠 *What's your tech stack?*\n\nList frameworks, languages, and major libraries.",
    exampleHint: "e.g. `Node.js 22, TypeScript, Fastify, Prisma, PostgreSQL, Redis`",
  },
  ask_package_manager: {
    field: "packageManager",
    nextStep: "ask_build_commands",
    question: "📦 *Which package manager does this project use?*",
    exampleHint: "npm / yarn / pnpm / bun / pip / cargo / go / other",
  },
  ask_build_commands: {
    field: "buildCommands",
    nextStep: "ask_test_commands",
    question: "🔨 *What are your build commands?*",
    exampleHint: "e.g. `npm run build` or `tsc && esbuild src/index.ts`",
    skipLabel: "Skip",
  },
  ask_test_commands: {
    field: "testCommands",
    nextStep: "ask_lint_commands",
    question: "🧪 *What are your test commands?*\n\nInclude flags for focused/verbose runs if applicable.",
    exampleHint: "e.g. `npm test` or `vitest run` or `pytest -v`",
    skipLabel: "Skip",
  },
  ask_lint_commands: {
    field: "lintCommands",
    nextStep: "ask_dev_commands",
    question: "🔍 *What are your lint/format commands?*",
    exampleHint: "e.g. `npm run lint && npm run format` or `eslint src/ && prettier --check .`",
    skipLabel: "Skip",
  },
  ask_dev_commands: {
    field: "devCommands",
    nextStep: "ask_architecture",
    question: "💻 *How do you run the project locally?*",
    exampleHint: "e.g. `npm run dev` or `docker-compose up && npm start`",
    skipLabel: "Skip",
  },
  ask_architecture: {
    field: "architecture",
    nextStep: "ask_conventions",
    question: "🏗 *Describe your project architecture.*\n\nDescribe major modules/layers. Avoid listing specific file paths — describe *capabilities* instead.",
    exampleHint: "e.g. _API layer (Fastify routes) → Service layer (business logic) → Repository layer (Prisma). React frontend in `/web` using SWR for data fetching._",
    skipLabel: "Skip",
  },
  ask_conventions: {
    field: "conventions",
    nextStep: "ask_git_workflow",
    question: "📐 *What are your code conventions?*\n\nThink naming, folder structure, import style, patterns to always/never use.",
    exampleHint: "e.g. _Use camelCase for variables, PascalCase for types. Co-locate tests with source files. Prefer functional components. Never use `any`._",
    skipLabel: "Skip",
  },
  ask_git_workflow: {
    field: "gitWorkflow",
    nextStep: "ask_external_services",
    question: "🌿 *Describe your Git workflow.*\n\nBranching strategy, commit message format, PR requirements.",
    exampleHint: "e.g. _Use `feat/`, `fix/`, `chore/` branch prefixes. Commits follow Conventional Commits. PRs require 1 approval and passing CI._",
    skipLabel: "Skip",
  },
  ask_external_services: {
    field: "externalServices",
    nextStep: "ask_security_notes",
    question: "🌐 *What external services does this project use?*\n\nList APIs, databases, queues, object storage, etc. with the env vars agents can expect.",
    exampleHint: "e.g. _Stripe (`STRIPE_SECRET_KEY`), S3 (`AWS_BUCKET_NAME`), SendGrid (`SENDGRID_API_KEY`)_",
    skipLabel: "Skip",
  },
  ask_security_notes: {
    field: "securityNotes",
    nextStep: "ask_agent_boundaries",
    question: "🔒 *Are there security-sensitive areas agents should know about?*\n\nAuth flows, sensitive files, protected routes, anything that requires extra care.",
    exampleHint: "e.g. _The `src/auth/` module handles JWT signing — never change the algorithm. Never log request bodies that may contain PII._",
    skipLabel: "Skip",
  },
  ask_agent_boundaries: {
    field: "agentBoundaries",
    nextStep: "ask_mcp_servers",
    question: "🚧 *What are the agent's permissions and boundaries?*\n\nWhat can agents do freely? What requires confirmation? What's forbidden?",
    exampleHint: "e.g. _Can freely run tests and lint. Must ask before installing packages or deleting files. Never push to `main` directly._",
    skipLabel: "Skip",
  },
  ask_mcp_servers: {
    field: "mcpServers",
    nextStep: "ask_custom_sections",
    question: "🔌 *Do you use any MCP servers the agent can connect to?*\n\nList MCP servers with their URLs/names and what they're used for.",
    exampleHint: "e.g. _GitHub MCP (`https://mcp.github.com`) for PR management. PostgreSQL MCP for direct DB queries during debugging._",
    skipLabel: "Skip (no MCP)",
  },
  ask_custom_sections: {
    field: "customSections",
    nextStep: "confirm_generate",
    question: "✨ *Any additional notes, gotchas, or custom sections?*\n\nThis is your catch-all: known bugs, upcoming migrations, weird edge cases agents should know about.",
    exampleHint: "e.g. _Test snapshots use absolute paths — run `npm run test -- --updateSnapshot` after refactors._",
    skipLabel: "Skip",
  },
  confirm_generate: {
    field: null,
    nextStep: "done",
    question: "✅ *All data collected! Ready to generate your AGENTS.md?*\n\nReview the summary above and confirm.",
    skipLabel: undefined,
  },
  done: null,
};

// ── Prompt Builder ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are AgentsMD — a friendly, professional assistant that helps developers create AGENTS.md files.

Your job is to guide users through a structured interview to gather information about their software project.
You then generate a high-quality AGENTS.md file following the open standard at https://agents.md/.

Key principles:
- Be concise and professional, but warm
- Ask one focused question at a time
- Acknowledge the user's answer before moving to the next question
- If an answer seems incomplete or unclear, ask a follow-up
- Never generate the AGENTS.md yourself — the system handles generation
- Keep responses brief (2-4 sentences max per acknowledgment)
- Use emojis sparingly for visual clarity
- When acknowledging answers, extract the key insight and confirm it`;

export interface AgentResponse {
  message: string;
  nextStep: AgentStep;
  updatedData: ProjectData;
  isComplete: boolean;
  showSummary: boolean;
}

// ── Claude API Call ───────────────────────────────────────────

async function callClaude(
  apiKey: string,
  conversationHistory: ConversationMessage[],
  userMessage: string
): Promise<string> {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Claude API error:", error);
    throw new Error("Failed to get AI response");
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
}

// ── Agent Step Handler ────────────────────────────────────────

export async function handleAgentStep(
  session: SessionState,
  userInput: string,
  apiKey: string
): Promise<AgentResponse> {
  const currentStep = session.step;
  const stepConfig = STEP_FLOW[currentStep];

  if (!stepConfig) {
    return {
      message: "Session complete. Use /start to generate a new AGENTS.md.",
      nextStep: "done",
      updatedData: session.data,
      isComplete: true,
      showSummary: false,
    };
  }

  // Save user input to the appropriate data field
  const updatedData = { ...session.data };
  if (stepConfig.field && userInput.toLowerCase() !== "skip") {
    (updatedData as Record<string, string>)[stepConfig.field] = userInput;
  }

  // Get AI acknowledgment using Claude
  let acknowledgment: string;
  try {
    const contextPrompt = buildContextPrompt(currentStep, userInput, updatedData);
    acknowledgment = await callClaude(
      apiKey,
      session.conversationHistory.slice(-6), // last 3 exchanges
      contextPrompt
    );
  } catch {
    // Graceful fallback if Claude fails
    acknowledgment = getDefaultAcknowledgment(currentStep, userInput);
  }

  const nextStep = stepConfig.nextStep;
  const isComplete = nextStep === "done";
  const showSummary = nextStep === "confirm_generate";

  // Build next question if not done
  let nextQuestion = "";
  if (!isComplete && nextStep !== "confirm_generate") {
    const nextConfig = STEP_FLOW[nextStep];
    if (nextConfig) {
      nextQuestion = `\n\n${nextConfig.question}`;
      if (nextConfig.exampleHint) {
        nextQuestion += `\n\n_${nextConfig.exampleHint}_`;
      }
    }
  } else if (nextStep === "confirm_generate") {
    nextQuestion = `\n\n${STEP_FLOW.confirm_generate!.question}`;
  }

  const fullMessage = acknowledgment + nextQuestion;

  return {
    message: fullMessage,
    nextStep,
    updatedData,
    isComplete,
    showSummary,
  };
}

// ── Prompt Helpers ────────────────────────────────────────────

function buildContextPrompt(
  step: AgentStep,
  userInput: string,
  data: ProjectData
): string {
  const projectName = data.projectName || "the project";

  const stepContextMap: Partial<Record<AgentStep, string>> = {
    ask_project_name: `The user just told you their project is named "${userInput}". Acknowledge this warmly and briefly (1 sentence). The next question will ask for a project description.`,
    ask_description: `The user described their project: "${userInput}". Briefly confirm you understand what ${projectName} does (1-2 sentences). The next question will ask about their tech stack.`,
    ask_tech_stack: `The user listed their tech stack for ${projectName}: "${userInput}". Acknowledge the stack concisely (1 sentence). The next question asks about their package manager.`,
    ask_package_manager: `The user said they use "${userInput}" as their package manager for ${projectName}. Confirm briefly (1 sentence). Next question: build commands.`,
    ask_build_commands: `The user provided build commands: "${userInput}". Confirm briefly (1 sentence). Next: test commands.`,
    ask_test_commands: `The user provided test commands: "${userInput}". Confirm briefly and note if important for CI (1-2 sentences). Next: lint commands.`,
    ask_lint_commands: `The user provided lint/format commands: "${userInput}". Brief acknowledgment (1 sentence). Next: dev/local run commands.`,
    ask_dev_commands: `The user provided local dev commands: "${userInput}". Brief acknowledgment. Next: architecture overview.`,
    ask_architecture: `The user described their architecture: "${userInput}". Acknowledge and highlight the key architectural pattern (1-2 sentences). Next: code conventions.`,
    ask_conventions: `The user described their conventions: "${userInput}". Brief acknowledgment (1 sentence). Next: git workflow.`,
    ask_git_workflow: `The user described their git workflow: "${userInput}". Brief confirmation (1 sentence). Next: external services.`,
    ask_external_services: `The user listed external services: "${userInput}". Note the key integrations briefly (1 sentence). Next: security notes.`,
    ask_security_notes: `The user described security considerations: "${userInput}". Acknowledge the sensitivity (1-2 sentences). Next: agent permissions/boundaries.`,
    ask_agent_boundaries: `The user described agent boundaries: "${userInput}". Confirm the permission structure briefly (1 sentence). Next: MCP servers.`,
    ask_mcp_servers: `The user described MCP servers: "${userInput}". Brief acknowledgment (1 sentence). Next: custom sections.`,
    ask_custom_sections: `The user added custom notes: "${userInput}". Briefly confirm you've captured it (1 sentence).`,
  };

  return (
    stepContextMap[step] ||
    `The user responded: "${userInput}". Provide a brief, professional acknowledgment (1-2 sentences).`
  );
}

function getDefaultAcknowledgment(step: AgentStep, input: string): string {
  if (input.toLowerCase() === "skip") {
    return "Got it, skipping that section.";
  }
  const defaultMap: Partial<Record<AgentStep, string>> = {
    ask_project_name: `Perfect, noted — **${input}**. `,
    ask_description: "Great description! That gives a clear picture of the project. ",
    ask_tech_stack: "Nice stack. ",
    ask_package_manager: `Noted — using **${input}**. `,
    ask_build_commands: "Build commands captured. ",
    ask_test_commands: "Test commands captured. ",
    ask_lint_commands: "Lint commands noted. ",
    ask_dev_commands: "Local dev setup noted. ",
    ask_architecture: "Architecture overview captured. ",
    ask_conventions: "Conventions recorded. ",
    ask_git_workflow: "Git workflow noted. ",
    ask_external_services: "External services and env vars captured. ",
    ask_security_notes: "Security notes recorded — these will be prominently highlighted. ",
    ask_agent_boundaries: "Permissions and boundaries noted. ",
    ask_mcp_servers: "MCP configuration captured. ",
    ask_custom_sections: "Additional notes captured. ",
  };
  return defaultMap[step] || "Got it. ";
}

// ── Project Summary Builder ───────────────────────────────────

export function buildProjectSummary(data: ProjectData): string {
  const lines: string[] = ["📋 *Project Summary*\n"];

  const addLine = (label: string, value: string | undefined) => {
    if (value) {
      const truncated = value.length > 80 ? value.substring(0, 77) + "..." : value;
      lines.push(`• *${label}:* ${truncated}`);
    }
  };

  addLine("Project", data.projectName);
  addLine("Description", data.description);
  addLine("Stack", data.techStack);
  addLine("Package Manager", data.packageManager);
  addLine("Build", data.buildCommands);
  addLine("Test", data.testCommands);
  addLine("Lint", data.lintCommands);
  addLine("Dev", data.devCommands);
  addLine("Architecture", data.architecture);
  addLine("Conventions", data.conventions);
  addLine("Git Workflow", data.gitWorkflow);
  addLine("External Services", data.externalServices);
  addLine("Security", data.securityNotes);
  addLine("Boundaries", data.agentBoundaries);
  addLine("MCP Servers", data.mcpServers);
  addLine("Custom Notes", data.customSections);

  return lines.join("\n");
}
