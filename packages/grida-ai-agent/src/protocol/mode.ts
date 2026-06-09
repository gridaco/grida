/**
 * Agent permission mode vocabulary.
 *
 * A mode is the agent's *supervision posture* for a session — how much runs
 * without the user in the loop. It governs the shell/tool gate, not which
 * tools exist. Two modes are exposed (the fuller posture space — read-only,
 * a future interactive `ask`, a no-checks bypass — lives under the hood):
 *
 *   - `accept-edits` (default): supervised. Reads, file edits, and read-only
 *     commands auto-run; anything else surfaces an Allow/Deny prompt and runs
 *     on approval.
 *   - `auto`: trusted bypass. Every command runs with no prompt; the OS sandbox
 *     (structural write-containment + process-tree confinement) is the guard.
 *     The semantic safety classifier is deferred.
 *
 * The structural containment that holds in BOTH modes (writable roots, the
 * sandbox escape-vector deny set, the cwd-in-workspace check) is not a mode
 * concern — see `sandbox/policy.ts` and `shell/runner.ts`. Client-safe (no node
 * imports): the editor UI imports this for the mode picker.
 */

export const AGENT_MODES = ["accept-edits", "auto"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

/** Conservative default: supervised, no arbitrary execution without approval. */
export const AGENT_DEFAULT_MODE: AgentMode = "accept-edits";

/** Narrow an untrusted value to an {@link AgentMode}, or `undefined`. */
export function asAgentMode(value: unknown): AgentMode | undefined {
  return typeof value === "string" &&
    (AGENT_MODES as readonly string[]).includes(value)
    ? (value as AgentMode)
    : undefined;
}
