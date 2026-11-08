import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const hooks = vi.hoisted(() => ({
  session: vi.fn<(...args: unknown[]) => Promise<NextResponse>>(),
  tenant: vi.fn<(...args: unknown[]) => Promise<NextResponse | null>>(),
}));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: hooks.session }));
vi.mock("@/lib/tenant/middleware", () => ({
  TenantMiddleware: { routeProxyRequest: hooks.tenant },
}));
vi.mock("@/lib/api/policy", () => ({ apiPolicy: { matches: () => false } }));
import { proxy } from "../../../proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://issuer.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  hooks.session.mockReset().mockResolvedValue(NextResponse.next());
  hooks.tenant.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("public catalogue session independence", () => {
  it.each(["/ai/models", "/ai/models/feed"])(
    "GET/HEAD %s never loads a session but retains tenant dispatch",
    async (path) => {
      for (const method of ["GET", "HEAD"]) {
        const response = await proxy(
          new NextRequest(`http://localhost:3020${path}`, { method })
        );
        expect(response.status).toBe(200);
      }
      expect(hooks.session).not.toHaveBeenCalled();
      expect(hooks.tenant).toHaveBeenCalledTimes(2);
    }
  );
  it.each([
    "/ai/models/other",
    "/ai/models-extra",
    "/ai/image",
    "/desktop/auth/token",
  ])("does not widen the exception to %s", async (path) => {
    await proxy(new NextRequest(`http://localhost:3020${path}`));
    expect(hooks.session).toHaveBeenCalledTimes(1);
  });
  it("retains ordinary handling for POST and honors tenant rewrites", async () => {
    await proxy(
      new NextRequest("http://localhost:3020/ai/models", { method: "POST" })
    );
    expect(hooks.session).toHaveBeenCalledTimes(1);
    const rewrite = NextResponse.rewrite(
      new URL("http://localhost:3020/~/tenant/ai/models")
    );
    hooks.tenant.mockResolvedValueOnce(rewrite);
    expect(
      await proxy(new NextRequest("http://localhost:3020/ai/models"))
    ).toBe(rewrite);
  });
});
