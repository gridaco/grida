---
title: Contributing to Grida Platform integration
description: Local Grida development and the account, credit and Console consumer boundary.
keywords: [grida, contributing, platform, byok]
format: md
---

# Platform integration development

Grida consumes account and billing services; it does not operate the financial
engine. Customer billing information belongs in [plans and billing](../platform/billing.mdx)
and the [refund policy](../platform/refund-policy.md).

For ordinary local development, follow [authenticated local development](https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md#authenticated-local-development).
Use local Supabase and insiders auth. Payment-provider credentials and tunnels
are not required.

Optional contributor text/chat BYOK uses `BYOK_OPENROUTER_API_KEY` or
`BYOK_VERCEL_AI_GATEWAY_API_KEY` in the ignored `editor/.env.local`.
OpenRouter takes precedence. The contributor pays their provider directly;
authentication and organization resolution still apply. Do not configure this
instance-wide override on a hosted or preview deployment.

Funded product execution requires its dedicated server configuration. It fails
closed when unavailable. See the [environment example](https://github.com/gridaco/grida/blob/main/editor/.env.example)
and [consumer README](https://github.com/gridaco/grida/blob/main/editor/lib/platform/README.md).
Customer API keys are not substitutes for server workload credentials.

Preserve native response shapes, membership checks and accepted execution
identity when changing a consumer. Unavailable credit must not be displayed as
zero, and asset delivery failure must not repeat a paid generation.

The focused free checks are:

```sh
pnpm --filter editor exec vitest run --config vitest.platform.config.ts
pnpm --filter editor test:api
```

These checks use synthetic credentials and external-service fixtures.
