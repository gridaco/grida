---
title: Compositor
description: How a person's intent is represented and lowered. The structured parts of submitted input, references versus attachments and the routing policy between them, directory references, commands, mentions, editor context, attachment classes, and the rules that turn what a person composes into what the model receives.
keywords:
  [
    agent-system,
    compositor,
    prompt,
    user-input,
    structured-input,
    file-reference,
    directory-reference,
    attachments,
    mentions,
    commands,
    editor-context,
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

The **compositor** is where a person's intent is composed and lowered into input
the model can act on. Its surface varies — a rich editor, a terminal prompt, a
command-line flag, a protocol client — but the representation is the same. This
page defines that representation: the parts submitted input may carry, how each
is handled, and how what the person sees is lowered into what the model
receives. Interface behavior such as drafts and queued sends belongs to
[Experience](./experience.md).

> **Structure preserves information.** Flattening input into one string loses
> what the model needs to act correctly. Input stays structured until the last
> boundary before the provider.

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Input parts

Submitted input is an ordered sequence of typed parts. The compositor MAY emit
any subset; parts are read in order.

| Part                | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Text                | What the person typed.                                                                         |
| File reference      | A file in an already-authorized scope, optionally with a line or byte range. No body.          |
| Directory reference | A bounded, host-held scope over an existing directory tree. No descendants copied.             |
| File attachment     | Bytes or a provider-fetchable URL delivered directly, or a descriptor when that is impossible. |
| Command             | A resolved command the person selected, with its arguments.                                    |
| Mention             | A suggestion the person gives the model: a skill, a file, or another entity.                   |
| Editor context      | State the host contributes on the person's behalf: a selection, open documents, a viewport.    |

Accepting input persists these parts before any model request. The persisted
record keeps the person's composed intent for inspection and replay; lowering
produces the model's view from it without changing it.

## References and attachments

A **reference** points at something the agent reaches through tools under an
existing grant. An **attachment** delivers content directly. The same gesture —
a drop, a paste, a picker, a library item — can become either. A design surface
may prefer direct image attachments; a code surface may prefer references that
keep the agent's tool-driven reading flow.

### Resource routing policy

Attachment versus reference is a **routing decision**, not an intrinsic
property of a paste, drop, picker, or Library item. A conforming
compositor makes that decision once, before materialization, from four
separate inputs:

| Layer                 | Question it answers                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Representation facts  | What exists now: bytes, an agent-visible path, a URL, or a host-mintable handle?                                     |
| Preference policy     | Among legal routes, should this surface prefer a reference or a direct attachment?                                   |
| Consumer capabilities | Do the delivery encoder and active provider declare this MIME and representation? Is tool-visible scratch available? |
| Independent authority | May the host expose the referenced resource to this session, with what access?                                       |

The generating rule is: **describe the available representations,
evaluate the configured preferences in order, reject infeasible routes,
then materialize exactly one typed route**. A route may explicitly be
composite when one ingress body must serve two distinct consumers. For
example, a byte-backed raster can pair provider-native perception with a
byte-exact scratch copy for file operations. That is one declared
attachment route, not an attachment plus a source reference: scratch is
host materialization and grants no authority over the source location.
The two legs MUST carry an unambiguous shared identity or provider-part
index so duplicate names, transcoding, and asymmetric fallback cannot detach
the perceived image from its operable path.
User-interface cards are a view of the result; their incidental fields MUST
NOT be inspected later to rediscover whether the resource was an attachment
or a reference.

Preference is configurable because different agent surfaces have
different useful defaults. A design surface may prefer provider-native
image attachments, while a code agent may prefer live references. The
configuration changes preference only. It cannot manufacture a
representation, claim encoder or provider support, or grant filesystem
authority.

The following constraints override every preference configuration:

- A directory is reference-only. It cannot be routed as inline bytes or
  recursively copied to scratch.
- Copied bytes with no stable path, URL, or host capability cannot be
  described as a live reference. Clipboard image bytes therefore remain
  an attachment even under a reference-first policy.
- A reference route requires an independently authorized scope. Agent
  supervision or permission mode does not widen that scope.
- A provider-native attachment requires declared support from both the
  delivery encoder and the active provider for its MIME and representation
  (inline bytes or provider-fetchable URL). Exact MIME capabilities MUST be
  used when known. An implementation MUST NOT infer support beyond those
  declarations; a broad label such as “multimodal” does not by itself widen
  the accepted set.
- Scratch delivery is admitted against the final turn's aggregate byte, file,
  and path budget. Every seed source merged into that turn reserves capacity;
  an implementation SHOULD reject an impossible batch before reading all of
  its bodies and MUST keep the user's draft when final preflight fails. Under
  scarce capacity, resources with no surviving provider leg reserve scratch
  before optional scratch twins that can still fall back to perception only.
- A compositor that retains raw operable twins before submit MUST enforce a
  separate bounded draft-memory budget. Capacity under that stable bound may be
  reallocated when draft resources or turn reservations change; once it is
  exhausted, later rasters use an explicit provider-only fallback rather than
  accumulating unbounded retained raw byte bodies.
- One resource has one primary route. A compositor MUST NOT silently duplicate
  it as both attachment and reference, or silently switch to a semantically
  different route after materialization fails. A declared provider-and-scratch
  raster route counts as one route. When its scratch leg is unavailable or
  cannot fit the aggregate budget, provider-only is the fallback; when provider
  perception is unavailable, scratch-only is the fallback. The selected
  fallback MUST remain explicit in the routing result.

This separation keeps source provenance useful without making source
labels magical. A drop can carry evidence that a trusted host may mint a
scope; the word “drop” alone never grants access. Likewise, a Library URL
may be routed as a live URL reference, which the agent chooses whether to
fetch, or as a provider-native URL attachment, which the provider fetches as
part of direct delivery. The representation is the same; the selected route
and required capabilities differ, while the source adapter remains unchanged.

### Ranges

A file reference MAY carry a line or byte range. A ranged reference is the
standard shape for "the person selected this code": lowering includes only the
selected range. Surfaces that already speak in file paths and ranges SHOULD use
it rather than [editor context](#editor-context).

### Directory references

A directory is never an attachment. Copying a tree into attachment storage or
[scratch](./scratch.md) changes its identity, duplicates durable user data, and
turns an access grant into an import. A directory reference instead names an
opaque host-held scope. The scope identity is not a path and not a transferable
credential; its display name never participates in authorization. The
persisted part records the person's intent; the host-held scope is the
authority that makes it usable.

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
[directory-rooted execution](./components.md#files-workspaces-and-scratch)
model, making it the working root starts a new session; a host that
supports additional writable roots MUST still obtain a distinct write
grant. The original drop alone is never sufficient write authority.

The part MAY survive in the transcript after its scope is revoked,
unavailable, or moved. In that state the compositor renders an
unavailable reference and the runtime fails closed. Resuming the same
session MAY re-establish its session grant; replaying the message into a
new session or fork MUST NOT create authority from the persisted part
alone. See [permission scopes](./permissions.md).

### Content the model cannot read

Eligible images, documents, audio, and video MAY reach the model as
provider-native parts when the delivery encoder and the active provider both
declare support for the representation and type. Otherwise the compositor
lowers a descriptor — name, type, size — never raw bytes the model cannot use.
A conversion capability can produce a readable form when the agent decides it
needs one. [Binary files](./binary.md) owns that treatment.

## Commands

A command is a typed part, never a string the model parses out of prose. The
compositor resolves each command at submission into exactly one outcome:

| Outcome                        | When                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| A host action before the model | Commands that compact, fork, or change settings or conversation state. |
| Structured input for the model | Commands that supply a query, a mode, or another hint the model uses.  |
| Plain text                     | A command the host does not recognize, passed through unchanged.       |

The command catalog — built-in commands, project-defined commands, prompt
templates published by connected servers, and skill-bound commands — is known to
the compositor, not the model. Command templates substitute their arguments at
submission: positional arguments and the full trailing text are the portable
convention, though hosts MAY use named slots. The literal command never reaches
the model.

## Mentions

A mention is a suggestion the model reads but is not forced to act on.

- A **skill** mention is resolved before submission to the actual available
  skill, as [Experience / commands and skills](./experience.md#use-commands-and-select-skills)
  describes. The selected skill is applied through the
  [master's context policy](./master.md#context-and-tool-design); the model
  never sees the literal mention.
- A **file** mention lowers to a file reference.
- A mention of another known **entity** — a symbol, a canvas node, a document —
  lowers to an [editor context](#editor-context) reference.

## Editor context

Editor context is what the person is currently touching that the agent should
know without being told: a selection, the open documents, a cursor or viewport,
a recent action. The person types prose; the host contributes state. Both feed
the same submitted input. Without it, "make this red" has no referent.

| Host category           | Typical context                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Text (code, prose)      | Selected range (often a [ranged file reference](#ranges)), current file, open tabs. |
| Image (design, spatial) | Selected nodes, current frame or range, viewport, last action.                      |
| Graph (large workspace) | Open documents, recent files, the active subtree, related entities.                 |

Each editor context part carries a kind (selection, open, viewport, history,
last action, reference, …), the surface that emitted it, the time it was
sampled, and a host-defined payload. The host adapter validates the payload and
preserves its source and sample time. Content inside it keeps its original
trust: an observation of document text does not promote that text to
instructions. Tools validate their own inputs and authority independently.

Inclusion is host policy: automatic when inclusion is cheap and almost always
useful, an explicit action when it would inflate input, or a mention such as
`@selection` when the person wants a specific subset. Pasting or dragging a
known entity into the composer MAY become a reference to it rather than its
bytes, so the agent reads it through a tool when needed.

Editor context is a snapshot at submission. Durable memory across turns and
sessions is a separate concern ([Experience / keep useful results](./experience.md#keep-useful-results-and-history)).

## Attachments — the long tail

The compositor handles at least these classes:

| Class          | Default treatment                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Text           | Inline text when small; a reference otherwise.                                                                                                 |
| Image          | Provider-native when supported, plus a byte-exact scratch copy when scratch and its budget permit; a [perception tool](./vision.md) otherwise. |
| PDF            | Provider-native when supported; a text-extraction route otherwise.                                                                             |
| Audio          | Provider-native when supported; a transcription route otherwise.                                                                               |
| Video          | Provider-native when supported; a descriptor plus frame extraction otherwise.                                                                  |
| Unknown binary | Always a reference or descriptor; never inlined.                                                                                               |
| Directory      | Always a directory reference; never copied, archived, or staged into scratch by implication.                                                   |

Anything the model cannot read directly remains reachable through the agent's
file and conversion capabilities; the host ensures that fallback exists. Large
attachment bodies are stored by content identity outside the conversation
record rather than inline. [Binary files](./binary.md) covers formats,
conversion, and scratch extraction.

## Templating: user view vs model view

What the person sees and what the model receives differ, and the compositor
reconciles them. Two intuitions are wrong:

- The model does not need string wrappers around every file or skill. Parts stay
  typed end to end and are lowered to provider-native shapes at the final
  boundary. A text marker appears only where the model must distinguish state
  that has no native representation.
- Commands and mentions do not reach the model as literals. Anything resolvable
  before the model sees it is resolved.

| Part                | Person sees                         | Model receives                                                                                                                                  |
| ------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Text                | Text                                | Text, verbatim.                                                                                                                                 |
| File reference      | A chip with name and optional range | A tool-addressable descriptor; a ranged reference includes only its range; a deliberately resolved image MAY become a provider-native block.    |
| Directory reference | A folder chip                       | A compact descriptor of the tool-addressable scope; contents are never inlined.                                                                 |
| File attachment     | A thumbnail or file chip            | The routed provider-native block, the scratch descriptor, or the declared composite of both. One leg alone appears only as a recorded fallback. |
| Command             | A resolved chip                     | Nothing for a host action; otherwise its resolved result as text or file parts.                                                                 |
| Mention (skill)     | A chip                              | Nothing in the input; the selected skill applies through context policy.                                                                        |
| Mention (file)      | A chip                              | As a file reference.                                                                                                                            |
| Mention (other)     | A chip                              | As editor context when it resolves to an entity; otherwise dropped.                                                                             |
| Editor context      | A chip or quoted block              | A clearly delimited block the model can distinguish, with its kind and source, unless a tool consumes the typed payload directly.               |

Only the final provider boundary produces the flattened shape the model
consumes. Other projections — the client's rendering, a protocol client's
session updates — MUST NOT change the typed parts or their order.

Structure pays for itself three ways. Renaming a command or adding a mention
kind does not disturb the model's input. Provider-native media is cheaper and
better routed than text-wrapped media. Inspection and replay read typed parts
rather than reparsing assembled prompts.

An implementation MAY substitute a lowering — descriptors plus a perception tool
for a provider without native media, or a tool that reads editor context
directly — as long as the persisted parts are unchanged.

## Evolving the part vocabulary

Part kinds are an evolving vocabulary, and persisted input records its format
version. A new kind is additive: a reader that does not know it shows an
explicit unsupported-part placeholder rather than dropping it silently. A change
to an existing kind's meaning is a new format version, read only by a reader
that supports it.

## Conformance

A conforming compositor:

- submits structured, ordered parts and persists them before any model request;
- distinguishes references from attachments and routes each resource once,
  before materialization, under the routing policy above;
- represents a directory only as a bounded reference with session-scoped read
  authority, and requires a separate grant for workspace or write authority;
- carries a range on a file reference when the selection is a slice of a file;
- resolves commands and skill mentions before the model sees the input;
- emits ephemeral editor state as editor context rather than inlining it into
  the person's text;
- lowers attachments by their declared route, applies only recorded,
  capability-governed fallbacks, and correlates the legs of a composite route.

## Not specified here

- The composer's interface and how the command catalog is presented.
- The payload schema of each editor context kind, and when the host samples it.
- The exact text marker used to delimit editor context for the model.

## See also

- [Tools](./tools.md) — the capabilities references flow into.
- [Scratch](./scratch.md) — host materialization for attachments.
- [Workspaces](./workspace.md) — folder binding and authority.
