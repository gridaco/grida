/**
 * Command-execution tool for the agent.
 *
 * Unlike the fs / todos tools (which have no `execute()` and are
 * client-resolved against a live `AgentFs` instance on whichever side
 * holds the editor), the command tool **does** have `execute()` and
 * runs synchronously inside the agent loop on the agent host side. The
 * reason is asymmetric: the client has a workspace editor (so it
 * can resolve filesystem calls locally), but it has no process-spawn
 * capability — only the agent host does. Routing command calls through the
 * agent host's existing
 * `runShell` keeps the trust boundary in one place.
 *
 * The command backend is *injected*. The package never imports
 * `child_process` directly — it asks the caller for a function that
 * takes `{command, args, workdir}` and returns process output.
 * That keeps the package runtime-neutral and lets the agent host reuse
 * its structural shell gates — cwd-in-workspace + secret-arg containment
 * (see `@grida/agent`'s `validateShellRequest`). There is no command
 * allowlist; the OS sandbox is the structural boundary.
 *
 * GRIDA-SEC-004 — this tool owns the supervised-approval gate. The
 * `needsApproval` predicate below is what PAUSES a mutating command for an
 * Allow/Deny in `accept-edits` (and is absent in `auto`). The gate lives on
 * the tool, NOT the backend: by the time the backend's `execute` runs, the
 * call is already cleared (auto, or user-approved), so the backend cannot
 * re-gate on mode. The mode→predicate wiring is at
 * `workspace-agent-bindings.ts`; the read-only classification is
 * `permissions.ts` `isReadOnlyCommand`; the server-authoritative answer is
 * `store.answerApproval`. See SECURITY.md.
 */

import { tool } from "ai";
import { z } from "zod";
import { RUN_COMMAND_TOOL_NAME } from "./names";

/** The canonical tool name. Kept as a const so the wire union and the
 * registry key can't drift. */
export { RUN_COMMAND_TOOL_NAME };
export type RunCommandToolName = typeof RUN_COMMAND_TOOL_NAME;

/** Shape the agent expects from the injected command backend. The
 * caller's job is to apply its allowlist, resolve the workdir, spawn the
 * process, and aggregate the result. The agent doesn't know or care
 * how that happens. */
export type RunCommandResult = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  signal?: string | null;
  /** True iff the backend killed the process for exceeding its time
   * budget. Reported separately from a non-zero exit code so the LLM
   * can tell a slow command apart from a failed one. */
  timed_out: boolean;
  /** True iff stdout/stderr were clipped by the backend. */
  truncated: boolean;
  duration_ms?: number;
};

export type RunCommandFailure = {
  ok: false;
  /** Caller-chosen reason. The agent host uses things like
   * `"cwd-not-in-workspace"`, `"arg-in-protected-root"`. Stays as a string
   * so adding new categories doesn't require a wire change. */
  code: string;
  message: string;
};

export type RunCommandOutcome = RunCommandResult | RunCommandFailure;

export type RunCommandBackend = (input: {
  command: string;
  args: string[];
  workdir: string;
  timeout_ms?: number;
  description: string;
}) => Promise<RunCommandOutcome>;

/**
 * Build the command tool bound to a specific backend + default workdir.
 * Called by `createToolset({ command })` — never directly by the
 * package's consumers.
 */
export function createRunCommandTool(opts: {
  backend: RunCommandBackend;
  default_workdir: string;
  policy_description?: string;
  /**
   * Supervised-approval gate (RFC `permission modes`, Phase 2). When this
   * returns true for a given call, the AI SDK emits a `tool-approval-request`
   * and PAUSES — `execute` does not run until the user approves (Allow). In
   * `accept-edits` the host wires this to "true unless the command is
   * read-only"; in `auto` it's absent (every command auto-runs). The decision
   * lives here, NOT in the backend, because the backend's `execute` can't tell
   * an approved call from an un-approved one — by the time `execute` runs, the
   * SDK has already cleared the call (auto, or user-approved).
   */
  needs_approval?: (input: { command: string; args: string[] }) => boolean;
}) {
  const policy =
    opts.policy_description ??
    "The host backend is responsible for command allowlisting, workdir " +
      "validation, timeout caps, and process isolation.";
  return tool({
    description:
      "Run a host-approved command in the workspace. This directly " +
      "spawns an executable with argv arguments; it is not a shell, " +
      "so pipes, redirects, glob expansion, env assignment, and `&&` " +
      `are not interpreted. ${policy} ` +
      "Prefer structured filesystem tools for reading, writing, " +
      "editing, and searching when possible.",
    inputSchema: z.object({
      command: z
        .string()
        .min(1)
        .describe(
          "Bare executable name. Must be accepted by the host backend."
        ),
      args: z
        .array(z.string())
        .default([])
        .describe("Argument list. Each element is one argv slot."),
      workdir: z
        .string()
        .optional()
        .describe(
          "Optional absolute path. Defaults to the workspace root. " +
            "Must resolve inside the workspace."
        ),
      timeout_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional timeout in milliseconds. The host may cap it."),
      description: z
        .string()
        .min(1)
        .describe("Clear, concise description of what this command does."),
    }),
    outputSchema: z.union([
      z.object({
        stdout: z.string(),
        stderr: z.string(),
        exit_code: z.number().int().nullable(),
        signal: z.string().nullable().optional(),
        timed_out: z.boolean(),
        truncated: z.boolean(),
        duration_ms: z.number().int().optional(),
      }),
      z.object({
        ok: z.literal(false),
        code: z.string(),
        message: z.string(),
      }),
    ]),
    // Supervised approval (Phase 2): pausing happens BEFORE `execute`. When the
    // host supplies no predicate (e.g. `auto`), the call never pauses.
    needsApproval: opts.needs_approval
      ? (input) =>
          opts.needs_approval!({
            command: input.command,
            args: input.args ?? [],
          })
      : false,
    execute: async ({
      command,
      args,
      workdir,
      timeout_ms: timeoutMs,
      description,
    }) => {
      return await opts.backend({
        command,
        args: args ?? [],
        workdir: workdir ?? opts.default_workdir,
        timeout_ms: timeoutMs,
        description,
      });
    },
  });
}
