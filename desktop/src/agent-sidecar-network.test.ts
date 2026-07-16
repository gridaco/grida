import { PassThrough, Transform } from "node:stream";
import { describe, expect, it } from "vitest";
import { AgentSidecarChannel } from "./agent-sidecar-channel";
import { AgentSidecarNetwork } from "./agent-sidecar-network";

describe("AgentSidecarNetwork", () => {
  it("turns an injected provider fetch into a streamed, credited exchange", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const result = harness.network.providerHttp.request(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
        body: "{}",
      }
    );
    const start = await harness.untilFrame("request.start");
    expect(start.grantId).toBe("provider:built-in");
    expect(start.headers).toContainEqual(["authorization", "Bearer secret"]);
    const end = await harness.untilFrame("request.end");
    expect(end.sequence).toBe(1);

    await harness.host.write({
      v: 1,
      type: "response.start",
      requestId: start.requestId,
      status: 200,
      statusText: "OK",
      headers: [["content-type", "text/event-stream"]],
      hasBody: true,
    });
    const response = await result;
    expect(response.status).toBe(200);
    const text = response.text();
    const credit = await harness.untilFrame("response.credit");
    expect(credit.bytes).toBeGreaterThan(0);
    await harness.host.write({
      v: 1,
      type: "response.chunk",
      requestId: start.requestId,
      sequence: 0,
      data: Buffer.from("data: done\n\n").toString("base64"),
    });
    await harness.host.write({
      v: 1,
      type: "response.end",
      requestId: start.requestId,
      sequence: 1,
    });
    expect(await text).toBe("data: done\n\n");
    harness.network.close();
  });

  it("selects the credential-free provider-asset lane separately", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const result = harness.network.providerHttp.download(
      "https://v3.fal.media/result.mp4"
    );
    const start = await harness.untilFrame("request.start");
    expect(start.grantId).toBe("download:provider-assets");
    await harness.untilFrame("request.end");
    await harness.host.write({
      v: 1,
      type: "response.start",
      requestId: start.requestId,
      status: 204,
      statusText: "No Content",
      headers: [],
      hasBody: false,
    });
    await harness.host.write({
      v: 1,
      type: "response.end",
      requestId: start.requestId,
      sequence: 0,
    });
    expect((await result).status).toBe(204);
    harness.network.close();
  });

  it("refuses an ungranted provider origin before writing request frames", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    await expect(
      harness.network.providerHttp.request("https://example.com/scan")
    ).rejects.toThrow(/no host-issued grant/);
    expect(harness.frames.some((frame) => frame.type === "request.start")).toBe(
      false
    );
    harness.network.close();
  });

  it("propagates caller abort to the host without exposing a channel token", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const controller = new AbortController();
    const result = harness.network.providerHttp.request(
      "https://openrouter.ai/api/v1/chat/completions",
      { signal: controller.signal }
    );
    const start = await harness.untilFrame("request.start");
    await harness.untilFrame("request.end");
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    const abort = await harness.untilFrame("request.abort");
    expect(abort.requestId).toBe(start.requestId);
    harness.network.close();
  });

  it("safely observes host denial while request.start is backpressured", async () => {
    const hostOutput = new PassThrough();
    const sidecarOutput = new FirstWriteBlockedTransform();
    const network = new AgentSidecarNetwork(hostOutput, sidecarOutput);
    const host = new AgentSidecarChannel.Writer(hostOutput);
    const decoder = new AgentSidecarChannel.Decoder();
    const frames: AgentSidecarChannel.SidecarToHostFrame[] = [];
    sidecarOutput.on("data", (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        frames.push(frame as AgentSidecarChannel.SidecarToHostFrame);
      }
    });
    const bootstrap = network.waitForBootstrap();
    await host.write({
      v: 1,
      type: "bootstrap",
      password: "a-secure-spawn-password",
      daemonPort: 43123,
      revision: 1,
      grants: [
        {
          id: "provider:built-in",
          lane: "provider",
          origins: ["https://openrouter.ai"],
        },
      ],
    });
    await bootstrap;
    const result = network.providerHttp.request(
      "https://openrouter.ai/api/v1/chat/completions",
      { method: "POST", body: "{}" }
    );
    await sidecarOutput.untilBlocked();
    const start = frames.find(
      (frame): frame is AgentSidecarChannel.RequestStartFrame =>
        frame.type === "request.start"
    );
    expect(start).toBeDefined();

    await host.write({
      v: 1,
      type: "response.error",
      requestId: start!.requestId,
      code: "denied",
      message: "provider network request denied",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    sidecarOutput.release();

    await expect(result).rejects.toThrow(/denied/);
    network.close();
  });

  it("does not open a host upload when abort fires during body buffering", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        setImmediate(() => {
          controller.abort();
          stream.enqueue(new TextEncoder().encode("late"));
          stream.close();
        });
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      body,
      signal: controller.signal,
      duplex: "half",
    };
    await expect(
      harness.network.providerHttp.request(
        "https://openrouter.ai/api/v1/chat/completions",
        init
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(harness.frames.some((frame) => frame.type === "request.start")).toBe(
      false
    );
    harness.network.close();
  });

  it("ignores bounded late response frames after body cancellation", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const result = harness.network.providerHttp.request(
      "https://openrouter.ai/api/v1/chat/completions"
    );
    const start = await harness.untilFrame("request.start");
    await harness.untilFrame("request.end");
    await harness.host.write({
      v: 1,
      type: "response.start",
      requestId: start.requestId,
      status: 200,
      statusText: "OK",
      headers: [],
      hasBody: true,
    });
    const response = await result;
    await response.body!.cancel();
    await harness.untilFrame("request.abort");
    await harness.host.write({
      v: 1,
      type: "response.chunk",
      requestId: start.requestId,
      sequence: 0,
      data: Buffer.from("late").toString("base64"),
    });
    await harness.host.write({
      v: 1,
      type: "response.end",
      requestId: start.requestId,
      sequence: 1,
    });

    const second = harness.network.providerHttp.request(
      "https://openrouter.ai/api/v1/models"
    );
    const starts = await harness.untilFrames("request.start", 2);
    expect(starts[1].url).toBe("https://openrouter.ai/api/v1/models");
    await harness.host.write({
      v: 1,
      type: "response.start",
      requestId: starts[1].requestId,
      status: 204,
      statusText: "No Content",
      headers: [],
      hasBody: false,
    });
    await harness.host.write({
      v: 1,
      type: "response.end",
      requestId: starts[1].requestId,
      sequence: 0,
    });
    await expect(second).resolves.toMatchObject({ status: 204 });
    harness.network.close();
  });

  it("acknowledges a newer grant snapshot only after applying it", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    await harness.host.write({
      v: 1,
      type: "grant.update",
      revision: 2,
      grants: [
        {
          id: "provider:built-in",
          lane: "provider",
          origins: ["https://openrouter.ai"],
        },
        {
          id: "download:provider-assets",
          lane: "download",
          origins: ["https://fal.media", "https://*.fal.media"],
        },
      ],
    });
    const applied = await harness.untilFrame("grant.applied");
    expect(applied.revision).toBe(2);
    harness.network.close();
  });
});

