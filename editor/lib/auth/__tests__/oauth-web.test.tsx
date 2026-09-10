// GRIDA-SEC-010 — browser resume and private consent decision boundaries.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConsentPage, { metadata } from "@/app/(untracked)/oauth/consent/page";
import { POST } from "@/app/(api)/private/oauth/decision/route";
import { oauthConsent } from "../oauth-consent";
import { oauthServer } from "../oauth-server";

const auth = vi.hoisted(() => ({
  getUser: vi.fn<() => Promise<unknown>>(),
  getSession: vi.fn<() => Promise<unknown>>(),
  createClient: vi.fn<() => Promise<unknown>>(),
}));
const incoming = vi.hoisted(() => ({
  headers: vi.fn<() => Promise<Headers>>(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: auth.createClient }));
vi.mock("next/headers", () => ({ headers: incoming.headers }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/host/auth/continue-with-google-button", () => ({
  ContinueWithGoogleButton: ({ next }: { next: string }) => (
    <button data-next={next}>Continue with Google</button>
  ),
}));

const id = "authorization_1234567890";
const clientId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const origin = "http://127.0.0.1:3041";
const issuer = "http://127.0.0.1:55431/auth/v1";
const dataOrigin = "http://127.0.0.1:55432";
const callback = "http://127.0.0.1:55435/callback";
const details = {
  authorization_id: id,
  client: { id: clientId, name: "Grida CLI" },
  user: { id: userId, email: "test@example.invalid" },
  redirect_uri: callback,
  scope: "email profile",
};

beforeEach(() => {
  vi.stubEnv("GRIDA_OAUTH_ISSUER", issuer);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", dataOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("GRIDA_OAUTH_CLIENT_IDS", clientId);
  vi.stubEnv("GRIDA_OAUTH_ORIGIN", origin);
  vi.stubEnv("GRIDA_OAUTH_REDIRECT_URIS", callback);
  vi.stubEnv(
    "GRIDA_OAUTH_CONSENT_SECRET",
    "test-only-consent-secret-at-least-32-bytes"
  );
  vi.stubEnv("NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH", "1");
  incoming.headers.mockResolvedValue(
    new Headers({ host: new URL(origin).host })
  );
  auth.createClient.mockResolvedValue({ auth });
  auth.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  auth.getSession.mockResolvedValue({
    data: {
      session: {
        user: { id: userId },
        access_token: "test-browser-access-token",
      },
    },
    error: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      Response.json(
        init?.method === "POST"
          ? { redirect_url: `${callback}?code=test-code&state=test-state` }
          : details
      )
    )
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OAuth consent page", () => {
  it("keeps a form Origin while excluding authorization paths and queries from referrers", () => {
    expect(metadata.referrer).toBe("strict-origin");
  });
  it("resumes local password sign-in directly when no browser session exists", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    await expect(
      ConsentPage({ searchParams: Promise.resolve({ authorization_id: id }) })
    ).rejects.toThrow(`redirect:${oauthConsent.insidersPath(id, { origin })}`);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts the configured Host without an Origin header and keeps the browser session on consent", async () => {
    const html = renderToStaticMarkup(
      await ConsentPage({
        searchParams: Promise.resolve({ authorization_id: id }),
      })
    );
    expect(html).toContain("Authorize Grida CLI");
    expect(html).toContain("test@example.invalid");
    expect(html).toContain('action="/private/oauth/decision"');
    expect(html).toContain('name="proof"');
    expect(html).not.toContain("test-browser-access-token");
    expect(html).not.toContain("challenge");
  });

  it.each([undefined, "localhost:3041", "127.0.0.1:3042", "untrusted.invalid"])(
    "rejects missing or different Host %s before browser or issuer access",
    async (host) => {
      incoming.headers.mockResolvedValue(
        new Headers({
          "x-forwarded-host": new URL(origin).host,
          ...(host ? { host } : {}),
        })
      );
      const html = renderToStaticMarkup(
        await ConsentPage({
          searchParams: Promise.resolve({ authorization_id: id }),
        })
      );
      expect(html).toContain("Unable to authorize");
      expect(html).not.toContain('name="proof"');
      expect(auth.createClient).not.toHaveBeenCalled();
      expect(auth.getUser).not.toHaveBeenCalled();
      expect(auth.getSession).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("accepts navigation from the issuer without requiring its Origin to match the web host", async () => {
    incoming.headers.mockResolvedValue(
      new Headers({
        host: new URL(origin).host,
        origin: "http://127.0.0.1:55431",
      })
    );
    const html = renderToStaticMarkup(
      await ConsentPage({
        searchParams: Promise.resolve({ authorization_id: id }),
      })
    );
    expect(html).toContain("Authorize Grida CLI");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      `${issuer}/oauth/authorizations/${id}`,
      expect.objectContaining({ method: "GET", redirect: "error" })
    );
  });

  it("keeps hosted Google sign-in's next target on this consent page", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH", "0");
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const html = renderToStaticMarkup(
      await ConsentPage({
        searchParams: Promise.resolve({ authorization_id: id }),
      })
    );
    expect(html).toContain(`data-next="/oauth/consent?authorization_id=${id}"`);
    expect(html).not.toContain("/insiders/");
  });

  it("performs the issuer's allowed auto-approval redirect outside error handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          redirect_url: `${callback}?code=test-code&state=test-state`,
        })
      )
    );
    await expect(
      ConsentPage({ searchParams: Promise.resolve({ authorization_id: id }) })
    ).rejects.toThrow(`redirect:${callback}?code=test-code&state=test-state`);
  });

  it("rejects ambiguous authorization IDs before looking at browser cookies", async () => {
    const html = renderToStaticMarkup(
      await ConsentPage({
        searchParams: Promise.resolve({ authorization_id: [id, id] }),
      })
    );
    expect(html).toContain("Unable to authorize");
    expect(auth.createClient).not.toHaveBeenCalled();
  });
});

describe("POST /private/oauth/decision", () => {
  it("rejects a cross-origin post before cookie or issuer access", async () => {
    const response = await POST(
      new Request(`${origin}/private/oauth/decision`, {
        method: "POST",
        headers: { origin: "https://untrusted.invalid" },
      })
    );
    expect(response.status).toBe(403);
    expect(auth.createClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 401 for a missing browser session", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    const response = await POST(
      new Request(`${origin}/private/oauth/decision`, {
        method: "POST",
        headers: { origin, host: new URL(origin).host },
      })
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a changed browser session before sending a decision", async () => {
    auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: clientId }, access_token: "wrong-session" },
      },
      error: null,
    });
    const response = await POST(
      new Request(`${origin}/private/oauth/decision`, {
        method: "POST",
        headers: { origin, host: new URL(origin).host },
      })
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("redirects a verified decision despite Next's internal hostname, with no-store and no-referrer", async () => {
    const view = await new oauthConsent.Service(
      oauthServer.consentConfig()
    ).load(id, { id: userId, access_token: "test-browser-access-token" });
    if (view.kind !== "consent") throw new Error("Expected consent form");
    const response = await POST(
      new Request("http://localhost:3041/private/oauth/decision", {
        method: "POST",
        headers: { origin, host: new URL(origin).host },
        body: new URLSearchParams({
          authorization_id: id,
          proof: view.proof,
          decision: "approve",
        }),
      })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${callback}?code=test-code&state=test-state`
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
