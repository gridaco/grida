# Billing CLI

Single-entry CLI for billing setup, smoke tests, and ops helpers.

> Setup guide (env, tunnel, accounts) lives in
> [`docs/contributing/billing.md`](../../../docs/contributing/billing.md).
> Design notes: [`docs/wg/platform/billing/ai-credits.md`](../../../docs/wg/platform/billing/ai-credits.md).

## Explicit by design

This CLI is for **one-off, human-driven runs** against real external services
(Stripe, Metronome, Supabase). It is **not** meant for CI. Three guards:

1. **`--env=<spec>` is required.** No `.env.*` is auto-discovered from cwd.
2. After loading env, the CLI prints the loaded vars (redacted) and the
   action that's about to run, then waits for the user to type the command
   name verbatim. Ctrl-C aborts.
3. If `STRIPE_SECRET_KEY=sk_live_…` is detected in the loaded env, the
   confirmation prompt requires typing **`PROD`** instead of the command
   name. Stripe-touching commands additionally refuse to run with a live
   key (`requireStripeTestKey()` in `_env.ts`).

## Usage

```sh
# dev / sandbox runs — load editor/.env.test.local etc.
pnpm tsx editor/scripts/billing/cli.ts <command> --env=dev

# prod runs — point at an explicit file outside the repo
pnpm tsx editor/scripts/billing/cli.ts <command> --env=/abs/path/to/prod.env
```

Run with no command (or `--help`) for the index.

## Recommended prod file layout

Keep prod env files **outside the repo**, never in `editor/.env*`:

```sh
# example: ~/.grida-billing/prod.env  (chmod 600)
METRONOME_API_TOKEN=...
METRONOME_WEBHOOK_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
# Do NOT put STRIPE_SECRET_KEY here — no command in this CLI is allowed
# to touch live Stripe (requireStripeTestKey refuses sk_live_).
```

```sh
pnpm tsx editor/scripts/billing/cli.ts ping --env=~/.grida-billing/prod.env
# → prints redacted env, prompts for confirmation, runs read-only
```

## Commands

| Command             | When to run it                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `setup:stripe`      | Dev / sandbox only. Provisions Stripe test products, prices, Customer Portal config.     |
| `setup:metronome`   | Initial provision per Metronome tenant. Provisions billable metric, products, rate card. |
| `ping`              | Confirm `METRONOME_API_TOKEN` is good and pointing at the expected workspace.            |
| `smoke:topup`       | Demonstrate end-to-end prepaid-credit flow against a sandbox customer. No Stripe charge. |
| `smoke:auto-reload` | Demonstrate Metronome's threshold-recharge: drain below threshold → silent recharge.     |
| `smoke:webhook`     | 3-layer probe (localhost → tunnel → DB). Pinpoints which link is broken.                 |
| `backfill`          | Provision Metronome customer + contract for every existing org. Idempotent.              |
| `markup-sim`        | Audit the AI-credit markup formula across all Stripe card types.                         |

`backfill` honors `ORG_FILTER=<id>` (one org) and `DRY_RUN=true` (report
only). Pass these as ordinary env vars (they show up in the confirmation
summary).

## File map

```
cli.ts        # entry point + flag parsing + confirmation prompt
_env.ts       # explicit env loader (no side-effect import)
setup.ts      # setupStripe(), setupMetronome()
smoke.ts      # ping(), topup(), autoReload(), webhook()
ops.ts        # backfill(), markupSim()
```

Each module is independently importable in case you want to script a flow
from elsewhere — call `setup.setupMetronome()` directly. If you do, you're
on your own for env loading and you bypass the confirmation prompt.

## Cleaning up sandbox state

Sandbox resources accumulate across runs. Re-running `setup:*` reuses
existing resources by name; that's fine. To wipe and start over:

- **Customers / contracts** — archive in the Metronome dashboard.
- **Substrate** (metric / products / rate card) — archive in the dashboard;
  next `setup:metronome` recreates them.
- **Stripe products / prices** — archive in the Stripe dashboard;
  next `setup:stripe` recreates them.
