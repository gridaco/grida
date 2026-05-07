# Contributing to Grida | Billing

Setup guide for contributors working on the billing surface. Once Stripe and Supabase are wired locally, the rest of the codebase works the same against any test account.

> **We don't share Stripe credentials.** Every contributor uses their own free Stripe test account.

---

## What you need

- Local Supabase running (`supabase start`).
- A free Stripe account in **test mode** (no payment info required at signup).
- The Stripe CLI: `brew install stripe/stripe-cli/stripe` or [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli).
- Node 24 + pnpm (covered by the repo-wide setup).

---

## Setup

### 1. Stripe test account

Sign up at [dashboard.stripe.com](https://dashboard.stripe.com), switch to **Test mode**, and copy your **Secret key** (starts with `sk_test_…`) from **Developers → API keys**.

> Don't use a live key. The test fixtures refuse to start unless `STRIPE_SECRET_KEY` begins with `sk_test_`.

### 2. Local Supabase

```bash
supabase start
supabase db reset
```

### 3. Secrets in `.env.test.local`

Committed defaults live in `editor/.env.test`. Secrets go in `editor/.env.test.local` (gitignored):

```bash
supabase status -o env | grep SUPABASE_SECRET_KEY >> editor/.env.test.local
echo 'STRIPE_SECRET_KEY=sk_test_...' >> editor/.env.test.local
# STRIPE_WEBHOOK_SECRET=whsec_...   ← add after step 5
```

### 4. Provision Stripe products + portal config

```bash
pnpm tsx editor/scripts/billing/setup-stripe-test.ts
```

Idempotent. Creates products/prices in your sandbox and writes the resulting Stripe IDs into the catalog. Re-run after every `supabase db reset`.

### 5. Forward webhooks

In a dedicated terminal, kept open during development:

```bash
stripe listen --forward-to localhost:3000/private/webhooks/stripe
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` in `.env.test.local`. The signing secret is per-`stripe listen` session — restart resets it.

### 6. Run + try the flow

```bash
pnpm dev --filter=editor
```

Sign in as `insider@grida.co` / `password`. Go to org settings → Billing → Upgrade. Use the test card `4242 4242 4242 4242`, any future expiry, any CVC. Watch the `stripe listen` terminal: events flow in, the local DB mirrors, the sidebar plan badge updates within a couple seconds.

---

## E2E suite

Three integration tests against your real Stripe sandbox. Refuses to start unless every channel is demonstrably test-mode.

```bash
pnpm --filter editor vitest run lib/billing/__tests__/e2e
```

See the suite's own README for the contract.

---

## Stable surface

A few names that don't change and are useful to know:

- **DB schema**: `grida_billing.*` (locked down, internal). Public read access through views like `v_billing_subscription` and RPCs prefixed `fn_billing_*`.
- **Projector**: `public.fn_billing_apply_stripe_event` is the only place subscription state mutates from a webhook. All projection logic is PL/pgSQL.
- **Webhook path**: `/private/webhooks/stripe` — what Stripe POSTs to, verified by signature.

Anything else (file layout under `editor/`, server action names, type names) is a moving target — read the code.

User-facing billing docs: [`docs/platform/billing.mdx`](../platform/billing.mdx). Behaviour test cases live at `test/billing-*.md` in the repo root.

---

## Troubleshooting

- **`STRIPE_SECRET_KEY is required`** — `.env.test.local` not loaded. Confirm path and contents.
- **`plan.pro price not wired`** — you haven't run the setup script since your last `supabase db reset`.
- **Webhook signature verification failing** — your `stripe listen` was restarted and produced a new `whsec_…`. Update `STRIPE_WEBHOOK_SECRET`.
- **Sidebar plan stale** — the local mirror updates only when the webhook lands. Check that `stripe listen` is running.
- **Customer Portal flows error with "no Stripe customer"** — the org hasn't upgraded yet. Stripe customers are lazy-created on first paid checkout.

---

## Required env reference

| Variable                                      | Where                          |
| --------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                    | `editor/.env.test` (committed) |
| `SUPABASE_SECRET_KEY`                         | `editor/.env.test.local`       |
| `STRIPE_SECRET_KEY`                           | `editor/.env.test.local`       |
| `STRIPE_WEBHOOK_SECRET`                       | `editor/.env.test.local`       |
| `BILLING_E2E`, `BILLING_TEST_MODE`, `APP_URL` | `editor/.env.test` (committed) |
