---
title: Compositor
description: User intent representation. The multipart user-message shape, file and directory references vs attachments, inline commands, mentions, editor context, attachment handling, and the lowering rules that turn what the user composes into what the model sees.
keywords:
  [
    agent-system,
    compositor,
    prompt,
    user-message,
    multipart,
    file-ref,
    directory-ref,
    folder-drop,
    attachments,
    mentions,
    commands,
    editor-context,
    templating,
    lowering,
    provider-native,
    multimodal,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Compositor

The **compositor** is the layer where the user's intent is composed
and lowered into a structured message the model can read. The surface
varies — a rich web editor, a TUI prompt, a CLI flag, a voice
transcription, a chat input embedded in an IDE — but the shape on the
wire is the same.

This page is not "UI/UX." It is the **representation of user intent**:
the parts a user message MAY carry, the non-arguable defaults for how
each part is handled, and the rules for lowering what the user sees
to what the model sees. The principle the rest of the doc rests on:

> **Structure preserves information.** Flattening a user message into
> a string loses what the model can use to act correctly. Keep the
> message multipart; let the model see the intent, not a transcript.

The compositor and the [editor context](#editor-context) sit on the
same vocabulary; UX patterns that ride on top (queued sends, sidecar,
memory) live in [`ux`](./ux.md).

## The user message shape

A user message is a **structured multipart object**, not a string:

```ts
{
  role: "user",
  parts: [
    { type: "text",            text: "look at this svg and the spec" },
    { type: "file-ref",        ref: { kind: "path", path: "designs/icon.svg" } },
    { type: "directory-ref",   ref: { kind: "scope", id: "dir_…", name: "reference-material" } },
    { type: "file-attachment", data: "<base64>", mime: "image/png", name: "screenshot.png" },
    { type: "command",         id: "/search", args: { query: "icon set" } },
    { type: "mention",         target: { kind: "skill", name: "canvas-docs-svg-kit" } },
    { type: "editor-context",  kind: "selection", payload: { /* host-shaped */ } }
  ]
}
```

The compositor MAY emit any subset. The order matters: parts are read
in sequence. The model sees a structured input — except where the
[lowering rules](#templating-user-view-vs-model-view) say a part
collapses, resolves out, or becomes a provider-native block.

## File references, directory references, and file attachments

Three distinct shapes, deliberately:

| Shape             | Body location                             | Use when                                                                                                             |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `file-ref`        | Path / URL / content-id; body NOT inlined | The file is in an already-authorized scope; the agent reads it via `read` or `web_fetch` when it needs the contents. |
| `directory-ref`   | Host-bound scope; descendants NOT copied  | The user grants the session bounded access to an existing directory tree without making it the working directory.    |
| `file-attachment` | Inline bytes (base64 or binary)           | The model has multi-modal capability and should see a copied file's bytes directly.                                  |

For files, the host MAY map the same drag-and-drop gesture to either
`file-ref` or `file-attachment`. A code-agent host typically prefers
"drag = file-ref" (preserves the agent's tool-driven reading flow). A
design-agent host typically prefers "drag image = attachment" (the
model sees the image directly). A directory drop always produces a
`directory-ref`.

### File-ref with range

A `file-ref` MAY carry a byte- or line-range:

```ts
{
  type: "file-ref",
  ref: {
    kind: "path",
    path: "src/lib/foo.ts",
    range: { start: 10, end: 25 }
  }
}
```

A range-carrying file-ref is the de-facto standard for "the user
selected this code." The lowering layer inlines only the selected
lines, not the whole file. Editor surfaces that already speak the
file path / line range (IDEs, code editors) SHOULD use this shape
rather than [editor context](#editor-context).

### Directory references

A directory is never a `file-attachment`. Recursively copying a
directory into attachment storage or [scratch](./scratch.md) changes
its identity, duplicates durable user data, and turns an access grant
into an import. A compositor instead represents the selected tree as
a `directory-ref`:

```ts
{
  type: "directory-ref",
  ref: {
    kind: "scope",
    id: "dir_…",
    name: "reference-material"
  }
}
```

The `id` is an opaque reference to a host-held scope. It is neither an
absolute path nor a transferable bearer credential. `name` is display
metadata and MUST NOT participate in authorization. The persisted part
records the user's intent to reference the directory; the host-held
scope is the authority that makes the reference usable.

The acquisition and authority rules are:

- **An explicit trusted gesture mints the scope.** Dropping a directory
  from the operating system, selecting it in a native picker, or granting
  a browser-mediated directory capability counts as affirmative read
  authorization for that tree. Text that merely looks like a local path
  does not.
- **The selected tree is exact.** The host resolves the selected root
  without expanding it to a repository, parent directory, or sibling
  tree. Every access through the reference MUST be containment-checked
  at operation time; symlinks and path aliases MUST NOT widen the
  scope.
- **The default grant is read-only and session-scoped.** It remains
  subject to the host's sensitive-read denies. The gesture does not add
  the directory to writable roots and does not change the session's
  working directory.
- **Contents are discovered lazily.** The model receives a compact,
  tool-addressable descriptor. It lists, searches, and reads descendants
  through filesystem tools as needed; the compositor MUST NOT enumerate
  the whole tree, inline its contents, or seed it into scratch.
- **Existing authority is reused.** A directory already inside an
  authorized workspace is represented against that workspace rather
  than minting an overlapping external scope.

Attaching a directory and working in a directory are different user
intents. Promoting the reference to a workspace, or otherwise granting
write access, requires a separate explicit action. Under the
[directory-rooted execution](./foundations.md#directory-rooted-execution)
model, making it the working root starts a new session; a host that
supports additional writable roots MUST still obtain a distinct write
grant. The original drop alone is never sufficient write authority.

The part MAY survive in the transcript after its scope is revoked,
unavailable, or moved. In that state the compositor renders an
unavailable reference and the runtime fails closed. Resuming the same
session MAY re-establish its session grant; replaying the message into a
new session or fork MUST NOT create authority from the persisted part
alone. See [permission scopes](./session.md#permission-scopes).

### Multi-modal handling

Attached images, PDFs, audio, video go to the model as
**provider-native multi-modal parts**. The agent system shells them
through; the provider adapter re-encodes if needed. The model sees
them in the format its provider supports — Anthropic's image block,
OpenAI's `image_url`, etc.

### Binary the model does not understand

A user attaches a `.psd`. The model has no native PSD support. The
compositor MUST NOT inline raw bytes the model cannot use; instead
it emits a descriptor part:

```ts
{ type: "file-attachment", name: "design.psd", mime: "image/vnd.adobe.photoshop", size: 12000000 }
```

The model sees the descriptor, not the bytes. A tool the host wires
up (`psd_to_png`, shipped as MCP or agent-specific) can convert if
the model decides it needs to.

## Inline commands

A command (`/search foo`, `/fork this chat`, `/compact now`) is
**not** a string the model parses out of prose. It is a part with a
distinct type. The compositor MUST resolve commands at submission
time into one of:

| Outcome                                                            | When                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| A direct host action executed before the message reaches the model | Commands that compact, fork, archive — the model never sees them.                                                    |
| A structured user-input part the model can act on                  | Commands that supply a query or a hint the model uses (e.g. `/search` becomes a `text` part + a search-intent flag). |
| A pass-through `text` part with the original `/foo args` body      | Commands the host does not recognize. Forward-compatible.                                                            |

The compositor knows the command catalog; the model does not need
to. The catalog includes:

- Built-in commands the host ships (`/fork`, `/compact`, `/archive`, `/rewind`).
- Project-config commands the user defines.
- MCP-server-published commands (prompt templates).
- Skill-bound commands (a skill MAY expose a slash trigger).

The de-facto pattern is that **slash commands never appear in the
model's input as literals**. They either execute host-side and emit
their result as a normal part, or they expand to plain text /
structured parts at submission time. The model never sees `/foo`.

### Command templates and argument substitution

User-defined, MCP-prompt-template, and skill-bound commands often
ship as a **template body** with substitution slots: the user types
`/review src/foo.ts critical`, the template body expands with `$1` →
`src/foo.ts` and `$2` → `critical` (or `$ARGUMENTS` for the full
trailing string). The expanded body is what lands as a `text` part
in the user message; the literal `/review` never reaches the model.

The de-facto syntax is positional + aggregate:

| Token         | Substitutes with                             |
| ------------- | -------------------------------------------- |
| `$1`, `$2`, … | The Nth whitespace-separated argument.       |
| `$ARGUMENTS`  | Everything after the command name, verbatim. |
| `$@`          | Synonym for `$ARGUMENTS` in some hosts.      |

The exact syntax is implementor's choice — named slots
(`${name}`), Mustache-style (`{{name}}`), or another convention all
qualify — but positional + aggregate is the most portable and the
one users have learned from shell.

A command template with no template body and no arguments is a
plain action trigger (e.g. `/compact`). The compositor still
resolves it; it just has nothing to substitute.

## Mentions

`@skill:canvas-docs-svg-kit` or `@file:src/lib/foo.ts` in the
compositor becomes a `mention` part the model reads but is not forced
to act on. Mentions are **suggestions** the user gives the model
without bending the loop.

A mention to a **skill** is a special case: the model never sees the
literal `@skill:...`. Instead, the compositor records the intent in
the persisted user message (for the inspector / replay), and the
skill body lands in context via the normal
[`skill` tool](./skills.md) flow. This keeps the model's input clean
and avoids two paths for "the same skill."

A mention to a **file** lowers to a file-ref. A mention to a **doc
identifier** (a symbol, a node, an entity the host knows) lowers to
an [editor-context](#editor-context) part with `kind: "ref"`.

## Editor context

The compositor captures what the user composes. **Editor context**
covers what the host contributes on the user's behalf — selections,
open documents, cursor position, recent actions — whatever the user
is currently _touching_ in the editor that the agent should be aware
of without the user retyping it.

This is a sibling of the compositor's text input: the user types
prose; the host emits state. Both feed the same multipart user
message.

### Why this is in the protocol

A useful agent in an editor surface knows what the user is looking
at. Without it, the user has to paste, describe, or re-state the
editor's state every turn — the surface might as well be a generic
chat box. With it, "make this red" or "fix this" is meaningful
because _this_ resolves.

The host already knows the current state. The protocol's job is to
give that state a standard shape, persistable as part of the user
message, that any conforming agent can read.

### Host categories

The flavor of editor context varies by host. Three rough categories,
with examples and the context shapes each typically emits:

| Category                 | Examples                                                          | Typical context shapes                                                                                                         |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Text (code / prose)      | IDE, code editor, document editor                                 | Selected range (often a [file-ref with range](#file-ref-with-range)), current file + cursor position, open tabs, recent edits. |
| Image (design / spatial) | Canvas, image editor, video / timeline editor                     | Selected node(s), current frame or timeline range, viewport, last action.                                                      |
| Graph (large workspace)  | Multi-file IDE, knowledge base, note-graph, large-document editor | Currently open document(s), recent files, the active subtree, related entities.                                                |

The boundaries blur — a code IDE with a file-tree sidebar is both
text and graph. The categories are about which context shapes are
typical, not which host is allowed to use which.

### The part shape

Editor context arrives in user messages as parts of type
`editor-context`:

```ts
{
  type: "editor-context",
  kind: string,          // discriminator: "selection", "open", "viewport", "history", "last-action", "ref", …
  source?: string,       // which editor surface emitted it (panel id, document id, …)
  payload: object,       // host-defined; opaque to the loop
  emitted_at: int,       // epoch ms — when the host sampled this
}
```

The `payload` is **opaque to the loop** — its shape is the host's
business, the way it is for [`mention`](#mentions) targets. The model
sees the part; tools the host or the agent's manifest wires up can
act on it. The runtime does not validate payloads beyond presence.

A single user message MAY include multiple `editor-context` parts —
one selection plus the list of open files plus a recent-action
descriptor — and they read in order.

### How context lands in a user message

Three patterns, all host policy (not protocol):

| Pattern            | Trigger                                             | When to use                                                                                       |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Automatic          | Host injects on every user message                  | Cost of inclusion is low and the agent almost always benefits (e.g. "selection" in a design app). |
| Explicit action    | User clicks "send with selection" / drags into chat | Inclusion is a deliberate choice and would otherwise inflate the message.                         |
| Compositor mention | User types `@selection` / `@open` / `@history`      | The user wants to compose a specific subset of context.                                           |

Mentions follow the same shape as the compositor's [`mention`](#mentions)
parts — a `@<kind>` token resolves at submit time into one or more
`editor-context` parts. A host MAY pre-register a default mention
catalog (`@selection`, `@open`, `@cursor`, `@last`) and let agents or
skills extend it.

### Copy-paste as reference

A common pattern is "copy this element, paste into chat" — the user
expects the pasted block to behave like a reference, not as inline
text or a screenshot. The compositor MAY model paste-of-an-entity as
an `editor-context` part with `kind: "ref"` (the host's identifier
for the entity) rather than inlining the entity's bytes or text.

This makes the paste cheap (a string id, not the entity's body) and
keeps the model honest — it must call a tool to read the entity if
it needs the contents. The same path serves drag-and-drop of an
entity into the compositor.

### Relationship to other parts

- **vs `file-ref`** — `file-ref` is the path / URL / content-id of a
  _file in the workspace_. `editor-context` covers in-editor entities
  that aren't files (a canvas node, a timeline range that isn't a
  file slice, a code symbol the IDE resolves), plus ambient state
  (cursor, viewport, last action). When the editor state IS a file
  range, prefer [file-ref with range](#file-ref-with-range).
- **vs `mention`** — a `mention` is a user-driven suggestion; the
  model is not forced to act on it. `editor-context` is a host-driven
  description; the model can treat it as authoritative ("this is what
  the user is currently doing").
- **vs Memory** ([`ux / memory`](./ux.md#memory)) — Memory is
  **durable** across turns and sessions. Editor context is
  **ephemeral** — a snapshot at the moment of the user's message.
- **vs skills / `/` commands** — a `/` command invokes a host action
  or scope. Editor context describes state, not actions.

## Attachments — the long tail

The compositor MUST handle, at minimum, the following attachment
classes:

| Class          | Default treatment                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Text           | Inlined as text part if small (< host threshold); path-ref otherwise.                                               |
| Image          | Multi-modal part if the provider supports it; descriptor + a [`view_image`](./vision.md) perception path otherwise. |
| PDF            | Multi-modal part if supported; PDF-to-text tool route otherwise.                                                    |
| Audio          | Multi-modal where supported; transcription tool route otherwise.                                                    |
| Video          | Multi-modal where supported; descriptor + frame-extractor tool otherwise.                                           |
| Binary unknown | Always a path-ref or descriptor, never inlined. The model sees a name, mime, size.                                  |
| Directory      | Always a `directory-ref`; never recursively copied, archived, or staged into scratch by implication.                |

The agent always has a fallback path. Any attachment the model
cannot read directly SHOULD still be reachable through `read` or
`bash` (for shell-level inspection). The host's job is to ensure the
fallback exists.

For the deeper treatment — provider-native multimodal shortcuts
(PDF on Anthropic / Gemini, video / audio on Gemini), the
skill-per-format convention, shell-based conversion, the format
matrix (zip / pptx / psd / fig / …), and the scratch-space pattern
for archive extraction — see [`binary`](./binary.md).

### Attachment storage

Inlined attachments (`base64` in the part's `data_json`) inflate the
DB fast. A conforming implementation SHOULD apply a threshold (e.g.
**1 MB per attachment**, **20 MB per session**) above which
attachments are split out to a sidecar blob store; the part carries
a content-id instead of the bytes. The schema MAY add a blobs table;
the threshold is host config.

## Templating: user view vs model view

The user sees one thing; the model sees another. The compositor is
the layer where this divergence is reconciled. There are two
intuitions worth correcting up front:

> "The model must see XML-ish wrappers like `<file path='…'>…</file>`
> or `<skill-invocation>…</skill-invocation>`."

It generally does **not**. The de-facto pattern is **structural, not
stringly-typed**: parts stay typed end-to-end and are lowered to
provider-native shapes at the final boundary. Wrappers exist only
where the model needs to discriminate state that has no native
representation.

> "Slash commands and mentions land in the model's input as
> literals."

They do **not**. Anything that can be resolved before the model
sees it, is. The model is presented with a clean, structured input;
the literal compositor tokens stay in the persisted user message
(for the inspector / replay) but never reach the prompt.

### The lowering rules

Per part type:

| Part              | User view (rich UI / TUI)                        | Persisted shape                                                  | Model view (after lowering)                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`            | Inline text                                      | `{ type: "text", text }`                                         | Text, verbatim.                                                                                                                                                                                                            |
| `file-ref`        | Chip / link with file name and optional `:lines` | `{ type: "file-ref", ref }`                                      | A tool-addressable descriptor by default. A range-carrying ref lowers only the selected range; a deliberately resolved image MAY become a provider-native image block. The model never sees the literal `@path`.           |
| `directory-ref`   | Folder chip / link                               | `{ type: "directory-ref", ref }`                                 | A compact descriptor naming the tool-addressable directory scope. Descendant contents are never inlined by lowering.                                                                                                       |
| `file-attachment` | Thumbnail or file chip                           | `{ type: "file-attachment", data, mime, name, … }`               | Provider-native multi-modal block when the provider supports the mime type; descriptor placeholder otherwise.                                                                                                              |
| `command`         | Resolved chip / palette result                   | `{ type: "command", id, args }`                                  | **Nothing** when the command is host-action-only. Otherwise the command's result lowered as text/file parts (e.g. `/read foo.ts` → the file's contents). The literal `/foo` is never sent.                                 |
| `mention` (skill) | Chip / pill in the input                         | `{ type: "mention", target }`                                    | **Nothing** in the user message; the [skill body](./skills.md) loads via the normal `skill` tool flow.                                                                                                                     |
| `mention` (file)  | Same                                             | Same                                                             | Lowered as a `file-ref` (and from there per the file-ref row).                                                                                                                                                             |
| `mention` (other) | Same                                             | Same                                                             | Lowered as an `editor-context` part if it resolves to an entity; otherwise dropped.                                                                                                                                        |
| `editor-context`  | Chip / collapsible / inline-quote                | `{ type: "editor-context", kind, source?, payload, emitted_at }` | A structured-text block the model can discriminate. **Default**: `<editor_context kind="..." source="...">payload-as-text</editor_context>`. Implementors MAY substitute, but the marker SHOULD be stable for portability. |

### The lowering chain

```text
compositor part   ──┐
                    │
  (persistence)     ├─►  chat_parts row (typed, JSON in data_json)
                    │
  (turn fires)      ├─►  in-memory typed part (rehydrated from data_json)
                    │
  (provider adapter)└─►  provider message (provider-native multimodal blocks)
                            ↑
                            └─ this is where text-or-multimodal lowering happens
```

The first three stages keep the part typed and structured. The
provider adapter is the **only** stage that produces a flattened
shape the model literally consumes. Implementors MAY add stages
(host-side rendering for the rich UI, ACP `session/update`
projection for an external client) but those stages MUST NOT mutate
the typed part or its order.

### Why structural

Three reasons:

- **Resolved-out invariants survive refactor.** When the model never
  sees `/foo` or `@skill:bar`, you can rename a slash command or
  add a new mention kind without disturbing the in-flight model
  output. If those tokens were in the model's prompt, every
  rename would be a prompt-engineering exercise.
- **Multimodal is provider-shaped, not text-shaped.** Wrapping an
  image in `<image …>` for the model is strictly worse than the
  provider's native block — it costs tokens, breaks vision routing,
  and forces every provider adapter to parse a custom syntax.
- **Inspection and replay want types.** The persisted part is the
  durable record; the inspector renders the types; replay re-emits
  the same shape. Stringly-typed prompt assembly fights all three.

### When implementors substitute the default

The lowering rules are normative defaults for portability — two
conforming agents lowering the same compositor parts will produce
prompts the same model can act on consistently. An implementor MAY
substitute when:

- A target provider has no native multimodal: lower images to
  descriptors with a [`view_image`](./vision.md) perception-tool path.
- An editor surface has a richer convention the agent's manifest
  declares: the manifest's tool catalog can include a custom
  lowering function as long as the persisted part shape stays
  conformant.
- The host ships a tool that consumes `editor-context` directly:
  in that case, the model does not need a text-block lowering;
  the tool reads the typed payload.

Substitution that changes the persisted part shape — renaming the
`type` field, mutating `kind` — is **not** conformant and breaks
inspector / replay.

## Versioning the user message shape

Part types are an **evolving vocabulary**. The user message shape
MUST carry a version field on the message metadata so a future
reader degrades gracefully:

```ts
metadata: { schema_version: 1, … }
```

Migration discipline:

- A new part type lands without a version bump if the type is
  additive (older readers ignore unknown types and render them as
  text with the part's text content if present, or a "unsupported
  part" placeholder otherwise).
- A breaking shape change (a part field renamed) bumps the version
  and requires either a migration that rewrites historical rows or
  a read-time adapter that translates v1 parts to v2 on the way
  out of the DB.

The guide recommends the **read-time adapter**. The DB is the
long-term record; rewriting it on every schema change is the wrong
cost.

## Implementor checklist

A conforming compositor MUST:

- Emit user messages as structured multipart objects.
- Distinguish `file-ref` from `file-attachment`.
- Represent a referenced directory as a bounded `directory-ref`, never
  as recursively copied attachment or scratch data.
- Treat a directory drop or reference as session-scoped read authority only;
  require a separate explicit grant for workspace or write authority.
- Carry a byte- or line-range on `file-ref` when the user's selection
  is a slice of a file.
- Resolve commands at submission time; never let the model parse a
  literal `/foo` out of prose.
- Resolve skill mentions before the model sees them; the skill body
  loads via the [`skill` tool](./skills.md), not via a string
  wrapper.
- Emit ephemeral editor state (selection on non-file entities, open
  documents, recent actions) as `editor-context` parts rather than
  inlining it into the user's text.
- Carry a schema version on user message metadata.
- Lower attachments to provider-native multimodal blocks at the
  provider boundary; fall back to descriptor parts when the model
  has no native support.
- Persist user messages **before** they reach the model.

## What this guide does not specify

- **The compositor's UI.** Textarea, palette, voice, gesture, CLI
  flag — all conformant.
- **A command palette UI.** How the host surfaces the catalog is the
  host's choice.
- **The shape of each `editor-context` `kind`'s payload.** Host
  territory; the protocol unifies the envelope, not the payload.
- **When the host samples editor state.** At submit time, at compose
  time, both, or none — host policy.
- **Which contexts an agent should default to.** Manifest territory.
- **The exact text rendering of `editor-context` in the model view.**
  The default marker is recommended for portability, but a richer
  lowering (e.g. a tool the model calls to read the payload) is a
  valid substitute.

## See also

- [UX Patterns](./ux.md) — queued sends, sidecar forks, memory,
  the patterns that ride on top of the compositor.
- [Skills](./skills.md) — how skill bodies actually enter context
  (not via mention strings).
- [Tools](./tools.md) — the `read`, `web_fetch`, and host-supplied
  tools the compositor's refs flow into.
- [Persistency](./persistency.md) — how the persisted user message
  is stored (`data_json` carries the typed part verbatim).
- [Session Lifecycle](./session.md) — what happens after the
  compositor's submission: the turn fires, the lowering chain runs.
- [Debugging](./debugging.md) — the canonical inspection format
  that records what the compositor emitted, at every stage.
