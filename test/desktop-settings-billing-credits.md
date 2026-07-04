---
id: TC-DESKTOP-SETTINGS-001
title: Settings shows a thin AI-credits card; billing management delegates to the web
module: desktop
area: settings
tags: [billing, credits, account, open-external, degraded-mode]
status: untested
severity: medium
date: 2026-07-03
updated: 2026-07-03
automatable: false
covered_by:
  - editor/app/desktop/billing/summary/route.test.ts
  - editor/lib/desktop/billing.test.ts
---

## Behavior

Desktop Settings has a **Credits** card (between Account and AI Provider
Keys) showing the AI credit balance for the user's **session
organization** — the same org the AI billing path resolves (last-accessed
project's org, else first membership) — as org name + plan badge +
`$X.XX` balance. The card is **read-only**: the single control, **Manage
billing**, opens the org's web billing page
(`/organizations/{slug}/settings/billing`) in the **OS browser** — the
webview itself never navigates (the iOS "manage your account on the web"
pattern). Top-up, auto-reload, and plan changes all live on that web page.

An org that has never been provisioned for AI credits shows **"—"**,
never "$0.00" — zero is a real balance; "—" means "not set up yet". When
the balance is below the AI floor (or depleted), a muted hint explains
that AI runs are paused and points at the billing page. The card degrades
gracefully: signed-out and no-organization are quiet one-liners, and when
the billing backend (Metronome) is slow or unreachable the card falls
back to the cached balance rather than erroring — the number shown is
then at most as stale as the hourly reconcile.

The card fetches on mount only (no polling): after topping up in the
browser, the desktop number updates on the next visit to Settings.

## Steps

1. Local stack: Supabase + editor dev on :3000. Sign in on the **web**,
   grant the org a complimentary credit (e.g. $5) from `/insiders/billing`
   (dev-only). In the **desktop app**, sign in and open Settings.
2. Expected: Credits card renders a skeleton, then the org's display
   name, plan badge (Free/Pro/Team), and the granted balance as `$5.00`.
3. Click **Manage billing**.
4. Expected: the OS browser opens `/organizations/{slug}/settings/billing`
   for that org; the desktop window stays on Settings (no webview
   navigation).
5. With an org that was never provisioned for AI credits, open Settings.
6. Expected: balance renders **"—"** (not "$0.00") with the "not set up
   yet" hint; Manage billing still works.
7. Sign out (Account card) and revisit Settings.
8. Expected: Credits card shows "Sign in to see your AI credits." — no
   error state.
9. Remove `METRONOME_API_TOKEN` from `editor/.env.local` (restart dev
   server) and open Settings while signed in.
10. Expected: the card still renders the cached balance (no error); the
    page does not hang — the live sync gives up within ~2s.

## Notes

- Read path: `CreditsSection` → same-origin `GET /desktop/billing/summary`
  (desktop CSP keeps `connect-src` at `'self'`) → server-only seam
  `editor/lib/desktop/billing.ts` → `lib/billing/metronome.ts`
  (`getEntitlement` + bounded best-effort `refreshBalance`; never
  provisions).
- The manage URL is built from the org **slug** (`name`), not
  `display_name`.
- Part of the desktop no-BYOK track (Part 2a). Part 2b (hosted "grida"
  provider in the sidecar) will make this balance drain from desktop
  agent runs.
