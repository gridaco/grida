// GRIDA-SEC-004 — background process controls name only an attached session.
import type { NativeChatBackgroundProcess } from "@grida/desktop-bridge";

const MAX_PROCESSES = 64;
const MAX_STOP_IDS = 64;
const MAX_COMMAND_BYTES = 16 * 1024;
const MAX_PATH_BYTES = 4096;
const MAX_ID = 0xffffffff;

/**
 * Commands the agent kept running for a chat after a short wait.
 *
 * The agent owns them; Desktop lists them, forwards their live list, and stops
 * them on request. Every reply is checked against the exact session asked.
 */
export class NativeAgentBackgroundProcesses {
  static readonly capability = "co.grida/session/processes";
  static readonly listMethod = "_co.grida/session/processes";
  static readonly stopMethod = "_co.grida/session/stop-processes";

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>
  ) {}

  async list(
    sessionId: string
  ): Promise<readonly NativeChatBackgroundProcess[]> {
    const result = object(
      await this.request(NativeAgentBackgroundProcesses.listMethod, {
        sessionId,
      })
    );
    if (result.sessionId !== sessionId) throw invalid();
    return NativeAgentBackgroundProcesses.read(result.processes);
  }

  async stop(
    sessionId: string,
    processIds?: unknown
  ): Promise<readonly number[]> {
    const ids =
      processIds === undefined
        ? undefined
        : NativeAgentBackgroundProcesses.readIds(processIds);
    const result = object(
      await this.request(NativeAgentBackgroundProcesses.stopMethod, {
        sessionId,
        ...(ids && { processIds: ids }),
      })
    );
    if (result.sessionId !== sessionId || !Array.isArray(result.stopped))
      throw invalid();
    const stopped = result.stopped.map((id: unknown) => processId(id));
    if (
      stopped.length > MAX_PROCESSES ||
      new Set(stopped).size !== stopped.length ||
      (ids && stopped.some((id) => !ids.includes(id)))
    )
      throw invalid();
    return Object.freeze(stopped);
  }

  /** The `_meta` payload of a live update: the session's complete list. */
  static readUpdate(value: unknown): readonly NativeChatBackgroundProcess[] {
    return NativeAgentBackgroundProcesses.read(object(value).processes);
  }

  static read(value: unknown): readonly NativeChatBackgroundProcess[] {
    if (!Array.isArray(value) || value.length > MAX_PROCESSES) throw invalid();
    const processes = value.map(entry);
    if (new Set(processes.map((p) => p.processId)).size !== processes.length)
      throw invalid();
    return Object.freeze(processes);
  }

  static readIds(value: unknown): readonly number[] {
    if (!Array.isArray(value) || !value.length || value.length > MAX_STOP_IDS)
      throw invalid();
    const ids = value.map(processId);
    if (new Set(ids).size !== ids.length) throw invalid();
    return Object.freeze(ids);
  }
}

function entry(value: unknown): NativeChatBackgroundProcess {
  const row = object(value);
  const state = row.state;
  if (state !== "running" && state !== "ended") throw invalid();
  const exitCode =
    row.exitCode === null || row.exitCode === undefined
      ? null
      : integer(row.exitCode, -MAX_ID, MAX_ID);
  if (state === "running" && exitCode !== null) throw invalid();
  if (typeof row.terminal !== "boolean") throw invalid();
  const cwd = text(row.cwd, MAX_PATH_BYTES);
  if (!cwd.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(cwd)) throw invalid();
  return Object.freeze({
    processId: processId(row.processId),
    command: text(row.command, MAX_COMMAND_BYTES),
    cwd,
    terminal: row.terminal,
    startedAt: integer(row.startedAt, 0, Number.MAX_SAFE_INTEGER),
    state,
    exitCode,
  });
}

function processId(value: unknown): number {
  return integer(value, 0, MAX_ID);
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value || Buffer.byteLength(value) > limit)
    throw invalid();
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function invalid(): Error {
  return new Error("native_chat_background_processes_invalid");
}
