/**
 * Compose a system prompt from the core block, selected skills, and
 * caller-supplied capability hints.
 *
 * Skills are a closed enum. Capabilities are free-form strings so the
 * caller can describe its runtime — "run_command available, workdir is
 * /foo", "active file is /logo.svg", workspace summary — without
 * forcing every variation through a registered skill.
 *
 * The caller still owns its turn-level context; this helper produces
 * a static-per-session string. Per-turn context (current tab, recent
 * edits) goes into the message stream, not here.
 */

import type { SkillId } from "../protocol/skills";
import { prompts } from "../prompts";
import { AgentFs } from "../fs";
import { AgentTodos } from "../todos";

export type ComposeSystemPromptOptions = {
  /** Built-in prompt blocks (e.g. `'svg'`) layered eagerly onto the core. */
  skills?: readonly SkillId[];
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
  /** Free-form capability / environment hints. Appended last (before the
   * tool catalog the SDK assembles). Caller-owned content. */
  capabilities?: readonly string[];
};

/**
 * Assemble the system prompt in the RFC's normative order
 * (`session / system prompt assembly`): manifest → project instructions
 * → skill index → built-in skill blocks → environment/capability hints.
 * The tool catalog (§5) is appended by the AI SDK from the registered
 * tools, not here.
 */
export function composeSystemPrompt(opts: ComposeSystemPromptOptions): string {
  // Prompt text comes from the central registry (`../prompts`); this module
  // owns the assembly order and injects the tool-name vocab into the builders.
  const SKILL_BLOCKS: Record<SkillId, string> = {
    svg: prompts.agent_svg_skill(AgentFs.TOOL_NAMES),
  };
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

  for (const id of opts.skills ?? []) {
    const block = SKILL_BLOCKS[id];
    if (!block) {
      // Closed enum — typed callers can't hit this, but JS callers
      // could. Fail loudly so the consumer fixes the id rather than
      // silently shipping a prompt missing the skill they intended.
      throw new Error(`Unknown agent skill id: ${String(id)}`);
    }
    parts.push(block);
  }

  for (const cap of opts.capabilities ?? []) {
    if (cap.trim().length > 0) parts.push(cap);
  }

  return parts.join("\n\n");
}
