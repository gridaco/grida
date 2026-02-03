/**
 * Cookie-free, side-effect-free service-role Supabase clients.
 *
 * Why this file exists:
 * - `editor/lib/supabase/server.ts` is Server Components / Route Handlers oriented and imports
 *   `next/headers` + `@supabase/ssr`. Importing that module from `proxy.ts` (Edge) is risky.
 * - For Edge request routing, we want a cookie-free, side-effect-free service-role client.
 *
 * Note: our hostname resolver RPC is in `public` per `supabase/AGENTS.md` ("public is API surface"),
 * while the underlying domain tables live in `grida_www`.
 */

import type { Database } from "@app/database";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _publicClient: SupabaseClient<Database, "public"> | null = null;

function env() {
  // Server-side fallback: allow `SUPABASE_URL` (server-only) as well.
  // Prefer `NEXT_PUBLIC_SUPABASE_URL` when present for consistency with other modules.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SECRET_KEY and (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) are required"
    );
  }
  return { url, key };
}

/**
 * Service role client scoped to `public`.
 *
 * Use this for `public.*` RPC calls like `public.www_resolve_hostname`.
 */
export function serviceRolePublicClient(): SupabaseClient<Database, "public"> {
  if (_publicClient) return _publicClient;

  const { url, key } = env();

  const client = createClient<Database, "public">(url, key, {
    db: { schema: "public" },
    auth: {
      // Prevent implicit session persistence / refreshes.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  _publicClient = client;
  return client;
}
