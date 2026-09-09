// GRIDA-GG: token — native exchange enforcing-binding contract.
// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-012
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { ggApi } from "./gg";
import { gg } from "../gg/gg";
const issuer = "http://127.0.0.1:55431/auth/v1";
const endpoint = "http://127.0.0.1:3041/api/v1/auth/gg";
const user = "22222222-2222-4222-8222-222222222222";
const clientId = "11111111-1111-4111-8111-111111111111";
const key = new Uint8Array(32).fill(37);
const handlers = ggApi.bind("gg.access");
let member: boolean;
let dbStatus: number;
const fetcher = vi.fn<typeof fetch>(async (target, init) => {
  const headers = new Headers(init?.headers);
  const { payload } = await jwtVerify(
    headers.get("authorization")!.slice(7),
    key,
    { issuer, audience: "authenticated" }
  );
  const url = new URL(String(target));
  if (url.pathname === "/auth/v1/oauth/userinfo")
    return Response.json({ sub: payload.sub, email: null, name: "Test" });
  if (
    url.pathname !== "/rest/v1/organization_member" ||
    url.searchParams.get("user_id") !== `eq.${payload.sub}` ||
    headers.has("cookie")
  )
    throw new Error("Unexpected fixture request.");
  if (dbStatus !== 200)
    return new Response("private database diagnostics", { status: dbStatus });
  const rows =
    member && url.searchParams.get("organization_id") === "eq.1"
      ? [{ organization_id: 1, organization: { id: 1, name: "local" } }]
      : [];
  return Response.json(rows, {
    headers: { "content-range": rows.length ? "0-0/1" : "*/0" },
  });
});
async function token(claims: Record<string, unknown> = {}) {
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
function request(
  value?: string,
  body: string | undefined = '{"organization_id":1}',
  options: RequestInit = {},
  query = ""
) {
  return new Request(endpoint + query, {
    method: "POST",
    body,
    ...options,
    headers: {
      "content-type": "application/json",
      ...(value ? { authorization: `Bearer ${value}` } : {}),
      cookie: "other-user=browser; organization=other",
      ...options.headers,
    },
  });
}
beforeEach(() => {
  member = true;
  dbStatus = 200;
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55431");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
  vi.stubEnv("GG_TOKEN_SECRET", "fixture-gg-signing-key-only-".repeat(3));
  for (const name of [
    "GG_TOKEN_SECRET_PREVIOUS",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "SUPABASE_SERVICE_ROLE_KEY",
    "METRONOME_API_KEY",
    "STRIPE_SECRET_KEY",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native GG exchange", () => {
  it("mints only scoped access from the live account bearer and exact current membership", async () => {
    const value = await token();
    const response = await handlers.POST(request(value));
    expect(response.status).toBe(200);
    const grant = await response.json();
    expect(Object.keys(grant).sort()).toEqual([
      "expires_at",
      "organization",
      "token",
    ]);
    expect(grant.organization).toEqual({ id: 1, name: "local" });
    const claims = await gg.verify(
      new Request(endpoint, {
        headers: { authorization: `Bearer ${grant.token}` },
      })
    );
    expect(claims).toMatchObject({ sub: user, org: 1, aud: "gg:ai" });
    expect(claims.exp - claims.iat).toBe(900);
    expect(Date.parse(grant.expires_at)).toBe(claims.exp * 1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls)
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${value}`
      );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("location")).toBe(false);
  });
  it.each([undefined, "malformed", "a.b.c"])(
    "ignores browser cookies with invalid native bearer %#",
    async (value) => {
      const response = await handlers.POST(request(value));
      expect(response.status).toBe(401);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("rejects the resulting GG credential as account authority", async () => {
    const grant = await (await handlers.POST(request(await token()))).json();
    fetcher.mockClear();
    const response = await handlers.POST(request(grant.token));
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ aud: "gg:ai" }, { client_id: undefined }, { exp: 1 }])(
    "rejects wrong account credential family %#",
    async (claims) => {
      expect((await handlers.POST(request(await token(claims)))).status).toBe(
        401
      );
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("requires current membership on every mint", async () => {
    const value = await token();
    expect((await handlers.POST(request(value))).status).toBe(200);
    member = false;
    expect((await handlers.POST(request(value))).status).toBe(403);
    expect(
      (await handlers.POST(request(value, '{"organization_id":999}'))).status
    ).toBe(403);
  });
  it.each(["", "short"])(
    "contains missing signing setup %#",
    async (secret) => {
      vi.stubEnv("GG_TOKEN_SECRET", secret);
      const response = await handlers.POST(request(await token()));
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe("not_configured");
    }
  );
  it.each([401, 403, 404, 500])(
    "contains upstream DB failure %s",
    async (status) => {
      dbStatus = status;
      const response = await handlers.POST(request(await token()));
      expect(response.status).toBe(
        status === 401 || status === 403 ? status : 503
      );
      expect(await response.text()).not.toContain("private");
    }
  );
  it.each([
    ["rate_limited", 429, "rate_limited"],
    ["unavailable", 503, "auth_unavailable"],
  ] as const)(
    "maps shared mint %s without member lookup",
    async (code, status, wireCode) => {
      vi.spyOn(gg, "mint").mockRejectedValue(new gg.MintError(code));
      const response = await handlers.POST(request(await token()));
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(wireCode);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );
  it("contains unexpected mint failures", async () => {
    vi.spyOn(gg, "mint").mockRejectedValue(
      new Error("private limiter credentials")
    );
    expect(
      await (await handlers.POST(request(await token()))).text()
    ).not.toContain("private");
  });
  it.each([
    "{}",
    "[]",
    "null",
    "",
    '{"organization_id":"1"}',
    '{"organization_id":0}',
    '{"organization_id":-1}',
    '{"organization_id":1.5}',
    '{"organization_id":1e0}',
    '{"organization_id":9007199254740992}',
    '{"organization_id":1,"organization_id":2}',
    '{"organization_id":1,"scope":"all"}',
    '{"\\u006frganization_id":1}',
    '{"organization_id":1}' + " ".repeat(1024),
  ])("rejects malformed input before issuer I/O %#", async (body) => {
    expect((await handlers.POST(request(await token(), body))).status).toBe(
      400
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { "content-type": "text/plain" },
    { "content-encoding": "gzip" },
    { "content-length": "1025" },
    { "content-length": "1" },
  ] as Record<string, string>[])(
    "rejects incompatible body framing %#",
    async (headers) => {
      expect(
        (
          await handlers.POST(
            request(await token(), '{"organization_id":1}', { headers })
          )
        ).status
      ).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("accepts JSON whitespace and utf-8 charset", async () => {
    expect(
      (
        await handlers.POST(
          request(await token(), ' \n{ "organization_id" : 1 }\t', {
            headers: { "content-type": "application/json; charset=utf-8" },
          })
        )
      ).status
    ).toBe(200);
  });
  it("bounds an unfinished body and closes its reader", async () => {
    const cancel = vi.fn<() => void>();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"organization_id":'));
      },
      cancel,
    });
    vi.useFakeTimers();
    const pending = handlers.POST(
      new Request(endpoint, {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: { "content-type": "application/json" },
      } as RequestInit)
    );
    await vi.advanceTimersByTimeAsync(1001);
    expect((await pending).status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("OPTIONS grants no authority; other methods cannot mint", async () => {
    const response = await handlers.OPTIONS(
      new Request(endpoint, { method: "OPTIONS" })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    const head = await handlers.HEAD(new Request(endpoint, { method: "HEAD" }));
    expect(head.status).toBe(405);
    expect(await head.text()).toBe("");
    for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
      const result = await handlers[method](new Request(endpoint, { method }));
      expect(result.status).toBe(405);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects queries and aliases before authorization", async () => {
    expect(
      (
        await handlers.POST(
          request(
            await token(),
            '{"organization_id":1}',
            {},
            "?organization_id=2"
          )
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handlers.OPTIONS(
          new Request(endpoint + "?x=1", { method: "OPTIONS" })
        )
      ).status
    ).toBe(400);
    expect(
      (await handlers.POST(new Request(endpoint + "/", { method: "POST" })))
        .status
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
