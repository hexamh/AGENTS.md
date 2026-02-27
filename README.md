# AgentsMD Bot 🤖

> A professional, AI-powered Telegram bot that interviews developers and generates production-ready `AGENTS.md` files for their projects — deployed on Cloudflare Workers at the edge.

---

## What is AGENTS.md?

`AGENTS.md` is an **open standard** (adopted by 20,000+ GitHub repos) that acts as a "README for AI coding agents." It gives assistants like OpenAI Codex, GitHub Copilot, Cursor, Claude Code, and Aider the context they need to work effectively in your codebase without re-exploring it every session.

Unlike `.cursorrules` or `CLAUDE.md`, `AGENTS.md` is **vendor-neutral** and supported across the entire AI coding ecosystem.

---

## Architecture

```
Telegram User
    │
    ▼ (HTTPS webhook)
Cloudflare Worker (src/index.ts)
    │
    ├─── Session State ──────► Cloudflare KV
    │
    ├─── AI Engine ─────────► Anthropic Claude API
    │                         (acknowledgments + context)
    │
    └─── Generator ─────────► AGENTS.md (sent as document)
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers (V8 isolates) |
| State | Cloudflare KV (6-hour TTL sessions) |
| AI Engine | Anthropic Claude Sonnet 4 |
| Messaging | Telegram Bot API (webhook mode) |
| Language | TypeScript (strict mode) |

---

## Agent Conversation Flow

The bot conducts a structured interview across **15 steps**:

```
/start
  │
  ├── 1. Project Name
  ├── 2. Project Description          ← agent persona/role
  ├── 3. Tech Stack
  ├── 4. Package Manager
  ├── 5. Build Commands               ← critical for CI
  ├── 6. Test Commands                ← run before every commit
  ├── 7. Lint / Format Commands
  ├── 8. Dev / Local Run Commands
  ├── 9. Architecture Overview        ← capability-based, not path-based
  ├── 10. Code Conventions
  ├── 11. Git Workflow
  ├── 12. External Services & Env Vars
  ├── 13. Security Sensitive Areas
  ├── 14. Agent Boundaries & Permissions
  ├── 15. MCP Server Configuration
  └── 16. Custom Notes / Gotchas
        │
        └── Summary Review → [Generate] → AGENTS.md delivered as file
```

Claude AI powers:
- **Warm acknowledgments** between each question
- **Follow-up clarification** when answers are ambiguous
- **Context preservation** across the session

---

## Quick Start

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- [Telegram bot token](https://core.telegram.org/bots/tutorial) from `@BotFather`
- [Anthropic API key](https://console.anthropic.com/)

### 1. Clone & Install

```bash
git clone https://github.com/yourorg/agents-md-bot
cd agents-md-bot
npm install
```

### 2. Create KV Namespace

```bash
# Production namespace
wrangler kv namespace create SESSIONS

# Preview namespace (for local dev)
wrangler kv namespace create SESSIONS --preview
```

Copy the IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_PRODUCTION_KV_ID"
preview_id = "YOUR_PREVIEW_KV_ID"
```

### 3. Set Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your bot token from @BotFather

wrangler secret put ANTHROPIC_API_KEY
# Paste your Claude API key

wrangler secret put WEBHOOK_SECRET
# Paste any random string, e.g.: openssl rand -hex 32
```

### 4. Deploy

```bash
npm run deploy
# Output: https://agents-md-bot.YOUR-SUBDOMAIN.workers.dev
```

### 5. Register Webhook

Visit in your browser (once):
```
https://agents-md-bot.YOUR-SUBDOMAIN.workers.dev/setup
```

You should see: `{ "ok": true, "description": "Webhook was set" }`

### 6. Test

Open Telegram, find your bot, send `/start`.

---

## Local Development

```bash
# Start local dev server (uses preview KV)
npm run dev

# In another terminal, use ngrok or cloudflared tunnel for webhook:
cloudflared tunnel --url http://localhost:8787

# Register the tunnel URL as webhook:
curl "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
  -d "url=https://YOUR-TUNNEL.trycloudflare.com/webhook"
```

---

## Generated AGENTS.md Structure

The bot generates files following the [AGENTS.md best practices](https://agents.md/):

```markdown
# Project Name — AGENTS.md

> Read this entirely before planning any task.

**Package manager:** `pnpm`

## Project Overview
[1-3 sentence description that anchors agent context]

## Tech Stack
- Node.js 22, TypeScript, Fastify
- Prisma + PostgreSQL
- Redis for caching

## Commands

### Run Locally
\`\`\`bash
pnpm dev
\`\`\`

### Build
\`\`\`bash
pnpm build
\`\`\`

### Test
\`\`\`bash
pnpm test
pnpm test path/to/file.test.ts
\`\`\`

### Lint & Format
\`\`\`bash
pnpm lint && pnpm format
\`\`\`

## Architecture Overview
[Capability-based description, not file paths]

## Conventions & Code Style
[Naming, patterns, do/don't rules]

## Git Workflow
[Branching, commit format, PR requirements]

## External Services & Environment
[APIs, env vars, no secrets]

## Security & Sensitive Areas
[Auth flows, sensitive files, PII concerns]

## Agent Boundaries & Permissions
| Category | Rule |
|----------|------|
| ✅ Allowed freely | Read files, lint, test |
| ⚠️ Ask first | Package installs, file deletion |
| ⛔ Never | Push to main, commit secrets |

## MCP Server Configuration
[Available MCP servers and their capabilities]
```

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin a new AGENTS.md interview |
| `/preview` | Preview data collected so far |
| `/cancel` | Cancel current session |
| `/help` | Show help |

---

## Design Decisions

### Why Cloudflare Workers?
- **Zero cold starts** — V8 isolates spin up in < 1ms
- **Global edge** — runs in 300+ cities closest to users
- **KV built-in** — no external database needed for sessions
- **Free tier** — 100,000 requests/day

### Why Claude for Acknowledgments?
The conversational quality of acknowledgments significantly affects completion rates. Claude's warm, context-aware responses keep users engaged through all 15 questions compared to static canned responses.

### Session TTL
6-hour TTL on KV sessions balances server costs with realistic user session length. Users can resume a session within 6 hours of starting.

### Why Webhook vs. Long-Polling?
Webhooks are required for Cloudflare Workers (no persistent connections). Each webhook call is a fresh Worker invocation — stateless by design, with all state in KV.

---

## Project Structure

```
agents-md-bot/
├── src/
│   ├── index.ts       # Worker entry point + webhook routing
│   ├── agent.ts       # Claude-powered conversation engine
│   ├── agentsmd.ts    # AGENTS.md document generator
│   ├── session.ts     # KV-backed session management
│   └── telegram.ts    # Telegram Bot API client
├── wrangler.toml      # Cloudflare Workers configuration
├── tsconfig.json      # TypeScript configuration
├── package.json
└── README.md
```

---

## License

MIT

---

*Built with ❤️ using Cloudflare Workers + Anthropic Claude*
*Following the [AGENTS.md open standard](https://agents.md/)*
