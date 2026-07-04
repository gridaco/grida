// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — see docs/wg/platform/hosted-ai.md
/**
 * POST /desktop/auth/token — the hosted-AI token mint.
 *
 * Pins: signed-out is 401 and never reaches signing; the default org is
 * the session resolution (no request/header input ever reaches the org
 * resolver); an explicit org_id goes through the membership-verified
 * resolver as INPUT (not header); no-usable-org collapses to 409;
 * unconfigured secret is 503; all responses are no-store; failures stay
 * opaque.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser =
  vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const maybeSingle =
  vi.fn<() => Promise<{ data: { id: number; name: string } | null }>>();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

const resolveSessionOrganization =
  vi.fn<(user_id: string) => Promise<{ id: number; name: string } | null>>();
const requireOrganizationId = vi.fn<(opts: unknown) => Promise<number>>();
vi.mock("@/lib/auth/organization", () => ({
  resolveSessionOrganization: (user_id: string) =>
    resolveSessionOrganization(user_id),
  requireOrganizationId: (opts: unknown) => requireOrganizationId(opts),
}));

const signGgToken =
  vi.fn<
    (sub: string, org: number) => Promise<{ token: string; expiresAt: Date }>
  >();
const allowGgTokenMint = vi.fn<(userId: string) => Promise<boolean>>();
vi.mock("@/lib/auth/gg-token", () => {
  class GgTokenError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    GgTokenError,
    signGgToken: (sub: string, org: number) => signGgToken(sub, org),
    allowGgTokenMint: (userId: string) => allowGgTokenMint(userId),
  };
});

import { POST } from "./route";
import { GgTokenError } from "@/lib/auth/gg-token";

const EXPIRES = new Date("2026-07-03T12:00:00.000Z");

function request(body?: unknown): Request {
  return new Request("https://grida.test/desktop/auth/token", {
    method: "POST",
    ...(body !== undefined
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
}

beforeEach(() => {
  getUser.mockReset();
  maybeSingle.mockReset();
  resolveSessionOrganization.mockReset();
  requireOrganizationId.mockReset();
  signGgToken.mockReset();
  allowGgTokenMint.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  allowGgTokenMint.mockResolvedValue(true);
  signGgToken.mockResolvedValue({ token: "jwt-abc", expiresAt: EXPIRES });
  resolveSessionOrganization.mockResolvedValue({ id: 7, name: "acme" });
});

describe("POST /desktop/auth/token", () => {
  it("401 when signed out; signing never runs", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(signGgToken).not.toHaveBeenCalled();
  });

  it("mints against the session organization by default", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      token: "jwt-abc",
      expires_at: EXPIRES.toISOString(),
      organization: { id: 7, name: "acme" },
    });
    expect(signGgToken).toHaveBeenCalledWith("user-1", 7);
    expect(requireOrganizationId).not.toHaveBeenCalled();
  });

  it("409 no_organization when the session resolves no org", async () => {
    resolveSessionOrganization.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "no_organization" } });
    expect(signGgToken).not.toHaveBeenCalled();
  });

  it("explicit org_id goes through the membership-verified resolver as input, never a header", async () => {
    requireOrganizationId.mockResolvedValue(42);
    maybeSingle.mockResolvedValue({ data: { id: 42, name: "other" } });
    const res = await POST(request({ org_id: 42 }));
    expect(res.status).toBe(200);
    expect((await res.json()).organization).toEqual({ id: 42, name: "other" });
    expect(requireOrganizationId).toHaveBeenCalledWith({
      user_id: "user-1",
      inputOrgId: 42,
    });
    expect(signGgToken).toHaveBeenCalledWith("user-1", 42);
  });

  it("membership failure on explicit org_id → 409", async () => {
    requireOrganizationId.mockRejectedValue(
      Object.assign(new Error("not a member"), { code: "not_member" })
    );
    const res = await POST(request({ org_id: 999 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "no_organization" } });
  });

  it("malformed org_id → 400", async () => {
    const res = await POST(request({ org_id: { nested: true } }));
    expect(res.status).toBe(400);
    expect(signGgToken).not.toHaveBeenCalled();
  });

  it("503 when the signing secret is not configured", async () => {
    signGgToken.mockRejectedValue(new GgTokenError("not_configured"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "not_configured" } });
  });

  it("429 when the mint limiter refuses", async () => {
    allowGgTokenMint.mockResolvedValue(false);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(signGgToken).not.toHaveBeenCalled();
  });

  it("unexpected failures are opaque", async () => {
    resolveSessionOrganization.mockRejectedValue(
      new Error("connect ECONNREFUSED postgres")
    );
    const res = await POST(request());
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).toBe(JSON.stringify({ error: { code: "mint_failed" } }));
    expect(body).not.toContain("ECONNREFUSED");
  });
});
