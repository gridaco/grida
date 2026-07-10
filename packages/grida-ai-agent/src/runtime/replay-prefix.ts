/**
 * Self-contained continuation replay — the server half of the
 * approval-resume "network error" fix.
 *
 * A turn that CONTINUES a persisted assistant message (a supervised
 * approval resume, a `question` resume — any turn whose visible tail is an
 * assistant row) streams only its own frames: the registry buffer starts at
 * the resume, and the continued message's earlier parts exist only in the
 * DB. The renderer's reconnect protocol is drop-then-replay (it drops its
 * in-flight assistant and rebuilds it from the replay), which is sound for
 * a normal turn — the buffer re-emits everything — but was UNSOUND for a
 * continuation: the dropped pre-pause parts (including the pending tool
 * call) were not in the buffer, so the live `tool-output-available` had no
 * part to land on and the AI-SDK reducer threw "No tool invocation found".
 *
 * This module rebuilds that missing head: `buildReplayPrefix(tail)` lowers
 * the continued message's PERSISTED parts back into standard UI-message
 * chunks. The registry serves the prefix to RECONNECT consumers only —
 * never to the `POST /agent/run` response (whose reducer continues the live
 * message in place and would duplicate parts) and never to the recorder
 * (which would double-persist rows). See `stream-registry.ts` `attach`.
 *
 * Chunk-vocabulary facts this encoding relies on (verified against
 * ai@6.0.197):
 *   - `start` must come FIRST and only sets `state.message.id` — it never
 *     resets parts, so the live turn's own `start` (same messageId) later in
 *     the buffer is a benign no-op and the two sources compose.
 *   - `tool-approval-request` looks the invocation up by `toolCallId` and
 *     THROWS if it doesn't exist — the input chunk must precede it.
 *   - The client reducer has NO `tool-approval-response` case: an
 *     `approval-responded` row lowers to its `approval-requested` shape and
 *     the LIVE turn terminalizes the part (`tool-output-available` /
 *     `tool-output-denied`).
 *   - Never fabricate an `input` the call was not observed with — a part
 *     whose input never arrived degrades to `tool-input-start`.
 */

import type { ChatMessageWithParts } from "../session/rows";
import { normalizeSdkToolPartFields } from "../protocol/tool-part-fields";

/**
 * Lower the visible tail message's persisted parts into replayable
 * UI-message chunks (JSON-serialized, one per registry frame). Returns `[]`
 * for anything that is not an assistant continuation — a user tail (every
 * normal send and every queue drain) means the buffer is already
 * self-contained.
 */
export function buildReplayPrefix(
  tail: ChatMessageWithParts | undefined
): string[] {
  if (!tail || tail.role !== "assistant") return [];
  const chunks: Record<string, unknown>[] = [
    // First frame, load-bearing: the reducer keys continuation on the
    // message id. A part-first prefix would fork the assistant under a
    // client-generated id.
    { type: "start", messageId: tail.id },
  ];
  tail.parts.forEach((part, i) => {
    const data = part.data as Record<string, unknown> | null;
    if (!data) return;
    const type = part.type;
    if (type === "text" || type === "reasoning") {
      const text = data.text;
      if (typeof text !== "string" || text.length === 0) return;
      const id = `rp-${i}`;
      chunks.push(
        { type: `${type}-start`, id },
        { type: `${type}-delta`, id, delta: text },
        { type: `${type}-end`, id }
      );
      return;
    }
    if (
      type === "file" ||
      type === "source-url" ||
      type === "source-document" ||
      type.startsWith("data-")
    ) {
      // The recorder persisted the whole chunk-shaped part — re-emit as-is.
      chunks.push(data);
      return;
    }
    if (type.startsWith("tool-") || type === "dynamic-tool") {
      chunks.push(
        ...lowerToolPart(type, data, part.tool_call_id, part.tool_state)
      );
      return;
    }
    // step-start is never persisted; anything else is UI-only. Skip.
  });
  return chunks.map((c) => JSON.stringify(c));
}

/** Lower one persisted tool part into its chunk sequence by state. */
function lowerToolPart(
  partType: string,
  raw: Record<string, unknown>,
  rowToolCallId: string | null,
  rowToolState: string | null
): Record<string, unknown>[] {
  // Legacy rows carry snake_case mirrors; the wire is camelCase.
  const n = normalizeSdkToolPartFields(raw, rowToolCallId);
  const toolCallId = n.toolCallId;
  if (typeof toolCallId !== "string" || toolCallId.length === 0) return [];
  const toolName =
    typeof n.toolName === "string" && n.toolName.length > 0
      ? n.toolName
      : partType.startsWith("tool-")
        ? partType.slice("tool-".length)
        : undefined;
  if (!toolName) return [];
  const state =
    (typeof n.state === "string" ? n.state : undefined) ?? rowToolState ?? "";
  const dynamic = partType === "dynamic-tool" ? { dynamic: true } : {};
  const providerExecuted =
    typeof n.providerExecuted === "boolean"
      ? { providerExecuted: n.providerExecuted }
      : {};

  const inputStart: Record<string, unknown> = {
    type: "tool-input-start",
    toolCallId,
    toolName,
    ...dynamic,
    ...providerExecuted,
  };
  const hasInput = typeof n.input === "object" && n.input !== null;
  const inputAvailable: Record<string, unknown> = {
    type: "tool-input-available",
    toolCallId,
    toolName,
    input: n.input,
    ...dynamic,
    ...providerExecuted,
  };
  // The chunk that makes the invocation exist client-side. Never fabricate
  // an input the call wasn't observed with.
  const head = hasInput ? inputAvailable : inputStart;

  const approvalId = (n.approval as { id?: unknown } | undefined)?.id;
  const approvalRequest: Record<string, unknown> | null =
    typeof approvalId === "string" && approvalId.length > 0
      ? { type: "tool-approval-request", toolCallId, approvalId }
      : null;

  switch (state) {
    case "input-streaming":
      return [inputStart];
    case "input-available":
      return [head];
    case "approval-requested":
    case "approval-responded":
      // approval-responded is not wire-reachable (no reducer case for
      // tool-approval-response): rebuild to approval-requested; the live
      // turn terminalizes the part.
      return approvalRequest && hasInput ? [head, approvalRequest] : [head];
    case "output-available":
      return "output" in n
        ? [
            head,
            { type: "tool-output-available", toolCallId, output: n.output },
          ]
        : [head];
    case "output-error":
      return [
        head,
        {
          type: "tool-output-error",
          toolCallId,
          errorText:
            typeof n.errorText === "string" && n.errorText.length > 0
              ? n.errorText
              : "tool failed",
        },
      ];
    case "output-denied":
      return approvalRequest && hasInput
        ? [head, approvalRequest, { type: "tool-output-denied", toolCallId }]
        : [head];
    default:
      // Unknown/legacy state — replay the most it can prove.
      return [head];
  }
}