function createHarness() {
  const hostOutput = new PassThrough();
  const sidecarOutput = new PassThrough();
  const network = new AgentSidecarNetwork(hostOutput, sidecarOutput);
  const host = new AgentSidecarChannel.Writer(hostOutput);
  const decoder = new AgentSidecarChannel.Decoder();
  const frames: AgentSidecarChannel.SidecarToHostFrame[] = [];
  sidecarOutput.on("data", (chunk: Buffer) => {
    for (const frame of decoder.push(chunk)) {
      frames.push(frame as AgentSidecarChannel.SidecarToHostFrame);
    }
  });
  return {
    network,
    host,
    frames,
    async bootstrap() {
      const pending = network.waitForBootstrap();
      await host.write({
        v: 1,
        type: "bootstrap",
        password: "a-secure-spawn-password",
        daemonPort: 43123,
        revision: 1,
        grants: [
          {
            id: "provider:built-in",
            lane: "provider",
            origins: ["https://openrouter.ai"],
          },
          {
            id: "download:provider-assets",
            lane: "download",
            origins: ["https://fal.media", "https://*.fal.media"],
          },
        ],
      });
      await expect(pending).resolves.toEqual({
        password: "a-secure-spawn-password",
        daemonPort: 43123,
        revision: 1,
      });
    },
    async untilFrame<T extends AgentSidecarChannel.SidecarToHostFrame["type"]>(
      type: T
    ): Promise<Extract<AgentSidecarChannel.SidecarToHostFrame, { type: T }>> {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const frame = frames.find((candidate) => candidate.type === type);
        if (frame) {
          return frame as Extract<
            AgentSidecarChannel.SidecarToHostFrame,
            { type: T }
          >;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error(`frame not observed: ${type}`);
    },
    async untilFrames<T extends AgentSidecarChannel.SidecarToHostFrame["type"]>(
      type: T,
      count: number
    ): Promise<
      Array<Extract<AgentSidecarChannel.SidecarToHostFrame, { type: T }>>
    > {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const matching = frames.filter(
          (
            frame
          ): frame is Extract<
            AgentSidecarChannel.SidecarToHostFrame,
            { type: T }
          > => frame.type === type
        );
        if (matching.length >= count) return matching;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error(`${count} frames not observed: ${type}`);
    },
  };
}

class FirstWriteBlockedTransform extends Transform {
  private blockedCallback: ((error?: Error | null) => void) | null = null;
  private blockedResolve: (() => void) | null = null;
  private readonly blocked = new Promise<void>((resolve) => {
    this.blockedResolve = resolve;
  });
  private writes = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.push(chunk);
    this.writes += 1;
    if (this.writes === 1) {
      this.blockedCallback = callback;
      this.blockedResolve?.();
      this.blockedResolve = null;
      return;
    }
    callback();
  }

  untilBlocked(): Promise<void> {
    return this.blocked;
  }

  release(): void {
    const callback = this.blockedCallback;
    this.blockedCallback = null;
    callback?.();
  }
}
