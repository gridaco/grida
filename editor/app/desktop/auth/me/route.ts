/**
 * Desktop session read, same-origin.
 *
 * The `/desktop/*` CSP keeps `connect-src` closed to `'self'` (+ loopback),
 * so the desktop renderer cannot call Supabase directly (no supabase-js
 * `getUser`/refresh from the page). All session reads go through this
 * route; the proxy middleware refreshes the session cookies on every
 * same-origin request, so no client-side refresh is needed either.
 *
 * Signed-out is an expected state, not an error: responds 200 with
 * `{ user: null }`.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null }, { headers: NO_STORE });
  }

  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email ?? null,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      },
    },
    { headers: NO_STORE }
  );
}
