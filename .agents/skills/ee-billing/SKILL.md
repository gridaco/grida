---
name: ee-billing
description: >
  Surface workflow for billing in Grida — Stripe (subscriptions) +
  Metronome (AI credit ledger). The stable contracts: `grida_billing.*`
  is not REST-exposed (views/RPCs only), `fn_billing_apply_*` are the
  single mutation points, webhook receivers are `GRIDA-SEC-001`, BYOK
  is the `GRIDA-SEC-003` carve-out. Use when touching
  `editor/lib/billing/`, `editor/scripts/billing/`, the
  `grida_billing` schema, the webhook receivers, or the entitlement
  gate. Companion to `ee`.
---

# ee-billing

This is the surface skill for billing — the workflow once the
[`ee`](../ee/SKILL.md) anchor has placed billing on the EE side and
the contributor setup is done. Setup itself is documented; cite it,
don't restate it:

- [docs/contributing/billing](https://grida.co/docs/contributing/billing) —
  local Stripe + Metronome sandbox, cloudflared tunnel, env vars,
  troubleshooting.
- [docs/wg/platform/billing/](https://grida.co/docs/wg/platform/billing/) —
  design notes: AI credits master plan, Metronome integration,
  known issues.
- [docs/platform/billing](https://grida.co/docs/platform/billing) —
  user-facing copy.

## Stable surface (the contract)

These shapes are _locked_. A change that breaks any of them must be
intentional and called out in the PR description.

- **`grida_billing.*` schema** — not REST-exposed. Public reads go
  through `v_billing_*` views; writes only through `fn_billing_*`
  RPCs. Don't add a new direct-access surface; add a view or an
  RPC. Schema discipline lives in
  [`database`](../database/SKILL.md) / `supabase/AGENTS.md`.
- **`public.fn_billing_apply_stripe_event`** — the _only_ place
  Stripe-driven subscription state mutates. Mutating from a new
  direction (UI form, ad-hoc RPC, hand-written migration) corrupts
  the projector model.
- **`public.fn_billing_apply_metronome_event`** — same role for
  Metronome credit / alert / `payment_gate` events.
- **Webhook receivers** — `/webhooks/stripe` and
  `/webhooks/metronome` are the only billing ingress; both are
  signature-verified per `GRIDA-SEC-001`.
- **`editor/lib/billing/metronome.ts`** — the service module
  surface: `provisionOrg`, `addStripeChargedCommit`, `setAutoReload`,
  `getEntitlement`, `ingestUsageEvent`. New billing actions go
  _through_ this module, not adjacent to it.

## Substrates

Two external clouds; both use per-contributor sandbox accounts.
**Credentials are never shared.** Live keys are refused at boot.

- **Stripe** — subscriptions + payment processing. Provision via
  `pnpm tsx editor/scripts/billing/cli.ts setup:stripe`. Idempotent;
  re-run after every `supabase db reset` (writes price IDs into the
  catalog).
- **Metronome** — AI credit ledger. Provision via
  `pnpm tsx editor/scripts/billing/cli.ts setup:metronome`. Same
  idempotency / re-run rule.

`editor/scripts/billing/cli.ts` is the single entry point for every
billing script; run without arguments for the full subcommand list.
See `editor/scripts/billing/README.md`.

## The seam: how OSS reads entitlement

OSS code that needs to gate on a paid plan, AI credit balance, or
org entitlement does not import billing internals. The seam is
`getEntitlement` (from `editor/lib/billing/metronome.ts`) and its
typed wrappers. New gates go through this function so fail-closed
and BYOK behavior stay centralized.

## BYOK carve-out — `GRIDA-SEC-003`

If `BYOK_OPENROUTER_API_KEY` or `BYOK_AI_GATEWAY_API_KEY` is set in
`editor/.env.local`, the AI-SDK text path routes through the
contributor's provider and bypasses billing.

- **Auth is never bypassed.** A resolvable org is still required.
- **Text/chat only.** Image and audio still go through Replicate
  and still bill, even under BYOK.
- **Never set `BYOK_*` on a hosted or preview deploy.** It disables
  billing _and_ the org-id sanity gate for every org. See
  `SECURITY.md` (`GRIDA-SEC-003`).

## Working on billing

1. Read [docs/contributing/billing](https://grida.co/docs/contributing/billing)
   for setup before the first change. Don't skip cloudflared if you
   need Metronome — webhook delivery requires public HTTPS.
2. Tag every billing file with `GRIDA-EE: billing` per the
   [`ee`](../ee/SKILL.md) skill.
3. Webhook receivers also carry `GRIDA-SEC-001` — the
   [`security`](../security/SKILL.md) review runs first.
4. Don't mutate `grida_billing.*` outside `fn_billing_apply_*` or the
   migration that creates it.
5. Run the E2E suite before opening the PR (refuses to start unless
   every channel is demonstrably test-mode):
   `pnpm --filter editor vitest run lib/billing/__tests__/e2e`.
6. For schema changes, the [`database`](../database/SKILL.md) skill
   governs — `grida_billing` is a regular `grida_*` schema under
   that discipline.

## Known issues

[docs/wg/platform/billing/known-issues](https://grida.co/docs/wg/platform/billing/known-issues)
is the living register (`KI-BILL-NNN`). Add to it when you mitigate
or accept an issue; don't quietly bake the mitigation into a PR
without registering it.

See also: [`ee`](../ee/SKILL.md) (the EE anchor),
[`security`](../security/SKILL.md) (`GRIDA-SEC-001`,
`GRIDA-SEC-003`), [`database`](../database/SKILL.md) (schema
discipline for `grida_billing`).
