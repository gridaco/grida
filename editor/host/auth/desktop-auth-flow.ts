/**
 * GRIDA-SEC-005 — desktop sign-in launch page, flow builders.
 *
 * The desktop app mints a PKCE verifier into its own cookie jar and opens
 * this page in the system browser with only the public `code_challenge`.
 * Every sign-in method offered here MUST create its GoTrue flow with that
 * forwarded challenge and the fixed `grida://auth/callback` redirect — so
 * whatever the method, the resulting single-use `code` deep-links back to
 * the app and is exchangeable only against the app's verifier.
 *
 * Pure URL/request builders, no IO — pinned by `desktop-auth-flow.test.ts`.
 */
import { DESKTOP_AUTH_REDIRECT } from "@/lib/desktop/auth-deeplink";

export { DESKTOP_AUTH_REDIRECT };

/**
 * A PKCE S256 challenge is base64url. Bounds are generous (RFC 7636
 * verifiers are 43–128 chars; an S256 challenge is 43) — the point is to
 * refuse anything that couldn't be a challenge before it reaches a URL.
 */
export function isValidChallenge(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

/**
 * GoTrue OAuth authorize URL for a provider, bound to the desktop's
 * challenge. Hitting this URL creates the flow state server-side and
 * starts the provider ceremony in the browser.
 */
export function buildAuthorizeUrl({
  supabaseUrl,
  provider,
  challenge,
}: {
  supabaseUrl: string;
  provider: "google";
  challenge: string;
}): string {
  const url = new URL("/auth/v1/authorize", supabaseUrl);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", DESKTOP_AUTH_REDIRECT);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "s256");
  return url.toString();
}

/**
 * GoTrue email OTP-link request bound to the desktop's challenge
 * (development-only method; the link lands in Mailpit locally). Mirrors
 * supabase-js's `signInWithOtp` wire shape: `redirect_to` as a query
 * param, challenge in the body, `create_user: false`.
 */
export function buildOtpRequest({
  supabaseUrl,
  apikey,
  email,
  challenge,
}: {
  supabaseUrl: string;
  apikey: string;
  email: string;
  challenge: string;
}): { url: string; init: RequestInit } {
  const url = new URL("/auth/v1/otp", supabaseUrl);
  url.searchParams.set("redirect_to", DESKTOP_AUTH_REDIRECT);
  return {
    url: url.toString(),
    init: {
      method: "POST",
      headers: { "content-type": "application/json", apikey },
      body: JSON.stringify({
        email,
        create_user: false,
        code_challenge: challenge,
        code_challenge_method: "s256",
      }),
    },
  };
}

/**
 * Extracts the GoTrue verify URL from an email body (the OTP link that,
 * when followed, 302s to `grida://auth/callback?code=…`). Used by the
 * insiders desktop branch to consume the link straight from the local
 * Mailpit capture — the developer never opens an inbox. Tolerates
 * HTML-entity-escaped ampersands from HTML email bodies.
 */
export function extractVerifyUrl(
  body: string,
  supabaseUrl: string
): string | null {
  const unescaped = body.replace(/&amp;/g, "&");
  const base = supabaseUrl
    .replace(/\/+$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = unescaped.match(
    new RegExp(`${base}/auth/v1/verify[^\\s"'<>]*`)
  );
  return match?.[0] ?? null;
}
