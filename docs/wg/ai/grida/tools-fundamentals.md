---
title: Embedded Agent Tool Proposal
description: The earlier Grida web-agent tool profile for embedded hosts with restricted or virtual file access.
keywords: [ai, tools, agent, filesystem, planning, grida, binding]
format: md
tags:
  - internal
  - wg
  - ai
  - grida
---

# Embedded Agent Tool Proposal

Grida's first web agent used explicit file tools because the host exposed
a virtual filesystem and had no system shell. This proposal preserves that
design for embedded environments where the host mediates file access,
such as a browser or a tightly scoped sandbox without command execution.

The [tool profile framework](../agent/tools.md#tool-profiles) gives
each host room to choose the operations it can support. Grida's shipping
agent runs in the native Desktop or headless host. The
[native tool-host contract](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/tool-host-contract.md)
describes its current inventory and permissions.

For canvas-specific tools (scene-graph search, specialized inserts,
canvas exec / lint / format, resource lookup), see
[`tools-canvas.md`](./tools-canvas.md). For image-generation tools,
see [`tools-image.md`](./tools-image.md).

## Embedded tool profile

Each tool exposes one operation the host can authorize and bound separately.
A structured read supplies edit context. A directory listing supplies names.
A text search supplies matching lines and their locations.

| Operation      | Tool          | Role                                                           |
| -------------- | ------------- | -------------------------------------------------------------- |
| Read text      | `read_file`   | Return bounded current text.                                   |
| Write text     | `write_file`  | Create a file or replace its full contents.                    |
| Edit text      | `edit_file`   | Replace a unique fragment of current content.                  |
| List files     | `list_files`  | List the direct children of a directory.                       |
| Search text    | `search_text` | Find a literal within readable files.                          |
| Track work     | `todo_write`  | Replace a list of tasks and their statuses.                    |
| Ask a question | `question`    | Request a reply from the person.                               |
| View an image  | `view_image`  | Return bounded pixels from an authorized source.               |
| Run a program  | Host-defined  | Optional when the host can grant command execution.            |
| Discover tools | `tool_search` | Proposed lookup when a catalog outgrows the available context. |

Task delegation, web search, web fetching, and skill discovery were outside
this proposed profile.

## Backends

The proposal uses the same `read_file({ path })` signature across file
backends. The host resolves the path within the scope it issued.

| Backend category    | Where                 | Use case                                                                          |
| ------------------- | --------------------- | --------------------------------------------------------------------------------- |
| In-process storage  | application memory    | Tests, scratch documents, ad-hoc agent runs.                                      |
| Browser storage     | browser origin        | Web environment (per [`agent/environments / web`](../agent/environments.md#web)). |
| Host-scoped storage | local host filesystem | File access through a host that mediates path operations.                         |
| Remote storage      | service boundary      | Multi-tenant cloud product surfaces.                                              |

A path can be **bound** to live state (an editor, a doc model) or
**pure** in-memory storage (notes, scratch). Both shapes share the API.

## Tool shapes

### `read_file`

Returns the file's current text content. Read is how the agent understands an
existing file and obtains exact edit context; it is not an authorization event.
The tool exposes no session-local freshness token to the model. Grida bounds
model-readable and model-mutable text files at 1 MiB of UTF-8; larger files
return `too_large`. A storage read failure returns `io_error`, never
`not_found`, so the agent cannot mistake an inaccessible existing file for a
safe path to recreate.

### `edit_file`

Match-and-replace edit. The default write path — cheap, safe, must
locate the change.

Each invocation loads current content and finds `old_string`. Where the storage
layer supports an optimistic publication precondition, a detected concurrent
change produces `stale` without clobbering the newer bytes. This narrows the
validation-to-publication gap; it is not a claim of cross-process atomicity. A
prior `read_file` is useful but not required: content from a successful
`write_file` is already valid edit context, including after a pause or resumed
run.

Matching: literal substring first, then a whitespace-normalized
fallback. Ambiguous matches reject unless `replace_all: true`. The
strategy is conservative on purpose: it tolerates whitespace drift, not semantic
or broadly fuzzy matches.

### `write_file`

Full-file upsert. It creates a missing path or replaces all content at an
existing path. The model-facing shape has no version argument: choosing this
tool is the explicit intent to perform a last-writer-wins wholesale write.
Targeted changes belong in `edit_file`.

Success means the full write has completed before the result returns.
Content above the shared 1 MiB text bound is rejected with `too_large`, so every
successful write can still be read and edited after a resumed run.

### File discovery and search

An embedded host that can only expose file operations uses these tools to
make reachable paths discoverable. A host with shell access can delegate
listing, file discovery, text search, and reads to commands in its granted
scope.

#### `list_files`

The earlier listing proposal returns the direct children of one directory
within the virtual filesystem. It sorts the entries and groups folders
separately from files. With no path, it lists the virtual workspace root.

```ts
list_files({
  path?: string,
  offset?: number,
  limit?: number,
}) -> {
  path: string,
  folders: string[],
  files: string[],
  truncated: boolean,
  next_offset?: number,
}
```

A partial listing reports truncation and the next offset when another page
is available. An indexed, bounded, or ignore-filtered backend reports the
limits on its coverage in the result. Filename patterns belong to a separate
path search operation. A listing returns names, while reads and text search
supply content.

#### `grep_files`

The earlier proposal called literal search `grep_files`. The tool taxonomy
later used `search_text` for this role. Literal search inspects readable
UTF-8 files in the selected scope and returns each matching file path, its
one-based line number, and the matched line. Like `grep -n -F`, it matches
case-sensitive fixed strings by default. The proposal uses
`case_sensitive: false` to request case-insensitive matching. A bounded result
reports partial coverage.

The proposal considered semantic search a separate follow-up, for example
`semantic_search`. Literal matching works offline with deterministic
results. A distinct semantic operation makes the added processing cost and
different result semantics visible when the caller chooses it.

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

### Optional command execution

An embedded host can expose command execution when it can enforce a
confinement boundary. The operation should describe whether it runs a
shell or spawns an allowlisted executable with structured arguments.
A command takes an explicit working directory within its granted scope.
Expose timeout and truncation so callers can recognize partial results.
[Execution authority](../agent/execution-authority.md#a4--raw-execution-is-capability-scoped-and-fail-closed)
owns the confinement requirement.

### `view_image` (Grida extension)

The proposal separates text from [visual perception](../agent/vision.md).
`read_file` returns text. `view_image` returns a raster image the model sees
as pixels.

```ts
view_image({ path }) →
  | { ok: true, mime, width?, height?, bytes, data /* base64 */ }
  | { ok: false, reason: "not_found" | "unsupported_type" | "too_large", message }
```

The earlier design assumed:

- **v1 = raster bitmaps** (`png` / `jpeg` / `webp` / `gif`), identified by
  magic bytes (never the extension). Rendering non-bitmap sources
  (svg / text / code → pixels) is the planned next step under this same
  tool name; the contract is shaped to absorb it without a rename.
- **Result-to-image lowering uses Strategy 1** ([`vision / lowering`](../agent/vision.md#result-to-image-lowering)):
  the tool result carries the base64 payload and the tool declares a
  model-output lowering to a media block, so the perception reproduces from
  the persisted result on every rebuild — no bespoke replay path.
- **Retention.** A stale `view_image` result drops its payload (lowering
  degrades to a naming descriptor); the bytes stay durable and the model
  re-views by calling the tool again. Pasted inline images are NOT
  auto-evicted (no re-view reference) — see
  [`vision / retention`](../agent/vision.md#retention-keep-recent-elide-old).
- **Capability.** Needs only `fs.read` over the path — the same read scope
  as `read_file`; `view_image` joins the registry only when the host wires a
  byte source, so the tool can see workspace images by path.
- **Known v1 gap.** A binary image is not yet surfaced by `list_files`
  (the text-hydrate skips it), so the agent perceives images the user
  **names by path**; autonomous discovery is a tracked follow-up.

This is an inspection operation. Image generation has its own
[tool proposal](./tools-image.md).

### `tool_search` (proposed)

A larger embedded catalog can provide a two-level lookup to keep full
schemas out of the default context.

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

## See also

- [Agent RFC / Tools](../agent/tools.md) — shared invocation contracts and host-selected profiles.
- [Agent RFC / Visual perception](../agent/vision.md) — the read/view split `view_image` binds.
- [Agent RFC / Environments](../agent/environments.md) — which capabilities each environment exposes.
- [Canvas Tools](./tools-canvas.md) — canvas-only tool surface.
- [Image Tools](./tools-image.md) — image-generation tool surface.
