// GRIDA-SEC-004 — read-only child projection and attachment-bound continuations.
import { randomUUID } from "node:crypto";
import type {
  NativeChatActivity,
  NativeSubagentActivityPage,
  NativeSubagentConversation,
  NativeSubagentConversationMessage,
  NativeSubagentConversationTurn,
  NativeSubagentExecution,
  NativeSubagentLifecycleEvent,
  NativeSubagentStatus,
  NativeSubagentSummary,
} from "@grida/desktop-bridge";
import type { NativeChatSession } from "./native-agent-chat";
import { NativeAgentHistory } from "./native-agent-history";
import { NativeActivityOrder } from "./native-activity-order";

const { object, identity, revision } = NativeAgentHistory;
const CHILD_PAGE = 32;
const COUNT_SCAN = 512;
const EVENT_LIMIT = CHILD_PAGE * 8 * 2;
const RECORD_LIMIT = 128;
const TURN_LIMIT = 32;
const TEXT_LIMIT = 64 * 1024;
const VISIBLE_LIMIT = 256 * 1024;
const RESPONSE_LIMIT = 768 * 1024;
const CURSOR_LIMIT = 64;
const NATIVE_CURSOR_BYTES = 4096;
const STATUSES: readonly NativeSubagentStatus[] = [
  "ready",
  "queued",
  "running",
  "paused",
  "interrupted",
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
];
const SETTLED = ["succeeded", "failed", "cancelled", "uncertain"] as const;
const EFFORTS = ["low", "medium", "high", "xhigh", "ultra"] as const;
const ACTIVITY_KINDS: readonly NativeChatActivity["kind"][] = [
  "read",
  "search",
  "edit",
  "execute",
  "generate",
  "integration",
  "delegate",
  "ask",
  "other",
];
const ACTIVITY_OUTCOMES: readonly NativeChatActivity["outcome"][] = [
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
];

type Cursor = Readonly<{
  parent: NativeChatSession;
  childId: string;
  before: string;
}>;

/** Rich observations do not share child control tokens or normal chat loading. */
export class NativeSubagentActivity {
  static readonly capability = "co.grida/subagent/activity";
  static readonly activityMethod = "_co.grida/subagent/activity";
  static readonly conversationMethod = "_co.grida/subagent/conversation";
  private readonly cursors = new WeakMap<object, Map<string, Cursor>>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>,
    private readonly activityOrderAvailable: () => boolean = () => false
  ) {}

  async activity(
    parent: NativeChatSession,
    afterChildId: string | undefined,
    check: () => void
  ): Promise<NativeSubagentActivityPage> {
    if (afterChildId !== undefined && !identity(afterChildId))
      throw invalidInput();
    check();
    const response = boundedResponse(
      await this.request(NativeSubagentActivity.activityMethod, {
        parentSessionId: parent.id,
        ...(afterChildId !== undefined && { afterChildId }),
      })
    );
    check();
    if (response.parentSessionId !== parent.id) throw invalidResponse();
    const children = array(response.children, CHILD_PAGE).map(summary);
    unique(children.map((child) => child.childId));
    if (
      children.some(
        (child) => child.childId === parent.id || child.childId === afterChildId
      )
    )
      throw invalidResponse();
    const next = response.nextAfterChildId;
    if (
      next !== null &&
      (!identity(next) ||
        children.length !== CHILD_PAGE ||
        next !== children.at(-1)?.childId)
    )
      throw invalidResponse();
    const counts = record(response.counts);
    const active = integer(counts.active);
    const done = integer(counts.done);
    const complete = flag(counts.complete);
    if (active + done > COUNT_SCAN) throw invalidResponse();
    // Counts may be cached while the catalog page already contains a new child.
    // They describe their own observedAtMs, not an atomic snapshot of these rows.
    const byChild = new Map(children.map((child) => [child.childId, child]));
    const ordered = this.activityOrderAvailable();
    const events = array(response.events, EVENT_LIMIT).map((value) =>
      event(value, byChild, ordered)
    );
    unique(events.map((entry) => entry.eventId));
    const orderComplete = ordered ? flag(response.orderComplete) : undefined;
    if (
      orderComplete === true &&
      events.some((entry) => entry.activityOrder === undefined)
    )
      throw invalidResponse();
    return Object.freeze({
      children: Object.freeze(children),
      nextAfterChildId: next as string | null,
      counts: Object.freeze({ active, done, complete }),
      observedAtMs: integer(response.observedAtMs),
      events: Object.freeze(events),
      eventsComplete: flag(response.eventsComplete),
      ...(orderComplete !== undefined && { orderComplete }),
    });
  }

  async conversation(
    attachment: object,
    parent: NativeChatSession,
    childId: string,
    before: string | undefined,
    check: () => void
  ): Promise<NativeSubagentConversation> {
    if (
      !identity(childId) ||
      childId === parent.id ||
      (before !== undefined && typeof before !== "string")
    )
      throw invalidInput();
    check();
    const cursor =
      before === undefined
        ? undefined
        : this.cursors.get(attachment)?.get(before);
    if (
      before !== undefined &&
      (!cursor || cursor.parent !== parent || cursor.childId !== childId)
    )
      throw new Error("native_chat_subagent_cursor_unavailable");
    const response = boundedResponse(
      await this.request(NativeSubagentActivity.conversationMethod, {
        parentSessionId: parent.id,
        childId,
        ...(cursor && { before: cursor.before }),
      })
    );
    check();
    if (response.parentSessionId !== parent.id || response.childId !== childId)
      throw invalidResponse();
    const turns = array(response.turns, TURN_LIMIT).map(turnRecord);
    unique(turns.map((turn) => turn.turnId));
    const messages = array(response.messages, RECORD_LIMIT).map((entry) =>
      message(entry, this.activityOrderAvailable())
    );
    unique(messages.map((entry) => entry.messageId));
    const knownTurns = new Set(turns.map((turn) => turn.turnId));
    if (
      messages.some(
        (entry) => entry.turnId !== undefined && !knownTurns.has(entry.turnId)
      )
    )
      throw invalidResponse();
    // Activity previews have separate per-field and whole-response limits.
    // The replay text budget applies to conversational message text only.
    let visibleBytes = 0;
    for (const entry of messages) {
      visibleBytes += Buffer.byteLength(entry.text);
    }
    if (visibleBytes > VISIBLE_LIMIT) throw invalidResponse();
    const live = record(response.live);
    const available = flag(live.available),
      truncated = flag(live.truncated);
    if (!available && messages.some((entry) => entry.live))
      throw invalidResponse();
    let older: string | null = null;
    if (response.older !== null) {
      const native = text(response.older, NATIVE_CURSOR_BYTES, false);
      if (native === cursor?.before) throw invalidResponse();
      older = this.remember(attachment, { parent, childId, before: native });
    }
    return Object.freeze({
      childId,
      name: name(response.name),
      kind: choice(response.kind, ["named", "review"] as const),
      view: integer(response.view),
      messages: Object.freeze(messages),
      turns: Object.freeze(turns),
      execution:
        response.execution === null ? null : execution(response.execution),
      older,
      live: Object.freeze({ available, truncated }),
      observedAtMs: integer(response.observedAtMs),
    });
  }

  private remember(attachment: object, cursor: Cursor): string {
    let values = this.cursors.get(attachment);
    if (!values) this.cursors.set(attachment, (values = new Map()));
    for (const [token, held] of values) {
      if (
        held.parent === cursor.parent &&
        held.childId === cursor.childId &&
        held.before === cursor.before
      )
        return token;
    }
    if (values.size >= CURSOR_LIMIT) values.delete(values.keys().next().value!);
    const token = randomUUID();
    values.set(token, cursor);
    return token;
  }
}

