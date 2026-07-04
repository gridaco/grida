// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — see docs/wg/platform/hosted-ai.md
/**
 * Scoped AI-access token — mint + verify.
 *
 * The desktop app's hosted-AI calls are authenticated by a short-lived,
 * purpose-scoped JWT (aud `gg:ai`, 15-minute expiry, org bound at mint
 * time) — never by a Supabase access token and never by cookies. This
 * module is the single mint/verify point: the same-origin
 * `/desktop/auth/token` route signs, the `/api/v1/ai/*` handlers verify.
 * A future non-desktop client (CLI) would mint the same audience, which
 * is why this lives in `@/lib/auth`, not `@/lib/desktop`.
 *
 * Secret: `GG_TOKEN_SECRET` (server-only, >= 32 bytes). Rotation:
 * verification also accepts `GG_TOKEN_SECRET_PREVIOUS`; signing
 * always uses the current secret. Rotate by moving current -> previous,
 * setting a new current, and dropping previous after > 15 minutes.
 * Fail-closed: when unset (or too short) sign/verify throw
 * `not_configured` and callers respond 503 — hosted AI is unavailable,
 * nothing falls back to a weaker credential.
 */
import "server-only";

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

export const GG_TOKEN_AUDIENCE = "gg:ai";
export const GG_TOKEN_TTL_SECONDS = 900;

/** HS256 needs a key at least as long as the hash output. */
const MIN_SECRET_BYTES = 32;
/** Absorbs daemon/server clock skew without materially extending the window. */
const CLOCK_TOLERANCE_SECONDS = 60;

export type GgTokenClaims = {
  /** User uuid. */
  sub: string;
  /** Organization id — membership was verified at mint time. */
  org: number;
  aud: typeof GG_TOKEN_AUDIENCE;
  iat: number;
  exp: number;
};

export class GgTokenError extends Error {
  readonly code: "token_expired" | "invalid_token" | "not_configured";
  constructor(
    code: "token_expired" | "invalid_token" | "not_configured",
    message?: string
  ) {
    super(message ?? code);
    this.name = "GgTokenError";
    this.code = code;
  }
}

function secretFromEnv(name: string): Uint8Array | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const bytes = new TextEncoder().encode(raw);
  if (bytes.byteLength < MIN_SECRET_BYTES) return null;
  return bytes;
}

/** Read per call (not cached): per-request cost is nil and tests stay honest. */
function currentSecret(): Uint8Array {
  const secret = secretFromEnv("GG_TOKEN_SECRET");
  if (!secret) {
    throw new GgTokenError(
      "not_configured",
      "GG_TOKEN_SECRET is unset or shorter than 32 bytes"
    );
  }
  return secret;
}

export async function signGgToken(
  sub: string,
  org: number
): Promise<{ token: string; expiresAt: Date }> {
  if (typeof sub !== "string" || sub.length === 0) {
    throw new GgTokenError("invalid_token", "signGgToken: missing sub");
  }
  if (!Number.isInteger(org) || org <= 0) {
    throw new GgTokenError("invalid_token", "signGgToken: invalid org id");
  }
  const secret = currentSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + GG_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ org })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setAudience(GG_TOKEN_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret);
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verifies the `Authorization: Bearer <token>` header of a hosted-AI
 * request. Only this token kind is ever accepted — a Supabase access
 * token structurally fails (different issuer/keys/audience), which is
 * the point: a leaked AI token buys <= 15 minutes of AI calls, nothing
 * else, and nothing else can be presented here.
 */
export async function verifyGgToken(request: Request): Promise<GgTokenClaims> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new GgTokenError("invalid_token", "missing bearer token");
  }
  const token = match[1]!;

  const payload = await verifyWithRotation(token);

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new GgTokenError("invalid_token", "missing sub claim");
  }
  const org = payload.org;
  if (typeof org !== "number" || !Number.isInteger(org) || org <= 0) {
    throw new GgTokenError("invalid_token", "invalid org claim");
  }
  return {
    sub: payload.sub,
    org,
    aud: GG_TOKEN_AUDIENCE,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

async function verifyWithRotation(token: string) {
  const options = {
    audience: GG_TOKEN_AUDIENCE,
    algorithms: ["HS256"],
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  };
  const current = currentSecret();
  try {
    return (await jwtVerify(token, current, options)).payload;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new GgTokenError("token_expired");
    }
    // Signature mismatch may mean the token was signed with the
    // previous secret mid-rotation — try it before rejecting.
    const previous = secretFromEnv("GG_TOKEN_SECRET_PREVIOUS");
    if (previous && err instanceof joseErrors.JWSSignatureVerificationFailed) {
      try {
        return (await jwtVerify(token, previous, options)).payload;
      } catch (prevErr) {
        if (prevErr instanceof joseErrors.JWTExpired) {
          throw new GgTokenError("token_expired");
        }
        throw new GgTokenError("invalid_token");
      }
    }
    throw new GgTokenError("invalid_token");
  }
}

// ---------------------------------------------------------------------------
// Mint rate limit — abuse damping on the token mint itself. The billing
// gate on the AI endpoints is the real spend control; this only bounds
// mint-endpoint hammering. Fail-open when Upstash is unconfigured
// (local dev), same posture as the library search limiter.
// ---------------------------------------------------------------------------

type MintLimiter = { limit(key: string): Promise<{ success: boolean }> };
let _mintLimiter: MintLimiter | null | undefined;

async function mintLimiter(): Promise<MintLimiter | null> {
  if (_mintLimiter !== undefined) return _mintLimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _mintLimiter = null;
    return _mintLimiter;
  }
  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import("@upstash/ratelimit"),
    import("@upstash/redis"),
  ]);
  _mintLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "rl:v1-ai:mint",
  });
  return _mintLimiter;
}

export async function allowGgTokenMint(userId: string): Promise<boolean> {
  const limiter = await mintLimiter();
  if (!limiter) return true;
  const { success } = await limiter.limit(userId);
  return success;
}
