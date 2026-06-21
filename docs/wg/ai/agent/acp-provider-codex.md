---
title: "ACP Provider: Codex"
description: Provider profile for consuming Codex from an external agent system. Defines what Codex provides, how a host should adapt it into an ACP-consuming runtime, and the boundaries around tools, sessions, filesystem authority, and image generation.
keywords:
  [
    agent-system,
    acp,
    codex,
    codex-sdk,
    provider,
    image-generation,
    tools,
    sessions,
  ]
format: md
tags:
  - internal
  - wg
  - ai
---

# ACP Provider: Codex

This page is for an implementor building an **external ACP-consuming
agent system** that wants to use Codex as one of its agent providers.
It is a provider profile: what Codex can provide, what the consumer
must adapt, and where the current public surface ends.

It is intentionally not [ACP Integration](./acp.md). That page is for
an implementor building an ACP-compatible agent runtime. This page is
for an implementor consuming an external agent provider and normalizing
that provider into their own agent system.

It is one profile of the **agent-provider class** decided in
[ACP Provider Class](./acp-provider.md) — read that page first for
whether the host should host this class of provider at all, and what it
costs to do so.

## Position

Codex should be treated as an **agent provider**, not as a bare model
provider.

The consumer sends task prompts into a Codex thread and receives a
stream of agent events: messages, reasoning summaries, command
executions, file changes, MCP tool calls, web searches, and completion
usage. The consumer does not call a model directly, does not own the
tool loop, and does not directly invoke Codex's hosted tools.

```text
ACP-consuming host
  - owns product session, UI, policy, and provider registry
  - presents one normalized agent contract to the rest of the system
        |
        v
Codex provider adapter
  - starts or resumes a Codex thread
  - maps host session ids to Codex thread ids
  - maps Codex JSONL/thread events to the host's stream shape
  - copies or imports any generated artifacts into host-owned storage
        |
        v
Codex SDK / CLI / app-server
  - owns the Codex agent loop
  - chooses and calls available tools
  - applies its own sandbox, approvals, and tool availability rules
```

The adapter is a boundary. It MUST NOT pretend Codex is a normal LLM
completion endpoint, because that loses the semantics that make Codex
valuable: long-running turns, filesystem edits, command execution,
tool use, session continuation, and artifact creation.

## Public surfaces

Codex can be consumed through more than one public surface. A provider
adapter should choose the smallest surface that preserves the behavior
it needs.

| Surface                   | Use when                                                                 | Shape                                                            |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Codex SDK                 | A server-side application needs programmatic control of local Codex      | Thread API: start, resume, run, stream events                    |
| Codex non-interactive CLI | A pipeline wants a single task result or JSONL event stream              | Process execution: prompt in, final response or JSONL events out |
| Codex app / app-server    | A desktop host already embeds or supervises Codex locally                | Local service boundary; still agent-mediated                     |
| OpenAI API directly       | The consumer wants direct model or direct image generation without Codex | Responses API or Images API; not a Codex provider adapter        |

The current TypeScript Codex SDK is a wrapper around the `codex` CLI
and exchanges JSONL events with it. Its public surface is thread-based:
start a thread, run a prompt, stream events, resume a thread, and pass
thread options such as model, sandbox, network, and approval policy.

## Capability profile

The consumer SHOULD model Codex capabilities as provider capabilities,
not as guarantees. Tool availability depends on the Codex surface,
account entitlement, configuration, app/CLI version, sandbox, and
provider policy.

| Capability           | Provider contract                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Text turns           | Supported. The basic unit is a Codex thread run.                                                               |
| Streaming            | Supported by streamed events. The adapter SHOULD preserve item start/update/completion boundaries.             |
| Session continuation | Supported by thread reuse or resume. The consumer MUST persist the Codex thread id if it wants continuation.   |
| Local image input    | Supported by the SDK as structured `local_image` input.                                                        |
| Filesystem work      | Supported when the selected sandbox and working directory allow it. Authority remains with Codex for the turn. |
| Shell work           | Supported when sandbox and approval policy allow it.                                                           |
| Web search           | May be available as a Codex tool. Treat as negotiated or observed, not unconditional.                          |
| MCP tools            | May appear in Codex event streams as MCP tool calls when configured.                                           |
| Native image output  | May be available through Codex's built-in image generation tool. It is agent-mediated.                         |
| Direct tool calls    | Not exposed by the current public Codex SDK. The consumer prompts the agent; the agent chooses tools.          |

## Event mapping

A Codex provider adapter should preserve Codex's item model instead of
flattening everything into assistant text.

| Codex event/item      | Host stream equivalent                                          |
| --------------------- | --------------------------------------------------------------- |
| Agent message         | Assistant text part                                             |
| Reasoning summary     | Reasoning/thought part, if the host renders it                  |
| Command execution     | Tool call with `execute` kind                                   |
| File change           | File artifact/change event; optionally an edit/delete/move kind |
| MCP tool call         | Tool call with provider-qualified tool id                       |
| Web search            | Tool call or source-acquisition event with `fetch` kind         |
| Error item            | Recoverable stream error item                                   |
| Turn completed/failed | Turn lifecycle transition with usage or failure reason          |

