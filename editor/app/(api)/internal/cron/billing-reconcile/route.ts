/**
 * Billing reconcile cron — sweeps every provisioned org and pulls a
 * fresh balance read from Metronome into the local cache. Catches
 * missed webhooks (rare; Metronome's at-least-once delivery + our HMAC
 * dedup means the cache occasionally lags).
 *
 * Auth: requires `CRON_SECRET` to match `Authorization: Bearer <secret>`
 * (or `?secret=` for browser ad-hoc). Configure the same secret in
 * Vercel cron settings.
 *
 * Schedule: see `editor/vercel.json` — runs hourly.
 *
 * Idempotent: `refreshBalance` is a write→read→reconcile against
 * Metronome live state. Safe to run more often than once an hour.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { service_role } from "@/lib/supabase/server";
import { refreshBalance } from "@/lib/billing/metronome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONCURRENCY = 4;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header && header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function reconcileBatch(orgIds: number[]) {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < orgIds.length; i += CONCURRENCY) {
    const chunk = orgIds.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((id) => refreshBalance(id))
    );
    for (const r of results) {
      if (r.status === "fulfilled") ok++;
      else failed++;
    }
  }
  return { ok, failed };
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Sweep only orgs already wired to Metronome. Earlier this iterated every
  // public.organization row; that worked because `refreshBalance` is a no-op
  // for unprovisioned orgs, but it scaled badly (O(orgs) per hour with a
  // long unprovisioned tail).
  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_list_provisioned_orgs" as never
  );
  if (error) {
    console.error("[cron/billing-reconcile] list orgs:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const orgIds = ((data ?? []) as Array<{ organization_id: number }>)
    .map((r) => r.organization_id)
    .filter((id): id is number => Number.isFinite(id));

  const startedAt = Date.now();
  const { ok, failed } = await reconcileBatch(orgIds);
  const ms = Date.now() - startedAt;

  console.log(
    `[cron/billing-reconcile] provisioned=${orgIds.length} ok=${ok} failed=${failed} ms=${ms}`
  );
  return NextResponse.json({
    provisioned: orgIds.length,
    ok,
    failed,
    duration_ms: ms,
  });
}
