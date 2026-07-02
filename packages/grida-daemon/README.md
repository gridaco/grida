# `@grida/daemon`

Grida's local daemon: the loopback HTTP server and GRIDA-SEC-004
perimeter that hosts capability tenants. Private, `workspace:*`, in
active development.

Promoted out of `@grida/agent` (issue #927): the host layer existed
inside the AI package, named as if the agent owned it, while the code
mounted the agent as one capability flag among nine. This package makes
the boundary match the role — the daemon is the host; the agent
(`@grida/agent`) is a tenant.

It owns:

- **`DaemonServer`.** The lifecycle owner (`start()` / `stop()` /
  `port`): binds the loopback socket, installs the perimeter (CORS →
  Referer guard → Basic Auth), mounts the daemon route groups and the
  supplied tenants. Node-only.
- **Host capability routes.** `files` (path registry + read/write),
  `recent` (recents list), `workspaces` (registry, guarded fs, the
  streamed Range-aware `GET /workspaces/file`), and the handshake.
- **The `DaemonTenant` seam.** A tenant registers its route groups
  against `DaemonServices` (workspace registry, file registry, recents,
  secrets store, `user_data_path`) and reports capability flags +
  `drain`/`cleanup`. A static, typed list — not a plugin registry.
- **Daemon discovery.** The `Daemon` namespace (WG spec
  [daemon.md](../../docs/wg/ai/agent/daemon.md), #798): registration
  record, persistent credential, authenticated probe, connect-or-spawn.
- **Host primitives tenants build on.** The shell runner (structural
  GRIDA-SEC-004 gates), `SecretsStore`/`AuthStore` (presence/set/delete;
  raw reads stay server-side), path containment, request validation,
  and the sandbox policy frame.

**AI-free by contract.** This package declares and imports nothing
AI-specific — no `ai`, no model catalogs, no provider SDKs. Enforced by
`src/__boundary__.test.ts`; if that test is in your way, the change
belongs in a tenant.

## Exports

| Subpath       | What                                                                                   | Platform |
| ------------- | -------------------------------------------------------------------------------------- | -------- |
| `.`           | handshake vocabulary (`DaemonCapabilities`, `DAEMON_PROTOCOL`), local-resource DTOs    | neutral  |
| `./server`    | `DaemonServer`, `buildServer`, the tenant seam, `Daemon` discovery, the tenant toolkit | Node     |
| `./transport` | `DaemonTransport` — Basic-Auth signing, fetch/SSE helpers, the daemon route client     | neutral  |
| `./sandbox`   | sandbox policy frame (`buildDaemonSandboxPolicy`, `hostFromUrl`) — AI-free             | Node     |

## Docs

- [DaemonServer](./docs/daemon-server.md) — lifecycle, ownership, and what
  hosts must provide.
- [HTTP access](./docs/http-access.md) — Basic Auth, CORS, and Referer
  policy supplied by a host adapter.
- [Architecture (WG)](../../docs/wg/ai/grida/architecture.md) — the
  daemon/tenant split and the exposed contract.
- [SECURITY.md `GRIDA-SEC-004`](../../SECURITY.md) — the trust boundary
  this perimeter is one layer of.

## Build & test

```sh
pnpm --filter @grida/daemon build          # tsdown → dist/
pnpm --filter @grida/daemon test           # vitest (node)
pnpm --filter @grida/daemon test:browser   # perimeter system harness (Chromium)
```

The browser suite boots two real daemons (with a stub tenant) and proves
the CORS / Referer / query-token rules from a real browser context —
things a forged-header Node test cannot prove.
