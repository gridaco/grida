/**
 * Stripe webhook receiver — single endpoint for all event types.
 *
 * `GRIDA-SEC-001` —
 * see `editor/app/(ingest)/README.md` for the trust contract this file
 * is bound by, and `/SECURITY.md` for the threat model.
 *
 * Effective URL: `/webhooks/stripe`. The `(ingest)` route group is
 * URL-invisible.
 * Configure: `stripe listen --forward-to localhost:3000/webhooks/stripe`.
 *
 * Pipeline:
 *   1. Read raw body (signature verification needs raw bytes).
 *   2. Verify Stripe signature → 400 on failure.
 *   3. Hand the event to `dispatchStripeEvent`, which calls
 *      `public.fn_billing_apply_stripe_event(...)`. The RPC handles
 *      idempotency (insert into `grida_billing.stripe_event` with ON CONFLICT
 *      DO NOTHING; replays return `result='replayed'`), event projection,
 *      and stamping `processed_at` on success.
 *   4. On error: catch, call `stampStripeEventFailure` (separate transaction)
 *      so the forensic record survives the projector's RAISE-driven
 *      rollback. Return 500 → Stripe retries.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  stripe,
  dispatchStripeEvent,
  stampStripeEventFailure,
  type Stripe,
} from "@/lib/billing";

// Make sure Next doesn't try to parse the body before we can verify the signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "missing stripe-signature header" },
      { status: 400 }
    );
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // GRIDA-SEC-001: rule 2 — fail closed when secret is missing.
    console.error("[webhook/stripe] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 500 }
    );
  }

  // Raw bytes preserve the exact body Stripe signed.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[webhook/stripe] signature verification failed:", message);
    return NextResponse.json(
      { error: "invalid signature", detail: message },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await dispatchStripeEvent(event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[webhook/stripe] handler error for ${event.type} (${event.id}):`,
      msg
    );
    await stampStripeEventFailure(event.id, event.type, msg);
    return NextResponse.json(
      { error: "handler_failed", detail: msg },
      { status: 500 }
    );
  }

  if (result.result === "replayed") {
    return NextResponse.json({ received: true, replayed: true });
  }
  return NextResponse.json({
    received: true,
    type: event.type,
    handler: result.handler,
  });
}
