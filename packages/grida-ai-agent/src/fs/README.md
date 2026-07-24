# `@grida/agent/fs`

A real-fs-shaped facade for AI agents to read, edit, write, and list
files — either against live state (editors, doc models) or pure storage
(notes, sketches, scratch). Content-agnostic, multi-file, pluggable
persistence backend. No React, no LLM coupling, fully testable in Node.

This is a **fundamental tool** in the sense
[`docs/wg/ai/grida/tools-fundamentals.md`](../../../../docs/wg/ai/grida/tools-fundamentals.md)
uses the term (binding the locked-tool RFC at
[`docs/wg/ai/agent/tools.md`](../../../../docs/wg/ai/agent/tools.md)):
always available, applicable to any agent (chat, canvas, server-side),
zero-cost, no sandbox required.

The tool **signatures are storage-agnostic** — `read_file("/x.md")`
makes the same sense whether the backing store is `MemoryBackend`,
`OpfsBackend` (browser), `NodeFsBackend` (server / tests), or a future
remote backend. What changes across environments is the backend, not
the API the model sees. The fs tools also stay relevant when an agent
gains shell access — `edit_file`'s match-and-replace contract is safer
than `sed`, structured outputs are cheaper than shell stdout, and
permissions can be scoped per-tool. This mirrors Claude Code, which
ships `Read` / `Edit` / `Write` / `Glob` / `Grep` _alongside_ `Bash`.

This module exists because the SVG agent's `AgentVFS` was a single-file,
single-binding, SVG-shaped class. As soon as you imagine a second use site
— a markdown notes agent, a multi-document canvas, a server-side worker
— that shape stops working. `agent-fs` is what falls out when you remove
those assumptions.

## Mental model

The fs is a flat map from `string` → file. Paths are absolute, start with
`/`, and use `/` as separator regardless of host OS. Two file shapes
share the API:

- **Bound files.** `fs.mount(path, binding)` ties a path to an
  `AgentFs.LiveBinding` — anything with `serialize()` / `load()` / `getVersion()`.
  Reads and writes go through the binding. Its host-owned version remains an
  internal concurrency/event primitive for direct callers; it is not exposed to
  the model. The backend persists serialized snapshots; on `hydrate()` we feed
  them back via `binding.load(...)`.
- **Pure files.** Anything not mounted. Stored as `{content, version}`
  in memory; the version starts at 0 and bumps per in-process mutation. It is
  internal bookkeeping, not durable across reconstructed `AgentFs` instances
  and never model authorization. Content is persisted by the same backend.

The fs **never inspects bytes**. Formatting, parsing, schema validation
are the binding's concern.

## API

```ts
class AgentFs {
  constructor(backend: AgentFs.Backend, opts?: AgentFs.Options);

  // Mounting
  mount(path: string, binding: AgentFs.LiveBinding): void;
  unmount(path: string): void;

  // Persistence lifecycle
  hydrate(): Promise<void>;
  dispose(): void;

  // Watch
  watch(listener: AgentFs.Listener): () => void;

  // File ops
  list(): string[];
  list_directory(args?: AgentFs.ListArgs): AgentFs.ListResult;
  list_directory_fresh(args?: AgentFs.ListArgs): Promise<AgentFs.ListResult>;
  exists(path: string): boolean;
  read(path: string): AgentFs.ReadResult | null;
  read_fresh(path: string): Promise<AgentFs.ReadResult | null>;
  write(path: string, args: AgentFs.WriteArgs): AgentFs.WriteResult;
  write_fresh(
    path: string,
    args: AgentFs.WriteArgs
  ): Promise<AgentFs.WriteResult>;
  edit(
    path: string,
    args: AgentFs.EditArgs,
    options?: AgentFs.EditOptions
  ): AgentFs.EditResult;
  edit_fresh(
    path: string,
    args: AgentFs.EditArgs,
    options?: AgentFs.EditOptions
  ): Promise<AgentFs.EditResult>;
  grep(args: AgentFs.GrepArgs): AgentFs.GrepResult;
  grep_fresh(args: AgentFs.GrepArgs): Promise<AgentFs.GrepResult>;
  delete(path: string): AgentFs.DeleteResult; // pure files only
}
```

All types (`AgentFs.Backend`, `AgentFs.LiveBinding`, `AgentFs.ReadResult`, the result discriminated unions, etc.) live under the `AgentFs` namespace — see the source for the full list.

## AI-SDK tools

