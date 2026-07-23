/**
 * Canonical tool-name vocabulary for the Grida agent — the single seam
 * both the AI SDK tool calls and the runtime registry (`createToolset` in
 * `tools/index.ts`) derive from, so a rename at source propagates without
 * drift.
 */

import type { AgentFs } from "../fs";
import type { AgentTodos } from "../todos";
import type { AgentVision } from "../vision";
import type { AgentGen } from "../gen";
import type { SKILL_TOOL_NAME } from "../skills/skill-tool";

export const RUN_COMMAND_TOOL_NAME = "run_command" as const;

/** The locked `question` (ask-user) tool — RFC `tools` §question. */
export const QUESTION_TOOL_NAME = "question" as const;

/**
 * Semantic search over the Grida reference Library (the artwork-station gather
 * step). Client-resolved: the renderer holds the library/web session, so it
 * runs the search and fills the result in. It is a HUMAN-INPUT block (see
 * {@link HUMAN_INPUT_TOOL_NAMES}): the turn pauses at `input-available` until the
 * user submits their reference picks from the searched results — distinct from a
 * transient client-resolved fs call that resolves in milliseconds without a
 * person. See `design-search.ts`.
 */
export const DESIGN_SEARCH_TOOL_NAME = "design_search" as const;

/** Open an existing workspace artifact as the host's active surface. */
export const SURFACE_OPEN_TOOL_NAME = "surface_open" as const;

/** Report the host's currently open and active artifact surfaces. */
export const SURFACE_LIST_OPEN_TOOL_NAME = "surface_list_open" as const;

/**
 * Every tool the agent may emit, regardless of which capabilities a
 * given callsite happens to wire. The *maximal* union: the client must
 * be able to decode any tool name without first asking the agent host
 * what capabilities it bound. Derived from the fs/todos/vision namespaces'
 * own `ToolName` types so source renames propagate here automatically.
 */
export type AgentToolName =
  | AgentFs.ToolName
  | AgentTodos.ToolName
  | AgentVision.ToolName
  | AgentGen.ToolName
  | typeof RUN_COMMAND_TOOL_NAME
  | typeof QUESTION_TOOL_NAME
  | typeof DESIGN_SEARCH_TOOL_NAME
  | typeof SURFACE_OPEN_TOOL_NAME
  | typeof SURFACE_LIST_OPEN_TOOL_NAME
  | typeof SKILL_TOOL_NAME;

/**
 * Tools that **block the turn on a human** — they pause at `input-available`
 * until a person resolves them (RFC `queue` § drain-pause). This is the
 * *trait* the drain-pause gate keys on, NOT the literal tool name: the gate
 * (`store.hasPendingHumanInput`) treats any `input-available` part whose tool
 * is in this set as a pending human block, so the queue waits exactly as it
 * does for a supervised approval. A future richer human-block tool (e.g. a
 * "pick a generated idea" picker) joins the contract by being added here —
 * no change to the gate. Distinct from a *transient* client-resolved fs or
 * surface call at `input-available` (which a renderer fills in milliseconds),
 * which must NOT pause the drain.
 */
export const HUMAN_INPUT_TOOL_NAMES = [
  QUESTION_TOOL_NAME,
  // `design_search` is the artwork-station "pick a reference" picker the comment
  // above anticipated: it pauses at `input-available` until the user submits
  // their picks from the searched results (resolved by the renderer's card).
  DESIGN_SEARCH_TOOL_NAME,
] as const;

/**
 * Persisted/streamed part `type` values for the {@link HUMAN_INPUT_TOOL_NAMES}
 * tools. The AI SDK UI-message convention encodes the tool name into the part
 * type as `tool-<name>`, and the persisted `chat_parts.type` column carries it
 * verbatim — so the drain-pause gate (`store.hasPendingHumanInput`) filters on
 * these values. Derived from the name set so adding a human-block tool there
 * propagates here automatically.
 */
export const HUMAN_INPUT_PART_TYPES = HUMAN_INPUT_TOOL_NAMES.map(
  (name) => `tool-${name}` as const
);
