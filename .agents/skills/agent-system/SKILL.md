---
name: agent-system
description: >-
  Grida AI agent system work: `@grida/daemon` (DaemonServer, loopback HTTP
  perimeter, files/workspaces, secrets store, daemon discovery) and
  `@grida/agent` (the agent tenant: sessions, providers/BYOK, runtime/tool
  execution, skills discovery, prompts, tiers, sandbox hosts). Use for
  `packages/grida-daemon/**`, `packages/grida-ai-agent/**`, desktop sidecar
  protocol changes, agent chat transport, and bugs in agent state or streams.
  For pure Electron window, preload, menu, deep-link, or CDP work, use
  `desktop`.
---

# Grida Agent System

This skill is for the two packages behind Grida Desktop and future hosts
(issue #927): `@grida/daemon` — the local host layer (DaemonServer lifecycle,
the loopback HTTP perimeter, files/recents/workspaces, the secrets store,
daemon discovery, the tenant seam) — and `@grida/agent` — the agent TENANT
mounted on it (sessions, providers, tool execution, prompt composition,
skills, the AI-SDK stream contract). Dependency direction is one-way:
`@grida/agent` imports `@grida/daemon`; the daemon is AI-free by contract
(pinned by `packages/grida-daemon/src/__boundary__.test.ts`).

Use [`desktop`](../desktop/SKILL.md) for Electron shell work: BrowserWindow,
menus, preload, native dialogs, file associations, deep links, and CDP
verification.

> Adjacent: [`sdk-design`](../sdk-design/SKILL.md) and
> [`sdk-seam`](../sdk-seam/SKILL.md) for exported contracts and host seams,
> [`security`](../security/SKILL.md) when a change touches a GRIDA-SEC boundary.

## When to use this skill

- Editing `packages/grida-daemon/**` or `packages/grida-ai-agent/**`.
- Changing DaemonServer lifecycle, the tenant seam, server capabilities,
  HTTP routes, transport,
  Basic Auth, Referer policy, sessions, workspaces/files, recents, secrets,
  BYOK providers, model tiers, sandbox policy, shell policy, runtime, tools,
  prompts, skills, or message streams.
- Touching the desktop sidecar protocol because the daemon contract changed.
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
  - starts the composed daemon (createAgentDaemon) as sidecar or CLI daemon
        |
        v
DaemonServer (@grida/daemon/server)
  - loopback Hono perimeter (CORS -> Referer -> Basic Auth)
  - host capability routes: files, recents, workspaces + secrets store
  - the DaemonTenant seam (static typed list, not a plugin registry)
        |
        v
Agent tenant (@grida/agent/server — createAgentTenant)
  - AI route groups: /agent, /events, /sessions, /secrets, /providers,
    /images, /video
  - sessions SQLite, endpoint configs, runtime + run loop, stream registry
        |
        v
Runtime-agnostic agent core (@grida/agent)
  - protocol DTOs, prompts, tiers, skills, toolset, AI-SDK UI-message stream
