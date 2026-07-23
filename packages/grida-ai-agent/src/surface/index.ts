/**
 * `@grida/agent/surface` — the agent's host-rendered artifact surface.
 *
 * A surface is presentation state, not storage or model context. The agent
 * names an existing artifact using the same virtual, workspace-rooted path
 * vocabulary as `AgentFs`; an attached host may observe the request and render
 * it.
 *
 * Both tools always execute on the server. A turn-start snapshot tells the
 * server that a surface host was attached and gives `surface_list_open` its
 * exact answer for that turn. The renderer may observe `surface_open` and
 * update its UI, but model continuation never depends on a client tool result.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  SURFACE_LIST_OPEN_TOOL_NAME,
  SURFACE_OPEN_TOOL_NAME,
} from "../tools/names";

export namespace AgentSurface {
  // -------------------------------------------------------------------------
  // Contract
  // -------------------------------------------------------------------------

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

  /** Server-authoritative result of `surface_open`. */
  export type OpenOutput =
    | {
        path: string;
        requested: true;
        reason: "requested";
      }
    | {
        path: string;
        requested: false;
        reason: "not_interactive";
      };

  /** Server-authoritative result of `surface_list_open`. */
  export type ListOpenOutput = {
    interactive: boolean;
    active: string | null;
    open: string[];
  };

  // -------------------------------------------------------------------------
  // Tool table
  // -------------------------------------------------------------------------

  export const TOOL_NAMES = {
    surface_open: SURFACE_OPEN_TOOL_NAME,
    surface_list_open: SURFACE_LIST_OPEN_TOOL_NAME,
  } as const;

  export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

  const PATH_DESCRIPTION =
    "Absolute path in the agent filesystem, starting with `/` (that `/` is " +
    "the current workspace root). Pass an existing file or a recognized " +
    "bundle directory, such as `/campaign.canvas`; do not pass an internal " +
    "bundle file such as `/campaign.canvas/.canvas.json`.";

  const PATH = z.string().trim().min(1).startsWith("/");

  const OPEN_INPUT = z
    .object({
      path: PATH.describe(PATH_DESCRIPTION),
    })
    .strict();

  const OPEN_OUTPUT = z.discriminatedUnion("reason", [
    z
      .object({
        path: PATH,
        requested: z.literal(true),
        reason: z.literal("requested"),
      })
      .strict(),
    z
      .object({
        path: PATH,
        requested: z.literal(false),
        reason: z.literal("not_interactive"),
      })
      .strict(),
  ]);

  const LIST_OPEN_INPUT = z.object({}).strict();

  const SNAPSHOT_FIELDS = {
    active: PATH.nullable(),
    open: z.array(PATH),
  } as const;

  const SNAPSHOT = z
    .object(SNAPSHOT_FIELDS)
    .strict()
    .superRefine((snapshot, ctx) => {
      if (
        snapshot.active !== null &&
        !snapshot.open.includes(snapshot.active)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["active"],
          message: "active must be null or included in open",
        });
      }
    });

  const LIST_OPEN_OUTPUT = z
    .object({
      interactive: z.boolean(),
      ...SNAPSHOT_FIELDS,
    })
    .strict();

  /**
   * Parse an untrusted turn-start snapshot. Invalid values are treated as an
   * absent surface host by the run boundary.
   */
  export function parseSnapshot(value: unknown): Snapshot | undefined {
    const parsed = SNAPSHOT.safeParse(value);
    if (!parsed.success) return undefined;
    return {
      active: parsed.data.active,
      open: [...parsed.data.open],
    };
  }

  /**
   * Build the always-present, always-server-executed tool family.
   *
   * A supplied snapshot means an observer was attached when the turn began.
   * `surface_open` therefore acknowledges only that the presentation request
   * was emitted; it never claims the artifact actually opened. With no
   * snapshot, both tools resolve as continuation-safe noninteractive no-ops.
   */
  export function createTools(opts: { snapshot?: Snapshot } = {}) {
    const snapshot = parseSnapshot(opts.snapshot);

    return {
      [TOOL_NAMES.surface_open]: tool({
        description:
          "Request that an attached host open an existing workspace artifact " +
          "and make it the active visible surface. `path` uses the same " +
          "workspace-rooted absolute vocabulary as the filesystem tools. It " +
          "may name a file or a recognized bundle directory. This is " +
          "presentation only: it does not create, edit, attach, branch, or " +
          "grant access to the artifact. A successful result acknowledges " +
          "only the request, not the renderer's final state.",
        inputSchema: OPEN_INPUT,
        outputSchema: OPEN_OUTPUT,
        execute: async ({ path }): Promise<OpenOutput> =>
          snapshot
            ? { path, requested: true, reason: "requested" }
            : { path, requested: false, reason: "not_interactive" },
        toModelOutput: ({ output }): ModelTextOutput =>
          toModelOpenOutput(output),
      }),
      [TOOL_NAMES.surface_list_open]: tool({
        description:
          "List workspace artifact paths represented by host surfaces at the " +
          "start of this turn and identify the active path. This reports " +
          "presentation state only; it is not a workspace file listing and " +
          "does not grant artifact access. You do not need to call it before " +
          "surface_open.",
        inputSchema: LIST_OPEN_INPUT,
        outputSchema: LIST_OPEN_OUTPUT,
        execute: async (): Promise<ListOpenOutput> =>
          snapshot
            ? {
                interactive: true,
                active: snapshot.active,
                open: [...snapshot.open],
              }
            : { interactive: false, active: null, open: [] },
        toModelOutput: ({ output }): ModelTextOutput =>
          toModelListOpenOutput(output),
      }),
    } as const;
  }

  export type Tools = ReturnType<typeof createTools>;

  // -------------------------------------------------------------------------
  // Browser observer
  // -------------------------------------------------------------------------

  /**
   * Observe a surface tool call without resolving it for the model.
   *
   * Returns whether the call belongs to this tool family, allowing a renderer
   * to chain observers. `surface_open` is fire-and-forget; synchronous throws
   * and asynchronous rejections are contained because presentation is
   * auxiliary. `surface_list_open` needs no host action: the server already
   * answered it from the turn-start snapshot.
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

  // -------------------------------------------------------------------------
  // Model-output lowering
  // -------------------------------------------------------------------------

  type ModelTextOutput = { type: "text"; value: string };

  /** Lower open acknowledgements without claiming renderer completion. */
  export function toModelOpenOutput(output: OpenOutput): ModelTextOutput {
    switch (output.reason) {
      case "requested":
        return {
          type: "text",
          value:
            `Requested presentation of ${output.path} from the attached host. ` +
            "This acknowledges the request only, not that the artifact opened. " +
            "Presentation is auxiliary; continue based on the artifact work itself.",
        };
      case "not_interactive":
        return {
          type: "text",
          value:
            "This host is non-interactive, so no surface request was emitted. " +
            "This is an expected successful no-op: do not retry or change the " +
            "artifact work; continue based on the artifact itself.",
        };
    }
  }

  /** Lower the turn-start presentation snapshot without filesystem authority. */
  export function toModelListOpenOutput(
    output: ListOpenOutput
  ): ModelTextOutput {
    if (!output.interactive) {
      return {
        type: "text",
        value:
          "This host is non-interactive, so it has no open or active surfaces. " +
          "This is expected: do not retry or change the artifact work.",
      };
    }
    if (output.open.length === 0) {
      return {
        type: "text",
        value:
          "The attached host had no open artifact surfaces at the start of this turn.",
      };
    }
    return {
      type: "text",
      value: [
        `Active surface at turn start: ${output.active ?? "none"}`,
        "Open surfaces at turn start:",
        ...output.open.map((path) => `- ${path}`),
      ].join("\n"),
    };
  }
}
