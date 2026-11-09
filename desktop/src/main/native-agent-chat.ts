// GRIDA-SEC-004 — attached native chat controls owned by Electron main.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  NativeChatAcceptance,
  NativeChatApprovalDecision,
  NativeChatControlReceipt,
  NativeChatMessage,
  NativeChatPage,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatSnapshot,
  NativeChatStreamUpdate,
  NativeChatTurn,
} from "@grida/desktop-bridge";
import type { NativeApprovalReview } from "./native-agent-permissions";
import {
  NativeAgentProcess,
  type NativeAgentLaunch,
} from "./native-agent-process";

const CAPABILITIES = {
  "co.grida/session/submit": 1,
  "co.grida/session/enqueue": 1,
  "co.grida/session/input": 1,
  "co.grida/session/snapshot": 1,
  "co.grida/session/stop": 1,
  "co.grida/session/pause": 1,
  "co.grida/session/resume": 1,
  "co.grida/session/updates": 1,
  "co.grida/session/questions": 1,
  "co.grida/session/answer-question": 1,
} as const;
const TURN_DISPOSITIONS = [
  "running",
  "suspended",
  "interrupted",
  "settled",
] as const;
const TURN_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
] as const;
const INPUT_DISPOSITIONS = [
  "queued",
  "claimed",
  "completed",
  "superseded",
  "withdrawn",
] as const;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_UPDATE_BYTES = 8 * 1024;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_MESSAGES = 1024;
const MAX_CATALOG_SESSIONS = 32;
const CATALOG_CURSOR = /^[!-~]{1,512}$/;
const IDENTITY = /^[A-Za-z0-9_.:@/-]{1,256}$/;

export type NativeAgentChatLaunch = Omit<
  NativeAgentLaunch,
  "capabilities" | "onSessionUpdate"
> & {
  /** Canonical workspace context selected by main for this process. */
  cwd: string;
};

export type NativeChatSession = Readonly<{ id: string }>;
type TaskBasis = Readonly<{
  sessionId: string;
  turnId: string;
  requestId: string;
  expectedSessionRevision: number;
  expectedControlRevision: number;
}>;

export type NativeQuestionReview = Readonly<
  Pick<NativeChatQuestion, "style" | "question" | "options"> & {
    task: TaskBasis;
    waitId: string;
    expectedHistoryPosition: number;
  }
>;

// A retained basis can retry an identical control after the native child is
// replaced. The replacement still requires a fresh attachment to that session.
const observed = new WeakMap<NativeChatSnapshot, string>();
type TranscriptCapture = {
  messages: Map<string, NativeChatMessage>;
  bytes: number;
  overflow: boolean;
  result?: Promise<readonly NativeChatMessage[]>;
};

export class NativeAgentChat {
  private readonly attached = new Map<string, NativeChatSession>();
  private readonly loading = new Map<string, Promise<NativeChatSession>>();
  private readonly transcripts = new Map<string, TranscriptCapture>();
  private readonly unverifiedTranscripts = new Set<string>();
  private readonly questionReviews = new WeakSet<NativeQuestionReview>();
  private readonly listeners = new Map<
    string,
    Set<(update: NativeChatStreamUpdate) => void>
  >();
  private closed = false;

  get connected(): boolean {
    return !this.closed && this.process.connected;
  }

  get hasExited(): boolean {
    return this.process.hasExited;
  }

  private constructor(
    private readonly process: NativeAgentProcess,
    private readonly cwd: string,
    private readonly scope: string
  ) {}

  static async start({
    cwd,
    ...launch
  }: NativeAgentChatLaunch): Promise<NativeAgentChat> {
    if (
      !path.isAbsolute(cwd) ||
      (await fs.realpath(cwd)) !== cwd ||
      !(await fs.stat(cwd)).isDirectory() ||
      (launch.workspace !== undefined && launch.workspace.primary.path !== cwd)
    )
      throw new Error("native_chat_workspace_invalid");
    let client: NativeAgentChat | undefined;
    const process = await NativeAgentProcess.start({
      ...launch,
      capabilities: CAPABILITIES,
      onSessionUpdate: (params) => client?.publish(params),
    });
    client = new NativeAgentChat(
      process,
      cwd,
      JSON.stringify([launch.stateDirectory, cwd])
    );
    return client;
  }