```

The host owns process supervision and native capability exposure. The daemon
package owns the perimeter and host capabilities; the agent package owns
agent-system semantics.

---

## Package Boundaries

Two packages, each with intentional entrypoints.

`@grida/daemon` (the host layer — AI-free by contract):

- `@grida/daemon`: handshake vocabulary (`DaemonCapabilities`,
  `DAEMON_PROTOCOL`), local-resource DTOs.
- `@grida/daemon/server`: Node-only `DaemonServer`, `buildServer`, the
  `DaemonTenant`/`DaemonServices` seam, `Daemon` discovery, and the tenant
  toolkit (WorkspaceRegistry, workspaceFs, SecretsStore, shell runner,
  request validation).
- `@grida/daemon/transport`: Basic Auth signing, fetch/SSE helpers, and
  `DaemonTransport.Client` (daemon route groups).
- `@grida/daemon/sandbox`: the sandbox policy frame
  (`buildDaemonSandboxPolicy`).

`@grida/agent` (the agent tenant — depends on `@grida/daemon`):

- `@grida/agent`: neutral contracts, provider metadata, run/stream DTOs,
  `createAgent`, prompt composition, toolset, tiers, and session row types.
- `@grida/agent/server`: Node-only `createAgentTenant` +
  `createAgentDaemon` (the composed server hosts run).
- `@grida/agent/transport`: `AgentTransport.Client` extends
  `DaemonTransport.Client` with the tenant routes (sessions, run/stream,
  events, secrets, providers, images, video).
- `@grida/agent/sandbox`: composed policy (`buildAgentDaemonSandboxPolicy`
  — daemon frame + AI upstream hosts).
- `@grida/agent/fs`: storage-agnostic virtual filesystem and AI-SDK file
  tools.
- `@grida/agent/fs/backends/opfs`: browser OPFS backend.
- `@grida/agent/todos`: plan store and `todo_write`.
- `@grida/agent/tiers`: model tier constants.

Keep browser-safe imports neutral. Node-only code must stay behind server,
sandbox, or host adapter entrypoints. Never add an AI import to
`@grida/daemon` — the boundary test fails, and the change belongs in the
tenant. A non-AI host capability (a new file route, a viewer backend)
belongs in `@grida/daemon`, never here.

Do not create a second desktop-specific agent implementation under
`desktop/src/**`. Desktop supervises and adapts the composed daemon; it does
not own the agent semantics.

---

## Ownership Rules

Core tests belong in the owning package first. Perimeter, files, workspaces,
secrets-store, and seam bugs get tests under
`packages/grida-daemon/src/**/*.test.ts`; session, provider, runtime, tool,
and stream-formatting bugs under `packages/grida-ai-agent/src/**/*.test.ts`.

Desktop tests should prove Electron imports, starts, and wires the core. They
should not duplicate daemon or tenant behavior.

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

An agent that sees SOME files but is **missing whole subtrees** (a `.canvas`
deck, or most of the repo) is almost always **hydrate-scan truncation**, not a
bug in those files. The walk stops at `SCAN_MAX_FILES` (10k) / `SCAN_MAX_DEPTH`
and warns `[agent-fs] … hydrate scan hit a cap … truncated` (sidecar stderr).
The usual cause is a large `workspace_root` containing heavy dirs that are NOT
in `IGNORED_SCAN_DIRS` — vendored toolchains / **git submodules** (e.g. `emsdk`)
or `.claude/worktrees` (full repo copies). `.gitignore` is NOT consulted, so a
submodule slips through. Fixes: scope the workspace to the real project subdir,
or add the offender to `IGNORED_SCAN_DIRS` in `@grida/daemon`'s
`workspaces/scan.ts`.

A **client-resolved** tool call that hangs at `input-available` (the turn just
ends with no result; the assistant never continues) is the **server-authoritative
model view** dropping it. The runtime rebuilds the model's input from the
PERSISTED messages (`buildModelMessages` over `listVisibleMessages`), NOT the
client's array — and it drops any tool call without a terminal result. For a
**workspace-less session** (the desktop file-window sidebar, which resolves fs
tools in the renderer over the live editor), the result lives only on the
client's next-request assistant message. `persistIncomingTail` must persist
those terminal tool-result parts (it does, as of the file-window sidebar fix) or
the call stays `input-available` forever and the model never sees the answer.
Diagnostic tell: workspace sessions show `tool_state=output-available` parts in
`sessions.db`; a no-workspace session stuck at `input-available` for EVERY tool
call is this class, not a tool bug. (Server-resolved tools are unaffected — the
recorder writes their result straight from the stream.)

Broken desktop agent calls can still be package bugs. Check whether the same
operation fails through `AgentTransport.Client` or package tests before
debugging Electron.

If a method needs secrets, keep secret reads inside the daemon process (the
store is `@grida/daemon`'s `SecretsStore`; the `/secrets` routes are
tenant-registered). The renderer may check presence and set/delete BYOK keys,
but it must not receive raw secret values.

If a change adds host-specific behavior, define the strict host capability
contract first. Do not let Node, Electron, or renderer-only imports leak into
neutral package entrypoints.

---

## Live state on disk (inspecting a real session)

You CAN inspect a real running session — the host persists agent state under
**`~/.grida/agent/`**, separate from Electron's `userData` (the desktop
supervisor passes it to the sidecar as `--user-data`; see `home.join("agent")`
in `desktop/src/main/agent-sidecar-supervisor.ts`):

- `sessions.db` — SQLite (WAL): `chat_sessions` (incl. **`workspace_root`**,
  `mode`, `parent_id`), `chat_messages`, `chat_parts`. Schema in
  `src/session/schema.ts`.
- `workspaces.json` — the workspace registry (id → root).
- `auth.json`, `recent.json`.

Read it **read-only** (don't perturb the live WAL). The first thing to check for
"why can't the agent see X" is `workspace_root` — the agent only sees files
under it (and only up to the hydrate cap, above):

```sh
sqlite3 "file:$HOME/.grida/agent/sessions.db?mode=ro" \
  "SELECT id, workspace_root, mode FROM chat_sessions WHERE id='ses_…';"
