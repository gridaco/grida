/**
 * GRIDA-SEC-005 — desktop sign-in, PKCE code exchange.
 *
 * The Electron main process navigates the desktop window here after the
 * `grida://auth/callback?code=…` deep link returns from the system browser
 * (`desktop/src/main/protocol-router.ts`). The exchange only succeeds when
 * the PKCE verifier cookie minted by `../start/route.ts` is present in the
 * Electron cookie jar — an attacker-supplied `code` (phished or replayed
 * deep link) was issued against a different verifier and fails safe.
 *
 * On success the standard `@supabase/ssr` session cookies are set on this
 * response (same mechanism as the web `(auth)/auth/callback` route) and the
 * wrapped web app is signed in like any browser session. Every redirect out
 * of this route MUST stay under `/desktop/*` (desktop navigation guard).
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `/desktop/auth/sign-in?auth_error=${encodeURIComponent(reason)}`,
        requestUrl.origin
      )
    );

  if (!code) {
    // GoTrue reports provider errors (user denied, expired flow) as
    // `error`/`error_code` query params instead of a `code`; the desktop
    // protocol router forwards them here verbatim.
    return fail(
      requestUrl.searchParams.get("error_code") ??
        requestUrl.searchParams.get("error") ??
        "missing_code"
    );
  }

  const client = await createClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[desktop-auth] exchangeCodeForSession failed:", error);
    return fail(error.code ?? "exchange_failed");
  }

  return NextResponse.redirect(new URL("/desktop/welcome", requestUrl.origin));
}
