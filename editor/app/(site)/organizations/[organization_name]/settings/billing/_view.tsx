"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CreditCardIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import {
  getBillingSummary,
  listInvoices,
  startCancelSubscription,
  startPaymentMethodUpdate,
} from "./_actions";

type BillingState = {
  org_id: number;
  plan: string;
  status: string;
  seat_count: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_active_subscription: boolean;
};

type PaymentMethod = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
} | null;

type UpcomingInvoice = {
  amount_due_cents: number;
  period_end_unix: number | null;
  line_count: number;
} | null;

type PastInvoice = {
  id: string;
  status: string;
  amount_paid_cents: number;
  created_unix: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

type InvoicesState = {
  upcoming: UpcomingInvoice;
  past: PastInvoice[];
  payment_method: PaymentMethod;
  billing_email: string | null;
};

function fmtCents(cents: number, decimals = 2): string {
  return `$${(cents / 100).toFixed(decimals)}`;
}

function fmtUnix(unix: number | null): string {
  if (!unix) return "—";
  return format(new Date(unix * 1000), "PP");
}

function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export default function BillingView({
  orgId,
  orgName,
}: {
  orgId: number;
  orgName: string;
}) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BillingState | null>(null);
  const [invoices, setInvoices] = useState<InvoicesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const baseUrl = `/organizations/${orgName}/settings/billing`;

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // Run the two actions in parallel. The summary is the source of truth
      // for the page; invoices is best-effort (soft-fail).
      const [summaryResult, invoicesResult] = await Promise.allSettled([
        getBillingSummary(orgId),
        listInvoices(orgId),
      ]);

      if (summaryResult.status === "rejected") {
        const e = summaryResult.reason;
        throw e instanceof Error ? e : new Error(String(e));
      }
      setState(summaryResult.value);

      if (invoicesResult.status === "fulfilled") {
        setInvoices(invoicesResult.value);
      } else {
        setInvoices({
          upcoming: null,
          past: [],
          payment_method: null,
          billing_email: null,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = searchParams.get("subscribe");
    if (sub === "success") {
      toast.success("Welcome!", {
        description: "Your subscription is provisioning.",
      });
    }
  }, [searchParams]);

  // After Stripe Checkout / Portal return, poll the read view a few times so
  // the UI catches the webhook-driven state change. This NEVER reaches out to
  // Stripe — the webhook is the only source of truth. If the webhook is slow
  // or missing (e.g., `stripe listen` not running), the page stays stale; the
  // fix is to deliver the webhook, not to bypass it from the client.
  useEffect(() => {
    const sub = searchParams.get("subscribe");
    if (sub !== "success") return;

    let cancelled = false;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (cancelled || attempts > 5) {
        clearInterval(interval);
        return;
      }
      void refresh();
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [searchParams, refresh]);

  const updatePaymentMethod = useCallback(async () => {
    try {
      // `?subscribe=success` triggers the polling effect on return so the UI
      // catches the webhook-driven status flip from past_due → active.
      const result = await startPaymentMethodUpdate(orgId, {
        return_url: `${window.location.origin}${baseUrl}?subscribe=success`,
      });
      window.location.href = result.portal_url;
    } catch (e) {
      toast.error("Could not open payment method update", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [orgId, baseUrl]);

  const cancelSubscription = useCallback(async () => {
    try {
      const result = await startCancelSubscription(orgId, {
        return_url: `${window.location.origin}${baseUrl}?subscribe=success`,
      });
      window.location.href = result.portal_url;
    } catch (e) {
      toast.error("Could not open cancellation", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [orgId, baseUrl]);

  if (loading || !state) {
    return (
      <main className="container mx-auto py-10 max-w-4xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Billing</h1>
        </header>
        <div className="space-y-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="container mx-auto py-10 max-w-4xl">
        <h1 className="text-3xl font-bold mb-4">Billing</h1>
        <p className="text-destructive">Failed to load billing: {err}</p>
        <Button onClick={refresh} className="mt-4" variant="outline">
          Retry
        </Button>
      </main>
    );
  }

  const isPaid = state.plan === "pro" || state.plan === "team";
  const planLabel =
    state.plan === "team" ? "Team" : state.plan === "pro" ? "Pro" : "Free";
  const seatPriceDollars = state.plan === "team" ? 60 : 20;
  // Destructive payment-failure states. `incomplete` / `incomplete_expired`
  // mean the *first* invoice never settled (e.g. test card 4000 0000 0000 0002);
  // UX is the same as a renewal failure — point the user at the Stripe portal
  // to fix the payment method.
  const isIncomplete =
    state.status === "incomplete" || state.status === "incomplete_expired";
  const isPastDue =
    state.status === "past_due" || state.status === "unpaid" || isIncomplete;
  const isPaused = state.status === "paused";
  // Period dates are stale while the first invoice has not settled. Hide them
  // for `incomplete*` states; keep them for `past_due`/`unpaid`/`paused`
  // (those carry a real prior period the user paid for once).
  const showPeriodDates = !isIncomplete;
  const periodEndLabel =
    state.current_period_end && showPeriodDates
      ? format(new Date(state.current_period_end), "PP")
      : null;
  const periodStartLabel =
    state.current_period_start && showPeriodDates
      ? format(new Date(state.current_period_start), "PP")
      : null;

  return (
    <main className="container mx-auto py-10 max-w-4xl px-4">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage subscription, seats, and invoices for{" "}
          <span className="font-medium text-foreground">{orgName}</span>
        </p>
      </header>

      {isPastDue && (
        <Card className="mb-8 border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">
              {isIncomplete ? "Payment incomplete" : "Payment failed"}
            </CardTitle>
            <CardDescription>
              {isIncomplete
                ? "Your first invoice has not been paid. Update your payment method to activate the subscription."
                : "Your last invoice could not be charged. Update your payment method to keep the subscription active."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="destructive" onClick={updatePaymentMethod}>
              Update payment method
            </Button>
          </CardFooter>
        </Card>
      )}

      {isPaused && (
        <Card className="mb-8 border-muted bg-muted/30">
          <CardHeader>
            <CardTitle>Subscription suspended</CardTitle>
            <CardDescription>
              Your subscription is on hold while a payment dispute is being
              reviewed. Contact support if you believe this is in error.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-12">
        {/* 1. Subscription Plan */}
        <SectionShell
          id="plan"
          title="Subscription Plan"
          description="Your current Grida plan, status, and renewal."
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-2xl flex items-center gap-3">
                  {planLabel}
                  <Badge variant={isPaid ? "default" : "secondary"}>
                    {state.status}
                  </Badge>
                  {state.cancel_at_period_end && (
                    <Badge variant="outline">cancels at period end</Badge>
                  )}
                </CardTitle>
              </div>
              <CardDescription className="mt-2">
                {isPaid
                  ? `${state.seat_count} seat${state.seat_count === 1 ? "" : "s"} × $${seatPriceDollars}/mo = $${(
                      state.seat_count * seatPriceDollars
                    ).toFixed(2)}/mo`
                  : "$0/mo"}
              </CardDescription>
            </CardHeader>
            {isPaid && (periodStartLabel || periodEndLabel) && (
              <CardContent className="text-sm text-muted-foreground space-y-1">
                {periodStartLabel && periodEndLabel && (
                  <p>
                    Current period: {periodStartLabel} – {periodEndLabel}
                  </p>
                )}
                {periodEndLabel && (
                  <p>
                    {state.cancel_at_period_end ? "Cancels" : "Renews"}{" "}
                    {periodEndLabel}
                  </p>
                )}
              </CardContent>
            )}
            <CardFooter className="gap-2">
              {/* Plan changes blocked while billing is in a degraded state —
                  Stripe rejects price-change on past_due/incomplete subs. */}
              {!isPastDue && !isPaused && (
                <Link href={`${baseUrl}/upgrade`}>
                  <Button variant={isPaid ? "outline" : "default"}>
                    {isPaid ? "Adjust plan" : "Upgrade"}
                  </Button>
                </Link>
              )}
              {isPaid && !state.cancel_at_period_end && !isPastDue && (
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={cancelSubscription}
                >
                  Cancel subscription
                </Button>
              )}
            </CardFooter>
          </Card>
        </SectionShell>

        {/* 2. Past Invoices */}
        <SectionShell
          id="past-invoices"
          title="Past Invoices"
          description="Your most recent Stripe invoices."
        >
          {!invoices?.past.length ? (
            <p className="text-sm text-muted-foreground">
              No past invoices.{" "}
              {isPaid ? "" : "Upgrade to a paid plan to begin billing."}
            </p>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Links</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.past.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{fmtUnix(inv.created_unix)}</TableCell>
                      <TableCell className="tabular-nums">
                        {fmtCents(inv.amount_paid_cents)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            inv.status === "paid" ? "default" : "secondary"
                          }
                        >
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-3">
                        {inv.invoice_pdf && (
                          <a
                            href={inv.invoice_pdf}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline inline-flex items-center gap-1"
                          >
                            <FileTextIcon className="size-3" />
                            PDF
                          </a>
                        )}
                        {inv.hosted_invoice_url && (
                          <a
                            href={inv.hosted_invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline inline-flex items-center gap-1"
                          >
                            <ExternalLinkIcon className="size-3" />
                            View
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionShell>

        {/* 3. Payment Methods */}
        <SectionShell
          id="payment-methods"
          title="Payment Methods"
          description="Card on file for your subscription."
        >
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-6">
            {invoices?.payment_method ? (
              <div className="flex items-center gap-3">
                <CreditCardIcon className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium capitalize">
                    {invoices.payment_method.brand} ••••
                    {invoices.payment_method.last4}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expires{" "}
                    {invoices.payment_method.exp_month
                      .toString()
                      .padStart(2, "0")}
                    /{invoices.payment_method.exp_year}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No payment method on file.
              </p>
            )}
            <Button
              variant="outline"
              onClick={updatePaymentMethod}
              disabled={!isPaid && !invoices?.payment_method}
            >
              Update payment method
            </Button>
          </div>
        </SectionShell>
      </div>

      <Separator className="mt-12" />
      <p className="mt-6 text-xs text-muted-foreground">
        Charges in test mode use Stripe&apos;s sandbox and never bill a real
        card.
      </p>
    </main>
  );
}
