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
import {
  disableAutoReload,
  handleAiCreditCheckoutCompleted,
} from "@/lib/billing/metronome";

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

  // AI credit Checkout post-processor — `dispatchStripeEvent` handles the
  // generic projector path (subscribe sessions, payment lifecycle); this
  // additional pass lands the Metronome commit + threshold config for
  // sessions tagged with our AI credit metadata. No-op for any session
  // without the right metadata.kind.
  //
  // On failure: return 500 so Stripe retries. The reconcile cron only
  // refreshes balances — it does NOT replay missed top-ups / auto-reload
  // setup, so swallowing the error means the customer paid and got no credit.
  if (event.type === "checkout.session.completed") {
    try {
      const session = event.data.object as Stripe.Checkout.Session;
      const aiResult = await handleAiCreditCheckoutCompleted({
        id: session.id,
        payment_intent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
        payment_status: session.payment_status,
        metadata: session.metadata as Record<string, string | undefined> | null,
        amount_total: session.amount_total,
      });
      if (aiResult.result !== "noop") {
        console.log(
          `[webhook/stripe] ai-credit ${aiResult.result} for ${event.id}: ${aiResult.detail ?? ""}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[webhook/stripe] ai-credit post-processor failed for ${event.id}:`,
        msg
      );
      return NextResponse.json(
        { error: "ai_credit_post_processor_failed", detail: msg },
        { status: 500 }
      );
    }
  }

  // Subscription cancel → disable Metronome auto-reload.
  //
  // Auto-reload is gated behind an active paid subscription
  // (KI-BILL-001 mitigation in `docs/wg/platform/billing/known-issues.md`).
  // When the subscription cancels, leaving auto-reload enabled means the
  // org keeps eating silent-recharge cost forever — exactly what the gate
  // was meant to prevent. Best-effort: log on failure but don't fail the
  // webhook (the user-side cancel already projected; this is cleanup).
  if (event.type === "customer.subscription.deleted") {
    try {
      const sub = event.data.object as Stripe.Subscription;
      const orgIdRaw = sub.metadata?.grida_organization_id;
      const orgId = orgIdRaw ? parseInt(orgIdRaw, 10) : NaN;
      if (Number.isFinite(orgId)) {
        await disableAutoReload(orgId);
        console.log(
          `[webhook/stripe] disabled auto-reload for org=${orgId} (sub=${sub.id})`
        );
      }
    } catch (err) {
      console.error(
        `[webhook/stripe] disable auto-reload failed for ${event.id}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return NextResponse.json({
    received: true,
    type: event.type,
    handler: result.handler,
  });
}
