---
title: Persistency
description: The storage layer. The three-table session schema, the save-on-chunk policy, the JSON-column discipline, the id strategy, and the event-log opt-in. SQLite is the default; the schema ports to any engine that supports JSON columns and indexed string keys.
keywords:
  [
    agent-system,
    persistency,
    persistence,
    sqlite,
    schema,
    sessions,
    messages,
    parts,
    save-policy,
    event-log,
    storage,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Persistency

A session is **the unit of state**. This page specifies the storage
contract: what a session looks like on disk, when it's written, what
identifiers it uses, and what an implementor MUST preserve so two
implementations can read each other's data.

## Storage engine

This document describes the shape using **SQLite or similar** — any
engine that supports JSON columns and indexed string keys (Postgres
with `jsonb`, etc.) works the same way.

## The three-table schema

Sessions are stored across three tables: `chat_sessions`,
`chat_messages`, `chat_parts`. The shape is the AI SDK v6 message +
part model promoted to rows, plus session-level rollups so a session
list can render token counts without replaying chunks.

### `chat_sessions`

| Column              | Type    | Required | Description                                                                                                                                                                                  |
| ------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | TEXT    | PK       | `ses_…` prefix. Prefix-sortable monotonic. See [ID strategy](#id-strategy).                                                                                                                  |
| `agent`             | TEXT    | required | The agent id this session was opened with. Immutable. Mid-session swaps (e.g. plan/build) are recorded per-message via `chat_messages.metadata_json.agent`, not by mutating this column.     |
| `workspace_root`    | TEXT    | optional | The directory the session is rooted in. Empty for ad-hoc sessions.                                                                                                                           |
| `model_json`        | TEXT    | required | JSON `{ provider_id, model_id, variant? }`. Snapshot of the most-recent active model. Refreshed each turn.                                                                                   |
| `parent_id`         | TEXT    | optional | Parent session id when this session is a branch.                                                                                                                                             |
| `parent_message_id` | TEXT    | optional | The user message id in the parent that this branch forks from.                                                                                                                               |
| `permissions_json`  | TEXT    | required | JSON array of session-scoped [permission rules](#permission-rule-shape). `'[]'` when none.                                                                                                   |
| `metadata_json`     | TEXT    | required | JSON object. Per-agent extension bag. `'{}'` when none.                                                                                                                                      |
| `prompt_tokens`     | INTEGER | required | Sum of `usage.input` across the session's assistant messages. Default `0`.                                                                                                                   |
| `completion_tokens` | INTEGER | required | Sum of `usage.output`. Default `0`.                                                                                                                                                          |
| `reasoning_tokens`  | INTEGER | required | Sum of `usage.reasoning`. Default `0`.                                                                                                                                                       |
| `cache_read`        | INTEGER | required | Sum of `usage.cache_read`. Default `0`.                                                                                                                                                      |
| `cache_write`       | INTEGER | required | Sum of `usage.cache_write`. Default `0`.                                                                                                                                                     |
| `total_tokens`      | INTEGER | required | `prompt_tokens + completion_tokens + reasoning_tokens + cache_read + cache_write`. Equals `context_window_used` per [session](./session.md#what-the-context-window-means-here). Default `0`. |
| `cost_usd`          | REAL    | required | Default `0`. The store never **computes** cost; a writer (a hosted route, a metadata hook) MAY populate it.                                                                                  |
| `created_at`        | INTEGER | required | Epoch ms.                                                                                                                                                                                    |
| `updated_at`        | INTEGER | required | Epoch ms.                                                                                                                                                                                    |
| `archived_at`       | INTEGER | optional | Epoch ms when archived. Conforming session-list operations MUST filter rows with non-null `archived_at` by default, and MUST expose a way to include them. **Not** a delete.                 |

Required indexes:

- `(agent, updated_at)` — recent-by-agent listing.
- `(workspace_root, updated_at)` — recent-by-workspace listing.
- `(parent_id)` — child enumeration.
- `(archived_at)` — archived filter.

### `chat_messages`

| Column          | Type    | Required | Description                                                         |
| --------------- | ------- | -------- | ------------------------------------------------------------------- |
| `id`            | TEXT    | PK       | `msg_…` prefix.                                                     |
| `session_id`    | TEXT    | required | FK → `chat_sessions.id` ON DELETE CASCADE.                          |
| `role`          | TEXT    | required | `user` / `assistant` / `system`.                                    |
| `metadata_json` | TEXT    | required | JSON object. Mirrors AI SDK `UIMessage.metadata`. `'{}'` when none. |
| `created_at`    | INTEGER | required | Epoch ms.                                                           |
| `updated_at`    | INTEGER | required | Epoch ms.                                                           |

Required index: `(session_id, created_at)`.

**Metadata conventions** stored in `metadata_json`:

| Key                    | Where it appears            | Purpose                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `usage`                | assistant messages          | `{ input, output, reasoning, cache_read, cache_write }` — see [Token usage](./session.md#context-window-tracking).                                                                                                                                                             |
| `model`                | user and assistant messages | `{ provider_id, model_id, variant? }` — the model picked for this turn.                                                                                                                                                                                                        |
| `agent`                | user and assistant messages | Optional. The agent id active for this turn when it differs from `chat_sessions.agent`. Used for mid-session agent swaps (plan/build, etc.).                                                                                                                                   |
| `queued_at`            | user messages               | Optional. Epoch ms when the message was queued behind a running turn. Cleared when the loop fires it. See [UX / queued sends](./ux.md#queued-sends).                                                                                                                           |
| `snapshot_id`          | user messages               | Optional. The host's workspace snapshot id at the time of this message. Only present when a snapshot layer ran.                                                                                                                                                                |
| `trigger`              | user messages               | Optional. `{ source, fired_at, schedule_id?, delivery_id?, headers?, auth_subject? }` — present when the turn fired from a non-human source (schedule, webhook, API, agent self-schedule, MCP event). See [`triggers / trigger envelope`](./triggers.md#the-trigger-envelope). |
| `system_prompt_digest` | assistant messages          | SHA-256 of the assembled system prompt. The body MAY be stored in a separate `system_prompts` table keyed by digest.                                                                                                                                                           |
| `hidden_at`            | any message                 | Epoch ms when the message was soft-truncated by a rewind. Hidden messages stay in the DB; the loop skips them on the next call.                                                                                                                                                |

### `chat_parts`

| Column         | Type    | Required | Description                                                                                                                                                                                                                                    |
| -------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | TEXT    | PK       | `prt_…` prefix.                                                                                                                                                                                                                                |
| `message_id`   | TEXT    | required | FK → `chat_messages.id` ON DELETE CASCADE.                                                                                                                                                                                                     |
| `session_id`   | TEXT    | required | Denormalized for `WHERE session_id = ?` scans.                                                                                                                                                                                                 |
| `index`        | INTEGER | required | Position within the message. Append-monotonic per message.                                                                                                                                                                                     |
| `type`         | TEXT    | required | Mirrors AI SDK part `type`: `text`, `reasoning`, `tool-<name>`, `dynamic-tool`, `file`, `source-url`, `source-document`, `data-<name>`. The guide reserves `data-compaction` for the [compaction part](./session.md#what-compaction-produces). |
| `data_json`    | TEXT    | required | Full AI SDK `UIMessagePart` shape — hydratable straight into a `Chat.messages` reducer.                                                                                                                                                        |
| `tool_call_id` | TEXT    | optional | Hoisted from `data_json` so a late `tool-output-*` finds the row by id.                                                                                                                                                                        |
| `tool_state`   | TEXT    | optional | `input-streaming` / `input-available` / `output-available` / `output-error`. Mirrors the streaming state.                                                                                                                                      |
| `created_at`   | INTEGER | required | Epoch ms.                                                                                                                                                                                                                                      |
| `updated_at`   | INTEGER | required | Epoch ms.                                                                                                                                                                                                                                      |

Required indexes: `(message_id, index)`, `(session_id)`,
`(tool_call_id)`.

### Pragmas (SQLite-specific)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

`synchronous = NORMAL` trades a small corruption window on power-loss
for ~3× write throughput. Acceptable for chat transcripts (the
in-memory part-accumulator can replay the latest unsynced chunks).
`foreign_keys = ON` is required for `ON DELETE CASCADE`.

## Permission rule shape

The `permissions_json` column is a JSON array of:

```ts
{
  permission: string,                      // a tool id, capability name, or "*"
  pattern: string,                         // glob pattern matched against argv / paths / hosts
  action: "allow" | "deny" | "ask",
  source: "manifest" | "session" | "project", // for explain / debug; MAY default to "session"
  added_at?: int,                          // epoch ms; informational
}
```

The shape is normative — two conforming implementations MUST agree on
the four field names so a session can be loaded by either side. The
manifest-scope rules live in the agent's manifest (not this column);
project-scope rules live in the host's project config (not this
column either); only **session-scope** rules live here.

See [`session / permission scopes`](./session.md#permission-scopes)
for the layering and [`tools / permissions at the tool boundary`](./tools.md#permissions-at-the-tool-boundary)
for evaluation.

## JSON column discipline

The schema promotes only the fields the picker, filter, or recorder
needs to columns. Everything else lives in JSON:

- **Picker reads, indexable filters, rollups → columns.** Tokens,
  cost, `archived_at`, `updated_at`, `parent_id`.
- **Per-turn payload → `data_json`, `metadata_json`.** The full part
  object verbatim. New part types (a future `tool-input-progress`, a
  `media-*` chunk) ship without a migration.

Implementors MUST NOT promote a JSON field to a column without a
migration. They MAY query into JSON with the engine's JSON operators
(`json_extract` for SQLite, `->>` for Postgres), but those queries
are second-class — no index, full scan.

## Save policy

The default policy is **save on every chunk**:

- A user message is persisted **before** it reaches the model. The
  model cannot say something that overrides "the user typed X."
- An assistant message row is created on the **first** persisted
  chunk (lazy insert keyed by the chunk's message id).
- Parts are **upserted** as chunks arrive. Mid-stream parts mutate
  in place — text grows; tool calls progress through
  `input-streaming → input-available → output-available` on a single
  row keyed by `tool_call_id`.
- The session row's `updated_at` and token rollups update on every
  `finish-step`.

**Why save-immediate.**

- A crashed run leaves a truthful partial state on reload. The user
  sees the same view they had when the crash happened.
- A second client (a different window, a CLI, a sync layer) reads
  the truth in real time.
- Token usage has a permanent home as soon as the model emits it.

**Save policy as host config.**

```jsonc
{
  "save_on": "chunk" | "step" | "turn",
  "save_buffer_size": "int",                // max bytes before forced flush
  "save_buffer_ms": "int"                   // max ms before forced flush
}
```

`"chunk"` is the default and the recommended policy. `"step"` flushes
at each `finish-step` (trades safety for throughput). `"turn"` flushes
only at top-level `finish` (loses the in-flight assistant turn on
crash).

Hosts in cost-sensitive environments (cloud sandboxes with per-write
billing) MAY pick `"step"`; web hosts where the storage is local
SHOULD pick `"chunk"`.

## Mutable-mid-stream parts

The default is to **upsert parts as chunks arrive**. Text grows;
tool calls advance through their state. The trade is more writes for
crash-recovery semantics. Implementors who pick "finalized parts
only" (buffer in memory, flush on finish) lose the recovery property
and SHOULD document the difference.

The state transitions written to `tool_state`:

```text
text-start                  → upsert  { type: "text", text: "" }
text-delta×N                → upsert  { type: "text", text: <running> }
text-end                    → no-op
reasoning-{start,delta,end} → same shape, type "reasoning"
tool-input-start            → upsert  { type: "tool-<name>", tool_call_id, state: "input-streaming" }
tool-input-delta            → upsert  same row, state: "input-streaming"
tool-input-available        → upsert  same row, state: "input-available"
tool-output-available       → upsert  same row, state: "output-available", output filled
tool-output-error           → upsert  same row, state: "output-error", error_text filled
file                        → upsert  { type: "file", data: <chunk> }
source-url / source-document → upsert with type echoed
data-*                      → upsert with type echoed (full chunk in data_json)
finish-step / finish        → observed; usage capture is the recorder's job
abort signal                → finalize the in-flight assistant message
```

## ID strategy

Three id namespaces — `ses_`, `msg_`, `prt_` — each 30 characters
total:

```text
ses_<12-hex-stamp><14-base62-random>
```

The stamp packs `Date.now() * 4096` plus an in-process monotonic
counter, so two ids minted in the same millisecond sort in insertion
order. The random tail breaks cross-process collisions.

Properties this gives:

- **Lexicographic sort equals insertion order.** Useful as a
  pagination cursor.
- **Greppable.** A 30-char fixed-prefix id stands out in logs.
- **Cross-process safe.** No coordination needed across multiple
  processes writing to the same DB.

Implementors who pick a different scheme (UUIDv7, ULID) SHOULD
preserve the insertion-order-sort property; without it, pagination
and timeline rendering require a separate sort.

## Event log (opt-in)

Some implementors want a **persistent event log** — an
append-only table of every state-changing event (message created,
part updated, session opened, run aborted). Reasons to add one:

- Replay-from-scratch debugging.
- Cross-restart audit.
- Subscribers (analytics, sync) that want the full sequence rather
  than the projected state.

When present, the event log is keyed `(stream_id, seq)` where
`stream_id` is the session id (or a user / project scope for
broader streams) and `seq` is a monotonic per-stream counter. The
three-table state is the **projection** of the log; a fresh DB
rebuilds the state from the log.

The event log is **NOT** required by this guide. Implementors that
do not need replay or audit MAY skip it entirely; the three-table
state is the source of truth.

## Schema evolution

The schema in this guide is **forward-compatible**:

- New JSON fields land without a migration.
- New tables (e.g. an event log, a sidecar blob store for attachments,
  a system-prompts table) land independently.
- New columns require a migration; implementors MUST ship migrations
  before promoting JSON fields.

Implementors MUST NOT remove columns once data has been written. To
deprecate, mark the column unused and ignore it on write; remove it
only after a release cycle in which no code writes it.

## Wire format vs storage format

The **wire format** (what crosses a process boundary — see
[ACP integration](./acp.md#naming-seam)) MAY differ from the storage
format. Field renames at the wire boundary are normal (snake_case at
rest, camelCase on the wire). The storage format is the **canonical**
shape; the wire is a translation.

## Backups

- The DB file (and its WAL / SHM siblings on SQLite) is the unit of
  backup. A consistent snapshot SHOULD use the engine's backup API
  (`sqlite3_backup_*`), not file copies — a raw copy during a WAL
  checkpoint risks tearing.
- Backups are the host's responsibility; the agent system does not
  ship a backup primitive.

## Multi-process safety

WAL handles concurrent **readers** + one writer. Two processes that
both want to write the same DB:

- The host MUST pick one owner (one writer) and have the other
  process talk to it via the host's IPC, OR
- The host MUST use a global file lock to serialize writers (with the
  caveat that this blocks on the lock).

Multi-machine setups are out of scope; sync to a shared store (Turso,
Postgres) is a separate layer.

## What this guide does not specify

- **A migration tool.** Hosts pick their own (`drizzle-kit`,
  `sqlx-cli`, `prisma migrate`, hand-rolled SQL).
- **A query language for cross-session search.** The schema supports
  basic `LIKE` and JSON-extract queries; richer search (full text,
  vector) is a host-built layer above.
- **A sync engine.** Local-first storage is a host concern; the
  three-table schema is the canonical shape sync engines can target.

## See also

- [Foundations](./foundations.md) — why SQLite is the default and why
  the chunk shape matters.
- [Session Lifecycle](./session.md) — what the loop does that the
  store records.
- [Debugging](./debugging.md) — the canonical inspection format and
  export paths the schema feeds.
