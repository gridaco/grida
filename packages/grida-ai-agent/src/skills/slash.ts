/**
 * Pure slash-command primitives for the `/skill` autocomplete UX. Client-safe:
 * no `node:*`, no React, no I/O — the renderer imports these to detect the
 * trigger, filter the menu, and expand a `/skill [args]` submit into the
 * model-facing hint. The SKILL.md body is NEVER inlined here: expansion emits a
 * hint telling the model to call the `skill` tool itself (the sole load path),
 * so the user's transcript (`raw`) and the model's history (`expanded`) diverge.
 */

import type { DiscoveredSkill, SkillSource } from "./types";

/** Thrown by {@link expandSlashCommand} when the typed token is not a known
 *  skill. The renderer catches it and surfaces an inline error rather than
 *  submitting. `skillName` carries the offending name for a precise message. */
export class UnknownSkillError extends Error {
  readonly skillName: string;
  constructor(name: string) {
    super(`unknown skill: ${name}`);
    this.name = "UnknownSkillError";
    this.skillName = name;
  }
}

// ---------------------------------------------------------------------------
// Trigger detection (caret-aware).
// ---------------------------------------------------------------------------

export type SlashTriggerDetection = {
  /** Whether the `/` autocomplete menu should be visible. */
  active: boolean;
  /** Text typed between the leading `/` and the caret; never whitespace. */
  query: string;
};

const INACTIVE: SlashTriggerDetection = Object.freeze({
  active: false,
  query: "",
});

/**
 * Detect whether the caret sits inside a leading `/skill` token, and if so the
 * in-progress query. The trigger activates when the first non-whitespace char
 * of `text.slice(0, caretIndex)` is `/` and no whitespace follows it up to the
 * caret (typing whitespace commits the token and hides the menu). Out-of-range
 * `caretIndex` is clamped — stale UI indices must not throw.
 */
export function detectSlashTrigger(
  text: string,
  caretIndex: number
): SlashTriggerDetection {
  const safeCaret = Math.max(0, Math.min(caretIndex | 0, text.length));
  const before = text.slice(0, safeCaret);
  let i = 0;
  while (i < before.length && /\s/.test(before[i]!)) i++;
  if (before[i] !== "/") return INACTIVE;
  const afterSlash = before.slice(i + 1);
  if (/\s/.test(afterSlash)) return INACTIVE;
  return { active: true, query: afterSlash };
}

// ---------------------------------------------------------------------------
// Fuzzy filter (exact > prefix > substring > subsequence).
// ---------------------------------------------------------------------------

const NO_MATCH = Number.POSITIVE_INFINITY;

function matchRank(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  let qi = 0;
  for (let ni = 0; ni < name.length && qi < query.length; ni++) {
    if (name[ni] === query[qi]) qi++;
  }
  return qi === query.length ? 3 : NO_MATCH;
}

/**
 * Filter + rank skill-shaped items by fuzzy-matching `query` against `name`
 * (case-insensitive). Lower rank wins; ties break by shorter name then input
 * order (stable). Empty/whitespace query returns a fresh copy in input order.
 * Generic over `{ name: string }` so raw skills or menu items both compose.
 */
export function fuzzyFilterSkills<T extends { name: string }>(
  skills: readonly T[],
  query: string
): T[] {
  const folded = query.trim().toLocaleLowerCase();
  if (folded.length === 0) return skills.slice();
  const scored: { item: T; rank: number; nameLen: number; index: number }[] =
    [];
  for (let i = 0; i < skills.length; i++) {
    const item = skills[i]!;
    const rank = matchRank(item.name.toLocaleLowerCase(), folded);
    if (rank === NO_MATCH) continue;
    scored.push({ item, rank, nameLen: item.name.length, index: i });
  }
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.nameLen !== b.nameLen) return a.nameLen - b.nameLen;
    return a.index - b.index;
  });
  return scored.map((s) => s.item);
}

// ---------------------------------------------------------------------------
// Menu adapter.
// ---------------------------------------------------------------------------

/** A single row in the `/` autocomplete menu. */
export type SlashCommandMenuItem = {
  name: string;
  description: string;
  /** Uniform placeholder — skills declare no per-skill arg shape. */
  argsHint: string;
  /** Friendly discovery-source label (workspace / user / built-in / …). */
  sourceLabel: string;
  source: SkillSource;
};

export const DEFAULT_ARGS_HINT = "[args]";

/** Friendly source label for the menu — collapses discovery sources to the
 *  buckets a user recognises. */
export const SOURCE_LABELS: Record<SkillSource, string> = {
  project: "workspace",
  user: "user",
  config: "config",
  bundled: "built-in",
  remote: "remote",
};

export function toMenuItem(skill: DiscoveredSkill): SlashCommandMenuItem {
  return {
    name: skill.name,
    description: skill.description,
    argsHint: DEFAULT_ARGS_HINT,
    sourceLabel: SOURCE_LABELS[skill.source],
    source: skill.source,
  };
}

/** Adapt discovered skills (already shadow-deduped + name-sorted by discovery)
 *  into menu rows. Order preserved; input never mutated. */
export function toMenuItems(
  skills: readonly DiscoveredSkill[]
): SlashCommandMenuItem[] {
  return skills.map(toMenuItem);
}

// ---------------------------------------------------------------------------
// Expansion (`/skill [args]` → model-facing hint).
// ---------------------------------------------------------------------------

export type SlashCommandExpansion = {
  /** Original input, unchanged (shown in the transcript). */
  raw: string;
  /** Text the model receives — the hint when a skill matched, else `raw`. */
  expanded: string;
  skillName: string | null;
  arguments: string | null;
};

// Starts with a letter, lower-kebab, optional single `namespace:name` segment.
const SLASH_TOKEN_RE = /^\/([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)(.*)$/s;

/** True when `input` begins with a syntactically valid slash token. */
export function isSlashCommand(input: string): boolean {
  return SLASH_TOKEN_RE.test(input);
}

/**
 * The hint a matched `/skill` expands to — the model is told to call the
 * `skill` tool itself (the only sanctioned body-load path). Empty args omit the
 * `## User Input` block entirely. No client-side `$ARGUMENTS` substitution.
 */
export function buildHintPattern(
  skillName: string,
  argumentsText: string
): string {
  const head = `Read the '${skillName}' skill (via the skill tool) and follow its instructions exactly.`;
  if (argumentsText === "") return head;
  return `${head}\n\n## User Input\n\nARGUMENTS: ${argumentsText}`;
}

/**
 * Expand a `/skill [args]` submit into its model-facing form. Non-slash input
 * is an identity. A known skill returns the hint pattern; an unknown one throws
 * {@link UnknownSkillError}. Exactly one separator space after the token is
 * consumed; all other whitespace in the args is preserved verbatim.
 */
export function expandSlashCommand(
  input: string,
  knownSkills: Iterable<string>
): SlashCommandExpansion {
  const identity: SlashCommandExpansion = {
    raw: input,
    expanded: input,
    skillName: null,
    arguments: null,
  };
  if (!input.startsWith("/")) return identity;
  const match = SLASH_TOKEN_RE.exec(input);
  if (match === null) return identity;

  const skillName = match[1]!;
  let rest = match[2] ?? "";
  if (rest.startsWith(" ")) rest = rest.slice(1);

  if (!new Set(knownSkills).has(skillName)) {
    throw new UnknownSkillError(skillName);
  }
  return {
    raw: input,
    expanded: buildHintPattern(skillName, rest),
    skillName,
    arguments: rest,
  };
}
