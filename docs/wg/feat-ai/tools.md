---
title: Fundamental Tools (for AI)
description: Fundamental AI toolset — agent-host capabilities (filesystem, planning, tool discovery) that apply to any Grida agent regardless of surface or domain.
keywords: [ai, tools, agent, filesystem, planning, grida]
format: md
tags:
  - internal
  - wg
  - ai
  - editor
---

# Fundamental Tools (for AI)

This document specifies the **fundamental** AI toolset — tools that
apply to any agent we ship, regardless of where it runs (chat, canvas,
server, desktop) or what domain it works in.

For canvas-specific tools (scene-graph search, specialized inserts,
canvas exec / lint / format, resource lookup), see
[`tools-canvas.md`](./tools-canvas.md).

## Key principles

- **Always available.** Fundamentals are the baseline every agent
  surface ships with. A bare chat that has nothing else still has these.
- **Zero or near-zero cost.** No sandbox, no provisioned environment,
  no remote LLM-side spend. The host owns the implementation; the model
  just calls the tool.
- **Backend-agnostic by signature.** The same `read_file({ path })`
  call works whether the underlying storage is in-memory (`MemoryBackend`),
  OPFS in the browser (`OpfsBackend`), real disk in Node
  (`NodeFsBackend`), or a future remote document store. What changes
  across environments is the **backend** under the fs, not the tool
  schema the model sees.
- **Shell, when available, is additive — not a replacement.** A
  desktop or sandbox agent that ships a `bash` tool still keeps the
  structured fs tools. They aren't redundant: `edit_file`'s match-and-
  replace contract is safer than `sed -i`; `grep_files`' structured
  `{path, line, text}` output is cheaper than parsing `grep`'s pipe
  format; the model can be granted `edit_file` without granting
  arbitrary shell. This mirrors Claude Code's design, which exposes
  `Read` / `Edit` / `Write` / `Glob` / `Grep` _alongside_ `Bash`.
- **Mirror something proven.** Unix command surface where possible
  (`grep`, `ls`), established IDE surface where unix doesn't apply
  ("Find in Files"). The model already knows these shapes — naming with
  them buys instant calibration. Constraint: agent tools can query but
  can't pipe, so we mirror the **query** form, not the full shell
  composition.

## Categories

| Category       | Tools                                                                  | Where it lives                          |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| Filesystem     | `read_file` / `edit_file` / `write_file` / `list_files` / `grep_files` | `packages/grida-agent-tools/src/fs/`    |
| Planning       | `todo_write`                                                           | `packages/grida-agent-tools/src/todos/` |
| Tool discovery | `tool_search` _(proposed)_                                             | TBD                                     |
| Shell          | `bash` _(future, env-specific)_                                        | host-supplied when sandbox/desktop      |

## Mirror of Claude Code's tool surface

The shapes track Claude Code closely, since the patterns are proven:

| Claude Code  | Grida (fundamental)        | Notes                                                             |
| ------------ | -------------------------- | ----------------------------------------------------------------- |
| `Read`       | `read_file`                | Same shape.                                                       |
| `Edit`       | `edit_file`                | Same shape, plus our version-checked staleness guard.             |
| `Write`      | `write_file`               | Same shape, plus optional `version` for stale-check on overwrite. |
| `Glob`       | (~`list_files`)            | We have a simpler enumerate; can promote to Glob-shape later.     |
| `Grep`       | `grep_files`               | Same shape — literal/regex content search.                        |
| `TodoWrite`  | `todo_write`               | Same shape, same semantics, snake-cased.                          |
| `ToolSearch` | `tool_search` _(proposed)_ | Same shape, two-level (literal + semantic) proposed.              |
| `Bash`       | — _(future)_               | Additive, not a replacement for the fs tools when we ship it.     |

## Tools

---

> **Filesystem** tools (fundamental)

