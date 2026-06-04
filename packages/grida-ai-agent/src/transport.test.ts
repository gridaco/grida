import { describe, expect, it } from "vitest";
import { AgentTransport } from "./transport";
import type { AgentUIMessageChunk } from "./protocol/wire";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

// Build an SSE body: an optional leading `grida-session` frame (the in-band
// session id — the sole continuity channel), then chunk data frames, then
// the `[DONE]` sentinel.
function sseStream(
  sessionId: string | null,
  ...chunks: unknown[]
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (sessionId !== null) {
        controller.enqueue(
          enc.encode(
            `event: grida-session\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`
          )
        );
      }
      for (const c of chunks) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`));
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// Build a ReadableStream from pre-chunked byte slices, so a test can control
// exactly how an SSE frame is split across `reader.read()` boundaries.
function byteStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe("AgentTransport.readFrames", () => {
  it("reassembles a multi-line `data:` frame, preserving the embedded newline", async () => {
    const frames: Array<{ event: string; data: string }> = [];
    await AgentTransport.readFrames(
      byteStream("event: x\ndata: line one\ndata: line two\n\n"),
      (event, data) => frames.push({ event, data })
    );
    expect(frames).toEqual([{ event: "x", data: "line one\nline two" }]);
  });

  it("reassembles a frame split across multiple reader.read() chunks", async () => {
    const frames: Array<{ event: string; data: string }> = [];
    await AgentTransport.readFrames(
      byteStream("data: hel", "lo wor", "ld\n", "\ndata: next\n\n"),
      (event, data) => frames.push({ event, data })
    );
    expect(frames).toEqual([
      { event: "message", data: "hello world" },
      { event: "message", data: "next" },
    ]);
  });

  it("strips only a single leading space after the colon (preserves meaningful whitespace)", async () => {
    const frames: Array<{ event: string; data: string }> = [];
    await AgentTransport.readFrames(
      byteStream("data:  two-leading-spaces\n\n"),
      (event, data) => frames.push({ event, data })
    );
    expect(frames).toEqual([{ event: "message", data: " two-leading-spaces" }]);
  });

  it("caps the un-terminated tail, not buffered complete frames", async () => {
    // A burst of many complete frames, each well under the per-frame limit,
    // must NOT trip the cap even though their combined size exceeds it —
    // the cap measures only the tail remaining after the last "\n\n".
    const frame = `data: ${"x".repeat(4096)}\n\n`;
    const burst = frame.repeat(512); // ~2 MiB total, > 1 MiB cap
    const count = { n: 0 };
    await expect(
      AgentTransport.readFrames(byteStream(burst), () => {
        count.n++;
      })
    ).resolves.toBeUndefined();
    expect(count.n).toBe(512);
  });

  it("still trips the cap on a single un-terminated mega-frame", async () => {
    const huge = `data: ${"x".repeat(1_100_000)}`; // no "\n\n" terminator
    await expect(
      AgentTransport.readFrames(byteStream(huge), () => {})
    ).rejects.toThrow(/upstream stalled/);
  });
});

describe("AgentTransport.Client", () => {
  it("owns the handshake route method and JSON parsing", async () => {
    const seen: Array<{ path: string; method: string }> = [];
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        seen.push({ path, method: init?.method ?? "GET" });
        return json({
          protocol: 1,
          supports: ["agent@1"],
          capabilities: {
            files: true,
            recent: true,
            secrets: true,
            agent: true,
            workspaces: true,
            sessions: true,
            shell: false,
          },
        });
      },
    });

    await expect(client.handshake()).resolves.toMatchObject({ protocol: 1 });
    expect(seen).toEqual([{ path: "/handshake", method: "POST" }]);
  });

  it("throws typed HTTP errors with route, status, and server code", async () => {
    const client = new AgentTransport.Client({
      fetcher: async () =>
        json(
          { error: "no BYOK provider available", code: "provider_down" },
          { status: 409, statusText: "Conflict" }
        ),
    });

    await expect(client.secrets.has("openrouter")).rejects.toMatchObject({
      route: "/secrets/has",
      status: 409,
      code: "provider_down",
    });
    const err = await client.secrets.has("openrouter").then(
      () => undefined,
      (e: unknown) => e
    );
    expect(AgentTransport.isUnavailable(err)).toBe(true);
  });

  it("streams chunks and returns the in-band session id (never surfacing the session frame as a chunk)", async () => {
    const seen: Array<{ path: string; method: string; body: unknown }> = [];
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        seen.push({
          path,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(
          sseStream("s1", {
            type: "tool-input-start",
            tool_call_id: "call-1",
            tool_name: "read_file",
          }),
          { headers: { "content-type": "text/event-stream" } }
        );
      },
    });

    const chunks: AgentUIMessageChunk[] = [];
    const handle = await client.agent.run(
      { messages: [], tier: "pro" },
      (chunk) => chunks.push(chunk)
    );
    await handle.done;

    expect(handle.session_id).toBe("s1");
    // The `grida-session` frame is consumed by the transport — never a chunk.
    expect(chunks).toEqual([
      {
        type: "tool-input-start",
        tool_call_id: "call-1",
        tool_name: "read_file",
      },
    ]);
    expect(seen).toEqual([
      {
        path: "/agent/run",
        method: "POST",
        body: { messages: [], tier: "pro" },
      },
    ]);
  });

  it("throws MissingSessionIdError when the stream has no grida-session frame", async () => {
    // Fail loud: a silent "" id would make every follow-up turn mint a fresh
    // session. A run stream with no session frame is a broken contract.
    const client = new AgentTransport.Client({
      fetcher: async () =>
        new Response(sseStream(null, { type: "text-start", id: "t" }), {
          headers: { "content-type": "text/event-stream" },
        }),
    });

    await expect(
      client.agent.run({ messages: [], tier: "pro" }, () => {})
    ).rejects.toBeInstanceOf(AgentTransport.MissingSessionIdError);
  });

  it("reconnect sends last-event-id and maps 404 to null", async () => {
    const seen: Array<{ path: string; last_event_id: string | null }> = [];
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        const headers = new Headers(init?.headers);
        seen.push({ path, last_event_id: headers.get("last-event-id") });
        return json({ error: "no in-flight stream" }, { status: 404 });
      },
    });

    await expect(
      client.agent.reconnect("s1", 12, () => {})
    ).resolves.toBeNull();
    expect(seen).toEqual([{ path: "/agent/stream/s1", last_event_id: "12" }]);
  });
});
