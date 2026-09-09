// GRIDA-SEC-010 — browser consent intent and exact configured destinations.
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthConsent } from "../oauth-consent";
import { oauthServer } from "../oauth-server";

const id = "authorization_1234567890";
const clientId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const callback = "http://127.0.0.1:55435/callback";
const config: oauthServer.ConsentConfig = {
  issuer: "http://127.0.0.1:55431/auth/v1",
  publishableKey: "test-public-key",
  clientIds: [clientId],
  origin: "http://127.0.0.1:3041",
  redirectUris: [callback, "http://127.0.0.1:55436/callback"],
  secret: new Uint8Array(32).fill(19),
};
const browser = { id: userId, access_token: "test-browser-access-token" };
const details = {
  authorization_id: id,
  client: { id: clientId, name: "Grida CLI" },
  user: { id: userId, email: "test@example.invalid" },
  redirect_uri: callback,
  scope: "email profile",
};

function fixture() {
  let consumed = false;
  let currentDetails: unknown = details;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (consumed) return new Response(null, { status: 400 });
    if (init?.method === "POST") {
      consumed = true;
      const denied = JSON.parse(init.body as string).action === "deny";
      return Response.json({
        redirect_url: `${callback}?${denied ? "error=access_denied&error_description=Denied" : "code=test-code"}&state=test-state`,
      });
    }
    return Response.json(currentDetails);
  });
  let now = Date.now();
  return {
    fetcher,
    service: new oauthConsent.Service(config, fetcher, () => now),
    setDetails(value: unknown) {
      currentDetails = value;
    },
    expire() {
      now += 601_000;
    },
  };
}

async function proof(service: oauthConsent.Service) {
  const view = await service.load(id, browser);
  if (view.kind !== "consent") throw new Error("Expected consent form");
  return view.proof;
}

