# `(ingest)` — externally-callable, signature-authenticated endpoints

> **`GRIDA-SEC-001`** —
> grep this tag across the repo to find every file that depends on this contract.

This route group exists for **one reason**: to receive HTTP requests from
**external machines** (Stripe, Metronome, future providers) where authority
comes from a **signed payload**, not from a user session.

It is the only category of route in this app that is intentionally exposed
to the public internet via tunneled or direct delivery, with **no cookie
auth, no tenant routing, and no RLS context**.

## The rules

Every file under `editor/app/(ingest)/**/route.ts` MUST:

1. **Verify a provider signature before any business logic.** Read the raw
   request body. Compute / verify the provider's HMAC. Reject mismatches with 400.
2. **Fail closed on missing signing secret in production.** If the env var
   for the secret is unset and `NODE_ENV === "production"`, return 500. Do
   not "trust" unsigned requests.
3. **Dedup on a provider-issued event id.** Replays must be idempotent.
4. **Take no action that could be triggered by an attacker without the
   signing secret.** No reads of user-scoped data based on payload contents
   alone — verify the event's authenticity before treating its payload as
   authoritative input.

## What does NOT belong here

- Anything that reads cookies / browser session.
- Anything that runs business logic before signature verification.
- Anything that "auth"s by IP allowlist alone — IP filtering is at most a
  belt-and-braces layer at the edge (Cloudflare Access). HMAC is the source
  of truth for authenticity.
- Admin debug tools, internal RPC, or anything with a non-machine caller.
  Those go under `(api)/private/**`.

## Why a dedicated route group

The proxy at [editor/proxy.ts](../../proxy.ts) **bypasses** tenant routing
and Supabase session refresh for any path under `/webhooks/*`. The bypass
is what makes these endpoints reachable on arbitrary hosts (including
cloudflared dev tunnels). Without the route group + naming, that bypass
would be a foot-gun: a developer could add an admin endpoint under
`/webhooks/...` and it would inherit "no auth" without realizing.

The route group makes the contract physically visible:

- **File system**: every webhook receiver lives under `(ingest)/`. A grep
  for the GREPME tag returns every file in the trust contract.
- **URL**: paths under `/webhooks/<provider>` are the only externally
  reachable surface, by design.
- **Proxy**: the bypass is keyed off `/webhooks/*`, named exactly to match.

## Adding a new receiver

1. Create `editor/app/(ingest)/webhooks/<provider>/route.ts`.
2. Implement HMAC verification per the provider's documented algorithm.
3. Add the `GRIDA-SEC-001` tag to the file's header
   docblock.
4. Add the env var (`<PROVIDER>_WEBHOOK_SECRET`) to
   [editor/.env.example](../../.env.example).
5. Document the URL + signing secret setup in
   [editor/scripts/billing/README.md](../../scripts/billing/README.md) (or
   wherever the provider's setup lives).
6. Reference the new file in [/SECURITY.md](../../../SECURITY.md) under
   the inventory.

## Inventory

- [`webhooks/stripe/route.ts`](./webhooks/stripe/route.ts) — Stripe webhooks. Verifies `Stripe-Signature` via the SDK.
- [`webhooks/metronome/route.ts`](./webhooks/metronome/route.ts) — Metronome webhooks. HMAC-SHA256 over `Date + "\n" + body`.

For the full security philosophy and threat model, see
[/SECURITY.md](../../../SECURITY.md).
