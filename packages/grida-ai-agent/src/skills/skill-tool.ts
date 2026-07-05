/**
 * The locked `skill` tool (RFC `foundations / locked fundamental tools`,
 * `skills / how the model reaches them`).
 *
 * The system prompt advertises every discovered skill by name +
 * one-line description; the body stays on disk until the model calls
 * `skill({ name })`. The body lands as a tool output wrapped in a stable
 * `<skill_content name="…">` marker so the model can tell it apart from
 * surrounding output.
 *
 * Body loads are cached per session: a second `skill(name)` returns the
 * first load (RFC `skills / hot-reload semantics`). The cache is owned by
 * the caller (keyed by session) and handed in, so re-creating the agent
 * each turn doesn't drop it.
 */

import { tool } from "ai";
import { z } from "zod";
import type { SkillBodyCache, SkillBodyLoader, SkillIndex } from "./types";

export const SKILL_TOOL_NAME = "skill" as const;
export type SkillToolName = typeof SKILL_TOOL_NAME;

export type { SkillBodyCache, SkillBodyLoader, SkillIndex } from "./types";

export type CreateSkillToolOptions = {
  index: SkillIndex;
  /** Caller-owned, per-session. Omit for a fresh (run-scoped) cache. */
  cache?: SkillBodyCache;
  /** Reads a skill's body. Injected so this stays client-safe; the
   * server passes `nodeSkillBodyLoader` from `./discovery`. */
  load_body: SkillBodyLoader;
};

/**
 * Wrap a loaded skill body in the canonical marker. Stable across
 * implementations so the persisted tool-output shape stays conformant.
 */
export function wrapSkillContent(name: string, body: string): string {
  return `<skill_content name="${name}">\n${body}\n</skill_content>`;
}

/**
 * Build the `skill` tool over a discovered index. Server-resolved: it
 * reads the body off disk by the pre-discovered absolute path, so the
 * model can only load a skill that was advertised — never an arbitrary
 * path.
 */
export function createSkillTool(opts: CreateSkillToolOptions) {
  const cache = opts.cache ?? new Map<string, string>();
  const names = opts.index.skills.map((s) => s.name);
  return tool({
    description:
      "Load a skill's full instructions by name. Skills are advertised " +
      "in your system prompt with a one-line description; call this when " +
      "one is relevant to load its body into the conversation. The body " +
      "stays in context for the rest of the session." +
      (names.length > 0 ? ` Available skills: ${names.join(", ")}.` : ""),
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe("The kebab-case skill name, exactly as advertised."),
    }),
    outputSchema: z.union([
      z.object({ content: z.string() }),
      z.object({
        ok: z.literal(false),
        code: z.string(),
        message: z.string(),
      }),
    ]),
    execute: async ({ name }) => {
      const cached = cache.get(name);
      if (cached !== undefined) return { content: cached };
      const skill = opts.index.by_name.get(name);
      if (!skill) {
        return {
          ok: false as const,
          code: "skill-not-found",
          message:
            `No skill named "${name}".` +
            (names.length > 0
              ? ` Available: ${names.join(", ")}.`
              : " No skills are available in this session."),
        };
      }
      let body: string;
      try {
        body = await opts.load_body(skill);
      } catch (err) {
        return {
          ok: false as const,
          code: "skill-read-failed",
          message: `Failed to read skill "${name}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
      const wrapped = wrapSkillContent(name, body);
      cache.set(name, wrapped);
      return { content: wrapped };
    },
  });
}

/**
 * Render the skill index block for the system prompt (RFC
 * `session / system prompt assembly` §3, `skills / how the model reaches
 * them`). Empty string when no skills — no point advertising a tool with
 * nothing to load.
 */
export function renderSkillIndex(index: SkillIndex): string {
  if (index.skills.length === 0) return "";
  const lines = index.skills.map((s) => `- ${s.name}: ${s.description}`);
  return [
    "<skills>",
    "You have access to the following skills, loaded on demand via the " +
      `\`${SKILL_TOOL_NAME}\` tool. Only the descriptions are shown here; the ` +
      "body loads when you ask for it.",
    "",
    "IMPORTANT: if a skill's description matches the task the user is asking " +
      "for (e.g. building a slide deck, authoring a `.canvas`), load that " +
      "skill with the `" +
      SKILL_TOOL_NAME +
      "` tool BEFORE you start — its instructions change HOW you must do the " +
      "work, so acting first and reading later produces the wrong result.",
    "",
    ...lines,
    "</skills>",
  ].join("\n");
}
