// GRIDA-SEC-010 / GRIDA-SEC-012 — fixed account authority, input and response policy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { accountApi } from "./account";
import { bearer } from "../auth/bearer";

const issuer = "http://127.0.0.1:55431/auth/v1";
const dataOrigin = "http://127.0.0.1:55432";
const endpoint = "http://127.0.0.1:3041/api/v1/auth/me";
const clientId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const key = new Uint8Array(32).fill(27);
const identity = {
  id: userId,
  email: "native@example.invalid",
  display_name: "Native User",
};
const handlers = accountApi.bind("auth.me");
const allow = "GET, HEAD, OPTIONS";

async function token(claims: Record<string, unknown> = {}) {
  return new SignJWT({
    iss: issuer,
    aud: "authenticated",
    sub: userId,
    client_id: clientId,
    session_id: sessionId,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}

function request(method = "GET", value?: string, query = "", headers = {}) {
  return new Request(endpoint + query, {
    method,
    headers: {
      cookie: "browser-user=another-account; sb-session=unrelated-secret",
      ...(value ? { authorization: `Bearer ${value}` } : {}),
      ...headers,
    },
  });
}

const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
  const authorization = new Headers(init?.headers).get("authorization");
  try {
    await jwtVerify(authorization!.slice(7), key, {
      issuer,
      audience: "authenticated",
    });
  } catch {
    return new Response(null, { status: 401 });
  }
  return Response.json({
    sub: userId,
    email: identity.email,
    name: identity.display_name,
    access_token: "issuer-private-field",
  });
});

beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("GRIDA_OAUTH_ISSUER", issuer);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", dataOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
  // Account identity cannot acquire unrelated infrastructure configuration.
  for (const name of [
    "GG_TOKEN_SECRET",
    "SUPABASE_SECRET_KEY",
    "METRONOME_API_KEY",
    "STRIPE_SECRET_KEY",
  ]) {
    vi.stubEnv(name, "");
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("accountApi.bind", () => {
  it("uses native bearer identity despite conflicting cookies and absent billing/GG configuration", async () => {
    const value = await token();
    const response = await handlers.GET(request("GET", value));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(identity);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${issuer}/oauth/userinfo`);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${value}`
    );
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("location")).toBe(false);
  });

  it.each([
    ["cookie-only", null],
    ["ordinary account token", { client_id: undefined }],
    ["Data API alias issuer", { iss: `${dataOrigin}/auth/v1` }],
    ["GG token", { aud: "gg:ai" }],
    ["other OAuth client", { client_id: sessionId }],
  ])(
    "rejects %s without cookie fallback or issuer I/O",
    async (_name, claims) => {
      const response = await handlers.GET(
        request("GET", claims ? await token(claims) : undefined)
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "unauthorized",
          message: "A valid account session is required.",
        },
      });
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([true, false])(
    "HEAD authenticates and stays bodyless (valid bearer: %s)",
    async (valid) => {
      const response = await handlers.HEAD(
        request("HEAD", valid ? await token() : undefined)
      );
      expect(response.status).toBe(valid ? 200 : 401);
      expect(await response.text()).toBe("");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("www-authenticate")).toBe(!valid);
      expect(fetcher).toHaveBeenCalledTimes(valid ? 1 : 0);
    }
  );

  it("OPTIONS reports only the allowed methods without account or issuer configuration", async () => {
    vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", "");
    vi.stubEnv("GRIDA_OAUTH_ISSUER", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await handlers.OPTIONS(request("OPTIONS"));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("allow")).toBe(allow);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "%s returns safe 405 without authenticating or consuming input",
    async (method) => {
      const response = await handlers[method](
        // oxlint-disable-next-line no-invalid-fetch-options -- table contains only POST/PUT/PATCH/DELETE.
        new Request(endpoint, { method, body: "untrusted-body" })
      );
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({
        error: {
          code: "method_not_allowed",
          message: "This method is not allowed.",
        },
      });
      expect(response.headers.get("allow")).toBe(allow);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.has("location")).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(["GET", "HEAD", "OPTIONS"] as const)(
    "%s rejects query input before any issuer request",
    async (method) => {
      const response = await handlers[method](
        request(method, await token(), "?user_id=another-account")
      );
      expect(response.status).toBe(400);
      expect((await response.text()).length > 0).toBe(method === "GET");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([
    { "content-length": "1" },
    { "content-length": "invalid" },
    { "transfer-encoding": "chunked" },
  ])("rejects body framing before issuer I/O: %j", async (headers) => {
    const response = await handlers.GET(
      request("GET", await token(), "", headers)
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an actual OPTIONS body", async () => {
    const input = new Request(endpoint, {
      method: "OPTIONS",
      body: "untrusted-body",
    });
    const response = await handlers.OPTIONS(input);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
    expect(input.bodyUsed).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts the empty stream Next supplies for bodyless OPTIONS", async () => {
    const input = new Request(endpoint, {
      method: "OPTIONS",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await handlers.OPTIONS(input);
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe(allow);
    expect(await response.text()).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds empty-body inspection and cancels an unfinished stream", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn<() => void>();
    const input = new Request(endpoint, {
      method: "OPTIONS",
      body: new ReadableStream<Uint8Array>({ cancel }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const pending = handlers.OPTIONS(input);
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("projects only the declared identity fields from an authenticated result", async () => {
    vi.spyOn(bearer, "authenticate").mockResolvedValue({
      identity: { ...identity, access_token: "private-auth-field" },
      client_id: clientId,
      session_id: sessionId,
    } as bearer.Principal);
    const response = await handlers.GET(request());
    expect(await response.json()).toEqual(identity);
  });

  it.each([
    { ...identity, id: "malformed" },
    { ...identity, email: undefined },
    { ...identity, display_name: 12 },
  ])("rejects an invalid authenticated identity shape", async (invalid) => {
    vi.spyOn(bearer, "authenticate").mockResolvedValue({
      identity: invalid,
      client_id: clientId,
      session_id: sessionId,
    } as unknown as bearer.Principal);
    const response = await handlers.GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "auth_unavailable",
        message: "The account service is unavailable. Try again.",
      },
    });
  });

  it("keeps issuer failure safe and distinct from missing credentials", async () => {
    fetcher.mockRejectedValueOnce(new Error("private issuer diagnostics"));
    const response = await handlers.GET(request("GET", await token()));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.text()).not.toContain("private");
  });
});
