import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { AgentSidecarChannel } from "./agent-sidecar-channel";

const frames: readonly AgentSidecarChannel.Frame[] = [
  {
    v: 1,
    type: "bootstrap",
    password: "spawn-secret",
    daemonPort: 43123,
    revision: 0,
    grants: [
      {
        id: "openrouter",
        lane: "provider",
        origins: ["https://openrouter.ai", "https://*.openrouter.ai"],
      },
      {
        id: "download:provider-assets",
        lane: "download",
        origins: ["https://fal.media", "https://*.fal.media"],
      },
    ],
  },
  { v: 1, type: "grant.applied", revision: 1 },
  { v: 1, type: "ready", port: 43210 },
  {
    v: 1,
    type: "grant.update",
    revision: 1,
    grants: [
      {
        id: "custom",
        lane: "provider",
        origins: ["http://127.0.0.1:11434"],
      },
    ],
  },
  {
    v: 1,
    type: "request.start",
    requestId: "req_1",
    grantId: "openrouter",
    method: "POST",
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: [
      ["authorization", "Bearer secret"],
      ["x-repeated", "one"],
      ["x-repeated", "two"],
    ],
    hasBody: true,
  },
  {
    v: 1,
    type: "request.chunk",
    requestId: "req_1",
    sequence: 0,
    data: Buffer.from("request").toString("base64"),
  },
  { v: 1, type: "request.end", requestId: "req_1", sequence: 1 },
  { v: 1, type: "request.abort", requestId: "req_2", reason: "cancelled" },
  {
    v: 1,
    type: "response.start",
    requestId: "req_1",
    status: 200,
    statusText: "OK",
    headers: [
      ["content-type", "text/event-stream"],
      ["set-cookie", "a=1"],
      ["set-cookie", "b=2"],
    ],
    hasBody: true,
  },
  {
    v: 1,
    type: "response.chunk",
    requestId: "req_1",
    sequence: 0,
    data: Buffer.from("response").toString("base64"),
  },
  { v: 1, type: "response.end", requestId: "req_1", sequence: 1 },
  {
    v: 1,
    type: "response.error",
    requestId: "req_3",
    code: "network",
    message: "request failed",
  },
  { v: 1, type: "response.credit", requestId: "req_1", bytes: 65_536 },
  { v: 1, type: "shutdown" },
];