These tools cover the standard fs operations every code-aware agent
needs. The signatures are storage-agnostic — `read_file("/canvas.svg")`
makes the same sense whether the path resolves to an in-memory map, an
OPFS file, a real `node:fs` file under a tmp dir, or a future remote
document store. The implementation lives in
[`packages/grida-agent-tools/src/fs/`](https://github.com/gridaco/grida/tree/main/packages/grida-agent-tools/src/fs); the README there
carries the full contract (mounts, bindings, backends, safety contract).

The fs is content-agnostic and multi-file. A path can be **bound** to
live state (an editor, a doc model) or **pure** in-memory storage
(notes, scratch). Both shapes share the API.

These tools stay even when the agent gains shell access. Structured
file ops coexist with `bash` rather than being replaced by it —
`edit_file`'s match-and-replace contract is safer than `sed`, and the
structured outputs are cheaper to consume than shell stdout.

### `::read_file`

Read a file's content + a freshness token. Always call before any edit;
re-read on `stale`. Same shape as Claude Code's `Read`.

### `::edit_file`

Match-and-replace edit. The default write path — cheap, safe, must
locate the change.

Matching: literal substring first, then a whitespace-normalized
fallback. Ambiguous matches reject unless `replace_all: true`. The
strategy is conservative on purpose — closer to Claude Code's `Edit`
than to aider's diff fuzzing. Mirrors the find-and-replace shape every
editor agent has settled on.

### `::write_file`

Full-file upsert. `version` optional: include it (from the last read)
for an explicit wholesale rewrite with staleness safety; omit it for a
permissive write that bypasses the freshness check (use for fresh-start
writes). Same shape as Claude Code's `Write`, plus the optional version
for stale-check.

### `::list_files`

Enumerate every known file. Sorted absolute paths. Today this is a flat
enumeration; if we need filename pattern matching later we'll promote
to a Glob-shape (Claude Code's `Glob`).

### `::grep_files`

Literal substring search across every known file. Returns one entry per
matching line with a 1-indexed line number and the full line text.
Mirrors `grep -n -F` (case-sensitive, fixed-string by default; pass
`case_sensitive: false` for `-i`). Same shape as Claude Code's `Grep`.
Does NOT count as a `read_file` — search is for finding things, not for
claiming you've read them.

Roadmap:

- **Level 1 (shipped):** literal substring search. Cheap, deterministic,
  works offline.
- **Level 2 (future):** semantic / RAG search. Higher cost, requires
  embeddings infrastructure. Will ship as a separate tool name (e.g.
  `semantic_search`) rather than overloading `grep_files`, so the model
  picks the cost tier explicitly.

---

> **Planning** tools (fundamental)

### `::todo_write`

Plan and track work. Pass the complete list of todos every call — the
prior list is replaced wholesale. Mirrors Claude Code's `TodoWrite`.

```json
{
  "todos": [
    {
      "content": "Add a star", // imperative
      "activeForm": "Adding a star", // present continuous
      "status": "in_progress" // pending | in_progress | completed
    }
  ]
}
```

- **Exactly one `in_progress` at a time.** Enforced socially by the
  prompt; the visible list makes drift obvious.
- **No batched updates.** The model should update as it works.
- **Replace-all.** No per-item ops; the whole list is the input.

Use it when the work is non-trivial (multiple edits, exploration,
anything you'd break into steps). Skip it for one-shot edits.

Implementation:
[`packages/grida-agent-tools/src/todos/`](https://github.com/gridaco/grida/tree/main/packages/grida-agent-tools/src/todos).

---

> **Tool discovery** tools (fundamental) — _PROPOSED, not yet implemented_

### `::tool_search` _(proposed)_

As the toolkit grows — more fundamentals, per-env tools (canvas, future
text-editor, future video timeline), custom MCP servers — the model
can't reasonably hold every tool's full schema in its working context.
We need a discovery mechanism that lets the model find tools by intent.

Mirrors Claude Code's `ToolSearch`: deferred tool schemas live in a
catalog; the model queries the catalog by name or by keyword, and the
host returns the matching tools' full schemas inline. The model then
calls those tools normally.

**Two-level design:**

| Level   | Search type          | Cost            | When                                                                           |
| ------- | -------------------- | --------------- | ------------------------------------------------------------------------------ |
| Level 1 | Text / token match   | Zero            | Default. Substring + ranked keyword match on tool name + description.          |
| Level 2 | Semantic / embedding | Cheap, non-zero | Optional fallback when text match is empty. Embeddings over tool descriptions. |

The model picks the level via a hint (`mode: "literal" | "semantic"`),
default `literal`. Level 2 is invoked only on miss, keeping the typical
path zero-cost.

**Sketch of the surface:**

```ts
tool_search({
  // Pick one shape:
  query: "send slack message",         // free-text intent
  // or
  select: ["Read", "Edit", "Grep"],    // exact tool names
  max_results?: 5,
})
→ {
  tools: [
    { name: "slack_post_message", description: "...", schema: {...} },
    ...
  ]
}
```

**Why we want this:**

- Tool surface is going to grow fast: agent-fs (5) + agent-todos (1) +
  canvas tools (15+) + future env tools + user-installed MCP servers.
  Sending every schema with every request burns context for no reason.
- Deferred schemas keep the system prompt small. Only tool _names_
  ship in the always-present catalog; full schemas materialize on
  demand.
- Aligns with how Claude Code itself handles MCP discovery — the model
  already knows this pattern.

**Open questions** (decide before implementing):

- Where does the tool catalog live? Static manifest per host (cheap,
  rebuild on tool changes) vs. a runtime registry (live updates).
- Who decides which tools are "always on" vs. "deferred"? Probably:
  fundamentals always on, env tools always on for their env, MCP tools
  deferred by default.
- Level 2 embeddings — on-device (transformers.js) vs. a cheap remote
  endpoint? Latency vs. infra cost tradeoff.

Tracked status: **proposed**. No implementation yet; the four other
fundamentals + canvas tools are enough that we haven't felt the pinch.
When we add a second env (e.g. agent surface for the form builder) or
the first MCP integration, this becomes the next thing to ship.

---

## What lives where

- `packages/grida-agent-tools/src/fs/` — filesystem fundamentals
  ([README](https://github.com/gridaco/grida/blob/main/packages/grida-agent-tools/src/fs/README.md))
- `packages/grida-agent-tools/src/todos/` — planning fundamentals
  ([README](https://github.com/gridaco/grida/blob/main/packages/grida-agent-tools/src/todos/README.md))
- `packages/grida-agent-tools/src/tool-search/` — _not yet created; see proposal above_
- `editor/grida-canvas-hosted/ai/tools/` — canvas tools (the existing
  `canvas-use` collection); see
  [`tools-canvas.md`](./tools-canvas.md) for the catalog.

## Adding a new fundamental tool

Bar: would every agent want this, regardless of env? If yes, it's
fundamental. Examples that pass the bar: filesystem, planning, tool
discovery, time/clock, env metadata. Examples that fail: anything
canvas-specific, anything network-bound (those are MCP or per-env).

Process:

1. Drop it in `packages/grida-agent-tools/src/<name>/` with its own README, class,
   AI-SDK tool schema, and pure-logic tests.
2. Add a row to the Categories table above.
3. Add a `::<name>` section under the right category.
4. If it's vfs-only (only needed because we lack shell), mark it so —
   the host can then drop it when shell is available.
