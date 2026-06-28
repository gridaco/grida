/**
 * Capability-driven tool registry for the Grida agent.
 *
 * The fs and todos tools are always present in the registry — they're
 * the agent's baseline VFS + planning vocabulary. What changes per
 * callsite is *who resolves them*:
 *
 *   - **Client-resolved** (web SVG demo, standalone doc window).
 *     The package leaves fs/todos tools without `execute()`. The
 *     consumer (the React `@ai-sdk/react` Chat with `onToolCall`, or
 *     a chat-transcript reducer) calls `AgentFs.resolveToolCall`
 *     against its own `AgentFs` instance — typically one bound to a
 *     live editor.
 *
 *   - **Server-resolved** (workspace-bound agent host). The consumer
 *     injects `fs` and `todos` instances at agent-creation time; we
 *     wrap each fs/todos tool with an `execute()` that calls
 *     `AgentFs.resolveToolCall` / `AgentTodos.resolveToolCall` inline.
 *     The agent loop handles them in-process — the client just
 *     observes chunks.
 *
 * Command execution is always server-resolved (the client has no
 * process-spawn capability). The command tool ships with `execute()`
 * baked in pointing at the injected backend; without an injected
 * backend, command execution is not in the
 * registry at all (the LLM never learns the capability exists).
 *
 * What we do NOT expose: a flat `tools` constant. The static set was
 * fine when SVG-only and capability-free; once "who resolves" is
 * conditional, exporting a single static record would lie about the
 * shape. Callers go through `createToolset`.
 */

import { tool } from "ai";
import { AgentFs } from "../fs";
import { AgentTodos } from "../todos";
import { AgentVision } from "../vision";
import { createSkillTool, SKILL_TOOL_NAME } from "../skills/skill-tool";
import type {
  SkillBodyCache,
  SkillBodyLoader,
  SkillIndex,
} from "../skills/types";
import {
  RUN_COMMAND_TOOL_NAME,
  QUESTION_TOOL_NAME,
  type AgentToolName,
} from "./names";
import {
  createRunCommandTool,
  type RunCommandBackend,
  type RunCommandOutcome,
} from "./run-command";
import { createQuestionTool } from "./question";

export { RUN_COMMAND_TOOL_NAME, QUESTION_TOOL_NAME, SKILL_TOOL_NAME };
export type { AgentToolName, RunCommandBackend, RunCommandOutcome };

export type ToolsetCapabilities = {
  /** Server-side AgentFs binding. When provided, fs tools get
   * `execute()` that resolves against this instance — the agent loop
   * handles fs calls in-process. When absent, fs tools are bare;
   * the consumer resolves them externally. */
  fs?: AgentFs;
  /** Server-side AgentTodos binding. Same pattern as `fs`. */
  todos?: AgentTodos;
  /** Inject a byte source for `view_image` (visual perception). Without it
   * the tool is NOT in the registry — advertising a perception tool with no
   * way to resolve it would hang the model on an unanswerable call. `AgentFs`
   * satisfies `AgentVision.ByteReader`, so the workspace path passes its fs
   * here; the model SEES an image only where a host can hand back its bytes. */
  vision?: AgentVision.ByteReader;
  /** Inject command execution. Without this entry the `run_command` tool is
   * NOT in the registry — the LLM cannot call something we can't
   * execute. */
  command?: {
    backend: RunCommandBackend;
    /** Used when the LLM omits `workdir`. The backend is still responsible
     * for verifying the workdir is inside the workspace — this is just
     * the default. */
    default_workdir: string;
    /** Supervised-approval gate (RFC `permission modes`, Phase 2). Passed
     * straight to `createRunCommandTool` → the tool's `needsApproval`. The
     * host computes it from the session mode + `isReadOnlyCommand`; absent in
     * `auto` (every command auto-runs). */
    needs_approval?: (input: { command: string; args: string[] }) => boolean;
  };
  /** Inject the discovered skill index. When provided, the locked `skill`
   * tool joins the registry, letting the model load any advertised skill
   * body on demand. Without it, the tool is absent (no skills to load). */
  skill?: {
    index: SkillIndex;
    /** Per-session body cache (RFC `skills / hot-reload`). */
    cache?: SkillBodyCache;
    /** Body reader (server injects `nodeSkillBodyLoader`). */
    load_body: SkillBodyLoader;
  };
  /**
   * Whether a human UI is bound (RFC `tools` §question). The locked `question`
   * tool is ALWAYS registered — when `interactive` is true it is client-resolved
   * (no `execute`, pauses for the user's answer); when false/undefined it ships
   * with a fixed-refusal `execute` so a headless host returns a tool error
   * instead of hanging forever. Unlike the other capabilities, absence does not
   * drop the tool — the lock guarantees every host advertises it.
   */
  interactive?: boolean;
};

