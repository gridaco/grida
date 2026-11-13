/**
 * `@grida/agent/surface` — host-rendered artifact surface vocabulary for the
 * renderer's earlier chat pane.
 *
 * A surface is presentation state, not storage or model context. The agent
 * names an existing artifact using the same virtual, workspace-rooted path
 * vocabulary as `AgentFs`; an attached host may observe the request and render
 * it. The model continuation never depends on a client result.
 */

import { z } from "zod";

export namespace AgentSurface {
  /** Presentation state captured by the host at the start of one agent turn. */
  export type Snapshot = {
    active: string | null;
    open: string[];
  };

  /**
   * Browser-host adapter.
   *
   * `open` is an auxiliary UI request. Its return value is deliberately absent:
   * the observer does not feed renderer state back into the model. `listOpen`
   * is synchronous so a transport can capture the snapshot before starting a
   * turn.
   */
  export interface Host {
    open(path: string): void | Promise<void>;
    listOpen(): Snapshot;
  }

  export const TOOL_NAMES = {
    surface_open: "surface_open",
    surface_list_open: "surface_list_open",
  } as const;

  export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

  const PATH = z.string().trim().min(1).startsWith("/");
  const OPEN_INPUT = z.object({ path: PATH }).strict();
  const LIST_OPEN_INPUT = z.object({}).strict();

  /**
   * Observe a surface tool call without resolving it for the model.
   *
   * Returns whether the call belongs to this tool family, allowing a renderer
   * to chain observers. `surface_open` is fire-and-forget; synchronous throws
   * and asynchronous rejections are contained because presentation is
   * auxiliary. `surface_list_open` needs no host action.
   */
  export function observeToolCall(
    host: Host,
    toolCall: { tool_name: string; input: unknown; dynamic?: boolean }
  ): boolean {
    if (toolCall.dynamic) return false;

    if (toolCall.tool_name === TOOL_NAMES.surface_open) {
      const parsed = OPEN_INPUT.safeParse(toolCall.input);
      if (!parsed.success) return false;
      try {
        void Promise.resolve(host.open(parsed.data.path)).catch(
          () => undefined
        );
      } catch {
        // A detached or failed renderer cannot affect model continuation.
      }
      return true;
    }

    if (toolCall.tool_name === TOOL_NAMES.surface_list_open) {
      return LIST_OPEN_INPUT.safeParse(toolCall.input).success;
    }

    return false;
  }
}
