# `@grida/agent-tools` changelog

The package evolves on its own branch. Every breaking change to the public API surface (the symbols exported from any of the `exports` map entry points) must land in this changelog so consumers can track what to update.

## Unreleased

### Public API redesign — class + namespace pattern

The package now exposes exactly two top-level symbols — `AgentFs` and `AgentTodos` — each a class with a same-named namespace. Everything that used to be a flat export from `@grida/agent-tools/fs` or `@grida/agent-tools/todos` is now grouped under one of those identifiers:

| Before (flat export)                   | After (member of namespace)                    |
| -------------------------------------- | ---------------------------------------------- |
| `AgentFsBackend`                       | `AgentFs.Backend`                              |
| `LiveBinding`                          | `AgentFs.LiveBinding`                          |
| `FsEvent`                              | `AgentFs.Event`                                |
| `FsListener`                           | `AgentFs.Listener`                             |
| `AgentFsOptions`                       | `AgentFs.Options`                              |
| `ReadResult`, `WriteResult`, …         | `AgentFs.ReadResult`, `AgentFs.WriteResult`, … |
| `MemoryBackend`                        | `AgentFs.MemoryBackend`                        |
| `tools` (or `fsTools`)                 | `AgentFs.tools`                                |
| `TOOL_NAMES` (or `FS_TOOL_NAMES`)      | `AgentFs.TOOL_NAMES`                           |
| `ToolName` (or `FsToolName`)           | `AgentFs.ToolName`                             |
| `AgentFsTools`                         | `AgentFs.Tools`                                |
| `resolveAgentFsToolCall`               | `AgentFs.resolveToolCall`                      |
| `Todo`, `TodoStatus`                   | `AgentTodos.Todo`, `AgentTodos.Status`         |
| `TodoWriteSuccess` (or `WriteSuccess`) | `AgentTodos.WriteSuccess`                      |
| `tools` (or `todoTools`)               | `AgentTodos.tools`                             |
| `TOOL_NAMES` (or `TODO_TOOL_NAMES`)    | `AgentTodos.TOOL_NAMES`                        |
| `ToolName` (or `TodoToolName`)         | `AgentTodos.ToolName`                          |
| `AgentTodosTools`                      | `AgentTodos.Tools`                             |
| `resolveAgentTodosToolCall`            | `AgentTodos.resolveToolCall`                   |

The root entry now re-exports only the two class+namespace symbols:

```ts
import { AgentFs, AgentTodos } from "@grida/agent-tools";
```

The previous `export * as fs / * as todos` namespace barrels are gone.

Env-restricted backends still live behind their own subpaths — they have to, because they reach for env-specific globals (`navigator.storage`, `node:fs`):

```ts
import { OpfsBackend } from "@grida/agent-tools/fs/backends/opfs";
import { NodeFsBackend } from "@grida/agent-tools/fs/backends/node";
```

Both implement `AgentFs.Backend`.

### Removed — internal helpers no longer exported

The match-and-replace helpers used by `AgentFs.edit()` were public but pure implementation detail. They have moved to `src/fs/internal/match.ts` and are no longer reachable from `@grida/agent-tools/fs`. Use `AgentFs.edit()` or the `edit_file` AI-SDK tool instead.

- `findMatches`
- `collapseWhitespace`
- `applyReplacements`

### Added

- `src/__public-api__.test.ts` — guard test that pins the shape of every public symbol, including:
  - That the root entry exposes exactly `AgentFs` and `AgentTodos` (adding a third is a deliberate design break).
  - That internal helpers are NOT re-exported under the namespaces.

## 0.0.0

Initial private release. Co-located with `feature/svg-editor` for the SVG agent demo. Public surface is the one documented in [`README.md`](./README.md).
