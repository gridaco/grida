---
name: ee
description: >
  Working pattern for enterprise-edition features in Grida — the
  commercial/hosted concerns (entitlement, BYOD, billing) on top of
  the OSS core. Anchor for the `GRIDA-EE: <surface>` grep marker,
  `(ee)` route group, `*-hosted` package suffix, and namespaced
  `grida_*` schema. Use when adding or touching an EE-only feature,
  or deciding whether a feature is EE territory. Surface skills
  (`ee-billing`) are siblings.
---

# ee

Grida is open source. Some features only exist because Grida is also
a hosted commercial product — org-level entitlement, custom domains,
billing. Those features are **EE (enterprise edition)**: they ship in
the same monorepo as the OSS core, but a self-hoster running the
codebase without paid infrastructure should be able to identify and
strip them.

This skill is the anchor for that boundary. No `GRIDA-EE` marker
exists in the repo today; this skill establishes the convention.

## What counts as EE

The test: _would this feature still make sense in a single-user,
no-billing self-hosted instance?_ If no, it is EE.

Three surfaces today:

- **Org / entitlement** — the commercial layer on top of multi-tenant
  routing. Paid plans, member seats, the entitlement check that gates
  paid features. _The tenant routing substrate itself (`(tenant)`
  route group, RLS, hostname resolution) is OSS infrastructure — only
  the commercial layer on top of it is EE._
- **Custom domains (BYOD)** — user-owned apex + subdomain mapping on
  Vercel. See [multi-tenant-custom-domain-vercel](https://grida.co/docs/wg/platform/multi-tenant-custom-domain-vercel).
- **Billing** — subscriptions, AI credit, the entitlement gate
  primitive. See the `ee-billing` skill (planned) for the workflow.

## The `GRIDA-EE` marker

Like `GRIDA-SEC`, the boundary is grep-able. Tag every file that
exists _only_ for EE, with the surface as the sub-label:

```ts
// GRIDA-EE: entitlement — paid-plan gate
// GRIDA-EE: byod — apex domain verification
// GRIDA-EE: billing — see ee-billing
```

Sub-labels are surface names (`entitlement` / `byod` / `billing`),
not ids — there is no central registry like `SECURITY.md`. The grep
is the index:

```sh
grep -rn 'GRIDA-EE' editor crates packages
```

Tag the file header when the entire file is EE; tag inline when only
a branch is EE.

**Known limitation.** The marker captures files that exist _only_ for
EE. Shared utilities that EE imports but OSS also uses are not
tagged — strip-time discovery has to come from an import audit, not
grep. Don't tag OSS modules with EE callers; tag inline at the EE
branch instead.

## Physical placement

Co-locate by surface so the grep doesn't have to do all the work.

- **Next.js routes** — group under `(ee)` only when a cluster of
  EE-only routes shares chrome/auth distinct from OSS readers
  (per [`naming`](../naming/SKILL.md), route groups encode the
  reader on the other side of the screen). For a single EE route
  inside an OSS reader's surface, tag inline rather than fragmenting
  the existing group. Tenant _content rendering_ stays in `(tenant)`
  — that is the OSS routing substrate, not EE.
- **Packages and crates** — use the existing `*-hosted` suffix when
  the whole package is EE-only. `grida_hosted` already lives in the
  DB schemas as the parallel namespace, and `*-hosted` is in
  `naming`'s established suffix list. Don't mint a parallel `*-ee`
  suffix. Mixed packages stay unsuffixed and tag the EE branches
  inside.
- **Database** — namespaced schema. Existing examples:
  `grida_billing`, `grida_hosted`. Don't bleed EE columns into
  OSS-relevant tables. Schema-design rules live in the
  [`database`](../database/SKILL.md) skill / `supabase/AGENTS.md`;
  consult those.

When in doubt, default to the EE-named location. The cost of moving
later is the cost of every import.

## Working on EE features

1. Tag every file you create or touch with `GRIDA-EE: <surface>`.
2. Place new code in an EE-named location. If there's no existing EE
   location for the surface yet, create it — don't dilute an OSS one.
3. **Direction of dependency: EE → OSS, not OSS → EE.** Stripping the
   `(ee)` group and `*-hosted` packages must not break OSS modules.
   Where OSS needs to query an EE concept (entitlement, paid plan,
   member seats), define the interface in OSS and let EE provide the
   implementation — not a direct import of an EE module from an OSS
   one.
4. Fail-closed at the EE boundary is
   [`security`](../security/SKILL.md) discipline — see `GRIDA-SEC-003`
   (BYOK fail-closed) for the worked example.

## When EE crosses security

EE surfaces that also carry a `GRIDA-SEC-<id>` tag — the Stripe and
Metronome webhook receivers (`GRIDA-SEC-001`), the BYOK carve-out
(`GRIDA-SEC-003`), any path that gates entitlement on a signed
payload — run the [`security`](../security/SKILL.md) review first;
this pattern is the second pass. Tag the file with both markers.

> Precedence is stated here only; if the rule becomes load-bearing,
> mirror it into `security/SKILL.md` so a reader entering from that
> side doesn't miss it.

See also: `ee-billing` (billing workflow — planned),
[`security`](../security/SKILL.md) (boundary contracts, fail-closed
discipline), [`naming`](../naming/SKILL.md) (the suffix list this
inherits), [`oss-standards`](../oss-standards/SKILL.md)
(public-by-default discipline), [`database`](../database/SKILL.md)
(schema namespacing).
