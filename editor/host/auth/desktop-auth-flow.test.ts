/**
 * GRIDA-SEC-005 — desktop-auth flow builders.
 *
 * Pins: every method's GoTrue flow is bound to the forwarded challenge and
 * the fixed `grida://auth/callback` redirect; challenge validation refuses
 * anything that couldn't be a PKCE S256 challenge; verify-link extraction
 * only ever returns URLs on the configured Supabase origin.
 */
import { describe, it, expect } from "vitest";
import {
  DESKTOP_AUTH_REDIRECT,
  buildAuthorizeUrl,
  buildOtpRequest,
  extractVerifyUrl,
  isValidChallenge,
} from "./desktop-auth-flow";

const CHALLENGE = "NF4wmu64KqpZmRNAuYJrxnETLbuzRbtPSbXpoHggKaA";

describe("isValidChallenge", () => {
  it.each([
    [CHALLENGE, true],
    ["A".repeat(20), true],
    ["A".repeat(128), true],
    ["short", false],
    ["A".repeat(129), false],
    ["has spaces not allowed here padded to length", false],
    ["semi;colon-injection-attempt-padded-to-len", false],
    ["", false],
  ])("%s → %s", (value, valid) => {
    expect(isValidChallenge(value)).toBe(valid);
  });
});

describe("buildAuthorizeUrl", () => {
  it("binds the provider flow to the challenge and the deep-link redirect", () => {
    const url = new URL(
      buildAuthorizeUrl({
        supabaseUrl: "https://supabase.test",
        provider: "google",
        challenge: CHALLENGE,
      })
    );
    expect(url.origin).toBe("https://supabase.test");
    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe(DESKTOP_AUTH_REDIRECT);
    expect(url.searchParams.get("code_challenge")).toBe(CHALLENGE);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  });
});

describe("extractVerifyUrl", () => {
  const SUPABASE = "http://127.0.0.1:54321";

  it("extracts the verify URL from a plain-text email body", () => {
    const body = `Follow this link:\n${SUPABASE}/auth/v1/verify?token=pkce_abc&type=magiclink&redirect_to=grida://auth/callback\n`;
    expect(extractVerifyUrl(body, SUPABASE)).toBe(
      `${SUPABASE}/auth/v1/verify?token=pkce_abc&type=magiclink&redirect_to=grida://auth/callback`
    );
  });

  it("unescapes HTML-entity ampersands from HTML bodies", () => {
    const body = `<a href="${SUPABASE}/auth/v1/verify?token=pkce_abc&amp;type=magiclink&amp;redirect_to=grida://auth/callback">Log In</a>`;
    expect(extractVerifyUrl(body, SUPABASE)).toBe(
      `${SUPABASE}/auth/v1/verify?token=pkce_abc&type=magiclink&redirect_to=grida://auth/callback`
    );
  });

  it("returns null when no verify URL for the given origin exists", () => {
    expect(extractVerifyUrl("no links here", SUPABASE)).toBeNull();
    expect(
      extractVerifyUrl(
        "https://evil.test/auth/v1/verify?token=pkce_abc",
        SUPABASE
      )
    ).toBeNull();
  });
});

describe("buildOtpRequest", () => {
  it("mirrors supabase-js wire shape with the forwarded challenge", () => {
    const { url, init } = buildOtpRequest({
      supabaseUrl: "https://supabase.test",
      apikey: "publishable",
      email: "insider@grida.co",
      challenge: CHALLENGE,
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/auth/v1/otp");
    expect(parsed.searchParams.get("redirect_to")).toBe(DESKTOP_AUTH_REDIRECT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe("publishable");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "insider@grida.co",
      create_user: false,
      code_challenge: CHALLENGE,
      code_challenge_method: "s256",
    });
  });
});
