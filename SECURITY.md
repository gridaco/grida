# Security

Trust-boundary tracking for Grida. Every prevented vulnerability gets a
stable id, the id appears in every file the boundary depends on, and
this document is the central registry.

## Convention: `GRIDA-SEC-<id>`

We use `GRIDA-SEC-001`, `GRIDA-SEC-002`, … as canonical ids for
**security boundaries we have prevented**. The format is deliberately
unlike CVE:

- A **CVE** describes a vulnerability that was discovered, often after
  exposure. The id implies "this was a problem."
- A **GRIDA-SEC** id describes a vulnerability that was structurally
  prevented from existing — and a contract with the codebase that it
  must stay prevented. The id is "this is a thing we keep safe."

Every GRIDA-SEC id has:

- An entry in this file with the threat model and the enforcement
  mechanism.
- A grep tag in every file bound by the contract — comments in source,
  callouts in READMEs, ingress filters in scripts.
- An auto-loaded skill ([.agents/skills/security/SKILL.md](.agents/skills/security/SKILL.md))
  that triggers when an agent encounters the tag.

> **The grep is the index.** `grep -r GRIDA-SEC-001 .` returns every
> file in that contract. `grep -r GRIDA-SEC .` returns every security
> boundary in the repo.

## Philosophy: transparent tracking

Grida is open source. The threat model is public; the URLs an attacker
might find are public; the fact that webhooks exist is public. Security
in this repo is therefore **structural**, not secret. We make every
boundary loud, named, and grep-able so that future work doesn't drift
into opening new attack surface by accident.

A developer touching tagged code can't miss the marker; a code review
of any tagged file naturally surfaces the others; an agent picks up the
[security skill](.agents/skills/security/SKILL.md) the moment it sees
"GRIDA-SEC" anywhere in context.

> If you're adding a new boundary, allocate the next sequential id, add
> an entry below, and tag the relevant files. Don't reuse ids; don't
> renumber.

---

## Active boundaries

### `GRIDA-SEC-001` — Ingest trust boundary

**What it protects.** Webhook receivers — endpoints invoked by external
machines on a publicly-reachable URL — are the only HTTP surface in
this app intentionally exposed to the public internet without
cookie-based authentication. Authority is established via the
provider's signed payload. The boundary is the rule that **everything
reachable on `/webhooks/*` must verify a provider signature before
doing anything else.** This applies to every current provider (Stripe,
Metronome, …) and every future one (Replicate, GitHub, etc.).

**Vulnerable scenario (prevented).** A developer adds an unsigned
endpoint under the same path prefix — or removes the signature check
from an existing receiver — and that path becomes reachable from the
public internet (directly in production, via dev tunnel locally) with
no authentication. An attacker who finds the URL triggers whatever
logic lives there. State-changing endpoints (entitlement flips, record
mutations, tenant-scoped queries) become open APIs.

**Why it's specifically risky here.** Webhook URLs in an open-source
repo eventually leak — into docs, scripts, screenshots, dashboards
that get linked, examples in PRs. Local dev typically uses a tunnel
(cloudflared, ngrok, etc.) to expose the dev server so external
providers can deliver webhooks; a naïvely-configured tunnel forwards
every path on the local server. If the tunnel URL becomes public —
and on an open-source project it does — every route including
`/insiders/*` becomes reachable on whatever box is currently tunneled.
The boundary contains the blast radius even when the URL is treated
as public.

**How the code prevents it.**

1. **Dedicated route group** — `editor/app/(ingest)/`. Every webhook
   receiver lives here. Nothing else does. The route group's
   [README](<editor/app/(ingest)/README.md>) is the authoritative ruleset.
2. **Path-based proxy bypass** — [editor/proxy.ts](editor/proxy.ts)
   short-circuits `/webhooks/*` _before_ tenant routing or session
   refresh runs. This makes the receivers reachable on arbitrary hosts
   (dev tunnels, future direct routes); it also makes the trust
   boundary path-aligned with the file system.
3. **HMAC verification at the receiver** — every receiver verifies a
   provider signature before any business logic. Fails closed (5xx)
   when the signing secret is missing in production.
4. **Replay protection** — receivers dedup on event id and reject
   events older than 5 minutes (where applicable).
