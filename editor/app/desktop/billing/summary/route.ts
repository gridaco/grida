// GRIDA-EE: billing — see ee-billing
/**
 * Desktop AI-credits summary, same-origin.
 *
 * The `/desktop/*` CSP keeps `connect-src` closed to `'self'` (+ loopback),
 * so the desktop renderer reads billing state through this route — never
 * from Supabase or Metronome directly. Read-only: every billing CONTROL
 * lives on the web billing page (`manage_path` in the payload), which the
 * app opens in the OS browser.
 *
 * Signed-out is an expected state, not an error: responds 200 with
 * `{ state: "signed_out" }` (the `/desktop/auth/me` philosophy). The org
 * is always session-resolved server-side — the route takes no org
 * parameter, so it adds no new org-id trust input (GRIDA-SEC-003 posture).
 */
import { createClient } from "@/lib/supabase/server";
import { getDesktopBillingSummary } from "@/lib/desktop/billing";
import { NextResponse } from "next/server";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return NextResponse.json({ state: "signed_out" }, { headers: NO_STORE });
  }

  try {
    const summary = await getDesktopBillingSummary(user.id);
    return NextResponse.json(summary, { headers: NO_STORE });
  } catch {
    // Opaque on purpose — never leak Metronome/Postgres error text to the
    // renderer.
    return NextResponse.json(
      { error: "summary_failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}
