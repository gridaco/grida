# Platform consumers

Grida keeps identity, organizations, product assets and native API contracts.
Platform provides account and billing services. This directory contains the
Grida client adapters; financial policy and provider operations are not owned here.

- `canonical.ts` validates organization observations for server consumers.
- `billing-consumer.ts` reads credit/plan projections and resolves Console links.
- `billing-handoff.ts` preserves authenticated organization-specific navigation.
  Console URLs use current unique `organization.name` slugs; permanent numeric
  IDs remain the authorization and service API identity. The management handoff
  rechecks that the requested locator belongs to that same organization.
  Numeric-only names are valid, with no ID fallback or old-name redirect.
- `console-links.ts` is the single source for outbound Console page URLs
  (AI Gateway); update its templates when the Console URL spec changes.
- `native-credits.ts` preserves the installed clients' credit response shape.
- `product-billing.ts` and `product-consumer.ts` retain admission and completion
  custody for native operations and accepted work.
- `product-receipts.ts` exposes the authenticated receipt delivery contract.

## Development

Use [the contributor guide](../../../docs/contributing/billing.md) for local
insiders and text BYOK. Consumer configuration is server-only and loaded when
needed; see [the environment example](../../.env.example). Missing configuration
makes the affected operation unavailable, without affecting unrelated routes.

Preserve membership checks, response DTOs, unavailable-versus-zero credit display,
original accepted execution identities and receipt replay behavior. Never retry
an accepted generation because downloading its result failed. Catalogue costs
are display estimates; the execution service owns charging.

The application exposes no financial-provider callback receivers. Applied
migration history and retained receipts remain unchanged.

## Receiving workload credentials

The canonical and product-receipt handlers accept server-only verifier manifests.
Each entry binds one key ID and SHA-256 verifier to a fixed environment and
audience. Caller headers cannot choose either scope; tokens never belong in
browser configuration.

Omitted `lifetime`, or `"lifetime": "bounded"`, requires both `not_before` and
`not_after`, with at most 90 days between them. Explicit `"lifetime": "static"`
requires `not_before` and permits omitting `not_after`. A static credential may
also set a finite `not_after` when deliberately retiring it; that deadline is
exclusive. Existing bounded manifests retain their expiry behavior.

Revocation, unique IDs and unique verifiers still apply. Each environment and
audience permits at most two nonrevoked credentials with at most 24 hours of
validity overlap. Two static credentials without retirement deadlines cannot
coexist. For rotation, first give the old credential a short retirement deadline,
install the replacement verifier, switch the sender, then remove the old verifier.
Local fixtures and Sandbox deployments continue using bounded credentials.

## Checks

From the Grida root:

```sh
pnpm --filter editor exec vitest run --config vitest.platform.config.ts
pnpm --filter editor test:api
pnpm --filter editor typecheck
```

These use synthetic service fixtures and are not production qualification.
