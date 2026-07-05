/**
 * Compose a system prompt from the core block, an advertised skill index,
 * caller-supplied eager skill blocks, and capability hints.
 *
 * Built-in skills are discovered from disk (repo-root `skills/`) and
 * advertise-then-load via the `skill` tool — their descriptions ride in
 * `skill_index`, their bodies load on demand. `skill_blocks` is the narrow
 * escape hatch for a host with NO discovery (the web SVG editor: no workspace,
 * no bundled dir) that must eager-inject one unconditionally-relevant block.
 * Capabilities are free-form runtime hints.
 *
 * The caller still owns its turn-level context; this helper produces a
 * static-per-session string. Per-turn context goes into the message stream.
 */

import { prompts } from "../prompts";
import { AgentFs } from "../fs";
import { AgentTodos } from "../todos";

export type ComposeSystemPromptOptions = {
  /**
   * Project instructions — concatenated AGENTS.md / CLAUDE.md / CONTEXT.md
   * (RFC `skills / project instructions`). Injected eagerly, right after
   * the manifest prompt and before the skill index.
   */
  project_instructions?: string;
  /**
   * Pre-rendered skill index block (names + one-line descriptions) from
   * `renderSkillIndex` (RFC `skills`). Only the descriptions live here;
   * bodies load on demand via the `skill` tool.
   */
  skill_index?: string;
  /**
   * Raw, pre-rendered skill blocks layered eagerly onto the core — for a host
   * with no discovery layer (the web SVG editor). Prefer `skill_index` +
   * on-demand load everywhere a bundled dir / workspace exists.
   */
  skill_blocks?: readonly string[];
  /** Free-form capability / environment hints. Appended last (before the
   * tool catalog the SDK assembles). Caller-owned content. */
  capabilities?: readonly string[];
};

/**
 * Assemble the system prompt in the RFC's normative order
 * (`session / system prompt assembly`): manifest → project instructions
 * → skill index → eager skill blocks → environment/capability hints.
 * The tool catalog (§5) is appended by the AI SDK from the registered
 * tools, not here.
 */
export function composeSystemPrompt(opts: ComposeSystemPromptOptions): string {
  const parts: string[] = [
    prompts.agent_core(AgentFs.TOOL_NAMES, AgentTodos.TOOL_NAMES),
  ];

  if (
    opts.project_instructions &&
    opts.project_instructions.trim().length > 0
  ) {
    parts.push(
      `<project_instructions>\n${opts.project_instructions.trim()}\n</project_instructions>`
    );
  }

  if (opts.skill_index && opts.skill_index.trim().length > 0) {
    parts.push(opts.skill_index.trim());
  }

  for (const block of opts.skill_blocks ?? []) {
    if (block.trim().length > 0) parts.push(block.trim());
  }

  for (const cap of opts.capabilities ?? []) {
    if (cap.trim().length > 0) parts.push(cap);
  }

  return parts.join("\n\n");
}
