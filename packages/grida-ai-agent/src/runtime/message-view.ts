/**
 * Server-authoritative model message view (RFC `session` — the session is
 * the unit of state; the model sees what the store says is visible).
 *
 * The runtime no longer trusts the client's message array as the model's
 * input. After persisting the incoming tail, it rebuilds the model's view
 * from the VISIBLE persisted messages. This is what makes rewind and
 * compaction real: a rewind hides messages → they vanish from the view;
 * a compaction hides the head and inserts a summary → the view becomes
 * `[summary, …tail]`.
 *
 * Two lowering rules matter:
 *
 *   - **Compaction summary folds into the next user turn.** The summary
 *     lives on a synthetic *assistant* message in the DB (for inspection),
 *     but an assistant-first model sequence is rejected by providers that
 *     require the first turn to be `user` (Anthropic). So the summary is
 *     prepended to the first following user message instead of emitted as
 *     its own turn — the view stays user-led and strictly alternating.
 *
 *   - **Incomplete or input-less tool calls are dropped.** A persisted tool
 *     part with no output (an aborted / crashed run) would convert to an
 *     unpaired tool-call; a *completed* part missing its `input` object
 *     (legacy rows written before the recorder carried input forward, or any
 *     partial write) would fail `convertToModelMessages` input validation and
 *     kill the whole run. Only completed tool parts (`output-available` /
 *     `output-error`) that carry a valid `input` object are re-fed — one bad
 *     row must not poison the conversation.
 *
 *   - **Reasoning is dropped.** Re-feeding thinking blocks across turns is
 *     provider-fraught (signatures) and low value; the model re-reasons.
 */

import type { ChatMessageWithParts } from "../session/rows";
import { compactionBoundary } from "../session/boundary";

export type ModelUIMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: unknown[];
};

/**
 * Rebuild the model's message view from the (rewind-filtered) persisted
 * messages.
 *
 * The persisted log stays linear and complete — a compaction does NOT hide the
 * summarized head; it only appends a summary marker at the bottom. So the
 * compacted context is resolved here, at read-time: find the latest compaction
 * boundary, drop everything before its `tail_start_id` (the summarized head and
 * any older/chained summaries), and re-emit the summary as a leading turn so
 * the model sees `[summary, …verbatim tail, …anything after]`. A `null`
 * `tail_start_id` (manual `/compact`) means no verbatim tail — the model sees
 * just `[summary, …anything after]`.
 */
export function buildModelMessages(
  visible: ChatMessageWithParts[]
): ModelUIMessage[] {
  const boundary = compactionBoundary(visible);

  let working = visible;
  let leadingSummary: string | null = null;
  if (boundary) {
    leadingSummary = boundary.summary;
    const tailStartIdx =
      boundary.tail_start_id !== null
        ? visible.findIndex((m) => m.id === boundary.tail_start_id)
        : -1;
    const tail =
      tailStartIdx >= 0 ? visible.slice(tailStartIdx, boundary.index) : [];
    const after = visible.slice(boundary.index + 1);
    working = [...tail, ...after];
  }

  const out: ModelUIMessage[] = [];
  let pendingSummary: string | null = leadingSummary;

  for (const m of working) {
    // An older/structural compaction marker that survived into the window is
    // not model input — fold its text forward like a summary, never emit it.
    const compaction = findCompactionSummary(m);
    if (compaction !== null) {
      pendingSummary = pendingSummary ?? compaction;
      continue;
    }
    const parts = lowerParts(m.parts);
    if (m.role === "user" && pendingSummary !== null) {
      parts.unshift({
        type: "text",
        text: wrapSummary(pendingSummary),
      });
      pendingSummary = null;
    }
    if (parts.length > 0) out.push({ id: m.id, role: m.role, parts });
  }

  // A summary with no following user turn (manual compact at the tip, or an
  // assistant-led tail) still needs to reach the model: emit it as a user turn.
  if (pendingSummary !== null) {
    out.push({
      id: "msg_compaction_summary",
      role: "user",
      parts: [{ type: "text", text: wrapSummary(pendingSummary) }],
    });
  }
  return out;
}

function wrapSummary(summary: string): string {
  return `<conversation_summary>\nThe earlier part of this conversation was summarized to save context:\n\n${summary}\n</conversation_summary>`;
}

function findCompactionSummary(m: ChatMessageWithParts): string | null {
  for (const p of m.parts) {
    if (p.type === "data-compaction") {
      const data = p.data as { data?: { summary?: string } } | null;
      const summary = data?.data?.summary;
      if (typeof summary === "string") return summary;
    }
  }
  return null;
}

function lowerParts(parts: ChatMessageWithParts["parts"]): unknown[] {
  const out: unknown[] = [];
  for (const p of parts) {
    const data = p.data as Record<string, unknown> | null;
    if (!data) continue;
    const type = p.type;
    if (type === "text") {
      if (typeof data.text === "string" && data.text.length > 0) out.push(data);
      continue;
    }
    if (
      type === "file" ||
      type === "source-url" ||
      type === "source-document"
    ) {
      out.push(data);
      continue;
    }
    if (type === "reasoning") {
      // Dropped on purpose — see file header.
      continue;
    }
    if (type.startsWith("tool-") || type === "dynamic-tool") {
      const state = (data.state as string | undefined) ?? p.tool_state ?? "";
      // Lowerable tool states (RFC `permission modes` — Phase 2 adds the two
      // approval-answered states):
      //   - output-available / output-error → tool-call + tool-result pair.
      //   - approval-responded → tool-call + approval-request + a tool-role
      //     approval-response; `convertToModelMessages` lowers it and the SDK's
      //     approval collector then RUNS the approved call (the resume) or
      //     skips a denied one. This is what makes "click Allow → it runs" work
      //     across the rebuild-from-DB boundary.
      //   - output-denied → the denied call + its denied approval pair.
      // An un-answered `approval-requested` part is dropped like an incomplete
      // call: a tool-call with neither result nor approval-response would trip
      // `MissingToolResultsError`. The resume turn re-persists it as
      // `approval-responded` BEFORE this rebuild runs (see `applyApprovalAnswer`).
      if (
        state !== "output-available" &&
        state !== "output-error" &&
        state !== "approval-responded" &&
        state !== "output-denied"
      ) {
        continue;
      }
      // A completed tool part lowers to a tool-call (input) + tool-result
      // (output) pair; `convertToModelMessages` rejects a missing/non-object
      // input ("Type validation failed for …parts[N].input"). Drop the whole
      // part — never fabricate an input the tool wasn't called with — so a
      // poisoned/legacy row degrades gracefully instead of failing the run.
      const input = (data as { input?: unknown }).input;
      if (typeof input !== "object" || input === null) continue;
      out.push(toSdkToolPart(data, p.tool_call_id));
      continue;
    }
    // Other data-* parts are UI-only — not model-relevant. Drop.
  }
  return out;
}

function toSdkToolPart(
  data: Record<string, unknown>,
  fallbackToolCallId: string | null
): Record<string, unknown> {
  const toolCallId = data.tool_call_id ?? fallbackToolCallId;
  const out: Record<string, unknown> = { ...data };
  delete out.tool_call_id;
  if (typeof toolCallId === "string") out.toolCallId = toolCallId;
  return out;
}