`AgentFs.tools` is the AI-SDK tool table (four zod-schema'd defs plus `grep_files`). Name constants live alongside as `AgentFs.TOOL_NAMES`:

| Tool         | Operation                                                                                                 | Claude Code parallel |
| ------------ | --------------------------------------------------------------------------------------------------------- | -------------------- |
| `read_file`  | `{ path }` → `{ content }`                                                                                | `Read`               |
| `edit_file`  | `{ path, old_string, new_string, replace_all? }` → current-content match-and-replace                      | `Edit`               |
| `write_file` | `{ path, content }` → full-file upsert                                                                    | `Write`              |
| `list_files` | `{ path?, offset?, limit? }` → `{ path, folders, files, truncated, next_offset? }` — direct children only | ~`Glob` (scoped)     |
| `grep_files` | `{ pattern, path_prefix?, case_sensitive? }` → `{ matches, files_scanned }`, mirrors `grep -n -F`         | `Grep`               |

`list_files` is directory discovery, not a repository inventory. It
defaults to `/`, returns sorted absolute child paths grouped into
`folders` and `files`, and marks pagination with `truncated` /
`next_offset`. Keep the tool for VFS / OPFS / memory-backed agents
that may not have shell search. In a shell-capable real-fs profile,
prefer explicit command/search tools for broad discovery (`rg --files`,
`find`, `ls`, `tree`) rather than teaching the model to trust a flat
index.

`AgentFs.resolveToolCall(fs, toolCall)` dispatches inbound calls synchronously
against live bindings or the hydrated VFS map. Use
`AgentFs.resolveToolCallAsync(fs, toolCall)` on server-bound real-fs agents. It
reads current backend content for every `read_file` / `edit_file`, awaits
mutation persistence, uses optimistic conflict detection for edits when the
backend exposes a paired revision primitive, and uses scoped directory/search
operations instead of trusting the hydrate index.

Client-resolved VFS hosts plug the sync resolver into `Chat.onToolCall`:

```ts
const chat = new Chat({
  transport: ...,
  onToolCall: ({ toolCall }) => {
    const output = AgentFs.resolveToolCall(fs, toolCall);
    if (output === undefined) return; // not one of ours
    chat.addToolResult({
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      output,
    });
  },
});
```

Server-bound toolsets use the async resolver through `createToolset`.
`read_file`, `edit_file`, `write_file`, and `run_command` share
`AgentFs.runExclusive`, a FIFO that preserves registration order when AI SDK
executes tool calls concurrently. A successful server `write_file` is therefore
persisted before a later edit, read, or command starts.

```ts
namespace AgentFs {
  interface LiveBinding {
    serialize(): string;
    load(content: string): void;
    getVersion(): number;
    subscribe?(cb: () => void): () => void; // optional, for auto-flush
  }

  interface Backend {
    list(): Promise<string[]>;
    list_directory?(path: string): Promise<AgentFs.ListEntries>;
    read(path: string): Promise<string | null>;
    // Implement both revision methods, or neither.
    readWithRevision?(
      path: string
    ): Promise<AgentFs.BackendReadWithRevisionResult | null>;
    write(path: string, content: string): Promise<void>;
    writeIfRevision?(
      path: string,
      content: string,
      revision: string
    ): Promise<AgentFs.BackendWriteIfRevisionResult>;
    delete(path: string): Promise<void>;
  }
}
```

## Safety contract

The model-facing contract has no prior-read ledger and no ephemeral version
tokens. `edit_file` establishes its own precondition by loading current content
during the invocation and locating `old_string`. A successful `write_file`
therefore provides a valid baseline for an immediate edit; pausing or
reconstructing the runtime does not create an artificial read requirement.
All three model-facing text tools share a 1 MiB UTF-8 bound. An oversized read,
write, or edit returns `too_large`; a write never reports success for content
that a reconstructed fs cannot edit.

| Condition                                                | Failure                   | Recovery                                  |
| -------------------------------------------------------- | ------------------------- | ----------------------------------------- |
| `edit_file`: path is absent                              | `not_found`               | Create it or choose the correct path      |
| `edit_file`: `old_string` is absent from current content | `not_found`               | Read current content, reconcile, retry    |
| `edit_file`: matched N > 1 without `replace_all`         | `ambiguous`               | Add surrounding context                   |
| `edit_file`: backend revision conflict detected          | `stale`                   | Re-read current content, reconcile, retry |
| `edit_file`: `old_string === new_string`                 | `no_op`                   | Pick a real change                        |
| text content exceeds the shared 1 MiB UTF-8 bound        | `too_large`               | Use shell/streaming or split the artifact |
| `binding.load(content)` throws                           | `parse_error`             | Fix the content                           |
| backend read/write rejects                               | `io_error`                | Resolve storage failure, then retry       |
| host mutation policy rejects the path                    | `protected` / `read_only` | Use an authorized surface                 |

`write_file` is a deliberate last-writer-wins full-file upsert. It creates or
overwrites; targeted existing-file changes belong in `edit_file`. The internal
`AgentFs.write({ expected_version })` API remains for host/live-binding callers,
but that numeric version is not part of the model tool.

## Match-and-replace (`edit_file`)

Conservative on purpose — the supplied text is the proof that the mutation
still applies:

1. **Operation-time content.** The synchronous resolver uses the current live
   binding/cache; the server resolver rereads the backend for the invocation.
2. **Literal substring match.** Wins almost always when the agent copies the
   snippet from `read_file` or from content it just wrote.
3. **Whitespace-normalized fallback.** Runs of whitespace collapse to a
   single space on both sides; indices map back to the original. Forgives
   doubled spaces between attributes and minor newline drift; does **not**
   enable attribute-order rewriting or semantic matching.
4. **Ambiguity rejection.** N > 1 matches without `replace_all` → reject
   with `reason: "ambiguous"` + the occurrence count.
5. **Optimistic publication when available.** The workspace backend pairs the
   read with an opaque content revision and rejects a detected conflict. This
   reduces the read-to-publish race; it does not claim a cross-process lock.

Implementation: `findMatches()` in `internal/match.ts` (not part of the public surface — call `AgentFs.edit()` instead).

## Backends

| Backend                                    | Where it runs | Use                                        |
| ------------------------------------------ | ------------- | ------------------------------------------ |
| `AgentFs.MemoryBackend`                    | anywhere      | Tests, SSR, fallback when no persistence   |
| `OpfsBackend` (subpath `/backends/opfs`)   | browser only  | The `/svg` demo and future canvas surfaces |
| `NodeFsBackend` (subpath `/backends/node`) | Node          | Standalone disk-backed tools and tests     |
| `WorkspaceAgentFsBackend`                  | Node host     | Opened agent workspaces                    |

Each implements `AgentFs.Backend`. `OpfsBackend` and `NodeFsBackend` live behind subpath imports so a bare `import "@grida/agent/fs"` doesn't pull `window.navigator.storage` or `node:fs`.

```ts
import { OpfsBackend } from "@grida/agent/fs/backends/opfs"; // browser
import { NodeFsBackend } from "@grida/agent/fs/backends/node"; // server / tests
```

Backends are pure I/O — no caching or debouncing. A backend MAY expose the
`readWithRevision` / `writeIfRevision` pair for optimistic publication.
`WorkspaceAgentFsBackend` maps that opaque revision to the daemon's mtime
precondition and atomic replace; memory/OPFS fall back to an immediate read and
awaited write inside the in-process FIFO.

## Single-file demos

The SVG demo's "the canvas is at `/canvas.svg`" constraint lives in **two
thin places**: the binding's `serialize()` does SVG pretty-printing, and
the system prompt tells the model the path. The fs and tools have no
notion of a "primary file" — multi-file demos just mount more paths and
the agent is told about them.

## Testing

Pure logic, runs in Node:

- `fs.test.ts` covers the matcher, `MemoryBackend`, and the fs against
  `MemoryBackend` — one file, grouped by `describe` block.
- `backends/node.test.ts` covers `NodeFsBackend` against a real
  `os.tmpdir()` workspace (created with `fs.mkdtemp`, cleaned up
  `afterEach`).
- `backends/opfs.ts` has no test — browser-only. Verify via the `/svg`
  demo.

Run from the repo root:

```sh
pnpm --filter @grida/agent test
```

## What this module deliberately is not

- **A general-purpose VFS layer.** No symlinks, no permissions, no mtime,
  no streaming. The agent surface is the only consumer; text tools are capped
  at 1 MiB UTF-8.
- **A cross-process lock.** Server-bound operations and commands serialize
  within one `AgentFs`. The workspace backend additionally performs best-effort
  optimistic conflict detection between edit validation and publication, but
  independent processes are not globally locked and full-file `write_file`
  remains last-writer-wins.
- **An IR / format module.** Bytes are opaque to the fs. SVG pretty-
  printing happens in the binding; markdown linting (if added) would
  too.
- **An LLM client.** Tools have no `execute()`; resolution is the host's
  job via `AgentFs.resolveToolCall`.

## FIXMEs before going beyond demo

- Per-path schema versioning + migration story (today: bump
  `OpfsBackend`'s root segment, orphan old data).
- Surface backend failures to the user (today: `console.warn`).
- Quarantine unparseable bytes (mirror canvas playground's
  `Handle.quarantine`).
- Atomic multi-file writes (today: each file flushes independently).
