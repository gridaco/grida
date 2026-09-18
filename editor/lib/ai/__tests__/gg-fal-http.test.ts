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
import { GgFalHttp } from "../gg-fal-http";

const key = "synthetic-server-key";
const request = () =>
  ({
    method: "POST",
    headers: {
      authorization: `Key ${key}`,
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

describe("GgFalHttp", () => {
  it("pins a public DNS result to the fixed HTTPS host while retaining TLS verification", async () => {
    const response = await GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "fal-ai/flux-2/pro"
    ).request("https://queue.fal.run/fal-ai/flux-2/pro", request());
    expect(await response.json()).toEqual({ code: 0 });
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(captured).toMatchObject({
      hostname: "queue.fal.run",
      servername: "queue.fal.run",
      family: 4,
      autoSelectFamily: false,
      rejectUnauthorized: true,
      agent: false,
      path: "/fal-ai/flux-2/pro",
    });
    const address = await new Promise((resolve, reject) =>
      captured.lookup!(
        "queue.fal.run",
        { all: false },
        (error, value, family) =>
          error ? reject(error) : resolve({ value, family })
      )
    );
    expect(address).toEqual({ value: "93.184.216.34", family: 4 });
    expect(captured.headers).toEqual({
      authorization: `Key ${key}`,
      accept: "application/json",
      "content-type": "application/json",
      "accept-encoding": "identity",
      "x-fal-no-retry": "1",
      "x-app-fal-disable-fallback": "1",
    });
  });
  it.each([
    "https://queue.fal.run.evil.example/fal-ai/flux-2/pro",
    "http://queue.fal.run/fal-ai/flux-2/pro",
    "https://queue.fal.run/v3/account/balance",
    "https://queue.fal.run/v3/files",
    "https://queue.fal.run/fal-ai/flux-2/pro?destination=evil",
    "https://other:password@queue.fal.run/fal-ai/flux-2/pro",
  ])("rejects unregistered API authority %s before DNS", async (url) => {
    await expect(
      GgFalHttp.create(key, "synthetic-admin-key", "fal-ai/flux-2/pro").request(
        url,
        request()
      )
    ).rejects.toThrow("provider_transport_failed");
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.request).not.toHaveBeenCalled();
  });
  it.each(["cookie", "host", "x-api-key"])(
    "rejects unexpected %s headers before I/O",
    async (header) => {
      const init = request();
      await expect(
        GgFalHttp.create(
          key,
          "synthetic-admin-key",
          "fal-ai/flux-2/pro"
        ).request("https://queue.fal.run/fal-ai/flux-2/pro", {
          ...init,
          headers: { ...init.headers, [header]: "injected" },
        })
      ).rejects.toThrow("provider_transport_failed");
      expect(network.lookup).not.toHaveBeenCalled();
    }
  );
  it("rejects a credential other than its construction key", async () => {
    const init = request();
    await expect(
      GgFalHttp.create(key, "synthetic-admin-key", "fal-ai/flux-2/pro").request(
        "https://queue.fal.run/fal-ai/flux-2/pro",
        {
          ...init,
          headers: { ...init.headers, authorization: "Key injected" },
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
        GgFalHttp.create(
          key,
          "synthetic-admin-key",
          "fal-ai/flux-2/pro"
        ).request("https://queue.fal.run/fal-ai/flux-2/pro", request())
      ).rejects.toThrow("provider_transport_failed");
      expect(network.request).not.toHaveBeenCalled();
    }
  );
  it("uses only the credential-free exact CDN download lane", async () => {
    const result = await GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "fal-ai/flux-2/pro"
    ).downloadProviderAsset(
      new URL("https://v3.fal.media/model.glb?signature=synthetic")
    );
    expect(result.data.byteLength).toBeGreaterThan(0);
    expect(captured.headers).toEqual({ "accept-encoding": "identity" });
    expect(captured.path).toBe("/model.glb?signature=synthetic");
    await expect(
      GgFalHttp.create(
        key,
        "synthetic-admin-key",
        "fal-ai/flux-2/pro"
      ).downloadProviderAsset(
        new URL("https://v3.fal.media.evil.example/model.glb")
      )
    ).rejects.toThrow("provider asset download failed");
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("refuses CDN redirects without following or leaking the signed URL", async () => {
    responseStatus = 302;
    responseHeaders = ["location", "https://private.example/asset"];
    const error = await GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "fal-ai/flux-2/pro"
    )
      .downloadProviderAsset(
        new URL("https://v3.fal.media/model.glb?secret=synthetic")
      )
      .catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("secret");
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("refuses compression instead of allocating an unbounded decoded response", async () => {
    responseHeaders = ["content-encoding", "gzip"];
    await expect(
      GgFalHttp.create(key, "synthetic-admin-key", "fal-ai/flux-2/pro").request(
        "https://queue.fal.run/fal-ai/flux-2/pro",
        request()
      )
    ).rejects.toThrow("provider_transport_failed");
  });
  it("cancels pending DNS before a socket can be opened", async () => {
    network.lookup.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const result = GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "fal-ai/flux-2/pro"
    ).request("https://queue.fal.run/fal-ai/flux-2/pro", {
      ...request(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toThrow("provider_transport_failed");
    expect(network.request).not.toHaveBeenCalled();
  });
  it("uses the separate admin credential only on a matching billing lookup", async () => {
    const http = GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "fal-ai/flux-2/pro"
    );
    const url =
      "https://api.fal.ai/v1/models/billing-events?endpoint_id=fal-ai%2Fflux-2%2Fpro&request_id=synthetic&limit=2";
    await expect(
      http.request(url, { headers: { authorization: `Key ${key}` } })
    ).rejects.toThrow("provider_transport_failed");
    expect(network.lookup).not.toHaveBeenCalled();
    await http.request(url, {
      headers: { authorization: "Key synthetic-admin-key" },
    });
    expect(captured.headers).toEqual({
      authorization: "Key synthetic-admin-key",
      "accept-encoding": "identity",
    });
    expect(captured.hostname).toBe("api.fal.ai");
    await expect(
      http.request(url.replace("flux-2", "other"), {
        headers: { authorization: "Key synthetic-admin-key" },
      })
    ).rejects.toThrow("provider_transport_failed");
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("admits only the selected queue namespace's fixed status/result paths", async () => {
    const http = GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "google/gemini-omni-flash/v1.1/text-to-video"
    );
    const headers = { authorization: `Key ${key}` };
    await http.request(
      "https://queue.fal.run/google/gemini-omni-flash/requests/synthetic/status",
      { headers }
    );
    await http.request(
      "https://queue.fal.run/google/gemini-omni-flash/requests/synthetic",
      { headers }
    );
    await expect(
      http.request("https://queue.fal.run/other/model/requests/synthetic", {
        headers,
      })
    ).rejects.toThrow("provider_transport_failed");
    await expect(
      http.request(
        "https://queue.fal.run/google/gemini-omni-flash/requests/synthetic/cancel",
        { method: "PUT", headers }
      )
    ).rejects.toThrow("provider_transport_failed");
    expect(network.request).toHaveBeenCalledTimes(2);
  });
  it("admits the selected full endpoint queue URLs and /response suffix", async () => {
    const http = GgFalHttp.create(
      key,
      "synthetic-admin-key",
      "google/gemini-omni-flash/v1.1/text-to-video"
    );
    const headers = { authorization: `Key ${key}` };
    const root =
      "https://queue.fal.run/google/gemini-omni-flash/v1.1/text-to-video/requests/job";
    await http.request(`${root}/status`, { headers });
    await http.request(`${root}/response`, { headers });
    await expect(
      http.request(root.replace("v1.1/text-to-video", "v9/other"), { headers })
    ).rejects.toThrow("provider_transport_failed");
    expect(network.request).toHaveBeenCalledTimes(2);
  });
});
