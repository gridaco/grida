---
name: agent-system
description: >-
  Grida AI agent system work: `@grida/agent`, AgentHost, AgentSidecar server,
  loopback HTTP transport, sessions, workspaces/files, secrets/BYOK,
  providers, runtime/tool execution, skills discovery, prompts, tiers, and
  sandbox policy. Use for `packages/grida-ai-agent/**`, desktop sidecar
  protocol changes, agent chat transport, and bugs in agent state or streams.
  For pure Electron window, preload, menu, deep-link, or CDP work, use
  `desktop`.
---

# Grida Agent System

This skill is for `@grida/agent`, the host-agnostic agent system behind Grida
Desktop and future hosts. It owns AgentHost lifecycle, the loopback HTTP
perimeter, sessions, workspaces/files, secrets, providers, tool execution,
prompt composition, skills, and the AI-SDK stream contract.

Use [`desktop`](../desktop/SKILL.md) for Electron shell work: BrowserWindow,
menus, preload, native dialogs, file associations, deep links, and CDP
verification.

> Adjacent: [`sdk-design`](../sdk-design/SKILL.md) and
> [`sdk-seam`](../sdk-seam/SKILL.md) for exported contracts and host seams,
> [`security`](../security/SKILL.md) when a change touches a GRIDA-SEC boundary.

## When to use this skill

- Editing `packages/grida-ai-agent/**`.
- Changing AgentHost lifecycle, server capabilities, HTTP routes, transport,
  Basic Auth, Referer policy, sessions, workspaces/files, recents, secrets,
  BYOK providers, model tiers, sandbox policy, shell policy, runtime, tools,
  prompts, skills, or message streams.
- Touching the desktop sidecar protocol because the AgentHost contract changed.
- Debugging empty file lists, missing sessions, broken stream parts, provider
  resolution, tool-call behavior, or agent state recovery.
- Editing renderer agent chat transport when the bug is in stream/session
  semantics rather than Electron bridge presence.

Skip this skill for BrowserWindow, menu, native dialog, file association,
deep-link, packaging, or preload-only bugs. Use `desktop` for those.

---

## Shape

```
Host adapter (Desktop today, other hosts later)
  - supplies auth material, workspace roots, entitlement hooks, sandbox wrapper
  - starts AgentHost or AgentSidecar
        |
        v
AgentHost (@grida/agent/server)
  - long-lived services
  - sessions, workspaces, files, secrets, providers, shell, run loop
        |
        v
HTTP perimeter (@grida/agent/server + @grida/agent/transport)
  - Hono on 127.0.0.1:<random> for Desktop sidecar
  - per-request Basic Auth
  - Referer guard as defense in depth
        |
        v
Runtime-agnostic agent core (@grida/agent)
  - protocol DTOs, prompts, tiers, skills, toolset, AI-SDK UI-message stream
```

The host owns process supervision and native capability exposure. The package
owns agent-system semantics.

---

## Package Boundaries

`@grida/agent` has intentional entrypoints:

- `@grida/agent`: neutral contracts, provider metadata, handshake/run/stream
  DTOs, `createAgent`, prompt composition, toolset, tiers, and session row
  types.
- `@grida/agent/server`: Node-only `AgentHost` and server capability
  contracts.
- `@grida/agent/transport`: Basic Auth signing, fetch helpers, and
  `AgentTransport.Client`.
- `@grida/agent/fs`: storage-agnostic virtual filesystem and AI-SDK file
  tools.
- `@grida/agent/fs/backends/opfs`: browser OPFS backend.
- `@grida/agent/todos`: plan store and `todo_write`.
- `@grida/agent/tiers`: model tier constants.

Keep browser-safe imports neutral. Node-only code must stay behind server,
sandbox, or host adapter entrypoints.

Do not create a second desktop-specific agent implementation under
`desktop/src/**`. Desktop supervises and adapts AgentHost; it does not own the
agent semantics.

---

## Ownership Rules

Core tests belong in `@grida/agent` first. If a bug is in files, workspaces,
auth/session, providers, entitlements, runtime, tools, or stream formatting,
add or fix package tests under `packages/grida-ai-agent/src/**/*.test.ts`.

Desktop tests should prove Electron imports, starts, and wires the core. They
should not duplicate AgentHost behavior.

Anti-goals to preserve:

- Not a general model-provider router.
- Not a hosted model gateway.
- Not a billing or entitlement engine.
- Not a multi-agent orchestration graph.
- Not a UI framework.
- Not a desktop bridge package.
- Not a private chat-history IR; session rows are the contract.

---

## Common Diagnostics

Empty `list_files` in a workspace-bound agent usually means the workspace
filesystem was not hydrated. For design-agent workspace runs, `@grida/agent`
must create `AgentFs(NodeFsBackend(root))` and call `await fs.hydrate()`
before tool calls.

Broken desktop agent calls can still be package bugs. Check whether the same
operation fails through `AgentTransport.Client` or package tests before
debugging Electron.

If a method needs secrets, keep secret reads inside AgentHost. The renderer may
check presence and set/delete BYOK keys, but it must not receive raw secret
values.

If a change adds host-specific behavior, define the strict host capability
contract first. Do not let Node, Electron, or renderer-only imports leak into
neutral package entrypoints.

---

## Security Boundary

AgentHost's HTTP perimeter is one layer of GRIDA-SEC-004 when hosted by
Desktop:

1. Per-launch Basic Auth credentials are supplied by the host adapter.
2. The preload signs requests; credentials stay in closure, not on
   `window.grida`.
3. AgentHost checks auth on every request.
4. Referer checks defend against same-origin XSS reaching the loopback server.
5. Secrets APIs expose presence/set/delete semantics, not raw secret reads.

If a route can mutate local files, start processes, read secrets, or execute
tools, review both the transport contract and the host capability that grants
it.

---

## Verification

For package changes:

```sh
pnpm --filter @grida/agent typecheck
pnpm --filter @grida/agent test
pnpm --filter @grida/agent build
```

For session-store smoke checks against a real SQLite file:

```sh
pnpm --filter @grida/agent smoke:sessions:live
```

If the change crosses into Desktop sidecar wiring, also run the Electron owner
checks from the `desktop` skill.

---

## Pointers

- Package root: `packages/grida-ai-agent/`
- Package overview: `packages/grida-ai-agent/README.md`
- AgentHost: `packages/grida-ai-agent/src/agent-host.ts`
- HTTP server/routes: `packages/grida-ai-agent/src/http/`
- Transport: `packages/grida-ai-agent/src/transport.ts`
- Runtime: `packages/grida-ai-agent/src/runtime/`
- Sessions: `packages/grida-ai-agent/src/session/`
- Workspaces/files: `packages/grida-ai-agent/src/workspaces.ts`,
  `packages/grida-ai-agent/src/files/`, `packages/grida-ai-agent/src/fs/`
- Providers/secrets: `packages/grida-ai-agent/src/providers/`,
  `packages/grida-ai-agent/src/secrets.ts`
- Skills/prompts/tools: `packages/grida-ai-agent/src/skills/`,
  `packages/grida-ai-agent/src/agent/`, `packages/grida-ai-agent/src/tools/`
- Desktop sidecar adapter: `desktop/src/agent-sidecar.ts`
- Renderer agent chat transport: `editor/lib/agent-chat/`
