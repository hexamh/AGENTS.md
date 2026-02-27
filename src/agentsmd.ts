// ============================================================
// src/agentsmd.ts — AGENTS.md document generator
// ============================================================

import { ProjectData } from "./session";

/**
 * Generates a professional, structured AGENTS.md file from collected
 * project data, following best practices from the open standard:
 * - Commands before prose
 * - Concrete examples over explanations
 * - Explicit boundaries and permissions
 * - Persona + operational manual structure
 */
export function generateAgentsMd(data: ProjectData): string {
  const sections: string[] = [];

  // ── Header ────────────────────────────────────────────────
  sections.push(buildHeader(data));

  // ── Project Overview ─────────────────────────────────────
  if (data.description) {
    sections.push(buildOverview(data));
  }

  // ── Tech Stack ────────────────────────────────────────────
  if (data.techStack) {
    sections.push(buildTechStack(data));
  }

  // ── Commands (Critical — always first) ───────────────────
  if (hasAnyCommands(data)) {
    sections.push(buildCommands(data));
  }

  // ── Architecture ──────────────────────────────────────────
  if (data.architecture) {
    sections.push(buildArchitecture(data));
  }

  // ── Conventions & Code Style ──────────────────────────────
  if (data.conventions) {
    sections.push(buildConventions(data));
  }

  // ── Git Workflow ──────────────────────────────────────────
  if (data.gitWorkflow) {
    sections.push(buildGitWorkflow(data));
  }

  // ── External Services ─────────────────────────────────────
  if (data.externalServices) {
    sections.push(buildExternalServices(data));
  }

  // ── Security ──────────────────────────────────────────────
  if (data.securityNotes) {
    sections.push(buildSecurity(data));
  }

  // ── Agent Boundaries ──────────────────────────────────────
  if (data.agentBoundaries) {
    sections.push(buildBoundaries(data));
  }

  // ── MCP Server Configuration ──────────────────────────────
  if (data.mcpServers) {
    sections.push(buildMcpServers(data));
  }

  // ── Custom Sections ───────────────────────────────────────
  if (data.customSections && data.customSections.toLowerCase() !== "none" &&
      data.customSections.toLowerCase() !== "skip") {
    sections.push(buildCustomSections(data));
  }

  // ── Footer ────────────────────────────────────────────────
  sections.push(buildFooter());

  return sections.join("\n\n---\n\n");
}

// ── Section Builders ──────────────────────────────────────────

function buildHeader(data: ProjectData): string {
  const name = data.projectName || "Project";
  const pm = data.packageManager || "npm";
  return `# ${name} — AGENTS.md

> **This file is your briefing packet.** Read it entirely before planning any task.
> It takes precedence over generic best-practices when they conflict.

**Package manager:** \`${pm}\` — never use a different one without explicit approval.`;
}

function buildOverview(data: ProjectData): string {
  return `## Project Overview

${data.description}`;
}

function buildTechStack(data: ProjectData): string {
  const stack = data.techStack!
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = stack.map((s) => `- ${s}`).join("\n");
  return `## Tech Stack

${items}`;
}

function hasAnyCommands(data: ProjectData): boolean {
  return !!(data.buildCommands || data.testCommands || data.lintCommands || data.devCommands);
}

function buildCommands(data: ProjectData): string {
  const pm = data.packageManager || "npm";
  const run = pm === "npm" ? "npm run" : pm === "yarn" ? "yarn" : pm;
  const lines: string[] = [`## Commands\n`];

  if (data.devCommands) {
    lines.push(`### Run Locally\n\`\`\`bash\n${normalizeCommands(data.devCommands, run)}\n\`\`\``);
  }

  if (data.buildCommands) {
    lines.push(`### Build\n\`\`\`bash\n${normalizeCommands(data.buildCommands, run)}\n\`\`\``);
  }

  if (data.testCommands) {
    lines.push(`### Test\n\`\`\`bash\n# Run all tests\n${normalizeCommands(data.testCommands, run)}\n\n# Run a single test file\n${normalizeCommands(data.testCommands, run)} path/to/file.test\n\`\`\`\n\n> ✅ Always run the full test suite before committing.`);
  }

  if (data.lintCommands) {
    lines.push(`### Lint & Format\n\`\`\`bash\n${normalizeCommands(data.lintCommands, run)}\n\`\`\``);
  }

  return lines.join("\n\n");
}

function normalizeCommands(raw: string, _run: string): string {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function buildArchitecture(data: ProjectData): string {
  return `## Architecture Overview

${data.architecture}

> 🔍 **For agents:** understand capabilities and module boundaries before making changes. Let the directory tree guide discovery; don't rely on file paths listed here as they may have moved.`;
}

function buildConventions(data: ProjectData): string {
  return `## Conventions & Code Style

${data.conventions}`;
}

function buildGitWorkflow(data: ProjectData): string {
  return `## Git Workflow

${data.gitWorkflow}`;
}

function buildExternalServices(data: ProjectData): string {
  const services = data.externalServices!;
  return `## External Services & Environment

${services}

> 🔒 **Never hardcode secrets.** Use environment variables or the project's secrets manager. Never commit \`.env\` files.`;
}

function buildSecurity(data: ProjectData): string {
  return `## Security & Sensitive Areas

${data.securityNotes}

> ⛔ If you are unsure whether an action touches a sensitive area, **stop and ask first**.`;
}

function buildBoundaries(data: ProjectData): string {
  // Parse and nicely format boundaries
  const raw = data.agentBoundaries!;

  // Try to detect if user gave structured do/don't list
  const hasDoSection = /\bdo\b|allowed|can|always/i.test(raw);
  const hasDontSection = /\bdon't\b|never|avoid|ask first|forbidden/i.test(raw);

  if (hasDoSection || hasDontSection) {
    return `## Agent Boundaries & Permissions

${raw}`;
  }

  // Default structured format
  return `## Agent Boundaries & Permissions

${raw}

### Quick Reference

| Category | Rule |
|----------|------|
| ✅ Allowed freely | Read files, run lint/typecheck, run tests |
| ⚠️ Ask first | Install new packages, delete files, push to remote |
| ⛔ Never | Modify secrets/config, push to main/master directly |`;
}

function buildMcpServers(data: ProjectData): string {
  return `## MCP Server Configuration

${data.mcpServers}

> These are the tools available to you in the agent runtime. Use them when needed. Do not attempt to call services outside this list without explicit approval.`;
}

function buildCustomSections(data: ProjectData): string {
  return `## Additional Notes

${data.customSections}`;
}

function buildFooter(): string {
  const date = new Date().toISOString().split("T")[0];
  return `---

*Generated by [AgentsMD Bot](https://t.me/agentsmdbot) on ${date}.*
*Based on the [AGENTS.md open standard](https://agents.md/).*
*Keep this file ≤ 150 lines. Long files slow agents and bury signal.*`;
}
