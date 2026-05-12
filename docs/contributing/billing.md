# Contributing to Grida | Billing

Setup guide for contributors working on the billing surface. Two clouds to wire:

- **Stripe** — subscription + payment processing.
- **Metronome** — AI credit ledger (top-up, auto-reload, usage gate). Charges flow through Stripe under the hood; Metronome owns balance, drain order, and the entitlement decision the AI seam reads.

> Every contributor uses their own free Stripe + Metronome **test/sandbox** accounts. **We don't share credentials.** Live keys are refused at boot.

---

## What you need

- Local Supabase running (`supabase start`).
- A free Stripe **test mode** account.
- The Stripe CLI: `brew install stripe/stripe-cli/stripe`.
- A Metronome **sandbox** account + API token. Sign up at [metronome.com](https://metronome.com).
- `cloudflared` for the Metronome webhook tunnel: `brew install cloudflared`.
- Node 24 + pnpm (covered by repo-wide setup).

---

## Setup

### 1. Local Supabase

```bash
supabase start
supabase db reset
```

### 2. Stripe — test key

Stripe Dashboard → **Test mode** → Developers → API keys. Copy the secret key (`sk_test_…`).

### 3. Metronome — sandbox token

Metronome Dashboard → Connections → API tokens & webhooks → create a sandbox token.

### 4. Secrets in `editor/.env.test.local`

`.env.test` holds committed defaults; `.env.test.local` is gitignored.

```bash
supabase status -o env | grep SUPABASE_SECRET_KEY >> editor/.env.test.local
echo 'STRIPE_SECRET_KEY=sk_test_...'   >> editor/.env.test.local
echo 'METRONOME_API_TOKEN=...'         >> editor/.env.test.local
# STRIPE_WEBHOOK_SECRET / METRONOME_WEBHOOK_SECRET / WEBHOOK_TUNNEL_HOSTNAME — added below
```

### 5. Provision substrates

```bash
pnpm tsx editor/scripts/billing/cli.ts setup:stripe
pnpm tsx editor/scripts/billing/cli.ts setup:metronome
```

Both idempotent. **Re-run after every `supabase db reset`.** Stripe writes price IDs into the catalog; Metronome creates the rate card / products / billable metric.

The CLI is the single entry point for every billing script — run it without arguments to see all subcommands.

### 6. Stripe webhooks (local forwarding)

In a dedicated terminal kept open during development:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Per-`stripe listen` session — restart resets it.

### 7. Metronome webhooks (cloudflared tunnel)

The Stripe CLI can forward to localhost; Metronome can't — it requires a public HTTPS endpoint. Use a Cloudflare named tunnel configured **locally** to forward `/webhooks/*` only. Nothing about the tunnel is git-tracked — the config lives in your `~/.cloudflared/` directory and the hostname is one of yours.

One-time setup (~5 min):

```bash
brew install cloudflared
cloudflared tunnel login                                 # browser → pick a Cloudflare zone you control
cloudflared tunnel create grida-webhooks
cloudflared tunnel route dns grida-webhooks <hostname>   # e.g. metronome-dev.yourdomain.co
```

Create `~/.cloudflared/grida-webhooks.yml` (path filter is the security boundary — see [SECURITY.md](../../SECURITY.md) `GRIDA-SEC-001`):

```yaml
tunnel: grida-webhooks
ingress:
  - hostname: metronome-dev.yourdomain.co
    path: ^/webhooks/.*$
    service: http://localhost:3000
  - service: http_status:404
```

Run it in a dedicated terminal:

```bash
cloudflared tunnel --config ~/.cloudflared/grida-webhooks.yml run
```

Add the hostname to `.env.test.local`:

```
WEBHOOK_TUNNEL_HOSTNAME=metronome-dev.yourdomain.co
```

### 8. Metronome webhook destination

Metronome Dashboard → Webhooks → Add endpoint:

- URL: `https://<WEBHOOK_TUNNEL_HOSTNAME>/webhooks/metronome`
- Copy the generated signing secret → `METRONOME_WEBHOOK_SECRET` in `.env.test.local`.

### 9. Run + try the flow

```bash
pnpm dev --filter=editor
```

Sign in as `insider@grida.co` / `password`. Two flows to try:

- **Subscription**: Org settings → Billing → Upgrade. Test card `4242 4242 4242 4242`, any future expiry / CVC.
- **AI credit**: Same page, "Grida AI Credit" section → Buy Credit. The first top-up bootstraps the Stripe customer if needed.

The insiders QA harness at `/insiders/billing` exercises every primitive (top-up, complimentary commit, auto-reload, alerts, ingest) directly.

---

## E2E suite

Three integration tests against your real Stripe sandbox. Refuses to start unless every channel is demonstrably test-mode.

```bash
pnpm --filter editor vitest run lib/billing/__tests__/e2e
```

See the suite's own README for the contract.

---

## Stable surface

- **DB schema**: `grida_billing.*` — locked, not REST-exposed. Public reads via `v_billing_*` views; writes only via `fn_billing_*` RPCs.
- **Stripe projector**: `public.fn_billing_apply_stripe_event` — only place subscription state mutates.
- **Metronome projector**: `public.fn_billing_apply_metronome_event` — credit / alert / `payment_gate` events.
- **Webhook paths**: `/webhooks/stripe`, `/webhooks/metronome`. Both signature-verified.
- **Service module**: `editor/lib/billing/metronome.ts` — `provisionOrg`, `addStripeChargedCommit`, `setAutoReload`, `getEntitlement`, `ingestUsageEvent`.
- **`grida_billing.account.provisioning_uid`**: per-account UUID composed into Metronome aliases. `supabase db reset` produces fresh aliases — any orphan Metronome customers from previous instances are inert. No manual cleanup needed.

User-facing billing copy: [`docs/platform/billing.mdx`](../platform/billing.mdx). Design notes: [`docs/wg/platform/billing/`](../wg/platform/billing/) (AI credits master plan, Metronome integration, known issues). CLI guide: [`editor/scripts/billing/README.md`](../../editor/scripts/billing/README.md).

---

## Troubleshooting

- **`STRIPE_SECRET_KEY is required`** — `.env.test.local` not loaded.
- **`plan.pro price not wired`** — re-run `cli.ts setup:stripe` after `db reset`.
- **`Metronome substrate missing`** — re-run `cli.ts setup:metronome`.
- **Stripe webhook signature failing** — `stripe listen` was restarted; new `whsec_…`. Update `STRIPE_WEBHOOK_SECRET`.
- **Metronome webhook signature mismatch** — `METRONOME_WEBHOOK_SECRET` differs from the value in Metronome Dashboard. Re-copy.
- **Tunnel returns 404** — `WEBHOOK_TUNNEL_HOSTNAME` doesn't match the routed hostname, or `cloudflared` isn't running. Re-run from `cli.ts smoke:webhook` to pinpoint which layer is broken.
- **Customer Portal "no Stripe customer"** — org hasn't subscribed or topped up yet. Stripe customer is lazy-created on first paid action.
- **AI credit shows "Out of credit" forever after a successful top-up** — Metronome webhook didn't reach the tunnel. Run `cli.ts smoke:webhook` to verify each layer.

---

## Required env reference

| Variable                                      | Where                          |
| --------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                    | `editor/.env.test` (committed) |
| `SUPABASE_SECRET_KEY`                         | `editor/.env.test.local`       |
| `STRIPE_SECRET_KEY`                           | `editor/.env.test.local`       |
| `STRIPE_WEBHOOK_SECRET`                       | `editor/.env.test.local`       |
| `METRONOME_API_TOKEN`                         | `editor/.env.test.local`       |
| `METRONOME_WEBHOOK_SECRET`                    | `editor/.env.test.local`       |
| `WEBHOOK_TUNNEL_HOSTNAME`                     | `editor/.env.test.local`       |
| `BILLING_E2E`, `BILLING_TEST_MODE`, `APP_URL` | `editor/.env.test` (committed) |
