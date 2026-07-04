"use client";

// GRIDA-EE: billing — see ee-billing
/**
 * Thin, read-only AI-credits card for desktop settings.
 *
 * Shows the balance for the user's session organization and delegates every
 * billing CONTROL to the web billing page, opened in the OS browser (the
 * iOS "manage your account on the web" pattern). Reads go through the
 * same-origin `/desktop/billing/summary` route — the desktop CSP blocks
 * everything else, and `@/lib/billing/**` is lint-barred from this tree
 * (GRIDA-SEC-004); only TYPES cross, via `@/lib/desktop/billing`.
 *
 * Behavior spec: test/desktop-settings-billing-credits.md
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Skeleton } from "@app/ui/components/skeleton";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { DesktopBillingSummaryResponse } from "@/lib/desktop/billing";

type ReadySummary = Extract<DesktopBillingSummaryResponse, { state: "ready" }>;

type CreditsState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "no-organization" }
  | { kind: "ready"; summary: ReadySummary }
  | { kind: "error"; message: string };

const PLAN_LABELS: Record<ReadySummary["plan"], string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
};

const BLOCKED_HINTS: Record<
  NonNullable<ReadySummary["credits"]["blocked_reason"]>,
  string
> = {
  not_provisioned:
    "AI credits aren't set up yet — manage billing to get started.",
  below_floor:
    "Balance too low for AI runs — add credit from the billing page.",
  no_balance: "Balance too low for AI runs — add credit from the billing page.",
};

export function CreditsSection() {
  const [state, setState] = useState<CreditsState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/desktop/billing/summary");
      if (!res.ok) throw new Error("summary_failed");
      const summary = (await res.json()) as DesktopBillingSummaryResponse;
      switch (summary.state) {
        case "signed_out":
          setState({ kind: "signed-out" });
          return;
        case "no_organization":
          setState({ kind: "no-organization" });
          return;
        case "ready":
          setState({ kind: "ready", summary });
          return;
      }
    } catch {
      setState({
        kind: "error",
        message: "Couldn't load your credit balance.",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // `load` only touches state after awaits; guard against unmount.
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const openBilling = async (manage_path: string) => {
    try {
      const bridge = getDesktopBridge();
      if (!bridge) throw new Error("bridge_missing");
      // Same-origin path → absolute URL; correct in dev (localhost) and
      // prod (grida.co). The ipc handler refuses non-http(s).
      await bridge.shell.open_external(
        new URL(manage_path, window.location.origin).toString()
      );
    } catch {
      setState({
        kind: "error",
        message: "Couldn't open the billing page in your browser.",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits</CardTitle>
        <CardDescription>
          AI credit balance for your organization. Top-ups and plan changes are
          managed on the web.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "loading" ? (
          <Skeleton className="h-9 w-full" />
        ) : state.kind === "signed-out" ? (
          <span className="text-sm text-muted-foreground">
            Sign in to see your AI credits.
          </span>
        ) : state.kind === "no-organization" ? (
          <span className="text-sm text-muted-foreground">
            No organization yet — set one up on grida.co.
          </span>
        ) : state.kind === "error" ? (
          <button
            type="button"
            role="alert"
            aria-live="polite"
            onClick={() => void load()}
            className="self-start text-left text-sm text-destructive underline-offset-4 hover:underline"
          >
            {state.message} (click to retry)
          </button>
        ) : (
          <CreditsRow
            summary={state.summary}
            onManage={() => void openBilling(state.summary.manage_path)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CreditsRow({
  summary,
  onManage,
}: {
  summary: ReadySummary;
  onManage: () => void;
}) {
  const { organization, plan, credits } = summary;
  const balance =
    credits.balance_cents === null
      ? "—"
      : `$${(credits.balance_cents / 100).toFixed(2)}`;
  const hint = credits.blocked_reason
    ? BLOCKED_HINTS[credits.blocked_reason]
    : null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm">
          {organization.display_name}
          <Badge variant="secondary">{PLAN_LABELS[plan]}</Badge>
        </span>
        <span className="text-2xl font-semibold tabular-nums">{balance}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <Button size="sm" variant="outline" onClick={onManage}>
        Manage billing
      </Button>
    </div>
  );
}
