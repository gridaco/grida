---
title: Fundamental Tools (Grida binding)
description: How the locked fundamental-tool RFC lands in Grida. Naming map (RFC id → Grida id), backend adapter table, per-tool deviations Grida ships, and where each tool lives in the monorepo.
keywords: [ai, tools, agent, filesystem, planning, grida, binding]
format: md
tags:
  - internal
  - wg
  - ai
  - grida
---

# Fundamental Tools (Grida binding)

This document binds the locked fundamental-tool RFC
([`../agent/tools.md`](../agent/tools.md)) to Grida's host surfaces.
The RFC names the **shapes** every conforming implementation MUST
honor; this page records the **identifiers, backends, and shipped
deviations** as Grida currently implements them.

For canvas-specific tools (scene-graph search, specialized inserts,
canvas exec / lint / format, resource lookup), see
[`tools-canvas.md`](./tools-canvas.md). For image-generation tools,
see [`tools-image.md`](./tools-image.md).

## Naming map (RFC → Grida)

The RFC locks 13 ids (`read`, `write`, `edit`, `glob`, `grep`,
`bash`, `todo`, `task`, `question`, `web_search`, `web_fetch`,
`skill`, `tool_search`). Grida currently ships a `_file` / `_files`
suffix on the fs tools and a domain-honest name for command
execution. The divergence is recorded here, not endorsed — a future
RFC item should reconcile (see [Adding a new fundamental
tool](#adding-a-new-fundamental-tool)).

| RFC id        | Grida id                   | Notes                                                                      |
| ------------- | -------------------------- | -------------------------------------------------------------------------- |
| `read`        | `read_file`                | Same shape; Grida's name is more specific.                                 |
| `write`       | `write_file`               | Same shape; Grida adds an optional `version` for stale-check.              |
| `edit`        | `edit_file`                | Same shape; Grida adds a strict ambiguity rule on multi-match.             |
| `glob`        | `list_files`               | Today a flat enumerate; promote to glob-shape when needed.                 |
| `grep`        | `grep_files`               | Same shape; literal substring search (regex is not shipped).               |
| `bash`        | `run_command`              | Honest name — Grida's host does not always launch a shell.                 |
| `todo`        | `todo_write`               | Same shape; replace-all semantics.                                         |
| `task`        | _not yet shipped_          | Subagent spawn surfaced behind editor flows; expose as `task` once stable. |
| `question`    | _not yet shipped_          | Host-blocking prompt; not yet exposed to agents.                           |
| `web_search`  | _not yet shipped_          | Host-bound provider; out of scope for the first cut.                       |
| `web_fetch`   | _not yet shipped_          | As above.                                                                  |
| `skill`       | _not yet shipped_          | Discovery layer pending.                                                   |
| `tool_search` | `tool_search` _(proposed)_ | Two-level (literal + semantic) proposed below; not yet implemented.        |

## Backends

Grida's filesystem tools are storage-agnostic by signature. The same
`read_file({ path })` call works against any backend; what differs is
**the adapter under the fs, not the schema the model sees**.

| Backend         | Where                   | Use case                                                                          |
| --------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `MemoryBackend` | in-process map          | Tests, scratch documents, ad-hoc agent runs.                                      |
| `OpfsBackend`   | OPFS in the browser     | Web environment (per [`agent/environments / web`](../agent/environments.md#web)). |
| `NodeFsBackend` | real disk via `node:fs` | Desktop / computer environment, scoped by the workspace root and OS sandbox.      |
| (future) remote | remote document store   | Multi-tenant cloud product surfaces.                                              |

A path can be **bound** to live state (an editor, a doc model) or
**pure** in-memory storage (notes, scratch). Both shapes share the API.

## Per-tool deviations and Grida extensions

Items where Grida's binding deviates from or extends the RFC shape.

### `read_file`

Returns content + a freshness token. The token is mandatory for
subsequent edits — `edit_file` and `write_file` (with `version`)
check it for staleness. Same shape as the RFC's `read` plus the
explicit freshness token.

### `edit_file`

Match-and-replace edit. The default write path — cheap, safe, must
locate the change.

Matching: literal substring first, then a whitespace-normalized
fallback. Ambiguous matches reject unless `replace_all: true`. The
strategy is conservative on purpose — closer to Claude Code's `Edit`
than to fuzzing diff matchers.

### `write_file`

Full-file upsert. `version` optional: include it (from the last read)
for an explicit wholesale rewrite with staleness safety; omit it for a
permissive write that bypasses the freshness check (use for
fresh-start writes).

### `list_files`

Today a flat enumeration of every known path, sorted absolute. If we
need filename pattern matching later we will promote to a glob-shape
(`glob` in the RFC).

### `grep_files`

Literal substring search across every known file. Returns one entry
per matching line with a 1-indexed line number and the full line
text. Mirrors `grep -n -F` (case-sensitive, fixed-string by default;
pass `case_sensitive: false` for `-i`). Does NOT count as a
`read_file` — search is for finding things, not for claiming you've
read them.

Roadmap:

- **Level 1 (shipped):** literal substring search. Cheap, deterministic, works offline.
- **Level 2 (future):** semantic / RAG search. Higher cost; will ship as a separate tool name (e.g. `semantic_search`) so the model picks the cost tier explicitly.

### `todo_write`

Plan and track work. Pass the complete list of todos every call — the
prior list is replaced wholesale.

```json
{
  "todos": [
    {
      "content": "Add a star",
      "activeForm": "Adding a star",
      "status": "in_progress"
    }
  ]
}
```

- **Exactly one `in_progress` at a time.** Enforced socially by the prompt; the visible list makes drift obvious.
- **No batched updates.** The model should update as it works.
- **Replace-all.** No per-item ops; the whole list is the input.

Use it when the work is non-trivial (multiple edits, exploration,
anything you'd break into steps). Skip it for one-shot edits.

### `run_command`

Grida's binding of the RFC's `bash`. The name is honest about the
fact that Grida's host does not always launch a shell — sometimes
it directly spawns an allowlisted executable with argv slots.

```ts
run_command({
  command: string,        // bare executable name, e.g. "git", "rg", "ls"
  args?: string[],        // argv slots; no shell parsing
  workdir?: string,       // defaults to the workspace root
  timeout_ms?: number,    // optional, host-capped
  description: string,    // short human-facing intent
})
```

Result:

```ts
{
  stdout: string,
  stderr: string,
  exit_code: number | null,
  signal?: string | null,
  timed_out: boolean,
  truncated: boolean,
  duration_ms?: number,
}
```

The contract stays honest about what is actually executed:

- If the host runs a real shell, name and describe it as shell execution.
- If the host directly spawns an allowlisted executable with argv slots, name and describe it as command execution.
- Prefer explicit `workdir` over `cd ... && ...`.
- Prefer structured arguments over shell-string parsing when the host enforces an allowlist.
- Include a short `description`. It is useful for permission UI, transcripts, audit logs, and human review.
- Expose timeout and truncation metadata so the model does not reason from incomplete or prematurely killed output as if it were complete.

Security expectation: command execution must run under a real
sandbox boundary. Grida's desktop binding wraps the agent host process
under the reference sandbox (`srt`); see
[`../agent/srt.md`](../agent/srt.md).

### `tool_search` (proposed)

As the toolkit grows — fs + todos + canvas (15+) + future env tools

- user-installed MCP servers — the model can't reasonably hold
  every tool's full schema in its working context. The RFC names a
  two-level (literal + semantic) discovery shape; Grida's binding
  will mirror it.

| Level   | Search type          | Cost            | When                                                                  |
| ------- | -------------------- | --------------- | --------------------------------------------------------------------- |
| Level 1 | Text / token match   | Zero            | Default. Substring + ranked keyword match on tool name + description. |
| Level 2 | Semantic / embedding | Cheap, non-zero | Optional fallback when text match is empty.                           |

The model picks the level via a hint (`mode: "literal" | "semantic"`),
default `literal`. Level 2 is invoked only on miss, keeping the
typical path zero-cost.

```ts
tool_search({
  query: "send slack message",          // free-text intent
  // or
  select: ["read_file", "edit_file"],   // exact tool names
  max_results?: 5,
})
→ {
  tools: [
    { name: "slack_post_message", description: "...", schema: {...} },
    ...
  ]
}
```

Status: **proposed**. The four shipped fundamentals plus the canvas
tools are enough that we haven't felt the pinch. When the form-builder
agent surface or the first MCP integration lands, this becomes the
next thing to ship.

## What lives where

- `packages/grida-agent-tools/src/fs/` — filesystem fundamentals
  ([README](https://github.com/gridaco/grida/blob/main/packages/grida-agent-tools/src/fs/README.md))
- `packages/grida-agent-tools/src/todos/` — planning fundamentals
  ([README](https://github.com/gridaco/grida/blob/main/packages/grida-agent-tools/src/todos/README.md))
- `packages/grida-agent-tools/src/tool-search/` — _not yet created; see proposal above_
- `editor/grida-canvas-hosted/ai/tools/` — canvas tools; see
  [`tools-canvas.md`](./tools-canvas.md) for the catalog.

## Adding a new fundamental tool

Bar: would every agent want this, regardless of env? If yes, it's
fundamental. Examples that pass the bar: filesystem, planning, tool
discovery, time/clock, env metadata. Examples that fail: anything
canvas-specific, anything network-bound (those are MCP or per-env).

Process:

1. Confirm the RFC carries the shape — if not, propose it to
   [`../agent/tools.md`](../agent/tools.md) first.
2. Drop the implementation in `packages/grida-agent-tools/src/<name>/`
   with its own README, class, AI-SDK tool schema, and pure-logic tests.
3. Add a row to the naming map above and a per-tool section below it.
4. If it's vfs-only (only needed because we lack command execution),
   mark it so — the host can then drop it when command execution is
   available.

## See also

- [Agent RFC / Tools](../agent/tools.md) — the locked-set contract this page binds.
- [Agent RFC / Environments](../agent/environments.md) — which capabilities each environment exposes.
- [Canvas Tools](./tools-canvas.md) — canvas-only tool surface.
- [Image Tools](./tools-image.md) — image-generation tool surface.
