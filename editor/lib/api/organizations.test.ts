// GRIDA-SEC-010 / GRIDA-SEC-012 — native organization routes cannot acquire another user's authority.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { accountApi } from "./account";

const issuer = "http://127.0.0.1:55431/auth/v1";
const dataOrigin = "http://127.0.0.1:55432";
const endpoint = "http://127.0.0.1:3041/api/v1/account/organizations";
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
const handlers = accountApi.bind("account.organizations");
let visible: Record<string, typeof orgs>;
let databaseStatus: number;

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
function request(value?: string, method = "GET", query = "") {
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
    url.pathname !== "/rest/v1/organization" ||
    headers.get("apikey") !== "synthetic-public-key" ||
    headers.has("cookie")
  ) {
    throw new Error("Unexpected fixture request.");
  }
  if (databaseStatus !== 200)
    return new Response("private database diagnostics", {
      status: databaseStatus,
    });
  const after = Number(url.searchParams.get("id")?.slice(3) ?? 0);
  const rows = visible[payload.sub!].filter((row) => row.id > after);
  return Response.json(rows, {
    headers: {
      "content-range": rows.length
        ? `0-${rows.length - 1}/${rows.length}`
        : "*/0",
    },
  });
});

beforeEach(() => {
  databaseStatus = 200;
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

describe("native organization operation", () => {
  it("uses each verified bearer for the database despite conflicting browser cookies", async () => {
    for (let i = 0; i < users.length; i++) {
      const credential = await token(users[i]);
      const response = await handlers.GET(request(credential));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        organizations: [orgs[i]],
        next_cursor: null,
      });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(response.headers.has("location")).toBe(false);
      const recent = fetcher.mock.calls.slice(-2);
      expect(recent).toHaveLength(2);
      expect(recent.map(([target]) => new URL(String(target)).origin)).toEqual([
        new URL(issuer).origin,
        dataOrigin,
      ]);
      for (const [, init] of recent)
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${credential}`
        );
    }
  });
  it("reads current memberships on every call and preserves a zero-membership success", async () => {
    const credential = await token();
    expect((await handlers.GET(request(credential))).status).toBe(200);
    visible[users[0]] = [];
    expect(await (await handlers.GET(request(credential))).json()).toEqual({
      organizations: [],
      next_cursor: null,
    });
  });
  it("passes only the validated cursor to the data query", async () => {
    const response = await handlers.GET(
      request(await token(), "GET", "?after=1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizations: [],
      next_cursor: null,
    });
  });
  it.each([
    "?user_id=other",
    "?organization_id=2",
    "?after=0",
    "?after=-1",
    "?after=01",
    "?after=1.5",
    "?after=1&after=2",
    "?after=1&user_id=other",
    "?after=9007199254740992",
    "?%61fter=1",
    "?after=%31",
  ])(
    "rejects unowned input before issuer/database access: %s",
    async (query) => {
      const response = await handlers.GET(request(await token(), "GET", query));
      expect(response.status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it.each([
    undefined,
    { client_id: undefined },
    { aud: "gg:ai" },
    { client_id: users[0] },
  ])("rejects missing or wrong credential families %#", async (claims) => {
    const response = await handlers.GET(
      request(claims ? await token(users[0], claims) : undefined)
    );
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never queries data after failed live verification", async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await handlers.GET(request(await token()))).status).toBe(401);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 503])(
    "keeps database failure %i distinct from an empty list",
    async (status) => {
      databaseStatus = status;
      const response = await handlers.GET(request(await token()));
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error.code).toBe(
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : "auth_unavailable"
      );
      expect(body.organizations).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("private");
    }
  );
  it("HEAD performs the same authentication/read and returns no body", async () => {
    const response = await handlers.HEAD(request(await token(), "HEAD"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["OPTIONS", "POST", "PUT", "PATCH", "DELETE"] as const)(
    "%s never reads account data",
    async (method) => {
      const response = await handlers[method](request(undefined, method));
      expect(response.status).toBe(method === "OPTIONS" ? 204 : 405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