```

---

## Security Boundary

The daemon's HTTP perimeter (`@grida/daemon`) is one layer of GRIDA-SEC-004
when hosted by Desktop:

1. Per-launch Basic Auth credentials are supplied by the host adapter.
2. The preload signs requests; credentials stay in closure, not on
   `window.grida`.
3. The daemon checks auth on every request — tenant routes included.
4. Referer checks defend against same-origin XSS reaching the loopback server.
5. Secrets APIs expose presence/set/delete semantics, not raw secret reads.
6. The `auth_token` query carriage is exactly the GET SSE routes the agent
   tenant declares via `sse_query_token_paths` — never widened.

If a route can mutate local files, start processes, read secrets, or execute
tools, review both the transport contract and the host capability that grants
it.

---

## Verification

For package changes (run the pair for the package(s) you touched):

```sh
pnpm --filter @grida/daemon typecheck && pnpm --filter @grida/daemon test
pnpm --filter @grida/daemon build
pnpm --filter @grida/daemon test:browser   # perimeter system harness (Chromium)

pnpm --filter @grida/agent typecheck && pnpm --filter @grida/agent test
pnpm --filter @grida/agent build
```

A change to `@grida/daemon` requires rebuilding it before `@grida/agent`
typechecks (the tenant compiles against the daemon's `dist`).

For session-store smoke checks against a real SQLite file:

```sh
pnpm --filter @grida/agent smoke:sessions:live
```

If the change crosses into Desktop sidecar wiring, also run the Electron owner
checks from the `desktop` skill.

---

## Pointers

Daemon (`packages/grida-daemon/`):

- Package overview: `packages/grida-daemon/README.md`
- DaemonServer: `packages/grida-daemon/src/daemon-server.ts`
- HTTP frame + seam + daemon routes: `packages/grida-daemon/src/http/`
  (`server.ts` holds `DaemonServices`/`DaemonTenant`)
- Daemon transport: `packages/grida-daemon/src/transport.ts`
- Discovery: `packages/grida-daemon/src/daemon.ts`
- Workspaces/files: `packages/grida-daemon/src/workspaces.ts`,
  `packages/grida-daemon/src/files/`
- Hydrate-scan policy (ignored dirs + caps): `packages/grida-daemon/src/workspaces/scan.ts`
- Secrets store + shell runner: `packages/grida-daemon/src/secrets.ts`,
  `packages/grida-daemon/src/shell/`
- AI-free boundary pin: `packages/grida-daemon/src/__boundary__.test.ts`

Agent tenant (`packages/grida-ai-agent/`):

- Package overview: `packages/grida-ai-agent/README.md`
- Tenant + composed daemon: `packages/grida-ai-agent/src/server.ts`
- Agent routes: `packages/grida-ai-agent/src/http/routes/`
- Agent transport: `packages/grida-ai-agent/src/transport.ts`
- Runtime: `packages/grida-ai-agent/src/runtime/`
- Sessions: `packages/grida-ai-agent/src/session/`
- Virtual fs tools: `packages/grida-ai-agent/src/fs/`
- Live on-disk state (real sessions/workspaces): `~/.grida/agent/`
  (`sessions.db`, `workspaces.json`) — see "Live state on disk" above
- Providers: `packages/grida-ai-agent/src/providers/`
- Skills/prompts/tools: `packages/grida-ai-agent/src/skills/`,
  `packages/grida-ai-agent/src/agent/`, `packages/grida-ai-agent/src/tools/`
- Tool-design doctrine (read before adding/widening a tool — minimal surface,
  host-config off the args, grounded/honest knobs, auto-resolved inputs,
  context economy, clear typed failures, tool-vs-connector-vs-skill):
  `docs/wg/ai/agent/tool-design.md`; in-code checklist is the `TOOL-DESIGN`
  block in `src/tools/index.ts`
- Desktop sidecar adapter: `desktop/src/agent-sidecar.ts`
- Renderer agent chat transport: `editor/lib/agent-chat/`
