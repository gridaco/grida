/**
 * Canonical tool-name vocabulary for the Grida agent — the single seam
 * both the AI SDK tool calls and the runtime registry (`createToolset` in
 * `tools/index.ts`) derive from, so a rename at source propagates without
 * drift.
 */

import type { AgentFs } from "../fs";
import type { AgentTodos } from "../todos";
import type { AgentVision } from "../vision";
import type { SKILL_TOOL_NAME } from "../skills/skill-tool";

export const RUN_COMMAND_TOOL_NAME = "run_command" as const;

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
  | typeof RUN_COMMAND_TOOL_NAME
  | typeof SKILL_TOOL_NAME;