function summary(value: unknown): NativeSubagentSummary {
  const row = record(value);
  const status = choice(row.status, STATUSES);
  const section = choice(row.section, ["active", "done"] as const);
  if (
    section === "done" &&
    status !== "succeeded" &&
    status !== "failed" &&
    status !== "cancelled"
  )
    throw invalidResponse();
  return Object.freeze({
    childId: id(row.childId),
    name: name(row.name),
    kind: choice(row.kind, ["named", "review"] as const),
    status,
    section,
    ...(row.updatedAtMs !== undefined && {
      updatedAtMs: integer(row.updatedAtMs),
    }),
    ...(row.latestTurnId !== undefined && {
      latestTurnId: id(row.latestTurnId),
    }),
  });
}

function event(
  value: unknown,
  children: ReadonlyMap<string, NativeSubagentSummary>,
  ordered: boolean
): NativeSubagentLifecycleEvent {
  const row = record(value);
  const childId = id(row.childId),
    child = children.get(childId);
  const eventName = name(row.name);
  const kind = choice(row.kind, ["started", "finished"] as const);
  if (
    !child ||
    child.name !== eventName ||
    (kind === "started" && row.status !== undefined)
  )
    throw invalidResponse();
  const activityOrder = ordered
    ? NativeActivityOrder.coordinate(row.activityOrder)
    : undefined;
  return Object.freeze({
    eventId: text(row.eventId, 1024, false),
    childId,
    name: eventName,
    kind,
    childTurnId: id(row.childTurnId),
    parentTurnId: id(row.parentTurnId),
    inputId: id(row.inputId),
    atMs: integer(row.atMs),
    ...(activityOrder !== undefined && { activityOrder }),
    ...(row.status !== undefined && { status: choice(row.status, SETTLED) }),
  });
}

function execution(value: unknown): NativeSubagentExecution {
  const row = record(value);
  return Object.freeze({
    model: row.model === null ? null : text(row.model, 1024, false),
    effort: row.effort === null ? null : choice(row.effort, EFFORTS),
  });
}

