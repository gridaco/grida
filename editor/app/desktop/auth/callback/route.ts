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
 * Current native clients add the fixed `native_entry=1` provenance marker and
 * land on the inert completion route so the native entry controller can
 * choose the authenticated surface. Unmarked callbacks preserve the fixed
 * `/desktop/welcome` handoff required by Desktop 0.0.13. The marker only
 * selects between those two contained compatibility routes; it is not auth
 * authority, and the cookie-held PKCE verifier remains the sole authority for
 * exchange.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const NATIVE_ENTRY_MARKER = "native_entry";
const NATIVE_ENTRY_MARKER_VALUE = "1";

function usesNativeEntryController(url: URL): boolean {
  const values = url.searchParams.getAll(NATIVE_ENTRY_MARKER);
  return values.length === 1 && values[0] === NATIVE_ENTRY_MARKER_VALUE;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const fail = (reason: string) => {
    const target = new URL("/desktop/auth/sign-in", requestUrl.origin);
    target.searchParams.set("auth_error", reason);
    return NextResponse.redirect(target);
  };

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

  const successPath = usesNativeEntryController(requestUrl)
    ? "/desktop/auth/complete"
    : "/desktop/welcome";
  return NextResponse.redirect(new URL(successPath, requestUrl.origin));
}
