# Native agent client protocol

The source-built native host implements **ACP first**, with negotiated
extensions for product behavior the selected version cannot express. This
document specifies the wire contract the native host serves to Desktop and other
ACP clients. The
[core binding](./rust-core.md#native-executable-and-headless-host)
owns process lifetime, and the [feature catalog](../../../docs/agent/features.md)
owns the promised behavior.

## Baseline and ownership

The host uses stable ACP v1 with Rust SDK `5.0.0` and schema `1.15.1`.
Review v2 separately before adding or replacing a wire
binding, including its changed prompt and replay semantics. Experimental
features require their own negotiation. [ACP migration](https://agentclientprotocol.com/protocol/v2/migration).

```text
Desktop / headless / other ACP client
  -> ACP requests and negotiated extensions
  -> grida-agent host adapter
  -> Sessions + Grida master + Runtime
  -> selected providers, tools, storage, and execution adapters
```

The host translates ACP into internal contracts. ACP schema types stay outside
the neutral core and its journals. The master keeps product strategy, and the
client owns rendering. The wire adapter projects authorized state without
introducing a second execution ledger.

The `grida-agent` ACP adapter uses the upstream SDK. A second
independently maintained consumer can justify extracting a reusable adapter.
The outward ACP server remains separate from an optional ACP client that
delegates work to an external agent. Choosing this client protocol leaves the
Grida master in charge of native execution.

The Grida profile advertises `sessionCapabilities.list` for standard v1
`session/list` with an explicit absolute workspace `cwd`. The host canonicalizes
that directory and reads the workspace's unarchived chats in newest-created
order. Pages contain at most 32 `SessionInfo` records with the ID, working
directory and optional title. When local turn timing is retained, a record also
has `_meta["co.grida/lastActivityAtMs"]`, an optional Unix-epoch millisecond
integer. For the local turn with the latest execution ordinal, it is the first
settlement time, or the start time until settlement. Sessions with no local turns omit
the field, including forks that only have inherited history. This is recorded
turn activity, not an exact last-message time; it never changes listing order.
Treat `nextCursor` as opaque and send it with
the same workspace.
Listing leaves attachment, execution, and history unchanged. [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list)

Negotiate `co.grida/session/organize` version 1 for archived listing and
catalog changes. `_co.grida/session/list-archived` accepts the standard
workspace and cursor fields and returns the standard page shape.
`_co.grida/session/catalog-entry` accepts an attached `sessionId` and
returns `sessionId`, `title`, `archived`, and `revision`, plus optional
`lastActivityAtMs` with the same retained-turn meaning as listing metadata.
`_co.grida/session/organize` replaces the title and archive state at that
revision. Send a null title to clear it. An already-matching value succeeds
without another write. On a revision conflict, read the current entry before
asking the user to reapply the edit. Archiving and restoring preserve chat
identity and leave execution controls unchanged.
Mutation receipts omit activity; read the entry or list again for that optional
observation. Activity is never accepted as a catalog mutation input.

Settings clients can negotiate `co.grida/settings/archive-catalog` version 1.
`_co.grida/settings/archive-catalog` takes an absolute workspace `cwd` and an
optional `cursor`, returning `{entries, nextCursor}`. Each entry has `sessionId`,
`title`, `revision`, and optional `lastActivityAtMs` with the same meaning and
omission rule. `_co.grida/settings/unarchive` takes `cwd`, `sessionId`
and the observed `revision`. It restores only catalog placement and preserves
the title. These operations need no attached session, provider, transcript read,
or execution lease. Workspace scope excludes side chats and named children.
A stale revision or another workspace's session is refused. The hidden native
`archive-catalog --state-dir <directory> --cwd <workspace>` command exposes the
same metadata-only operation for an existing closed store; `--unarchive <id>
--revision <revision>` restores an entry. An open store keeps its existing sole
owner, so a supervisor must use that owner's protocol rather than spawning a
second database owner.
Normal and detached listings read the same bounded retained timing projection
without decoding turn history, attaching a session, or starting work. Rename,
archive, restore and exact retries do not manufacture a new activity time.

On macOS and Linux, negotiate `co.grida/session/delete` version 1 on private
stdio. Send `_co.grida/session/delete` with `sessionId`, absolute workspace
`cwd`, a stable `requestId`, `expectedSessionRevision` from the session
snapshot, and `expectedCatalogRevision` from the catalog entry. A new
deletion requires an attachment. On success, the response identifies the
retired `sessionId` and `requestId`. The exact request can recover its receipt
after reconnecting without reattaching. The retired identity is unavailable
for future attachment or execution.

Deletion requires idle, resolved work and an empty queue. A concurrent
transcript replay or catalog read can require a retry. A pending wake-up, an
unfinished Goal, or unresolved execution evidence blocks deletion. Deletion
discards the chat's side chats and removes them from the connection. To include owned named subagents, negotiate
`co.grida/session/delete-preview` version 1 and call
`_co.grida/session/delete-preview` with the attached `sessionId` and `cwd`.
The response contains `sessionId`, `ownedChildren`, and `ownedChildrenBasis`,
a fingerprint written as 64 lowercase hexadecimal characters. Show the count for
review, then pass the unchanged basis as `expectedOwnedChildren` when deleting.
The host requires the reviewed membership and revisions, and all owned work
must be idle, resolved, and free of queued input. An older client without the
basis can delete eligible chats that have no named subagents.
The host removes verified chat-owned attachment and
working data before returning success. If the database commit outlives removal,
restarting the private host or retrying the exact request can complete removal.
Independent forks retain their own copied prefix. Workspace files and exported
copies have separate owners.

## Standard messages and custom UX

Use standard ACP for session setup, prompts, message/thought streams, tool
activity, plans, commands, permissions, and supported session configuration.
Optional capabilities are advertised only when their end-to-end behavior works.

| Experience                            | Data and responsibility                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Streaming answer and progress         | ACP message/thought content. Desktop decides grouping, reveal behavior, typography, and layout.                               |
| Tool cards, terminal views, and diffs | ACP tool identity, status, content, and locations. Client renderers choose their presentation.                                |
| Images, files, and generated results  | Standard content and resource references where representable. Specialized previews retain accessible fallback content.        |
| Plans and completion account          | Plan updates and ordinary assistant content. The master determines their meaning and wording.                                 |
| Model and effort controls             | Advertised session config selectors where their semantics fit. Product values and application timing remain master decisions. |
| Questions                             | Negotiated elicitation where supported. The master chooses waiting or steering. Components retain correlated interactions.    |

ACP supplies structured content and tool progress without prescribing visual
layout, so a client can build custom conversation, tool, and child views on
the same data. Views that depend on experimental protocol features do not by
themselves establish stable interoperability for every feature.
[ACP content](https://agentclientprotocol.com/protocol/v1/content),
[tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls),
[elicitation](https://agentclientprotocol.com/protocol/v1/elicitation).

The Grida client owns specialized renderers. It can use optional metadata for
result kinds, progress grouping, and known view hints. Streamed model content
and external metadata remain untrusted data. They cannot install executable
renderers or authorize an action. Required client actions use negotiated,
validated capabilities with correlated results and executor-declared recovery.

Tool inputs and structured results remain JSON data, including member names
such as `valueOf`, `toString` and `constructor`. Client change detection must
not invoke those members or depend on object-key insertion order. The
[Desktop controller regressions](../../../editor/lib/agent-chat/native-chat-controller.test.ts)
cover equivalent reordered payloads and changed input/nested result data.

## Small extension surface

The host uses ACP's reserved extension mechanism. Capability keys use
`co.grida/` and custom methods use `_co.grida/`. Descriptive hints belong
in schema-supported `_meta` fields.
Required behavior has an advertised operation and explicit result. Unknown
extensions produce a defined fallback or unavailable outcome.
[ACP extensions](https://agentclientprotocol.com/protocol/v1/extensibility).

| Capability family  | Additional semantics                                                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable sessions   | Identified acceptance, retry reconciliation, snapshots/cursors, queue and steering controls, verified pause/resume/settlement, history derivation, child-session controls. Product-owned goal payloads and host timer operations use these mechanisms. Reuse equivalent standard operations. |
| Host configuration | Typed persistent-default inspection, set/reset, revision checks, and reload. The [configuration binding](./rust-config.md) owns the field semantics.                                                                                                                                         |
| Client surfaces    | Resource access or editor actions missing from standard ACP, plus optional structured view data. Each action has a capability schema and required authority. The adapter preserves call and endpoint correlation. Domain fields follow the capability. Pure styling requires no operation.   |

These families group the extensions. None enables every listed action as one
broad capability: each supported operation and version is advertised
separately with a constrained target. Standard transcript and
tool content remain useful when a client omits the extensions. Grida Desktop
negotiates the operations needed for its complete experience.

### Connection replacement

The private supervisor may negotiate `co.grida/session/model-change` version 1.
`_co.grida/session/model-change` accepts optional `sessionId` and `prepare`.
Omitting `sessionId` inspects the whole owning store, including saved chats that
are not attached. A session-specific check requires an attached session.
Observation returns an optional `blocker`: `pending_work`, `active_turn`,
`retained_turn`, `queued_input`, `unresolved_goal`, `delegated_session`, or
`background_process`. `delegated_session` also covers temporary side chats,
whose data cannot be discarded by replacing the worker. It exposes no owner
fingerprint or credential and starts no provider work.

`prepare: true` is valid only without `sessionId`. If blocked, admission remains
open. If clear, the result is `{"prepared":true}` and native admission closes
atomically with the check. Existing observer reads remain available. Repeating
preparation preserves the prepared result. The supervisor closes the process
before opening the replacement; if that fails it reopens the previous connection
in a new process. Dropping an observational result grants no permission to close
a busy worker. An absent capability means unsupported: do not issue a speculative
method or substitute an account warning for that result.

Creation profiles remain provenance. Accepted current and queued work, Goal
continuations and delegated sessions validate their captured model and authority.
Mismatches report `session_active_route_changed`, `session_queued_route_changed`,
`session_goal_route_changed`, or `session_delegated_route_changed`. A new idle
input can deliberately capture another authorized connection and receives
portable visible history when model, capabilities, principal or scope differs.
Private continuation and reasoning never cross that transition.
An explicit Stop can locally finalize an exact already-cancelled retained turn
when its original connection is unavailable; that recovery starts no provider
or tool work and preserves uncertain attempts and spending holds. A Resume
still requires the captured connection. Resolve queued inputs and Goals before
preparing a replacement.

An exact Goal Start retry observes the original receipt and allocation even
when another connection is now selected. It cannot reserve a new budget or
rebind old attempts. Historical billing refresh remains restricted to each
attempt's captured Gateway scope; another scope sees it as unavailable while
the settled outcome and retained spending account remain readable.

### Durable chat selection

A private supervisor can negotiate `co.grida/session/selection` version 1.
Selection is product metadata independent of the session's immutable birth
configuration and of accepted execution settings. These operations never
activate a provider, recover a turn, or change queued or running work. An
absolute canonical workspace `cwd` scopes every operation; side chats and named
children cannot use this top-level setting surface. Session attachment is not
required for metadata inspection or mutation.

- `_co.grida/session/selection` takes `{cwd, sessionId}` and returns
  `{sessionId, revision, selection, legacy?}`. An absent record has revision 0
  and null selection. `legacy`, when recoverable, describes the newest retained
  accepted model, visible effort, and opaque principal/scope; it cannot identify
  a Desktop connection by model label or reconstruct an unsent preference.
  `matchesCurrent: true` is supplied only when its captured model and
  principal/scope exactly match the currently composed execution. It is absent
  in a providerless metadata host and is not an independent execution grant.
- `_co.grida/session/selection/update` takes `{cwd, sessionId,
expectedRevision, operationId, selection}`. A selection is `{connectionId,
model, effort}`: connection ID is a stable 64-character lowercase hex host
  reference or null for the workspace default; model is the wire model ID;
  effort is `low`, `medium`, `high`, `xhigh`, or `ultra`. Legacy `standard`
  normalizes to `medium`. The supervisor validates configured connection and
  model availability separately from worker readiness. A successful response
  is `{sessionId, operationId, revision, selection}`. An invalid selection or
  stale expected revision changes no metadata. Exact outstanding operation
  retries return the original receipt without moving the current head back.
- `_co.grida/session/selection/receipt` takes `{cwd, sessionId, operationId}`
  and returns `{status: "missing"}`, or `{status: "committed" | "retired",
receipt}`. Reading an older outcome does not reapply it. Retirement preserves
  unacknowledged outcomes so a supervisor can finish or cancel its own durable
  coordination intent without recreating the chat.
- `_co.grida/session/selection/ack` takes the same identity and returns null.
  Acknowledge only after the supervisor's dependent preference operation is
  durable or terminally canceled. The current head remains observable after
  acknowledgment; older acknowledged operations may no longer have receipts.
  The host bounds outstanding outcomes and refuses another change before
  discarding unresolved evidence.
- `_co.grida/session/selection/create` takes `{cwd, sessionId, requestId,
selection}` with stable supervisor-owned creation identities. It creates the
  session and initial selection and returns its selection receipt with
  `operationId: requestId` and revision 1. Reuse those identities and selection
  after a lost reply. This operation submits no input and creates no ACP
  attachment: follow it with ordinary `session/load` before sending. The first
  input needs its own stable identity for retry.

On fresh private `session/submit`, `session/enqueue`, or `goal/start` requests,
send `_meta: {"co.grida/selectionRevision": revision}` when using a persisted
selection. The revision must be positive. Admission checks it and the exact
effective model under the same gate as selection changes, and retains the
selected pair as provenance. The supervisor separately matches its active
connection to `connectionId`. An exact accepted-input retry observes its
original receipt before consulting newer chat settings. Historical inputs,
Goals, reviews and retries keep their original execution captures.

The native host persists versioned private selection records adjacent to its
database under the same exclusive process owner. This adds no SQLite schema
migration. Forks capture the source selection once at the fork action;
retries after source edits reuse that captured inheritance and never overwrite
later destination edits. Missing legacy records remain absent until explicit
initialization or selection.

For an existing closed store, the hidden `chat-selection --state-dir <dir>
--cwd <workspace> --session <id> --operation inspect|update|receipt|ack` command
provides the same providerless metadata operations. Inspect is the default.
Update supplies the complete update object through `--request-json`; receipt
and acknowledgment supply `{operationId}` with optional matching `cwd` and
`sessionId`. A live store must use its existing owner's protocol rather than
opening a second writer. The command never reads model credentials.

### Available durable session operations

The agent advertises each supported capability with value `1` in
`agentCapabilities._meta`. A client opts in to each operation by sending its
key with value `1` in `clientCapabilities._meta`. Calling an unnegotiated
extension returns method not found. Attach the session through standard
`session/new` or `session/load` before using its custom operations.

On private stdio, negotiate `co.grida/session/transcript-window` version 1
for a bounded transcript. Set that `_meta` key on `session/load` to `{kind: "attach"}`
to attach without replay. Read an attached chat with `{kind: "read", requestId}`
at the same `cwd`. Each response carries the same `requestId`, a `view`, and
an opaque `older` cursor at the same `_meta` key. Standard text chunks for
that response also carry the `requestId` in `_meta`.

Pass `older` as `before` in a new read to step backward until `older` is null.
The host delivers each page in chronological order. A page can contain no
visible messages and still have an older cursor. When a cursor's view or its
active-turn boundary changes, restart from the latest page. Reading starts
no work. `session/load` without this metadata retains full ACP replay.

Negotiate `co.grida/session/operating-regime` to send `operatingRegime` as
`plan` or `act` when submitting, enqueueing, starting a goal, or revising
history. The host captures the effective choice with the input. Omission uses
the launch default. A Plan launch refuses Act, and an exact retry cannot change
the accepted regime. Queue edits preserve Plan's narrower scope.

Negotiate `co.grida/session/turn-summary` to read one settled turn using an
attached `sessionId` and exact `turnId`. Its bounded text, typed outcome, tool
dispositions, unresolved count, and check statuses come from the retained
account. A missing summary uses the recorded terminal status as a fallback.

When a settled turn account records inference attempts, the summary may include
`tokenUsage`. Its `reported` array contains up to seven token categories
(`input`, `output`, `uncached_input`, `cached_input`, `cache_creation_input`,
`tool_input`, `reasoning_output`). Each row has `category`, `tokens` as an exact
decimal string, and `partial`. The host sums each category across distinct attempts
using its retained latest observation. Partial means at least one attempt
did not contribute to that category or supplied a non-final observation.
`attemptsWithoutCounts` is the number of attempts with no usable exact token
count. Categories can overlap. An explicit zero is a reported count, while an
absent category has no reported value in the projection.

Private stdio clients on macOS or Linux can also negotiate
`co.grida/session/artifacts` version 1. A settled turn summary then includes
`artifacts`, a list of up to eight recorded PNG crop results in operation ID
order. Each entry contains `id`, `kind` (`image`), `mimeType` (`image/png`),
`label`, `width`, `height`, and `bytes`. An entry describes a saved result. It
does not imply the bytes are still available.
When additional crop receipts exceed the list limit, `artifactsOmitted`
counts the records beyond the displayed list.

`_co.grida/session/read-artifact` takes the attached `sessionId`, exact `turnId`,
and `artifactId`. It returns `artifactId`, `mimeType`, and standard base64
`data` for up to 256 KiB of exact PNG bytes. Missing or replaced bytes return
`artifact_unavailable`. The operation reads existing state and never starts
inference or runs a tool.

Private stdio clients on macOS and Linux can separately negotiate
`co.grida/session/input-image` version 1, independently of the current model's
image-input support. `_co.grida/session/read-input-image` takes an attached
`sessionId`, exact recorded user `messageId`, and the `attachmentUri` from that
message's retained PNG resource link. It returns `messageId`, `attachmentUri`,
`mimeType: "image/png"`, and standard-base64 `data` for at most 256 KiB of the
original accepted PNG. The URI is an opaque transcript identity, not a path or
download URL.

Richer selected raster inputs use the separately negotiated
`co.grida/session/input-image-chunks` version 1 operation.
`_co.grida/session/read-input-image-chunk` takes the same three identities and
an `offset`, starting at zero. The response echoes those identities and offset,
with the original `mimeType`, `totalBytes`, standard-base64 `data` for at most
256 KiB, and `nextOffset` or `null`. Every nonzero offset must be a multiple of
256 KiB. Clients bound the declared total to 20 MiB, verify contiguous offsets,
stable MIME/total/identity, and assemble only a complete response. Each read
revalidates recorded selection and exact retained bytes. It neither reads the
original live source path nor changes model execution. The older PNG operation
does not return a derivative or a JPEG/WebP/GIF through its PNG contract.

Waiting inputs have a separate private capability,
`co.grida/session/queued-input-image-chunks` version 1. An attached client calls
`_co.grida/session/queued-message` with `sessionId`, `inputId`, and the observed
`expectedSessionRevision`. The result contains `inputId`, factual `textOnly`
eligibility (exactly one retained text block), and the full `prompt`
as text blocks and display resource links. Retained image links carry only a
name, original MIME, byte size and retained attachment URI; selected source paths
and preparation metadata stay private. This view neither claims nor changes work.
The ordinary input inspection's `textOnly` field separately reports whether its
retained prompt is exactly one text block; display placeholders do not establish
text replacement eligibility.

`_co.grida/session/read-queued-input-image-chunk` takes the same three fields,
an `attachmentUri` from that queued prompt, and an `offset`. Its response uses
the same 256 KiB chunk and 20 MiB original bounds as recorded-image reads,
echoing `inputId` rather than a message identity. Before and after reading the
retained bytes, the host requires the same session revision, an input still in
the queue, and the exact attachment owned by that input and session. A claimed,
withdrawn or replaced input, changed queue revision, missing retained bytes or
foreign attachment returns `queued_input_image_unavailable`. Negotiating this
capability grants no source-file read, model execution, or queue mutation.

The host selects the actual recorded asset and checks its owner, immutable
identity, size and digest. The message must remain in the chat's current
transcript view before and after the read. Older local messages remain readable
after context compaction; inherited assets and revised-away messages do not.
For recorded-message operations, a queued image becomes eligible when its local
user message is recorded.
Missing or replaced bytes, a wrong message or a foreign asset return
`input_image_unavailable`. A read creates no files or work, changes no model
input, and grants no filesystem access. This is separate from crop-result
artifacts and does not relax their receipt checks.

A queue basis contains `sessionId`, `requestId`, and
`expectedSessionRevision`. A task basis adds `turnId` and
`expectedControlRevision`. Snapshot returns the ordered queue and turn
summaries, with `sessionRevision`, `controlRevision`, `historyPosition`,
`journalPosition`, and turn `epoch` for conditional operations.

### Retained tool-result images

Private stdio clients on macOS and Linux can negotiate
`co.grida/session/tool-images` version 1. Successful tool activity with an
owning `turnId` then includes `rawOutput.images`: at most eight references
containing `mediaId`, `contentIndex`, `mimeType: "image/png"`, and `totalBytes`.
Live activity and attributed transcript-window replay use the same projection.
Legacy replay without turn attribution omits these references. Failed calls
retain readable result text and carry no image references. An optional
`omittedImages` counts additional valid references, up to 1,024.

Each reference addresses a captured, prepared PNG retained under the opaque
`workspace-view/` media identity. The media ID is at most 512 UTF-8 bytes;
`contentIndex` is a zero-based result-content index from 0 through 1,023, and
`totalBytes` is positive and at most 393,216 (384 KiB). These metadata describe
retained identity, not continued byte availability. The reference carries no
source path, serialized storage descriptor, or download URL. It is separate
from user-input images and crop artifacts.

`_co.grida/session/read-tool-image-chunk` takes the attached `sessionId`, exact
`turnId`, `toolCallId`, `mediaId`, `contentIndex`, and `offset`. Its response
echoes all six fields and includes `mimeType: "image/png"`, `totalBytes`,
standard-base64 `data` for at most 256 KiB, and `nextOffset` or `null`.
Offsets start at zero; a second chunk starts at 262,144. Clients verify stable
identities, MIME, total size and contiguous offsets, and display only a complete
image within the 384 KiB bound.

The host reads one exact committed local turn snapshot, independent of chat
length, and requires one matching call with one successful result containing
that exact retained media index and identity. It rechecks membership around a
bounded digest-checked PNG read. A running turn's already-published result is
readable before the rest of its work settles. Earlier retained local turns
remain readable after context compaction or history revision; inherited seed
media does not authorize a read in another session. Wrong or foreign session,
turn, call, index or media, missing or changed bytes, unsupported media, and
invalid offsets return `tool_image_unavailable`. No request starts inference,
runs a tool, reopens the original source path, or changes prepared pixels.
Capability negotiation grants observation only, under the existing private
channel and outstanding-request limits.

The [native process case](../tests/process/tool_images.rs) captures a JPEG as
prepared PNG, reads its published result before settlement, replaces and deletes
its source, reopens the host and compares the replayed identity and exact bytes. It also
checks mismatches, failed calls, missing retained bytes and unsupported
capability versions using a local fixture provider.

### Replace only queued user text

Negotiate `co.grida/session/replace-text` version 1 separately from general
replacement. Call `_co.grida/session/replace-text` with `queue` (the queue basis),
`inputId`, a fresh `replacementInputId`, and `text` (a UTF-8 string). The response
is the ordinary queue control receipt: `sessionId`, `requestId`, and the committed
`sessionRevision`. The replacement keeps the original queue slot.

The host transforms its retained input: all text parts become one text part in
the first text position, or at the start if none existed. An empty string removes
text parts and is accepted only when another part remains. Non-text parts keep
their exact retained identities and order. The entire captured configuration,
provider/model/reasoning, Plan/Ultra allowance, spending, permissions, guidance,
skills and tool authority are preserved; current defaults are not recaptured.
Clients send no attachment, prompt reconstruction, or setting overrides.

Both `input` and revision-bound `queued-message` return factual `textEditable`.
It is true only for a still queued ordinary retained input. Goals, Library
selection, scheduled inputs, and internal worker assignments are refused with
`queued_text_not_editable`. `textOnly` continues to mean exactly one retained
text block and does not establish caption eligibility or steering eligibility.
Capability negotiation and an observed eligible input are both required before
offering this action. A changed revision or claimed, withdrawn, or superseded
input cannot receive a new edit. Every failed control leaves the original intact.

An exact retry must repeat the original queue basis, request and input IDs and
text. It returns the original control receipt, including after replacement
admission or host restart, without accepting more work. Reusing a request ID with
a different action is refused. The general `replace` operation retains its
whole-input behavior; it is not a fallback for caption editing.

Private stdio clients can negotiate `co.grida/session/updates` version 1.
Already attached sessions then receive standard `session/update` assistant
chunks for identified submissions, queued work, and resumed turns. The
notification's `_meta["co.grida/session/updates"]` contains `turnId`,
`offsetBytes` (UTF-8), and `replace`. A replacement starts with the
recorded message text at offset zero. Apply it to the identified message
before appending later chunks. A `resyncRequired` notice has no text and
asks the client to reload committed history. Observation owns neither work
admission nor cancellation.

| Method suffix after `_co.grida/session/` | Parameters and result                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit`, `enqueue`                      | `sessionId`, `inputId`, ACP `prompt`. Submit selects idle work. Enqueue accepts waiting work. Both return `inputPosition`, `disposition`, and the `turnId` once selected.                                       |
| `snapshot`                               | `sessionId`. Read the bounded session summary without claiming work.                                                                                                                                            |
| `input`                                  | `sessionId`, `inputId`. Read the accepted prompt, captured settings, and retained receipt.                                                                                                                      |
| `replace`                                | Queue basis in `queue`, `inputId`, `replacementInputId`, ACP `prompt`. Retain the slot and supersede the prior input.                                                                                           |
| `replace-text`                           | Queue basis in `queue`, `inputId`, `replacementInputId`, and `text`. Replace only user text in the retained input, preserving captured non-text parts and settings. Requires its separate version 1 capability. |
| `withdraw`, `reorder`                    | Queue basis in `queue`, plus `inputId` or the complete ordered `inputIds` list.                                                                                                                                 |
| `resume-queue`                           | Flat queue basis. Reopen queue admission and schedule eligible waiting work.                                                                                                                                    |
| `stop`, `pause`                          | Flat task basis. Return the committed control receipt. Stop also pauses queue admission. Pause becomes verified when the turn reports `suspended`.                                                              |
| `resume`                                 | Task basis in `task`, `expectedEpoch`, `expectedJournalPosition`. Claim the verified suspension and clear its task pause. Return the claimed turn summary.                                                      |
| `steer`                                  | Task basis in `task`, `expectedHistoryPosition`, ACP `prompt`. Append the correction to the targeted turn and return the committed receipt.                                                                     |
| `questions`                              | `sessionId`, `turnId`. Read pending question identities, prompts, choices, and the current control/history basis.                                                                                               |
| `answer-question`                        | Flat task basis plus `expectedHistoryPosition`, `waitId`, and `answer`. Commit a typed answer and its correlated contribution.                                                                                  |
| `approvals`                              | `sessionId`, `turnId`. Read pending approval requests and their wait IDs with the current control revision.                                                                                                     |
| `answer-approval`                        | Flat task basis plus `waitId` and `decision`. Commit a decision for the exact recorded action. Available on private supervising stdio.                                                                          |
| `history`                                | `sessionId`, optional `view`, `offset`, and `expectedHistory`. Read visible message anchors, previews, and any seed lineage.                                                                                    |
| `revision-target`                        | `sessionId`, visible `messageId`, and `expectedSessionRevision`. Read the original editable text, its effort and reasoning level, exact current basis and anchor, and subsequent visible message count.         |
| `fork`                                   | `sessionId`, `requestId`, `expectedHistory`, and `anchor`. Return the independent `sessionId` for a committed prefix through that message.                                                                      |
| `revise`                                 | Fork parameters plus `expectedSessionRevision`, `replacementInputId`, ACP `prompt`, and optional `effort` and `reasoning`. Return the installed view and accepted input.                                        |
| `compact`                                | `sessionId`, `requestId`, and optional `recover`. Run or inspect one retained context compaction. Return its status and available usage/failure evidence.                                                       |
| `skills`                                 | `sessionId`. Read names, descriptions, sources, and versioned ACP resource-link URIs for available skills.                                                                                                      |
| `processes`                              | `sessionId`. Read the chat's command processes: running ones first, then ended ones the model has not read yet. Requires `co.grida/session/processes` on private stdio.                                         |
| `stop-processes`                         | `sessionId`, optional `processIds` (1 to 64 distinct positive numbers; omitted stops all). Stop them, wait a bounded time for each to end, and return the `stopped` numbers that have ended.                    |

Each process entry carries `processId`, `command` (cut to 1 KiB with a
trailing `…`), the absolute `cwd`, `terminal`, `startedAt` in Unix
milliseconds, `state` (`running` or `ended`), and `exitCode`, which is null
while running and for a process that was stopped or ended by a signal. A
negotiating client also receives a `session/update` for each attached chat
whose list changed: the process started, ended, was stopped, was evicted or
had its end read. Its `_meta["co.grida/session/processes"]` holds the complete
`processes` list. After missed live updates the host sends the current list.

Select a skill by including its catalog URI as an ACP `resource_link` alongside
the prompt. Skill references use `grida-skill:<name>@<revision>`. The catalog
returns metadata and omits local paths and bodies. A stale or unavailable
selection rejects the new input before inference. Use a new submission or
queued replacement to change skills for accepted work. Steering keeps the
active turn's captured guidance.

Bundled skills are available to every session. Project discovery reads only
the explicitly readable primary root supplied by the host. It checks
`.agents/skills` before `.claude/skills`, followed by bundled skills, and uses
the first available definition for each name. An accepted input retains its
chosen skill bodies and any root `AGENTS.md` guidance. The `input` operation
reports selected skill versions and the project instruction revision when
present. These sources supply model context without changing tool permissions.

History returns `basis`, `sessionRevision`, up to 128 `messages`, `nextOffset`,
and optional `seed` provenance. The basis carries `view`, `tail` and a
`fingerprint` of 64 lowercase hexadecimal characters; treat it as opaque. It
also returns `latestAnchor` for the latest visible message in that same basis,
or null for an empty view. Older hosts may omit this field. Echo the basis as `expectedHistory` on later pages and
writes. A changed basis requires a fresh history read. Anchors are
scoped to the selected view and carry either a local turn and message ID or an
inherited message ID. `view` can read an earlier retained view. Standard session
load captures the current view and streams its transcript in causal order.
Replay uses bounded reads, with the active turn captured at the start of the
operation. Model context assembly uses its own request limits.

An attached client that negotiates `revision-target` can open an edit from an
exact visible message ID in the current view. The reply binds the complete
original text to that revision and history basis. It requires an ordinary
retained text-only submission. Structured inputs and material inherited from
another chat have no editable target through this operation.

A fork leaves source ownership unchanged and starts with no active work. Load
its returned ID with the same workspace to attach it. An earlier-message revision
cuts strictly before the chosen editable user message and atomically accepts the
replacement in the same session. It requires idle work and an empty queue.
Stop a running or input-required turn before revising. Existing admission
pause still applies. Prior turns and input receipts remain
retained. Portable seeds expose categorized omission counts and carry no source
execution grants, pending interactions, or usage. The agent receives a notice
about omitted media, tool data, or provider continuation in the selected view.
The revised input captures current settings and uses the same explicit
configuration-change opt-in as a new submission. A client keeps the original
effort by resending the target's `effort` and `reasoning`. Retrying a revision returns
its original receipt. Retained queued work after restart needs explicit Resume
Queue.

Negotiating `co.grida/session/compact` or `co.grida/session/fork` adds the
matching command to the standard ACP available commands update after session
setup. An exact bare `/compact` or `/fork` in `session/prompt` runs the same
host control and returns its result under the negotiated key in `_meta`.
Identified control requests support exact retries across reconnects.

Compaction starts from an idle session with open admission and an empty queue.
It owns a real turn that can be paused or stopped. New queued input remains
accepted. Standard load and history anchors keep the original transcript.
Future model input uses the latest installed summary and the subsequent
conversation. Failed, stale, or uncertain attempts keep the previous model
context. Resume a paused compaction through `resume`. Read an interrupted
attempt by repeating its request ID and use `recover: true` to settle it under
a replacement owner. Recovery does not repeat an uncertain provider dispatch.

A duplicate input compares the original prompt and returns its retained
disposition, including supersession or withdrawal. Changes reuse the caller's
`requestId` with identical parameters and revisions to replay their receipts.
A Resume retry resolves to the same claimed turn and its current view. A stale
new control uses a refreshed snapshot and a fresh request identity. Late
steering that loses the terminal race returns an explicit conflict, leaving the
client free to keep its draft or submit another task.

Private stdio advertises `promptCapabilities.image` on declared image-capable
native profiles on macOS and Linux, including the subscription composition.
`session/prompt`, Submit, Enqueue, and
Replace accept one ACP `image` block with `mimeType: "image/png"` and base64
`data`. Its `uri` must be absent. The encoded PNG may be up to 256 KiB before
base64 encoding. The host checks decoded image bounds and rejects the full input if an
image cannot be accepted. Readback identifies the image with a text marker.
Only the original digest and identity are in conversation records. Resume
verifies the exact retained bytes before dispatch. A fork or compaction can
omit earlier image content and records that omission. Image steering, earlier
message replacement, and shared WebSocket intake are unavailable.

For an explicitly selected local raster, negotiate
`co.grida/session/selected-image` version 1. Submit, Enqueue and Goal Start accept one
`selectedImage` instead of an ACP image block or another attachment:

```json
{
  "selectedImage": {
    "path": "/absolute/path/to/selected.jpg",
    "sha256": [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
    ],
    "name": "selected.jpg",
    "source": "disk"
  }
}
```

`sha256` contains exactly 32 byte values. The trusted launcher verifies source custody and
captures the selected bytes' digest. The native host opens one pinned regular
file and refuses a digest mismatch as `selected_image_changed`, before input
admission. The original can be up to 20 MiB. Actual bounded decoding identifies
PNG, JPEG, WebP or GIF independently of MIME/extension claims, applies
orientation and supported decoder color conversion, and derives one PNG still
of at most 384 KiB, 2048 pixels per side and two megapixels. Animation is
represented by its first frame. Preparation preserves meaningful alpha and
records original/prepared dimensions, image count and frame disclosure.

The host retains the unchanged original and frozen derivative separately;
queueing, retry and restart use those accepted bytes. The transcript contains
one original-MIME resource link, with display name/size and
`_meta["co.grida/image-attachment"]` carrying `preparation` and optional verified
`sourcePath`. Model context receives actual prepared pixels and source-path
provenance. UI preview is independent of perception. Cropping a prepared raster
uses coordinates in that bounded view; it cannot recover detail removed by
downsampling. Color-critical inspection can use the unchanged original;
ICC-only input follows the decoder's color interpretation.

For clipboard/no-origin bytes, the launcher stages an owner-only snapshot and
uses `source: "snapshot"`. Only flat regular single-link mode-0600 files under
the private native state directory's `desktop-image-custody/snapshots/` root
are eligible; both custody directories are private and canonical with no
symlink alias. Ordinary tools still deny the native state directory. Snapshot
context uses an honest retained resource identity and never describes its
staging path as an original local path. `disk` sources remain subject to all
protected-root checks, and image selection grants no directory or command
access. A valid exact receipt retry does not reopen a missing/changed source.

Retained inputs are bounded to 32 asset records and 256 MiB of total source
bytes per chat; a richer image uses two records. Provider request composition
and supervised egress share an independent 8 MiB aggregate encoded-body limit,
including all retained history and tool framing; individual ACP frames remain
at most 1 MiB. Exhaustion is an explicit failure, never a text-only partial
submission or silent image omission. A text-only model refuses new images
before admission. Historical image pixels on such a model are explicitly
omitted from its model context with a retained-reference note; transcript and
original preview remain available.

New accepted subscription inputs capture the image-capable wire profile and
tool policy. Inputs accepted before that profile retain the original text-only
restricted adapter and tool inventory during recovery; their serialized
capability/replay identities are not reinterpreted. Both profiles omit output
token limits, token measurement and admission-rejection evidence.

The product also captures its `view_image` contract independently of the
provider. Older accepted inputs with no raster-tool policy reconstruct the
exact version-1 PNG-only definition, 256 KiB read bound and three-second tool
deadline. New inputs capture version 2 with bounded raster preparation and a
30-second image-inspection deadline. Ordinary file operations keep their
three-second limit. An older serialized invocation therefore does not acquire
new semantics or fail merely because the current product offers raster tools.

On the private stdio Responses PNG profile or reviewed saved OpenRouter PNG
profile, negotiate both
`co.grida/session/library-selections` and `co.grida/session/answer-library-selection`
at version 1. An identified Submit with `allowLibrarySelection: true` can
offer `design_search` for that input. The tool asks the attached client to
present a Library picker, with the recorded initial query. The client owns
search, refinement, and access to the selected item.

`_co.grida/session/library-selections` reads pending requests for the attached
`sessionId` and exact `turnId`, with `controlRevision` and each `waitId` and
`initialSearchQuery`. `_co.grida/session/answer-library-selection` takes the
flat task basis, exact `waitId`, and either `{ "kind": "skipped" }` or
`{ "kind": "selected", "id": "<catalog UUID>", "data": "<base64 PNG>" }`.
The same PNG bounds and retained quota apply. Send the identical request and
revision basis to recover its receipt. An explicit Pause still requires Resume.
The host retains a private image identity and passes the selected pixels to
the captured provider within that turn. Later turns retain a text description.
For the compatible connection, the provider adapter sends every tool reply
before adding labeled PNG input correlated to the originating tool reply.
If interruption occurs after the bytes are retained and before the choice is
committed, the unused copy stays subject to the chat's storage and deletion policy.
The host receives no Library URL or access grant. The Desktop workbench
selects and normalizes one image with its existing Library attachment owner.
Main keeps the ACP wait and revision basis behind an opaque review ID tied to
the attached workbench frame.

Private stdio clients may negotiate `co.grida/session/selected-file` version 1
when the host has retained input storage. Identified Submit and Enqueue then
accept one `selectedFile` with `name` and standard-base64 `data` alongside a
nonempty text prompt. The name carries no path. The file is at most 256 KiB and
has the same input identity on retry. Admission retains an exact original and
working copy. The prepared request contains a display marker. The bound
`inspect_retained_file` tool returns its size, digest, and a bounded text
excerpt on request. Reopening an input returns a marker and its receipt.

Private stdio clients may also negotiate `co.grida/session/file-reference`
version 1. Identified Submit and Enqueue then record a prompt `resource_link`
whose `uri` is a local `file:` URL as a resource reference, alongside nonempty
text and at most one per message. The link carries `name`, optional
`mimeType` and `size`, and optional `_meta["co.grida/file-reference"]` with
`workspacePath` (the path relative to the chat's working directory, which
must name the same file) and `preview` (`poster` as a JPEG or PNG data URL of
at most 48 KiB, `durationMs`, `width`, `height`). The model reads the name,
path, type, size and media facts as text, never the poster or the bytes. The
host never opens the file, and the reference grants no access: the agent
reaches it only through tools its permissions already allow. A directory uses
`mimeType: "inode/directory"` with size and preview omitted: a directory's
filesystem stat size is not its contents' size. The model sees a folder
description and uses its existing tools to list or inspect it. Attachment does
not enumerate or copy the directory, register a workspace root, or issue a
grant. A reference is a path, not a snapshot; moving or replacing the resource
can change what later permitted tools observe. Replay and input
inspection return the same link. Without the capability, a `file:` link stays
ordinary context text.

An admitted turn can offer `crop_retained_image` when its captured context
contains a retained PNG owned by the chat. The tool uses the most recent such
image and takes a rectangle in original pixel coordinates. It writes a private
PNG working copy with a 256 KiB output limit and returns its identity, the
source version and digest, and the resulting dimensions and digest. The copy
is retained with the chat state. A missing copy with a previous receipt reports
unavailability. Preview and export need a separate capability.

The host advances waiting work after verified settlement while admission is
open. Observation stays independent of scheduling. After a restart, Resume
Queue can wake retained waiting work, and Resume Task checks captured settings
and current authority before reacquiring a suspended turn. A credential change
blocks dispatch under an earlier captured authority.

After a snapshot reports the current turn as `suspended`, a client may send
Resume immediately. The native host waits a bounded time for that exact turn's
retiring worker to release its slot; clients do not need to wait for an earlier
prompt RPC to finish merely to avoid that handoff race. Keep the original
request identity and observed revisions, epoch and journal position: concurrent
changes still refuse the stale claim. A worker that does not retire within the
bound remains busy rather than being replaced.

An attached snapshot can include `retryNotBeforeMs`, a Unix time in
milliseconds for the current turn's retained provider retry. It is the earliest
dispatch time, subject to the same authority and task controls as the original
request. Pause holds the retry and Stop closes it. The value is absent when
there is no current retry. An eligible pre-execution failure can reserve this
retry, including a connection refusal verified by the direct HTTP host.

Clients negotiate both question operations to enable the corresponding tools
for newly accepted input. Answers use `{ "kind": "text", "text": "..." }`,
`{ "kind": "choice", "index": 0 }`, or `{ "kind": "skipped" }`.
Keep the request identity and all parameters stable when retrying. Accepted
answers retain a scheduling wake across concurrent worker completion and
capacity changes. An explicit task pause is independent of answer receipt.
An embedded `run --questions` returns a verified `input_required` result and
exit code `6` when it suspends for an answer.

### Temporary side chats

Private stdio clients negotiate both version-1 keys under
`co.grida/side-chat/`. A side chat is an ordinary session forked from its
parent; its ID belongs to the connection that opened it. A parent can have
several side chats open at once; each `open` forks a new one, except that an
`open` repeating the `requestId` of a side chat still open on this connection
returns that side chat again, even at the parent's limit. A client that loses
an `open` reply repeats the request with the same `requestId` to learn the
side chat it opened and close it. The same `requestId` with another parent
returns `side_chat_request_conflict`. Once its side chat is closed, a
`requestId` names nothing and opens a new side chat.

| Method suffix | Parameters and result                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`        | `sessionId` of an attached parent and optional `requestId`. Fork its committed conversation into a temporary session attached here and return `sideChatId`, `parentSessionId`, `sourceContext`, `compacted`, `omissions`, `temporary: true`. |
| `close`       | `sideChatId` opened on this connection. Cancel its running turn, stop its processes, remove its data and detach it. Returns `{}`.                                                                                                            |

Every session method works on `sideChatId`: `session/prompt`, `session/cancel`,
`_co.grida/session/submit`, queue edits, steer, stop, pause and resume,
questions, approvals, snapshot, history, transcript window, turn summaries and
processes. Live `session/update` notifications are delivered as for any
attached chat. Tools and permission rules are the parent's.

Each side turn's instructions end with the side-chat policy, and its model
context places a boundary message after the inherited history and before the
side chat's own turns. The inherited history is model context only. The side
chat's transcript begins at the boundary: a new side chat's `session/load`
replay, transcript window and `_co.grida/session/history` page are empty
(`latestAnchor` is `null`), and they then show the side chat's own turns. A
history page's `seed` still names the parent the side chat was forked from.
Revision targets are the side chat's own messages; revising one keeps the
earlier side turns in the transcript, now as inherited anchors with
`editable: true`, and the parent's history stays hidden. The snapshot carries
`side: { parentSessionId, temporary: true, unavailable, title? }`, where
`unavailable` lists `fork`, `side_chat`, `compaction`, `goals`, `subagents`,
`delegation`, `wakeups` and `catalog`. The host refuses each with
`side_chat_fork_unavailable`, `side_chat_nested_unavailable`,
`side_chat_compaction_unavailable`, `side_chat_goals_unavailable`,
`side_chat_subagents_unavailable`, `side_chat_delegation_unavailable` (effort
above Standard), `side_chat_wakeups_unavailable` (`allowWakeups`) or
`side_chat_catalog_unavailable` (catalog entry, organize, delete and its
preview). `compaction` means manual compaction. Automatic compaction can
summarize a side chat's inherited history before its first turn, covering
nothing of its own; the boundary then follows the summary. That summary is
background too, so the side chat's transcript window leaves out the turn that
wrote it. Once the side chat has a turn, automatic compaction no longer
selects it.

A host launched with chat titles titles a side chat from its first message,
as it titles a chat. `title` appears in the side chat's snapshot once written;
a client reads it there, since the catalog entry stays refused. The title is
kept only on the side chat's own record and is discarded with it.

Side chats live in a catalog scope outside every workspace, so listings,
archive listings and deletion previews never include them. Loading one from a
connection that did not open it returns `side_chat_unavailable`, as does
closing an unknown or closed ID. A close whose cleanup cannot be confirmed
returns `side_chat_discard_pending`, leaves the side chat fenced and open, and
can be retried. A retry after a close whose reply was lost can return
`side_chat_unavailable`: the side chat is already gone. A parent can have at most eight side chats open
(`side_chat_parent_limit`), and a connection at most thirty-two across its
parents (`side_chat_scope_limit`). Closing one makes room again. Deleting a
parent discards all of its side chats; a side chat opening while its parent is
deleted either opens first and is discarded with it, or finds no parent. Disconnect shuts the host down and then
discards every side chat; a host also discards any left by a crash before it
serves.

### One-shot task wake-ups

Private stdio clients negotiate `co.grida/session/wakeups`,
`co.grida/session/cancel-wakeup`, and `co.grida/session/recover-wakeup` at
version `1`. Set `allowWakeups: true` on the identified Submit to offer the
schedule tool for that task. The setting is retained and must agree on input
retries. The host accepts one wake-up for the same task with a delay up to
seven days.

| Method suffix after `_co.grida/session/` | Parameters and result                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `wakeups`                                | `sessionId`, `turnId`. Inspect the retained schedule, with its wait ID, time, reason, disposition, and live `armed` flag.                |
| `cancel-wakeup`                          | `sessionId`, `turnId`, `waitId`. Cancel that schedule and return its current disposition. A retry observes the same cancellation.        |
| `recover-wakeup`                         | `sessionId`, `turnId`, `waitId`. Explicitly rearm the pending timer or restore a recorded due continuation through the normal scheduler. |

The timer resolves the exact recorded wait when due and uses normal task
admission and provider authority. `delivered` records the resolution, while
task completion is reported separately. Task Pause holds delivery and Stop
closes it. Cancelling the wake-up makes no automatic continuation. Load,
inspection, and connection setup make no recovery request. Closing the host
releases the live timer, and a new host reports `armed: false` until recovery.

An attached private client can negotiate
`co.grida/session/continue-cancelled-wakeup` version 1 and explicitly continue
the same unpaused, suspended turn through `_co.grida/session/resume`. Add the
exact `cancelledWakeupId` to the normal task, epoch, and journal basis. The
host verifies the cancelled wait and that no interaction still blocks the
turn, then resumes it without delivering the scheduled prompt. Repeat the
same request and basis to observe the claim receipt. A paused turn uses the
ordinary Resume request without this field.

With a trusted native permission profile, an access that requires approval
records its directory, action and scope identities, and a bounded description
of the file operation or command. The reply uses `decision: "approve_once"`
or `"decline"`. The same request identity, revisions and decision replay its
receipt. A conflicting answer fails. Continuation checks the current profile
and resource identities before executing the approved action. One-shot `run`
returns pending `approvals` with `input_required` and exit code `6`.

### Per-chat permission mode

`co.grida/session/permission-mode` version 1 is available only to a negotiated
private supervising stdio connection. It grants no authority by itself. The
launch permission profile must independently enable `allowFullAccess` before
the supervisor can select that mode.

- `_co.grida/session/permission-mode` takes `{cwd, sessionId}` and returns
  `{sessionId, revision, mode, available}`. Modes are `restricted` and
  `full_access`; an unselected chat starts at revision 0 in restricted mode.
- `_co.grida/session/permission-mode/update` takes
  `{cwd, sessionId, expectedRevision, requestId, mode}` and returns the state
  plus `requestId`. An exact retry observes the committed receipt. Conflicting
  request reuse or revision mismatch refuses the change.
- `_co.grida/session/permission-mode/ack` takes `{cwd, sessionId, requestId}`
  and releases an observed change's coordination receipt. Clients retain the
  exact pending change until its outcome is confirmed, then acknowledge it;
  the saved mode remains. Outstanding unacknowledged receipts are bounded.

Changes require an idle ordinary parent chat, an empty queue and no running
command processes. `permission_mode_busy` leaves the choice unchanged. Child
and side chats cannot select their own broader posture. The host captures
authority with accepted input and worker assignments; inspection, replay and
reopening do not change it. Saved Full access is unavailable when the current
trusted launch does not authorize it.

Desktop presents an in-app confirmation bound to the exact chat before
enabling Full access. Clients must feature-detect the capability; older hosts
retain their restricted contract. Permission selection is independent of
model/effort defaults and starts no provider call.

### Model-created workers

An opted-in native host can supply general model delegation on ordinary Act
turns independently of effort. These workers are admitted from live model tool
operations, not from the client's settled-parent assignment operation. Each
retains one bounded assignment with its captured native capabilities, model,
reasoning and provider. Existing parent-scoped listing, inspection and rich
activity/conversation reads expose these children; the model's collection
receipts remain separate from client observation. A general worker is reported
as a named child, while independent reviewers keep their review classification.
Its inspection reports the actual captured generation-step limit.

No new client method or authority is implied by seeing a worker. The
[native binding](./rust-core.md#model-initiated-child-work) defines the model
tools and the distinction from manual assignments below.

### Named subagents

A host launched with `serve --stdio --subagents` on an Act launch advertises
each `co.grida/subagent/` operation at version `1`: `create`, `list`, `assign`,
`send-message`, `inspect`, `pause`, `resume`, `steer`, `stop`, `resume-queue`,
and `withdraw`. The client negotiates each one separately and calls the
matching `_co.grida/subagent/` method; all are client-to-agent requests on the
private supervising connection. Every request names the attached
`parentSessionId`. Children have their own stable IDs and history and are
absent from ordinary chat listing and load.

The launch can use any supported native inference connection, including an
anonymous compatible endpoint or a subscription route. Child work retains
the parent's captured provider, model, principal and destination scope. Its
generation-step allowance does not require a provider wire output-token limit;
an unsupported field remains absent. The allowance and local output bounds
do not promise a remote token or monetary ceiling.

| Method suffix after `_co.grida/subagent/` | Parameters and result                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`                                  | `requestId`, `name`, and `workTurns` from 1 through 8. Returns `childId`; an exact retry returns the original child.                                                              |
| `list`                                    | Optional `afterChildId`. Returns up to 32 `children` with `childId` and `name`, newest first, and `nextAfterChildId` when more remain.                                            |
| `assign`                                  | `childId`, settled Act `parentTurnId`, `inputId`, and text `instructions`. Queues an assignment within the remaining allowance and returns its receipt with `maxGenerationSteps`. |
| `send-message`                            | `childId`, `inputId`, and up to 4 KiB of `text`. Retains informational context for the next assignment without changing execution or allowance; up to 16 can wait.                |
| `inspect`                                 | `childId` and optional `inputId`. Reads an assignment or message, or the current or latest observed assignment, with queue and pause state. Starts no work.                       |
| `pause`, `stop`                           | `childId`, child `turnId`, `requestId`, `expectedSessionRevision`, and `expectedControlRevision`. Stop also holds the child's queue.                                              |
| `resume`, `steer`                         | The same fields under `task`. Resume adds `expectedEpoch` and `expectedJournalPosition`; steer adds `expectedHistoryPosition` and text `instructions`.                            |
| `resume-queue`, `withdraw`                | `childId`, `requestId`, and `expectedSessionRevision`; withdraw nests them under `queue` with a queued `inputId` and releases its place in the allowance.                         |

Observing a child or negotiating durable sessions grants no child control.
Resuming, steering, new messages, and new assignments require the original
verified provider principal and scope; without that continuity a client can
still inspect, retry an existing receipt, withdraw, pause, or stop. The
[native host README](../README.md#run-named-child-work-from-a-private-launcher)
documents allowance and context behavior. ACP's subagent and session-fork work
is under upstream discussion; the host adopts a matching upstream contract when
one covers these semantics.

#### Child activity and conversation observation

Private clients separately negotiate `co.grida/subagent/activity` version 1.
Both read methods below require the attached `parentSessionId`; they do not
attach a child session, start inference, resume work or grant controls. A child
ID or cursor from another parent is refused. Ordinary session load still
excludes children.

- `_co.grida/subagent/activity` takes an optional `afterChildId`. It returns
  up to 32 `children` in newest-creation order, `nextAfterChildId`, `counts`,
  `observedAtMs`, `events` and `eventsComplete`. Each row carries stable child
  identity, name, `kind` (`named` or `review` from retained sponsorship), status,
  `section`, and factual latest turn/time when available. Ready, queued,
  running, paused, interrupted and uncertain work belongs to Active. A settled
  success, failure or cancellation with no waiting assignment belongs to Done,
  even if future allowance remains. Never-assigned children have no fabricated
  activity timestamp. Count snapshots inspect at most the newest 512 children
  and can be reused for two seconds. `counts.complete: false` makes the counts
  lower bounds; later catalog pages remain available beyond that scan.
- The page's `events` describe only its returned children. Stable `eventId`,
  child ID/name, `childTurnId`, `parentTurnId` and `inputId` identify a started
  or finished assignment. `atMs` is the recorded turn start or first settlement;
  finished events also carry their terminal `status`. At most 512 events and
  a bounded serialized response are returned. `eventsComplete: false` reports
  omitted older retained events or byte-bound trimming for those children; it
  is not a claim that unloaded catalog pages have no events. Clients group
  events under the owning parent turn and use the separately negotiated
  activity-order contract below for placement among parent work. Without that
  evidence, relative ordering remains unknown.
- `_co.grida/subagent/conversation` takes `childId` and optional opaque `before`
  continuation. It returns `parentSessionId`, `childId`, `name`, `kind`, `view`,
  `messages`, `turns`, `execution`, `older`, `live` and `observedAtMs`. Messages
  contain actual exposed user/assistant text and bounded tool activity, with
  stable message/turn identities and answer/progress classification. The
  latest page can include actual in-flight text marked `live: true`. Polls
  replace messages by identity; they are not append-only deltas. Each turn and
  the current/latest header carry captured `execution: {model, effort}`.
  Null effort means model default or unavailable legacy evidence, never the
  parent's currently selected effort.

Conversation windows use the existing bounded retained replay: up to 128
records, 256 KiB of displayed text and 32 turns, with an `older` continuation.
Individual displayed text is capped at 64 KiB with `truncated: true`; tool
arguments/results are bounded previews, and hidden reasoning, provider state
and credentials are excluded. Including live messages keeps the total at 128
messages and 256 KiB of text. The serialized response must fit 768 KiB or the
read explicitly refuses. A continuation binds parent, child and retained view;
if an in-flight cut changes, reload the latest page rather than append a stale
page.

In-flight text is a transient host cache, bounded to 128 sessions and 256 KiB
per session. `live.available: false` reports a missing current cache after
restart or eviction; it cannot reconstruct uncommitted output until that
output is published. `live.truncated` reports a cache or page bound. Completed
history remains readable after restart. Closing this observation does not stop
work, and parent deletion retains ownership of child removal.

#### Parent activity ordering

Private clients can negotiate `co.grida/session/activity-order` version 1.
`activityOrder` is an optional positive JavaScript safe integer comparable only
within one `turnId` or lifecycle event's `parentTurnId`. It is a product-host
presentation coordinate, not an execution timestamp or permission grant.

The coordinate describes the first public publication of an assistant text
message, each individual tool call, or a child start/finish event. Text growth,
replacement and tool status changes retain the same coordinate. An empty
tool-only message envelope needs no message coordinate; its calls each have
their own. A text message remains atomic if a lifecycle event arrives between
its chunks. Child completion is the recorded settlement, not later collection
by the parent.

The `_meta["co.grida/session/activity-order"]` slot supplies attribution for
public message/tool notifications, including standard ACP prompt delivery.
It carries the known `turnId` and the exact message or call's order metadata.
Existing live-update and transcript-window metadata also carries these fields.
A call's position must not be assigned to its containing message. When the
negotiated host lacks a fact's retained position,
it instead reports `activityOrderIncomplete: true`; number and incomplete
marker are mutually exclusive. Child lifecycle events carry their own optional
`activityOrder`, and activity pages report `orderComplete` for their returned
events. Child conversation coordinates, when available, belong to the child's
own turn and cannot be compared with the parent's sequence.

Clients merge individual commentary, calls and lifecycle events before joining
consecutive tool calls into activity groups. Duplicate or conflicting facts
cannot establish an order. Missing metadata on older hosts remains valid, but
clients must label events whose placement is unknown rather than sort them by
wall clock or local arrival time. Observation never allocates historical
positions. A later lookup may enrich a previously unknown position only from
an actually retained record. Incremental updates cannot change a coordinate
already held by the view or erase it with an incomplete update. A fresh
authoritative replay can report unavailable ordering evidence; bounded or
unavailable records remain explicit rather than requiring a second client
history store.

The host retains at most 4,096 public fact identities per turn in a private
ledger capped at 2 MiB, with eight ledgers cached in memory. Reaching a bound
or failing validation/persistence leaves new positions unavailable while
preserving known lookups. Resume audits include both history and committed
inference outcomes; a missing causal predecessor disables further allocation
rather than backfilling the past. Parent settlement closes admission of new
message, call and child-start positions. An already recorded child start can
still acquire its matching finish at the actual later publication position;
this never delays execution or assigns an earlier timestamp-derived position.
Session retirement removes its own ledgers.
Recovery and cleanup share a per-pass bound of 256 path entries and 8 MiB;
unfinished cleanup remains pending.

Lifecycle hook inspection uses the `co.grida/session/hooks` operation below.
Hook progress and failures have ordinary tool and notice projections, with
optional attributed detail for the Grida client. Subscribing to those updates
never invokes a hook.

A client capability may be an executor as well as a presentation surface.
For a live editor operation, the native Tool adapter sends the admitted request
to the owning tool host and receives its correlated result. This can use a
negotiated client operation without routing through an MCP server. MCP remains
a separate public binding for agents that consume Grida capabilities externally.
Both paths preserve the [tool-host contract](./tool-host-contract.md).
The direct client executor uses the existing bidirectional connection. The
public MCP adapter exposes a separately enabled authenticated loopback endpoint
for independent callers. These bindings share product operations, while their
wire protocols and connection lifetimes remain distinct.

### Editor surfaces

On the private supervising connection of an Act host, a client that hosts
workspace editors negotiates `co.grida/session/editor-surfaces` version 1, and
optionally `co.grida/session/editor-surface-open` version 1 for presentation.
An identified Submit or Enqueue then carries `editorEndpointId`, the opaque
UUID of the Desktop editor endpoint that owns the workspace view, and may set
`editorPresentation: true` when the open capability is negotiated. The input
retains that binding, including while it waits in the queue, and the turn's
editor tools target only that endpoint. Both operations require Act, a text
prompt with optional editor context, and the negotiated capabilities.

| Direction      | Method                               | Parameters and result                                                                                                                                                                   |
| -------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent → client | `_co.grida/editor/surface-list-open` | `sessionId`, `endpointId`. Returns the same identities with `available`, the `active` path or null, up to 50 `open` paths relative to the workspace root, and `truncated`.              |
| Agent → client | `_co.grida/editor/surface-open`      | `sessionId`, `endpointId`, `callId`, and a workspace-relative `path` with a leading slash. Returns the same identities and `requested`, whether the client dispatched the open request. |

These back the `surface_list_open` and `surface_open` tools. Each reply must
echo its request identities within two seconds; a missing, late, or
uncorrelated reply leaves the tool outcome uncertain. Without an attached
endpoint, listing fails as unavailable and presentation reports
`requested: false` with reason `editor_unavailable`. A `requested: true` result
means the request was dispatched, not that a renderer displayed the file.

The client and agent can negotiate `co.grida/session/browser-tools` version 1
alongside editor surfaces. An eligible Act text input carries
`editorBrowserTools: true` and its exact `editorEndpointId`. Submit and Enqueue
retries using the same `inputId` must repeat the accepted browser opt-in.
Omission is equivalent to `false`. Changing the opt-in returns a conflict.
The reverse `_co.grida/editor/browser-tool` request includes `sessionId`, `endpointId`,
`callId`, `operation`, `arguments`, and a bounded `timeoutMs`. The reply
echoes the three identities and carries `result` with dispatch disposition,
bounded structured data or a domain error, and optional JPEG bytes for a
browser capture. JSON-RPC cancellation closes the outstanding request against
that endpoint. Legacy file requests keep their existing method and schema.

The client and agent negotiate
`co.grida/session/editor-svg-text` version 1 alongside editor surfaces.
An Act text submission or queued input may carry `editorSvgTargetId` with its
`editorEndpointId`. This is the renderer's opaque capture of the current
workspace SVG selection. The input retains the original capture on retry.
Check-ins have no SVG target.

In bounded transcript replay, the exact local user text message may carry
`svgTextSelection: true` in `_meta["co.grida/session/transcript-window"]`.
This indicates that the accepted input included that binding, even if the
selection has since changed or the editor closed. It reveals no target ID,
path, or text and carries no authority. Ordinary messages and inherited
history omit the field. Older hosts can omit it for any message.

The reverse `_co.grida/editor/svg-selected-text` request carries the exact
`sessionId`, `endpointId`, `targetId`, `callId`, and `expiresAtMs`, with a
`read` or `replace` operation. Replacement requires the opaque revision from
read and at most 4 KiB of valid SVG text. A verified response echoes the four
identities and carries `result`. Applied and unchanged replacement results
report `saved: false`. Unavailable or stale targets supply a domain failure.
Malformed, lost, or uncorrelated replies leave the tool outcome uncertain.

The private supervisor and agent can negotiate
`co.grida/session/editor-context` version 1. Submit and Enqueue may then
include `editorContext` with a `kind`, `surface`, `sampledAt` in epoch
milliseconds, and an object `payload` validated by the supervisor. The two
identifiers use lowercase ASCII letters, digits and hyphens with a leading
letter and a 64-byte limit. The observation has an 8 KiB encoded limit and
bounded JSON nesting. It accompanies nonblank user text and carries no tool
authority. A context part does not extend an editor or browser lease.

The host retains the observation with the input and labels it as observed
data for inference. Identified retries compare the original observation and
sample time. Queue text edits retain them and require the edited text to
remain nonblank. Transcript and queue projections name the observation
without reproducing its payload as user prose. Omit the field if the agent
does not negotiate it.

### Supplemental message context

On private supervising stdio, negotiate `co.grida/session/message-context`
version 1. Submit, Enqueue, and Goal Start accept the optional named
`messageContext` field alongside the ACP prompt. It contains nonblank
`modelText` and an ordered `displayParts` array of up to sixteen entries.
Each entry has a `kind` of up to 64 lowercase ASCII letters, digits, dots or
hyphens starting with a letter, an integer `version` from 1 to 65535, and a JSON
object `data` with nesting bounded to eight levels. The encoded context is
limited to 16 KiB. The host leaves each presentation payload opaque.

The model receives the supplemental text as a separate observed user-role
record. The authored input retains its identity and supplied provenance.
Lifecycle `before_input` checks run once for the accepted authored message.
The supplemental record grants no tool authority. When no authored text or ordinary
resource is provided, at least one display part is required. A context-only
submit uses an empty ACP `prompt` array. Exact retries compare the accepted
context, and queue text edits retain it.

For negotiated clients, `input` and `queued-message` return `displayParts`
outside their ACP `prompt` blocks. In bounded replay the first user text
chunk of its exact accepted local message carries `displayParts` in
`_meta["co.grida/session/transcript-window"]`. A display-only user message
has one empty text chunk. The user text contains authored content, and the
supplemental model text stays out of the transcript. Derived chat history
carries the portable inference material and authored prose, with display
metadata scoped to the original accepted message. A fork through the authored
message retains its associated observations, including when the authored input
contains only display parts.

The private Desktop supervisor can negotiate `co.grida/media/generate-image`
version 1 for a captured saved BYOK image route. Ordinary Act work can offer
`generate_image` with a bounded text prompt and optional background intent.
The reverse request carries the session and call identities and an ephemeral
credential proof. Main uses the captured provider, model, and catalog binding.
The retained media service verifies the exact key it will use for the request.
It returns a bounded Recents receipt without bytes or a workspace path.
Cancellation aborts the matching request and preserves uncertainty about any
completed provider work. Confirmed generation without retention ends the turn
with a factual summary before another inference can repeat the request.

The reviewed OpenRouter PNG profile can also negotiate
`co.grida/media/image-reference` version 1 with both Library operations.
An identified Act input with Library selection enabled can offer
`library_reference_id` on `generate_image`. It resolves one verified selection
from that turn's successful Library tool receipt. The worker checks the
chat-owned bytes and sends one bounded `referencePng` to Main. The media
service verifies the same provider variant and constructs its inline image
input. A missing or stale selection fails before generation.

The same reviewed profile can negotiate
`co.grida/media/attachment-reference` version 1 independently. An ordinary
Act input with one retained PNG offers `attached_image: true` as an
alternative to a Library reference. The worker resolves the exact
submission's retained PNG and supplies `referenceOrigin: "attachment"` with
the bounded reverse request. Main obtains a fresh workbench confirmation
before the image provider receives the PNG. A declined request returns a
known failure and keeps the attachment in its original chat. Prior turns,
generic file attachments and other sessions supply no authority to use a
PNG for generation.

The reviewed workbench can also negotiate `co.grida/media/workspace-reference`
version 1. `capture_image_reference` reads one relative PNG path in the
primary workspace through the native file grant. It retains the exact PNG
and returns an operation identity and relative path. The private receipt
holds the retained media identity. The chat model receives no image bytes
from capture.

`generate_image_from_workspace_reference` requires the exact capture
operation from the current active turn. The host checks its grant and
receipt and verifies the retained bytes. The reverse request supplies
`referenceOrigin: "workspace"`, the captured source's `referencePath`, and
the retained `referencePng`. Main uses the path in its transfer review and
omits it from the image service request. The captured version remains
available after a source edit. A previous turn's capture is refused.

The private Desktop supervisor can negotiate `co.grida/media/place-image`
version 1 alongside generation for an admitted workbench. The host captures
the binding for ordinary Act work. A retained generation on that binding
journals a verified owner receipt containing the media identity, MIME type,
length, and SHA-256. Provider history receives the opaque media and source
turn identities. It never receives the receipt digest.

`place_generated_image` takes a retained `media_id`, a relative `path`,
and the exact `source_turn_id` when reusing an image from an earlier turn in
the same chat. The reverse request carries the active session, turn and call,
the path, and the verified artifact receipt. Main owns destination review,
workspace and parent identity, retained byte verification, and scoped
publication. It distinguishes a new file, an exact file already at the
destination, a declined review, a conflicting file, and unavailable or
unverified work. Reconnect does not repeat a dispatched placement.

### Lifecycle check inspection

Private stdio clients can negotiate `co.grida/session/hooks` version 1 and call
`_co.grida/session/hooks` with an optional attached `sessionId`. Without a
session it returns the selected trusted policy and no results. With one it
projects current or latest retained check results. `supportedEvents`, `hooks`
and `results` are bounded; a result's `operation` is null when no operation was
admitted. Inspection neither discovers programs nor executes a handler. Trusted
host launch policy owns registration and executable authority. See the
[configuration binding](./rust-config.md#hook-definitions).

### Gateway settlement lookup

On a supervised Gateway connection, negotiate
`co.grida/gateway/billing-status` version 1. The private
`_co.grida/gateway/billing-status` request takes an attached `sessionId`
and the exact retained `turnId`, `operationId`, and `attemptId`.
The worker resolves the dispatch receipt under the captured Gateway scope.
Main reads the current status through its fixed authenticated jobs route.

The worker then asks the client for that job's settlement with the reverse
`_co.grida/gateway/read-job-billing` request, carrying only the opaque
`requestId` of the retained dispatch. The client answers within 15 seconds or
the lookup reports `unavailable`.

A response reports `kind` as `pending`, `unavailable`, or `settled`.
The settled response includes the exact decimal `chargedMills`. An
unavailable receipt can result from a missing dispatch identity, changed
scope, or a jobs response above 2 MiB. Lookup is observational and can be
repeated after reopening. The retained inference evidence stays intact.

With that capability negotiated, a settled turn summary can include
`gatewayBilling` with up to 32 `attempts` and an `omittedAttempts` count.
An optional `review` contains the same bounded fields for the exact funded
review assignment. The parent turn's committed delegation claim determines
the assignment, including when a named reviewer later performs other work.
The rows contain `operationId`, `attemptId`, `kind`, and `refreshable`.
Only a settled row has `chargedMills`. The projection reads retained evidence
for the captured Gateway scope without a jobs request. Desktop refresh takes
one eligible row from the attached latest settled turn and returns the current
observation without changing the original summary evidence.

A client that also negotiates `co.grida/gateway/child-billing` version 1 sees
named-subagent assignments funded under the same Gateway scope. The settled
turn summary's `gatewayBilling` then carries `children`: a page of up to 16
`assignments`, each with `childId`, `inputId`, `name`, input `disposition`, and
that assignment's bounded `billing` rows when retained. `nextAfter` holds the
`{childId, inputId}` cursor to pass as `childBillingAfter` on the next summary
read, and `coverageIncomplete` reports entries the parent's captured scope
cannot account for. A billing-status lookup for a child attempt adds the same
`child` reference and requires both capabilities. The page reads retained
links and makes no jobs request.

### Persistent goal operations

An attached private supervised Gateway client can additionally negotiate
`co.grida/goal/spending` version 1. Goal Start then accepts the separate optional
`maxCostMills` decimal string. The positive amount has at most 18 integer and
18 fractional digits. It captures one retained allocation shared by the parent
and funded children, including compaction. Other provider profiles refuse it.
Each request uses the fixed capped Gateway route with an enforced ceiling;
older deployments cannot fall back to ordinary execution.

Goal inspection adds `spending` with exact decimal strings `maxCostMills`,
`perRequestMaxCostMills`, `chargedMills`, `heldMills`, `remainingMills`, and the
integer `unsettledAttempts`. Charged plus held plus remaining equals the maximum.
The per-request ceiling is the initial amount divided by the initial inference
allowance, rounded down to 18 fractional digits; reclaiming a hold does not raise
it. Capped Goals admit at most 4,096 inference steps. Unknown outcomes retain
their holds, including after Stop. External paid or unknown tool lanes remain
unavailable. Queued input inspection retains the separate captured amount as
`settings.goalMaxCostMills`; retrying an accepted input cannot create a new
allocation. A worker unable to interpret that captured policy refuses execution.

Negotiate each `co.grida/goal/` capability at version `1`. The methods apply
to an attached session. Start accepts the same ACP prompt parts as Submit
and captures settings for the original request. Generated work retains the
original authority and selected settings and carries no new user message.

| Method suffix after `_co.grida/goal/` | Parameters and result                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`                               | `sessionId`, `inputId`, ACP `prompt`, and `goal`. Supply `objective` with `description` and `criteria`, and optionally `allowance` with positive `work_turns` and `inference_steps`; an omitted allowance receives the product default of 8 work turns and 64 inference steps. Set `automatic` to `true` inside `goal` to authorize later work. Returns the retained submission receipt. |
| `inspect`                             | `sessionId`. Returns `revision`, `stateRevision` and the bounded goal state, including its `basis`, status, allowance and held reservation. This does not claim work.                                                                                                                                                                                                                    |
| `control`                             | `sessionId`, `requestId`, `expectedSessionRevision`, `expectedStateRevision`, `basis` and `change`. Actions are `pause`, `resume`, `clear` and `revise` with a replacement `objective`. Returns the original session and state revisions and any affected turn's journal position.                                                                                                       |
| `recover`                             | `sessionId`. Reconsiders eligible work after a host restart. An interrupted dispatch remains bound to its original turn.                                                                                                                                                                                                                                                                 |

Start accepts the request as a queued input, also while a turn runs, other
input is queued or admission is paused. The goal begins when that input is
admitted in queue order: its first reservation, allowance and spending
ceiling apply then, and an idle chat with an open queue admits it at once.
Until then `inspect` reports no goal. A session holds one goal at a time:
Start returns `session_goal_exists` while a goal is active, blocked or holds a
reservation, and `session_goal_queued` while another goal start waits in the
queue. Effort, named-child, wake-up, hook and spending rules are checked when
Start is accepted. Automatic follow-ups wait behind queued user prompts. Their
acceptance, exact claim, and resource reservation commit together. Repeating
the same start or control preserves its receipt.
Before the first claim, queue and input inspection return the captured goal
under `settings.goalStart`. A queued start is reordered, withdrawn and kept
across a restart like any queued input, and waits for `resume-queue` when
admission is paused. Use the exact queue withdrawal to remove it. Replacing a
queued goal with a generic prompt returns `queued_goal_requires_withdrawal`.
Pause and Resume can reacquire the same suspended turn. Revising or clearing
an active goal cancels its reserved turn without discarding its uncertainty.
Clear an active or blocked goal before replacing an earlier message in the
same chat. A separate fork carries no goal authorization.

Private Goal Start can set `allowWakeups` to `true` with the same wake-up
capabilities as Submit. It applies only to the first Standard Act reservation.
An exact input retry keeps the original opt-in. A due check-in continues the
same Goal turn under its reserved steps. Goal Pause holds delivery, including
after a restart, and Goal Resume releases that hold. A cancelled check-in
requires the existing explicit cancelled-wakeup Resume. Goal recovery does
not continue it automatically. Automatic later Goal turns omit the opt-in.

For a funded review, the trusted private launch must support subagents and
the client must negotiate `co.grida/session/effort` version 1. Goal Start
accepts optional `effort` (`standard` or `ultra`), defaulting to `standard`.
Here, funding reserves inference steps; monetary spending is a separate
negotiated capability. All supported native inference connections can supply
the reviewer through the parent's captured execution.
Ultra requires at least three total inference steps. Its active reservation
includes a two-step child share in `reservation.child_inference_steps`.
Automatic continuation with fewer than three steps remaining uses Standard
and keeps the remaining Goal allowance. Reusing an accepted input ID requires
the same effort. While a funded turn owns work, use the ordinary task
Pause, Resume, or Stop operations. Goal-specific state controls return
`goal_use_task_controls_for_funded_review` in that case.

An attached private client can negotiate `co.grida/goal/named-child`
version 1. With Ultra and Act, Goal Start accepts `goal.named_child` for
one existing named child of the parent session. The choice is fixed for
that Goal. An eligible later reservation carries the same identity.
The Goal inspection reports `namedChildId` and the reservation's
`named_child` when present.

The existing review operation claims one exact assignment in that child
using the same funded share. Admission consumes one unit of the child's
ordinary allocation and rejects a competing use of the same share.
Controls and reconciliation follow that exact assignment. Later ordinary
assignments keep the child's conversation and their own accounting.

If a review is unsettled when the parent finishes, Goal inspection keeps the
held reservation and `uncertain_steps` records the attempts observed so far.
Inspection projects `effort: "ultra"` when the original Goal Start captured
Ultra. A private launch that supports effort can also negotiate
`co.grida/goal/funded-review` version 1. Use the exact `control` basis and
`change: {"action":"reconcile_review","turn":"<reserved turn ID>"}` to
account for an idle held review. It checks both recorded outcomes, preserves
the original turn account, and returns the same receipt on exact retry.
If either outcome is still unverified, it returns `goal_review_still_held`
and keeps the reservation. This control starts no work, including after
restart or after the goal has been cleared. Goal Recover can also account for
late settled work for headless clients.

To use person-confirmed completion, negotiate
`co.grida/goal/confirm-completion` version 1 when starting the goal. Goal
inspection may then include `review` with a status and the candidate's
`basis`, `turn`, and `summary`. A pending review stops automatic
continuation. After the person checks the result, use the existing `control`
method with `change: {"action":"confirm_completion","turn":"<candidate turn>"}`
and the exact current revisions. The resulting goal retains the confirmed
candidate and request identity. This control uses no inference allowance.

## Preserve lifecycle meaning

In v1, `session/prompt` completes with the turn's stop reason. It cannot return
early solely to acknowledge durable acceptance. In v2 Draft, prompt acceptance
and subsequent foreground state are separate, and idle can coexist with
background work. The adapter preserves the selected version's semantics.
[V1 prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn),
[v2 overview](https://agentclientprotocol.com/protocol/v2/overview).

The durable extension can submit identified work and return its committed
acceptance, then observe its outcome. This and standard prompt delivery enter
the same Sessions service. A client chooses one submission path for an input.
It never sends both to start the same task. RPC IDs correlate connection-local
calls. Durable input, turn, interaction, and operation IDs retain their internal
meaning and are exposed only as specified by the extension.

Question and approval delivery can hold an ordinary ACP prompt or interaction
RPC while an engine worker is suspended. Connection loss disposes that RPC, while retained work
follows the host lifetime contract. A capable reconnecting client receives a
fresh delivery of the same durable interaction. Human think time requires no
live model request or occupied worker.

A standard-only client receives only supported interactions. If execution
discovers a required interaction that the client cannot deliver, the host
safely suspends work and returns an error to the pending `session/prompt`, with
a useful explanation and recovery information. It sends no unadvertised
elicitation and assumes no standard ACP capability-error code. A capable client
can resume the retained work. Unresolved work cannot produce a successful
completion result.

Standard cancellation keeps the selected ACP meaning. A resumable pause uses
the negotiated pause operation. Tool display status never proves rollback or
that an external effect stopped. Authoritative operation outcomes and late
receipts remain inspectable through the durable contract.

ACP replay also has its own retention and identity rules. The v2 draft permits
non-persisted messages and does not guarantee all entity IDs across restarts.
Our durable receipts, retention, cursor gaps, and resynchronization rules remain
explicit guarantees of the Grida profile. [V2 session setup](https://agentclientprotocol.com/protocol/v2/session-setup).

## Transport and authority

The host serves standard newline-delimited ACP over stdio. Its authenticated
loopback WebSocket binding carries the same ACP vocabulary, with independent
client connections and explicit local authority and origin rules.
The reviewed standard specifies stdio, while remote transport is under review.
[ACP transports](https://agentclientprotocol.com/protocol/v1/transports).

Transport capabilities describe supported exchanges. Host authorization still
controls who may read a session, mutate configuration, answer an interaction, or
use a filesystem/editor capability. Additional workspace roots express session
context, and each actual access still needs its grant. A reconnecting observer
does not gain execution ownership.

An authenticated shared loopback client can negotiate approval inspection and
attach to a session. The private supervising stdio channel is the approval
writer. The working directory selects a matching native workspace profile
supplied at launch. It carries no filesystem authority on its own.

### Supervised provider egress

A host launched with `serve --stdio --supervised-provider` has no direct
network client for model requests. The supervising client negotiates
`co.grida/provider/egress` version 1, and the native adapter sends each
prepared provider request to it over the private pipe.

| Direction      | Method                        | Parameters and result                                                                                                                                                                                                                             |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent → client | `_co.grida/provider/exchange` | An exchange `id` and an `action`. `open` carries `target`, `headers`, `timeoutMs`, `maxResponseBytes`, and the first base64 body chunk in `initial`; `append` adds a chunk; `dispatch` sends the request; `read` returns the next response chunk. |
| Agent → client | `_co.grida/provider/cancel`   | Notification with the exchange `id` when the attempt is dropped or cancelled.                                                                                                                                                                     |

Replies report `accepted` for an open or append, `ready` with `httpStatus`,
optional `requestId`, and optional `retryAfterMs` after dispatch, `chunk` with
base64 `data` of at most 32 KiB decoded, `end`, `unavailable`, or
`interrupted`. Request bodies are at most 8 MiB, uploaded in 64 KiB chunks;
responses are at most 4 MiB within the caller's limit, and an exchange lasts at
most 120 seconds. A stored credential is revalidated after upload and before
dispatch. The client authorizes the exact route before dispatching. Any failure
before `dispatch`, or an `unavailable` reply to it, means the request was not
sent; a lost or invalid reply to `dispatch` or during reading leaves the
attempt interrupted. Desktop's Gateway
profile uses the same pipe and attaches its short-lived grant at dispatch.

### Configuration operations

The `co.grida/config/*` operations are client features: a person's own tooling
inspects, sets, resets and reloads defaults through them. Configuration
inspection reports `exact_input_counting` for the selected provider profile.
The flag describes a supported counting route. Each prepared request must
still return an exact count before an explicit limit can be used. The agent
changes settings only by editing the settings file, which asks for approval
like any other write ([agent edits](./rust-config.md#agent-edits)).

## Compatibility acceptance

- Drive ordinary sessions with a standard-only ACP client, including streaming,
  tools, supported permissions, cancellation, and unsupported optional features.
- Drive the enhanced Grida client through acceptance, duplicate retries,
  queue/steer/pause, interaction redelivery, and restart recovery. Compare the
  persisted outcome with the ordinary core contracts.
- Render specialized progress, media, and child views alongside their standard
  fallback. Verify actual Desktop interaction separately from message delivery.
- Exercise slow consumers, bounded frames, connection loss, unknown extensions,
  denied access, and protocol-version mismatch through the built executable.
  Include an oversized unterminated stdio line and too many outstanding calls.
  Reject or detach before allocating an unbounded frame or queue.

Built-executable fixture tests cover standard text streaming, cancellation,
replay, negotiated queue and task controls, stale credentials, independent
loopback clients, and bounded stdio delivery. Desktop rendering and interaction
have their own acceptance evidence, recorded with each feature in the
[feature catalog](../../../docs/agent/features.md).
