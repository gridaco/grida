// GRIDA-GG: gateway — synthetic DNS and HTTPS socket contract; no actual network.
// GRIDA-SEC-003 / GRIDA-SEC-006 — destination, credentials, DNS pinning and redirects.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import type { LookupAddress } from "node:dns";
const network = vi.hoisted(() => ({
  lookup: vi.fn<() => Promise<LookupAddress[]>>(),
  request:
    vi.fn<
      (
        options: RequestOptions,
        receive: (response: IncomingMessage) => void
      ) => unknown
    >(),
}));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ default: { request: network.request } }));
import { GgThreeDHttp } from "../gg-three-d-http";

const key = "synthetic-server-key";
const request = () =>
  ({
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: '{"prompt":"chair"}',
    redirect: "error",
    credentials: "omit",
  }) as const;
let responseStatus = 200;
let responseHeaders: string[] = [];
let captured: RequestOptions & { autoSelectFamily?: boolean };
beforeEach(() => {
  vi.resetAllMocks();
  responseStatus = 200;
  responseHeaders = [
    "content-type",
    "application/json",
    "set-cookie",
    "never=forward",
  ];
  network.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  network.request.mockImplementation(
    (options: RequestOptions, receive: (response: IncomingMessage) => void) => {
      captured = options;
      const client = Object.assign(new EventEmitter(), {
        destroy: vi.fn<() => void>(),
        end: vi.fn<() => void>(() =>
          queueMicrotask(() => {
            const response = Object.assign(new PassThrough(), {
              statusCode: responseStatus,
              rawHeaders: responseHeaders,
            });
            receive(response as unknown as IncomingMessage);
            response.end('{"code":0}');
          })
        ),
      });
      return client;
    }
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GgThreeDHttp", () => {
  it("pins a public DNS result to the fixed HTTPS host while retaining TLS verification", async () => {
    const response = await GgThreeDHttp.create(key).request(
      "https://openapi.tripo3d.ai/v3/generation/text-to-model",
      request()
    );
    expect(await response.json()).toEqual({ code: 0 });
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(captured).toMatchObject({
      hostname: "openapi.tripo3d.ai",
      servername: "openapi.tripo3d.ai",
      family: 4,
      autoSelectFamily: false,
      rejectUnauthorized: true,
      agent: false,
      path: "/v3/generation/text-to-model",
    });
    const address = await new Promise((resolve, reject) =>
      captured.lookup!(
        "openapi.tripo3d.ai",
        { all: false },
        (error, value, family) =>
          error ? reject(error) : resolve({ value, family })
      )
    );
    expect(address).toEqual({ value: "93.184.216.34", family: 4 });
    expect(captured.headers).toEqual({
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "content-type": "application/json",
      "accept-encoding": "identity",
    });
  });
  it.each([
    "https://openapi.tripo3d.ai.evil.example/v3/animations/rig",
    "http://openapi.tripo3d.ai/v3/animations/rig",
    "https://openapi.tripo3d.ai/v3/account/balance",
    "https://openapi.tripo3d.ai/v3/files",
    "https://openapi.tripo3d.ai/v3/animations/rig?destination=evil",
    "https://other:password@openapi.tripo3d.ai/v3/animations/rig",
  ])("rejects unregistered API authority %s before DNS", async (url) => {
    await expect(
      GgThreeDHttp.create(key).request(url, request())
    ).rejects.toThrow("provider_transport_failed");
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
  });
  it.each(["cookie", "host", "x-api-key"])(
    "rejects unexpected %s headers before I/O",
    async (header) => {
      const init = request();
      await expect(
        GgThreeDHttp.create(key).request(
          "https://openapi.tripo3d.ai/v3/animations/rig",
          { ...init, headers: { ...init.headers, [header]: "injected" } }
        )
      ).rejects.toThrow("provider_transport_failed");
      expect(network.lookup).not.toHaveBeenCalled();
    }
  );
  it("rejects a credential other than its construction key", async () => {
    const init = request();
    await expect(
      GgThreeDHttp.create(key).request(
        "https://openapi.tripo3d.ai/v3/animations/rig",
        {
          ...init,
          headers: { ...init.headers, authorization: "Bearer injected" },
        }
      )
    ).rejects.toThrow("provider_transport_failed");
    expect(network.request).not.toHaveBeenCalled();
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "64:ff9b::7f00:1",
    "::ffff:127.0.0.1",
  ])(
    "rejects mixed DNS answers containing %s without opening a socket",
    async (address) => {
      network.lookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address, family: address.includes(":") ? 6 : 4 },
      ]);
      await expect(
        GgThreeDHttp.create(key).request(
          "https://openapi.tripo3d.ai/v3/animations/rig",
          request()
        )
      ).rejects.toThrow("provider_transport_failed");
      expect(network.request).not.toHaveBeenCalled();
    }
  );
  it("uses only the credential-free exact CDN download lane", async () => {
    const result = await GgThreeDHttp.create(key).downloadProviderAsset(
      new URL("https://cdn.tripo3d.ai/model.glb?signature=synthetic")
    );
    expect(result.data.byteLength).toBeGreaterThan(0);
    expect(captured.headers).toEqual({ "accept-encoding": "identity" });
    expect(captured.path).toBe("/model.glb?signature=synthetic");
    await expect(
      GgThreeDHttp.create(key).downloadProviderAsset(
        new URL("https://cdn.tripo3d.ai.evil.example/model.glb")
      )
    ).rejects.toThrow("provider asset download failed");
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("refuses CDN redirects without following or leaking the signed URL", async () => {
    responseStatus = 302;
    responseHeaders = ["location", "https://private.example/asset"];
    const error = await GgThreeDHttp.create(key)
      .downloadProviderAsset(
        new URL("https://cdn.tripo3d.ai/model.glb?secret=synthetic")
      )
      .catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("secret");
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("refuses compression instead of allocating an unbounded decoded response", async () => {
    responseHeaders = ["content-encoding", "gzip"];
    await expect(
      GgThreeDHttp.create(key).request(
        "https://openapi.tripo3d.ai/v3/animations/rig",
        request()
      )
    ).rejects.toThrow("provider_transport_failed");
  });
  it("cancels pending DNS before a socket can be opened", async () => {
    network.lookup.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const result = GgThreeDHttp.create(key).request(
      "https://openapi.tripo3d.ai/v3/animations/rig",
      { ...request(), signal: controller.signal }
    );
    controller.abort();
    await expect(result).rejects.toThrow("provider_transport_failed");
    expect(network.request).not.toHaveBeenCalled();
  });
});
