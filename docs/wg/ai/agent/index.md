---
title: Agent System (WG)
description: A fresh agent design defined through user expectations, the product master, and agnostic execution components.
keywords: [agent, agent system, product, harness, components, durability]
format: md
sidebar_position: 0
tags: [internal, wg, ai, architecture]
---

# Agent System (WG)

This working group defines an agent system through reusable mechanisms,
product decisions, and expected behavior. The three proposals below establish
the contract for a fresh implementation.

Start with the compact [Agent Features](../../../agent/features.md) catalog for
the product's features, delivery status, and scope. The documents below provide
the detailed behavior and engineering contracts behind that catalog.

| Product review order               | Defines                                                                                                               | Reader                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [User experience](./experience.md) | What a person can expect, including Agent effort presets, control over ongoing work, and how each finished turn reads | Anyone deciding whether the product behaves usefully |
| [Master](./master.md)              | The product harness that selects context, tools, models, agent effort, verification, and completion                   | Product designers and agent engineers                |
| [Components](./components.md)      | Messages, inference, tools, history, context, runtime, and durable sessions                                           | Engineers implementing reusable mechanisms           |

Engineering starts with Components. Establish their responsibilities,
dependency direction, and invariants before shaping the master around them.
Then use distinct masters and the experience scenarios to test whether those
contracts are sufficient. Product review starts with User experience so that
the resulting behavior remains the measure of success.

These are design proposals. Their requirements describe the product to build.
Release availability belongs in the documentation for each shipped product.
The proposals are language- and stack-agnostic. Implementations choose their
language, storage engine, provider adapters, and client protocols while
satisfying the stated contracts.

The concrete Rust design includes a
[native sandbox proposal](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-sandbox-proposal.md)
with the srt replacement, launch contract, platform boundaries, and source study.

The native delivery includes a headless agent executable. Its service and
unattended entrypoints run the same master and components used by Desktop.
Desktop, automation, and test clients exercise one execution contract. The
[executable design](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/rust-core-proposal.md#native-executable-and-headless-host)
defines process boundaries, interaction policy, and machine-readable outcomes.
The [ACP integration contract](./acp.md) defines the shared client vocabulary
and how custom presentation and durable controls extend it.
The [hooks contract](./hooks.md) defines configurable lifecycle automation and
its boundaries against observers, permissions, and completion.

## Design ownership

The feature catalog owns feature identity, minimum promises, delivery status,
and scope. Experience owns their detailed behavior and acceptance scenarios.
Master owns how product decisions fulfill those promises. Components owns
independently usable mechanisms and execution correctness. A change to a promise
must be reflected in the responsible master behavior and in any component
contract it requires.

The master is deliberately thin in infrastructure and expressive in policy.
It can create a different kind of agent by selecting a different strategy and
composition of components. Components retain their meaning across products.
Task quality, useful initiative, context relevance, and appropriate completion
are evaluated at the master and experience layers.

Codex and Zed are peer implementation references for this study. Their code
supplies examples of execution mechanisms, integration constraints, and product
choices. Each proposed invariant still needs its own rationale and conformance
case. [Codex source](https://github.com/openai/codex),
[Zed source](https://github.com/zed-industries/zed).

## Vocabulary

The [components proposal](./components.md) owns the execution vocabulary.
Across these documents, a **session** contains an ongoing conversation and its
work, a **turn** addresses accepted input, and an **effect** is an operation
that can change or interact with the outside world. The **master** is the
product's decision-making harness. The **host** supplies execution capabilities
and grants their authority. A **client** presents the experience and submits
user intent.

An agent combines a master with its selected components and capabilities.
Prompts, tools, and model settings are part of that composition. Its strategy
can include planning, review, retrieval, and delegation as required by the
product contract.

## Cross-cutting invariants

Execution requirements are specified in [Components](./components.md), including
single ownership of session state, durable acceptance, captured decisions,
correlated results, cancellation, and recovery. Host authorization bounds every
operation. Explicit denials remain effective through composition and delegation.
The [Master](./master.md) chooses work within those bounds.

The product's [acceptance scenarios](./experience.md#judge-the-experience-by-outcomes)
connect these requirements to observable behavior. Performance comparisons must
state the task, success criteria, available capabilities, and resource allowance.

## Earlier design studies

The following pages retain detailed studies and contracts from the earlier
agent design. They are useful source material when refining a component or
product behavior. The three proposals above govern the rebuild where their
requirements differ. Each older page's implementation or feature-status claims
remain scoped to the design it describes.

In particular, the earlier fixed tool profile, universal loop, internal stream
format, storage schema, and default queue-drain behavior are earlier design
choices. Their concrete representations do not constrain the fresh design.
The product's new Stop behavior pauses automatic queue advancement until the
user resumes it.

| Topic                         | Existing studies                                                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundations and environment   | [Foundations](./foundations.md), [Environments](./environments.md), [Execution authority](./execution-authority.md), [Existing sandbox backend](./srt.md)                                                                                                         |
| Durable work and control      | [Session lifecycle](./session.md), [Persistency](./persistency.md), [Turn queue](./queue.md), [Turn authority](./turn-authority.md), [Lifecycle events](./events.md)                                                                                              |
| Capability and context design | [Tools](./tools.md), [Tool design](./tool-design.md), [Skills and project instructions](./skills.md), [MCP and connectors](./mcp.md), [Visual perception](./vision.md), [Binary files](./binary.md), [Scratch](./scratch.md), [Workspaces](./workspace.md)        |
| Product behavior              | [Compositor](./compositor.md), [UX patterns](./ux.md), [Plan mode](./mode-plan.md), [Subagents](./subagents.md), [Triggers](./triggers.md), [Cost optimization](./cost-optimization.md)                                                                           |
| Inspection and hosting        | [Debugging](./debugging.md), [Local daemon](./daemon.md), [FAQ](./faq.md)                                                                                                                                                                                         |
| Protocol and provider studies | [ACP integration](./acp.md), [ACP provider class](./acp-provider.md), [Codex provider profile](./acp-provider-codex.md), [Subscription provider](./chatgpt-subscription-provider.md), [AI SDK](./ai-sdk/index.md), [Vision lowering](./ai-sdk/vision-lowering.md) |

[Grida bindings](../grida/index.md) describe the existing product's concrete
integration. They remain a separate reference for that implementation.
