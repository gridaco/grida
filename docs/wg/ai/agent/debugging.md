---
title: Debugging
description: The developer experience contract. A canonical inspection format every implementor exposes, the export paths a session can be read through, what the inspection tool exposes, replay semantics, and the DX checklist a conforming implementation passes.
keywords:
  [
    agent-system,
    debugging,
    inspection,
    canonical-format,
    replay,
    export,
    jsonl,
    dx,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Debugging

A developer MUST be able to **read a real chat session** — see what
the model did, what it tried, what it failed, and tune prompts and
tools from there. This page specifies the contract for that
visibility.

The goal: a session that ran somewhere can be reproduced, inspected,
or diffed somewhere else with the tools an engineer already has.

## The canonical format

A session SHALL be expressible in a canonical JSON shape every
inspection tool can read. Implementors who pick SQLite as their
backing store also commit to the
[three-table schema](./persistency.md#the-three-table-schema) being
directly queryable. Implementors who pick a different engine MUST
translate to the canonical shape on export.

### The shape

```jsonc
{
  "session": "<chat_sessions row>", // session table row, JSON-encoded
  "messages": [
    {
      "message": "<chat_messages row>",
      "parts": ["<chat_parts row>", "..."], // ordered by `index`
    },
  ],
}
```

`chat_parts.data_json` carries the **full AI SDK part** verbatim. The
inspection tool sees exactly what the recorder saw.

### Export formats

A conforming implementation MUST expose at least one non-DB export
path. The recommended floor is **JSONL** — it is the diffable,
greppable shape, and it round-trips through standard tools.

| Format                 | Description                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite DB**          | Live inspection. `sqlite3 sessions.db` works; no export step.                                                                                                   |
| **JSONL**              | One message-with-parts per line. Streams into log analyzers; trivially `grep`able.                                                                              |
| **JSON**               | One session per file. Friendly to inspect-a-session debuggers.                                                                                                  |
| **CSV**                | One row per part. Useful for token / cost histograms. Lossy on tool input/output.                                                                               |
| **ACP JSON-RPC trace** | Captured `session/update` / `session/request_permission` / `fs/*` / `terminal/*` traffic. Useful for editor-side reproduction. See [ACP integration](./acp.md). |
| **Direct DB query**    | `SELECT * FROM chat_parts WHERE session_id = ? ORDER BY index` — the rawest path.                                                                               |

### JSONL format

The recommended export format. One JSON object per line:

```jsonl
{"type":"session","data":{<chat_sessions row>}}
{"type":"message","data":{<chat_messages row>}}
{"type":"part","data":{<chat_parts row>}}
{"type":"part","data":{<chat_parts row>}}
{"type":"message","data":{<chat_messages row>}}
{"type":"part","data":{<chat_parts row>}}
…
```

Order: `session` row first, then `message`s in `created_at` order,
each followed by its `parts` in `index` order. A line per row. The
`type` field discriminates.

`jq` reads it without ceremony:

```sh
cat session.jsonl | jq 'select(.type=="part") | .data.tool_state'
cat session.jsonl | jq 'select(.type=="message" and .data.role=="assistant") | .data.metadata_json | fromjson'
```

## What the inspection tool MUST expose

A developer inspecting a session typically needs:

1. **A turn-by-turn timeline** — each user message, each assistant
   message, each tool call (input + output), each part.
2. **Per-turn token counts** — `input`, `output`, `reasoning`,
   `cache_read`, `cache_write`.
3. **Per-turn cost** — when populated.
4. **The system prompt at each turn** — see
   [System prompt persistence](#system-prompt-persistence).
5. **The model + variant + temperature used per turn** —
   `chat_messages.metadata_json.model`.
6. **The tool catalog at each turn** — which tools were available,
   which were called.
7. **The session's permission state** — the rules that were active
   when each tool call fired.

### System prompt persistence

The full assembled system prompt at each turn IS the missing piece
in most agent systems. Without it, "why did the model do X?"
becomes guesswork.

The recommended discipline:

- Compute a SHA-256 digest of the assembled system prompt before
  each turn.
- Store the digest on `chat_messages.metadata_json.system_prompt_digest`
  for every assistant message.
- Store the **full prompt body** in a separate `system_prompts`
  table keyed by digest. Two prompts with the same digest dedupe.

Cost: an extra table, one digest per assistant turn. Payoff: every
turn is reproducible from `(digest, message history, tool catalog,
model)`.

Implementors that skip this MUST document the loss.

## Replay

A session is **replay-eligible** if the canonical format carries
enough to re-run it:

- Original user message parts (text, file-refs, attachments).
- Original model + variant per turn.
- Original assembled system prompt per turn (or its digest +
  resolvable lookup).
- Original tool catalog (the implementations are the host's
  responsibility — a 2024-Jan tool implementation does not survive
  forever).

Replay is a debugging tool, not a feature. The guide does NOT require
**deterministic** replay (LLMs are not deterministic). It requires
the **inputs** to be reconstructible.

### What replay can answer

- "Why did the model call this tool here?" — re-run with verbose
  logging on the same turn.
- "Does the new system prompt produce the same output?" — re-run
  with the new prompt; diff the outputs.
- "Did this tool error reproduce?" — re-run the call with the same
  input.

### What replay cannot answer

- "Does this exact text re-generate?" — no; sampling is stochastic.
- "Does the same wall-clock time elapse?" — no.
- "Does the model call the same tools in the same order?" — usually
  not exactly.

## Diffing two sessions

A useful debugging primitive: given two sessions that started from
the same point but diverged (e.g. before and after a prompt change),
show what differed.

A conforming inspection tool SHOULD support:

- Side-by-side rendering of two sessions, aligned by turn index.
- Per-turn diff of the model output text.
- Per-turn diff of the tool calls (which tools, with which inputs).
- Per-turn diff of the system prompt (when the digest changed).

Implementations vary; the **canonical format** supports it because
both sessions are addressable as JSON.

## Developer experience checklist

A conforming implementation MUST pass:

- [ ] `sqlite3 sessions.db` (or the engine's equivalent) opens the
      store and the three tables are inspectable.
- [ ] One non-DB export path exists (JSONL recommended).
- [ ] Per-turn token breakdown is visible (input / output / reasoning
      / cache_read / cache_write).
- [ ] The system prompt assembled per turn is either persisted in
      full or reproducible from a digest + the manifest + skill index + project context.
- [ ] An aborted run leaves a truthful partial state (text where it
      stopped; tool calls frozen in their last observed state).
- [ ] A client reload mid-stream does NOT cancel the upstream model
      call (the resume layer works).
- [ ] A rewind-to-user-message + edit + resend works without losing
      the rewound history (soft-hidden, not deleted).
- [ ] A fork from a message works and is queryable from the parent.
- [ ] The watchdog is reachable from the host's config (the
      `tool.before` hook).
- [ ] The session status (`busy` / `idle` / `retrying` / `error`) is
      queryable by an external observer.

If any of these is missing, the implementation is shipping a partial
guide. Fix it.

## Tracing

Distinct from inspection: a **trace** is a structured log emitted
during a run, consumed by an external observability system
(OpenTelemetry, a logs sink, a tracing backend).

A conforming implementation SHOULD emit:

| Span                  | Attributes                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `session.run`         | `session_id`, `agent`, `model_id`, `provider_id`                          |
| `session.turn`        | `turn_index`, `tokens`, `duration_ms`, `stop_reason`                      |
| `tool.call`           | `tool_id`, `tool_call_id`, `duration_ms`, `truncated`, `error?`           |
| `compaction.run`      | `session_id`, `summarized_message_count`, `input_tokens`, `output_tokens` |
| `permission.evaluate` | `tool_id`, `pattern`, `action`, `source` (manifest / session / project)   |

The shape is not normative — host observability is host territory.
The list above is the recommended floor.

## What this guide does not specify

- **A prompt-engineering tool.** The guide persists what was sent;
  authoring prompts is the host's UX, not a core service.
- **A test framework for agents.** The canonical format lets a host
  build one; the guide does not ship it.
- **A multi-session replay engine.** Replay is single-session,
  best-effort. Cross-session replay is host territory.
- **A workflow recorder.** The canonical format captures what
  happened; turning it into a reusable workflow is a layer above.
- **A tracing protocol.** Use OpenTelemetry or any other standard
  the host runs; the guide does not invent one.

## See also

- [Persistency](./persistency.md) — the schema the canonical format
  projects.
- [Session Lifecycle](./session.md) — what the streaming layer
  produces.
- [ACP integration](./acp.md) — the JSON-RPC trace path.
- [UX Patterns](./ux.md) — the compositor's output shape that
  inspection consumes.
