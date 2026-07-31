"use client";

// GRIDA-EE: billing — paid-plan checkout and legacy subscription transition.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Badge } from "@app/ui/components/badge";
import { Skeleton } from "@app/ui/components/skeleton";
import {
  getBillingSummary,
  startPlanChangeConfirm,
  startSubscribeCheckout,
} from "../_actions";
import {
  PAID_PLANS,
  price_dollars,
  type Interval,
  type PlanId,
} from "@/lib/billing/plans";

type CurrentState = {
  plan: PlanId;
  status: string;
  interval: Interval | null;
  hasActiveSubscription: boolean;
} | null;

const PRO_FEATURES = [
  "Everything available on Free",
  "AI credit auto-reload",
  "Stripe-managed billing and invoices",
  "AI credit purchased separately",
] as const;

const PRO_MONTHLY_PRICE = `$${price_dollars(PAID_PLANS.pro.id, "month")}`;

export default function UpgradeView({
  orgId,
  orgName,
  embedded = false,
}: {
  orgId: number;
  orgName: string;
  /** When true, omit page-level chrome for modal embedding. */
  embedded?: boolean;
}) {
  const [current, setCurrent] = useState<CurrentState>(null);
  const [submitting, setSubmitting] = useState(false);

  const baseUrl = `/organizations/${orgName}/settings/billing`;

  useEffect(() => {
    let canceled = false;
    getBillingSummary(orgId)
      .then((data) => {
        if (canceled) return;
        setCurrent({
          plan: data.plan ?? "free",
          status: data.status ?? "active",
          interval: data.interval ?? null,
          hasActiveSubscription: data.has_active_subscription,
        });
      })
      .catch(() => {
        if (canceled) return;
        setCurrent({
          plan: "free",
          status: "active",
          interval: null,
          hasActiveSubscription: false,
        });
      });
    return () => {
      canceled = true;
    };
  }, [orgId]);

  const subscribe = async () => {
    if (!current) return;
    setSubmitting(true);
    try {
      const origin = window.location.origin;
      const result = await startSubscribeCheckout(orgId, {
        plan: "pro",
        interval: "month",
        success_url: `${origin}${baseUrl}/return?intent=subscribe`,
        cancel_url: `${origin}${baseUrl}?subscribe=canceled`,
      });
      if (!result.checkout_url)
        throw new Error("Checkout did not return a URL.");
      window.location.href = result.checkout_url;
    } catch (error) {
      toast.error("Could not start checkout", {
        description: error instanceof Error ? error.message : String(error),
      });
      setSubmitting(false);
    }
  };

  const moveToPro = async () => {
    setSubmitting(true);
    try {
      const result = await startPlanChangeConfirm(orgId, {
        plan: "pro",
        interval: "month",
        return_url: `${window.location.origin}${baseUrl}`,
      });
      window.location.href = result.portal_url;
    } catch (error) {
      toast.error("Could not open the plan change", {
        description: error instanceof Error ? error.message : String(error),
      });
      setSubmitting(false);
    }
  };

  const isDegraded =
    current?.status === "past_due" ||
    current?.status === "unpaid" ||
    current?.status === "paused" ||
    current?.status === "incomplete" ||
    current?.status === "incomplete_expired";
  const isCurrentPro =
    current?.hasActiveSubscription === true &&
    current.plan === "pro" &&
    current.interval === "month";
  const isLegacy = current?.hasActiveSubscription === true && !isCurrentPro;

  const action = (() => {
    if (!current) return <Skeleton className="h-9 w-full" />;
    if (isDegraded) {
      return (
        <Button variant="outline" disabled className="w-full">
          Resolve payment first
        </Button>
      );
    }
    if (isCurrentPro) {
      return (
        <Button variant="outline" disabled className="w-full">
          Current plan
        </Button>
      );
    }
    if (isLegacy) {
      return (
        <Button className="w-full" disabled={submitting} onClick={moveToPro}>
          {submitting ? "Opening Stripe..." : "Move to Pro monthly"}
        </Button>
      );
    }
    return (
      <Button className="w-full" disabled={submitting} onClick={subscribe}>
        {submitting ? "Redirecting..." : "Upgrade to Pro"}
      </Button>
    );
  })();

  const body = (
    <div className="mx-auto max-w-md">
      {isLegacy && (
        <div className="mb-4 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Team and annual billing are legacy offers. Your current subscription
          remains readable; this action moves it to Pro at {PRO_MONTHLY_PRICE}{" "}
          per month.
        </div>
      )}
      <Card className={isCurrentPro ? "border-primary" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>{PAID_PLANS.pro.name}</span>
            {isCurrentPro && <Badge>Current</Badge>}
          </CardTitle>
          <CardDescription>
            One simple monthly subscription for the organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-3xl font-semibold tabular-nums">
            {PRO_MONTHLY_PRICE}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / month
            </span>
          </p>
          <ul className="space-y-2 text-sm">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>{action}</CardFooter>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Billed monthly per organization. Cancel from billing settings.
      </p>
    </div>
  );

  if (embedded) return body;

  const title = isCurrentPro
    ? "Your plan"
    : isLegacy
      ? "Move to Pro"
      : "Upgrade to Pro";

  return (
    <main className="container mx-auto max-w-4xl py-10">
      <header className="mb-8">
        <Link
          href={baseUrl}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to billing
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">
          Pro is Grida&apos;s only self-service subscription.
        </p>
      </header>
      {body}
    </main>
  );
}