/**
 * Build the toolset record fed to `ToolLoopAgent({ tools })`. The
 * baseline (fs + todos) is unconditional; whether they carry
 * `execute()` depends on which bindings the caller injects.
 */
export function createToolset(caps: ToolsetCapabilities = {}) {
  const fsBinding = caps.fs;
  const todosBinding = caps.todos;
  const fsTools = fsBinding
    ? wrapWithResolver(AgentFs.tools, (name, input) =>
        AgentFs.resolveToolCall(fsBinding, {
          tool_name: name as AgentFs.ToolName,
          input,
        })
      )
    : AgentFs.tools;
  const todosTools = todosBinding
    ? wrapWithResolver(AgentTodos.tools, (name, input) =>
        AgentTodos.resolveToolCall(todosBinding, {
          tool_name: name as AgentTodos.ToolName,
          input,
        })
      )
    : AgentTodos.tools;
  const base = {
    ...fsTools,
    ...todosTools,
    // The locked `question` tool is unconditional (every host advertises it).
    // `interactive` only decides whether it pauses for a human (no execute) or
    // refuses headless (a fixed-error execute) — see `createQuestionTool`.
    [QUESTION_TOOL_NAME]: createQuestionTool({
      interactive: caps.interactive === true,
    }),
  };
  // Conditional spreads keep each capability's precise tool type in the
  // inferred return (used by `createAgent`'s `ToolLoopAgent<…, typeof
  // tools>` generic). The `skill` tool only joins when there's a
  // non-empty index — advertising a loader with nothing to load just
  // burns a tool slot.
  const withCommand = caps.command
    ? { ...base, [RUN_COMMAND_TOOL_NAME]: createRunCommandTool(caps.command) }
    : base;
  const withSkill =
    caps.skill && caps.skill.index.skills.length > 0
      ? {
          ...withCommand,
          [SKILL_TOOL_NAME]: createSkillTool({
            index: caps.skill.index,
            cache: caps.skill.cache,
            load_body: caps.skill.load_body,
          }),
        }
      : withCommand;
  // view_image joins only when a byte source is wired. `wrapWithResolver`
  // preserves the tool's `toModelOutput` (it spreads the base config and only
  // overrides `execute`), so the resolved bytes still lower to a media block.
  const visionBinding = caps.vision;
  const withVision = visionBinding
    ? {
        ...withSkill,
        ...wrapWithResolver(AgentVision.tools, (name, input) =>
          AgentVision.resolveToolCall(visionBinding, {
            tool_name: name,
            input,
          })
        ),
      }
    : withSkill;
  return withVision;
}

/**
 * Wrap each tool in a record with an `execute()` that delegates to
 * `resolver(toolName, input)`. The base schema (description, input,
 * output) is preserved; only execute changes.
 *
 * The return type is asserted as `T` because we know the wrap
 * preserves each tool's shape (we re-call `tool({...t, execute})` per
 * entry). TypeScript can't track that through `Object.entries`, but
 * the runtime invariant is sound — the agent's tool registry stays
 * the same shape with an added execute callback.
 */
function wrapWithResolver<T extends Record<string, unknown>>(
  tools: T,
  resolver: (name: string, input: unknown) => unknown
): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    out[name] = tool({
      ...(t as Parameters<typeof tool>[0]),
      execute: async (input: unknown) => resolver(name, input),
    });
  }
  return out as T;
}
