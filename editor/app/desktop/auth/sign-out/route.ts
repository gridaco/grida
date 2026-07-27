/**
 * GRIDA-SEC-005 — desktop sign-out, same-origin.
 *
 * Only Electron main's `session.fetch` may mutate the shared cookie session.
 * It sets a `Sec-Grida-Desktop-Account-Session` intent header, while Chromium
 * labels that browserless request `Sec-Fetch-Site: none` /
 * `Sec-Fetch-Mode: no-cors` / `Sec-Fetch-Dest: empty` and omits `Origin`.
 * Both the custom and Fetch Metadata headers use browser-forbidden `Sec-`
 * names. A renderer request is therefore refused before Supabase is called,
 * so it cannot bypass the native controller's close/admission/session-clear
 * sequence.
 *
 * The route returns no navigation target; native entry owns the next role.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const NO_STORE = { "cache-control": "no-store" } as const;
const NATIVE_ACCOUNT_SESSION_HEADER = "sec-grida-desktop-account-session";
const NATIVE_SIGN_OUT_INTENT = "sign-out";

export async function POST(request: Request) {
  if (!isNativeAccountRequest(request)) {
    return NextResponse.json(
      { error: "native_sign_out_required" },
      { status: 403, headers: NO_STORE }
    );
  }

  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) {
    console.error("[desktop-auth] signOut failed:", error);
    return NextResponse.json(
      { error: "sign_out_failed" },
      { status: 503, headers: NO_STORE }
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: NO_STORE,
  });
}

/**
 * Fetch Metadata headers use the forbidden `Sec-` prefix, so web content
 * cannot forge them through `fetch`, XHR, a form, or a service worker.
 */
function isNativeAccountRequest(request: Request): boolean {
  return (
    request.headers.get(NATIVE_ACCOUNT_SESSION_HEADER) ===
      NATIVE_SIGN_OUT_INTENT &&
    request.headers.get("origin") === null &&
    request.headers.get("sec-fetch-site") === "none" &&
    request.headers.get("sec-fetch-mode") === "no-cors" &&
    request.headers.get("sec-fetch-dest") === "empty"
  );
}
