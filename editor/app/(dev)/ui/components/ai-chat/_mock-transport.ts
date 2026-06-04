/**
 * Demo-only AI SDK plumbing for `/ui/components/ai-chat`.
 *
 * `createMockTransport` is a {@link ChatTransport} whose `sendMessages`
 * replays a pre-scripted `UIMessageChunk[]` via `simulateReadableStream`
 * (from `ai/test`) — no model, no network. `chunkDelayInMs: 0` drains
 * synchronously (settled view); a non-zero delay animates the stream so
 * the renderer's streaming states are observable.
 *
 * The chunk builders below author a scenario without hand-writing every
 * envelope chunk. No `start`/`finish` chunk is needed — the AI SDK
 * reducer creates the assistant message on the first content chunk.
 */

import { simulateReadableStream } from "ai/test";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export function createMockTransport(opts: {
  chunks: UIMessageChunk[];
  chunkDelayInMs?: number;
}): ChatTransport<UIMessage> {
  const delay = opts.chunkDelayInMs ?? 0;
  return {
    async sendMessages() {
      return simulateReadableStream({
        chunks: opts.chunks,
        initialDelayInMs: delay,
        chunkDelayInMs: delay,
      });
    },
    // No resume in the demo — the SDK's mount-time reconnect is a clean no-op.
    async reconnectToStream() {
      return null;
    },
  };
}

// --- chunk builders -------------------------------------------------------

/** Split into word-ish tokens so a delayed stream reads naturally. */
function tokenize(md: string): string[] {
  return md.match(/\S+\s*/g) ?? [md];
}

export function text(id: string, md: string): UIMessageChunk[] {
  return [
    { type: "text-start", id },
    ...tokenize(md).map(
      (delta): UIMessageChunk => ({ type: "text-delta", id, delta })
    ),
    { type: "text-end", id },
  ];
}

export function reasoning(id: string, md: string): UIMessageChunk[] {
  return [
    { type: "reasoning-start", id },
    ...tokenize(md).map(
      (delta): UIMessageChunk => ({ type: "reasoning-delta", id, delta })
    ),
    { type: "reasoning-end", id },
  ];
}

export type ToolCallSpec = {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  /** Result payload for the success path. Ignored when `errorText`/`denied` set. */
  output?: unknown;
  errorText?: string;
  denied?: boolean;
  /** Stop the call early to show an in-flight state. Defaults to a settled output. */
  state?: "input-streaming" | "input-available" | "output-available";
};

export function toolCall(spec: ToolCallSpec): UIMessageChunk[] {
  const { toolCallId, toolName, input, output, errorText, denied } = spec;
  const state = spec.state ?? "output-available";

  const chunks: UIMessageChunk[] = [
    { type: "tool-input-start", toolCallId: toolCallId, toolName: toolName },
  ];
  if (state === "input-streaming") return chunks;

  chunks.push({
    type: "tool-input-available",
    toolCallId: toolCallId,
    toolName: toolName,
    input,
  });
  if (state === "input-available") return chunks;

  if (errorText !== undefined) {
    chunks.push({
      type: "tool-output-error",
      toolCallId: toolCallId,
      errorText: errorText,
    });
  } else if (denied) {
    chunks.push({ type: "tool-output-denied", toolCallId: toolCallId });
  } else {
    chunks.push({
      type: "tool-output-available",
      toolCallId: toolCallId,
      output,
    });
  }
  return chunks;
}

export function streamError(errorText: string): UIMessageChunk[] {
  return [{ type: "error", errorText: errorText }];
}

// --- message builders (for Chat `initialMessages`) ------------------------

let messageSeq = 0;

export function userMsg(md: string): UIMessage {
  return {
    id: `mock-user-${++messageSeq}`,
    role: "user",
    parts: [{ type: "text", text: md }],
  } as UIMessage;
}

export function assistantMsg(md: string): UIMessage {
  return {
    id: `mock-assistant-${++messageSeq}`,
    role: "assistant",
    parts: [{ type: "text", text: md }],
  } as UIMessage;
}

/**
 * The synthetic assistant turn a compaction produces — carries a
 * `data-compaction` part the renderer shows as the settled "Conversation
 * compacted" divider + summary. Mirrors the part shape `@grida/agent`'s
 * `applyCompaction` writes.
 */
export function compactionMsg(
  summary: string,
  opts: { auto?: boolean } = {}
): UIMessage {
  return {
    id: `mock-compaction-${++messageSeq}`,
    role: "assistant",
    parts: [
      {
        type: "data-compaction",
        data: {
          summary,
          auto: opts.auto ?? false,
          tail_start_id: "mock-tail-start",
          summary_tokens: Math.ceil(summary.length / 4),
        },
      },
    ],
  } as UIMessage;
}
