---
title: ACP Integration
description: An ACP-first client boundary with custom presentation, explicit capabilities, and durable execution semantics.
keywords:
  [
    agent-system,
    acp,
    agent-client-protocol,
    json-rpc,
    editor-integration,
    interoperability,
  ]
format: md
tags: [internal, wg, agent-system]
---

# ACP Integration

The proposed client boundary uses the Agent Client Protocol for shared agent
interactions and negotiated extensions for additional behavior. A host adapter
translates that protocol into the [component contracts](./components.md).
The [master](./master.md) owns strategy and product policy. Clients own their
presentation of the resulting content and state.

ACP adoption does not select a provider or delegate the native agent's strategy
to another agent. Consuming an external whole-agent backend is a separate
[integration choice](./acp-provider.md).

## Version and scope

The reviewed specification labels v1 Latest and v2 Draft. Implementations name
their supported version and negotiate optional features. Supporting a version
does not imply supporting every experiment. [ACP versions](https://agentclientprotocol.com/protocol/v2/migration).

The client protocol stays outside the neutral component vocabulary. Provider
streams, internal history, and durable journals may have different shapes.
The adapter performs an authorized projection of their meaning.

## Custom presentation

Standard messages carry streamed text and thoughts, media and resource content,
tool progress, and plans. Clients choose layout, grouping, tool cards, preview
styles, and reveal behavior. Specialized views keep usable ordinary content
for clients without their renderer. [Content](https://agentclientprotocol.com/protocol/v1/content),
[tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls).

Optional display hints can use schema-supported metadata. Additional operations
require negotiated extension methods and explicit results. An ignored display
hint cannot establish execution, permission, or successful presentation.
Incoming content and metadata remain untrusted. [Extensibility](https://agentclientprotocol.com/protocol/v1/extensibility).

## Capability matrix

Capabilities declare supported exchanges. Advertise an optional interaction
only when its complete behavior is available through the selected host.

| Surface                              | Contract                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Conversation and tools               | Standard content and progress, with client-owned presentation.                                           |
| Plans and slash commands             | Standard updates, with master-owned meaning and invocation behavior.                                     |
| Session options                      | Standard selectors where applicable. Persistent defaults keep their separate scope and activation rules. |
| Questions and permissions            | Supported request/response forms, correlated with retained engine interactions.                          |
| Reusable subagents                   | Standard observation where supported. Additional child controls require their own advertised semantics.  |
| Durable work                         | Explicit acceptance, control, retention, and recovery guarantees beyond baseline protocol delivery.      |
| Client filesystem and editor actions | Supported callbacks plus host-granted access to a specific resource and operation.                       |

The active subagent proposal initially permits child cancellation and restricts
direct child prompt, steering, configuration, and resume. A product promising
richer controls needs an extension or an upstream revision that defines them.
[Subagent proposal](https://agentclientprotocol.com/rfds/subagents).

## Tool kind mapping

Tool kind is a presentation classification. Map the actual operation to the
nearest standard category, such as read, edit, search, execute, or fetch. Use
the general category when no narrower kind fits. A kind, title, or tool name
confers no authority. The operation's declared scope and host grants determine
whether execution is permitted.

## Filesystem authority

A host may execute filesystem tools itself or delegate supported operations
to its client. The session selects that binding explicitly. A client's advertised
filesystem support alone does not select it or grant arbitrary access. Both
bindings preserve resource identity, conflict checks, and the host's authority
rules. [Filesystem protocol](https://agentclientprotocol.com/protocol/v1/file-system).

## Stream resume semantics

Loading or resuming a protocol session, reconnecting an observer, and resuming
paused execution are distinct operations. The selected ACP version determines
its history replay and prompt lifecycle. A durable implementation states its
additional retention, identity, acceptance, and execution guarantees explicitly.

V1 prompt responses report the finished prompt turn. The v2 draft separates
prompt acceptance from foreground state and permits messages without durable
retention. Neither contract substitutes for verified engine suspension or
settlement. [V1 prompt lifecycle](https://agentclientprotocol.com/protocol/v1/prompt-turn),
[v2 session semantics](https://agentclientprotocol.com/protocol/v2/session-setup).

An adapter can retain an open protocol interaction while releasing the engine
worker. Reconnection redelivers retained interactions under a supported recovery
contract. It cannot replay an old connection's request identifier as new authority.
Standard cancellation and resumable pause retain separate meanings.

## Naming seam

ACP owns wire names. Internal records keep the component vocabulary. Extensions
use their reserved names and a namespace controlled by their author. Adapters
validate the translation and reject unsupported operations explicitly.

## Transport

ACP standardizes a bidirectional JSON-RPC exchange over stdio. A custom binding
must preserve protocol semantics and document connection establishment. The
reviewed remote transport remains under specification. Transport selection
adds no access rights. [Transports](https://agentclientprotocol.com/protocol/v1/transports).

The native host's baseline, proposed extensions, client compatibility checks,
and later shared-service binding are defined in its
[client protocol proposal](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-client-protocol.md).
