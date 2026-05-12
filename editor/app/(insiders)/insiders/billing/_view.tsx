"use client";

// Insiders dev harness for billing.
//
// Two-column layout:
//   - left  "Billing portal": configure & top up — state, add credit, auto-reload.
//   - right "Usage": consume credits — simulate usage, watch webhooks land.
//
// Section 1 (pick an org) and the result banner span both columns.
//
// All money inputs are dollars (UI) → cents (API).

import { useCallback, useEffect, useState } from "react";
import {
  actionAddComplimentaryCommit,
  actionAddStripeChargedCommit,
  actionDisableAutoReload,
  actionGetAccountView,
  actionGetAlertsStatus,
  actionGetBalance,
  actionGetEntitlement,
  actionGetInvoicePdf,
  actionGetInvoices,
  actionGetTransactions,
  actionIngest,
  actionIngestGated,
  actionLinkStripeAndAttachTestCard,
  actionListWebhookEvents,
  actionProvisionOrg,
  actionRefreshBalance,
  actionRevokeUnused,
  actionSetAutoReload,
} from "./actions";
import type { ActionResult, WebhookEventRow } from "./actions";

// ---- helpers --------------------------------------------------------------

const fmtCents = (n?: number | null) =>
  typeof n === "number" ? `$${(n / 100).toFixed(2)}` : "—";

const dollarsToCents = (s: string): number | null => {
  const f = parseFloat(s);
  if (!Number.isFinite(f) || f < 0) return null;
  return Math.round(f * 100);
};

const PRIORITY_LABEL = (p?: number): string => {
  if (p === undefined || p === null) return "—";
  if (p <= 70) return `PROMO (${p})`;
  return `TOPUP (${p})`;
};

const fmtAge = (iso?: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "in the future";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** Future- AND past-aware relative formatter. */
const fmtRel = (iso?: string | null): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const dms = t - Date.now();
  const future = dms > 0;
  const abs = Math.abs(dms);
  const s = Math.floor(abs / 1000);
  let body: string;
  if (s < 60) body = `${s}s`;
  else if (s < 3600) body = `${Math.floor(s / 60)}m`;
  else if (s < 86_400) body = `${Math.floor(s / 3600)}h`;
  else if (s < 31_536_000) body = `${Math.floor(s / 86_400)}d`;
  else body = `${Math.floor(s / 31_536_000)}y`;
  return future ? `in ${body}` : `${body} ago`;
};

/** Translate Metronome's internal invoice `type` to user-facing language. */
const INVOICE_TYPE_LABEL: Record<string, string> = {
  SCHEDULED: "Credit purchase",
  USAGE: "Usage",
  USAGE_CONSOLIDATED: "Usage (rolled up)",
  CONTRACT_USAGE: "Usage",
  AD_HOC: "One-off",
};

const fmtInvoiceType = (t?: string) => (t && INVOICE_TYPE_LABEL[t]) || t || "—";

