# `@grida/agent-tools/todos`

A tiny live store + AI-SDK tool for the agent's plan. Mirrors Claude
Code's `TodoWrite`.

This is a **fundamental tool** in the sense `docs/wg/feat-ai/tools.md`
uses the term: always available, applicable to any agent (chat,
canvas, server-side), zero-cost, no sandbox required.

## Why it exists

When an agent's work is non-trivial — multiple files, multiple steps,
exploration — both the agent and the user benefit from a shared,
visible plan. The plan should be:

- **Live** — updates as the agent works, not just at the start.
- **Replace-all** — the agent passes the whole list each call; no
  per-item ops, no merge logic, no stale-item drift.
- **Tiny** — three statuses, no metadata, no due-dates.

If you want long-lived TODOs (across sessions, across users), write a
markdown file with `@grida/agent-tools/fs` instead. That's the right tool for
that job.

## API

```ts
class AgentTodos {
  snapshot(): ReadonlyArray<AgentTodos.Todo>;
  write(todos: ReadonlyArray<AgentTodos.Todo>): AgentTodos.WriteSuccess;
  clear(): void;
  subscribe(cb: () => void): () => void;
}

namespace AgentTodos {
  type Status = "pending" | "in_progress" | "completed";

  type Todo = {
    content: string; // imperative: "Run tests"
    activeForm: string; // present continuous: "Running tests"
    status: Status;
  };

  type WriteSuccess = { ok: true; count: number; todos: ReadonlyArray<Todo> };
}
```

## Contract

- **Exactly one `in_progress` at a time.** Enforced socially by the
  system prompt, not the tool — the visible list makes drift obvious
  and the model self-corrects.
- **No batched updates.** The model should update the list as it
  works, not once at the end. That's the whole point of having it
  live.
- **Status transitions are pending → in_progress → completed.** No
  "blocked", "cancelled", "skipped" — keep the surface small. If a
  task is no longer relevant, remove it.
- **Replace-all on every call.** `write(todos)` is the only mutator;
  prior state is discarded entirely. There is no `add_todo` or
  `update_todo`.

## AI-SDK tool

`AgentTodos.tools` is the AI-SDK tool table (with `AgentTodos.TOOL_NAMES.todo_write`) — a single tool whose input is the full list:

```ts
todo_write({
  todos: [
    {
      content: "Audit /svg agent",
      activeForm: "Auditing /svg agent",
      status: "in_progress",
    },
    {
      content: "Add focus styles",
      activeForm: "Adding focus styles",
      status: "pending",
    },
  ],
});
```

Resolve via `AgentTodos.resolveToolCall(store, toolCall)` in
`chat.onToolCall`.

## Mirror of Claude Code's `TodoWrite`

| Claude Code  | This module  | Note                                  |
| ------------ | ------------ | ------------------------------------- |
| `TodoWrite`  | `todo_write` | snake-cased to match `read_file` etc. |
| `content`    | `content`    | same                                  |
| `activeForm` | `activeForm` | same                                  |
| `status`     | `status`     | same three values                     |

If you've used Claude Code, you already know how this works.

## Testing

Pure logic, no React, no LLM:

```sh
pnpm --filter @grida/agent-tools test
```

## What this module deliberately is not

- **Persistent.** Sessions are short-lived; the plan is a function of
  the current turn. Use `agent-fs` for durable lists.
- **A workflow engine.** No dependencies, no priorities, no due dates.
- **A renderer.** The host owns the UI — subscribe to the store and
  render with `useSyncExternalStore`.
