/**
 * Compaction boundary (RFC `session / compaction`).
 *
 * After a compaction, the conversation log stays **linear and complete** — the
 * summarized turns are not hidden or deleted. What the *model* sees is computed
 * at read-time from the latest `data-compaction` marker: its `tail_start_id`
 * names the first message kept verbatim, and everything before it is replaced
 * by the summary. A `null` `tail_start_id` means the compaction summarized
 * everything up to its own point (no verbatim tail) — a manual `/compact`.
 *
 * The marker is stamped at the moment of compaction, so it sorts **last** in
 * creation order (the bottom of the transcript, where the user invoked it).
 *
 * This is the single source of truth for "where does the compacted context
 * begin"; both the model-view assembler (`runtime/message-view.ts`) and the
 * token rollup (`session/store.ts`) resolve the boundary through it so they can
 * never disagree.
 */

import type { ChatMessageWithParts } from "./rows";

export type CompactionBoundary = {
  /** Array index of the latest `data-compaction` (summary) message. */
  index: number;
  /**
   * Id of the first message kept verbatim after the summary, or `null` when
   * the compaction summarized everything (no verbatim tail — manual compact).
   */
  tail_start_id: string | null;
  summary: string;
  summary_tokens: number;
};

/** Read the `data-compaction` payload off a message, if it carries one. */
export function readCompactionPart(m: ChatMessageWithParts): {
  summary: string;
  tail_start_id: string | null;
  summary_tokens: number;
} | null {
  for (const part of m.parts) {
    if (part.type !== "data-compaction") continue;
    const data = (
      part.data as {
        data?: {
          summary?: unknown;
          tail_start_id?: unknown;
          summary_tokens?: unknown;
        };
      } | null
    )?.data;
    if (data && typeof data.summary === "string") {
      return {
        summary: data.summary,
        tail_start_id:
          typeof data.tail_start_id === "string" ? data.tail_start_id : null,
        summary_tokens:
          typeof data.summary_tokens === "number" ? data.summary_tokens : 0,
      };
    }
  }
  return null;
}

/**
 * Locate the latest compaction in a creation-ordered message list. Returns
 * `null` when the session has never been compacted. Scans from the end so
 * chained compactions resolve to the single most-recent boundary.
 */
export function compactionBoundary(
  messages: ChatMessageWithParts[]
): CompactionBoundary | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const part = readCompactionPart(messages[i]);
    if (part) {
      return {
        index: i,
        tail_start_id: part.tail_start_id,
        summary: part.summary,
        summary_tokens: part.summary_tokens,
      };
    }
  }
  return null;
}
