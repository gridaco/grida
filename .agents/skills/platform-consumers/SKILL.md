---
name: platform-consumers
description: >
  Work on Grida account and billing client adapters, credit display, Console
  handoffs and native execution receipts. Excludes financial policy and provider operations.
---

# Platform consumers

Read [the consumer README](../../../editor/lib/platform/README.md) and affected
adapter before editing. Grida owns identity, product entry points/assets and its
published native contracts; account and billing services own financial policy.

- Keep configuration server-only and lazy. Fail closed for affected paid actions;
  preserve unavailable credit rather than inventing zero or a free plan.
- Preserve membership checks, native response DTOs and authenticated Console
  continuations. Never put workload credentials in navigation URLs.
- Retain original execution identities and completion receipts for native work.
  Migrated generation uses Gateway accounting and must not also emit native usage.
- A failed asset download never authorizes repeating an accepted generation.
- Contributor text BYOK does not bypass authentication; keep it local-only.

Run affected consumer checks and editor TypeScript. Use synthetic fixtures for
free tests. Changes do not authorize deployments or external-service mutations.
Keep public guidance limited to the supported consumer contract and local setup.