/** Decode base64 → Blob → trigger a one-shot browser download. */
function downloadBase64Pdf(filename: string, dataB64: string) {
  const bin = atob(dataB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Hard year cutoff for "indefinite" top-up commits (FAR_FUTURE = 2099). */
const isIndefinite = (iso?: string | null): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  // Anything > 10 years from now is treated as "no end".
  return t - Date.now() > 10 * 365 * 86_400_000;
};

type Extract<T> = T extends { ok: true; data: infer D } ? D : never;
type AccountView = Extract<Awaited<ReturnType<typeof actionGetAccountView>>>;
type BalanceData = Extract<Awaited<ReturnType<typeof actionGetBalance>>>;
type EntitlementData = Extract<
  Awaited<ReturnType<typeof actionGetEntitlement>>
>;
type TransactionsData = Extract<
  Awaited<ReturnType<typeof actionGetTransactions>>
>;
type InvoicesData = Extract<Awaited<ReturnType<typeof actionGetInvoices>>>;
type AlertsData = Extract<Awaited<ReturnType<typeof actionGetAlertsStatus>>>;

const TXN_LABEL: Record<string, string> = {
  topup: "Top-up",
  auto_reload: "Auto-reload",
  promo: "Promo",
  unknown: "Credit",
};

const TXN_BADGE_CLASS: Record<string, string> = {
  topup: "bg-blue-600/15 text-blue-700 dark:text-blue-300",
  auto_reload: "bg-purple-600/15 text-purple-700 dark:text-purple-300",
  promo: "bg-amber-600/15 text-amber-700 dark:text-amber-300",
  unknown: "bg-muted text-muted-foreground",
};

// ---- shared UI primitives -------------------------------------------------

function Section({
  step,
  title,
  description,
  children,
}: {
  step?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border rounded-lg p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="font-semibold flex items-center gap-2">
          {step !== undefined && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">
              {step}
            </span>
          )}
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Btn({
  busy,
  label,
  loading,
  onClick,
  disabled,
  variant = "default",
}: {
  busy?: boolean;
  label: string;
  loading?: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger" | "ghost";
}) {
  const base =
    "px-3 py-1.5 border rounded text-xs disabled:opacity-50 transition";
  const variants = {
    default: "border-border hover:bg-muted",
    primary:
      "border-emerald-600 dark:border-emerald-500 bg-emerald-600/10 hover:bg-emerald-600/20",
    danger:
      "border-red-600 dark:border-red-500 bg-red-600/10 hover:bg-red-600/20",
    ghost: "border-transparent hover:bg-muted text-muted-foreground",
  };
  return (
    <button
      className={`${base} ${variants[variant]}`}
      disabled={disabled || busy || loading}
      onClick={onClick}
    >
      {loading ? "…" : label}
    </button>
  );
}

function Pill({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <span
      className={
        "inline-block px-2 py-0.5 rounded text-xs font-medium " +
        (ok
          ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
          : "bg-red-600/10 text-red-700 dark:text-red-300")
      }
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

function DollarInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
        $
      </span>
      <input
        className="w-full bg-muted border border-border rounded pl-5 pr-2 py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
      />
    </div>
  );
}

// ---- the page -------------------------------------------------------------

export default function BillingDevView() {
  const [orgId, setOrgId] = useState<string>("1");
  const [topUpAmount, setTopUpAmount] = useState<string>("25");
  const [compAmount, setCompAmount] = useState<string>("5");
  const [reloadThreshold, setReloadThreshold] = useState<string>("10");
  const [reloadAmount, setReloadAmount] = useState<string>("50");
  const [ingestDollars, setIngestDollars] = useState<string>("1");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [view, setView] = useState<AccountView | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementData | null>(null);
  const [events, setEvents] = useState<WebhookEventRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionsData | null>(
    null
  );
  const [invoices, setInvoices] = useState<InvoicesData | null>(null);
  const [alerts, setAlerts] = useState<AlertsData | null>(null);
  const [showRaw, setShowRaw] = useState<boolean>(false);

  const orgIdNum = (() => {
    const n = parseInt(orgId, 10);
    return Number.isFinite(n) ? n : null;
  })();

  const refreshAll = useCallback(async (id: number) => {
    const [v, b, e, ev, tx, inv, al] = await Promise.all([
      actionGetAccountView(id),
      actionGetBalance(id),
      actionGetEntitlement(id),
      actionListWebhookEvents(id, 20),
      actionGetTransactions(id),
      actionGetInvoices(id),
      actionGetAlertsStatus(id),
    ]);
    if (v.ok) setView(v.data);
    if (b.ok) setBalance(b.data);
    if (e.ok) setEntitlement(e.data);
    if (ev.ok) setEvents(ev.data);
    if (tx.ok) setTransactions(tx.data);
    if (inv.ok) setInvoices(inv.data);
    if (al.ok) setAlerts(al.data);
  }, []);

  // Auto-load state when org id is valid + on mount.
  useEffect(() => {
    if (orgIdNum !== null) {
      void refreshAll(orgIdNum);
    }
  }, [orgIdNum, refreshAll]);

  // Auto-poll the webhook log every 5s so users see events arrive live.
  useEffect(() => {
    if (orgIdNum === null) return;
    const t = setInterval(() => {
      void actionListWebhookEvents(orgIdNum, 20).then((r) => {
        if (r.ok) setEvents(r.data);
      });
    }, 5000);
    return () => clearInterval(t);
  }, [orgIdNum]);

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<ActionResult<T>>) => {
      if (orgIdNum === null) {
        setLastResult({
          action: label,
          ok: false,
          error: "org_id must be a number",
        });
        return;
      }
      setBusy(label);
      try {
        const res = await fn();
        setLastResult({ action: label, ...res });
        await refreshAll(orgIdNum);
        return res;
      } finally {
        setBusy(null);
      }
    },
    [orgIdNum, refreshAll]
  );

  const account = view?.db ?? null;
  const live = view?.live ?? null;
  const drift = view?.drift;
  const driftKeys = drift
    ? (Object.keys(drift) as Array<keyof typeof drift>).filter((k) => drift[k])
    : [];
  const stripeLinked = !!account?.stripe_customer_id;
  const metronomeLinked = !!account?.metronome_customer_id;
  const autoReloadOn = !!live?.autoReload?.enabled;
  const liveBalanceCents = live?.balanceCents ?? null;
  // Empty-window state: auto-reload is configured AND balance is below
  // its threshold. Metronome's recharge is in-flight (~3-5 min).
  const reloadThresholdCents = live?.autoReload?.thresholdCents ?? null;
  const reloadInFlight =
    autoReloadOn &&
    reloadThresholdCents !== null &&
    liveBalanceCents !== null &&
    liveBalanceCents < reloadThresholdCents;

  const lastResultTyped = lastResult as
    | { action: string; ok: true; data: unknown }
    | { action: string; ok: false; error: string }
    | null;

  return (
    <div className="min-h-dvh bg-background text-foreground p-6 md:p-8 font-mono text-sm">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header ------------------------------------------------------ */}
        <header className="space-y-2 pb-2 border-b border-border">
          <h1 className="text-2xl font-bold tracking-tight">
            Billing — dev harness
          </h1>
          <p className="text-muted-foreground text-sm">
            Configure billing on the left; consume credits on the right.
          </p>
          <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-600/10 rounded px-2 py-1">
            <span>⚠</span>
            <span>
              The AI seam isn&apos;t wired yet. Ingesting past balance creates
              real PAYG charges on the draft invoice.
            </span>
          </div>
        </header>

        {/* Result banner — visible feedback for every action ----------- */}
        {lastResultTyped && (
          <div
            className={
              "border rounded-lg p-3 text-xs " +
              (lastResultTyped.ok
                ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-200"
                : "border-red-600/40 bg-red-600/10 text-red-800 dark:text-red-200")
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="font-bold">
                  {lastResultTyped.ok ? "✓" : "✗"}
                </span>{" "}
                <span className="font-mono">{lastResultTyped.action}</span>{" "}
                {lastResultTyped.ok ? "succeeded" : "failed"}
              </div>
              <button
                className="opacity-70 hover:opacity-100"
                onClick={() => setLastResult(null)}
                aria-label="dismiss"
              >
                ×
              </button>
            </div>
            {!lastResultTyped.ok && (
              <pre className="mt-2 text-xs whitespace-pre-wrap break-all">
                {lastResultTyped.error}
              </pre>
            )}
            {lastResultTyped.ok &&
              lastResultTyped.data !== null &&
              lastResultTyped.data !== undefined && (
                <pre className="mt-2 text-[10px] opacity-80 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                  {JSON.stringify(lastResultTyped.data, null, 2)}
                </pre>
              )}
          </div>
        )}

        {/* 1. Pick an org --------------------------------------------- */}
        <Section
          step={1}
          title="Pick an org"
          description="Enter an org id, then run the two setup actions in order."
        >
          <div className="flex gap-2 items-end">
            <label className="block flex-1">
              <span className="block text-xs text-muted-foreground mb-1">
                organization_id
              </span>
              <input
                className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="1"
              />
            </label>
          </div>
          <div className="grid md:grid-cols-2 gap-3 mt-2">
            <div className="space-y-1">
              <Btn
                variant={stripeLinked ? "default" : "primary"}
                busy={busy !== null}
                loading={busy === "linkStripe"}
                disabled={orgIdNum === null}
                label={
                  stripeLinked
                    ? "Re-attach test card"
                    : "Link Stripe + test card"
                }
                onClick={() =>
                  run("linkStripe", () =>
                    actionLinkStripeAndAttachTestCard(orgIdNum!)
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Creates Stripe customer if missing, attaches{" "}
                <code className="bg-muted px-1 rounded">pm_card_visa</code> as
                default. Test mode only.
              </p>
            </div>
            <div className="space-y-1">
              <Btn
                variant={metronomeLinked ? "default" : "primary"}
                busy={busy !== null}
                loading={busy === "provision"}
                disabled={orgIdNum === null}
                label={metronomeLinked ? "Re-provision" : "Provision Metronome"}
                onClick={() =>
                  run("provision", () => actionProvisionOrg(orgIdNum!))
                }
              />
              <p className="text-xs text-muted-foreground">
                Match-or-create the Metronome customer + contract. If Stripe is
                linked, the contract uses it for billing.
              </p>
            </div>
          </div>
        </Section>

        {/* Two-column body — billing portal (left) | usage (right) ---- */}
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          {/* ====== LEFT: Billing portal ============================== */}
          <div className="space-y-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
              Billing portal — configure & top up
            </div>

            {/* 2. State ------------------------------------------------ */}
            <Section
              step={2}
              title="Current state"
              description="DB cache (gate truth) + live read from billing backbone. Drift = dropped webhook."
            >
              {/* Linkage badges */}
              <div className="flex flex-wrap gap-2">
                <Pill
                  ok={stripeLinked}
                  okLabel="Stripe linked"
                  badLabel="Stripe NOT linked"
                />
                <Pill
                  ok={metronomeLinked}
                  okLabel="Metronome linked"
                  badLabel="Metronome NOT linked"
                />
                <Pill
                  ok={autoReloadOn}
                  okLabel="Auto-reload ON"
                  badLabel="Auto-reload off"
                />
              </div>

              {driftKeys.length > 0 && (
                <div className="text-xs border border-amber-600/40 bg-amber-600/10 text-amber-800 dark:text-amber-200 rounded p-2">
                  <span className="font-bold">⚠ DB cache drift</span> — local
                  cache disagrees with Metronome on:{" "}
                  <code className="bg-muted px-1 rounded">
                    {driftKeys.join(", ")}
                  </code>
                  . Usually a dropped webhook. UI shows the live values; click{" "}
                  <em>Refresh from Metronome</em> to re-sync the cache.
                </div>
              )}

              {/* Gate verdict — the headline */}
              <div className="mt-2 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-baseline justify-between">
                  <div className="text-xs text-muted-foreground">
                    Gate decision
                  </div>
                  <div className="text-xs text-muted-foreground">
                    cache {fmtAge(account?.cached_balance_at)}
                  </div>
                </div>
                <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                  {entitlement ? (
                    <span
                      className={
                        "text-lg font-bold " +
                        (entitlement.allowed
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400")
                      }
                    >
                      {entitlement.allowed
                        ? "ALLOWED"
                        : `BLOCKED — ${entitlement.reason ?? "?"}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <span className="text-sm">
                    <span className="text-muted-foreground">live </span>
                    <span className="font-bold">
                      {fmtCents(liveBalanceCents)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    (cache {fmtCents(account?.cached_balance_cents)})
                  </span>
                </div>

                {reloadInFlight && (
                  <div className="mt-2 text-xs border border-blue-600/40 bg-blue-600/10 text-blue-800 dark:text-blue-200 rounded p-2">
                    <span className="font-bold">⏳ Topping up</span> — balance
                    is below the auto-reload threshold (
                    {fmtCents(reloadThresholdCents)}). Metronome typically fires
                    the recharge within 3–5 minutes; the gate may refuse during
                    this window.
                  </div>
                )}

                <div className="mt-2">
                  <Btn
                    variant="ghost"
                    busy={busy !== null}
                    loading={busy === "refreshBalance"}
                    disabled={orgIdNum === null}
                    label="Refresh from Metronome"
                    onClick={() =>
                      run("refreshBalance", () =>
                        actionRefreshBalance(orgIdNum!)
                      )
                    }
                  />
                </div>
              </div>

              {/* Alerts (auto-provisioned by provisionOrg) */}
              <div>
                <div className="text-xs text-muted-foreground mb-1.5 mt-1 flex items-baseline justify-between">
                  <span>Low-balance alerts ({alerts?.length ?? 0})</span>
                  <span className="text-[10px]">
                    $0 depletion is auto-provisioned; warning tiers configurable
                  </span>
                </div>
                {!alerts || alerts.length === 0 ? (
                  <div className="text-muted-foreground text-xs">
                    No alerts yet — re-run "Provision Metronome" to attach the
                    $0 depletion alert.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-2 font-normal">name</th>
                        <th className="py-1 pr-2 font-normal text-right">
                          threshold
                        </th>
                        <th className="py-1 pr-2 font-normal">status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((a) => (
                        <tr key={a.id} className="border-t border-border/50">
                          <td className="py-1.5 pr-2">
                            {a.name}
                            {a.thresholdCents === 0 && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                (depletion)
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right">
                            {fmtCents(a.thresholdCents)}
                          </td>
                          <td className="py-1.5 pr-2">
                            {a.status === "in_alarm" ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-600/15 text-red-700 dark:text-red-300">
                                ⚠ TRIGGERED
                              </span>
                            ) : a.status === "ok" ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                                ok
                              </span>
                            ) : a.status === "evaluating" ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-600/15 text-amber-700 dark:text-amber-300">
                                evaluating
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">
                                —
                              </span>
                            )}
                            {a.triggeredBy && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {a.triggeredBy}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Commits */}
              <div>
                <div className="text-xs text-muted-foreground mb-1.5 mt-1">
                  Live commits ({balance?.commits.length ?? 0})
                  {balance && (
                    <span className="ml-2">
                      total {fmtCents(balance.totalCents)}
                    </span>
                  )}
                </div>
                {balance && balance.commits.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-2 font-normal">name</th>
                        <th className="py-1 pr-2 font-normal">priority</th>
                        <th className="py-1 pr-2 font-normal">time</th>
                        <th className="py-1 pr-2 font-normal text-right">
                          initial
                        </th>
                        <th className="py-1 pr-2 font-normal text-right">
                          remaining
                        </th>
                        <th className="py-1 pl-2 font-normal text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {balance.commits.map(
                        (c: BalanceData["commits"][number]) => (
                          <tr
                            key={c.id}
                            className="border-t border-border/50 align-top"
                          >
                            <td className="py-1.5 pr-2">
                              {c.name ?? c.id.slice(0, 8) + "…"}
                            </td>
                            <td className="py-1.5 pr-2 text-muted-foreground">
                              {PRIORITY_LABEL(c.priority)}
                            </td>
                            <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">
                              <div title={c.startingAt ?? undefined}>
                                start: {fmtRel(c.startingAt)}
                              </div>
                              <div
                                className="text-[10px] opacity-70"
                                title={c.endingBefore ?? undefined}
                              >
                                {isIndefinite(c.endingBefore)
                                  ? "no end"
                                  : `end: ${fmtRel(c.endingBefore)}`}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2 text-right">
                              {fmtCents(c.initial)}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-bold">
                              {fmtCents(c.balance)}
                            </td>
                            <td className="py-1.5 pl-2 text-right">
                              <Btn
                                variant="danger"
                                busy={busy !== null}
                                loading={busy === `revoke-${c.id}`}
                                disabled={
                                  orgIdNum === null || (c.balance ?? 0) === 0
                                }
                                label="Refund unused"
                                onClick={() =>
                                  run(`revoke-${c.id}`, () =>
                                    actionRevokeUnused(orgIdNum!, c.id)
                                  )
                                }
                              />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-muted-foreground text-xs">
                    No commits yet. Add one in section 3.
                  </div>
                )}
              </div>
            </Section>

            {/* 3. Add credit ------------------------------------------ */}
            <Section
              step={3}
              title="Add credit"
              description="Pre-charged credit only — Stripe top-up or complimentary grant."
            >
              <div className="grid grid-cols-1 gap-3">
                {/* Stripe top-up */}
                <div className="space-y-2 border border-border rounded p-3">
                  <div className="text-xs font-semibold">Top-up</div>
                  <div className="text-xs text-muted-foreground">
                    Real Stripe charge. $5–$1000. Drains last (TOPUP, prio 90).
                  </div>
                  <DollarInput
                    value={topUpAmount}
                    onChange={setTopUpAmount}
                    placeholder="25"
                  />
                  <Btn
                    variant="primary"
                    busy={busy !== null}
                    loading={busy === "topup"}
                    disabled={orgIdNum === null || !stripeLinked}
                    label="Charge Stripe"
                    onClick={() => {
                      const c = dollarsToCents(topUpAmount);
                      if (c === null) return;
                      run("topup", () =>
                        actionAddStripeChargedCommit(orgIdNum!, c)
                      );
                    }}
                  />
                  {!stripeLinked && (
                    <div className="text-xs text-muted-foreground">
                      Org needs a Stripe customer first.
                    </div>
                  )}
                </div>

                {/* Complimentary */}
                <div className="space-y-2 border border-border rounded p-3">
                  <div className="text-xs font-semibold">Complimentary</div>
                  <div className="text-xs text-muted-foreground">
                    No Stripe charge. For dev / promo / refund / manual. PROMO
                    priority (50).
                  </div>
                  <DollarInput
                    value={compAmount}
                    onChange={setCompAmount}
                    placeholder="5"
                  />
                  <Btn
                    busy={busy !== null}
                    loading={busy === "compCommit"}
                    disabled={orgIdNum === null}
                    label="Add complimentary"
                    onClick={() => {
                      const c = dollarsToCents(compAmount);
                      if (c === null) return;
                      run("compCommit", () =>
                        actionAddComplimentaryCommit(orgIdNum!, c)
                      );
                    }}
                  />
                </div>
              </div>
            </Section>

            {/* 4. Auto-reload ----------------------------------------- */}
            <Section
              step={4}
              title="Auto-reload"
              description="When balance drops below threshold, the billing backbone auto-charges the card."
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">
                    threshold
                  </span>
                  <DollarInput
                    value={reloadThreshold}
                    onChange={setReloadThreshold}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">
                    recharge to
                  </span>
                  <DollarInput
                    value={reloadAmount}
                    onChange={setReloadAmount}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Btn
                  variant="primary"
                  busy={busy !== null}
                  loading={busy === "setAutoReload"}
                  disabled={orgIdNum === null || !stripeLinked}
                  label="Enable"
                  onClick={() => {
                    const t = dollarsToCents(reloadThreshold);
                    const a = dollarsToCents(reloadAmount);
                    if (t === null || a === null) return;
                    run("setAutoReload", () =>
                      actionSetAutoReload(orgIdNum!, t, a)
                    );
                  }}
                />
                <Btn
                  variant="ghost"
                  busy={busy !== null}
                  loading={busy === "disableAutoReload"}
                  disabled={orgIdNum === null || !autoReloadOn}
                  label="Disable"
                  onClick={() =>
                    run("disableAutoReload", () =>
                      actionDisableAutoReload(orgIdNum!)
                    )
                  }
                />
                {autoReloadOn && (
                  <span className="text-xs text-muted-foreground self-center">
                    live: {fmtCents(live!.autoReload!.thresholdCents)} →{" "}
                    {fmtCents(live!.autoReload!.rechargeToCents)}
                  </span>
                )}
              </div>
            </Section>
          </div>
          {/* ====== RIGHT: Usage ===================================== */}
          <div className="space-y-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
              Usage — consume credits
            </div>

            {/* 5. Simulate usage -------------------------------------- */}
            <Section
              step={5}
              title="Simulate usage"
              description="The AI seam will call ingest on every successful provider call. This button does that manually."
            >
              <div className="flex gap-2 items-end">
                <label className="block flex-1 max-w-[16rem]">
                  <span className="block text-xs text-muted-foreground mb-1">
                    cost (USD)
                  </span>
                  <DollarInput
                    value={ingestDollars}
                    onChange={setIngestDollars}
                  />
                </label>
                <Btn
                  variant="primary"
                  busy={busy !== null}
                  loading={busy === "ingestGated"}
                  disabled={orgIdNum === null}
                  label="Gated (seam path)"
                  onClick={() => {
                    const cents = dollarsToCents(ingestDollars);
                    if (cents === null) return;
                    const mills = cents * 10;
                    run("ingestGated", () =>
                      actionIngestGated(orgIdNum!, mills)
                    );
                  }}
                />
                <Btn
                  variant="ghost"
                  busy={busy !== null}
                  loading={busy === "ingest"}
                  disabled={orgIdNum === null}
                  label="Raw (no gate)"
                  onClick={() => {
                    const cents = dollarsToCents(ingestDollars);
                    if (cents === null) return;
                    const mills = cents * 10;
                    run("ingest", () => actionIngest(orgIdNum!, mills));
                  }}
                />
                <span className="text-xs text-muted-foreground self-end pb-1">
                  {((dollarsToCents(ingestDollars) ?? 0) * 10).toLocaleString()}{" "}
                  mills
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <strong>Gated</strong> matches the seam: checks the entitlement
                cache, throws 402 if blocked. <strong>Raw</strong> bypasses the
                gate (use to demonstrate past-zero ingest creating PAYG
                charges).
              </div>
            </Section>

            {/* 6. Webhook log ---------------------------------------- */}
            <Section
              step={6}
              title="Recent webhook events"
              description="Inbound webhooks → projector → DB. Auto-refreshes every 5s."
            >
              {events.length === 0 ? (
                <div className="text-muted-foreground text-xs">
                  No events for this org yet. Triggers: top-up, auto-reload,
                  balance-zero alert, commit lifecycle.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-2 font-normal">received</th>
                      <th className="py-1 pr-2 font-normal">event</th>
                      <th className="py-1 pr-2 font-normal">status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr
                        key={e.event_id}
                        className="border-t border-border/50 align-top"
                      >
                        <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">
                          {fmtAge(e.received_at)}
                        </td>
                        <td className="py-1.5 pr-2">
                          <div className="font-mono">{e.event_type}</div>
                          {e.payment_status && (
                            <div className="text-muted-foreground text-[10px]">
                              payment: {e.payment_status}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          {e.processed_at ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              processed
                            </span>
                          ) : e.failure_reason ? (
                            <span className="text-red-600 dark:text-red-400">
                              failed: {e.failure_reason}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
          {/* end RIGHT column */}
        </div>
        {/* end two-column body */}

        {/* User-facing preview ---------------------------------------- */}
        <section className="border border-border rounded-lg p-5 space-y-3">
          <div className="space-y-0.5">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">
                ★
              </span>
              User-facing preview
            </h2>
            <p className="text-xs text-muted-foreground">
              How the customer sees their billing. Same data as above but in
              their vocabulary — no "commit", no "contract", no Metronome ids.
            </p>
          </div>

          {/* Balance headline (user-facing) */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="text-2xl font-bold mt-0.5">
              {fmtCents(liveBalanceCents)}
            </div>
            {autoReloadOn && (
              <div className="text-xs text-muted-foreground mt-1">
                Auto-recharges to{" "}
                <strong>{fmtCents(live!.autoReload!.rechargeToCents)}</strong>{" "}
                when below{" "}
                <strong>{fmtCents(live!.autoReload!.thresholdCents)}</strong>.
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-5 items-start">
            {/* Recent activity (transactions) */}
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Recent activity
              </div>
              {!transactions || transactions.length === 0 ? (
                <div className="text-muted-foreground text-xs">
                  No activity yet.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-2 font-normal">type</th>
                      <th className="py-1 pr-2 font-normal">date</th>
                      <th className="py-1 pr-2 font-normal text-right">
                        amount
                      </th>
                      <th className="py-1 pr-2 font-normal text-right">
                        remaining
                      </th>
                      <th className="py-1 pr-2 font-normal">status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 12).map((t) => (
                      <tr
                        key={t.sourceId}
                        className="border-t border-border/50 align-top"
                      >
                        <td className="py-1.5 pr-2">
                          <span
                            className={
                              "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium " +
                              (TXN_BADGE_CLASS[t.kind] ??
                                TXN_BADGE_CLASS.unknown)
                            }
                          >
                            {TXN_LABEL[t.kind] ?? "Credit"}
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {t.description}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">
                          {fmtRel(t.at)}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold">
                          +{fmtCents(t.amountCents)}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {fmtCents(t.remainingCents)}
                        </td>
                        <td className="py-1.5 pr-2">
                          {t.paid ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              paid
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {transactions && transactions.length > 12 && (
                <div className="text-[10px] text-muted-foreground">
                  +{transactions.length - 12} older entries
                </div>
              )}
            </div>

            {/* Invoices */}
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Invoices
              </div>
              {!invoices || invoices.length === 0 ? (
                <div className="text-muted-foreground text-xs">
                  No invoices yet.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-2 font-normal">issued</th>
                      <th className="py-1 pr-2 font-normal">type</th>
                      <th className="py-1 pr-2 font-normal text-right">
                        total
                      </th>
                      <th className="py-1 pr-2 font-normal">status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 12).map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-t border-border/50 align-top"
                      >
                        <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">
                          {fmtRel(inv.issuedAt)}
                        </td>
                        <td className="py-1.5 pr-2">
                          <div
                            className="text-[10px]"
                            title={`Metronome type: ${inv.type}`}
                          >
                            {fmtInvoiceType(inv.type)}
                          </div>
                          {inv.lineItems[0] && (
                            <div className="text-[10px] text-muted-foreground">
                              {inv.lineItems[0].name}
                              {inv.lineItems.length > 1 &&
                                ` +${inv.lineItems.length - 1}`}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-bold">
                          {fmtCents(inv.totalCents)}
                        </td>
                        <td className="py-1.5 pr-2">
                          <div
                            className={
                              inv.status === "FINALIZED" ||
                              inv.external?.status === "PAID"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : inv.status === "VOID" ||
                                    inv.external?.status === "VOID"
                                  ? "text-muted-foreground"
                                  : "text-amber-600 dark:text-amber-400"
                            }
                          >
                            {inv.external?.status ?? inv.status}
                          </div>
                          <div className="text-[10px] text-muted-foreground space-x-1 mt-0.5">
                            <button
                              type="button"
                              className="underline disabled:opacity-50"
                              disabled={
                                orgIdNum === null || busy === `pdf-${inv.id}`
                              }
                              onClick={async () => {
                                if (orgIdNum === null) return;
                                setBusy(`pdf-${inv.id}`);
                                try {
                                  const r = await actionGetInvoicePdf(
                                    orgIdNum,
                                    inv.id
                                  );
                                  if (r.ok) {
                                    downloadBase64Pdf(
                                      r.data.filename,
                                      r.data.dataB64
                                    );
                                  } else {
                                    setLastResult({
                                      action: `pdf-${inv.id}`,
                                      ok: false,
                                      error: r.error,
                                    });
                                  }
                                } finally {
                                  setBusy(null);
                                }
                              }}
                              title="Metronome-rendered invoice PDF"
                            >
                              {busy === `pdf-${inv.id}`
                                ? "Loading…"
                                : "Invoice PDF"}
                            </button>
                          </div>
                          {inv.external && (
                            <div className="text-[10px] text-muted-foreground space-x-1">
                              <span>via {inv.external.provider}</span>
                              {inv.external.receiptUrl && (
                                <>
                                  <span>·</span>
                                  <a
                                    href={inv.external.receiptUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                    title="Public Stripe receipt (downloadable)"
                                  >
                                    Receipt
                                  </a>
                                </>
                              )}
                              {inv.external.pdfUrl && (
                                <>
                                  <span>·</span>
                                  <a
                                    href={inv.external.pdfUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                  >
                                    PDF
                                  </a>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {invoices && invoices.length > 12 && (
                <div className="text-[10px] text-muted-foreground">
                  +{invoices.length - 12} older invoices
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Advanced --------------------------------------------------- */}
        <Section
          title="Advanced"
          description="Less-frequent ops + raw debug output."
        >
          <div className="flex gap-2 flex-wrap">
            <Btn
              variant="ghost"
              label={showRaw ? "Hide raw response" : "Show raw response"}
              onClick={() => setShowRaw((v) => !v)}
            />
          </div>
          {showRaw && (
            <pre className="bg-muted rounded p-3 overflow-x-auto text-[10px] whitespace-pre-wrap">
              {lastResult ? JSON.stringify(lastResult, null, 2) : "(none)"}
            </pre>
          )}
        </Section>
      </div>
    </div>
  );
}
