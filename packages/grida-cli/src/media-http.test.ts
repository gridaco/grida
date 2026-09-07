// GRIDA-SEC-013 — synthetic socket proof of the CLI media authority boundary.
import { EventEmitter } from "node:events";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaHttp } from "./media-http";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn<typeof lookup>() }));
vi.mock("node:http", async (original) => {
  const module = await original<typeof import("node:http")>();
  return {
    ...module,
    default: { ...module, request: vi.fn<typeof http.request>() },
  };
});
vi.mock("node:https", async (original) => {
  const module = await original<typeof import("node:https")>();
  return {
    ...module,
    default: { ...module, request: vi.fn<typeof http.request>() },
  };
});

type Options = https.RequestOptions & { autoSelectFamily: false };
type Fixture = {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
  hold?: boolean;
  noResponse?: boolean;
};
class ResponseBody extends PassThrough {
  statusCode: number;
  rawHeaders: string[];
  complete = false;
  constructor(fixture: Fixture) {
    super();
    this.statusCode = fixture.status ?? 200;
    this.rawHeaders = Object.entries(fixture.headers ?? {}).flat();
  }
}
class RequestSocket extends EventEmitter {
  readonly destroy = vi.fn<() => RequestSocket>(() => {
    this.removeAbort();
    return this;
  });
  readonly setTimeout = vi.fn<
    (ms: number, callback: () => void) => RequestSocket
  >(() => this);
  readonly end: (body?: Buffer) => void;
  readonly response: ResponseBody;
  body?: Buffer;
  removeAbort = () => {};
  constructor(
    readonly options: Options,
    fixture: Fixture,
    callback: (value: http.IncomingMessage) => void
  ) {
    super();
    this.response = new ResponseBody(fixture);
    const aborted = () =>
      this.emit("error", new Error("private socket diagnostics"));
    options.signal?.addEventListener("abort", aborted, { once: true });
    this.removeAbort = () =>
      options.signal?.removeEventListener("abort", aborted);
    this.end = (body) => {
      this.body = body;
      queueMicrotask(() => {
        if (fixture.noResponse) return;
        callback(this.response as unknown as http.IncomingMessage);
        if (this.response.destroyed || fixture.hold) return;
        for (const chunk of fixture.chunks ?? [Buffer.from("ok")])
          this.response.write(chunk);
        this.response.complete = true;
        this.response.end();
      });
    };
  }
}
let fixtures: Fixture[];
let sockets: RequestSocket[];
let host: MediaHttp;
const openrouter = "https://openrouter.ai/api/v1/images";
const json = {
  method: "POST",
  headers: {
    authorization: "Bearer synthetic-key",
    "content-type": "application/json",
  },
  body: '{"prompt":"synthetic"}',
};

