import type {
  NativeChatActivity,
  NativeChatMessage,
  NativeChatTurn,
  NativeChatTurnRecord,
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
  export type Item =
    | Readonly<{ kind: "commentary"; message: NativeChatMessage }>
    | Readonly<{
        kind: "activity";
        key: string;
        calls: readonly NativeChatActivity[];
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
        /** Messages that opened the turn, shown before its header. */
        requests: readonly NativeChatMessage[];
        /** Running turns stay expanded; finished turns start collapsed. */
        finished: boolean;
        outcome: Outcome | null;
        durationMs: number | null;
        work: readonly Item[];
        answers: readonly NativeChatMessage[];
      }>;

  export type Current = Pick<NativeChatTurn, "turnId"> | null | undefined;

  export function group(
    messages: readonly NativeChatMessage[],
    records: readonly NativeChatTurnRecord[],
    current: Current,
    latest?: Pick<NativeChatTurn, "turnId" | "status"> | null
  ): Block[] {
    const known = new Map(records.map((record) => [record.turnId, record]));
    const order = new Map(records.map((record, at) => [record.turnId, at]));
    // Compaction turns add no messages; each is placed before the first
    // message of a later turn, in history order.
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
    let index = 0;
    while (index < messages.length) {
      const first = messages[index];
      const turnId = first.turnId;
      const position = turnId === undefined ? undefined : order.get(turnId);
      if (position !== undefined) placeCompactionsBefore(position);
      if (!turnId) {
        blocks.push({ kind: "message", message: first });
        index++;
        continue;
      }
      let end = index;
      while (end < messages.length && messages[end].turnId === turnId) end++;
      const members = messages.slice(index, end);
      index = end;
      // A turn the host recorded or classified is grouped, even when it
      // ended before any response. Otherwise there is nothing to collapse safely.
      if (
        !known.has(turnId) &&
        !members.some((message) => message.phase !== undefined)
      ) {
        for (const message of members)
          blocks.push({ kind: "message", message });
        continue;
      }
      let opening = 0;
      while (opening < members.length && members[opening].role === "user")
        opening++;
      const requests = members.slice(0, opening);
      const rest = members.slice(opening);
      const record = known.get(turnId);
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
        requests,
        finished,
        outcome,
        durationMs:
          record?.startedAtMs !== undefined && record.settledAtMs !== undefined
            ? record.settledAtMs - record.startedAtMs
            : null,
        work: items(rest.filter((message) => !answers.includes(message))),
        answers,
      });
    }
    placeCompactionsBefore(Number.POSITIVE_INFINITY);
    return blocks;
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
    ask: "asked a question",
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
