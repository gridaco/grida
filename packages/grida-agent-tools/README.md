# `@grida/agent-tools`

Storage-agnostic runtime primitives for Grida AI agents. Pure logic,
no React, no LLM coupling. Tests run in Node — the filesystem backend
suite uses a real `os.tmpdir()` workspace.

## What's in the box

Two top-level symbols, each a class with a same-named TypeScript namespace that groups its types, AI-SDK tool table, dispatcher, and (for `AgentFs`) default in-process backend:

| Symbol                           | What it is                                                                |
| -------------------------------- | ------------------------------------------------------------------------- |
| `AgentFs` (class + namespace)    | Virtual filesystem facade with versioned reads + match-and-replace edits. |
| `AgentTodos` (class + namespace) | Replace-all plan / todo store the agent updates as it works.              |

Env-restricted backends live behind their own subpaths so a bare `import "@grida/agent-tools"` never pulls `navigator.storage` or `node:fs`. Both implement `AgentFs.Backend`:

| Subpath                               | What it exports                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `@grida/agent-tools`                  | `AgentFs`, `AgentTodos` (re-exports of the subpath classes — preferred entry).   |
| `@grida/agent-tools/fs`               | `AgentFs` (class + namespace) directly.                                          |
| `@grida/agent-tools/fs/backends/opfs` | `OpfsBackend`. **Browser-only** — keeps `navigator.storage` out of Node bundles. |
| `@grida/agent-tools/fs/backends/node` | `NodeFsBackend`. **Node-only** — keeps `node:fs` out of browser bundles.         |
| `@grida/agent-tools/todos`            | `AgentTodos` (class + namespace) directly.                                       |

Detailed contracts live in the per-module READMEs:

- [`src/fs/README.md`](./src/fs/README.md) — fs primitives, bindings, backends, match-and-replace contract, AI-SDK tools (`read_file` / `edit_file` / `write_file` / `list_files` / `grep_files`).
- [`src/todos/README.md`](./src/todos/README.md) — plan/todo store + `todo_write` tool.

## Why this exists

Every Grida AI agent — present (the `/svg` demo) and future (canvas
agent, server-side workers, possible MCP servers, possible desktop
agent) — needs the same set of low-level primitives:

- A virtual filesystem with versioned reads and match-and-replace edits.
- A plan/todo store the agent updates as it works.
- AI-SDK tool schemas that expose both to the LLM.

Co-locating them under one package keeps the contract auditable: there
is **one** definition of what `edit_file` does, one definition of how
ambiguity is rejected, one definition of how the staleness guard works.

## Design tenets

- **Class + namespace, never grab-bag exports.** The public surface
  is grouped under `AgentFs` and `AgentTodos`. Adding a third top-level
  symbol is a deliberate design break (and the public-API guard test
  enforces it).
- **Storage-agnostic signatures.** `read_file({ path })` has the same
  shape against `AgentFs.MemoryBackend`, `OpfsBackend`, `NodeFsBackend`,
  or a future remote backend. Backends change; the tool surface doesn't.
- **No React.** Class-based, observable via `subscribe(cb)`. Hosts wire
  `useSyncExternalStore` themselves.
- **No LLM in tests.** Everything is unit-testable in Node, including
  the real-filesystem backend.
- **Mirror proven shapes.** `read_file`/`edit_file`/`write_file`/
  `list_files`/`grep_files` mirror Claude Code's `Read`/`Edit`/`Write`/
  `Glob`/`Grep`. `todo_write` mirrors `TodoWrite`. The model already
  knows these shapes.
- **YAGNI.** Two modules (`fs`, `todos`) is enough for today. Future
  additions (tool discovery, etc.) slot in as new subdirs when shipped.

## Dependencies

| Kind           | Packages                         | Why                                                                  |
| -------------- | -------------------------------- | -------------------------------------------------------------------- |
| `dependencies` | _(none)_                         | Keep the runtime surface minimal.                                    |
| `peerDeps`     | `ai >= 6`, `zod >= 4`            | The fs / todos `index.ts` modules use them. Hosts already have them. |
| `devDeps`      | `vitest`, `typescript`, `tsdown` | Tests + build.                                                       |

## Usage shape

```ts
import { AgentFs, AgentTodos } from "@grida/agent-tools";
import { OpfsBackend } from "@grida/agent-tools/fs/backends/opfs";
import {
  Chat,
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

const fs = new AgentFs(
  OpfsBackend.isSupported()
    ? new OpfsBackend(["my-app", "v1"])
    : new AgentFs.MemoryBackend()
);
fs.mount("/canvas.svg", myEditorBinding); // myEditorBinding: AgentFs.LiveBinding
await fs.hydrate();

const todos = new AgentTodos();

const chat = new Chat({
  transport: new DefaultChatTransport({ api: "/api/agent" }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  onToolCall: ({ toolCall }) => {
    const output =
      AgentFs.resolveToolCall(fs, toolCall) ??
      AgentTodos.resolveToolCall(todos, toolCall);
    if (output === undefined) return;
    chat.addToolResult({
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      output,
    });
  },
});
```

Server-side agent definitions compose both tool tables:

```ts
import { AgentFs, AgentTodos } from "@grida/agent-tools";
import { ToolLoopAgent } from "ai";

const tools = { ...AgentFs.tools, ...AgentTodos.tools } as const;

const agent = new ToolLoopAgent({ model, instructions, tools, ... });
```

## Testing

```sh
pnpm --filter @grida/agent-tools test
```

All tests run in Node. The Node backend tests create a fresh
`os.tmpdir()` directory per test and clean up afterwards.

## Status

Private package, version `0.0.0`. The first consumer is `editor/` (the
`/svg` demo). When a second consumer appears or we decide to publish,
we'll flip `"private": false` and bump to `0.1.0`.
