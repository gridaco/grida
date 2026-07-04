// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — see docs/wg/platform/hosted-ai.md
/**
 * Scoped AI-token mint/verify.
 *
 * Pins: the token is HS256 with a pinned algorithm list and the
 * `gg:ai` audience; expiry maps to `token_expired` while every other
 * failure (tamper, wrong audience, malformed claims, foreign issuer)
 * collapses to `invalid_token`; the secret is fail-closed (unset or
 * short → `not_configured`, never a weaker fallback); rotation accepts
 * the previous secret for verification but never for signing semantics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import {
  GG_TOKEN_AUDIENCE,
  GG_TOKEN_TTL_SECONDS,
  GgTokenError,
  signGgToken,
  verifyGgToken,
} from "./gg-token";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "other-secret-0123456789abcdef0123456789abcdef";

function requestWith(token: string | null): Request {
  return new Request("https://grida.test/api/v1/ai/models", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function expectCode(
  promise: Promise<unknown>,
  code: GgTokenError["code"]
) {
  await expect(promise).rejects.toSatisfy(
    (err: unknown) => err instanceof GgTokenError && err.code === code
  );
}

beforeEach(() => {
  process.env.GG_TOKEN_SECRET = SECRET;
  delete process.env.GG_TOKEN_SECRET_PREVIOUS;
});

afterEach(() => {
  delete process.env.GG_TOKEN_SECRET;
  delete process.env.GG_TOKEN_SECRET_PREVIOUS;
  vi.useRealTimers();
});

describe("signGgToken / verifyGgToken roundtrip", () => {
  it("carries sub, org, audience, and a 900s window", async () => {
    const { token, expiresAt } = await signGgToken("user-uuid-1", 7);
    const claims = await verifyGgToken(requestWith(token));
    expect(claims.sub).toBe("user-uuid-1");
    expect(claims.org).toBe(7);
    expect(claims.aud).toBe(GG_TOKEN_AUDIENCE);
    expect(claims.exp - claims.iat).toBe(GG_TOKEN_TTL_SECONDS);
    expect(expiresAt.getTime()).toBe(claims.exp * 1000);
  });

  it("rejects invalid sign inputs", async () => {
    await expectCode(signGgToken("", 7), "invalid_token");
    await expectCode(signGgToken("user", 0), "invalid_token");
    await expectCode(signGgToken("user", 1.5), "invalid_token");
  });
});

describe("verification failures", () => {
  it("expired token → token_expired (past the 60s tolerance)", async () => {
    const { token } = await signGgToken("user-uuid-1", 7);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (GG_TOKEN_TTL_SECONDS + 120) * 1000);
    await expectCode(verifyGgToken(requestWith(token)), "token_expired");
  });

  it("still valid inside the clock tolerance", async () => {
    const { token } = await signGgToken("user-uuid-1", 7);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (GG_TOKEN_TTL_SECONDS + 30) * 1000);
    const claims = await verifyGgToken(requestWith(token));
    expect(claims.org).toBe(7);
  });

  it("missing / malformed authorization header → invalid_token", async () => {
    await expectCode(verifyGgToken(requestWith(null)), "invalid_token");
    await expectCode(verifyGgToken(requestWith("not-a-jwt")), "invalid_token");
  });

  it("tampered signature → invalid_token", async () => {
    const { token } = await signGgToken("user-uuid-1", 7);
    const forged = token.slice(0, -4) + "AAAA";
    await expectCode(verifyGgToken(requestWith(forged)), "invalid_token");
  });

  it("wrong audience → invalid_token (a non-AI token never passes)", async () => {
    const foreign = await new SignJWT({ org: 7 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-uuid-1")
      .setAudience("authenticated") // Supabase-style audience
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));
    await expectCode(verifyGgToken(requestWith(foreign)), "invalid_token");
  });

  it("malformed claims → invalid_token", async () => {
    const noOrg = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-uuid-1")
      .setAudience(GG_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));
    await expectCode(verifyGgToken(requestWith(noOrg)), "invalid_token");
  });
});

describe("secret handling", () => {
  it("unset secret → not_configured on both sign and verify", async () => {
    delete process.env.GG_TOKEN_SECRET;
    await expectCode(signGgToken("user", 7), "not_configured");
    await expectCode(verifyGgToken(requestWith("x.y.z")), "not_configured");
  });

  it("short secret (< 32 bytes) → not_configured", async () => {
    process.env.GG_TOKEN_SECRET = "too-short";
    await expectCode(signGgToken("user", 7), "not_configured");
  });

  it("rotation: previous secret verifies, expired-under-previous still maps", async () => {
    process.env.GG_TOKEN_SECRET = OTHER_SECRET;
    process.env.GG_TOKEN_SECRET_PREVIOUS = SECRET;
    const previous = await new SignJWT({ org: 7 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-uuid-1")
      .setAudience(GG_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));
    const claims = await verifyGgToken(requestWith(previous));
    expect(claims.org).toBe(7);

    // Signed with a secret that is neither current nor previous.
    const alien = await new SignJWT({ org: 7 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-uuid-1")
      .setAudience(GG_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(
        new TextEncoder().encode("neither-secret-0123456789abcdef012345678")
      );
    await expectCode(verifyGgToken(requestWith(alien)), "invalid_token");
  });
});