The adapter SHOULD keep a durable transcript of provider events when
the host supports replay or debugging. Reconstructing tool behavior
from final assistant text is not sufficient for inspection, audit, or
resume.

## Session identity

The consumer owns its own product session id. Codex owns a provider
thread id. The adapter MUST store the mapping:

```text
host_session_id -> provider: "codex", provider_thread_id
```

The provider thread id is required for continuation. A host MAY fork
or replace the provider thread, but that is a host-level session
operation and should be visible in inspection output.

## Authority and sandbox

Codex is useful because it can act, not only answer. That also means
the adapter must be explicit about authority.

The consumer SHOULD decide per session:

- which working directory Codex receives;
- which sandbox mode Codex receives;
- whether network access is enabled;
- which approval policy applies;
- whether additional directories are visible;
- whether host secrets are inherited or deliberately withheld.

The consumer MUST NOT assume that its own ACP filesystem or terminal
delegation rules automatically apply inside Codex. Unless the consumer
is running a deeper ACP bridge, Codex executes through its own runtime
and emits the results back as events.

## Image generation

Codex image generation has two distinct paths that a consumer must not
conflate.

### Agent-mediated Codex image generation

In a Codex thread, the agent may have a built-in image generation tool
available. When available, the consumer can prompt Codex to create an
image artifact and then import the generated file into host-owned
storage.

The current Codex built-in image tool is not a direct SDK method. The
consumer cannot, through the current public Codex SDK, call something
like `generateImage()` or `callTool("image_generation")` without an
agent turn. The adapter can ask Codex to use the tool; Codex decides
whether and how to call it.

This has consequences:

- The host can request an image in the prompt, but cannot require a
  particular image model through the Codex SDK surface.
- The host should validate that a real artifact was produced before
  treating the turn as successful.
- The host should copy generated assets into host-owned storage; Codex
  cache paths are provider internals.
- The host should treat image generation availability as a capability
  discovered by configuration, entitlement, or a probe, not as a
  universal Codex guarantee.

### Direct OpenAI image generation

If the product needs direct image generation without an agent deciding
to call a tool, the provider is not Codex. Use the OpenAI Images API or
the Responses API hosted `image_generation` tool directly.

In the Images API, the caller chooses a GPT Image model directly. In
the Responses API, the caller chooses a mainline text-capable model
that supports the hosted `image_generation` tool; the image generation
process itself is handled by a GPT Image model. OpenAI documents the
possible GPT Image family as including `gpt-image-2`,
`gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini`, while the
Responses API `model` field remains a mainline model.

## Image model finding

Public documentation does not establish a stable contract that Codex's
built-in `image_gen` always uses one fixed image model.

The grounded model statement is:

- Codex exposes an agent-mediated image generation capability when the
  tool is available.
- The public OpenAI image generation docs identify GPT Image models as
  the image-generation family and list `gpt-image-2` as the current
  GPT Image 2 model for direct Image API workflows.
- The Responses API hosted `image_generation` tool delegates image
  production to a GPT Image model, but the caller selects a mainline
  model for the outer response.
- Codex's public imagegen skill guidance says the CLI fallback defaults
  to `gpt-image-2`; that statement applies to the explicit fallback
  CLI/API path, not necessarily to the built-in Codex tool path.

Therefore a consuming system SHOULD record the requested provider
surface (`codex` built-in vs direct OpenAI image API) and the observed
artifact metadata, but SHOULD NOT expose "Codex image model" as a
stable user-selectable field unless Codex exposes that control.

## Why Codex is useful as a provider

Codex is valuable when the host wants an external agent that can own a
software task end-to-end:

- It can reason over a repository and execute a multi-step turn.
- It can read and write files under sandbox policy.
- It can run commands and tests.
- It can use configured tools and MCP servers.
- It can preserve thread state across turns.
- It can generate project artifacts, including images when the tool is
  available.
- It emits structured events that a host can map into an inspectable
  agent transcript.

Codex is less appropriate when the host only needs a primitive:

- single text completion;
- direct image generation with explicit image-model controls;
- direct tool invocation without agent planning;
- strict ACP filesystem/terminal delegation controlled entirely by the
  outer client.

In those cases, a direct OpenAI API provider or an ACP-native agent may
be the cleaner boundary.

## Consumer obligations

A correct Codex provider adapter SHOULD:

- persist host session id to Codex thread id mapping;
- stream structured Codex events, not only final text;
- preserve provider event order;
- surface command, file, MCP, and web-search items as first-class
  transcript parts;
- make sandbox, approval, network, and working-directory policy
  explicit per session;
- validate produced files before importing them as artifacts;
- copy generated artifacts into host-owned storage;
- expose capability uncertainty instead of assuming every Codex
  surface has every tool;
- keep direct OpenAI API image generation as a separate provider path.

It SHOULD NOT:

- treat Codex as a raw model-completion API;
- hide tool and command activity inside a final assistant message;
- expose direct `image_generation` tool control unless Codex exposes
  that control on the consumed surface;
- assume the hosted image model used by Codex's built-in image tool is
  stable or user-selectable;
- let provider cache paths become product artifact paths.

## References

- [Codex SDK](https://developers.openai.com/codex/sdk)
- [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)
- [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation)
- [Responses API image generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation)
- [Agent Client Protocol](https://agentclientprotocol.com/)
