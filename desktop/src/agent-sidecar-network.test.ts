import { PassThrough, Transform } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { AgentSidecarChannel } from "./agent-sidecar-channel";
import { AgentSidecarNetwork } from "./agent-sidecar-network";

describe("AgentSidecarNetwork", () => {
  it("executes a host command and reconstructs the daemon shell result", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const result = harness.network.shellExecutor(
      {
        cmd: "node",
        args: ["script.js", "--mode=test"],
        cwd: "/workspace/project",
        timeout_ms: 12_345,
      },
      {
        workspace_root: "/workspace",
        scratch_root: "/scratch/session-1",
        scratch_base: "/scratch",
        protected_read_roots: ["/agent-home"],
      }
    );

    const request = await harness.untilFrame("command.request");
    expect(request).toEqual({
      v: 1,
      type: "command.request",
      requestId: request.requestId,
      command: "node",
      args: ["script.js", "--mode=test"],
      workdir: "/workspace/project",
      timeoutMs: 12_345,
      workspaceRoot: "/workspace",
      scratchDir: "/scratch/session-1",
    });
    await harness.host.write({
      v: 1,
      type: "command.output",
      requestId: request.requestId,
      stream: "stdout",
      sequence: 0,
      data: "hello, ",
    });
    await harness.host.write({
      v: 1,
      type: "command.output",
      requestId: request.requestId,
      stream: "stderr",
      sequence: 1,
      data: "warning\n",
    });
    await harness.host.write({
      v: 1,
      type: "command.output",
      requestId: request.requestId,
      stream: "stdout",
      sequence: 2,
      data: "세계\n",
    });
    await harness.host.write({
      v: 1,
      type: "command.end",
      requestId: request.requestId,
      sequence: 3,
      exitCode: 0,
      signal: null,
      timedOut: false,
      truncated: false,
      durationMs: 42,
    });

    await expect(result).resolves.toEqual({
      cmd: "node",
      args: ["script.js", "--mode=test"],
      cwd: "/workspace/project",
      exit_code: 0,
      signal: null,
      stdout: "hello, 세계\n",
      stderr: "warning\n",
      duration_ms: 42,
      timed_out: false,
      truncated: false,
    });
    harness.network.close();
  });

  it("omits absent optional command scope fields and propagates host errors", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const result = harness.network.shellExecutor(
      { cmd: "pwd", args: [], cwd: "/workspace" },
      {
        workspace_root: "/workspace",
        protected_read_roots: [],
      }
    );
    const request = await harness.untilFrame("command.request");
    expect(request).not.toHaveProperty("timeoutMs");
    expect(request).not.toHaveProperty("scratchDir");

    const rejection = result.catch((error: unknown) => error);
    await harness.host.write({
      v: 1,
      type: "command.error",
      requestId: request.requestId,
      message: "host refused the command scope",
    });
    expect(await rejection).toMatchObject({
      message: expect.stringMatching(/refused the command scope/),
    });
    harness.network.close();
  });

  it("sends command.abort and ignores a terminal response that races cancellation", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const fatal = vi.fn<(error: Error) => void>();
    harness.network.onFatal(fatal);
    const controller = new AbortController();
    const result = harness.network.shellExecutor(
      { cmd: "sleep", args: ["60"], cwd: "/workspace" },
      {
        workspace_root: "/workspace",
        protected_read_roots: [],
      },
      controller.signal
    );
    const request = await harness.untilFrame("command.request");
    let settled = false;
    void result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );

    controller.abort("user stopped the turn");

    await expect(harness.untilFrame("command.abort")).resolves.toEqual({
      v: 1,
      type: "command.abort",
      requestId: request.requestId,
      reason: "caller aborted",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    // Main may have already queued output before it observes command.abort.
    // Those frames belong to the cancelled generation and are not a protocol
    // violation.
    await harness.host.write({
      v: 1,
      type: "command.output",
      requestId: request.requestId,
      stream: "stdout",
      sequence: 0,
      data: "late",
    });
    await harness.host.write({
      v: 1,
      type: "command.end",
      requestId: request.requestId,
      sequence: 1,
      exitCode: null,
      signal: "SIGTERM",
      timedOut: false,
      truncated: false,
      durationMs: 1,
    });
    await harness.host.write({
      v: 1,
      type: "command.error",
      requestId: request.requestId,
      message: "late host failure",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fatal).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    await harness.host.write({
      v: 1,
      type: "command.aborted",
      requestId: request.requestId,
    });
    await expect(result).rejects.toMatchObject({
      name: "AbortError",
      message: "user stopped the turn",
    });
    expect(settled).toBe(true);
    harness.network.close();
  });

  it("fails the generation when command.request delivery is ambiguous", async () => {
    const sidecarOutput = new NthWriteFailingTransform(1);
    const harness = createHarness(sidecarOutput);
    await harness.bootstrap();
    const fatal = new Promise<Error>((resolve) => {
      harness.network.onFatal(resolve);
    });

    const result = harness.network.shellExecutor(
      { cmd: "sleep", args: ["60"], cwd: "/workspace" },
      {
        workspace_root: "/workspace",
        protected_read_roots: [],
      }
    );
    const rejection = result.catch((error: unknown) => error);

    // The bytes reached the peer-facing stream before its completion callback
    // failed, so main could already own a live worker.
    await expect(harness.untilFrame("command.request")).resolves.toMatchObject({
      type: "command.request",
      command: "sleep",
    });
    expect(await rejection).toMatchObject({
      message: expect.stringMatching(/request delivery failed/),
    });
    await expect(fatal).resolves.toMatchObject({
      message: expect.stringMatching(/request delivery failed/),
    });
  });

  it("fails the channel on an out-of-sequence command response", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const fatal = new Promise<Error>((resolve) => {
      harness.network.onFatal(resolve);
    });
    const result = harness.network.shellExecutor(
      { cmd: "pwd", args: [], cwd: "/workspace" },
      {
        workspace_root: "/workspace",
        protected_read_roots: [],
      }
    );
    const rejection = result.catch((error: unknown) => error);
    const request = await harness.untilFrame("command.request");
    await harness.host.write({
      v: 1,
      type: "command.output",
      requestId: request.requestId,
      stream: "stdout",
      sequence: 1,
      data: "out of order",
    });

    expect((await fatal).message).toMatch(/sequence mismatch/);
    expect(await rejection).toMatchObject({
      message: expect.stringMatching(/sequence mismatch/),
    });
  });

  it("caps cumulative command output even when every frame is legal", async () => {
    const harness = createHarness();
    await harness.bootstrap();
    const fatal = new Promise<Error>((resolve) => {
      harness.network.onFatal(resolve);
    });
    const result = harness.network.shellExecutor(
      { cmd: "noisy", args: [], cwd: "/workspace" },
      {
        workspace_root: "/workspace",
        protected_read_roots: [],
      }
    );
    const rejection = result.catch((error: unknown) => error);
    const request = await harness.untilFrame("command.request");
    const chunk = "x".repeat(
      AgentSidecarChannel.MAX_COMMAND_OUTPUT_CHUNK_BYTES
    );
    const legalChunks =
      AgentSidecarChannel.MAX_COMMAND_OUTPUT_BYTES /
      AgentSidecarChannel.MAX_COMMAND_OUTPUT_CHUNK_BYTES;
    for (let sequence = 0; sequence <= legalChunks; sequence += 1) {
      await harness.host.write({
        v: 1,
        type: "command.output",
        requestId: request.requestId,
        stream: "stdout",
        sequence,
        data: chunk,
      });
    }

    expect((await fatal).message).toMatch(/exceeded the sidecar limit/);
    expect(await rejection).toMatchObject({
      message: expect.stringMatching(/exceeded the sidecar limit/),
    });
  });

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
    const sidecarOutput = new NthWriteBlockedTransform(1);
    const harness = createHarness(sidecarOutput);
    await harness.bootstrap();
    const result = harness.network.providerHttp.request(
      "https://openrouter.ai/api/v1/chat/completions",
      { method: "POST", body: "{}" }
    );
    await sidecarOutput.untilBlocked();
    const start = await harness.untilFrame("request.start");

    await harness.host.write({
      v: 1,
      type: "response.error",
      requestId: start.requestId,
      code: "denied",
      message: "provider network request denied",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    sidecarOutput.release();

    await expect(result).rejects.toThrow(/denied/);
    expect(
      harness.frames
        .filter(
          (frame) => "requestId" in frame && frame.requestId === start.requestId
        )
        .map((frame) => frame.type)
    ).toEqual(["request.start"]);
    harness.network.close();
  });

  it("stops an upload denied while request.chunk is backpressured", async () => {
    const sidecarOutput = new NthWriteBlockedTransform(2);
    const harness = createHarness(sidecarOutput);
    await harness.bootstrap();
    const result = harness.network.providerHttp.request(
      "https://openrouter.ai/api/v1/chat/completions",
      { method: "POST", body: "x".repeat(100_000) }
    );
    await sidecarOutput.untilBlocked();
    const start = await harness.untilFrame("request.start");

    await harness.host.write({
      v: 1,
      type: "response.error",
      requestId: start.requestId,
      code: "denied",
      message: "provider network request denied",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    sidecarOutput.release();

    await expect(result).rejects.toThrow(/denied/);
    expect(
      harness.frames
        .filter(
          (frame) => "requestId" in frame && frame.requestId === start.requestId
        )
        .map((frame) => frame.type)
    ).toEqual(["request.start", "request.chunk"]);
    harness.network.close();
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

  it("delivers shutdown received during startup after registration", async () => {
    const harness = createHarness();
    await harness.host.write({ v: 1, type: "shutdown" });
    await harness.bootstrap();

    let shutdowns = 0;
    harness.network.onShutdown(() => {
      shutdowns += 1;
    });
    expect(shutdowns).toBe(1);

    await harness.host.write({ v: 1, type: "shutdown" });
    expect(shutdowns).toBe(1);
    harness.network.close();
  });
});

function createHarness(sidecarOutput: Transform = new PassThrough()) {
  const hostOutput = new PassThrough();
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

class NthWriteBlockedTransform extends Transform {
  private blockedCallback: ((error?: Error | null) => void) | null = null;
  private blockedResolve: (() => void) | null = null;
  private readonly blocked = new Promise<void>((resolve) => {
    this.blockedResolve = resolve;
  });
  private writes = 0;

  constructor(private readonly blockedWrite: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.push(chunk);
    this.writes += 1;
    if (this.writes === this.blockedWrite) {
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

class NthWriteFailingTransform extends Transform {
  private writes = 0;

  constructor(private readonly failedWrite: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.push(chunk);
    this.writes += 1;
    callback(
      this.writes === this.failedWrite
        ? new Error("simulated ambiguous pipe failure")
        : undefined
    );
  }
}
