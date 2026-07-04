---
title: Deferred Grida Cloud Agent Provider (historical, 2026-06)
description: Historical snapshot of the deferred hosted-provider design, superseded by the shipped Hosted AI architecture.
keywords:
  - desktop
  - grida-cloud
  - agent host
  - ai
  - billing
  - historical
status: historical
unlisted: true
format: md
tags:
  - internal
  - wg
  - platform
  - historical
---

> **Historical.** This is the _deferred_ design that predates the shipped
> hosted-AI provider. It describes a removed prototype (agent-server PKCE,
> `auth.json` session storage, a `/private/ai/model` proxy) that is **not**
> what shipped. The re-entry criteria below were met, but the realized
> architecture differs materially (renderer-minted scoped token,
> memory-only custody, an OpenAI-compatible gateway). For current truth
> see [Hosted AI](../hosted-ai.md). Kept for the design lineage and the
> "agent loop stays local" doctrine.

# Deferred Grida Cloud Agent Provider

## Status

Grida Desktop V1 ships the local `AgentHost` with BYOK model providers only:

1. OpenRouter BYOK key.
2. AI Gateway BYOK key.
3. Provider unavailable.

`grida-cloud` is intentionally not shipped as an AI provider in V1. The prototype
added hosted auth, Supabase session refresh, billing/entitlement gates, a model
proxy endpoint, deep-link callback handling, and provider fallback behavior before
the local agent system itself was compact enough. This note preserves that design
so it can be reintroduced later as a provider that fits the contract.

## Contract To Preserve

The agent loop remains local. Future `grida-cloud` support must provide model
capacity only; it must not remote-run the Desktop workspace agent.

- `@grida/agent` owns prompt composition, tier constants, tool registry
  composition, session recording, stream vocabulary, workspace capability
  binding, local filesystem/todos/command resolution, abort propagation, and
  provider resolution.
- A future hosted provider supplies a `ModelFactory` compatible with the same
  runtime contract as BYOK providers.
- Workspace roots, local file capabilities, and command authority stay inside
  the local agent host. File contents may reach a hosted model only as ordinary
  prompt/model-call content produced by the local agent loop.
- The renderer never receives provider secrets or cloud tokens. It may observe
  state and run results, not raw credentials.

## Removed Prototype Shape

The removed prototype had this flow:

1. Desktop requested `auth.signIn()` over the preload bridge.
2. The agent server generated PKCE verifier/state and returned a Grida Cloud
   authorization URL.
3. Electron handled `grida://callback?...` and forwarded the callback to the
   agent server.
4. The agent server exchanged the code, stored the cloud session in `auth.json`,
   and refreshed the session in-process.
5. Provider resolution tried OpenRouter BYOK, then AI Gateway BYOK, then
   `grida-cloud` OAuth.
6. The `grida-cloud` model factory called the editor's hosted
   `/private/ai/model` endpoint with the agent-host-held bearer token.
7. The hosted route resolved user/org server-side, overwrote caller-supplied
   Grida provider options, called the existing AI SDK server seam, and let the
   hosted billing/usage path account for the request.

Prototype code that was intentionally removed from V1:

- `packages/grida-ai-agent/src/providers/grida-cloud.ts`
- `packages/grida-ai-agent/src/auth/pkce.ts`
- `packages/grida-ai-agent/src/auth/session-store.ts`
- `packages/grida-ai-agent/src/auth/supabase.ts`
- `packages/grida-ai-agent/src/http/routes/auth.ts`
- `packages/grida-ai-agent/src/http/routes/entitlements.ts`
- `editor/app/(api)/private/ai/model/route.ts`
- `editor/lib/ai/model-endpoint.ts`
- Desktop cloud sign-in UI and bridge namespaces.

## Future Security Boundary

If reintroduced, the hosted provider boundary needs an explicit security review
before code lands.

- PKCE verifier and state are generated in the agent server and never exposed to
  the renderer.
- Deep-link callback routing must be one-shot, state-bound, and short-lived.
- Hosted model calls carry model-call data and attribution metadata only.
- The server derives the user from the bearer token and derives organization
  authority server-side; it must ignore caller-supplied organization ids.
- Hosted billing, entitlement, usage ingest, and upstream provider credentials
  belong to the hosted service, not to the local agent package.
- The local `auth.json` store may persist a cloud session, but that does not make
  `@grida/agent` an OAuth SDK or a billing engine.

## Re-entry Criteria

Bring this back only after V1 proves the local BYOK agent contract:

- The provider contract is stable enough that `grida-cloud` can be just another
  `ModelFactory` source.
- Hosted auth/session refresh has a clear owner and can be tested without
  leaking into the core agent layers.
- Entitlement/billing state is represented as hosted service state, not as a
  condition that shapes local agent APIs.
- The `GRIDA-SEC-004` record is updated with the new callback and hosted-model
  files when they exist again.

## Related Prior Art

OpenCode Zen was inspected as a comparison point. The useful lesson is narrow:
a local agent runtime can use a hosted paid model provider without remote-running
the whole local agent. Zen is broader than this V1 requirement because it also
normalizes providers, quotas, cost calculation, and observability. Grida should
not inherit that full gateway shape until it has a product reason to do so.
