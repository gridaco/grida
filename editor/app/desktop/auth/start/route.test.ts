/**
 * GRIDA-SEC-005 — desktop PKCE start route.
 *
 * Pins: the route returns the same-origin `/sign-in/desktop` launch-page URL
 * carrying only the public challenge (never a provider URL, never a
 * redirect — the verifier cookie must land on a route-handler response and
 * the URL must open in the system browser), and the underlying PKCE flow is
 * created against the fixed `grida://auth/callback` deep link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const signInWithOAuth = vi.fn<
  (options: unknown) => Promise<{
    data: { url: string } | null;
    error: { message: string } | null;
  }>
>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOAuth } }),
}));

import { POST } from "./route";

const CHALLENGE = "NF4wmu64KqpZmRNAuYJrxnETLbuzRbtPSbXpoHggKaA";

function request(): NextRequest {
  return new Request("https://grida.test/desktop/auth/start", {
    method: "POST",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  signInWithOAuth.mockReset();
});

describe("POST /desktop/auth/start", () => {
  it("returns the same-origin launch-page URL carrying the challenge", async () => {
    signInWithOAuth.mockResolvedValue({
      data: {
        url: `https://supabase.test/auth/v1/authorize?provider=google&code_challenge=${CHALLENGE}&code_challenge_method=s256`,
      },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const launch = new URL(url);
    expect(launch.origin).toBe("https://grida.test");
    expect(launch.pathname).toBe("/sign-in/desktop");
    expect(launch.searchParams.get("challenge")).toBe(CHALLENGE);
    // The verifier-minting flow is bound to the deep-link return.
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "grida://auth/callback",
          skipBrowserRedirect: true,
        }),
      })
    );
  });

  it("responds 500 when the auth API fails", async () => {
    signInWithOAuth.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
  });

  it("responds 500 when no challenge is present in the generated URL", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://supabase.test/auth/v1/authorize?provider=google" },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
  });
});
