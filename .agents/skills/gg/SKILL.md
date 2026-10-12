---
name: gg
description: >
  Work on Grida's Gateway product consumer, scoped native AI tokens, installed
  gg provider and Desktop integration. Use for product execution adapters, not
  standalone Gateway service implementation or billing policy.
---

# Grida Gateway consumers

Grida's web, CLI and Desktop retain their authenticated native entry points.
Funded product generation is delegated by the server to Grida Gateway; this
repository owns the consumer adapters and product result persistence.
Standalone customer API-key support is separate from the installed login-based
`gg` provider; do not replace one credential family with the other.

Read the affected adapter in `editor/lib/ai/`, [Platform consumers](../platform-consumers/SKILL.md),
and `GRIDA-SEC-006` in [SECURITY.md](../../../SECURITY.md) when touching scoped tokens.
The public standalone contract is [gateway.grida.ai/llms.txt](https://gateway.grida.ai/llms.txt).

- Preserve authenticated organization resolution and native result DTOs.
- Product workload credentials are server-only; never expose them to a renderer
  or substitute a customer's API key.
- Keep the existing `gg:ai` native audience and scoped lifetime. Account tokens,
  scoped native tokens and product workload credentials are distinct.
- Preserve original accepted job identity during polling, retries and asset
  persistence. Download failure must not resubmit paid work.
- Do not add financial policy, another credit balance or duplicate native usage
  to migrated generation. Retained native consumers still use Platform admission.
- `GRIDA-GG: <surface>` marks consumer/token/provider/Desktop code. It does not
  indicate ownership of the Gateway service or financial engine.

Use focused no-dotenv unit/API tests and editor TypeScript. The paired SDK lane
requires an explicitly supplied local service fixture and synthetic credentials;
ordinary tests must not load hosted keys or call paid models.
