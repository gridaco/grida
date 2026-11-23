import { isSameDay } from "date-fns";
import type {
  NativeChatActivity,
  NativeChatMessage,
  NativeChatTurn,
  NativeChatTurnRecord,
  NativeSubagentLifecycleEvent,
} from "@grida/desktop-bridge";

/**
 * Groups a native transcript into per-turn presentation blocks.
 *
 * A finished turn collapses its commentary and tool activity beneath one
 * header and keeps its final answer visible. The host decides which message is
 * the final answer and how each tool is classified; this module only groups
 * recorded facts and words them. It performs no requests.
 *
 * See docs/wg/ai/agent/experience.md#read-each-finished-turn.
 */
export namespace turn_activity {
  const IDLE_DIVIDER_MS = 10 * 60 * 1000;

  export type Item =
    | Readonly<{ kind: "commentary"; message: NativeChatMessage }>
    | Readonly<{
        kind: "activity";
        key: string;
        calls: readonly NativeChatActivity[];
      }>;

  export type TimelineItem =
    | Item
    | Readonly<{
        kind: "subagent";
        key: string;
        event: NativeSubagentLifecycleEvent;
      }>;

  export type Timeline = Readonly<{
    work: readonly TimelineItem[];
    /** Facts without a comparable retained position stay visible outside the ordered work. */
    unplaced: readonly NativeSubagentLifecycleEvent[];
  }>;

  export type Outcome = NonNullable<NativeChatTurn["status"]>;

  export type Block =
    | Readonly<{ kind: "message"; message: NativeChatMessage }>
    /** Earlier context was summarized here; the turn added no messages. */
    | Readonly<{
        kind: "compaction";
        turnId: string;
        summary: string;
        automatic: boolean;
      }>
    | Readonly<{
        kind: "turn";
        turnId: string;
        /** Captured models of the neighboring turns at this boundary. */
        modelChange?: Readonly<{ from: string; to: string }>;
        /** Start time to show before this turn's opening request. */
        timeDividerAtMs?: number;
        /** Messages that opened the turn, shown before its header. */
        requests: readonly NativeChatMessage[];
        /** Running turns stay expanded; finished turns start collapsed. */
        finished: boolean;
        outcome: Outcome | null;
        durationMs: number | null;
        work: readonly Item[];
        answers: readonly NativeChatMessage[];
      }>;

  export type Current =
    | Pick<NativeChatTurn, "turnId" | "modelId">
    | null
    | undefined;

  export function group(
    messages: readonly NativeChatMessage[],
    records: readonly NativeChatTurnRecord[],
    current: Current,
    latest?: Pick<NativeChatTurn, "turnId" | "status" | "modelId"> | null,
    transcriptGapBefore?: string
  ): Block[] {
    const known = new Map(records.map((record) => [record.turnId, record]));
    const order = new Map(records.map((record, at) => [record.turnId, at]));
    // Place summaries before the next turn in history order. An inline
    // summary follows the visible turn that triggered it.
    const compactions = records.flatMap((record, at) =>
      record.compaction ? [{ at, record, compaction: record.compaction }] : []
    );
    const blocks: Block[] = [];
    const placeCompactionsBefore = (position: number) => {
      while (compactions.length && compactions[0].at < position) {
        const { record, compaction } = compactions.shift()!;
        blocks.push({
          kind: "compaction",
          turnId: record.turnId,
          summary: compaction.summary,
          automatic: compaction.automatic,
        });
      }
    };
    let previousModel: string | undefined;
    let previousTurn: NativeChatTurnRecord | undefined;
    let index = 0;
    while (index < messages.length) {
      const first = messages[index];
      if (first.messageId === transcriptGapBefore) {
        previousModel = undefined;
        previousTurn = undefined;
      }
      const turnId = first.turnId;
      const position = turnId === undefined ? undefined : order.get(turnId);
      if (position !== undefined) placeCompactionsBefore(position);
      if (!turnId) {
        previousModel = undefined;
        previousTurn = undefined;
        blocks.push({ kind: "message", message: first });
        index++;
        continue;
      }
      let end = index;
      while (end < messages.length && messages[end].turnId === turnId) end++;
      const members = messages.slice(index, end);
      index = end;
      const record = known.get(turnId);
      const precedingTurn = previousTurn;
      previousTurn = record;
      const observed =
        current?.turnId === turnId
          ? current
          : latest?.turnId === turnId
            ? latest
            : undefined;
      const model = record?.modelId ?? observed?.modelId;
      const modelChange =
        previousModel !== undefined &&
        model !== undefined &&
        previousModel !== model
          ? { from: previousModel, to: model }
          : undefined;
      previousModel = model;
      // A turn the host recorded or classified is grouped, even when it
      // ended before any response. Otherwise there is nothing to collapse safely.
      if (
        !record &&
        model === undefined &&
        !members.some((message) => message.phase !== undefined)
      ) {
        for (const message of members)
          blocks.push({ kind: "message", message });
        continue;
      }
      let opening = 0;
      // A window may start at a question reply, after the call that asked it.
      while (
        opening < members.length &&
        members[opening].role === "user" &&
        !members[opening].questionReply &&
        !members[opening].questionReplies
      )
        opening++;
      const requests = members.slice(0, opening);
      const rest = members.slice(opening);
      const showTimeDivider =
        requests.length > 0 &&
        record &&
        precedingTurn &&
        startsNewTimeGroup(precedingTurn, record.startedAtMs);
      const outcome =
        record?.status ??
        (latest?.turnId === turnId ? (latest.status ?? null) : null);
      const finished = current?.turnId !== turnId && outcome !== null;
      // A running turn reads in order: a reply kept from before a pause must
      // not jump below the text streaming after it.
      const answers = finished
        ? rest.filter(
            (message) =>
              message.role === "assistant" && message.phase === "answer"
          )
        : [];
      blocks.push({
        kind: "turn",
        turnId,
        ...(modelChange && { modelChange }),
        ...(showTimeDivider && { timeDividerAtMs: record.startedAtMs }),
        requests,
        finished,
        outcome,
        durationMs:
          record?.settledAtMs !== undefined
            ? record.settledAtMs - record.startedAtMs
            : null,
        work: items(rest.filter((message) => !answers.includes(message))),
        answers,
      });
    }
    placeCompactionsBefore(Number.POSITIVE_INFINITY);
    return blocks;
  }

