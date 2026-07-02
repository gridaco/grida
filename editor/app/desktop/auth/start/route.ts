/**
 * GRIDA-SEC-005 — desktop sign-in, PKCE start.
 *
 * Mints the PKCE code verifier as an `@supabase/ssr` cookie on THIS
 * response — i.e. into the Electron cookie jar — and returns the web
 * **launch page** URL (`/desktop-auth?challenge=…`) for the system browser.
 * The desktop shows a single "Sign in with browser" button; the sign-in
 * METHOD is chosen on the web launch page, which builds its GoTrue flow
 * against the forwarded challenge. The verifier never leaves this jar, so
 * the `code` that any method produces is only exchangeable by this webview
 * (see `../callback/route.ts`). The challenge, though, is confidentiality-
 * sensitive in THIS design (knowing it lets an attacker mint a code bound
 * to it — login-CSRF), which is why the launch page lives in the
 * analytics-free `(untracked)` route group.
 *
 * Must stay a route handler returning `{ url }` (not a redirect): the
 * verifier cookie is only reliably set on a route-handler response
 * (supabase/ssr#55), and the URL must open in the SYSTEM browser
 * (`shell.open_external`), never in the webview.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Deep-link return target. Allowlisted in `supabase/config.toml` locally
 * and in the hosted project's dashboard for production. Deliberately a
 * local twin of `DESKTOP_AUTH_REDIRECT` in
 * `editor/host/auth/desktop-auth-flow.ts` — `app/desktop/**` is lint-barred
 * from importing `@/host/**` (GRIDA-SEC-004 renderer boundary), and one
 * duplicated line beats a hole in that boundary. Its test pins the value
 * against drift.
 */
const DESKTOP_AUTH_REDIRECT = "grida://auth/callback";

export async function POST(request: NextRequest) {
  const client = await createClient();

  // supabase-js has no standalone "create PKCE flow" API — generating an
  // authorize URL is the supported way to mint the verifier cookie. The
  // provider named here is irrelevant: the verifier is flow-agnostic, and
  // the launch page builds the real authorize/OTP request (with whichever
  // method the user picks) against the same challenge.
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: DESKTOP_AUTH_REDIRECT,
      skipBrowserRedirect: true,
    },
  });

  const challenge = data?.url
    ? new URL(data.url).searchParams.get("code_challenge")
    : null;
  if (error || !challenge) {
    console.error("[desktop-auth] PKCE start failed:", error);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }

  const launch = new URL("/desktop-auth", new URL(request.url).origin);
  launch.searchParams.set("challenge", challenge);
  return NextResponse.json({ url: launch.toString() });
}
