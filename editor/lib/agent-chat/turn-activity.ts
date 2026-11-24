import { isSameDay } from "date-fns";
import type {
  NativeChatActivity,
  NativeChatCompaction,
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
    | Readonly<{ kind: "compaction"; compaction: NativeChatCompaction }>
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
    /** Standalone compaction settled without adding a user or agent message. */
    | Readonly<{
        kind: "compaction";
        turnId: string;
        compactionId: string;
        summary?: string;
        failed?: true;
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
    const turnsWithMessages = new Set(
      messages.map((message) => message.turnId)
    );
    // Standalone compaction has no messages in its turn.
    const compactions = records.flatMap((record, at) =>
      turnsWithMessages.has(record.turnId)
        ? []
        : completedCompactions(record, true).map((compaction) => ({
            at,
            record,
            compaction,
          }))
    );
    const blocks: Block[] = [];
    const placeCompactionsBefore = (position: number) => {
      while (compactions.length && compactions[0].at < position) {
        const { record, compaction } = compactions.shift()!;
        blocks.push({
          kind: "compaction",
          turnId: record.turnId,
          compactionId: compaction.id,
          summary: compaction.summary,
          ...(compaction.status === "failed" && { failed: true }),
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
      // The currently observed turn may stream messages before its first page.
      else if (turnId !== undefined && current?.turnId === turnId)
        placeCompactionsBefore(Number.POSITIVE_INFINITY);
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
        work: [
          ...items(rest.filter((message) => !answers.includes(message))),
          ...completedCompactions(record).map((compaction) => ({
            kind: "compaction" as const,
            compaction,
          })),
        ],
        answers,
      });
    }
    placeCompactionsBefore(Number.POSITIVE_INFINITY);
    return blocks;
  }

  function completedCompactions(
    record: NativeChatTurnRecord | undefined,
    includeManualFailures = false
  ): NativeChatCompaction[] {
    if (record?.compactions?.length)
      return record.compactions.filter(
        (item) =>
          item.status === "succeeded" ||
          (includeManualFailures && !item.automatic && item.status === "failed")
      );
    return record?.compaction
      ? [{ ...record.compaction, id: record.turnId, status: "succeeded" }]
      : [];
  }

  /** A received start can precede the first observation of that turn. */
  export function compacting(
    records: readonly NativeChatTurnRecord[],
    current:
      | Pick<NativeChatTurn, "turnId" | "disposition" | "paused" | "cancelled">
      | null
      | undefined,
    pausing?: string | null
  ): boolean {
    if (
      current &&
      (current.disposition !== "running" ||
        current.paused ||
        current.cancelled ||
        current.turnId === pausing)
    )
      return false;
    return records.some(
      (record) =>
        record.status === null &&
        (!current || record.turnId === current.turnId) &&
        record.compactions?.some((item) => item.status === "running")
    );
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
      const compacted = record.compactions?.length
        ? record.compactions.some((item) => item.status === "succeeded")
        : Boolean(record.compaction);
      if (
        record.contextTokens !== undefined &&
        (!compacted || record.modelId !== undefined)
      )
        return {
          tokens: record.contextTokens,
          window: record.contextWindowTokens,
        };
      if (compacted) return undefined;
    }
    return undefined;
  }

  /** Commentary in order, with consecutive tool calls joined into one line. */
  export function items(messages: readonly NativeChatMessage[]): Item[] {
    const result: Item[] = [];
    for (const message of messages) {
      if (
        message.text.trim() ||
        (message.role === "user" && message.attachments?.length)
      )
        result.push({ kind: "commentary", message });
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

  type ParentAtom = Readonly<{
    key: string;
    order: number | undefined;
    item:
      | Extract<Item, { kind: "commentary" | "compaction" }>
      | Readonly<{ kind: "call"; call: NativeChatActivity }>;
  }>;

  function anchorCompactions(atoms: readonly ParentAtom[]): ParentAtom[] {
    const ordinary = atoms.filter(({ item }) => item.kind !== "compaction");
    const markers = atoms
      .filter(({ item }) => item.kind === "compaction")
      .sort((a, b) => a.order! - b.order!);
    const insertions = new Map<number, ParentAtom[]>();
    for (const marker of markers) {
      const preceding = ordinary.findLastIndex(
        ({ order }) => order !== undefined && order < marker.order!
      );
      const following = ordinary.findIndex(
        ({ order }) => order !== undefined && order > marker.order!
      );
      const index =
        following > preceding
          ? following
          : following === -1 && preceding >= 0
            ? preceding + 1
            : ordinary.length;
      const at = insertions.get(index) ?? [];
      at.push(marker);
      insertions.set(index, at);
    }
    return [
      ...ordinary.flatMap((atom, index) => [
        ...(insertions.get(index) ?? []),
        atom,
      ]),
      ...(insertions.get(ordinary.length) ?? []),
    ];
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
    const parent = new Map<string, ParentAtom>();
    const unplacedCompactions = new Map<
      string,
      Extract<Item, { kind: "compaction" }>
    >();
    let parentConflict = false;
    const put = (atom: ParentAtom) => {
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
      } else if (item.kind === "compaction") {
        const { compaction } = item;
        const position = order(compaction);
        if (position !== undefined)
          put({ key: `compaction:${compaction.id}`, order: position, item });
        else unplacedCompactions.set(compaction.id, item);
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
    const knownOrders = parentOrders.filter(
      (position) => position !== undefined
    );
    const parentComparable =
      !parentConflict && new Set(knownOrders).size === knownOrders.length;
    const parentComplete =
      parentComparable && knownOrders.length === parentOrders.length;
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
    let parentAtoms = [...parent.values()];
    // A missing position for later work can leave a known compaction without
    // a globally sortable timeline. Its comparable neighbours can still place it.
    if (
      !parentComplete &&
      parentComparable &&
      parentAtoms.some(({ item }) => item.kind === "compaction")
    )
      parentAtoms = anchorCompactions(parentAtoms);
    const atoms: (
      | ParentAtom
      | Readonly<{
          key: string;
          order: number;
          item: Extract<TimelineItem, { kind: "subagent" }>;
        }>
    )[] = [
      ...parentAtoms,
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
    for (const [id, item] of unplacedCompactions)
      if (!parent.has(`compaction:${id}`)) result.push(item);
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