  async list(cursor: string | null = null): Promise<NativeChatPage> {
    this.requireOpen();
    if (cursor !== null && !isCatalogCursor(cursor))
      throw new Error("native_chat_cursor_invalid");
    const result = object(
      await this.process.request("session/list", {
        cwd: this.cwd,
        ...(cursor === null ? {} : { cursor }),
      })
    );
    if (
      !Array.isArray(result.sessions) ||
      result.sessions.length > MAX_CATALOG_SESSIONS
    )
      throw invalidResponse();
    const sessionIds = result.sessions.map((entry: unknown) => {
      const session = object(entry);
      if (session.cwd !== this.cwd) throw invalidResponse();
      return identity(session.sessionId);
    });
    const nextCursor = result.nextCursor ?? null;
    if (
      new Set(sessionIds).size !== sessionIds.length ||
      (nextCursor !== null &&
        (!isCatalogCursor(nextCursor) ||
          nextCursor === cursor ||
          sessionIds.length === 0))
    )
      throw invalidResponse();
    return { sessionIds, nextCursor };
  }

  async create(): Promise<NativeChatSession> {
    this.requireOpen();
    const result = object(
      await this.process.request("session/new", {
        cwd: this.cwd,
        mcpServers: [],
      })
    );
    return this.attach(identity(result.sessionId));
  }

