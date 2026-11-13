# Native agent client protocol

The source-built native host implements **ACP first**, with negotiated
extensions for product behavior the selected version cannot express. This
document distinguishes the available wire contract from later Desktop and
client integrations. The
[core proposal](./rust-core-proposal.md#native-executable-and-headless-host)
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
directory and optional title. Treat `nextCursor` as opaque and send it with
the same workspace.
Listing leaves attachment, execution, and history unchanged. [ACP session listing](https://agentclientprotocol.com/protocol/v1/session-list)

Negotiate `co.grida/session/organize` version 1 for archived listing and
catalog changes. `_co.grida/session/list-archived` accepts the standard
workspace and cursor fields and returns the standard page shape.
`_co.grida/session/catalog-entry` accepts an attached `sessionId` and
returns `sessionId`, `title`, `archived`, and `revision`.
`_co.grida/session/organize` replaces the title and archive state at that
revision. Send a null title to clear it. An already-matching value succeeds
without another write. On a revision conflict, read the current entry before
asking the user to reapply the edit. Archiving and restoring preserve chat
identity and leave execution controls unchanged.

On macOS and Linux, negotiate `co.grida/session/delete` version 1 on private
stdio. Send `_co.grida/session/delete` with `sessionId`, absolute workspace
`cwd`, a stable `requestId`, `expectedSessionRevision` from the session
snapshot, and `expectedCatalogRevision` from the catalog entry. A new
deletion requires an attachment. On success, the response identifies the
retired `sessionId` and `requestId`. The exact request can recover its receipt
after reconnecting without reattaching. The retired identity is unavailable
for future attachment or execution.

Deletion requires idle, resolved work and an empty queue. A concurrent
transcript replay or catalog read can require a retry. An open side chat, a
pending wake-up, an unfinished Goal, or unresolved execution evidence blocks
deletion. To include owned named subagents, negotiate
`co.grida/session/delete-preview` version 1 and call
`_co.grida/session/delete-preview` with the attached `sessionId` and `cwd`.
The response contains `sessionId`, `ownedChildren`, and `ownedChildrenBasis`.
Show the count for review, then pass the unchanged basis as `expectedOwnedChildren`
when deleting. The host requires the reviewed membership and revisions, and
all owned work must be idle, resolved, and free of queued input. An older client
without the basis can delete eligible chats that have no named subagents.
The host removes verified chat-owned attachment and
working data before returning success. If the database commit outlives removal,
restarting the private host or retrying the exact request can complete removal.
Independent forks retain their own copied prefix. Workspace files, exported
copies, and the legacy chat archive have separate owners.

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
layout. Zed demonstrates custom native conversation, tool, and subagent views
on top of ACP data. Its pinned dependency enables experimental protocol support,
so those views alone do not establish stable interoperability for every feature.
[ACP content](https://agentclientprotocol.com/protocol/v1/content),
[tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls),
[elicitation](https://agentclientprotocol.com/protocol/v1/elicitation),
[Zed dependency](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/Cargo.toml),
[Zed conversation UI](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/agent_ui/src/conversation_view/thread_view.rs).

The Grida client owns specialized renderers. It can use optional metadata for
result kinds, progress grouping, and known view hints. Streamed model content
and external metadata remain untrusted data. They cannot install executable
renderers or authorize an action. Required client actions use negotiated,
validated capabilities with correlated results and executor-declared recovery.

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
| Host configuration | Typed persistent-default inspection, set/reset, revision checks, and reload. The [configuration proposal](./rust-config-proposal.md) owns the field semantics.                                                                                                                               |
| Client surfaces    | Resource access or editor actions missing from standard ACP, plus optional structured view data. Each action has a capability schema and required authority. The adapter preserves call and endpoint correlation. Domain fields follow the capability. Pure styling requires no operation.   |

These families organize the review. They do not enable every listed action as
one broad capability. Advertise each supported operation/version, constrain its
target, and implement it only with its feature slice. Standard transcript and
tool content remain useful when a client omits the extensions. Grida Desktop
negotiates the operations needed for its complete experience.

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
account. Earlier accounts may omit tool counts. A missing summary uses the
recorded terminal status as a fallback.

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

A queue basis contains `sessionId`, `requestId`, and
`expectedSessionRevision`. A task basis adds `turnId` and
`expectedControlRevision`. Snapshot returns the ordered queue and turn
summaries, with `sessionRevision`, `controlRevision`, `historyPosition`,
`journalPosition`, and turn `epoch` for conditional operations.

Private stdio clients can negotiate `co.grida/session/updates` version 1.
Already attached sessions then receive standard `session/update` assistant
chunks for identified submissions, queued work, and resumed turns. The
notification's `_meta["co.grida/session/updates"]` contains `turnId`,
`offsetBytes` (UTF-8), and `replace`. A replacement starts with the
recorded message text at offset zero. Apply it to the identified message
before appending later chunks. A `resyncRequired` notice has no text and
asks the client to reload committed history. Observation owns neither work
admission nor cancellation.

| Method suffix after `_co.grida/session/` | Parameters and result                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit`, `enqueue`                      | `sessionId`, `inputId`, ACP `prompt`. Submit selects idle work. Enqueue accepts waiting work. Both return `inputPosition`, `disposition`, and the `turnId` once selected.                               |
| `snapshot`                               | `sessionId`. Read the bounded session summary without claiming work.                                                                                                                                    |
| `input`                                  | `sessionId`, `inputId`. Read the accepted prompt, captured settings, and retained receipt.                                                                                                              |
| `replace`                                | Queue basis in `queue`, `inputId`, `replacementInputId`, ACP `prompt`. Retain the slot and supersede the prior input.                                                                                   |
| `withdraw`, `reorder`                    | Queue basis in `queue`, plus `inputId` or the complete ordered `inputIds` list.                                                                                                                         |
| `resume-queue`                           | Flat queue basis. Reopen queue admission and schedule eligible waiting work.                                                                                                                            |
| `stop`, `pause`                          | Flat task basis. Return the committed control receipt. Stop also pauses queue admission. Pause becomes verified when the turn reports `suspended`.                                                      |
| `resume`                                 | Task basis in `task`, `expectedEpoch`, `expectedJournalPosition`. Claim the verified suspension and clear its task pause. Return the claimed turn summary.                                              |
| `steer`                                  | Task basis in `task`, `expectedHistoryPosition`, ACP `prompt`. Append the correction to the targeted turn and return the committed receipt.                                                             |
| `questions`                              | `sessionId`, `turnId`. Read pending question identities, prompts, choices, and the current control/history basis.                                                                                       |
| `answer-question`                        | Flat task basis plus `expectedHistoryPosition`, `waitId`, and `answer`. Commit a typed answer and its correlated contribution.                                                                          |
| `approvals`                              | `sessionId`, `turnId`. Read pending approval requests and their wait IDs with the current control revision.                                                                                             |
| `answer-approval`                        | Flat task basis plus `waitId` and `decision`. Commit a decision for the exact recorded action. Available on private supervising stdio.                                                                  |
| `history`                                | `sessionId`, optional `view`, `offset`, and `expectedHistory`. Read visible message anchors, previews, and any seed lineage.                                                                            |
| `revision-target`                        | `sessionId`, visible `messageId`, and `expectedSessionRevision`. Read the original editable text, its effort and reasoning level, exact current basis and anchor, and subsequent visible message count. |
| `fork`                                   | `sessionId`, `requestId`, `expectedHistory`, and `anchor`. Return the independent `sessionId` for a committed prefix through that message.                                                              |
| `revise`                                 | Fork parameters plus `expectedSessionRevision`, `replacementInputId`, ACP `prompt`, and optional `allowConfigurationChanges`, `effort` and `reasoning`. Return the installed view and accepted input.   |
| `compact`                                | `sessionId`, `requestId`, and optional `recover`. Run or inspect one retained context compaction. Return its status and available usage/failure evidence.                                               |
| `skills`                                 | `sessionId`. Read names, descriptions, sources, and versioned ACP resource-link URIs for available skills.                                                                                              |

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
and optional `seed` provenance. It also returns `latestAnchor` for the latest
visible message in that same basis, or null for an empty view. Older hosts
may omit this field. Echo the basis as `expectedHistory` on later pages and
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

Private stdio advertises `promptCapabilities.image` with the native GPT-5.4
Responses profile on macOS and Linux. `session/prompt`, Submit, Enqueue, and
Replace accept one ACP `image` block with `mimeType: "image/png"` and base64
`data`. Its `uri` must be absent. The encoded PNG may be up to 256 KiB before
base64 encoding. The host checks decoded image bounds, limits each chat to 16
retained images and 2 MiB of source bytes, and rejects the full input if an
image cannot be accepted. Readback identifies the image with a text marker.
Only the original digest and identity are in conversation records. Resume
verifies the exact retained bytes before dispatch. A fork or compaction can
omit earlier image content and records that omission. Image steering, earlier
message replacement, and shared WebSocket intake are unavailable.

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

An attached snapshot can include `retryNotBeforeMs`, a Unix time in
milliseconds for the current turn's retained provider retry. It is the earliest
dispatch time, subject to the same authority and task controls as the original
request. Pause holds the retry and Stop closes it. The value is absent when
there is no current retry.

Clients negotiate both question operations to enable the corresponding tools
for newly accepted input. Answers use `{ "kind": "text", "text": "..." }`,
`{ "kind": "choice", "index": 0 }`, or `{ "kind": "skipped" }`.
Keep the request identity and all parameters stable when retrying. Accepted
answers retain a scheduling wake across concurrent worker completion and
capacity changes. An explicit task pause is independent of answer receipt.
An embedded `run --questions` returns a verified `input_required` result and
exit code `6` when it suspends for an answer.

### Temporary side chats

Private stdio clients negotiate all three version-1 keys under
`co.grida/side-chat/`. Side chat IDs belong to the current connection.

| Method suffix | Parameters and result                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`        | `sessionId`, `requestId`. Capture an attached parent's current context and return `sideChatId`, `parentSessionId`, `sourceContext`, policy, and omission information. |
| `ask`         | `sideChatId`, `requestId`, `text`. Run one side turn and return `turnId`, `status`, `account`, and `textTruncated`.                                                   |
| `close`       | `sideChatId`. Stop active side work, verify worker shutdown, and discard the temporary conversation.                                                                  |

An open retry returns the original capture while the side chat is open.
An ask retry with identical text returns its recorded terminal account.
One question can run per side chat at a time. Each question accepts at most
16 KiB of text. The response caps answer text at 64 KiB. The connection can
open up to four chats at once, with six turns per chat and 32 open requests
over the connection's lifetime. Disconnect closes the temporary chats.
The host uses the existing selected model with no tool inventory. Source
context uses the installed summary and committed suffix when available.
Parent controls and history are independent of side execution.

### One-shot task wake-ups

Private stdio clients negotiate `co.grida/session/wakeups`,
`co.grida/session/cancel-wakeup`, and `co.grida/session/recover-wakeup` version

1. Set `allowWakeups: true` on the identified Submit to offer the schedule
   tool for that task. The setting is retained and must agree on input retries.
   The host accepts one wake-up for the same task with a delay up to seven days.

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

Subagent observation has an active ACP proposal. Its initial client mutation is
child cancellation, with direct prompt, steering, configuration, and resume
restricted. Our richer reusable-child controls therefore need negotiated
semantics for each target and operation. Observing a child or negotiating
durable sessions alone grants none of those controls. The fork proposal leaves
arbitrary checkpoint selection outside its initial scope. Reassess these drafts before implementing the corresponding
feature, and prefer a matching upstream contract when available.
[Subagent RFD](https://agentclientprotocol.com/rfds/subagents),
[fork RFD](https://agentclientprotocol.com/rfds/session-fork).

Hook inspection/configuration uses the host-configuration extension when its
schema is reviewed. Hook progress and failures have ordinary tool/notice
projections, with optional attributed detail for the Grida client. The host
advertises actual lifecycle coverage for native and external backends.
Subscribing to those updates never invokes a hook.

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

On the supervised Desktop connection, the client and agent negotiate
`co.grida/session/editor-svg-text` version 1 alongside editor surfaces.
An immediate Act text submission may carry `editorSvgTargetId` with its
`editorEndpointId`. This is the renderer's opaque capture of the current
workspace SVG selection. The submission retains the original capture on retry.
Queued inputs and check-ins have no SVG target.

The reverse `_co.grida/editor/svg-selected-text` request carries the exact
`sessionId`, `endpointId`, `targetId`, `callId`, and `expiresAtMs`, with a
`read` or `replace` operation. Replacement requires the opaque revision from
read and at most 4 KiB of valid SVG text. A verified response echoes the four
identities and carries `result`. Applied and unchanged replacement results
report `saved: false`. Unavailable or stale targets supply a domain failure.
Malformed, lost, or uncorrelated replies leave the tool outcome uncertain.

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
[configuration binding](./rust-config-proposal.md#hook-definitions).

### Gateway settlement lookup

On a supervised Gateway connection, negotiate
`co.grida/gateway/billing-status` version 1. The private
`_co.grida/gateway/billing-status` request takes an attached `sessionId`
and the exact retained `turnId`, `operationId`, and `attemptId`.
The worker resolves the dispatch receipt under the captured Gateway scope.
Main reads the current status through its fixed authenticated jobs route.

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

| Method suffix after `_co.grida/goal/` | Parameters and result                                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`                               | `sessionId`, `inputId`, ACP `prompt`, and `goal`. Supply `objective` with `description` and `criteria`, and `allowance` with positive `work_turns` and `inference_steps`. Set `automatic` to `true` inside `goal` to authorize later work. Returns the retained submission receipt. |
| `inspect`                             | `sessionId`. Returns `revision`, `stateRevision` and the bounded goal state, including its `basis`, status, allowance and held reservation. This does not claim work.                                                                                                               |
| `control`                             | `sessionId`, `requestId`, `expectedSessionRevision`, `expectedStateRevision`, `basis` and `change`. Actions are `pause`, `resume`, `clear` and `revise` with a replacement `objective`. Returns the original session and state revisions and any affected turn's journal position.  |
| `recover`                             | `sessionId`. Reconsiders eligible work after a host restart. An interrupted dispatch remains bound to its original turn.                                                                                                                                                            |

Start requires idle work and an empty queue. Automatic follow-ups wait behind
queued user prompts. Their acceptance, exact claim, and resource reservation
commit together. Repeating the same start or control preserves its receipt.
Before the first claim, queue and input inspection return the captured goal
under `settings.goalStart`. Use the exact queue withdrawal to remove it.
Replacing a queued goal with a generic prompt returns
`queued_goal_requires_withdrawal`.
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

For model-facing configuration tools, negotiating `co.grida/config/inspect`
enables inspection on newly accepted enhanced inputs. Mutation tools additionally
require all three configuration capabilities and an explicit
`allowConfigurationChanges: true` in `submit`, `enqueue` or `replace`. The flag
defaults to false and is retained with the accepted input. A request for changes
without those capabilities fails before acceptance. Queue inspection reports
the captured `configurationPermission` as `disabled`, `inspect` or `change`.
Retry preserves the effective configuration write permission for the input.
Configuration inspection reports `exact_input_counting` for the selected
provider profile. The flag describes a supported counting route. Each prepared
request must still return an exact count before an explicit limit can be used.

## Acceptance before claiming compatibility

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
loopback clients, and bounded stdio delivery. Desktop presentation and later
interaction, tool, and child capabilities require their own acceptance.
