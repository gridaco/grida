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

type CurrentState = {
  plan: "free" | "pro" | "team" | string;
  status: string;
  seat_count: number;
  interval: "month" | "year" | null;
} | null;

type Interval = "month" | "year";

type PlanDef = {
  id: "free" | "pro" | "team";
  name: string;
  description: string;
  /** Sticker monthly price per seat. Annual is this × 12 × 0.8 (20% off). */
  monthly_per_seat: number;
  features: ReadonlyArray<string>;
};

// Free is intentionally not listed here. Downgrading to Free means
// canceling the paid subscription, which is handled in the Stripe Customer
// Portal — not from this upgrade page.
const PLANS: ReadonlyArray<PlanDef> = [
  {
    id: "pro",
    name: "Pro",
    description: "For teams with creative workflows.",
    monthly_per_seat: 20,
    features: [
      "Stripe-managed billing & invoices",
      "Per-seat pricing scales with your team",
      "Cancel or switch plans anytime via the Customer Portal",
    ],
  },
  {
    id: "team",
    name: "Team",
    description: "For larger teams.",
    monthly_per_seat: 60,
    features: [
      "Everything in Pro",
      "More storage & monthly active users",
      "Chat support",
    ],
  },
] as const;

const PLAN_RANK: Record<PlanDef["id"], number> = { free: 0, pro: 1, team: 2 };

// Annual discount is encoded inline (20% off the sticker monthly × 12).
function annualPerSeat(plan: PlanDef): number {
  return plan.monthly_per_seat * 12 * 0.8;
}
function effectiveMonthly(plan: PlanDef, interval: Interval): number {
  return interval === "year" ? annualPerSeat(plan) / 12 : plan.monthly_per_seat;
}

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
          seat_count: data.seat_count ?? 1,
          interval: data.interval ?? null,
        });
        if (data.interval) setInterval(data.interval);
      })
      .catch(() =>
        setCurrent({
          plan: "free",
          status: "active",
          seat_count: 1,
          interval: null,
        })
      );
    return () => {
      cancel = true;
    };
  }, [orgId]);

  const subscribe = async (plan: PlanDef) => {
    if (!current || plan.id === "free") return;
    if (plan.id !== "pro" && plan.id !== "team") return;
    setSubmittingPlan(plan.id);
    try {
      const origin = window.location.origin;
      const result = await startSubscribeCheckout(orgId, {
        plan: plan.id,
        interval,
        quantity: current.seat_count,
        success_url: `${origin}${baseUrl}?subscribe=success`,
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
  const changePlan = async (plan: PlanDef) => {
    if (plan.id === "free") return;
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

  const renderPlanAction = (plan: PlanDef) => {
    if (!current) return <Skeleton className="h-9 w-full" />;
    const currentRank = PLAN_RANK[current.plan as PlanDef["id"]] ?? 0;
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
    const currentRank = PLAN_RANK[current.plan as PlanDef["id"]] ?? 0;
    const hasUpgrade = PLANS.some((p) => PLAN_RANK[p.id] > currentRank);
    return hasUpgrade ? "Upgrade" : "Adjust plan";
  })();

  const headerSubtitle = (() => {
    if (!current) return "Choose a plan to fit your team.";
    const currentRank = PLAN_RANK[current.plan as PlanDef["id"]] ?? 0;
    const hasUpgrade = PLANS.some((p) => PLAN_RANK[p.id] > currentRank);
    return hasUpgrade
      ? "Pick a plan that scales with your team."
      : "You're on the highest plan. Manage seats or downgrade in the Stripe Portal.";
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
        {PLANS.map((plan) => {
          const isCurrent = current?.plan === plan.id;
          const monthlyEquivalent = effectiveMonthly(plan, interval);
          const annualSticker = annualPerSeat(plan);
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
                      / seat / mo
                    </span>
                  </p>
                  {interval === "year" && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Billed ${annualSticker.toFixed(0)} / seat annually
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
                {current && (
                  <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                    Total at {current.seat_count} seat
                    {current.seat_count === 1 ? "" : "s"}:{" "}
                    <strong>
                      $
                      {(interval === "year"
                        ? current.seat_count * annualSticker
                        : current.seat_count * plan.monthly_per_seat
                      ).toFixed(2)}
                      {interval === "year" ? " / yr" : " / mo"}
                    </strong>
                  </p>
                )}
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
