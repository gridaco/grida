---
title: Phase 3 agent contract cleanup
description: Short record of the BYOK-only AgentHost contract decisions after removing the hosted grida-cloud provider.
keywords: [grida, agent, sdk-design, sdk-seam, desktop, byok]
format: md
tags:
  - internal
  - wg
  - ai
  - architecture
---

# Phase 3 Agent Contract Cleanup

Phase 3 treats `@grida/agent` as future-public even while the package remains
private. The shipped V1 contract is local `AgentHost` plus BYOK model access.
`grida-cloud` stays documentation-only until it can fit this contract without
adding hosted auth, billing, entitlement, or proxy behavior to the core.

## Decisions

- The package root exports a strict neutral surface: run DTOs, BYOK provider
  metadata, handshake/session/read-model DTOs, tiers, tools, and the AI SDK
  UI-message stream alias. Runtime, provider resolver, HTTP server, and storage
  internals stay behind subpaths or private files.
- `AgentRunOptions` is typed in protocol terms: `AgentRunMessage[]`,
  `AgentRunMessagePart[]`, `ModelTier`, BYOK provider ids, catalog model ids,
  and closed skill ids. Message parts must at least carry a string `type`.
- Provider metadata is producer-owned display data. Array order drives resolver
  precedence and Desktop settings labels; sandbox network allowlists stay in
  the sandbox policy layer.
- `@grida/agent/transport` owns the AgentHost HTTP seam: route strings, Basic
  Auth signing, JSON error parsing, stream headers, SSE parsing (including the
  in-band `grida-session` id frame), `last-event-id`, and typed `HttpError`.
- The Desktop bridge behavior stays in `desktop/`, but the renderer-visible
  contract lives in private `@grida/desktop-bridge`. It carries native window,
  dialog, shell, host-app, and file-path capabilities without importing Desktop
  app source into the URL-loaded editor.
- `/desktop/*` gates on `DESKTOP_BRIDGE_PROTOCOL = 1` before rendering and
  treats missing bridge and unsupported protocol as different states.
- Desktop native capabilities live under `bridge.caps.native`. AgentHost route
  capabilities come from `bridge.handshake()`.

## Refused Alternatives

- Reintroducing `grida-cloud` as a V1 provider. That would make hosted auth,
  entitlement, billing, and model-proxy edge cases define the first agent
  contract.
- Moving the Desktop bridge into `@grida/agent`. That would leak Electron and
  native-shell concerns into a package whose seam is AgentHost HTTP.
- Letting preload keep hand-written AgentHost route knowledge. That duplicates
  producer-owned protocol details in a same-repo consumer and weakens the seam.
- Exporting a custom Grida stream vocabulary before shipping its own
  encoder/decoder. The current stream contract is AI SDK `UIMessageChunk`.

## Follow-Up

Phase 3 does not design the future hosted-provider layer. The next pass should
challenge whether a future `grida-cloud` provider fits as a sibling package,
host adapter, hosted runtime, or producer-owned provider module, using the
deferred design notes as input rather than resurrecting the removed code.