describe("AgentSidecarChannel.parse", () => {
  it("accepts the complete v1 frame vocabulary and preserves header pairs", () => {
    for (const frame of frames) {
      expect(AgentSidecarChannel.parse(frame)).toEqual(frame);
    }
    const requestFrame = frames.find((frame) => frame.type === "request.start");
    expect(requestFrame).toBeDefined();
    const request = AgentSidecarChannel.parse(requestFrame!);
    expect(request).toMatchObject({
      type: "request.start",
      headers: [
        ["authorization", "Bearer secret"],
        ["x-repeated", "one"],
        ["x-repeated", "two"],
      ],
    });
  });

  it("rejects unknown versions, types, fields, and invalid frame fields", () => {
    expect(() => AgentSidecarChannel.parse({ v: 2, type: "shutdown" })).toThrow(
      /unsupported protocol version/
    );
    expect(() => AgentSidecarChannel.parse({ v: 1, type: "future" })).toThrow(
      /unknown frame type/
    );
    expect(() =>
      AgentSidecarChannel.parse({ v: 1, type: "shutdown", surprise: true })
    ).toThrow(/unknown frame field/);
    expect(() =>
      AgentSidecarChannel.parse({
        v: 1,
        type: "response.credit",
        requestId: "req",
        bytes: 0,
      })
    ).toThrow(/bytes must be an integer/);
    expect(() =>
      AgentSidecarChannel.parse({
        v: 1,
        type: "request.start",
        requestId: "req",
        grantId: "provider",
        method: "POST\r\nX-Bad: yes",
        url: "https://example.com",
        headers: [],
        hasBody: false,
      })
    ).toThrow(/method must be an HTTP token/);
  });

  it("keeps provider and download grants on canonical, bounded origins", () => {
    const bootstrap = (grants: unknown[]): Record<string, unknown> => ({
      v: 1,
      type: "bootstrap",
      password: "secret",
      daemonPort: 43123,
      revision: 0,
      grants,
    });

    expect(() =>
      AgentSidecarChannel.parse(
        bootstrap([
          {
            id: "provider",
            lane: "provider",
            origins: ["https://example.com/path"],
          },
        ])
      )
    ).toThrow(/canonical HTTP/);
    expect(() =>
      AgentSidecarChannel.parse(
        bootstrap([
          {
            id: "provider",
            lane: "provider",
            origins: ["https://*evil.example.com"],
          },
        ])
      )
    ).toThrow(/strict DNS-suffix pattern/);
    expect(() =>
      AgentSidecarChannel.parse(
        bootstrap([
          {
            id: "downloads",
            lane: "download",
            origins: ["http://assets.example.com"],
          },
        ])
      )
    ).toThrow(/network grant origin/);
    expect(() =>
      AgentSidecarChannel.parse(
        bootstrap([
          {
            id: "downloads",
            lane: "download",
            origins: ["https://*"],
          },
        ])
      )
    ).toThrow(/strict DNS-suffix pattern/);
  });

  it("rejects header injection and overlarge binary chunks", () => {
    const request = {
      ...frames.find((frame) => frame.type === "request.start")!,
    } as AgentSidecarChannel.RequestStartFrame;
    expect(() =>
      AgentSidecarChannel.parse({
        ...request,
        headers: [["x-test", "ok\r\nx-injected: yes"]],
      })
    ).toThrow(/invalid header pair/);

    const data = Buffer.alloc(
      AgentSidecarChannel.MAX_BINARY_CHUNK_BYTES + 1
    ).toString("base64");
    expect(() =>
      AgentSidecarChannel.parse({
        v: 1,
        type: "request.chunk",
        requestId: "req",
        sequence: 0,
        data,
      })
    ).toThrow(/bounded base64 chunk/);
  });
});

