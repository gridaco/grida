// GRIDA-EE: billing
// GRIDA-SEC-010 / GRIDA-SEC-012 — cached credits require current native membership.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { accountApi } from "./account";

const issuer = "http://127.0.0.1:55431/auth/v1";
const dataOrigin = "http://127.0.0.1:55432";
const endpoint = "http://127.0.0.1:3041/api/v1/account/credits";
const clientId = "11111111-1111-4111-8111-111111111111";
const users = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const key = new Uint8Array(32).fill(37);
const orgs = [
  { id: 1, name: "local", display_name: "Local" },
  { id: 2, name: "acme", display_name: "Acme" },
];
const handlers = accountApi.bind("account.credits");
let visible: Record<string, typeof orgs>;
let databaseStatus: number;
let creditRow: Record<string, unknown>;

async function token(user = users[0], claims: Record<string, unknown> = {}) {
  return new SignJWT({
    iss: issuer,
    aud: "authenticated",
    sub: user,
    client_id: clientId,
    session_id: "44444444-4444-4444-8444-444444444444",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}
function request(value?: string, method = "GET", query = "?organization_id=1") {
  return new Request(endpoint + query, {
    method,
    headers: {
      ...(value ? { authorization: `Bearer ${value}` } : {}),
      cookie: "browser-user=another-account; organization=acme",
    },
  });
}
const fetcher = vi.fn<typeof fetch>(async (target, init) => {
  const headers = new Headers(init?.headers);
  const { payload } = await jwtVerify(
    headers.get("authorization")!.slice(7),
    key,
    { issuer, audience: "authenticated" }
  );
  const url = new URL(String(target));
  if (url.href === `${issuer}/oauth/userinfo`) {
    return Response.json({
      sub: payload.sub,
      name: "Verified User",
      email: null,
    });
  }
  if (
    url.origin !== dataOrigin ||
    url.pathname !== "/rest/v1/v_billing_credits" ||
    headers.get("apikey") !== "synthetic-public-key" ||
    headers.has("cookie")
  ) {
    throw new Error("Unexpected fixture request.");
  }
  if (databaseStatus !== 200)
    return new Response("private database diagnostics", {
      status: databaseStatus,
    });
  const id = Number(url.searchParams.get("organization_id")?.slice(3));
  const org = visible[payload.sub!].find((row) => row.id === id);
  const rows = org
    ? [
        {
          ...creditRow,
          organization_id: org.id,
          organization_name: org.name,
          organization_display_name: org.display_name,
        },
      ]
    : [];
  return Response.json(rows, {
    headers: { "content-range": rows.length ? "0-0/1" : "*/0" },
  });
});

beforeEach(() => {
  databaseStatus = 200;
  creditRow = {
    account_present: true,
    credits_provisioned: true,
    cached_balance_cents: 25,
    cached_balance_at: "2026-09-07T00:00:00Z",
    customer_entitled: true,
  };
  visible = { [users[0]]: [orgs[0]], [users[1]]: [orgs[1]] };
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("GRIDA_OAUTH_ISSUER", issuer);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", dataOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GG_TOKEN_SECRET",
    "METRONOME_API_KEY",
    "STRIPE_SECRET_KEY",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native credits operation", () => {
  it("reads each verified user's credits despite conflicting browser cookies and no provider configuration", async () => {
    for (let i = 0; i < users.length; i++) {
      const value = await token(users[i]);
      const response = await handlers.GET(
        request(value, "GET", `?organization_id=${orgs[i].id}`)
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        organization: orgs[i],
        account_present: true,
        state: "cached",
        source: "cache",
        currency: "USD",
        balance_cents: 25,
        cache_updated_at: creditRow.cached_balance_at,
        billing_gate: { allowed: true, reason: null },
      });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(response.headers.has("location")).toBe(false);
      const recent = fetcher.mock.calls.slice(-2);
      expect(recent.map(([target]) => new URL(String(target)).origin)).toEqual([
        new URL(issuer).origin,
        dataOrigin,
      ]);
      for (const [, init] of recent) {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${value}`
        );
        expect(new Headers(init?.headers).has("cookie")).toBe(false);
      }
    }
  });
  it("denies another or nonexistent organization with the same safe result", async () => {
    const value = await token();
    const responses = await Promise.all(
      [2, 999].map((id) =>
        handlers.GET(request(value, "GET", `?organization_id=${id}`))
      )
    );
    expect(responses.map((r) => r.status)).toEqual([403, 403]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
  });
  it("checks visibility again after membership removal with the same credential", async () => {
    const value = await token();
    expect((await handlers.GET(request(value))).status).toBe(200);
    visible[users[0]] = [];
    expect((await handlers.GET(request(value))).status).toBe(403);
  });
  it("distinguishes missing billing account from denied membership and zero", async () => {
    creditRow = {
      account_present: false,
      credits_provisioned: false,
      cached_balance_cents: null,
      cached_balance_at: null,
      customer_entitled: null,
    };
    const response = await handlers.GET(request(await token()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      account_present: false,
      state: "not_provisioned",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "not_provisioned" },
    });
  });
  it("keeps cached billing eligibility separate from an unknown displayed balance", async () => {
    creditRow.cached_balance_at = null;
    const response = await handlers.GET(request(await token()));
    expect(await response.json()).toMatchObject({
      state: "uncached",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: true, reason: null },
    });
  });
  it.each([
    "",
    "?organization_id=0",
    "?organization_id=-1",
    "?organization_id=01",
    "?organization_id=1.5",
    "?organization_id=1&organization_id=2",
    "?organization_id=1&user_id=other",
    "?organization_id=9007199254740992",
    "?organization_id=%31",
    "?%6frganization_id=1",
    "?org=local",
    "?after=1",
  ])("rejects unowned or noncanonical input before I/O: %s", async (query) => {
    const response = await handlers.GET(request(await token(), "GET", query));
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { client_id: undefined },
    { aud: "gg:ai" },
    { client_id: users[0] },
  ])("rejects missing or wrong credential family %#", async (claims) => {
    expect(
      (
        await handlers.GET(
          request(claims ? await token(users[0], claims) : undefined)
        )
      ).status
    ).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not query credits after failed live verification", async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await handlers.GET(request(await token()))).status).toBe(401);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 404, 500])(
    "returns safe errors for database status %i",
    async (status) => {
      databaseStatus = status;
      const response = await handlers.GET(request(await token()));
      expect(response.status).toBe(
        status === 401 || status === 403 ? status : 503
      );
      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.balance_cents).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("private");
    }
  );
  it("rejects malformed credit data without an invented balance", async () => {
    creditRow.cached_balance_cents = "25";
    const response = await handlers.GET(request(await token()));
    expect(response.status).toBe(503);
    expect((await response.json()).balance_cents).toBeUndefined();
  });
  it("HEAD authenticates and checks membership without a response body", async () => {
    const response = await handlers.HEAD(request(await token(), "HEAD"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["OPTIONS", "POST", "PUT", "PATCH", "DELETE"] as const)(
    "%s needs no organization and reads nothing",
    async (method) => {
      const response = await handlers[method](request(undefined, method, ""));
      expect(response.status).toBe(method === "OPTIONS" ? 204 : 405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
