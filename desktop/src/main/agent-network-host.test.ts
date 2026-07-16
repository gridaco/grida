import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { net, session } from "electron";

vi.mock("electron", () => ({
  session: {
    fromPartition:
      vi.fn<(partition: string, options?: { cache?: boolean }) => unknown>(),
  },
  net: { request: vi.fn<(...args: unknown[]) => unknown>() },
}));

import { AgentSidecarChannel } from "../agent-sidecar-channel";
import { AgentNetworkAuthority } from "./agent-network-authority";
import {
  AgentNetworkHost,
  requestThroughSession,
  responseFromIncoming,
} from "./agent-network-host";

describe("AgentNetworkHost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses one nonpersistent Chromium network context across restarts", async () => {
    const setProxy = vi.fn<(config: unknown) => Promise<void>>(
      async () => undefined
    );
    vi.mocked(session.fromPartition).mockReturnValue({ setProxy } as never);
    const authority = new AgentNetworkAuthority("https://grida.co");

    const first = await AgentNetworkHost.create({
      input: new PassThrough(),
      output: new PassThrough(),
      authority,
      onFatal: vi.fn<(error: Error) => void>(),
    });
    const second = await AgentNetworkHost.create({
      input: new PassThrough(),
      output: new PassThrough(),
      authority,
      onFatal: vi.fn<(error: Error) => void>(),
    });

    expect(session.fromPartition).toHaveBeenNthCalledWith(
      1,
      "grida-agent-provider",
      { cache: false }
    );
    expect(session.fromPartition).toHaveBeenNthCalledWith(
      2,
      "grida-agent-provider",
      { cache: false }
    );
    expect(setProxy).toHaveBeenCalledTimes(2);
    first.close();
    second.close();
  });

  it("safely observes ready rejection when bootstrap output fails first", async () => {
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("bootstrap pipe failed"));
      },
    });
    const host = new AgentNetworkHost(
      new PassThrough(),
      output,
      new AgentNetworkAuthority("https://grida.co"),
      { fetch: vi.fn<() => Promise<Response>>() },
      vi.fn<(error: Error) => void>()
    );
    const ready = host.waitForReady();

    await expect(
      host.bootstrap("a-secure-spawn-password", 43123)
    ).rejects.toThrow(/bootstrap pipe failed/);
    host.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(ready).rejects.toThrow(/stopped/);
  });

  it("times out grant publication even while its update write is blocked", async () => {
    vi.useFakeTimers();
    const output = new FirstWriteBlockedWritable();
    const authority = new AgentNetworkAuthority("https://grida.co");
    authority.approveCustomEndpoint("ollama", "http://localhost:11434/v1");
    const host = new AgentNetworkHost(
      new PassThrough(),
      output,
      authority,
      { fetch: vi.fn<() => Promise<Response>>() },
      vi.fn<(error: Error) => void>()
    );
    try {
      const update = host.updateGrants();
      await output.untilBlocked();
      const rejection = update.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(5_000);
      const error = await rejection;
      expect(error).toEqual(
        expect.objectContaining({
          message: expect.stringMatching(/acknowledgement timed out/),
        })
      );
    } finally {
      host.close();
      output.release();
      vi.useRealTimers();
    }
  });

  it("aborts and drains a late response after interactive proxy auth", async () => {
    const request = Object.assign(new EventEmitter(), {
      abort: vi.fn<() => void>(),
      setHeader: vi.fn<(name: string, value: string) => void>(),
      end: vi.fn<() => void>(),
    });
    vi.mocked(net.request).mockReturnValue(request as never);
    const pending = requestThroughSession(
      {} as never,
      "https://openrouter.ai/api/v1/models",
      { method: "GET" }
    );
    const callback = vi.fn<(username?: string, password?: string) => void>();

    request.emit("login", {}, callback);

    await expect(pending).rejects.toMatchObject({
      name: "AgentProxyAuthenticationError",
    });
    expect(request.abort).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);

    const late = Object.assign(Readable.from(["late"]), {
      rawHeaders: [],
      statusCode: 200,
      statusMessage: "OK",
    });
    const destroy = vi.spyOn(late, "destroy");
    request.emit("response", late);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("streams an authorized provider response only against sidecar credit", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const harness = createHarness({
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("hello world"));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "text/plain" } }
        );
      },
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_1",
      grantId: "provider:built-in",
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: [
        ["authorization", "Bearer secret"],
        ["content-type", "application/json"],
      ],
      hasBody: true,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.chunk",
      requestId: "req_1",
      sequence: 0,
      data: Buffer.from("{}").toString("base64"),
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_1",
      sequence: 1,
    });
    await harness.untilFrame("response.start");
    expect(
      harness.frames.some((frame) => frame.type === "response.chunk")
    ).toBe(false);

    await harness.sidecar.write({
      v: 1,
      type: "response.credit",
      requestId: "req_1",
      bytes: 5,
    });
    const first = await harness.untilFrame("response.chunk");
    expect(Buffer.from(first.data, "base64").toString()).toBe("hello");
    expect(harness.frames.some((frame) => frame.type === "response.end")).toBe(
      false
    );

    await harness.sidecar.write({
      v: 1,
      type: "response.credit",
      requestId: "req_1",
      bytes: 6,
    });
    await harness.untilFrame("response.end");
    const chunks = harness.frames
      .filter(
        (frame): frame is AgentSidecarChannel.ResponseChunkFrame =>
          frame.type === "response.chunk"
      )
      .map((frame) => Buffer.from(frame.data, "base64"));
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(await new Response(calls[0].init.body).text()).toBe("{}");
    harness.host.close();
  });

  it("denies ungranted destinations without invoking the network adapter", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    const harness = createHarness({
      fetch,
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_denied",
      grantId: "provider:built-in",
      method: "GET",
      url: "https://example.com/private",
      headers: [],
      hasBody: false,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_denied",
      sequence: 0,
    });
    const error = await harness.untilFrame("response.error");
    expect(error.code).toBe("denied");
    expect(fetch).not.toHaveBeenCalled();
    harness.host.close();
  });

  it("hard-bounds authorization-denied uploads in constant-time admission state", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    const harness = createHarness({ fetch });
    const admissionState = harness.host as unknown as {
      incoming: Map<string, unknown>;
      discardedIncomingCount: number;
    };
    await harness.start();

    for (let index = 0; index < 32; index += 1) {
      await harness.sidecar.write({
        v: 1,
        type: "request.start",
        requestId: `req_denied_flood_${index}`,
        grantId: "provider:built-in",
        method: "POST",
        url: "https://attacker.example/upload",
        headers: [],
        hasBody: true,
      });
    }
    expect(admissionState.incoming.size).toBe(32);
    expect(admissionState.discardedIncomingCount).toBe(32);
    expect(harness.fatal).not.toHaveBeenCalled();

    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_denied_flood_overflow",
      grantId: "provider:built-in",
      method: "POST",
      url: "https://attacker.example/upload",
      headers: [],
      hasBody: true,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.fatal).toHaveBeenCalledTimes(1);
    expect(harness.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "excessive discarded provider uploads",
      })
    );
    expect(admissionState.incoming.size).toBe(0);
    expect(admissionState.discardedIncomingCount).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    harness.host.close();
  });

  it("rejects credential-bearing cross-origin redirects", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => Response.redirect("https://api.openrouter.ai/next", 307)
    );
    const harness = createHarness({
      fetch,
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_redirect",
      grantId: "provider:built-in",
      method: "GET",
      url: "https://openrouter.ai/start",
      headers: [["authorization", "Bearer secret"]],
      hasBody: false,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_redirect",
      sequence: 0,
    });
    const error = await harness.untilFrame("response.error");
    expect(error.code).toBe("denied");
    expect(fetch).toHaveBeenCalledTimes(1);
    harness.host.close();
  });

  it("rejects cross-origin provider redirects without guessing credential shape", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => Response.redirect("https://api.openrouter.ai/next", 307)
    );
    const harness = createHarness({
      fetch,
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_redirect_query_body",
      grantId: "provider:built-in",
      method: "POST",
      url: "https://openrouter.ai/start?opaque_token=secret",
      headers: [["content-type", "application/octet-stream"]],
      hasBody: true,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.chunk",
      requestId: "req_redirect_query_body",
      sequence: 0,
      data: Buffer.from("opaque-secret-body").toString("base64"),
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_redirect_query_body",
      sequence: 1,
    });
    expect((await harness.untilFrame("response.error")).code).toBe("denied");
    expect(fetch).toHaveBeenCalledTimes(1);
    harness.host.close();
  });

  it("preserves HEAD across a same-origin 303 redirect", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const harness = createHarness({
      fetch: async (url, init) => {
        calls.push({ url, init });
        return calls.length === 1
          ? Response.redirect("https://openrouter.ai/next", 303)
          : new Response(null, { status: 204 });
      },
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_head_303",
      grantId: "provider:built-in",
      method: "HEAD",
      url: "https://openrouter.ai/start",
      headers: [["accept", "application/json"]],
      hasBody: false,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_head_303",
      sequence: 0,
    });
    await harness.untilFrame("response.end");

    expect(calls.map(({ init }) => init.method)).toEqual(["HEAD", "HEAD"]);
    expect(calls[1].init.body).toBeUndefined();
    harness.host.close();
  });

  it("drops body metadata when a 303 rewrites POST to GET", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const harness = createHarness({
      fetch: async (url, init) => {
        calls.push({ url, init });
        return calls.length === 1
          ? Response.redirect("https://openrouter.ai/next", 303)
          : new Response(null, { status: 204 });
      },
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_post_303",
      grantId: "provider:built-in",
      method: "POST",
      url: "https://openrouter.ai/start",
      headers: [
        ["accept", "application/json"],
        ["authorization", "Bearer secret"],
        ["content-encoding", "gzip"],
        ["content-language", "en"],
        ["content-location", "/payload"],
        ["content-type", "application/json"],
      ],
      hasBody: true,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.chunk",
      requestId: "req_post_303",
      sequence: 0,
      data: Buffer.from("payload").toString("base64"),
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_post_303",
      sequence: 1,
    });
    await harness.untilFrame("response.end");

    expect(calls).toHaveLength(2);
    expect(calls[0].init.method).toBe("POST");
    expect(await new Response(calls[0].init.body).text()).toBe("payload");
    expect(calls[1].init.method).toBe("GET");
    expect(calls[1].init.body).toBeUndefined();
    const redirectedHeaders = new Headers(calls[1].init.headers);
    expect(redirectedHeaders.get("accept")).toBe("application/json");
    expect(redirectedHeaders.get("authorization")).toBe("Bearer secret");
    for (const name of [
      "content-encoding",
      "content-language",
      "content-length",
      "content-location",
      "content-type",
    ]) {
      expect(redirectedHeaders.has(name)).toBe(false);
    }
    harness.host.close();
  });

  it("does not turn the provider-asset lane into arbitrary public fetch", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    const harness = createHarness({
      fetch,
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_download",
      grantId: "download:provider-assets",
      method: "GET",
      url: "https://attacker.example/encoded-secret",
      headers: [],
      hasBody: false,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_download",
      sequence: 0,
    });
    const error = await harness.untilFrame("response.error");
    expect(error.code).toBe("denied");
    expect(fetch).not.toHaveBeenCalled();
    harness.host.close();
  });

  it("waits for the sidecar to acknowledge a grant revision", async () => {
    const harness = createHarness({
      fetch: vi.fn<() => Promise<Response>>(),
    });
    await harness.start();
    harness.authority.approveCustomEndpoint(
      "ollama",
      "http://localhost:11434/v1"
    );
    let settled = false;
    const update = harness.host.updateGrants().then(() => {
      settled = true;
    });
    const frame = await harness.untilFrame("grant.update");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    await harness.sidecar.write({
      v: 1,
      type: "grant.applied",
      revision: frame.revision,
    });
    await update;
    expect(settled).toBe(true);
    harness.host.close();
  });

  it("re-authorizes a held request against revocation before execution", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    const harness = createHarness({ fetch });
    harness.authority.approveCustomEndpoint(
      "ollama",
      "http://localhost:11434/v1"
    );
    const grant = harness.authority
      .grants()
      .find((candidate) => candidate.id.startsWith("provider:custom:"))!;
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_stale",
      grantId: grant.id,
      method: "GET",
      url: "http://localhost:11434/api/tags",
      headers: [],
      hasBody: false,
    });
    harness.authority.revokeCustomEndpoint("ollama");
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_stale",
      sequence: 0,
    });
    expect((await harness.untilFrame("response.error")).code).toBe("denied");
    expect(fetch).not.toHaveBeenCalled();
    harness.host.close();
  });

  it("withholds remote custom hostnames because route checks are not atomic", async () => {
    const harness = createHarness({
      fetch: vi.fn<() => Promise<Response>>(),
    });
    await expect(
      harness.host.describeCustomEndpoint("https://llm.example/v1")
    ).rejects.toThrow(/remote custom provider hostnames are unavailable/);
    await expect(
      harness.host.describeCustomEndpoint("http://localhost:11434/v1")
    ).resolves.toMatchObject({
      origin: "http://localhost:11434",
    });
    await expect(
      harness.host.describeCustomEndpoint("http://ollama.local:11434/v1")
    ).rejects.toThrow(/remote custom provider hostnames are unavailable/);
    harness.host.close();
  });

  it("returns bounded per-request overload instead of killing shared work", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 204 })
    );
    const harness = createHarness({ fetch });
    await harness.start();
    for (let index = 0; index < 33; index += 1) {
      await harness.sidecar.write({
        v: 1,
        type: "request.start",
        requestId: `req_capacity_${index}`,
        grantId: "provider:built-in",
        method: "GET",
        url: "https://openrouter.ai/api/v1/models",
        headers: [],
        hasBody: false,
      });
    }

    const error = await harness.untilFrame("response.error");
    expect(error.requestId).toBe("req_capacity_32");
    expect(error.code).toBe("overloaded");
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_capacity_32",
      sequence: 0,
    });

    expect(harness.fatal).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    harness.host.close();
  });

  it("bounds aggregate buffered uploads in Electron main", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () =>
        await new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const harness = createHarness({
      fetch,
      maxBufferedRequestBodyBytes: 4,
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_memory_held",
      grantId: "provider:built-in",
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: [["content-type", "application/json"]],
      hasBody: true,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.chunk",
      requestId: "req_memory_held",
      sequence: 0,
      data: Buffer.from("1234").toString("base64"),
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_memory_held",
      sequence: 1,
    });
    for (
      let attempt = 0;
      attempt < 20 && fetch.mock.calls.length === 0;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(fetch).toHaveBeenCalledTimes(1);

    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_memory_overflow",
      grantId: "provider:built-in",
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: [["content-type", "application/json"]],
      hasBody: true,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.chunk",
      requestId: "req_memory_overflow",
      sequence: 0,
      data: Buffer.from("x").toString("base64"),
    });

    const error = await harness.untilFrame("response.error");
    expect(error.requestId).toBe("req_memory_overflow");
    expect(error.code).toBe("overloaded");
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_memory_overflow",
      sequence: 1,
    });
    expect(harness.fatal).not.toHaveBeenCalled();
    resolveFirst(new Response(null, { status: 204 }));
    await harness.untilFrame("response.end");
    harness.host.close();
  });

  it("expires a discarded upload without a second terminal error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const harness = createHarness({
      fetch: vi.fn<() => Promise<Response>>(),
      maxBufferedRequestBodyBytes: 4,
    });
    const releaseRequestBody = vi.spyOn(
      harness.host as unknown as {
        releaseRequestBody(request: unknown): void;
      },
      "releaseRequestBody"
    );
    try {
      await harness.start();
      await harness.sidecar.write({
        v: 1,
        type: "request.start",
        requestId: "req_discard_timeout",
        grantId: "provider:built-in",
        method: "POST",
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: [["content-type", "application/json"]],
        hasBody: true,
      });
      await harness.sidecar.write({
        v: 1,
        type: "request.chunk",
        requestId: "req_discard_timeout",
        sequence: 0,
        data: Buffer.from("1234").toString("base64"),
      });
      await harness.sidecar.write({
        v: 1,
        type: "request.chunk",
        requestId: "req_discard_timeout",
        sequence: 1,
        data: Buffer.from("x").toString("base64"),
      });
      const firstError = await harness.untilFrame("response.error");
      expect(firstError).toMatchObject({
        requestId: "req_discard_timeout",
        code: "overloaded",
      });
      expect(releaseRequestBody).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(releaseRequestBody).toHaveBeenCalledTimes(2);
      expect(
        harness.frames.filter(
          (frame) =>
            frame.type === "response.error" &&
            frame.requestId === "req_discard_timeout"
        )
      ).toHaveLength(1);
      expect(
        (harness.host as unknown as { incoming: Map<string, unknown> }).incoming
          .size
      ).toBe(0);
      expect(harness.fatal).not.toHaveBeenCalled();
    } finally {
      harness.host.close();
      vi.useRealTimers();
    }
  });

  it("ignores credit that races a response ending exactly at the window", async () => {
    const bytes = new Uint8Array(128 * 1024);
    const harness = createHarness({
      fetch: async () => new Response(bytes),
    });
    await harness.start();
    await harness.sidecar.write({
      v: 1,
      type: "request.start",
      requestId: "req_exact_credit",
      grantId: "provider:built-in",
      method: "GET",
      url: "https://openrouter.ai/api/v1/models",
      headers: [],
      hasBody: false,
    });
    await harness.sidecar.write({
      v: 1,
      type: "request.end",
      requestId: "req_exact_credit",
      sequence: 0,
    });
    await harness.untilFrame("response.start");
    await harness.sidecar.write({
      v: 1,
      type: "response.credit",
      requestId: "req_exact_credit",
      bytes: 128 * 1024,
    });
    await harness.untilFrame("response.end");
    await harness.sidecar.write({
      v: 1,
      type: "response.credit",
      requestId: "req_exact_credit",
      bytes: 128 * 1024,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(harness.fatal).not.toHaveBeenCalled();
    harness.host.close();
  });

  it("removes stale wire-encoding headers from Electron-decoded bodies", async () => {
    const incoming = Object.assign(
      Readable.from([Buffer.from("decoded response")]),
      {
        rawHeaders: [
          "content-encoding",
          "gzip",
          "content-length",
          "43",
          "content-type",
          "text/plain",
        ],
        statusCode: 200,
        statusMessage: "OK",
      }
    );

    const response = responseFromIncoming(incoming as never, "GET");

    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("decoded response");
  });

  it("retains representation metadata on a HEAD response", () => {
    const incoming = Object.assign(Readable.from([]), {
      rawHeaders: ["content-encoding", "gzip", "content-length", "43"],
      statusCode: 200,
      statusMessage: "OK",
    });

    const response = responseFromIncoming(incoming as never, "HEAD");

    expect(response.body).toBeNull();
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("content-length")).toBe("43");
  });
});

