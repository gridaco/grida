/**
 * Metronome webhook receiver.
 *
 * `GRIDA-SEC-001` — see `editor/app/(ingest)/README.md` for the trust
 * contract this file is bound by, and `/SECURITY.md` for the threat model.
 *
 * Effective URL: `/webhooks/metronome`. The `(ingest)` route group is
 * URL-invisible.
 *
 * Pipeline:
 *   1. Read raw body (signature is over the raw bytes).
 *   2. Verify HMAC-SHA256 of `<Date>\n<body>` against the
 *      `Metronome-Webhook-Signature` header. 400 on mismatch.
 *   3. Reject events older than 5 min (per Metronome's dedup guidance).
 *   4. Hand the event to `public.fn_billing_apply_metronome_event` — the
 *      RPC handles dedup (PK on event_id) and dispatches by type.
 *   5. After commit-affecting events, refresh balance for the affected org
 *      (best-effort; webhook still 200's if the refresh fails).
 *   6. Return 200.
 */

import * as crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { service_role } from "@/lib/supabase/server";
import { refreshBalance } from "@/lib/billing/metronome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const REFRESH_TRIGGERS = new Set<string>([
  "payment_gate.payment_status",
  "commit.create",
  "commit.edit",
  "commit.archive",
  "commit.segment.start",
  "commit.segment.end",
  "credit.create",
  "credit.edit",
  "credit.archive",
  "contract.edit",
]);

export async function POST(req: NextRequest) {
  const dateHeader = req.headers.get("date");
  const sigHeader = req.headers.get("metronome-webhook-signature");
  const rawBody = await req.text();

  if (!dateHeader) {
    return NextResponse.json({ error: "missing date header" }, { status: 400 });
  }

  const dateMs = Date.parse(dateHeader);
  if (!Number.isFinite(dateMs)) {
    return NextResponse.json({ error: "invalid date header" }, { status: 400 });
  }
  if (Date.now() - dateMs > FIVE_MINUTES_MS) {
    return NextResponse.json({ error: "stale event" }, { status: 400 });
  }

  const secret = process.env.METRONOME_WEBHOOK_SECRET;
  if (!secret) {
    // GRIDA-SEC-001: fail closed in production.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[metronome-webhook] METRONOME_WEBHOOK_SECRET unset in production — refusing"
      );
      return NextResponse.json({ error: "misconfigured" }, { status: 500 });
    }
    console.warn(
      "[metronome-webhook] METRONOME_WEBHOOK_SECRET unset — accepting unsigned event (dev only)."
    );
  } else {
    if (!sigHeader) {
      return NextResponse.json(
        { error: "missing metronome-webhook-signature header" },
        { status: 400 }
      );
    }
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${dateHeader}\n${rawBody}`)
      .digest("hex");
    if (!timingSafeEqual(expected, sigHeader)) {
      return NextResponse.json({ error: "bad signature" }, { status: 400 });
    }
  }

  let event: {
    id?: string;
    type?: string;
    properties?: {
      customer_id?: string;
      payment_status?: string;
      failure_reason?: string;
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!event.id || !event.type) {
    return NextResponse.json({ error: "missing id or type" }, { status: 400 });
  }

  // DB-backed dedup + dispatch. The RPC inserts the event row (PK on event_id),
  // returns 'replayed' on conflict, otherwise dispatches by type.
  // Cast through unknown because the wrapping `rpc` overloads in supabase-js
  // are too strict to express our migration-defined RPC name; signature is
  // checked by the migration.
  type RpcFn = (
    name: string,
    params: Record<string, unknown>
  ) => Promise<{
    data:
      | { result: string; handler: string }[]
      | { result: string; handler: string }
      | null;
    error: { message: string } | null;
  }>;
  const rpc = service_role.workspace.rpc as unknown as RpcFn;

  const { data, error } = await rpc("fn_billing_apply_metronome_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_payload: event as object,
  });
  if (error) {
    console.error(
      `[metronome-webhook] rpc failed event=${event.id} type=${event.type}: ${error.message}`
    );
    return NextResponse.json({ error: "rpc failed" }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  console.log(
    `[metronome-webhook] ${event.type} id=${event.id} → ${result?.result ?? "?"}`
  );

  // Loud-log silent-recharge failures. Metronome may auto-disable the
  // threshold config on its side after repeated declines; the next
  // refreshBalance below picks that up. The user is not yet notified —
  // tracked separately. KI-BILL-001 mitigation (subscription gate) bounds
  // the volume of these to paying customers.
  if (
    event.type === "payment_gate.payment_status" &&
    event.properties?.payment_status &&
    event.properties.payment_status !== "paid"
  ) {
    console.warn(
      `[metronome-webhook] payment_gate failure id=${event.id} customer=${event.properties.customer_id ?? "?"} status=${event.properties.payment_status} reason=${event.properties.failure_reason ?? "?"}`
    );
  }

  // Best-effort refresh of the cached balance for commit-affecting events.
  if (result?.result === "processed" && REFRESH_TRIGGERS.has(event.type)) {
    const customerId = event.properties?.customer_id;
    if (customerId) {
      try {
        type ResolveRpc = (
          name: string,
          params: Record<string, unknown>
        ) => Promise<{ data: number | string | null; error: unknown }>;
        const resolveRpc = service_role.workspace.rpc as unknown as ResolveRpc;
        const { data: orgIdRaw } = await resolveRpc(
          "fn_billing_resolve_org_by_metronome_customer",
          { p_customer_id: customerId }
        );
        const orgId =
          typeof orgIdRaw === "number"
            ? orgIdRaw
            : typeof orgIdRaw === "string"
              ? Number(orgIdRaw)
              : null;
        if (orgId !== null && Number.isFinite(orgId)) {
          await refreshBalance(orgId);
        }
      } catch (refreshErr) {
        console.warn(
          `[metronome-webhook] refreshBalance failed: ${(refreshErr as Error).message}`
        );
        // Don't surface — the webhook still committed the event row.
      }
    }
  }

  return NextResponse.json({ ok: true, result: result?.result });
}
