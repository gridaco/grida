// GRIDA-SEC-004 — exact native maintenance and history controls for attached chats.
import type {
  NativeChatCommand,
  NativeChatCommandResult,
} from "@grida/desktop-bridge";
import type { NativeChatSession } from "./native-agent-chat";

const COMPACT = "co.grida/session/compact";
const HISTORY = "co.grida/session/history";
const FORK = "co.grida/session/fork";
const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const MAX_RETAINED_FORKS = 16;
const COMPACTION_STATES = [
  "running",
  "suspended",
  "interrupted",
  "installed",
  "stale",
  "failed",
  "stopped",
  "uncertain",
  "no_change",
] as const;
const UNVERIFIED = new Set([
  "native_agent_request_timeout",
  "sqlite_commit_unconfirmed",
  "store_task_interrupted",
  "control_worker_interrupted",
  "compaction_admission_interrupted",
  "compaction_worker_interrupted",
  "native_agent_disconnected",
  "native_agent_input_failed",
  "native_agent_output_failed",
  "native_agent_diagnostics_failed",
  "native_agent_invalid_frame",
  "native_agent_invalid_response",
  "native_agent_provider_reply_failed",
  "native_chat_command_unverified",
]);

type Anchor =
  | { kind: "inherited"; message: string }
  | { kind: "turn"; turn: string; message: string };
type Basis = {
  view: number;
  tail: { turn: string; ordinal: number; position: number } | null;
  fingerprint: readonly number[];
};
type ForkRequest = {
  sessionId: string;
  requestId: string;
  expectedHistory: Basis;
  anchor: Anchor;
};

export class NativeAgentCommands {
  static readonly capabilities = {
    [COMPACT]: 1,
    [HISTORY]: 1,
    [FORK]: 1,
  } as const;
  private readonly forks = new WeakMap<
    NativeChatSession,
    Map<string, ForkRequest>
  >();
  private readonly active = new WeakSet<NativeChatSession>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>
  ) {}

  static available(supports: (key: string) => boolean): NativeChatCommand[] {
    const commands: NativeChatCommand[] = [];
    if (supports(COMPACT)) commands.push("compact");
    if (supports(HISTORY) && supports(FORK)) commands.push("fork");
    return commands;
  }

  async run(
    session: NativeChatSession,
    command: NativeChatCommand,
    requestId: string,
    check: () => void
  ): Promise<NativeChatCommandResult> {
    if (this.active.has(session))
      throw new Error("native_chat_command_in_progress");
    this.active.add(session);
    try {
      if (command === "fork") {
        const request = await this.forkRequest(session, requestId);
        check();
        const result = object(await this.dispatch(FORK, request));
        if (!identity(result?.sessionId) || result.sessionId === session.id)
          throw new Error("native_chat_command_unverified");
        return { command, sessionId: result.sessionId };
      }
      check();
      const result = object(
        await this.dispatch(COMPACT, { sessionId: session.id, requestId })
      );
      const status = COMPACTION_STATES.find(
        (value) => value === result?.status
      );
      const turnId = result?.turnId;
      if (
        !status ||
        (status === "no_change" ? turnId !== null : !identity(turnId))
      )
        throw new Error("native_chat_command_unverified");
      return { command, status, turnId: turnId as string | null };
    } finally {
      this.active.delete(session);
    }
  }

  private async forkRequest(
    session: NativeChatSession,
    requestId: string
  ): Promise<ForkRequest> {
    let retained = this.forks.get(session);
    const previous = retained?.get(requestId);
    if (previous) return previous;
    const page = object(
      await this.request(`_${HISTORY}`, { sessionId: session.id })
    );
    const expectedHistory = basis(page?.basis);
    if (!page || !expectedHistory)
      throw new Error("native_chat_history_invalid");
    let latest = page.latestAnchor;
    if (!Object.hasOwn(page, "latestAnchor")) {
      if (page.nextOffset !== null)
        throw new Error("native_chat_fork_tail_unavailable");
      if (!Array.isArray(page.messages) || page.messages.length > 128)
        throw new Error("native_chat_history_invalid");
      latest = page.messages.length
        ? object(page.messages.at(-1))?.anchor
        : null;
    }
    if (latest === null) throw new Error("history_anchor_missing");
    const anchor = historyAnchor(latest);
    if (!anchor) throw new Error("native_chat_history_invalid");
    const request = {
      sessionId: session.id,
      requestId,
      expectedHistory,
      anchor,
    };
    if (!retained) this.forks.set(session, (retained = new Map()));
    if (retained.size >= MAX_RETAINED_FORKS) {
      const oldest = retained.keys().next().value;
      if (oldest) retained.delete(oldest);
    }
    retained.set(requestId, request);
    return request;
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    try {
      return await this.request(`_${method}`, params);
    } catch (error) {
      if (error instanceof Error && UNVERIFIED.has(error.message))
        throw new Error("native_chat_command_unverified", { cause: error });
      throw error;
    }
  }
}

function historyAnchor(value: unknown): Anchor | null {
  const anchor = object(value);
  if (!identity(anchor?.message)) return null;
  if (anchor.kind === "inherited")
    return { kind: "inherited", message: anchor.message };
  if (anchor.kind === "turn" && identity(anchor.turn))
    return { kind: "turn", turn: anchor.turn, message: anchor.message };
  return null;
}

function basis(value: unknown): Basis | null {
  const basis = object(value);
  if (
    !revision(basis?.view) ||
    !Array.isArray(basis.fingerprint) ||
    basis.fingerprint.length !== 32 ||
    !basis.fingerprint.every((byte) => revision(byte) && byte <= 255)
  )
    return null;
  const fingerprint: number[] = [...basis.fingerprint];
  if (basis.tail === null) return { view: basis.view, tail: null, fingerprint };
  const tail = object(basis.tail);
  if (
    !identity(tail?.turn) ||
    !revision(tail.ordinal) ||
    !revision(tail.position)
  )
    return null;
  return {
    view: basis.view,
    tail: { turn: tail.turn, ordinal: tail.ordinal, position: tail.position },
    fingerprint,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identity(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