function decision(
  value: string,
  overrides: Record<string, string> = {},
  origin: string | null = config.origin
) {
  return new Request(`${config.origin}/private/oauth/decision`, {
    method: "POST",
    headers: {
      host: new URL(config.origin).host,
      ...(origin ? { origin } : {}),
    },
    body: new URLSearchParams({
      authorization_id: id,
      proof: value,
      decision: "approve",
      ...overrides,
    }),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("browser consent intent", () => {
  it.each(["approve", "deny"])(
    "binds %s to verified pending details and returns only issuer callback",
    async (action) => {
      const f = fixture();
      const value = await proof(f.service);
      const target = new URL(
        await f.service.decide(decision(value, { decision: action }), browser)
      );
      expect(target.origin + target.pathname).toBe(callback);
      expect(
        target.searchParams.get(action === "approve" ? "code" : "error")
      ).toBe(action === "approve" ? "test-code" : "access_denied");
      expect(f.fetcher).toHaveBeenCalledTimes(3);
      const [url, init] = f.fetcher.mock.calls[2]!;
      expect(url).toBe(`${config.issuer}/oauth/authorizations/${id}/consent`);
      expect(JSON.parse(init?.body as string)).toEqual({ action });
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${browser.access_token}`
      );
      expect(new Headers(init?.headers).get("origin")).toBe(config.origin);
      expect(init?.redirect).toBe("error");
    }
  );

  it.each([null, "https://untrusted.invalid", "http://127.0.0.1:3042"])(
    "rejects POST origin %s before issuer I/O",
    async (origin) => {
      const f = fixture();
      const value = await proof(f.service);
      f.fetcher.mockClear();
      await expect(
        f.service.decide(decision(value, {}, origin), browser)
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(["tampered", "different authorization", "different user", "expired"])(
    "rejects %s proof before issuer I/O",
    async (mode) => {
      const f = fixture();
      let value = await proof(f.service);
      const overrides: Record<string, string> = {};
      if (mode === "tampered") value = value.slice(0, -5) + "xxxxx";
      if (mode === "different authorization")
        overrides.authorization_id = "authorization_0987654321";
      if (mode === "expired") f.expire();
      f.fetcher.mockClear();
      await expect(
        f.service.decide(
          decision(value, overrides),
          mode === "different user" ? { ...browser, id: clientId } : browser
        )
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["scope", { ...details, scope: "email" }],
    ["client", { ...details, client: { id: userId } }],
    ["callback", { ...details, redirect_uri: config.redirectUris[1] }],
    ["user", { ...details, user: { id: clientId } }],
  ])(
    "refuses a changed %s before sending a decision",
    async (_label, changed) => {
      const f = fixture();
      const value = await proof(f.service);
      f.setDetails(changed);
      await expect(
        f.service.decide(decision(value), browser)
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(
        f.fetcher.mock.calls.some(([, init]) => init?.method === "POST")
      ).toBe(false);
    }
  );

  it("leaves one-use authorization authority at the issuer and rejects replay", async () => {
    const f = fixture();
    const value = await proof(f.service);
    await f.service.decide(decision(value), browser);
    await expect(
      f.service.decide(decision(value), browser)
    ).rejects.toMatchObject({ code: "invalid_authorization" });
    expect(
      f.fetcher.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
  });

  it.each(["unexpected scope", "unknown client", "unregistered callback"])(
    "refuses details with %s",
    async (mode) => {
      const f = fixture();
      f.setDetails(
        mode === "unexpected scope"
          ? { ...details, scope: "email admin" }
          : mode === "unknown client"
            ? { ...details, client: { id: userId } }
            : { ...details, redirect_uri: "https://untrusted.invalid/callback" }
      );
      await expect(f.service.load(id, browser)).rejects.toMatchObject({
        code: "forbidden",
      });
    }
  );

  it("allows the issuer's existing-consent fast path only to an exact configured callback", async () => {
    const f = fixture();
    f.setDetails({
      redirect_url: `${callback}?code=existing-consent&state=test-state`,
    });
    expect(await f.service.load(id, browser)).toEqual({
      kind: "redirect",
      url: `${callback}?code=existing-consent&state=test-state`,
    });
    f.setDetails({
      redirect_url: "https://untrusted.invalid/?code=stolen&state=test-state",
    });
    await expect(f.service.load(id, browser)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("resumes insiders sign-in with only a fixed consent path, never a Desktop challenge", () => {
    const url = new URL(oauthConsent.insidersPath(id, config), config.origin);
    expect(url.pathname).toBe("/insiders/auth/basic");
    expect([...url.searchParams.keys()]).toEqual(["next"]);
    expect(url.searchParams.get("next")).toBe(
      `${config.origin}/oauth/consent?authorization_id=${id}`
    );
    expect(
      new URL(url.searchParams.get("next")!, "http://localhost:3041").origin
    ).toBe(config.origin);
    expect(() => oauthConsent.path("https://untrusted.invalid")).toThrow(
      "The authorization request is invalid."
    );
  });
});

describe("incoming consent authority", () => {
  it("accepts the configured Origin and Host when Next reconstructs an internal URL", () => {
    expect(() =>
      oauthConsent.requireOrigin(
        new Request("http://localhost:3041/private/oauth/decision", {
          headers: { origin: config.origin, host: "127.0.0.1:3041" },
        }),
        config
      )
    ).not.toThrow();
  });

  it.each([undefined, "localhost:3041", "127.0.0.1:3042", "untrusted.invalid"])(
    "rejects missing or different Host %s despite forwarded-host claims",
    (host) => {
      expect(() =>
        oauthConsent.requireOrigin(
          new Request(`${config.origin}/private/oauth/decision`, {
            headers: {
              origin: config.origin,
              "x-forwarded-host": "127.0.0.1:3041",
              ...(host ? { host } : {}),
            },
          }),
          config
        )
      ).toThrow(oauthServer.Failure);
    }
  );
});

describe("issuer callback perimeter", () => {
  it.each([
    "http://127.0.0.1:55437/callback?code=c&state=s",
    "http://localhost:55435/callback?code=c&state=s",
    "http://127.0.0.1:55435/other?code=c&state=s",
    "http://127.0.0.1:55435/other/../callback?code=c&state=s",
    "http://2130706433:55435/callback?code=c&state=s",
    "http://user@127.0.0.1:55435/callback?code=c&state=s",
    `${callback}?code=c&state=s#fragment`,
    `${callback}?code=c&state=s&extra=x`,
    `${callback}?code=c&state=s&state=other`,
    `${callback}?code=c`,
    `${callback}?code=&state=s`,
    `${callback}?code=c&error=&state=s`,
    `${callback}?code=&error=access_denied&state=s`,
    `${callback}?code=c&error_description=x&state=s`,
    `${callback}?error=Access-Denied&state=s`,
    `${callback}?code=c&state=%0a`,
  ])("rejects %s", (url) => {
    expect(() => oauthConsent.issuerRedirect(url, config)).toThrow(
      oauthServer.Failure
    );
  });
});

describe("server-owned configuration", () => {
  it("requires explicit client, web origin, callbacks, and consent secret", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55431");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
    vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
    vi.stubEnv("GRIDA_OAUTH_ORIGIN", config.origin);
    vi.stubEnv("GRIDA_OAUTH_REDIRECT_URIS", config.redirectUris.join(","));
    vi.stubEnv(
      "GRIDA_OAUTH_CONSENT_SECRET",
      "test-only-consent-secret-at-least-32-bytes"
    );
    expect(oauthServer.consentConfig()).toMatchObject({
      issuer: config.issuer,
      origin: config.origin,
      clientIds: [clientId],
      redirectUris: config.redirectUris,
    });
    for (const [key, value] of [
      ["GRIDA_OAUTH_CLIENT_IDS", ""],
      ["GRIDA_OAUTH_ORIGIN", "http://untrusted.invalid"],
      ["NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid/selected-issuer"],
      ["GRIDA_OAUTH_REDIRECT_URIS", `${callback}?unregistered=query`],
      ["GRIDA_OAUTH_CONSENT_SECRET", "too-short"],
    ]) {
      const previous = process.env[key!];
      vi.stubEnv(key!, value!);
      expect(() => oauthServer.consentConfig()).toThrow(oauthServer.Failure);
      vi.stubEnv(key!, previous);
    }
  });
});
