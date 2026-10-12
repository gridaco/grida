# Platform consumers

Grida keeps identity, organizations, product assets and native API contracts.
Platform provides account and billing services. This directory contains the
Grida client adapters; financial policy and provider operations are not owned here.

- `canonical.ts` validates organization observations for server consumers.
- `billing-consumer.ts` reads credit/plan projections and resolves Console links.
- `billing-handoff.ts` preserves authenticated organization-specific navigation.
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

## Checks

From the Grida root:

```sh
pnpm --filter editor exec vitest run --config vitest.platform.config.ts
pnpm --filter editor test:api
pnpm --filter editor typecheck
```

These use synthetic service fixtures and are not production qualification.
