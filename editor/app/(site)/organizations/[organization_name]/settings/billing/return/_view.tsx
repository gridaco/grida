"use client";

// Dedicated post-Stripe-flow callback page. Stripe Checkout / Portal flows
// redirect here; this view polls `getBillingSummary` until the webhook-driven
// state change lands (or a short timeout elapses), then forwards to the main
// billing page. The main billing page is intentionally unaware of post-flow
// concerns — single responsibility per page.
//
// We never reach out to Stripe from here — the webhook is the only source of
// truth. If the webhook is slow or missing (e.g., `stripe listen` not running
// in dev), polling times out and we forward to billing with a soft warning.
//
// The visual chrome is intentionally minimal: a centered spinner. Confirmation
// of what happened belongs on the destination page, where the user can see the
// new plan badge / status flip directly. A loud "Welcome to Pro!" interstitial
// here would be redundant noise.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getBillingSummary, type BillingSummary } from "../_actions";

type Intent = "subscribe" | "payment_method" | "generic";

const POLL_INTERVAL_MS = 3_000;
const MAX_ATTEMPTS = 10; // ~30s total

function isSettled(summary: BillingSummary, intent: Intent): boolean {
  switch (intent) {
    case "subscribe":
      // Paid plan visible AND not in a "first-invoice broken" state.
      return (
        (summary.plan === "pro" || summary.plan === "team") &&
        summary.status !== "incomplete" &&
        summary.status !== "incomplete_expired"
      );
    case "payment_method":
      // The interesting transition is past_due/unpaid → active. If we already
      // see a healthy status, the update has been applied.
      return summary.status === "active" || summary.status === "trialing";
    case "generic":
      // No predicate — just exhaust the poll window.
      return false;
  }
}

export default function BillingReturnView({
  orgId,
  orgName,
  intent,
}: {
  orgId: number;
  orgName: string;
  intent: Intent;
}) {
  const router = useRouter();
  const doneRef = useRef(false);
  const billingHref = `/organizations/${orgName}/settings/billing`;

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const finish = (success: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (!success) {
        // Diagnostic-only: surface staleness so the user knows to refresh
        // if the destination page hasn't caught up. Success path is silent;
        // the destination page reflects the new state on its own.
        toast.message("This is taking longer than expected", {
          description:
            "Your billing page may still be updating — refresh in a moment.",
        });
      }
      router.replace(billingHref);
    };

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      attempts += 1;
      try {
        const summary = await getBillingSummary(orgId);
        if (cancelled || doneRef.current) return;
        if (isSettled(summary, intent)) {
          finish(true);
          return;
        }
      } catch {
        // Network/RLS hiccup mid-poll — swallow and let the next tick retry.
        // A persistent failure exhausts the attempt budget and we forward
        // anyway with the timeout toast.
      }
      if (attempts >= MAX_ATTEMPTS) {
        finish(false);
      }
    };

    // Fire the first probe immediately so a webhook that already landed
    // before the user got back doesn't waste 1.5s.
    void tick();
    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orgId, intent, router, billingHref]);

  // Fullscreen overlay (covers the settings-layout sidebar) so this page is
  // a pure loading interstitial — no chrome, no copy, just a centered spinner.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        aria-label="Loading"
      />
    </div>
  );
}
