"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBillingSummary,
  startSubscribeCheckout,
  startPlanChangeConfirm,
} from "../_actions";
import {
  PAID_PLAN_LIST,
  PLAN_RANK,
  price_monthly_equivalent_dollars,
  price_dollars,
  type Interval,
  type PaidPlanDefinition,
  type PlanId,
} from "@/lib/billing/plans";

// Free is intentionally not listed here. Downgrading to Free means
// canceling the paid subscription, which is handled in the Stripe Customer
// Portal — not from this upgrade page.

type CurrentState = {
  plan: PlanId;
  status: string;
  interval: Interval | null;
} | null;

export default function UpgradeView({
  orgId,
  orgName,
  embedded = false,
}: {
  orgId: number;
  orgName: string;
  /** When true, omit page-level chrome (header, back link, outer <main>). For modal embedding. */
  embedded?: boolean;
}) {
  const [current, setCurrent] = useState<CurrentState>(null);
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("month");

  const baseUrl = `/organizations/${orgName}/settings/billing`;

  useEffect(() => {
    let cancel = false;
    getBillingSummary(orgId)
      .then((data) => {
        if (cancel) return;
        setCurrent({
          plan: data.plan ?? "free",
          status: data.status ?? "active",
          interval: data.interval ?? null,
        });
        if (data.interval) setInterval(data.interval);
      })
      .catch(() =>
        setCurrent({
          plan: "free",
          status: "active",
          interval: null,
        })
      );
    return () => {
      cancel = true;
    };
  }, [orgId]);

  const subscribe = async (plan: PaidPlanDefinition) => {
    if (!current) return;
    setSubmittingPlan(plan.id);
    try {
      const origin = window.location.origin;
      const result = await startSubscribeCheckout(orgId, {
        plan: plan.id,
        interval,
        // Stripe-side completion → dedicated callback page that polls until
        // the webhook lands, then forwards to the billing dashboard.
        success_url: `${origin}${baseUrl}/return?intent=subscribe`,
        cancel_url: `${origin}${baseUrl}?subscribe=canceled`,
      });
      if (!result.checkout_url) {
        throw new Error("checkout error");
      }
      window.location.href = result.checkout_url;
    } catch (e) {
      toast.error("Could not start checkout", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSubmittingPlan(null);
    }
  };

  // Paid→paid plan/interval change. Server picks the price; Stripe Portal
  // shows a single confirm page (no plan picker) with the prorated total.
  const changePlan = async (plan: PaidPlanDefinition) => {
    setSubmittingPlan(plan.id);
    try {
      const result = await startPlanChangeConfirm(orgId, {
        plan: plan.id,
        interval,
        return_url: `${window.location.origin}${baseUrl}`,
      });
      window.location.href = result.portal_url;
    } catch (e) {
      toast.error("Could not start plan change", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSubmittingPlan(null);
    }
  };

  const renderPlanAction = (plan: PaidPlanDefinition) => {
    if (!current) return <Skeleton className="h-9 w-full" />;
    const currentRank = PLAN_RANK[current.plan] ?? 0;
    const planRank = PLAN_RANK[plan.id];
    const samePlan = plan.id === current.plan;
    const sameInterval = current.interval === interval;
    const isCurrent = samePlan && sameInterval;
    const isUpgrade = planRank > currentRank;
    const isDowngrade = planRank < currentRank;
    const isPaidToPaid = currentRank > 0 && planRank > 0;
    // Plan changes blocked while billing is degraded — Stripe rejects
    // price-change on past_due / incomplete subs and dispute-paused subs
    // can't be safely mutated.
    const isDegraded =
      current.status === "past_due" ||
      current.status === "unpaid" ||
      current.status === "paused" ||
      current.status === "incomplete" ||
      current.status === "incomplete_expired";

    if (isCurrent) {
      return (
        <Button variant="outline" disabled className="w-full">
          Current plan
        </Button>
      );
    }
    if (isDegraded) {
      return (
        <Button variant="outline" disabled className="w-full">
          Resolve payment first
        </Button>
      );
    }

    // Paid→paid: same plan + different interval, OR different plan ± any
    // interval. All routed through `subscription_update_confirm` flow_data
    // — Stripe shows a single confirm page with the prorated total.
    if (isPaidToPaid) {
      const labelKind = isUpgrade
        ? "Switch to"
        : isDowngrade
          ? "Downgrade to"
          : "Switch to";
      const intervalSuffix = interval === "year" ? " Annual" : "";
      return (
        <Button
          className="w-full"
          variant={isDowngrade ? "outline" : "default"}
          disabled={submittingPlan !== null}
          onClick={() => changePlan(plan)}
        >
          {submittingPlan === plan.id
            ? "Opening Stripe..."
            : `${labelKind} ${plan.name}${intervalSuffix}`}
        </Button>
      );
    }

    // Free → Paid: new subscription via Stripe Checkout.
    if (isUpgrade) {
      return (
        <Button
          className="w-full"
          disabled={submittingPlan !== null}
          onClick={() => subscribe(plan)}
        >
          {submittingPlan === plan.id
            ? "Redirecting..."
            : `Upgrade to ${plan.name}${interval === "year" ? " Annual" : ""}`}
        </Button>
      );
    }
    return null;
  };

  const headerTitle = (() => {
    if (!current) return "Plans";
    const currentRank = PLAN_RANK[current.plan] ?? 0;
    const hasUpgrade = PAID_PLAN_LIST.some(
      (p) => PLAN_RANK[p.id] > currentRank
    );
    return hasUpgrade ? "Upgrade" : "Adjust plan";
  })();

  const headerSubtitle = (() => {
    if (!current) return "Choose a plan that fits your work.";
    const currentRank = PLAN_RANK[current.plan] ?? 0;
    const hasUpgrade = PAID_PLAN_LIST.some(
      (p) => PLAN_RANK[p.id] > currentRank
    );
    return hasUpgrade
      ? "Pick a plan that fits your work."
      : "You're on the highest plan. Switch interval or downgrade anytime.";
  })();

  const intervalToggle = (
    <div
      role="tablist"
      aria-label="Billing interval"
      className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-1"
    >
      <button
        role="tab"
        aria-selected={interval === "month"}
        onClick={() => setInterval("month")}
        className={`px-3 py-1.5 text-sm rounded ${
          interval === "month"
            ? "bg-background shadow-sm font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Monthly
      </button>
      <button
        role="tab"
        aria-selected={interval === "year"}
        onClick={() => setInterval("year")}
        className={`px-3 py-1.5 text-sm rounded inline-flex items-center gap-2 ${
          interval === "year"
            ? "bg-background shadow-sm font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Annual
        <Badge variant="secondary" className="font-normal">
          Save 20%
        </Badge>
      </button>
    </div>
  );

  const body = (
    <>
      <div className="mb-6 flex justify-end">{intervalToggle}</div>

      <div className="grid gap-4 md:grid-cols-3 items-stretch">
        {PAID_PLAN_LIST.map((plan) => {
          // Match plan AND interval so a plan card doesn't claim "Current"
          // when the user has the same plan on a different interval (and a
          // switch is actually being offered).
          const isCurrent =
            current?.plan === plan.id && current?.interval === interval;
          const monthlyEquivalent = price_monthly_equivalent_dollars(
            plan.id,
            interval
          );
          const annualSticker = price_dollars(plan.id, "year");
          return (
            <Card
              key={plan.id}
              className={`flex flex-col h-full ${isCurrent ? "border-primary" : ""}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.name}</span>
                  {isCurrent && <Badge variant="default">Current</Badge>}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm flex-1">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    ${monthlyEquivalent.toFixed(0)}
                    <span className="text-base font-normal text-muted-foreground">
                      {" "}
                      / mo
                    </span>
                  </p>
                  {interval === "year" && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Billed ${annualSticker.toFixed(0)} annually
                    </p>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckIcon className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>{renderPlanAction(plan)}</CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Test mode: use card <code>4242 4242 4242 4242</code>. After payment,
        you&apos;ll be redirected back here. Provisioning takes a few seconds.
      </p>
    </>
  );

  if (embedded) return body;

  return (
    <main className="container mx-auto py-10 max-w-6xl">
      <header className="mb-6">
        <Link
          href={baseUrl}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to billing
        </Link>
        <h1 className="text-3xl font-bold mt-2">{headerTitle}</h1>
        <p className="text-muted-foreground mt-1">{headerSubtitle}</p>
      </header>
      {body}
    </main>
  );
}