5. **Tunnel path filter at the edge** —
   [editor/scripts/billing/tunnel.sh](editor/scripts/billing/tunnel.sh)
   configures cloudflared to forward only `/webhooks/*` and reject
   everything else with 404. Defense-in-depth at the network layer:
   even if app code drifts, the tunnel cannot expose non-webhook paths.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-001 .` to enumerate.
Today:

- [editor/app/(ingest)/README.md](<editor/app/(ingest)/README.md>) — rules.
- [editor/app/(ingest)/webhooks/stripe/route.ts](<editor/app/(ingest)/webhooks/stripe/route.ts>) — Stripe receiver.
- [editor/app/(ingest)/webhooks/metronome/route.ts](<editor/app/(ingest)/webhooks/metronome/route.ts>) — Metronome receiver.
- [editor/proxy.ts](editor/proxy.ts) — path bypass.
- [editor/scripts/billing/tunnel.sh](editor/scripts/billing/tunnel.sh) — tunnel ingress filter.
- [editor/scripts/billing/README.md](editor/scripts/billing/README.md) — dev docs.

**What does NOT belong under `(ingest)/`.** Admin tools, internal RPC,
anything that authenticates via cookie/session/bearer-token — those go
under `(api)/private/**`. Anything user-facing goes under
`(api)/(public)/v1/**`. Mixing categories breaks the trust contract.

---

### `GRIDA-SEC-002` — Insiders dev harness is local-only

**What it protects.** The `(insiders)` route group hosts a developer
harness — pages and server actions used to drive Metronome/Stripe
lifecycle steps manually during development and QA. The actions there
intentionally **omit org-membership / ownership checks** and accept an
attacker-supplied `organizationId` as the first argument. That shape is
fine for a local-only debug surface; it would be a cross-org
compromise vector in any non-local environment. The boundary is the
rule that **`/insiders/*` is reachable if and only if
`NODE_ENV === "development"`.**

**Vulnerable scenario (prevented).** A developer ships the
`(insiders)` route group as part of the production bundle without
gating it. Server actions like `actionAddStripeChargedCommit(orgId,
amountCents)`, `actionIngest(orgId, costMills)`, and
`actionGetInvoicePdf(orgId, invoiceId)` become reachable on the public
internet. An attacker enumerates `organization_id` (sequential bigint),
then calls these actions to charge any org's saved Stripe card, zero
out any org's AI-credit balance via the optimistic-debit RPC (which
also flips `customer_entitled = false`), or read any org's billing
state and invoice PDFs.

**Why it's specifically risky here.** Next.js server actions are
**HTTP RPC endpoints addressable from any browser** via the
`Next-Action` header — the action hash is shipped in the client
bundle of any page that imports it. They are _not_ protected by
"the page UI isn't linked anywhere"; whatever URL group the action
lives under is the only structural gate. An open-source repo means
the action source is public, so the hashes are too. Without a
proxy-level gate, a single accidentally-deployed harness action is a
production cross-org vulnerability.

**How the code prevents it.**

1. **Proxy-level gate** — [editor/proxy.ts](editor/proxy.ts) returns
   404 for `/insiders` and `/insiders/*` whenever `NODE_ENV !==
"development"`. The proxy runs _before_ any handler, so this also
   stops `Next-Action` POSTs to `/insiders/*` URLs.
2. **Layout-level `notFound()`** —
   [editor/app/(insiders)/layout.tsx](<editor/app/(insiders)/layout.tsx>)
   throws `notFound()` when not in dev. Defense-in-depth: even if a
   future change accidentally weakens the proxy gate, the layout still
   renders 404 for every page in the group.
3. **No imports across the boundary** —
   [editor/app/(insiders)/insiders/billing/actions.ts](<editor/app/(insiders)/insiders/billing/actions.ts>)
   carries a `GRIDA-SEC-002` header documenting that these actions
   must NOT be imported from production code paths. Importing them
   from a `(site)` page would re-emit the action hashes against that
   page's URL and bypass the proxy gate.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-002 .` to enumerate.
Today:

- [editor/proxy.ts](editor/proxy.ts) — proxy gate.
- [editor/app/(insiders)/layout.tsx](<editor/app/(insiders)/layout.tsx>) — layout `notFound()` fallback.
- [editor/app/(insiders)/insiders/billing/actions.ts](<editor/app/(insiders)/insiders/billing/actions.ts>) — header callout, "no import from prod code".

**What does NOT belong under `(insiders)/`.** Anything that needs to
ship to production. If a feature in development outgrows the dev
harness, move it to `(site)/...` (with proper auth) or `(api)/...`
(with proper auth) — never relax the `(insiders)/` gate to host it.

---

## Adding a new GRIDA-SEC entry

1. Allocate the next sequential id (`GRIDA-SEC-003` for the next one).
2. Add an "Active boundaries" subsection here with the same shape as
   GRIDA-SEC-001: what it protects, vulnerable scenario, why it's risky
   here, how the code prevents it, files bound.
3. Tag every relevant file with the new id (header comment for source,
   callout block for docs, comment in scripts).
4. The skill at [.agents/skills/security/SKILL.md](.agents/skills/security/SKILL.md)
   auto-loads on any "GRIDA-SEC" mention; no need to register
   per-id with the skill.

## Reporting a vulnerability

Please email security@grida.co. We respond within 48 hours.

If you find a way to reach a non-webhook route via the cloudflared
tunnel, that is in scope and considered a real bug — the tunnel filter
is supposed to block it.