  async load(sessionId: string): Promise<NativeChatSession> {
    this.requireOpen();
    const id = identity(sessionId);
    const existing = this.attached.get(id);
    if (existing) return existing;
    const loading = this.loading.get(id);
    if (loading) return loading;
    const requested = this.process
      .request("session/load", {
        sessionId: id,
        cwd: this.cwd,
        mcpServers: [],
      })
      .then((reply) => {
        object(reply);
        return this.attach(id);
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          error.message === "native_agent_request_timeout"
        )
          this.unverifiedTranscripts.add(id);
        throw error;
      })
      .finally(() => this.loading.delete(id));
    this.loading.set(id, requested);
    return requested;
  }

  submit(
    session: NativeChatSession,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance> {
    return this.send("submit", session, inputId, text);
  }

  enqueue(
    session: NativeChatSession,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance> {
    return this.send("enqueue", session, inputId, text);
  }

  private async send(
    mode: "submit" | "enqueue",
    session: NativeChatSession,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    identity(inputId);
    if (
      typeof text !== "string" ||
      !text.trim() ||
      Buffer.byteLength(text) > MAX_TEXT_BYTES
    )
      throw new Error("native_chat_text_invalid");
    return acceptance(
      await this.process.request(`_co.grida/session/${mode}`, {
        sessionId,
        inputId,
        prompt: [{ type: "text", text }],
      }),
      sessionId,
      inputId
    );
  }

  async inputReceipt(
    session: NativeChatSession,
    inputId: string
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    const result = object(
      await this.process.request("_co.grida/session/input", {
        sessionId,
        inputId: identity(inputId),
      })
    );
    this.requireAttached(session);
    return acceptance(result.receipt, sessionId, inputId);
  }

  async observe(session: NativeChatSession): Promise<NativeChatSnapshot> {
    const sessionId = this.requireAttached(session);
    const result = object(
      await this.process.request("_co.grida/session/snapshot", { sessionId })
    );
    this.requireAttached(session);
    if (result.sessionId !== sessionId) throw invalidResponse();
    const snapshot = Object.freeze({
      sessionId,
      sessionRevision: revision(result.sessionRevision),
      queuedInputs: revision(result.queuedInputs),
      admissionPaused: flag(result.admissionPaused),
      current: result.current === null ? null : turn(result.current),
      latest: result.latest === null ? null : turn(result.latest),
    });
    observed.set(snapshot, this.scope);
    return snapshot;
  }

  async transcript(
    session: NativeChatSession
  ): Promise<readonly NativeChatMessage[]> {
    const id = this.requireAttached(session);
    if (this.unverifiedTranscripts.has(id))
      throw new Error("native_chat_transcript_delivery_unverified");
    const existing = this.transcripts.get(id)?.result;
    if (existing) return existing;
    const capture: TranscriptCapture = {
      messages: new Map(),
      bytes: 0,
      overflow: false,
    };
    this.transcripts.set(id, capture);
    capture.result = this.process
      .request("session/load", {
        sessionId: id,
        cwd: this.cwd,
        mcpServers: [],
      })
      .then((reply) => {
        object(reply);
        this.requireAttached(session);
        if (capture.overflow)
          throw new Error("native_chat_transcript_too_large");
        return [...capture.messages.values()];
      })
      .catch((error: unknown) => {
        // ACP replay chunks have no request ID. A timed-out replay can still
        // produce chunks on this connection, so it cannot be retried in place.
        if (
          error instanceof Error &&
          error.message === "native_agent_request_timeout"
        )
          this.unverifiedTranscripts.add(id);
        throw error;
      })
      .finally(() => this.transcripts.delete(id));
    return capture.result;
  }

  async approvals(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<readonly NativeApprovalReview[]> {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    const permissions = this.process.permissions;
    if (
      !permissions ||
      current?.disposition !== "suspended" ||
      current.paused ||
      current.cancelled
    )
      return [];
    const reviews = await permissions.list(sessionId, current.turnId);
    this.requireAttached(session);
    if (
      reviews.some(
        (review) =>
          review.sessionRevision !== snapshot.sessionRevision ||
          review.controlRevision !== current.controlRevision
      )
    )
      throw new Error("native_chat_approval_changed");
    return reviews;
  }

  async answerApproval(
    session: NativeChatSession,
    review: NativeApprovalReview,
    decision: NativeChatApprovalDecision
  ): Promise<NativeChatControlReceipt> {
    const sessionId = this.requireAttached(session);
    const permissions = this.process.permissions;
    if (!permissions || review.sessionId !== sessionId)
      throw new Error("native_chat_approval_unavailable");
    return permissions.answer(review, decision);
  }

  async questions(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<readonly NativeQuestionReview[]> {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    if (!current || current.cancelled) return [];
    const result = object(
      await this.process.request("_co.grida/session/questions", {
        sessionId,
        turnId: current.turnId,
      })
    );
    this.requireAttached(session);
    if (
      result.sessionId !== sessionId ||
      result.turnId !== current.turnId ||
      result.controlRevision !== current.controlRevision ||
      result.historyPosition !== current.historyPosition
    )
      throw new Error("native_chat_question_changed");
    if (!Array.isArray(result.questions)) throw invalidResponse();
    const reviews = result.questions.map((value: unknown) => {
      const entry = object(value);
      const waitId = identity(entry.waitId);
      const style = choice(entry.style, [
        "answer_dependent",
        "nonblocking",
      ] as const);
      const question = boundedText(entry.question, 2048);
      if (!Array.isArray(entry.options) || entry.options.length > 6)
        throw invalidResponse();
      const options = entry.options.map((option: unknown) =>
        boundedText(option, 256)
      );
      if (
        new Set(options.map((option) => option.trim())).size !== options.length
      )
        throw invalidResponse();
      const expectedHistoryPosition = current.historyPosition;
      const requestId = `desktop-question-${createHash("sha256")
        .update(
          JSON.stringify([
            sessionId,
            current.turnId,
            waitId,
            snapshot.sessionRevision,
            current.controlRevision,
            expectedHistoryPosition,
          ])
        )
        .digest("hex")}`;
      const { task } = this.task(session, snapshot, requestId);
      return Object.freeze({
        task: Object.freeze(task),
        waitId,
        expectedHistoryPosition,
        style,
        question,
        options: Object.freeze(options),
      });
    });
    if (new Set(reviews.map(({ waitId }) => waitId)).size !== reviews.length)
      throw invalidResponse();
    for (const review of reviews) this.questionReviews.add(review);
    return reviews;
  }

  async answerQuestion(
    session: NativeChatSession,
    review: NativeQuestionReview,
    answer: NativeChatQuestionAnswer
  ): Promise<NativeChatControlReceipt> {
    if (
      review.task.sessionId !== this.requireAttached(session) ||
      !this.questionReviews.has(review)
    )
      throw new Error("native_chat_question_unavailable");
    const result = await this.process.request(
      "_co.grida/session/answer-question",
      {
        ...review.task,
        waitId: review.waitId,
        expectedHistoryPosition: review.expectedHistoryPosition,
        answer,
      }
    );
    return controlReceipt(result, review.task);
  }

  pause(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatControlReceipt> {
    return this.control("pause", session, snapshot, requestId);
  }

  stop(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatControlReceipt> {
    return this.control("stop", session, snapshot, requestId);
  }

  async resume(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatTurn> {
    const { task, current } = this.task(session, snapshot, requestId);
    if (
      current.disposition !== "suspended" ||
      !current.paused ||
      current.cancelled
    )
      throw new Error("native_chat_verified_pause_required");
    const response = object(
      await this.process.request("_co.grida/session/resume", {
        task,
        expectedEpoch: current.epoch,
        expectedJournalPosition: current.journalPosition,
      })
    );
    const resumed = turn(response.turn);
    if (
      response.requestId !== requestId ||
      resumed.turnId !== task.turnId ||
      resumed.epoch <= current.epoch
    )
      throw invalidResponse();
    return resumed;
  }

  close(): Promise<void> {
    this.closed = true;
    this.attached.clear();
    this.listeners.clear();
    return this.process.close();
  }

  subscribe(
    session: NativeChatSession,
    listener: (update: NativeChatStreamUpdate) => void
  ): () => void {
    const id = this.requireAttached(session);
    let listeners = this.listeners.get(id);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size && this.listeners.get(id) === listeners)
        this.listeners.delete(id);
    };
  }

  private publish(params: unknown): void {
    try {
      const notification = object(params);
      const sessionId = identity(notification.sessionId);
      const listeners = this.listeners.get(sessionId);
      const capture = this.transcripts.get(sessionId);
      if (!listeners && !capture) return;
      const update = object(notification.update);
      const role =
        update.sessionUpdate === "agent_message_chunk"
          ? "assistant"
          : update.sessionUpdate === "user_message_chunk"
            ? "user"
            : null;
      if (!role) return;
      const content = object(update.content);
      if (
        content.type !== "text" ||
        typeof content.text !== "string" ||
        Buffer.byteLength(content.text) > MAX_UPDATE_BYTES
      )
        return;
      const meta = notification._meta
        ? object(notification._meta)["co.grida/session/updates"]
        : undefined;
      if (meta === undefined) {
        if (capture)
          captureText(capture, identity(update.messageId), role, content.text);
        return;
      }
      if (!listeners) return;
      const attribution = object(meta);
      const projected: NativeChatStreamUpdate =
        attribution.resyncRequired === true && content.text === ""
          ? Object.freeze({ kind: "resync" })
          : Object.freeze({
              kind: "text",
              role,
              text: content.text,
              messageId: identity(update.messageId),
              turnId: identity(attribution.turnId),
              offsetBytes: revision(attribution.offsetBytes),
              replace: flag(attribution.replace),
            });
      for (const listener of listeners) {
        try {
          listener(projected);
        } catch {
          /* Observers have independent lifetimes. */
        }
      }
    } catch {
      // Unknown or unattributed ACP events do not enter the renderer bridge.
    }
  }

  private async control(
    action: "pause" | "stop",
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatControlReceipt> {
    const { task } = this.task(session, snapshot, requestId);
    const result = await this.process.request(
      `_co.grida/session/${action}`,
      task
    );
    return controlReceipt(result, task);
  }

  private task(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): { task: TaskBasis; current: NativeChatTurn } {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    if (!current) throw new Error("native_chat_turn_observation_required");
    return {
      current,
      task: {
        sessionId,
        turnId: current.turnId,
        requestId: identity(requestId),
        expectedSessionRevision: snapshot.sessionRevision,
        expectedControlRevision: current.controlRevision,
      },
    };
  }

  private requireObservation(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): string {
    const sessionId = this.requireAttached(session);
    if (
      observed.get(snapshot) !== this.scope ||
      snapshot.sessionId !== sessionId
    )
      throw new Error("native_chat_turn_observation_required");
    return sessionId;
  }

  private attach(id: string): NativeChatSession {
    this.requireOpen();
    const existing = this.attached.get(id);
    if (existing) return existing;
    const session = Object.freeze({ id });
    this.attached.set(id, session);
    return session;
  }

  private requireAttached(session: NativeChatSession): string {
    this.requireOpen();
    if (this.attached.get(session.id) !== session)
      throw new Error("native_chat_attachment_required");
    return session.id;
  }

  private requireOpen(): void {
    if (this.closed) throw new Error("native_chat_closed");
  }
}

function captureText(
  capture: TranscriptCapture,
  messageId: string,
  role: NativeChatMessage["role"],
  text: string
): void {
  if (capture.overflow) return;
  const previous = capture.messages.get(messageId);
  capture.bytes += Buffer.byteLength(text);
  if (
    capture.bytes > MAX_TRANSCRIPT_BYTES ||
    (!previous && capture.messages.size >= MAX_TRANSCRIPT_MESSAGES)
  ) {
    capture.overflow = true;
    capture.messages.clear();
    return;
  }
  capture.messages.set(messageId, {
    messageId,
    role,
    text: (previous?.text ?? "") + text,
  });
}

function acceptance(
  value: unknown,
  sessionId: string,
  inputId: string
): NativeChatAcceptance {
  const result = object(value);
  if (result.sessionId !== sessionId || result.inputId !== inputId)
    throw invalidResponse();
  return Object.freeze({
    sessionId,
    inputId,
    inputPosition: revision(result.inputPosition),
    turnId: result.turnId === null ? null : identity(result.turnId),
    disposition: choice(result.disposition, INPUT_DISPOSITIONS),
    ...(result.replacementInputId === undefined
      ? {}
      : { replacementInputId: identity(result.replacementInputId) }),
  });
}

function turn(value: unknown): NativeChatTurn {
  const result = object(value);
  return Object.freeze({
    turnId: identity(result.turnId),
    epoch: revision(result.epoch),
    journalPosition: revision(result.journalPosition),
    historyPosition: revision(result.historyPosition),
    controlRevision: revision(result.controlRevision),
    paused: flag(result.paused),
    cancelled: flag(result.cancelled),
    disposition: choice(result.disposition, TURN_DISPOSITIONS),
    status:
      result.status === null ? null : choice(result.status, TURN_STATUSES),
  });
}

function controlReceipt(
  value: unknown,
  task: TaskBasis
): NativeChatControlReceipt {
  const result = object(value);
  const { sessionId, turnId, requestId } = task;
  if (
    result.sessionId !== sessionId ||
    result.turnId !== turnId ||
    result.requestId !== requestId
  )
    throw invalidResponse();
  return Object.freeze({
    sessionId,
    turnId,
    requestId,
    sessionRevision: revision(result.sessionRevision),
    journalPosition: revision(result.journalPosition),
  });
}

function boundedText(value: unknown, bytes: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > bytes
  )
    throw invalidResponse();
  return value;
}

function identity(value: unknown): string {
  if (typeof value !== "string" || !IDENTITY.test(value))
    throw invalidResponse();
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalidResponse();
  return value as Record<string, unknown>;
}

function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw invalidResponse();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const match = choices.find((candidate) => candidate === value);
  if (!match) throw invalidResponse();
  return match;
}

function invalidResponse(): Error {
  return new Error("native_chat_invalid_protocol_value");
}

function isCatalogCursor(value: unknown): value is string {
  return typeof value === "string" && CATALOG_CURSOR.test(value);
}
