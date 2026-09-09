// GRIDA-SEC-012 — real dispatch leaves browser dependencies unopened for machine calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const web = vi.hoisted(() => ({
  loaded: [] as string[],
  maintenance: vi.fn<(key: string) => Promise<boolean>>(),
  session:
    vi.fn<(request: NextRequest, headers?: Headers) => Promise<NextResponse>>(),
  tenant:
    vi.fn<
      (
        request: NextRequest,
        response: NextResponse
      ) => Promise<NextResponse | null>
    >(),
  csp: vi.fn<(nonce: string) => string>(),
}));
vi.mock("@vercel/edge-config", () => {
  web.loaded.push("maintenance");
  return { get: web.maintenance };
});
vi.mock("../supabase/proxy", () => {
  web.loaded.push("cookies");
  return { updateSession: web.session };
});
vi.mock("../tenant/middleware", () => {
  web.loaded.push("tenant");
  return { TenantMiddleware: { routeProxyRequest: web.tenant } };
});
vi.mock("../desktop/csp", () => {
  web.loaded.push("desktop");
  return { buildDesktopCsp: web.csp };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  web.loaded.length = 0;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GRIDA_API_ORIGIN", "http://127.0.0.1:3041");
  vi.stubEnv("GRIDA_API_MAINTENANCE", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55431");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic");
  web.maintenance.mockResolvedValue(false);
  web.session.mockImplementation(async () => NextResponse.next());
  web.tenant.mockResolvedValue(null);
  web.csp.mockReturnValue("default-src 'self'");
});
afterEach(() => vi.unstubAllEnvs());

function request(path: string, host = "127.0.0.1:3041", method = "GET") {
  return new NextRequest(`http://127.0.0.1:3041${path}`, {
    method,
    headers: { host, cookie: "synthetic=conflicting-browser-session" },
  });
}

describe("API dispatch before browser work", () => {
  it.each([
    ["/api/v1/auth/me", "127.0.0.1:3041", 200],
    ["/api/v1/ai/models", "127.0.0.1:3041", 200],
    ["/api/v1/models/catalog", "127.0.0.1:3041", 200],
    ["/api/v1/auth/connect", "127.0.0.1:3041", 404],
    ["/api/v1/auth/me/", "127.0.0.1:3041", 404],
    ["/API/V1/auth/me", "127.0.0.1:3041", 404],
    ["/api/v1/auth/me", "tenant.grida.site", 404],
  ])("isolates %s on %s", async (path, host, status) => {
    const { proxy } = await import("../../proxy");
    const response = await proxy(request(path, host));
    expect(response.status).toBe(status);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.has("x-middleware-rewrite")).toBe(false);
    expect(web.loaded).toEqual([]);
    for (const fn of [web.maintenance, web.session, web.tenant, web.csp])
      expect(fn).not.toHaveBeenCalled();
  });
  it("serves API maintenance without loading the web maintenance service", async () => {
    vi.stubEnv("GRIDA_API_MAINTENANCE", "1");
    const { proxy } = await import("../../proxy");
    const response = await proxy(request("/api/v1/auth/me"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("temporarily_unavailable");
    expect(web.loaded).toEqual([]);
  });
  it.each(["/v1/example", "/api/v10/example", "/api/v1-other"])(
    "preserves web handling for %s",
    async (path) => {
      const { proxy } = await import("../../proxy");
      await proxy(request(path));
      expect(web.maintenance).toHaveBeenCalledOnce();
      expect(web.session).toHaveBeenCalledOnce();
      expect(web.tenant).toHaveBeenCalledOnce();
    }
  );
  it("preserves HTML maintenance for web pages", async () => {
    web.maintenance.mockResolvedValue(true);
    const { proxy } = await import("../../proxy");
    const response = await proxy(request("/organizations"));
    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/maintenance"
    );
    expect(web.session).not.toHaveBeenCalled();
  });
  it("retains the production insiders gate and webhook bypass", async () => {
    const { proxy } = await import("../../proxy");
    expect(
      (await proxy(request("/insiders/billing", undefined, "POST"))).status
    ).toBe(404);
    expect(
      (
        await proxy(request("/webhooks/stripe", "tunnel.example", "POST"))
      ).headers.get("x-middleware-next")
    ).toBe("1");
    expect(web.loaded).toEqual([]);
  });
  it("retains Desktop cookie refresh and CSP", async () => {
    const { proxy } = await import("../../proxy");
    const response = await proxy(request("/desktop"));
    expect(web.session).toHaveBeenCalledOnce();
    expect(web.tenant).toHaveBeenCalledOnce();
    expect(web.csp).toHaveBeenCalledOnce();
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'"
    );
  });
});
