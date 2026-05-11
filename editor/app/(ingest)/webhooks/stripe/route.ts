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
 *   4. AI-credit Checkout post-processor runs INDEPENDENTLY of the
 *      projector's replayed/handled distinction, gated by a separate
 *      per-event marker `stripe_event.ai_credit_processed_at` (read via
 *      `readAiCreditMarker`, stamped via `stampAiCreditMarker`). This is
 *      the retry-recovery path: if a previous delivery completed the
 *      projector but failed the post-processor (Metronome 500, network
 *      blip), the next Stripe retry sees `replayed` from the projector
 *      but `marker IS NULL` from the DB, re-runs the post-processor, and
 *      lands the Metronome commit. Without this split, replays
 *      short-circuit before the post-processor and the customer pays
 *      with no balance.
 *   5. On error (projector OR post-processor): catch, call
 *      `stampStripeEventFailure` (separate transaction) so the forensic
 *      record survives the projector's RAISE-driven rollback. Return 500
 *      → Stripe retries.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  stripe,
  dispatchStripeEvent,
  stampStripeEventFailure,
  readAiCreditMarker,
  stampAiCreditMarker,
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

  // AI credit Checkout post-processor — runs independently of `result.result`.
  //
  // The projector and the post-processor have distinct idempotency markers:
  //   - projector → `stripe_event.processed_at` (set inside the RPC)
  //   - post-processor → `stripe_event.ai_credit_processed_at` (set below)
  //
  // We MUST consult the post-processor marker even on `replayed` projector
  // results: a previous delivery may have completed the projector but failed
  // the post-processor (Metronome 500, network blip). The reconcile cron
  // only refreshes balances — it does NOT replay missed top-ups / auto-reload
  // setup, so swallowing the error means the customer paid and got no credit.
  //
  // No-op for any session without the right metadata.kind — the handler
  // returns `result: 'noop'` and we still set the marker so future replays
  // skip cleanly.
  if (event.type === "checkout.session.completed") {
    const aiAlreadyProcessed = await readAiCreditMarker(event.id);
    if (aiAlreadyProcessed === true) {
      return NextResponse.json({
        received: true,
        replayed: result.result === "replayed",
        ai_credit: "already_processed",
      });
    }

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
      // Mark on success (including noop — noop means the event is not an
      // AI-credit event and there's nothing to recover on retry).
      await stampAiCreditMarker(event.id, event.type);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[webhook/stripe] ai-credit post-processor failed for ${event.id}:`,
        msg
      );
      // Do NOT stamp the marker — Stripe will retry, the replay will see
      // marker IS NULL, and we re-enter this branch.
      return NextResponse.json(
        { error: "ai_credit_post_processor_failed", detail: msg },
        { status: 500 }
      );
    }
  }

  // Replayed-and-not-AI-credit (or AI-credit just completed via the branch
  // above): nothing more to do for replays.
  if (result.result === "replayed") {
    return NextResponse.json({ received: true, replayed: true });
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
