import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "../../../proxy";

const hooks = vi.hoisted(() => ({
  session: vi.fn<() => Promise<NextResponse>>(),
  tenant: vi.fn<() => Promise<null>>(),
}));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: hooks.session }));
vi.mock("@/lib/tenant/middleware", () => ({
  TenantMiddleware: { routeProxyRequest: hooks.tenant },
}));
vi.mock("@/lib/api/policy", () => ({ apiPolicy: { matches: () => false } }));

beforeEach(() => {
  hooks.session.mockReset().mockResolvedValue(NextResponse.next());
  hooks.tenant.mockReset().mockResolvedValue(null);
});

describe("Desktop compatibility proxy", () => {
  it.each(["GET", "HEAD"])(
    "serves %s before sign-in while retaining Desktop headers and tenant routing",
    async (method) => {
      const response = await proxy(
        new NextRequest("https://grida.co/desktop/compatibility", { method })
      );
      expect(response.headers.get("content-security-policy")).toContain(
        "script-src 'self' 'nonce-"
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(hooks.session).not.toHaveBeenCalled();
      expect(hooks.tenant).toHaveBeenCalledOnce();
    }
  );

  it.each([
    ["/desktop/compatibility", "POST"],
    ["/desktop/compatibility/other", "GET"],
    ["/desktop/auth/me", "GET"],
  ])("retains session handling for %s %s", async (path, method) => {
    await proxy(new NextRequest(`https://grida.co${path}`, { method }));
    expect(hooks.session).toHaveBeenCalledOnce();
  });
});
