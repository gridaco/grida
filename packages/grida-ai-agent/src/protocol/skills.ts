/**
 * Agent skill vocabulary.
 *
 * Skills are closed prompt/tool modes, not free-form extension ids. New ids
 * land here only after their prompt block and tool wiring exist.
 */

export const AGENT_SKILL_IDS = ["svg"] as const;

export type SkillId = (typeof AGENT_SKILL_IDS)[number];
