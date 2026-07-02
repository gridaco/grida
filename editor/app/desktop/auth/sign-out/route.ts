/**
 * GRIDA-SEC-005 — desktop sign-out, same-origin.
 *
 * The desktop renderer must NEVER navigate to the web `/sign-out` route:
 * it is outside `/desktop/*`, so the desktop navigation guard would hand
 * the URL to `shell.openExternal` — signing the user out of their OS
 * browser session instead of the app. This route keeps sign-out (and its
 * redirect) inside the `/desktop/*` surface; callers use a same-origin
 * `fetch`.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const client = await createClient();
  await client.auth.signOut();
  return NextResponse.redirect(
    new URL("/desktop/auth/sign-in", requestUrl.origin),
    { status: 303 }
  );
}
