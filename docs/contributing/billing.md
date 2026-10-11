---
title: Contributing to Grida billing integration
description: Run Grida locally with insiders auth and contributor BYOK, and understand the Platform billing boundary.
keywords: [grida, contributing, billing, platform, byok]
format: md
---

# Contributing to Grida | Billing

Platform owns subscriptions, payments, credit accounts, financial projections,
and billing operations. Grida owns Supabase identity and organizations, product
execution receipts, and consumers of Platform billing. The Grida checkout does
not run a second financial engine.

## Local Grida development

Follow the repository's [authenticated local development guide](https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md#authenticated-local-development).
Use local Supabase and `NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH=1`, then sign in with
the seeded `insider@grida.co` / `password` account. Ordinary editor, Forms,
identity, and contributor text development use this local setup. They require
no Stripe or Metronome account, billing credentials, or webhook tunnel.

For AI-SDK text/chat, set one contributor key in the ignored `editor/.env.local`:

```sh
BYOK_OPENROUTER_API_KEY=sk-or-v1-...
# Or a dedicated Vercel AI Gateway key:
# BYOK_VERCEL_AI_GATEWAY_API_KEY=...
```

Nonblank OpenRouter takes precedence over Vercel AI Gateway. The provider charges
the contributor directly; this text path has no Platform credit gate or usage
charge. Authentication and organization resolution still apply. Catalog model
IDs are unchanged, so choose IDs accepted by the selected provider.

Contributor BYOK selects only the text/chat provider. Funded image, video,
audio, and 3D operations need Platform admission and their server provider
configuration. Never set contributor `BYOK_*` on a hosted or preview deployment:
the override is instance-wide. See [the AI trust boundary](https://github.com/gridaco/grida/blob/main/SECURITY.md#grida-sec-003--ai-seam-org-id-trust-boundary).

## Billing integration

The Grida adapters use Platform as the sole financial owner. Configuration is
loaded when the affected operation needs it. Missing Platform configuration
leaves credit display unavailable and denies billing or paid execution; it does
not select the retired Grida writer or stop unrelated routes from loading.

- Published organization billing links continue into the shared billing console
  after current Grida membership verification.
- Native credit reads retain the published DTO and unknown-versus-zero balance
  behavior. A display observation never authorizes paid execution.
- Paid product calls obtain a fresh Platform admission, then persist their
  source claim, dispatch transition, exact completion receipt, and usage outbox.
  Unknown provider outcomes require reconciliation before another dispatch.
- Existing `/webhooks/stripe` and `/webhooks/metronome` URLs remain
  signature-verified delivery endpoints. They preserve event custody before
  acknowledging delivery; they do not apply source financial projectors.

The [integration README](https://github.com/gridaco/grida/blob/main/editor/lib/platform/README.md)
describes Grida's adapters and focused checks. The
[environment example](https://github.com/gridaco/grida/blob/main/editor/.env.example)
lists optional integration configuration. Retired `editor/scripts/billing`
commands and the old billing E2E suite are not current Grida setup or proof.

## Server provider credentials

`GG_` identifies Grida-managed funded provider authority; `BYOK_` identifies a
contributor text override. Scope secrets separately for Production, Preview,
and Development. Neither prefix selects an environment.

| Consumer                 | Configuration                                                    | Selection                                                                                                           |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Funded Vercel AI Gateway | `GG_VERCEL_AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`            | A nonblank GG key selects explicit funded authority; absent/blank preserves platform OIDC. No generic-key fallback. |
| Funded Replicate         | `GG_REPLICATE_API_TOKEN`                                         | Required for the affected operation; no unprefixed or BYOK fallback.                                                |
| Funded Tripo             | `GG_TRIPO_API_KEY`                                               | Required for the affected operation; no generic or BYOK fallback.                                                   |
| Contributor text         | `BYOK_OPENROUTER_API_KEY`, then `BYOK_VERCEL_AI_GATEWAY_API_KEY` | Nonblank contributor keys select direct contributor spending.                                                       |
| Library embeddings       | Existing shared provider selection                               | Unbilled internal operations; sharing a provider key does not create a customer charge.                             |
| OpenAI model discovery   | `OPENAI_API_KEY`                                                 | Nonbillable model listing.                                                                                          |

Keep Vercel's OIDC lifecycle intact; never turn `VERCEL_OIDC_TOKEN` into a static
secret. Installed CLI/Desktop credentials are separate: the native provider ID
remains `vercel`, and the CLI override remains `AI_GATEWAY_API_KEY`. See
[CLI provider keys](../cli/providers.md).

Replace the former server `BYOK_AI_GATEWAY_API_KEY` name with
`BYOK_VERCEL_AI_GATEWAY_API_KEY`; there is no server alias. Deployment and secret
retirement remain operator actions. Verify the intended deployed revision and
its effective configuration before retiring an old variable or credential;
keep any authority still needed by an accepted rollback or another consumer.

For customer billing information, see [plans and billing](../platform/billing.mdx)
and the [refund policy](../platform/refund-policy.md).
