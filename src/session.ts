// ============================================================
// src/session.ts — Session state management via Cloudflare KV
// ============================================================

export type AgentStep =
  | "idle"
  | "ask_project_name"
  | "ask_description"
  | "ask_tech_stack"
  | "ask_package_manager"
  | "ask_build_commands"
  | "ask_test_commands"
  | "ask_lint_commands"
  | "ask_dev_commands"
  | "ask_architecture"
  | "ask_conventions"
  | "ask_git_workflow"
  | "ask_external_services"
  | "ask_security_notes"
  | "ask_agent_boundaries"
  | "ask_mcp_servers"
  | "ask_custom_sections"
  | "confirm_generate"
  | "done";

export interface ProjectData {
  projectName?: string;
  description?: string;
  techStack?: string;
  packageManager?: string;
  buildCommands?: string;
  testCommands?: string;
  lintCommands?: string;
  devCommands?: string;
  architecture?: string;
  conventions?: string;
  gitWorkflow?: string;
  externalServices?: string;
  securityNotes?: string;
  agentBoundaries?: string;
  mcpServers?: string;
  customSections?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionState {
  chatId: number;
  step: AgentStep;
  data: ProjectData;
  conversationHistory: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// ── Session Manager ───────────────────────────────────────────

export class SessionManager {
  private kv: KVNamespace;
  private TTL_SECONDS = 60 * 60 * 6; // 6 hours

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async get(chatId: number): Promise<SessionState | null> {
    const raw = await this.kv.get(`session:${chatId}`, "json");
    return raw as SessionState | null;
  }

  async set(session: SessionState): Promise<void> {
    session.updatedAt = Date.now();
    await this.kv.put(`session:${chatId(session)}`, JSON.stringify(session), {
      expirationTtl: this.TTL_SECONDS,
    });
  }

  async create(chatId: number): Promise<SessionState> {
    const session: SessionState = {
      chatId,
      step: "ask_project_name",
      data: {},
      conversationHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };
    await this.kv.put(`session:${chatId}`, JSON.stringify(session), {
      expirationTtl: this.TTL_SECONDS,
    });
    return session;
  }

  async delete(chatId: number): Promise<void> {
    await this.kv.delete(`session:${chatId}`);
  }

  async update(chatId: number, updates: Partial<SessionState>): Promise<SessionState> {
    const session = await this.get(chatId);
    if (!session) throw new Error("Session not found");
    const updated = { ...session, ...updates, updatedAt: Date.now() };
    await this.kv.put(`session:${chatId}`, JSON.stringify(updated), {
      expirationTtl: this.TTL_SECONDS,
    });
    return updated;
  }
}

function chatId(session: SessionState): number {
  return session.chatId;
}