function turnRecord(value: unknown): NativeSubagentConversationTurn {
  const row = record(value);
  const status = row.status === null ? null : choice(row.status, SETTLED);
  const startedAtMs = integer(row.startedAtMs);
  const settledAtMs =
    row.settledAtMs === undefined ? undefined : integer(row.settledAtMs);
  if (settledAtMs !== undefined && settledAtMs < startedAtMs)
    throw invalidResponse();
  let compaction: NativeSubagentConversationTurn["compaction"];
  if (row.compaction !== undefined) {
    const detail = record(row.compaction);
    compaction = Object.freeze({
      summary: text(detail.summary, TEXT_LIMIT),
      automatic: flag(detail.automatic),
    });
  }
  if (row.goalStart !== undefined && row.goalStart !== true)
    throw invalidResponse();
  return Object.freeze({
    turnId: id(row.turnId),
    status,
    startedAtMs,
    execution: execution(row.execution),
    ...(settledAtMs !== undefined && { settledAtMs }),
    ...(row.contextTokens !== undefined && {
      contextTokens: integer(row.contextTokens),
    }),
    ...(row.goalStart === true && { goalStart: true as const }),
    ...(compaction && { compaction }),
  });
}

function message(
  value: unknown,
  ordered: boolean
): NativeSubagentConversationMessage {
  const row = record(value);
  const role = choice(row.role, ["user", "assistant"] as const);
  if (
    (row.phase !== undefined && role !== "assistant") ||
    (row.live !== undefined && (row.live !== true || role !== "assistant")) ||
    (row.truncated !== undefined && row.truncated !== true)
  )
    throw invalidResponse();
  const activity =
    row.activity === undefined
      ? undefined
      : array(row.activity, 16).map((entry) => toolActivity(entry, ordered));
  if (activity) unique(activity.map((entry) => entry.callId));
  if (role === "user" && activity?.length) throw invalidResponse();
  return Object.freeze({
    messageId: id(row.messageId),
    role,
    text: text(row.text, TEXT_LIMIT),
    ...NativeActivityOrder.read(
      row,
      ordered,
      typeof row.text === "string" && row.text.length > 0
    ),
    ...(row.turnId !== undefined && { turnId: id(row.turnId) }),
    ...(row.phase !== undefined && {
      phase: choice(row.phase, ["answer", "progress"] as const),
    }),
    ...(activity && { activity: Object.freeze(activity) }),
    ...(row.live === true && { live: true as const }),
    ...(row.truncated === true && { truncated: true as const }),
  });
}

function toolActivity(value: unknown, ordered: boolean): NativeChatActivity {
  const row = record(value);
  const kind = choice(row.kind, ACTIVITY_KINDS);
  if (row.source !== undefined && kind !== "integration")
    throw invalidResponse();
  const input = row.input === undefined ? undefined : jsonDetail(row.input);
  let output: NativeChatActivity["output"];
  if (row.output !== undefined) {
    const detail = record(row.output);
    const structured =
      detail.structured === undefined
        ? undefined
        : jsonDetail(detail.structured);
    output = Object.freeze({
      text: text(detail.text, TEXT_LIMIT),
      truncated: flag(detail.truncated),
      ...(structured !== undefined && { structured }),
    });
  }
  return Object.freeze({
    callId: id(row.callId),
    title: id(row.title),
    kind,
    outcome: choice(row.outcome, ACTIVITY_OUTCOMES),
    ...NativeActivityOrder.read(row, ordered, true),
    ...(row.source !== undefined && { source: id(row.source) }),
    ...(input !== undefined && { input }),
    ...(output && { output }),
  });
}

function jsonDetail(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized) > TEXT_LIMIT)
    throw invalidResponse();
  return JSON.parse(serialized);
}

function boundedResponse(value: unknown): Record<string, unknown> {
  const row = record(value);
  if (Buffer.byteLength(JSON.stringify(row)) > RESPONSE_LIMIT)
    throw invalidResponse();
  return row;
}

function record(value: unknown): Record<string, unknown> {
  const row = object(value);
  if (!row) throw invalidResponse();
  return row;
}

function id(value: unknown): string {
  if (!identity(value)) throw invalidResponse();
  return value;
}

function integer(value: unknown): number {
  if (!revision(value)) throw invalidResponse();
  return value;
}

function name(value: unknown): string {
  const result = text(value, 128, false);
  if (result.trim() !== result || /\p{Cc}/u.test(result))
    throw invalidResponse();
  return result;
}

function text(value: unknown, bytes: number, empty = true): string {
  if (
    typeof value !== "string" ||
    (!empty && !value) ||
    Buffer.byteLength(value) > bytes
  )
    throw invalidResponse();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function choice<const T extends string>(
  value: unknown,
  choices: readonly T[]
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw invalidResponse();
  return value as T;
}

function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw invalidResponse();
  return value;
}

function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw invalidResponse();
}

function invalidInput(): Error {
  return new Error("native_chat_subagent_invalid_input");
}

function invalidResponse(): Error {
  return new Error("native_chat_subagent_invalid_response");
}