describe("AgentSidecarChannel.Decoder", () => {
  it("decodes one-byte fragmentation and multiple coalesced frames", () => {
    const packet = Buffer.concat(frames.map(AgentSidecarChannel.encode));
    const fragmented = new AgentSidecarChannel.Decoder();
    const decoded: AgentSidecarChannel.Frame[] = [];
    for (let index = 0; index < packet.length; index += 1) {
      decoded.push(...fragmented.push(packet.subarray(index, index + 1)));
    }
    expect(decoded).toEqual(frames);

    const coalesced = new AgentSidecarChannel.Decoder();
    expect(coalesced.push(packet)).toEqual(frames);
  });

  it("decodes the largest legal binary chunk one byte at a time", () => {
    const frame: AgentSidecarChannel.ResponseChunkFrame = {
      v: 1,
      type: "response.chunk",
      requestId: "req_fragmented",
      sequence: 0,
      data: Buffer.alloc(
        AgentSidecarChannel.MAX_BINARY_CHUNK_BYTES,
        0xa5
      ).toString("base64"),
    };
    const encoded = AgentSidecarChannel.encode(frame);
    const decoder = new AgentSidecarChannel.Decoder();
    const decoded: AgentSidecarChannel.Frame[] = [];

    for (let index = 0; index < encoded.length; index += 1) {
      decoded.push(...decoder.push(encoded.subarray(index, index + 1)));
    }

    expect(decoded).toEqual([frame]);
  });

  it("accepts a frame whose payload is exactly the 256 KiB limit", () => {
    const headers: AgentSidecarChannel.Header[] = Array.from(
      { length: 16 },
      (_, index) => [`x-padding-${index}`, "x".repeat(16 * 1024)]
    );
    const candidate: AgentSidecarChannel.RequestStartFrame = {
      v: 1,
      type: "request.start",
      requestId: "req_exact_limit",
      grantId: "provider",
      method: "POST",
      url: "https://example.com",
      headers,
      hasBody: false,
    };
    const excess =
      Buffer.byteLength(JSON.stringify(candidate), "utf8") -
      AgentSidecarChannel.MAX_FRAME_BYTES;
    expect(excess).toBeGreaterThan(0);
    const [lastName, lastValue] = headers.at(-1)!;
    headers[headers.length - 1] = [
      lastName,
      lastValue.slice(0, lastValue.length - excess),
    ];

    const encoded = AgentSidecarChannel.encode(candidate);
    expect(encoded.readUInt32BE(0)).toBe(AgentSidecarChannel.MAX_FRAME_BYTES);
    expect(new AgentSidecarChannel.Decoder().push(encoded)).toEqual([
      candidate,
    ]);
  });

  it("uses an unsigned 4-byte big-endian payload length", () => {
    const packet = AgentSidecarChannel.encode({ v: 1, type: "shutdown" });
    expect(packet.readUInt32BE(0)).toBe(packet.length - 4);
    expect(JSON.parse(packet.subarray(4).toString("utf8"))).toEqual({
      v: 1,
      type: "shutdown",
    });
  });

  it("rejects zero-length, oversized, malformed JSON, and invalid UTF-8", () => {
    const zero = Buffer.alloc(4);
    expect(() => new AgentSidecarChannel.Decoder().push(zero)).toThrow(
      /zero-length frame/
    );

    const oversized = Buffer.alloc(4);
    oversized.writeUInt32BE(AgentSidecarChannel.MAX_FRAME_BYTES + 1);
    expect(() => new AgentSidecarChannel.Decoder().push(oversized)).toThrow(
      /exceeds/
    );

    const malformed = packet(Buffer.from("{nope", "utf8"));
    expect(() => new AgentSidecarChannel.Decoder().push(malformed)).toThrow(
      /valid UTF-8 JSON/
    );

    const invalidUtf8 = packet(Buffer.from([0xc3, 0x28]));
    expect(() => new AgentSidecarChannel.Decoder().push(invalidUtf8)).toThrow(
      /valid UTF-8 JSON/
    );
  });

  it("fails closed after the first protocol error", () => {
    const decoder = new AgentSidecarChannel.Decoder();
    expect(() => decoder.push(Buffer.alloc(4))).toThrow(/zero-length/);
    expect(() =>
      decoder.push(AgentSidecarChannel.encode({ v: 1, type: "shutdown" }))
    ).toThrow(/unusable after a protocol error/);
  });
});

describe("AgentSidecarChannel.Writer", () => {
  it("serializes writes and waits for callback plus drain backpressure", async () => {
    const started: Buffer[] = [];
    const callbacks: Array<(error?: Error | null) => void> = [];
    const output = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        started.push(Buffer.from(chunk));
        callbacks.push(callback);
      },
    });
    const writer = new AgentSidecarChannel.Writer(output);

    const first = writer.write({ v: 1, type: "ready", port: 1234 });
    const second = writer.write({ v: 1, type: "shutdown" });
    await until(() => started.length === 1);
    expect(started).toHaveLength(1);

    callbacks.shift()?.();
    await first;
    await until(() => started.length === 2);
    expect(started).toHaveLength(2);

    callbacks.shift()?.();
    await second;
    const decoder = new AgentSidecarChannel.Decoder();
    expect(decoder.push(Buffer.concat(started))).toEqual([
      { v: 1, type: "ready", port: 1234 },
      { v: 1, type: "shutdown" },
    ]);
  });

  it("rejects on the stream callback error without an unhandled stream error", async () => {
    let writes = 0;
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        writes += 1;
        callback(writes === 1 ? new Error("pipe failed") : undefined);
      },
    });
    // A real Writable becomes permanently errored after a callback error. Use
    // two calls only to prove the first promise observes the callback failure;
    // channel owners should tear down the failed pipe.
    const writer = new AgentSidecarChannel.Writer(output);
    await expect(
      writer.write({ v: 1, type: "ready", port: 1234 })
    ).rejects.toThrow(/pipe failed/);
  });
});

function packet(payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("condition was not reached");
}