  function startsNewTimeGroup(previous: NativeChatTurnRecord, atMs: number) {
    if (atMs < previous.startedAtMs) return false;
    return (
      !isSameDay(atMs, previous.startedAtMs) ||
      (previous.settledAtMs !== undefined &&
        atMs - previous.settledAtMs >= IDLE_DIVIDER_MS)
    );
  }

  /**
   * The latest reported foreground context and the window captured with it.
   * Old standalone compaction records can contain the summary model's usage.
   */
  export function measuredContext(
    records: readonly NativeChatTurnRecord[]
  ): { tokens: number; window?: number } | undefined {
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index];
      if (
        record.contextTokens !== undefined &&
        (!record.compaction || record.modelId !== undefined)
      )
        return {
          tokens: record.contextTokens,
          window: record.contextWindowTokens,
        };
      if (record.compaction) return undefined;
    }
    return undefined;
  }

  /** Commentary in order, with consecutive tool calls joined into one line. */
  export function items(messages: readonly NativeChatMessage[]): Item[] {
    const result: Item[] = [];
    for (const message of messages) {
      if (message.text.trim()) result.push({ kind: "commentary", message });
      if (!message.activity?.length) continue;
      const last = result.at(-1);
      if (last?.kind === "activity")
        result[result.length - 1] = {
          ...last,
          calls: [...last.calls, ...message.activity],
        };
      else
        result.push({
          kind: "activity",
          key: message.activity[0].callId,
          calls: message.activity,
        });
    }
    return result;
  }

  /**
   * Merge first-publication facts before the final grouping of consecutive
   * calls. Inputs may contain earlier groups; each call keeps its own order.
   * No clock or transport-arrival observation can supply a missing position.
   */
  export function merge(
    work: readonly Item[],
    events: readonly NativeSubagentLifecycleEvent[],
    turnId: string
  ): Timeline {
    type Atom = Readonly<{
      key: string;
      order: number | undefined;
      item:
        | Extract<Item, { kind: "commentary" }>
        | Readonly<{ kind: "call"; call: NativeChatActivity }>;
    }>;
    const parent = new Map<string, Atom>();
    let parentConflict = false;
    const put = (atom: Atom) => {
      const previous = parent.get(atom.key);
      if (
        previous?.order !== undefined &&
        atom.order !== undefined &&
        previous.order !== atom.order
      )
        parentConflict = true;
      if (
        atom.item.kind === "commentary" &&
        atom.item.message.turnId !== turnId
      )
        parentConflict = true;
      parent.set(atom.key, { ...atom, order: previous?.order ?? atom.order });
    };
    for (const item of work) {
      if (item.kind === "commentary") {
        put({
          key: `message:${item.message.messageId}`,
          order:
            item.message.turnId === turnId ? order(item.message) : undefined,
          item,
        });
      } else {
        for (const call of item.calls)
          put({
            key: `call:${call.callId}`,
            order: order(call),
            item: { kind: "call", call },
          });
      }
    }
    const parentOrders = [...parent.values()].map((atom) => atom.order);
    const parentComplete =
      !parentConflict &&
      parentOrders.every((value) => value !== undefined) &&
      new Set(parentOrders).size === parentOrders.length;
    const children = new Map<string, NativeSubagentLifecycleEvent>();
    const conflicts = new Set<string>();
    for (const event of events) {
      const previous = children.get(event.eventId);
      if (
        previous &&
        ((order(previous) !== undefined &&
          order(event) !== undefined &&
          previous.activityOrder !== event.activityOrder) ||
          previous.childId !== event.childId ||
          previous.parentTurnId !== event.parentTurnId ||
          previous.inputId !== event.inputId ||
          previous.kind !== event.kind ||
          previous.childTurnId !== event.childTurnId)
      )
        conflicts.add(event.eventId);
      children.set(event.eventId, {
        ...event,
        activityOrder: (previous && order(previous)) ?? order(event),
      });
    }
    const candidates = [...children.values()].filter(
      (event) =>
        event.parentTurnId === turnId &&
        order(event) !== undefined &&
        !conflicts.has(event.eventId)
    );
    const eventOrders = new Map<number, number>();
    for (const event of candidates)
      eventOrders.set(
        event.activityOrder!,
        (eventOrders.get(event.activityOrder!) ?? 0) + 1
      );
    const occupied = new Set(parentOrders);
    const placed = parentComplete
      ? candidates.filter(
          (event) =>
            !occupied.has(event.activityOrder) &&
            eventOrders.get(event.activityOrder!) === 1
        )
      : [];
    const placedIds = new Set(placed.map((event) => event.eventId));
    const unplaced = [...children.values()]
      .filter((event) => !placedIds.has(event.eventId))
      .sort((a, b) => a.atMs - b.atMs || a.eventId.localeCompare(b.eventId));
    const atoms: (
      | Atom
      | Readonly<{
          key: string;
          order: number;
          item: Extract<TimelineItem, { kind: "subagent" }>;
        }>
    )[] = [
      ...parent.values(),
      ...placed.map((event) => ({
        key: event.eventId,
        order: event.activityOrder!,
        item: { kind: "subagent" as const, key: event.eventId, event },
      })),
    ];
    if (parentComplete) atoms.sort((a, b) => a.order! - b.order!);
    const result: TimelineItem[] = [];
    for (const { item } of atoms) {
      if (item.kind !== "call") {
        result.push(item);
        continue;
      }
      const last = result.at(-1);
      if (last?.kind === "activity")
        result[result.length - 1] = {
          ...last,
          calls: [...last.calls, item.call],
        };
      else
        result.push({
          kind: "activity",
          key: item.call.callId,
          calls: [item.call],
        });
    }
    return { work: result, unplaced };
  }

  function order(value: {
    activityOrder?: number;
    activityOrderIncomplete?: true;
  }): number | undefined {
    return !value.activityOrderIncomplete &&
      Number.isSafeInteger(value.activityOrder) &&
      value.activityOrder! > 0
      ? value.activityOrder
      : undefined;
  }

  const PHRASE: Record<
    Exclude<NativeChatActivity["kind"], "integration">,
    string
  > = {
    read: "read files",
    search: "searched",
    edit: "edited files",
    execute: "ran commands",
    generate: "generated images",
    delegate: "delegated work",
    ask: "asked you",
    other: "used tools",
  };

  /** A short description of what consecutive calls did, in first-use order. */
  export function describe(calls: readonly NativeChatActivity[]): string {
    const phrases: string[] = [];
    for (const call of calls) {
      const phrase =
        call.kind === "integration"
          ? `used ${call.source ?? "an"} integration`
          : PHRASE[call.kind];
      if (!phrases.includes(phrase)) phrases.push(phrase);
    }
    const sentence = phrases.join(", ");
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  /** Calls that did not succeed and are no longer running. */
  export function unsuccessful(calls: readonly NativeChatActivity[]): number {
    return calls.filter(
      (call) => call.outcome !== "succeeded" && call.outcome !== "running"
    ).length;
  }

  /**
   * Whether a finished turn shows its header. A turn that finished normally
   * with nothing but its answer needs none; any recorded work, or an outcome
   * other than success, keeps it.
   */
  export function showsHeader(
    block: Pick<
      Extract<Block, { kind: "turn" }>,
      "finished" | "work" | "outcome"
    >
  ): boolean {
    return (
      block.finished &&
      (block.work.length > 0 ||
        block.outcome === "cancelled" ||
        block.outcome === "failed" ||
        block.outcome === "uncertain")
    );
  }

  export function header(
    outcome: Outcome | null,
    durationMs: number | null
  ): string {
    const elapsed = durationMs === null ? null : duration(durationMs);
    switch (outcome) {
      case "cancelled":
        return "You stopped";
      case "failed":
        return elapsed ? `Failed after ${elapsed}` : "Failed";
      case "uncertain":
        return `${elapsed ? `Worked for ${elapsed}` : "Worked"} · result uncertain`;
      default:
        return elapsed ? `Worked for ${elapsed}` : "Worked";
    }
  }

  export function duration(milliseconds: number): string {
    const total = Math.floor(Math.max(0, milliseconds) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return seconds === 0 ? "<1s" : `${seconds}s`;
  }
}
