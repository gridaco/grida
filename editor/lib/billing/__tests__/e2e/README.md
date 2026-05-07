# Billing E2E suite

Three integration tests that hit real Stripe (test mode) and the real
webhook receiver. They cover what pgTAP can't: the HTTP path, signature
verification, and tolerance for actual Stripe object shapes.

The full surface — projector branches, seat-sync triggers, RLS, org-delete
guard, dispute branches — is covered at the DB layer in
[`supabase/tests/test_grida_billing_test.sql`](../../../../../supabase/tests/test_grida_billing_test.sql).

## What's covered

- **`scenarios/lifecycle.test.ts`** — customer.created → subscription.created
  → subscription.deleted, all signed and routed through the live receiver.
- **`scenarios/idempotency.test.ts`** — same event id replayed 3× yields
  handled + replayed + replayed.
- **`scenarios/tampered-signature.test.ts`** — bad signature → 400, no
  projection.

## Setup (one-time, per developer)

The suite picks up env from `editor/.env.test` (committed defaults) and
`editor/.env.test.local` (your secrets — gitignored). No shell ceremony.

```bash
# 1. Local Supabase
supabase start && supabase db reset

# 2. Drop your Supabase + Stripe credentials into editor/.env.test.local
#    (see editor/.env.test for the exact keys it expects)
supabase status -o env | grep SUPABASE_SECRET_KEY >> editor/.env.test.local
echo 'STRIPE_SECRET_KEY=sk_test_...'    >> editor/.env.test.local
echo 'STRIPE_WEBHOOK_SECRET=whsec_...'  >> editor/.env.test.local

# 3. Provision Stripe test-mode products + portal config (idempotent)
pnpm tsx editor/scripts/billing/setup-stripe-test.ts

# 4. Run the dev server
pnpm dev --filter=editor
```

We don't share Stripe credentials. Contributors create their own free
Stripe test account (no payment info required) and use those keys here.
The setup script is idempotent against any test account.

## Run

```bash
pnpm --filter editor vitest run lib/billing/__tests__/e2e
```

The suite refuses to start unless every channel is demonstrably test mode:
`BILLING_E2E=1`, `NODE_ENV != production`, `STRIPE_SECRET_KEY` starts with
`sk_test_`, the Supabase URL host is `localhost`/`127.0.0.1`, and `APP_URL`
is also local.

Each test creates its own ephemeral org owned by the seed user
`insider@grida.co`; teardown deletes the Stripe customer (cascades subs)
and the local org row (CASCADE wipes `grida_billing.*`).

## Why these three

The valuable coverage E2E adds over pgTAP:

1. **HTTP receiver path** — signature verification, body parsing,
   projector dispatch. pgTAP calls `fn_apply_stripe_event` directly;
   only E2E exercises the route handler.
2. **Real Stripe object shapes** — pgTAP feeds hand-built jsonb. If
   Stripe changes a field shape, only E2E catches it.
3. **Idempotency through the live HTTP path** — pgTAP tests the PK
   dedupe at the SQL layer; E2E proves the HTTP+TS dispatch layer
   honors it too.

Lifecycle transitions, dispute branches, seat counts — the projector
logic — stay in pgTAP territory.
