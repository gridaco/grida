---
title: Agent storage layout
description: Desktop userData files owned by AgentSidecar, including auth.json, recent files, workspaces, and SQLite session storage.
keywords: [desktop, agent-sidecar, storage, sqlite, userData]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent storage layout

> **Status: V1.x shipped (sessions).** Other files (`auth.json`,
> `recent.json`, `workspaces.json`) shipped earlier.

This page is the **desktop-specific binding** of the
[agent RFC's persistency contract](../ai/agent/persistency.md). The
abstract schema (`chat_sessions` / `chat_messages` / `chat_parts`), the
ID strategy, the save-on-chunk policy, the mutable-mid-stream rule, and
the JSON-column discipline are all locked in the RFC — read that first.

What follows is delta:

- `${userData}` file layout.
- The `node:sqlite` + drizzle `sqlite-proxy` implementation choice.
- Multi-process safety.
- Why we don't ship `resumable-stream`.

## `${userData}` layout

The agent host owns four files. All sit side-by-side under Electron's
`app.getPath('userData')` (or the XDG equivalent on Linux / the macOS
default).

| File              | Holds                                                                  | Mode    | Atomic write               |
| ----------------- | ---------------------------------------------------------------------- | ------- | -------------------------- |
| `auth.json`       | OAuth tokens, BYOK keys, PKCE state                                    | `0o600` | tmp + rename               |
| `recent.json`     | Recent documents list (the agent host's canon)                         | default | tmp + rename               |
| `workspaces.json` | Workspace registry (`{id, root, name, openedAt, pinned}`)              | `0o600` | tmp + rename               |
| `sessions.db`     | The three-table chat store ([persistency](../ai/agent/persistency.md)) | default | SQLite atomic transactions |
| `sessions.db-wal` | Write-ahead log companion (WAL journal mode)                           | default | SQLite                     |
| `sessions.db-shm` | Shared-memory companion (WAL journal mode)                             | default | SQLite                     |

The WAL companions exist whenever the DB has been opened in WAL mode
since the last clean shutdown. They are not user-data files; backups
should use the SQLite backup API rather than copying the trio.

`sessions.db` deliberately uses the OS default mode, not `0o600` — the
DB holds user data (chat content), not at-rest secrets. The
`auth.json` permission guard protects the secret surface separately.
This matches [agent security / layer 5](./agent-security.md#layer-5--secrets-discipline).

## SQLite driver — `node:sqlite` + drizzle proxy

The agent host uses Node 24 LTS's built-in `node:sqlite` driver, with
[drizzle-orm](https://orm.drizzle.team/) on top via the
`drizzle-orm/sqlite-proxy` adapter.

Why this combo:

- **Zero native rebuild.** `better-sqlite3` would pull in a native
  module per platform; the asar workflow doesn't pay for that cost
  when the schema is this small.
- **No extra binary in the Electron asar.** `node:sqlite` is in the
  runtime; nothing to ship.
- **Drizzle's query builder for free.** The `sqlite-proxy` adapter
  takes an async callback the agent host implements over
  `DatabaseSync.prepare(...).run()`. The adapter expects rows as
  **positional arrays** (drizzle indexes by column position, not name)
  — see
  [`db.ts`](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/sessions/db.ts)'s
  `execProxy`.

**Migration tooling.** The schema is applied inline via
`CREATE TABLE IF NOT EXISTS` on every open. `drizzle-kit` migrations
land the first time we ship a tagged agent host release with a frozen
schema (today the agent host is `v0.0.0` private; no DBs in the wild to
evolve).

This is one valid implementation of the RFC's three-table schema;
another host might pick `better-sqlite3`, Postgres, or Turso. The
column shapes, indexes, and pragmas don't change — the driver does.

## Pragmas

Applied on every `openSessionsDb()` call:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

The trade-offs (NORMAL vs FULL, why FK on) are documented in
[agent/persistency.md / pragmas](../ai/agent/persistency.md#pragmas-sqlite-specific).
Desktop picks the RFC defaults.

## Multi-process safety

WAL handles concurrent readers + one writer. Two daemon processes on
the same `${userData}` is user error today (typically two Electron
instances spawned by a packaging bug or a developer with a release +
dev build open). The plan: take a process lock on `sessions.db` itself
on agent host start; refuse to boot if held.

Lean toward shipping the lock after the first time someone hits the
gap. Until then, the supervisor's single-instance Electron guard is the
de-facto interlock.

## Why we don't ship `resumable-stream`

[`vercel/resumable-stream`](https://github.com/vercel/resumable-stream)
is the canonical published primitive for cross-replica SSE resume, but
**ships only Redis / generic Publisher-Subscriber adapters — no
in-memory runtime**. It exists for multi-replica serverless deployments
where a resume GET may land on a different replica than the producer.

Running Redis inside the Electron agent host just to talk to ourselves is a
strict regression. Our in-process `StreamRegistry`
([packages/grida-ai-agent/src/runtime.ts](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/runtime.ts))
IS the in-memory variant the package deliberately doesn't ship. The
RFC's
[session lifecycle / multi-replica deployments](../ai/agent/session.md#streaming-and-layering)
note explicitly carves out the single-process case.

As of the AI SDK v6 upgrade,
[`vercel/ai-chatbot`](https://github.com/vercel/ai-chatbot) itself ships
the resume endpoint as `Response(null, { status: 204 })` —
the canonical template currently has no working resume implementation
either. Our local registry is the working answer for desktop.

## Crash semantics

The stream registry is in-memory. Agent host restart drops every entry; the
next reconnect gets `404` and the renderer falls back to DB hydration.
The DB still has whatever the recorder persisted up to the crash. The
RFC carves cross-restart resume out of scope: the upstream provider
has no notion of "your previous request."

The recorder upserts parts as chunks arrive, so a crashed run leaves a
truthful partial state — text-so-far + any tool call frozen in its
last observed state ([persistency / mutable-mid-stream
parts](../ai/agent/persistency.md#mutable-mid-stream-parts)).

## Backups

Backups are the user's job. If we ever ship a backup helper, it MUST
use `sqlite3_backup_*` (the engine's backup API), not a raw `cp` — a
file copy during a WAL checkpoint risks tearing.

## See also

- [Agent system RFC / Persistency](../ai/agent/persistency.md) — the
  abstract storage contract.
- [Agent system RFC / Session lifecycle / streaming + resume](../ai/agent/session.md#streaming-and-layering)
  — the resume model the in-memory registry implements.
- [Process model](./process-model.md) — who reads/writes which file.
- [Agent security / layer 5](./agent-security.md#layer-5--secrets-discipline)
  — chmod and credential discipline.
