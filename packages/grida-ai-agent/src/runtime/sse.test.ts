/**
 * `buildConsumerResponse` incremental-delivery spec.
 *
 * `stream-registry.test.ts` proves the registry hands each frame to a
 * consumer callback as it arrives. This file proves the next link: the
 * web `Response` that `buildConsumerResponse` serves emits each frame's
 * SSE bytes to its body reader *before* the run finishes — i.e. the
 * bytes the HTTP layer (`@hono/node-server`) streams to the desktop
 * preload are themselves incremental, not buffered until `[DONE]`.
 *
 * The proof shape mirrors the renderer-side adapter test: never call
 * `finish()` until the live frames have already been read. A
 * buffer-until-done implementation would leave `read()` pending and the
 * test would hang.
 */

import { describe, expect, it } from "vitest";
import { StreamRegistry } from "./stream-registry";
import { buildConsumerResponse } from "./sse";

describe("buildConsumerResponse", () => {
  it("flushes each frame's SSE bytes to the body before the run finishes", async () => {
    const registry = new StreamRegistry({ finish_grace_ms: 1000 });
    registry.create("ses_a");
    const res = buildConsumerResponse(
      registry,
      "ses_a",
      new AbortController().signal
    );
    const reader = res.body!.getReader();
    const decode = (value: Uint8Array | undefined) =>
      new TextDecoder().decode(value);

    // First frame is always the in-band session id, before any model chunk.
    const session = await reader.read();
    expect(session.done).toBe(false);
    expect(decode(session.value)).toBe(
      'event: grida-session\ndata: {"session_id":"ses_a"}\n\n'
    );

    registry.push("ses_a", '{"type":"text-delta","delta":"a"}');
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(decode(first.value)).toBe(
      'data: {"type":"text-delta","delta":"a"}\n\n'
    );

    // Second frame arrives only after the first was already observed —
    // the run is still "running", nothing has been buffered for a flush.
    registry.push("ses_a", '{"type":"text-delta","delta":"b"}');
    const second = await reader.read();
    expect(decode(second.value)).toBe(
      'data: {"type":"text-delta","delta":"b"}\n\n'
    );

    registry.finish("ses_a", "finish");
    const end = await reader.read();
    expect(end.done).toBe(true);
  });

  it("replays already-buffered frames to a late consumer, then closes", async () => {
    // The reconnect path: frames pushed before the consumer attaches must
    // still reach it (registry buffers them), and the body closes once the
    // entry has ended. Pins that `buildConsumerResponse` drains the replay
    // backlog rather than only forwarding live frames.
    const registry = new StreamRegistry({ finish_grace_ms: 1000 });
    registry.create("ses_b");
    registry.push("ses_b", '{"type":"text-delta","delta":"x"}');
    registry.push("ses_b", '{"type":"text-delta","delta":"y"}');

    const res = buildConsumerResponse(
      registry,
      "ses_b",
      new AbortController().signal
    );
    const reader = res.body!.getReader();
    const decode = (value: Uint8Array | undefined) =>
      new TextDecoder().decode(value);

    // The in-band session id leads, then the buffered replay backlog.
    const session = await reader.read();
    expect(decode(session.value)).toBe(
      'event: grida-session\ndata: {"session_id":"ses_b"}\n\n'
    );

    const a = await reader.read();
    expect(decode(a.value)).toBe('data: {"type":"text-delta","delta":"x"}\n\n');
    const b = await reader.read();
    expect(decode(b.value)).toBe('data: {"type":"text-delta","delta":"y"}\n\n');

    registry.finish("ses_b", "finish");
    const end = await reader.read();
    expect(end.done).toBe(true);
  });
});
