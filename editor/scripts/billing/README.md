# Billing CLI

Single-entry CLI for billing setup, smoke tests, and ops helpers. Runs against
your **sandbox** Stripe + Metronome accounts.

> Setup guide (env, tunnel, accounts) lives in
> [`docs/contributing/billing.md`](../../../docs/contributing/billing.md).
> Design notes: [`docs/wg/platform/billing/ai-credits.md`](../../../docs/wg/platform/billing/ai-credits.md).

## Usage

```sh
pnpm tsx editor/scripts/billing/cli.ts <command>
```

Run with no args for the full command index.

## Commands

| Command             | When to run it                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `setup:stripe`      | After every `supabase db reset`. Provisions products, prices, Customer Portal config.    |
| `setup:metronome`   | After every `supabase db reset`. Provisions billable metric, products, rate card, rate.  |
| `ping`              | Confirm `METRONOME_API_TOKEN` is good and pointing at the expected workspace.            |
| `smoke:topup`       | Demonstrate end-to-end prepaid-credit flow against a sandbox customer. No Stripe charge. |
| `smoke:auto-reload` | Demonstrate Metronome's threshold-recharge: drain below threshold → silent recharge.     |
| `smoke:webhook`     | 3-layer probe (localhost → tunnel → DB). Pinpoints which link is broken.                 |
| `backfill`          | Provision Metronome customer + contract for every existing org. Idempotent.              |
| `markup-sim`        | Audit the AI-credit markup formula across all Stripe card types.                         |

`backfill` honors `ORG_FILTER=<id>` (one org) and `DRY_RUN=true` (report only).

## File map

```
cli.ts        # entry point + dispatch
_env.ts       # env loader (precedence: process.env > .env.test.local > .env.test > .env.local)
setup.ts      # setupStripe(), setupMetronome()
smoke.ts      # ping(), topup(), autoReload(), webhook()
ops.ts        # backfill(), markupSim()
```

Each module is independently importable in case you want to script a flow from
elsewhere — call `setup.setupMetronome()` etc. directly.

## Cleaning up sandbox state

Sandbox resources accumulate across runs. Re-running `setup:*` reuses
existing resources by name; that's fine. To wipe and start over:

- **Customers / contracts** — archive in the Metronome dashboard.
- **Substrate** (metric / products / rate card) — archive in the dashboard;
  next `setup:metronome` recreates them.
- **Stripe products / prices** — archive in the Stripe dashboard;
  next `setup:stripe` recreates them.
