// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — see docs/wg/platform/hosted-ai.md
/**
 * POST /desktop/auth/token — the hosted-AI token mint.
 *
 * Pins: signed-out is 401 and never reaches minting; the default org is
 * the session resolution (no request/header input ever reaches the org
 * resolver); an explicit org_id goes through the membership-verified
 * resolver as INPUT (not header); no-usable-org collapses to 409;
 * unconfigured secret is 503; all responses are no-store; failures stay
 * opaque. Shared quota/member/sign ordering is pinned by lib/gg tests;
 * this adapter consumes only that producer's public mint contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const mint = vi.fn<
  (
    principal: { id: string },
    membership: {
      organization(
        userId: string
      ): Promise<{ id: number; name: string } | null>;
    }
  ) => Promise<{
    token: string;
    expires_at: string;
    organization: { id: number; name: string };
  }>
>();
vi.mock("@/lib/gg/gg", () => {
  class TokenError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  class MintError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    gg: {
      TokenError,
      MintError,
      mint: (...args: Parameters<typeof mint>) => mint(...args),
    },
  };
});

import { POST } from "./route";
import { gg } from "@/lib/gg/gg";

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
  mint.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mint.mockImplementation(async (principal, membership) => {
    const organization = await membership.organization(principal.id);
    if (!organization) throw new gg.MintError("no_organization");
    return {
      token: "jwt-abc",
      expires_at: EXPIRES.toISOString(),
      organization,
    };
  });
  resolveSessionOrganization.mockResolvedValue({ id: 7, name: "acme" });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /desktop/auth/token", () => {
  it("401 when signed out; minting never runs", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mint).not.toHaveBeenCalled();
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
    expect(mint).toHaveBeenCalledWith(
      { id: "user-1" },
      { organization: expect.any(Function) }
    );
    expect(resolveSessionOrganization).toHaveBeenCalledExactlyOnceWith(
      "user-1"
    );
    expect(requireOrganizationId).not.toHaveBeenCalled();
  });

  it("409 no_organization when the session resolves no org", async () => {
    resolveSessionOrganization.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "no_organization" } });
    expect(mint).toHaveBeenCalledOnce();
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
    expect(mint).toHaveBeenCalledOnce();
  });

  it("retains string org_id input and ignores an organization header", async () => {
    requireOrganizationId.mockResolvedValue(42);
    maybeSingle.mockResolvedValue({ data: { id: 42, name: "other" } });
    const req = request({ org_id: "42" });
    req.headers.set("x-grida-organization-id", "999");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(requireOrganizationId).toHaveBeenCalledExactlyOnceWith({
      user_id: "user-1",
      inputOrgId: "42",
    });
    expect((await res.json()).organization).toEqual({ id: 42, name: "other" });
  });

  it("retains empty/malformed body fallback without forwarding the request or header", async () => {
    const req = new Request("https://grida.test/desktop/auth/token", {
      method: "POST",
      body: "{",
      headers: { "x-grida-organization-id": "999" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(resolveSessionOrganization).toHaveBeenCalledExactlyOnceWith(
      "user-1"
    );
    expect(requireOrganizationId).not.toHaveBeenCalled();
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
    expect(requireOrganizationId).not.toHaveBeenCalled();
  });

  it("503 when the signing secret is not configured", async () => {
    mint.mockRejectedValue(new gg.TokenError("not_configured"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "not_configured" } });
  });

  it("429 when the mint limiter refuses", async () => {
    mint.mockRejectedValue(new gg.MintError("rate_limited"));
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(resolveSessionOrganization).not.toHaveBeenCalled();
  });

  it("503 when the configured mint limiter is unavailable", async () => {
    mint.mockRejectedValue(new gg.MintError("unavailable"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "mint_failed" } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(resolveSessionOrganization).not.toHaveBeenCalled();
    expect(requireOrganizationId).not.toHaveBeenCalled();
  });

  it("unexpected failures are opaque", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    resolveSessionOrganization.mockRejectedValue(
      new Error("connect ECONNREFUSED postgres")
    );
    const res = await POST(request());
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).toBe(JSON.stringify({ error: { code: "mint_failed" } }));
    expect(body).not.toContain("ECONNREFUSED");
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      "[desktop-ai-token] mint failed"
    );
  });
});
