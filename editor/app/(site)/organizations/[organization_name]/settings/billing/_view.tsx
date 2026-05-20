"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  CoinsIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  FileTextIcon,
  InfoIcon,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  resumeSubscription,
  startCancelSubscription,
  startPaymentMethodUpdate,
  getAiCreditsSummary,
  listAiCreditTransactions,
  setAiAutoReload,
  disableAiAutoReload,
  startTopUpCheckout,
  startEnableAutoReloadCheckout,
  type AiCreditsSummary,
} from "./_actions";
import type { Transaction as AiCreditTransaction } from "@/lib/billing/metronome";
import {
  AUTO_RELOAD_RECHARGE_MAX_CENTS,
  AUTO_RELOAD_RECHARGE_MIN_CENTS,
  AUTO_RELOAD_THRESHOLD_MIN_CENTS,
  TOPUP_MAX_CENTS,
  TOPUP_MIN_CENTS,
  totalChargeForCredit,
} from "@/lib/billing/fees";
import {
  PAID_PLANS,
  price_dollars,
  price_monthly_equivalent_dollars,
  type Interval,
  type PaidPlanId,
  type PlanId,
} from "@/lib/billing/plans";

type BillingState = {
  org_id: number;
  plan: PlanId;
  status: string;
  interval: Interval | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_active_subscription: boolean;
  is_test_mode: boolean;
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

  // Post-Stripe-flow waiting (subscribe success, payment-method update,
  // etc.) lives on the dedicated `/billing/return` callback page, NOT here.
  // This page's only responsibility is rendering the current billing state.

  const updatePaymentMethod = useCallback(async () => {
    try {
      // Stripe Portal completion → dedicated callback page that polls until
      // the webhook flips status from past_due → active, then forwards back.
      const result = await startPaymentMethodUpdate(orgId, {
        return_url: `${window.location.origin}${baseUrl}/return?intent=payment_method`,
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
        return_url: `${window.location.origin}${baseUrl}`,
      });
      window.location.href = result.portal_url;
    } catch (e) {
      toast.error("Could not open cancellation", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [orgId, baseUrl]);

  // Undo a pending cancellation. Optimistic update: we flip
  // `cancel_at_period_end` locally on click so the badge clears and the
  // Resume button vanishes immediately — the user sees zero latency. The
  // Stripe write happens in the background; the webhook projects the same
  // value into the DB shortly after. If the Stripe call fails (rare), we
  // revert local state and surface the error.
  //
  // No `refresh()` loop / loading flag: that pattern repaints the whole
  // page through the skeleton gate, which is awful UX for a one-bool flip.
  const resume = useCallback(async () => {
    if (!state) return;
    const previous = state;
    setState({ ...state, cancel_at_period_end: false });
    try {
      await resumeSubscription(orgId);
    } catch (e) {
      setState(previous);
      toast.error("Could not resume subscription", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [orgId, state]);

  // First-load failure: state is still null AND err is set. Render the error
  // panel ahead of the skeleton gate so the Retry button is reachable. Once
  // a successful load has happened, transient refresh errors are toasted by
  // refresh() and the existing UI keeps rendering.
  if (err && !state) {
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

  const paidPlan: PaidPlanId | null =
    state.plan === "pro" || state.plan === "team" ? state.plan : null;
  const isPaid = paidPlan !== null;
  const planLabel = paidPlan ? PAID_PLANS[paidPlan].name : "Free";
  // v1: single-seat. Prices come from the catalogue source of truth. Annual
  // shows the monthly equivalent inline so users can sanity-check the discount.
  const priceLabel = paidPlan
    ? state.interval === "year"
      ? `$${price_dollars(paidPlan, "year")}/yr (~$${price_monthly_equivalent_dollars(paidPlan, "year").toFixed(0)}/mo)`
      : `$${price_dollars(paidPlan, "month")}/mo`
    : "$0/mo";
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
          Manage your subscription and invoices for{" "}
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
                {isPaid ? priceLabel : "$0/mo"}
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
                  Stripe rejects price-change on past_due/incomplete subs.
                  Cancellation lives in the Danger zone at the bottom of the
                  page; intentionally not surfaced alongside everyday actions. */}
              {!isPastDue && !isPaused && (
                <Button asChild variant={isPaid ? "outline" : "default"}>
                  <Link href={`${baseUrl}/upgrade`}>
                    {isPaid ? "Adjust plan" : "Upgrade"}
                  </Link>
                </Button>
              )}
              {/* Resume = undo a pending `cancel_at_period_end`. Stripe charges
                  nothing — the existing sub continues on its current schedule.
                  Visible alongside everyday actions on purpose: undoing a
                  destructive action should be at least as easy as taking it.
                  No loading state needed — the click optimistically flips
                  `cancel_at_period_end` so the button vanishes instantly. */}
              {state.cancel_at_period_end && (
                <Button variant="default" onClick={resume}>
                  Resume subscription
                </Button>
              )}
            </CardFooter>
          </Card>
        </SectionShell>

        {/* 2. Grida AI Credit */}
        <AiCreditsSection orgId={orgId} baseUrl={baseUrl} />

        {/* 3. Past Invoices */}
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

        {/* 4. Danger zone — destructive actions are pushed to the bottom of
             the page on purpose, behind a visually distinct boundary. Hidden
             when there's nothing to cancel (free plans, already-canceling,
             past_due/paused subs that need recovery first). */}
        {isPaid && !state.cancel_at_period_end && !isPastDue && !isPaused && (
          <SectionShell
            id="danger-zone"
            title="Danger zone"
            description="Irreversible and account-affecting actions."
          >
            <div className="rounded-xl border border-destructive/30 bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Cancel subscription</p>
                  <p className="text-xs text-muted-foreground">
                    Your plan stays active until the end of the current billing
                    period, then reverts to Free. Top-up balance is preserved.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 border-destructive/40"
                  onClick={cancelSubscription}
                >
                  Cancel subscription
                </Button>
              </div>
            </div>
          </SectionShell>
        )}
      </div>

      {state.is_test_mode && (
        <>
          <Separator className="mt-12" />
          <p className="mt-6 text-xs text-muted-foreground">
            Charges in test mode use Stripe&apos;s sandbox and never bill a real
            card.
          </p>
        </>
      )}
    </main>
  );
}

// ===========================================================================
// Grida AI Credit — Metronome-backed pre-charged credit + auto-reload.
// ===========================================================================

const BUY_PRESETS = [10, 50, 100, 500] as const;

const TXN_LABEL: Record<string, string> = {
  topup: "Top-up",
  auto_reload: "Auto-reload",
  promo: "Promo",
  unknown: "Credit",
};

function fmtCreditAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function UsdInput({
  value,
  onChange,
  className,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-14 tabular-nums"
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        USD
      </span>
    </div>
  );
}

function AiCreditsSection({
  orgId,
  baseUrl,
}: {
  orgId: number;
  baseUrl: string;
}) {
  const [summary, setSummary] = useState<AiCreditsSummary | null>(null);
  const [transactions, setTransactions] = useState<AiCreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoReloadOpen, setAutoReloadOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  // Local form state for auto-reload — separate from `summary` so unsaved
  // edits stay put across the polling refreshes.
  const [autoReloadOn, setAutoReloadOn] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("50");
  const [rechargeInput, setRechargeInput] = useState("100");

  const refresh = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        getAiCreditsSummary(orgId),
        listAiCreditTransactions(orgId, 12),
      ]);
      setSummary(s);
      setTransactions(t);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Sync local form state from summary when the user isn't actively editing.
  // Editing = auto-reload form is open AND values differ from summary; in
  // that case we leave the inputs alone so polling doesn't stomp the user.
  useEffect(() => {
    if (!summary) return;
    setAutoReloadOn(summary.auto_reload !== null);
    if (summary.auto_reload) {
      setThresholdInput(String(summary.auto_reload.threshold_cents / 100));
      setRechargeInput(String(summary.auto_reload.recharge_to_cents / 100));
    }
    // Intentionally only resync when the saved state changes, not on every
    // poll — otherwise the user's in-flight edits get clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    summary?.auto_reload?.threshold_cents,
    summary?.auto_reload?.recharge_to_cents,
    summary?.auto_reload === null,
  ]);

  // Light polling so webhook-driven balance updates appear without manual
  // refresh. Each poll round-trips Stripe + Metronome + Supabase, so we
  // throttle aggressively: skip when the tab is backgrounded (visibilitychange
  // fires a refresh on focus), and stop entirely when state is steady — the
  // user can still hit "Buy Credit" or refresh the page.
  useEffect(() => {
    const isSteady =
      summary !== null && summary.entitled && !summary.drifted && busy === null;
    if (isSteady) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    };
    const t = setInterval(tick, 15_000);
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, summary, busy]);

  const runMutation = useCallback(
    async (label: string, fn: () => Promise<unknown>, success: string) => {
      setBusy(label);
      try {
        await fn();
        toast.success(success);
        await refresh();
      } catch (e) {
        toast.error("Action failed", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  // Dirty-check: form differs from saved state.
  const savedOn =
    summary?.auto_reload !== null && summary?.auto_reload !== undefined;
  const savedThresholdCents = summary?.auto_reload?.threshold_cents ?? null;
  const savedRechargeCents = summary?.auto_reload?.recharge_to_cents ?? null;
  const localThresholdCents = Math.round(parseFloat(thresholdInput) * 100);
  const localRechargeCents = Math.round(parseFloat(rechargeInput) * 100);
  const dirty =
    autoReloadOn !== savedOn ||
    (autoReloadOn &&
      (localThresholdCents !== savedThresholdCents ||
        localRechargeCents !== savedRechargeCents));

  const cancelAutoReload = () => {
    setAutoReloadOn(savedOn);
    if (summary?.auto_reload) {
      setThresholdInput(String(summary.auto_reload.threshold_cents / 100));
      setRechargeInput(String(summary.auto_reload.recharge_to_cents / 100));
    }
  };

  const saveAutoReload = () => {
    // Disable: direct (no charge).
    if (!autoReloadOn) {
      void runMutation(
        "auto-reload-off",
        () => disableAiAutoReload(orgId),
        "Auto-reload disabled."
      );
      return;
    }
    if (
      !Number.isFinite(localThresholdCents) ||
      localThresholdCents < AUTO_RELOAD_THRESHOLD_MIN_CENTS
    ) {
      toast.error(
        `Threshold must be at least $${AUTO_RELOAD_THRESHOLD_MIN_CENTS / 100}.`
      );
      return;
    }
    if (
      !Number.isFinite(localRechargeCents) ||
      localRechargeCents < AUTO_RELOAD_RECHARGE_MIN_CENTS
    ) {
      toast.error(
        `Recharge amount must be at least $${AUTO_RELOAD_RECHARGE_MIN_CENTS / 100}.`
      );
      return;
    }
    // Edit-in-place (already enabled): direct apply, card already authorized.
    if (savedOn) {
      void runMutation(
        "auto-reload-set",
        () => setAiAutoReload(orgId, localThresholdCents, localRechargeCents),
        "Auto-reload updated."
      );
      return;
    }
    // Enable from off: redirect through Stripe Checkout. Charges the
    // recharge amount upfront (= initial top-up) AND saves the card; the
    // webhook then applies the threshold config.
    setBusy("auto-reload-checkout");
    void (async () => {
      try {
        const r = await startEnableAutoReloadCheckout(orgId, {
          threshold_cents: localThresholdCents,
          recharge_to_cents: localRechargeCents,
          success_url: `${window.location.origin}${window.location.pathname}/return?intent=auto_reload_enable`,
          cancel_url: `${window.location.origin}${window.location.pathname}`,
        });
        window.location.href = r.checkout_url;
      } catch (e) {
        toast.error("Could not open Checkout", {
          description: e instanceof Error ? e.message : String(e),
        });
        setBusy(null);
      }
    })();
  };

  // Buy Credit always goes through Stripe Checkout — every commitment is
  // a fresh on-session authorization (handles SCA, expiry, dispute, etc).
  const handleBuy = (cents: number) => {
    setBusy("buy");
    void (async () => {
      try {
        const r = await startTopUpCheckout(orgId, {
          cents,
          success_url: `${window.location.origin}${window.location.pathname}/return?intent=topup`,
          cancel_url: `${window.location.origin}${window.location.pathname}`,
        });
        window.location.href = r.checkout_url;
      } catch (e) {
        toast.error("Could not open Checkout", {
          description: e instanceof Error ? e.message : String(e),
        });
        setBusy(null);
      }
    })();
  };

  if (loading) {
    return (
      <SectionShell id="ai-credits" title="Grida AI Credit">
        <Skeleton className="h-48" />
      </SectionShell>
    );
  }

  if (!summary) {
    return (
      <SectionShell id="ai-credits" title="Grida AI Credit">
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Grida AI Credit is temporarily unavailable. Try refreshing.
            </p>
          </CardContent>
        </Card>
      </SectionShell>
    );
  }

  const balance = summary.balance_cents;
  const blocked = !summary.entitled;
  // First-run = blocked with no spend history. The gate is technically
  // "blocked" because balance is below the floor, but framing it as
  // blocked is alarming for users who haven't done anything yet.
  // Out-of-credit = blocked AND has history → an actual recoverable
  // state worth flagging.
  const isFirstRun =
    blocked && (balance === 0 || balance === null) && transactions.length === 0;
  const isOutOfCredit =
    blocked && (balance === 0 || balance === null) && transactions.length > 0;

  return (
    <SectionShell
      id="ai-credits"
      title="Grida AI Credit"
      description="Purchase credit for Grida AI. These are separate from any credit included in your Pro plan."
    >
      <Card>
        <CardContent className="p-6 space-y-4">
          {/* Balance + Buy Credit */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <CoinsIcon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-xl font-bold tabular-nums">
                  {balance === null ? "—" : fmtCents(balance)}
                </p>
                {isFirstRun && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Buy credit to start using Grida AI.
                  </p>
                )}
                {isOutOfCredit && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Out of credit — top up to continue.
                  </p>
                )}
                {blocked && !isFirstRun && !isOutOfCredit && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Balance is below the minimum to use Grida AI.
                  </p>
                )}
                {summary.drifted && !blocked && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Syncing… updated {fmtCreditAge(summary.cached_balance_at)}
                  </p>
                )}
              </div>
            </div>
            <Button onClick={() => setBuyOpen(true)} disabled={busy !== null}>
              Buy Credit
            </Button>
          </div>

          <Separator />

          {/* Auto-reload (collapsible) */}
          <Collapsible open={autoReloadOpen} onOpenChange={setAutoReloadOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold w-full text-left"
              >
                <ChevronDownIcon
                  className={`size-4 transition-transform ${autoReloadOpen ? "" : "-rotate-90"}`}
                />
                Auto-reload
                {!summary.has_active_subscription && (
                  <Badge variant="outline" className="ml-2 font-normal">
                    Pro plan required
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              {!summary.has_active_subscription && !savedOn && (
                <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                  <InfoIcon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="text-xs">
                      Auto-reload is available on paid plans. Manual top-ups
                      work on any plan.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${baseUrl}/upgrade`}>Upgrade plan</Link>
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-reload-switch" className="text-sm">
                  Auto-reload
                </Label>
                <Switch
                  id="auto-reload-switch"
                  checked={autoReloadOn}
                  onCheckedChange={setAutoReloadOn}
                  disabled={
                    busy !== null ||
                    (!summary.has_active_subscription && !savedOn)
                  }
                />
              </div>

              {autoReloadOn && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ar-threshold" className="text-sm">
                      When Balance Falls Below
                    </Label>
                    <UsdInput
                      value={thresholdInput}
                      onChange={setThresholdInput}
                      disabled={busy !== null}
                    />
                    {(() => {
                      const validThreshold =
                        Number.isFinite(localThresholdCents) &&
                        localThresholdCents >=
                          AUTO_RELOAD_THRESHOLD_MIN_CENTS &&
                        localThresholdCents % 100 === 0;
                      if (!thresholdInput) return null;
                      if (validThreshold) return null;
                      return (
                        <p className="text-xs text-destructive">
                          Minimum balance must be a whole number and at least $
                          {AUTO_RELOAD_THRESHOLD_MIN_CENTS / 100}.
                        </p>
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ar-recharge" className="text-sm">
                      Recharge To Target Balance
                    </Label>
                    <UsdInput
                      value={rechargeInput}
                      onChange={setRechargeInput}
                      disabled={busy !== null}
                    />
                    {(() => {
                      const validRecharge =
                        Number.isFinite(localRechargeCents) &&
                        localRechargeCents >= AUTO_RELOAD_RECHARGE_MIN_CENTS &&
                        localRechargeCents <= AUTO_RELOAD_RECHARGE_MAX_CENTS &&
                        localRechargeCents % 100 === 0;
                      if (!rechargeInput) return null;
                      if (validRecharge) return null;
                      const min = AUTO_RELOAD_RECHARGE_MIN_CENTS / 100;
                      const max = AUTO_RELOAD_RECHARGE_MAX_CENTS / 100;
                      return (
                        <p className="text-xs text-destructive">
                          Target balance must be a whole number between ${min}{" "}
                          and ${max}.
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}

              {autoReloadOn &&
                !savedOn &&
                Number.isFinite(localRechargeCents) &&
                localRechargeCents >= AUTO_RELOAD_RECHARGE_MIN_CENTS && (
                  <p className="text-xs text-muted-foreground">
                    Saving will redirect you to Stripe to authorize an initial{" "}
                    {fmtCents(localRechargeCents)} of credit (charged{" "}
                    {fmtCents(totalChargeForCredit(localRechargeCents))}{" "}
                    including processing fee) and save your card for future
                    auto-recharges.
                  </p>
                )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={cancelAutoReload}
                  disabled={!dirty || busy !== null}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveAutoReload}
                  disabled={!dirty || busy !== null}
                >
                  {busy === "auto-reload-checkout"
                    ? "Opening Checkout…"
                    : "Save Changes"}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Recent activity (collapsible) */}
          {transactions.length > 0 && (
            <>
              <Separator />
              <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-semibold w-full text-left"
                  >
                    <ChevronDownIcon
                      className={`size-4 transition-transform ${activityOpen ? "" : "-rotate-90"}`}
                    />
                    Recent activity
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({transactions.length})
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.sourceId}>
                          <TableCell>
                            <Badge variant="secondary">
                              {TXN_LABEL[t.kind] ?? "Credit"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {fmtCreditAge(t.at)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            +{fmtCents(t.amountCents)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {t.paid ? "paid" : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-3">
        Credit doesn&apos;t expire and is only valid for use on Grida AI.
      </p>

      <BuyCreditDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        autoReload={summary.auto_reload}
        busy={busy === "buy"}
        onConfirm={handleBuy}
        onChangeAutoReload={() => {
          setBuyOpen(false);
          setAutoReloadOpen(true);
        }}
      />
    </SectionShell>
  );
}

function BuyCreditDialog({
  open,
  onOpenChange,
  autoReload,
  busy,
  onConfirm,
  onChangeAutoReload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoReload: AiCreditsSummary["auto_reload"];
  busy: boolean;
  onConfirm: (cents: number) => void;
  onChangeAutoReload: () => void;
}) {
  // Two-step flow:
  //   1. select  → user picks the credit amount; only the credit amount
  //                is shown, no fee math (don't make the markup feel
  //                like an upsell at the picker).
  //   2. confirm → reveal the line-item breakdown (credit + processing
  //                fee + total) and "Continue to Payment".
  // Stripe Checkout handles the actual card UI; this dialog is purely
  // pre-Checkout staging.
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [preset, setPreset] = useState<number>(50);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("50");

  // Reset to step 1 each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep("select");
      setPreset(50);
      setCustomMode(false);
      setCustomValue("50");
    }
  }, [open]);

  const minDollars = TOPUP_MIN_CENTS / 100;
  const maxDollars = TOPUP_MAX_CENTS / 100;
  const dollars = customMode ? parseFloat(customValue) : preset;
  const validAmount =
    Number.isFinite(dollars) && dollars >= minDollars && dollars <= maxDollars;
  const safeDollars = Number.isFinite(dollars) ? dollars : 0;
  const safeCents = Math.round(safeDollars * 100);
  const totalCents = totalChargeForCredit(safeCents);
  const feeCents = totalCents - safeCents;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Buy Grida AI Credit</DialogTitle>
              <DialogDescription>
                Purchase credit as a one-time top-up to use for your team&apos;s
                Grida AI usage. Credit doesn&apos;t expire and is only valid for
                use on Grida AI.
              </DialogDescription>
            </DialogHeader>

            <div className="text-center py-4">
              <p className="text-5xl font-bold tabular-nums">
                ${safeDollars.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">of credit</p>
            </div>

            <div className="flex justify-center gap-2 flex-wrap">
              {BUY_PRESETS.map((v) => (
                <Button
                  key={v}
                  variant={
                    !customMode && preset === v ? "secondary" : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setPreset(v);
                    setCustomMode(false);
                  }}
                  disabled={busy}
                >
                  ${v}
                </Button>
              ))}
              <Button
                variant={customMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => setCustomMode(true)}
                disabled={busy}
              >
                Custom
              </Button>
            </div>

            {customMode && (
              <div className="flex flex-col items-center pt-2 gap-1">
                <UsdInput
                  value={customValue}
                  onChange={setCustomValue}
                  className="max-w-[12rem]"
                  autoFocus
                  disabled={busy}
                />
                {Number.isFinite(dollars) && dollars > 0 && !validAmount && (
                  <p className="text-xs text-destructive">
                    {dollars < minDollars
                      ? `Minimum amount is $${minDollars}.`
                      : `Maximum amount is $${maxDollars}.`}
                  </p>
                )}
              </div>
            )}

            {autoReload && (
              <div className="flex items-center gap-3 rounded-lg bg-muted p-3 mt-2">
                <InfoIcon className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-xs flex-1">
                  Auto-reload is enabled. Your balance will be restored to{" "}
                  <strong>{fmtCents(autoReload.recharge_to_cents)}</strong> when
                  it falls below{" "}
                  <strong>{fmtCents(autoReload.threshold_cents)}</strong>.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onChangeAutoReload}
                >
                  Change
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                disabled={!validAmount || busy}
                onClick={() => setStep("confirm")}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm purchase</DialogTitle>
              <DialogDescription>
                You&apos;ll be redirected to Stripe to complete payment with
                your saved card or a new one.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between py-2 border-b">
                <span>Grida AI Credit</span>
                <span className="tabular-nums">{fmtCents(safeCents)}</span>
              </div>
              <div className="flex items-baseline justify-between py-2 border-b">
                <span>Payment Processing Fee</span>
                <span className="tabular-nums">{fmtCents(feeCents)}</span>
              </div>
              <div className="flex items-baseline justify-between py-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums text-base">
                  {fmtCents(totalCents)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                * Plus applicable tax
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                disabled={!validAmount || busy}
                onClick={() => onConfirm(Math.round(safeDollars * 100))}
              >
                {busy ? "Opening Checkout…" : "Confirm and Pay"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