beforeEach(() => {
  vi.clearAllMocks();
  fixtures = [];
  sockets = [];
  host = new MediaHttp();
  vi.mocked(lookup).mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ] as never);
  const create = (
    options: Options,
    callback: (response: http.IncomingMessage) => void
  ) => {
    const socket = new RequestSocket(options, fixtures.shift() ?? {}, callback);
    sockets.push(socket);
    return socket as unknown as http.ClientRequest;
  };
  vi.mocked(http.request).mockImplementation(create as typeof http.request);
  vi.mocked(https.request).mockImplementation(create as typeof https.request);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("ambient fetch must not run");
    })
  );
});
afterEach(() => {
  for (const socket of sockets) {
    socket.removeAbort();
    socket.response.destroy();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function refused(input: string, init?: RequestInit, download = false) {
  await expect(
    (download ? host.transport.download : host.transport.request)(input, init)
  ).rejects.toThrow("media_transport_failed");
}
async function ready() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

describe("MediaHttp provider authority", () => {
  it("pins checked DNS with original TLS authority and no pooled or ambient transport", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.invalid:8080");
    vi.stubEnv("NODE_USE_ENV_PROXY", "1");
    const response = await host.transport.request(openrouter, json);
    expect(await response.text()).toBe("ok");
    expect(lookup).toHaveBeenCalledExactlyOnceWith("openrouter.ai", {
      all: true,
      verbatim: true,
    });
    const options = sockets[0]!.options;
    expect(options).toMatchObject({
      protocol: "https:",
      hostname: "openrouter.ai",
      servername: "openrouter.ai",
      rejectUnauthorized: true,
      family: 4,
      autoSelectFamily: false,
      agent: false,
      path: "/api/v1/images",
      maxHeaderSize: 32768,
    });
    expect(options).not.toHaveProperty("proxyEnv");
    const pinned = vi.fn<(...args: unknown[]) => void>();
    options.lookup!("openrouter.ai", { family: 4 }, pinned);
    expect(pinned).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(options.headers).toMatchObject({
      authorization: "Bearer synthetic-key",
      "accept-encoding": "identity",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "https://queue.fal.run/fal-ai/fixture",
      "POST",
      {
        authorization: "Key synthetic-fal",
        "content-type": "application/json",
      },
    ],
    [
      "https://queue.fal.run/fal-ai/fixture/requests/id/status",
      "GET",
      { authorization: "Key synthetic-fal" },
    ],
    [
      "https://api.elevenlabs.io/v2/voices?page_size=100",
      "GET",
      { "xi-api-key": "synthetic-eleven" },
    ],
    [
      "https://api.elevenlabs.io/v1/text-to-speech/voice?output_format=mp3_44100_128",
      "POST",
      { "xi-api-key": "synthetic-eleven", "content-type": "application/json" },
    ],
    [
      "https://api.elevenlabs.io/v1/sound-generation",
      "POST",
      { "xi-api-key": "synthetic-eleven", "content-type": "application/json" },
    ],
    [
      "https://ai-gateway.vercel.sh/v3/ai/image-model",
      "POST",
      {
        authorization: "Bearer synthetic-gateway",
        "content-type": "application/json",
        "ai-model-id": "fixture",
        "ai-image-model-specification-version": "3",
        "ai-gateway-protocol-version": "0.0.1",
        "ai-gateway-auth-method": "api-key",
        "user-agent": "synthetic-sdk",
      },
    ],
    [
      "https://ai-gateway.vercel.sh/v3/ai/video-model",
      "POST",
      {
        authorization: "Bearer synthetic-gateway",
        "content-type": "application/json",
        "ai-video-model-specification-version": "3",
      },
    ],
    [
      "https://openrouter.ai/api/v1/videos/job/content?index=0",
      "GET",
      { authorization: "Bearer synthetic-key" },
    ],
    [
      "https://video.openrouter.ai/jobs/id",
      "GET",
      { authorization: "Bearer synthetic-key" },
    ],
  ] as const)(
    "admits only the current wire at %s",
    async (url, method, headers) => {
      const response = await host.transport.request(url, {
        method,
        headers,
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      expect(await response.text()).toBe("ok");
      expect(sockets).toHaveLength(1);
    }
  );

  it.each([
    "https://openrouter.ai.evil.invalid/api/v1/images",
    "https://api.openrouter.invalid/api/v1/images",
    "https://openrouter.ai./api/v1/images",
    "http://openrouter.ai/api/v1/images",
    "https://openrouter.ai:444/api/v1/images",
    "https://user@openrouter.ai/api/v1/images",
    "https://openrouter.ai/api/v1/images#private",
    "https://openrouter.ai/api/v1/chat/completions",
    "https://fal.run/model",
    "https://api.elevenlabs.io/v1/user",
    "https://ai-gateway.vercel.sh/v3/chat/completions",
  ])("refuses ungranted credential destination %s before DNS", async (url) => {
    await refused(url, json);
    expect(lookup).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it.each([
    "cookie",
    "host",
    "proxy-authorization",
    "connection",
    "content-length",
    "xi-api-key",
    "ai-model-id",
  ])("refuses injected %s header before DNS", async (name) => {
    await refused(openrouter, {
      ...json,
      headers: { ...json.headers, [name]: "synthetic" },
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not confuse credential families or permit automatic redirects", async () => {
    await refused("https://queue.fal.run/model", json);
    await refused("https://api.elevenlabs.io/v1/sound-generation", json);
    await refused(openrouter, {
      ...json,
      headers: { ...json.headers, authorization: "Key synthetic" },
    });
    await refused(openrouter, { ...json, redirect: "follow" });
    await refused(openrouter, { ...json, credentials: "include" });
    expect(sockets).toHaveLength(0);
  });

  it("rejects provider redirects without a second request or credential replay", async () => {
    fixtures.push({
      status: 307,
      headers: { location: "https://openrouter.ai/api/v1/images" },
    });
    await refused(openrouter, json);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.response.destroyed).toBe(true);
    expect(sockets[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("preserves status for bounded HTTP failures without exposing cookies", async () => {
    fixtures.push({
      status: 401,
      headers: {
        "set-cookie": "private-cookie",
        "content-type": "application/json",
      },
      chunks: [Buffer.from('{"error":"denied"}')],
    });
    const response = await host.transport.request(openrouter, json);
    expect(response.status).toBe(401);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.json()).toEqual({ error: "denied" });
  });

  it.each([401, 403])(
    "preserves status %s while discarding an oversized error body",
    async (status) => {
      fixtures.push({
        status,
        headers: { "content-length": String(256 * 1024 * 1024 + 1) },
        hold: true,
      });
      const response = await host.transport.request(openrouter, json);
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
      expect(sockets[0]!.response.destroyed).toBe(true);
    }
  );

  it("snapshots caller headers, URL and bytes before DNS awaits", async () => {
    const pending = deferred<[{ address: string; family: number }]>();
    vi.mocked(lookup).mockReturnValueOnce(pending.promise as never);
    const target = new URL(openrouter);
    const headers = new Headers(json.headers);
    const body = new Uint8Array([123, 125]);
    const operation = host.transport.request(target, {
      method: "POST",
      headers,
      body,
    });
    target.hostname = "evil.invalid";
    headers.set("authorization", "Bearer rotated");
    body.fill(0);
    pending.resolve([{ address: "93.184.216.34", family: 4 }]);
    expect(await (await operation).text()).toBe("ok");
    expect(sockets[0]!.options.hostname).toBe("openrouter.ai");
    expect(sockets[0]!.options.headers).toHaveProperty(
      "authorization",
      "Bearer synthetic-key"
    );
    expect(sockets[0]!.body).toEqual(Buffer.from("{}"));
  });

  it("admits GG only at the explicit trusted fixture origin and fixed media routes", async () => {
    await refused("http://127.0.0.1:3041/api/v1/ai/music/generations", json);
    expect(() => new MediaHttp({ ggOrigin: "http://localhost:3041" })).toThrow(
      "media_transport_failed"
    );
    host = new MediaHttp({ ggOrigin: "http://127.0.0.1:3041" });
    for (const kind of ["images", "videos", "music"]) {
      expect(
        await (
          await host.transport.request(
            `http://127.0.0.1:3041/api/v1/ai/${kind}/generations`,
            json
          )
        ).text()
      ).toBe("ok");
    }
    await refused("http://127.0.0.1:3041/api/v1/auth/me", json);
    await refused("http://127.0.0.1:3042/api/v1/ai/music/generations", json);
    expect(lookup).not.toHaveBeenCalled();
    expect(http.request).toHaveBeenCalledTimes(3);
  });
});

describe("MediaHttp public download authority", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "0.0.0.0",
    "192.0.2.1",
    "198.18.0.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "[::1]",
    "[::]",
    "[::ffff:127.0.0.1]",
    "[64:ff9b::7f00:1]",
    "[fc00::1]",
    "[fe80::1]",
    "[2001:db8::1]",
    "[2002:7f00:1::]",
  ])("refuses private and special address %s", async (address) => {
    await refused(`https://${address}/asset`, undefined, true);
    expect(sockets).toHaveLength(0);
  });

  it("rejects a mixed public/private DNS answer instead of picking the public answer", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await refused("https://asset.example/clip", undefined, true);
    expect(sockets).toHaveLength(0);
  });

  it("pins public IPv6 without a second DNS resolution", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "2606:4700:4700::1111", family: 6 },
    ] as never);
    expect(
      await (await host.transport.download("https://asset.example/clip")).text()
    ).toBe("ok");
    expect(sockets[0]!.options.family).toBe(6);
    const pinned = vi.fn<(...args: unknown[]) => void>();
    sockets[0]!.options.lookup!("asset.example", { all: true }, pinned);
    expect(pinned).toHaveBeenCalledWith(null, [
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it.each([
    { authorization: "Bearer private" },
    { "xi-api-key": "private" },
    { cookie: "private" },
  ])("forbids every credential in the download lane", async (headers) => {
    await refused("https://asset.example/clip", { headers }, true);
    expect(sockets).toHaveLength(0);
  });

  it("revalidates and re-resolves every redirect without credentials", async () => {
    fixtures.push(
      { status: 302, headers: { location: "https://second.example/final" } },
      {}
    );
    expect(
      await (
        await host.transport.download("https://first.example/asset")
      ).text()
    ).toBe("ok");
    expect(lookup).toHaveBeenNthCalledWith(1, "first.example", {
      all: true,
      verbatim: true,
    });
    expect(lookup).toHaveBeenNthCalledWith(2, "second.example", {
      all: true,
      verbatim: true,
    });
    expect(sockets[0]!.response.destroyed).toBe(true);
    for (const socket of sockets)
      expect(socket.options.headers).toEqual({ "accept-encoding": "identity" });
  });

  it.each([
    "http://asset.example/clip",
    "https://127.0.0.1/private",
    "https://user:secret@asset.example/clip",
    "https://asset.example:444/clip",
  ])("refuses redirected target %s before connecting", async (location) => {
    fixtures.push({ status: 302, headers: { location } });
    await refused("https://asset.example/clip", undefined, true);
    expect(sockets).toHaveLength(1);
  });

  it("rejects DNS rebinding on a same-host redirect", async () => {
    fixtures.push({ status: 302, headers: { location: "/next" } });
    vi.mocked(lookup)
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }] as never);
    await refused("https://asset.example/clip", undefined, true);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(1);
  });

  it("caps redirects at three without a fifth request", async () => {
    fixtures.push(
      ...Array.from({ length: 4 }, () => ({
        status: 302,
        headers: { location: "/next" },
      }))
    );
    await refused("https://asset.example/clip", undefined, true);
    expect(sockets).toHaveLength(4);
    expect(sockets.every((socket) => socket.response.destroyed)).toBe(true);
  });
});

describe("MediaHttp cancellation and bounded streams", () => {
  it("rejects a pre-aborted operation before DNS or connection", async () => {
    await expect(
      host.transport.request(openrouter, {
        ...json,
        signal: AbortSignal.abort(),
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ignores late DNS after cancellation and never submits", async () => {
    const pending = deferred<[{ address: string; family: number }]>();
    vi.mocked(lookup).mockReturnValueOnce(pending.promise as never);
    const controller = new AbortController();
    const result = host.transport.request(openrouter, {
      ...json,
      signal: controller.signal,
    });
    const rejected = result.catch((error: unknown) => error);
    controller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    pending.resolve([{ address: "93.184.216.34", family: 4 }]);
    await ready();
    expect(sockets).toHaveLength(0);
  });

  it("bounds DNS and observes late rejections without submitting", async () => {
    vi.useFakeTimers();
    const pending = deferred<never>();
    vi.mocked(lookup).mockReturnValueOnce(pending.promise);
    const result = refused(openrouter, json);
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    pending.reject(new Error("secret DNS diagnostic"));
    await ready();
    expect(sockets).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks elapsed DNS time even before the deadline timer runs", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const pending = deferred<[{ address: string; family: number }]>();
    vi.mocked(lookup).mockReturnValueOnce(pending.promise as never);
    const result = refused(openrouter, json);
    now.mockReturnValue(5000);
    pending.resolve([{ address: "93.184.216.34", family: 4 }]);
    await result;
    expect(sockets).toHaveLength(0);
  });

  it("bounds connection setup without retrying a paid request", async () => {
    vi.useFakeTimers();
    fixtures.push({ noResponse: true });
    const result = refused(openrouter, json);
    await ready();
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts an open request and observes late socket errors safely", async () => {
    fixtures.push({ noResponse: true });
    const controller = new AbortController();
    const result = host.transport.request(openrouter, {
      ...json,
      signal: controller.signal,
    });
    const rejected = result.catch((error: unknown) => error);
    await ready();
    controller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    expect(sockets[0]!.destroy).toHaveBeenCalledOnce();
    sockets[0]!.emit("error", new Error("late private diagnostic"));
    expect(sockets).toHaveLength(1);
  });

  it("destroys a retained response when the consumer cancels", async () => {
    vi.useFakeTimers();
    fixtures.push({ hold: true });
    const response = await host.transport.download(
      "https://asset.example/clip"
    );
    const reader = response.body!.getReader();
    await reader.cancel();
    reader.releaseLock();
    expect(sockets[0]!.response.destroyed).toBe(true);
    expect(sockets[0]!.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains a whole-request deadline after headers and destroys the unread body", async () => {
    vi.useFakeTimers();
    fixtures.push({ hold: true });
    const response = await host.transport.download(
      "https://asset.example/clip"
    );
    const result = response.text().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(await result).toMatchObject({ name: "AbortError" });
    expect(sockets[0]!.response.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("enforces the streamed byte cap without buffering the full body", async () => {
    fixtures.push({ hold: true });
    const response = await host.transport.download(
      "https://asset.example/clip"
    );
    const reader = response.body!.getReader();
    // Reuse one 1MiB chunk and consume each result: fixture memory stays small.
    const chunk = Buffer.alloc(1024 * 1024);
    for (let index = 0; index < 256; index++) {
      const read = reader.read();
      sockets[0]!.response.write(chunk);
      expect((await read).value?.byteLength).toBe(chunk.byteLength);
    }
    const read = reader.read().catch((error: unknown) => error);
    sockets[0]!.response.write(chunk);
    expect(await read).toMatchObject({ message: "media_transport_failed" });
    reader.releaseLock();
    expect(sockets[0]!.response.destroyed).toBe(true);
    expect(sockets[0]!.destroy).toHaveBeenCalledOnce();
  });

  it.each<Record<string, string>>([
    { "content-length": String(256 * 1024 * 1024 + 1) },
    { "content-length": "not-a-length" },
    { "content-encoding": "gzip" },
  ])(
    "refuses unsafe response framing and releases the connection",
    async (headers) => {
      fixtures.push({ headers });
      await refused("https://asset.example/clip", undefined, true);
      expect(sockets[0]!.response.destroyed).toBe(true);
    }
  );

  it("redacts DNS and request errors instead of retaining their URLs or secrets", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(
      new Error("secret-key https://private.example")
    );
    await refused(openrouter, json);
    vi.mocked(https.request).mockImplementationOnce(() => {
      throw new Error("private-key request diagnostic");
    });
    await refused(openrouter, json);
    expect(sockets).toHaveLength(0);
  });
});
