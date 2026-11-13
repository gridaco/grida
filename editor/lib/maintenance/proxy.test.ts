// Web maintenance mode through the real proxy: production gating, bypass/order
// semantics, rewrites and fail-open behavior with the server-instance cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { TTL_MS_ENV } from "./server-instance-cache";

const web = vi.hoisted(() => ({
  maintenance: vi.fn<(key: string) => Promise<unknown>>(),
  session: vi.fn<(request: NextRequest) => Promise<NextResponse>>(),
  tenant: vi.fn<() => Promise<NextResponse | null>>(),
}));
vi.mock("@vercel/edge-config", () => ({ get: web.maintenance }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: web.session }));
vi.mock("@/lib/tenant/middleware", () => ({
  TenantMiddleware: { routeProxyRequest: web.tenant },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["performance"] });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv(TTL_MS_ENV, "60000");
  vi.stubEnv("GRIDA_API_ORIGIN", "http://127.0.0.1:3041");
  vi.stubEnv("GRIDA_API_MAINTENANCE", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55432");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic");
  web.maintenance.mockResolvedValue(false);
  web.session.mockImplementation(async () => NextResponse.next());
  web.tenant.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function load() {
  return (await import("../../proxy")).proxy;
}

function request(path: string, method = "GET") {
  return new NextRequest(`http://127.0.0.1:3041${path}`, {
    method,
    headers: { host: "127.0.0.1:3041" },
  });
}

const rewrite = (response: Response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target === null ? null : new URL(target).pathname;
};

describe("web maintenance mode", () => {
  it("rewrites web pages to /maintenance before session and tenant work", async () => {
    web.maintenance.mockResolvedValue(true);
    const proxy = await load();
    const response = await proxy(request("/organizations"));
    expect(rewrite(response)).toBe("/maintenance");
    expect(web.maintenance).toHaveBeenCalledWith("IS_IN_MAINTENANCE_MODE");
    expect(web.session).not.toHaveBeenCalled();
    expect(web.tenant).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "reuses a cached %s value across requests within the TTL",
    async (value) => {
      web.maintenance.mockResolvedValue(value);
      const proxy = await load();
      for (const path of ["/", "/organizations", "/ai/models"]) {
        const response = await proxy(request(path));
        expect(rewrite(response) === "/maintenance").toBe(value);
      }
      expect(web.maintenance).toHaveBeenCalledOnce();
    }
  );

  it("picks up a toggle once the TTL elapses", async () => {
    web.maintenance.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const proxy = await load();
    expect(rewrite(await proxy(request("/")))).toBe("/maintenance");
    vi.advanceTimersByTime(59_999);
    expect(rewrite(await proxy(request("/")))).toBe("/maintenance");
    vi.advanceTimersByTime(1);
    expect(rewrite(await proxy(request("/")))).toBeNull();
    expect(web.session).toHaveBeenCalledOnce();
    expect(web.maintenance).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests into one Edge Config read", async () => {
    web.maintenance.mockResolvedValue(true);
    const proxy = await load();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => proxy(request("/")))
    );
    for (const response of responses) {
      expect(rewrite(response)).toBe("/maintenance");
    }
    expect(web.maintenance).toHaveBeenCalledOnce();
  });

  it("fails open on read errors and retries on the next request", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    web.maintenance
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("edge config unavailable"))
      .mockResolvedValueOnce(true);
    const proxy = await load();
    expect(rewrite(await proxy(request("/")))).toBe("/maintenance");
    vi.advanceTimersByTime(60_000);
    // The expired maintenance-on value is not served after a failed refresh.
    expect(rewrite(await proxy(request("/")))).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(rewrite(await proxy(request("/")))).toBe("/maintenance");
    expect(web.maintenance).toHaveBeenCalledTimes(3);
  });

  it.each(["development", "test"])(
    "is not consulted when NODE_ENV is %s",
    async (env) => {
      vi.stubEnv("NODE_ENV", env);
      web.maintenance.mockResolvedValue(true);
      const proxy = await load();
      const response = await proxy(request("/"));
      expect(rewrite(response)).toBeNull();
      expect(web.maintenance).not.toHaveBeenCalled();
    }
  );

  it("keeps earlier gates ahead of maintenance mode", async () => {
    web.maintenance.mockResolvedValue(true);
    const proxy = await load();
    for (const path of ["/insiders", "/dev/x", "/webhooks/stripe"]) {
      expect((await proxy(request(path))).status).toBe(404);
    }
    const api = await proxy(request("/api/v1/auth/me"));
    expect(rewrite(api)).toBeNull();
    const bridge = await proxy(request("/internal/platform/accounts/x"));
    expect(rewrite(bridge)).toBeNull();
    expect(web.maintenance).not.toHaveBeenCalled();
  });
});
