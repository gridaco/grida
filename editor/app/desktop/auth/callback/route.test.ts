/**
 * GRIDA-SEC-005 — desktop PKCE exchange route.
 *
 * Pins: the exchange is the only session-creating step, failures always
 * land back on the desktop sign-in page (never outside `/desktop/*`), and
 * GoTrue error params forwarded by the protocol router survive as
 * `auth_error`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const exchangeCodeForSession =
  vi.fn<
    (
      code: string
    ) => Promise<{ error: { code?: string; message?: string } | null }>
  >();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "./route";

const ORIGIN = "https://grida.test";

function request(pathAndQuery: string): NextRequest {
  return new Request(`${ORIGIN}${pathAndQuery}`) as unknown as NextRequest;
}

function redirectTarget(response: Response): URL {
  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  return new URL(response.headers.get("location")!);
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
});

describe("GET /desktop/auth/callback", () => {
  it("exchanges the code and redirects to the welcome surface", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const target = redirectTarget(
      await GET(request("/desktop/auth/callback?code=abc"))
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(target.origin).toBe(ORIGIN);
    expect(target.pathname).toBe("/desktop/welcome");
  });

  it("redirects to sign-in with auth_error when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { code: "flow_state_expired", message: "expired" },
    });
    const target = redirectTarget(
      await GET(request("/desktop/auth/callback?code=stale"))
    );
    expect(target.pathname).toBe("/desktop/auth/sign-in");
    expect(target.searchParams.get("auth_error")).toBe("flow_state_expired");
  });

  it("rejects a missing code without touching the auth API", async () => {
    const target = redirectTarget(await GET(request("/desktop/auth/callback")));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(target.pathname).toBe("/desktop/auth/sign-in");
    expect(target.searchParams.get("auth_error")).toBe("missing_code");
  });

  it("surfaces GoTrue error params forwarded by the protocol router", async () => {
    const target = redirectTarget(
      await GET(
        request(
          "/desktop/auth/callback?error=access_denied&error_code=otp_expired"
        )
      )
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(target.searchParams.get("auth_error")).toBe("otp_expired");
  });

  it("never redirects outside /desktop/*", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { code: "x" } });
    for (const path of [
      "/desktop/auth/callback",
      "/desktop/auth/callback?code=a",
      "/desktop/auth/callback?error=denied",
    ]) {
      const target = redirectTarget(await GET(request(path)));
      expect(target.pathname.startsWith("/desktop/")).toBe(true);
    }
  });
});
