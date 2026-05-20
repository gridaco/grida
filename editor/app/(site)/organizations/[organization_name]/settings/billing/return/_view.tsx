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
import {
  getAiCreditsSummary,
  getBillingSummary,
  type AiCreditsSummary,
  type BillingSummary,
} from "../_actions";

type Intent =
  | "subscribe"
  | "payment_method"
  | "topup"
  | "auto_reload_enable"
  | "generic";

const POLL_INTERVAL_MS = 3_000;
const MAX_ATTEMPTS = 10; // ~30s total

type Snapshot = {
  billing: BillingSummary | null;
  ai: AiCreditsSummary | null;
};

function isSettled(snap: Snapshot, intent: Intent): boolean {
  switch (intent) {
    case "subscribe": {
      const s = snap.billing;
      if (!s) return false;
      // Paid plan visible AND not in a "first-invoice broken" state.
      return (
        (s.plan === "pro" || s.plan === "team") &&
        s.status !== "incomplete" &&
        s.status !== "incomplete_expired"
      );
    }
    case "payment_method": {
      const s = snap.billing;
      if (!s) return false;
      // The interesting transition is past_due/unpaid → active. If we already
      // see a healthy status, the update has been applied.
      return s.status === "active" || s.status === "trialing";
    }
    case "topup": {
      const a = snap.ai;
      if (!a) return false;
      // Settle on entitlement, not a delta vs baseline. Delta races the
      // webhook: if the webhook lands BEFORE this page mounts, baseline
      // already reflects the new credit and the delta condition never
      // fires. Entitlement is also the user-facing question — "can I
      // use AI now?" — and is what the post-Checkout handler reconciles
      // inline before this page even loads.
      return a.entitled === true;
    }
    case "auto_reload_enable": {
      const a = snap.ai;
      if (!a) return false;
      // Auto-reload config visible AND gate is open.
      return a.auto_reload !== null && a.entitled === true;
    }
    case "generic":
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

    const isAiIntent = intent === "topup" || intent === "auto_reload_enable";

    const tick = async () => {
      if (cancelled || doneRef.current) return;
      attempts += 1;
      try {
        const [billing, ai] = await Promise.all([
          isAiIntent ? Promise.resolve(null) : getBillingSummary(orgId),
          isAiIntent ? getAiCreditsSummary(orgId) : Promise.resolve(null),
        ]);
        const snap: Snapshot = { billing, ai };
        if (cancelled || doneRef.current) return;
        if (isSettled(snap, intent)) {
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
