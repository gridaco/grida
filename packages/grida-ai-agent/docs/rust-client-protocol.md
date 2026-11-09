# Native agent client protocol

Status is a design proposal for the fresh Rust host. The client boundary uses
**ACP first**, with negotiated extensions for product behavior the selected ACP
version cannot express. Desktop and headless clients share this boundary. The
[core proposal](./rust-core-proposal.md#native-executable-and-headless-host)
owns process lifetime, and the [feature catalog](../../../docs/agent/features.md)
owns the promised behavior.

## Baseline and ownership

The ACP documentation reviewed on 2026-11-09 labels v1 Latest and v2 Draft. Start with the
current v1 contract. Pin the schema and compatible Rust SDK revision when
implementation begins. Review v2 separately before adding or replacing a wire
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

Begin with an `acp.rs` module in `grida-agent`, using the upstream SDK. A second
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

Use ACP's reserved extension mechanism. Proposed capability keys use `co.grida/`
and custom methods use `_co.grida/`. The exact suffixes and schemas remain
provisional. Descriptive hints belong in schema-supported `_meta` fields.
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

Plain ACP remains useful for ordinary interactive work. Its pending prompt,
permission, or elicitation RPC may live in the host adapter while an engine
worker is suspended. Connection loss disposes that RPC, while retained work
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

Use ACP's standard newline-delimited stdio binding first. The proposed later
authenticated loopback WebSocket service is a Grida transport binding, with
documented connection and origin rules. It carries the same ACP vocabulary.
The reviewed standard specifies stdio, while remote transport is under review.
[ACP transports](https://agentclientprotocol.com/protocol/v1/transports).

Transport capabilities describe supported exchanges. Host authorization still
controls who may read a session, mutate configuration, answer an interaction, or
use a filesystem/editor capability. Additional workspace roots express session
context, and each actual access still needs its grant. A reconnecting observer
does not gain execution ownership.

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

These are planned checks. Source review has established a compatible direction,
and executable interoperability remains to be demonstrated.