function createHarness(adapter: {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  maxBufferedRequestBodyBytes?: number;
}) {
  const sidecarOutput = new PassThrough();
  const sidecarInput = new PassThrough();
  const authority = new AgentNetworkAuthority("https://grida.co");
  const fatal = vi.fn<(error: Error) => void>();
  const host = new AgentNetworkHost(
    sidecarOutput,
    sidecarInput,
    authority,
    adapter,
    fatal,
    adapter.maxBufferedRequestBodyBytes
  );
  const sidecar = new AgentSidecarChannel.Writer(sidecarOutput);
  const decoder = new AgentSidecarChannel.Decoder();
  const frames: AgentSidecarChannel.HostToSidecarFrame[] = [];
  sidecarInput.on("data", (chunk: Buffer) => {
    for (const frame of decoder.push(chunk)) {
      frames.push(frame as AgentSidecarChannel.HostToSidecarFrame);
    }
  });
  return {
    host,
    authority,
    fatal,
    sidecar,
    frames,
    async start() {
      const ready = host.waitForReady();
      await host.bootstrap("a-secure-spawn-password", 43123);
      await sidecar.write({ v: 1, type: "ready", port: 43123 });
      await expect(ready).resolves.toBe(43123);
    },
    async untilFrame<T extends AgentSidecarChannel.HostToSidecarFrame["type"]>(
      type: T
    ): Promise<Extract<AgentSidecarChannel.HostToSidecarFrame, { type: T }>> {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const frame = frames.find((candidate) => candidate.type === type);
        if (frame) {
          return frame as Extract<
            AgentSidecarChannel.HostToSidecarFrame,
            { type: T }
          >;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error(`frame not observed: ${type}`);
    },
  };
}

class FirstWriteBlockedWritable extends Writable {
  private blockedCallback: ((error?: Error | null) => void) | null = null;
  private blockedResolve: (() => void) | null = null;
  private readonly blocked = new Promise<void>((resolve) => {
    this.blockedResolve = resolve;
  });
  private writes = 0;

  override _write(
    _chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
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
