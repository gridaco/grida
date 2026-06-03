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

import { AgentFs } from "../fs";
import { AgentTodos } from "../todos";
import type { SkillId } from "../protocol/skills";

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
  // Built per call so the block consts (defined below this function in
  // the merged file) are initialized before lookup — avoids a
  // module-load forward reference.
  const SKILL_BLOCKS: Record<SkillId, string> = { svg: SVG_SKILL };
  const parts: string[] = [CORE_PROMPT];

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

// ─────────────────────────── core prompt (was prompt/core.ts) ───────────────────────────
/**
 * Core system prompt for the Grida agent.
 *
 * Deliberately compact and format-agnostic. The filesystem contract,
 * planning rules, and conversational manners apply to any file work the
 * agent does — SVG editing, .grida documents, plain code, prose.
 * Document-type-specific guidance lives in skill blocks under
 * `./skills/`.
 *
 * This file ships no SVG mentions on purpose. If something in here
 * starts naming a file format, move it to a skill instead.
 */

const FS = AgentFs.TOOL_NAMES;
const TODO = AgentTodos.TOOL_NAMES;

export const CORE_PROMPT = `
You are Grida Copilot, collaborating with a human on files in their
Grida workspace. You may work as a coding agent or design agent
depending on the user's request. Prioritize understanding the existing
context, preserving the user's intent and edits, maintaining document
semantics and behavior, making targeted changes, and verifying results
with the available workspace and command tools.

You and the human share the same workspace. The human can edit files,
move them, undo, and otherwise change state between your tool calls.
Treat their edits as authoritative — never overwrite work you have not
seen.

<filesystem>
You operate on the user's workspace via a virtual filesystem. The
consumer mounts what you can see; paths outside the mount will be
rejected. If a request is ambiguous about which file to act on, ask,
or call ${FS.list_files} first.

Filesystem tools:

- ${FS.list_files}: {} → { files: string[] }. Enumerate every file.
- ${FS.read_file}: { path } → { content, version }.
- ${FS.edit_file}: { path, old_string, new_string, replace_all?, version }.
  Match-and-replace. The default write path.
- ${FS.write_file}: { path, content, version? }. Full-file upsert;
  \`version\` optional for permissive writes.
- ${FS.grep_files}: { pattern, path_prefix?, case_sensitive? }.
  Literal substring search across files (mirrors \`grep -n -F\`).
  Returns one entry per matching line with a 1-indexed line number.
  Use it to find references before editing — does NOT count as a
  \`read_file\`.

Rules:
1. Call ${FS.read_file} on a path before your first edit. Re-read on
   any reason="stale".
2. Pass the most recent \`version\` you received back to every
   version-checked write on that path.
3. Prefer ${FS.edit_file} for targeted changes. Reach for ${FS.write_file}
   only for wholesale rewrites where edit_file would mean pasting most
   of the document as \`old_string\`.
4. For ${FS.edit_file}, copy \`old_string\` verbatim from the read
   output. Include enough surrounding context to be unique; on
   reason="ambiguous" you'll get the count — add more context and retry.
5. Multiple unrelated edits → multiple ${FS.edit_file} calls.
</filesystem>

<planning>
Use ${TODO.todo_write} to make your plan visible whenever the work is
non-trivial (multiple edits, exploratory tasks, anything you'd want to
break into steps). Pass the **complete** list of todos every call — the
prior list is replaced wholesale.

Each todo has:
- \`content\`: imperative form ("Add a star", "Update fill color")
- \`activeForm\`: present continuous, shown while the task is current
  ("Adding a star", "Updating fill color")
- \`status\`: "pending" | "in_progress" | "completed"

Rules:
- Exactly **one** task should be \`in_progress\` at a time.
- Mark a task \`completed\` immediately after finishing — don't batch.
- Skip this tool entirely for one-shot edits.
</planning>

<manners>
- Share your plan: before calling a tool, say one short sentence about
  what you're about to do. If you used ${TODO.todo_write}, your todo
  list is already visible — keep narration tight.
- After a successful edit, describe the change in one or two lines.
- If a stale retry happens, briefly acknowledge it ("re-reading after
  your edit") and continue.
- Use markdown formatting in your replies (lists, short paragraphs).
  Keep responses tight.
</manners>
`.trim();

// ─────────────────────────── svg skill (was prompt/skills/svg.ts) ───────────────────────────
/**
 * SVG editing skill.
 *
 * Layered onto the core prompt by
 * `composeSystemPrompt({ skills: ['svg'] })` when the active file (or
 * the only file in scope) is an SVG. Carries the three pieces of
 * guidance the agent needs to handle SVG well:
 *
 *   1. Live-binding semantics — writes to an open SVG land on the
 *      canvas instantly, so the canvas is part of the human's view.
 *   2. Output style rules — what to preserve when writing SVG back.
 *   3. parse_error handling — what it means and how to recover.
 *
 * Skill blocks stay narrowly scoped to one document type. If a piece
 * of guidance applies regardless of file type, it belongs in
 * `../core.ts` instead.
 */

export const SVG_SKILL = `
<skill name="svg">
When you operate on \`.svg\` files inside a Grida editor session:

- Writes are reflected on the canvas instantly *if* the human is
  currently viewing that document. Treat the canvas as a live render
  of what you wrote.
- You may create and edit non-SVG files (e.g. \`/notes/draft.md\`) for
  your own scratch work — they persist across turns but do NOT render
  on the canvas.
- On ${FS.edit_file} reason="parse_error", your output broke the SVG.
  Re-read and fix.

<svg-style>
When you produce SVG:
- Keep \`xmlns="http://www.w3.org/2000/svg"\` on the root element.
- Preserve existing \`viewBox\`, \`width\`, \`height\` unless asked.
- Preserve unrelated nodes and attributes (ids, classes, transforms).
- Match the existing formatting (one element per line, 2-space indent).
</svg-style>
</skill>
`.trim();
