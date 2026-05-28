# `@grida/agent-tools/fs`

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
  Reads and writes go through the binding; freshness comes from
  `binding.getVersion()`. The backend persists serialized snapshots; on
  `hydrate()` we feed them back via `binding.load(...)`.
- **Pure files.** Anything not mounted. Stored as `{content, version}`
  in memory; version starts at 0 and bumps per write. Persisted by the
  same backend.

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
  exists(path: string): boolean;
  read(path: string): AgentFs.ReadResult | null;
  write(
    path: string,
    content: string,
    expected_version: number | null
  ): AgentFs.WriteResult;
  edit(path: string, args: AgentFs.EditArgs): AgentFs.EditResult;
  grep(args: AgentFs.GrepArgs): AgentFs.GrepResult;
  delete(path: string): AgentFs.DeleteResult; // pure files only
}
```

All types (`AgentFs.Backend`, `AgentFs.LiveBinding`, `AgentFs.ReadResult`, the result discriminated unions, etc.) live under the `AgentFs` namespace — see the source for the full list.

## AI-SDK tools

`AgentFs.tools` is the AI-SDK tool table (four zod-schema'd defs plus `grep_files`). Name constants live alongside as `AgentFs.TOOL_NAMES`:

| Tool         | Operation                                                                                         | Claude Code parallel |
| ------------ | ------------------------------------------------------------------------------------------------- | -------------------- |
| `read_file`  | `{ path }` → `{ content, version }`                                                               | `Read`               |
| `edit_file`  | `{ path, old_string, new_string, replace_all?, version }` → match-and-replace                     | `Edit`               |
| `write_file` | `{ path, content, version? }` → full upsert; version-checked or permissive                        | `Write`              |
| `list_files` | `{}` → `{ files: string[] }` — flat enumeration                                                   | ~`Glob` (simpler)    |
| `grep_files` | `{ pattern, path_prefix?, case_sensitive? }` → `{ matches, files_scanned }`, mirrors `grep -n -F` | `Grep`               |

`AgentFs.resolveToolCall(fs, toolCall)` dispatches inbound calls. Hosts
plug it into `Chat.onToolCall`:

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
    read(path: string): Promise<string | null>;
    write(path: string, content: string): Promise<void>;
    delete(path: string): Promise<void>;
  }
}
```

## Safety contract

Every mutating op enforces these invariants:

| Precondition                                         | Failure       | Recovery                       |
| ---------------------------------------------------- | ------------- | ------------------------------ |
| `edit_file`: agent hasn't read this path yet         | `not_read`    | Read first                     |
| `edit_file` / version-checked `write`: stale version | `stale`       | Re-read, integrate, retry      |
| `edit_file`: `old_string` not in current content     | `not_found`   | Re-read, copy snippet verbatim |
| `edit_file`: matched N > 1, no `replace_all`         | `ambiguous`   | Add context to disambiguate    |
| `edit_file`: `old_string === new_string`             | `no_op`       | Pick a real change             |
| `binding.load(content)` throws                       | `parse_error` | Model fixes the content        |
| `write` with version on a missing path               | `not_found`   | Pass `version: null` to create |

`write(path, content, null)` is **permissive** — bypasses `not_read` and
`stale` entirely. Use only when the agent is genuinely starting fresh.
The host's prompt should discourage casual use.

## Match-and-replace (`edit_file`)

Conservative on purpose — closer to Claude Code's `Edit` than to aider's
diff fuzzing:

1. **Literal substring match.** Wins almost always when the agent copies
   the snippet from `read()`.
2. **Whitespace-normalized fallback.** Runs of whitespace collapse to a
   single space on both sides; indices map back to the original. Forgives
   doubled spaces between attributes and minor newline drift; does **not**
   enable attribute-order rewriting or semantic matching.
3. **Ambiguity rejection.** N > 1 matches without `replace_all` → reject
   with `reason: "ambiguous"` + the occurrence count.

Implementation: `findMatches()` in `internal/match.ts` (not part of the public surface — call `AgentFs.edit()` instead).

## Backends

| Backend                                    | Where it runs | Use                                              |
| ------------------------------------------ | ------------- | ------------------------------------------------ |
| `AgentFs.MemoryBackend`                    | anywhere      | Tests, SSR, fallback when no persistence         |
| `OpfsBackend` (subpath `/backends/opfs`)   | browser only  | The `/svg` demo and future canvas surfaces       |
| `NodeFsBackend` (subpath `/backends/node`) | Node          | Unit tests against a real tmp dir; future server |

All three implement `AgentFs.Backend`. `OpfsBackend` and `NodeFsBackend` live behind subpath imports so a bare `import "@grida/agent-tools/fs"` doesn't pull `window.navigator.storage` or `node:fs`.

```ts
import { OpfsBackend } from "@grida/agent-tools/fs/backends/opfs"; // browser
import { NodeFsBackend } from "@grida/agent-tools/fs/backends/node"; // server / tests
```

Backends are pure I/O — no caching, no debouncing, no version tracking.
The fs layer owns those.

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
pnpm --filter @grida/agent-tools test
```

## What this module deliberately is not

- **A general-purpose VFS layer.** No symlinks, no permissions, no mtime,
  no streaming. The agent surface is the only consumer.
- **A locking primitive.** Single-tab, single-process. Backends don't
  implement file locks; concurrent writers on the same path will race.
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
