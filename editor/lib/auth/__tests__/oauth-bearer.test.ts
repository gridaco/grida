// GRIDA-SEC-010 — native bearer identity rejects other credential classes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { bearer } from "../bearer";
import { oauthServer } from "../oauth-server";
import { GET } from "@/app/(api)/(public)/api/v1/auth/me/route";

const issuer = "http://127.0.0.1:55431/auth/v1";
const dataOrigin = "http://127.0.0.1:55432";
const clientId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const config: oauthServer.Config = {
  issuer,
  dataOrigin,
  clientIds: [clientId],
  publishableKey: "test-public-key",
};
const testKey = new Uint8Array(32).fill(17);
const now = Date.now();

async function token(overrides: Record<string, unknown> = {}, key = testKey) {
  return new SignJWT({
    iss: issuer,
    aud: "authenticated",
    sub: userId,
    client_id: clientId,
    session_id: sessionId,
    exp: Math.floor(now / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}

function request(value?: string) {
  return new Request("http://127.0.0.1:3041/api/v1/auth/me", {
    headers: {
      cookie: "browser-session=must-not-be-forwarded",
      ...(value ? { authorization: `Bearer ${value}` } : {}),
    },
  });
}

function identityIssuer() {
  return vi.fn<typeof fetch>(async (_url, init) => {
    try {
      await jwtVerify(
        new Headers(init?.headers).get("authorization")!.slice(7),
        testKey,
        {
          issuer,
          audience: "authenticated",
          currentDate: new Date(now),
        }
      );
    } catch {
      return new Response(null, { status: 401 });
    }
    return Response.json({
      sub: userId,
      email: "test@example.invalid",
      name: "Test User",
      user_metadata: {
        full_name: "Test Person",
        private_field: "not-returned",
      },
    });
  });
}

beforeEach(() => {
  vi.stubEnv("GRIDA_OAUTH_ISSUER", issuer);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", dataOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OAuth bearer identity", () => {
  it("accepts identity only after the fixed issuer verifies the same token", async () => {
    const fetcher = identityIssuer();
    const value = await token();
    const result = await bearer.authenticate(request(value), {
      config,
      fetch: fetcher,
      now,
    });
    expect(result).toEqual({
      identity: {
        id: userId,
        email: "test@example.invalid",
        display_name: "Test Person",
      },
      client_id: clientId,
      session_id: sessionId,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${issuer}/oauth/userinfo`);
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${value}`
    );
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  });

  it.each([
    ["wrong issuer", { iss: "https://untrusted.invalid/auth/v1" }],
    ["Data API alias issuer", { iss: `${dataOrigin}/auth/v1` }],
    ["GG audience", { aud: "grida-gateway" }],
    ["other client", { client_id: "44444444-4444-4444-8444-444444444444" }],
    ["ordinary browser token", { client_id: undefined }],
    ["missing live session", { session_id: undefined }],
    ["expired token", { exp: Math.floor(now / 1000) - 1 }],
    ["future token", { nbf: Math.floor(now / 1000) + 60 }],
  ])("rejects %s before any issuer request", async (_label, claims) => {
    const fetcher = identityIssuer();
    await expect(
      bearer.authenticate(request(await token(claims)), {
        config,
        fetch: fetcher,
        now,
      })
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not authenticate a cookie-only request", async () => {
    const fetcher = identityIssuer();
    await expect(
      bearer.authenticate(request(), { config, fetch: fetcher, now })
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a forged JWT with otherwise correct decoded claims", async () => {
    await expect(
      bearer.authenticate(
        request(await token({}, new Uint8Array(32).fill(18))),
        { config, fetch: identityIssuer(), now }
      )
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it.each([401, 403])(
    "rejects a session rejected by userinfo (%i)",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response(null, { status })
      );
      await expect(
        bearer.authenticate(request(await token()), {
          config,
          fetch: fetcher,
          now,
        })
      ).rejects.toMatchObject({ code: "unauthorized" });
    }
  );

  it("rejects mismatched verified identity", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ sub: sessionId })
    );
    await expect(
      bearer.authenticate(request(await token()), {
        config,
        fetch: fetcher,
        now,
      })
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it.each(["failure", "redirect", "malformed", "oversized"])(
    "keeps issuer %s distinct from unauthorized",
    async (mode) => {
      const fetcher = vi.fn<typeof fetch>(async () => {
        if (mode === "failure") throw new Error("secret upstream internals");
        if (mode === "redirect")
          return new Response(null, {
            status: 302,
            headers: { location: "https://untrusted.invalid" },
          });
        if (mode === "oversized") return new Response("x".repeat(70_000));
        return new Response("not json");
      });
      await expect(
        bearer.authenticate(request(await token()), {
          config,
          fetch: fetcher,
          now,
        })
      ).rejects.toMatchObject({ code: "auth_unavailable" });
    }
  );
});

describe("GET /api/v1/auth/me", () => {
  it("returns only the agreed identity projection with no-store", async () => {
    vi.stubGlobal("fetch", identityIssuer());
    const response = await GET(request(await token()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      id: userId,
      email: "test@example.invalid",
      display_name: "Test Person",
    });
  });

  it("returns a safe 401 without falling back to cookies", async () => {
    const fetcher = identityIssuer();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "A valid account session is required.",
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not return upstream errors or secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("secret upstream internals");
      })
    );
    const response = await GET(request(await token()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});
