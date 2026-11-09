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

A queue basis contains `sessionId`, `requestId`, and
`expectedSessionRevision`. A task basis adds `turnId` and
`expectedControlRevision`. Snapshot returns the ordered queue and turn
summaries, with `sessionRevision`, `controlRevision`, `historyPosition`,
`journalPosition`, and turn `epoch` for conditional operations.

| Method suffix after `_co.grida/session/` | Parameters and result                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit`, `enqueue`                      | `sessionId`, `inputId`, ACP `prompt`. Submit selects idle work. Enqueue accepts waiting work. Both return `inputPosition`, `disposition`, and the `turnId` once selected.   |
| `snapshot`                               | `sessionId`. Read the bounded session summary without claiming work.                                                                                                        |
| `input`                                  | `sessionId`, `inputId`. Read the accepted prompt, captured settings, and retained receipt.                                                                                  |
| `replace`                                | Queue basis in `queue`, `inputId`, `replacementInputId`, ACP `prompt`. Retain the slot and supersede the prior input.                                                       |
| `withdraw`, `reorder`                    | Queue basis in `queue`, plus `inputId` or the complete ordered `inputIds` list.                                                                                             |
| `resume-queue`                           | Flat queue basis. Reopen queue admission and schedule eligible waiting work.                                                                                                |
| `stop`, `pause`                          | Flat task basis. Return the committed control receipt. Stop also pauses queue admission. Pause becomes verified when the turn reports `suspended`.                          |
| `resume`                                 | Task basis in `task`, `expectedEpoch`, `expectedJournalPosition`. Claim the verified suspension and clear its task pause. Return the claimed turn summary.                  |
| `steer`                                  | Task basis in `task`, `expectedHistoryPosition`, ACP `prompt`. Append the correction to the targeted turn and return the committed receipt.                                 |
| `questions`                              | `sessionId`, `turnId`. Read pending question identities, prompts, choices, and the current control/history basis.                                                           |
| `answer-question`                        | Flat task basis plus `expectedHistoryPosition`, `waitId`, and `answer`. Commit a typed answer and its correlated contribution.                                              |
| `approvals`                              | `sessionId`, `turnId`. Read pending approval requests and their wait IDs with the current control revision.                                                                 |
| `answer-approval`                        | Flat task basis plus `waitId` and `decision`. Commit a decision for the exact recorded action. Available on private supervising stdio.                                      |
| `history`                                | `sessionId`, optional `view`, `offset`, and `expectedHistory`. Read visible message anchors, previews, and any seed lineage.                                                |
| `fork`                                   | `sessionId`, `requestId`, `expectedHistory`, and `anchor`. Return the independent `sessionId` for a committed prefix through that message.                                  |
| `revise`                                 | Fork parameters plus `expectedSessionRevision`, `replacementInputId`, ACP `prompt`, and optional `allowConfigurationChanges`. Return the installed view and accepted input. |
| `compact`                                | `sessionId`, `requestId`, and optional `recover`. Run or inspect one retained context compaction. Return its status and available usage/failure evidence.                   |

History returns `basis`, `sessionRevision`, up to 128 `messages`, `nextOffset`,
and optional `seed` provenance. Echo the basis as `expectedHistory` on later
pages and writes. A changed basis requires a fresh history read. Anchors are
scoped to the selected view and carry either a local turn and message ID or an
inherited message ID. `view` can read an earlier retained view. Standard session
load replays the current view in the same causal order.

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
configuration-change opt-in as a new submission. Retrying a revision returns
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

The host advances waiting work after verified settlement while admission is
open. Observation stays independent of scheduling. After a restart, Resume
Queue can wake retained waiting work, and Resume Task checks captured settings
and current authority before reacquiring a suspended turn. A credential change
blocks dispatch under an earlier captured authority.

Clients negotiate both question operations to enable the corresponding tools
for newly accepted input. Answers use `{ "kind": "text", "text": "..." }`,
`{ "kind": "choice", "index": 0 }`, or `{ "kind": "skipped" }`.
Keep the request identity and all parameters stable when retrying. Accepted
answers retain a scheduling wake across concurrent worker completion and
capacity changes. An explicit task pause is independent of answer receipt.
An embedded `run --questions` returns a verified `input_required` result and
exit code `6` when it suspends for an answer.

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
