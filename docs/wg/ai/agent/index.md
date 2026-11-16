---
title: Agent System (WG)
description: The agent system's behavior, product policy, and agnostic execution component contracts.
keywords: [agent, agent system, product, harness, components, durability]
format: md
sidebar_position: 0
tags: [internal, wg, ai, architecture]
---

# Agent System (WG)

This working group defines an agent system through reusable mechanisms,
product decisions, and expected behavior. The three documents below are its
current contracts.

For architectural or feature changes, start with the
[architecture rings and placement rules](#architecture-rings) before choosing
an implementation owner.

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

These are the current behavior, policy, and component contracts. Release
availability for each feature belongs to the feature catalog. The contracts are
language- and stack-agnostic. Implementations choose their
language, storage engine, provider adapters, and client protocols while
satisfying the stated contracts.

The native implementation's
[sandbox binding](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-sandbox.md)
defines native command confinement, its launch contract, and platform
boundaries.

The native implementation includes a headless agent executable. Its service and
unattended entrypoints run the same master and components used by Desktop.
Desktop, automation, and test clients exercise one execution contract. The
[executable design](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-core.md#native-executable-and-headless-host)
defines process boundaries, interaction policy, and machine-readable outcomes.
The [ACP integration contract](./acp.md) defines the shared client vocabulary
and how custom presentation and durable controls extend it.
The [hooks contract](./hooks.md) defines configurable lifecycle automation and
its boundaries against observers, permissions, and completion. The
[permission policy](./permissions.md) defines presets, scoped rules, and
approval, and [Workspaces](./workspace.md) defines folder binding and
authority during work.

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

Each invariant carries its own domain rationale and conformance case. No
other implementation serves as the model for these contracts.

## Architecture rings

This section owns the agent system's ring vocabulary and placement rules.
Implementation bindings map these responsibilities to packages and enforce
their dependency budgets. Skills and contribution instructions route here;
they do not maintain a second definition of the rings.

Rings classify responsibility, independently of language, process, storage
technology, and the size of a change. The numbers do not denote security
privilege. Use the name with the number when discussing ownership.

| Ring                      | Owns                                                                                                                            | Keeps outside                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **R0 — Contracts**        | Shared values, capability interfaces, pure transformations, and execution invariants that retain their meaning across products. | Product preferences, concrete transport, storage, credential custody, and presentation.        |
| **R1 — Mechanisms**       | Reusable execution, durable sessions, provider adaptation, storage adapters, and confinement implementing those contracts.      | Product strategy, model defaults, account offerings, and user-interface behavior.              |
| **R2 — Product policy**   | The product master: selection of context, models, tools, effort, continuation, verification, and completion.                    | Concrete provider construction, database access, server startup, and application presentation. |
| **R3 — Host composition** | Assembly of the product and its capabilities, authority and credentials, product-setting persistence, and client protocols.     | A second agent strategy or task loop independent of the master.                                |

Application presentation and convenience state sit outside the agent rings.
A client submits intent and presents results. Layout, previews, popover state,
and a local composer preference need no agent abstraction solely because they
appear in chat. State whose promise includes session continuity, recovery, or
use by another client belongs to the product host rather than a particular
view's local state. Its storage technology does not determine its owner.

R0 has no outward dependency. Mechanisms depend on contracts; product policy
uses execution and supplied capabilities; the host selects concrete
implementations. This is a dependency graph, not a requirement to import every
intermediate ring. Mechanisms in R1 are siblings with explicit dependency
budgets: a storage adapter may implement a session-store contract, while the
runtime does not acquire the session service or a database. A master receives
provider and storage capabilities without constructing their adapters.
Execution location is a separate concern: sharing a process does not merge
owners, and crossing a process does not make policy generic.

The master is thin in infrastructure, not in decision-making. A product can
change its strategy by replacing policy while retaining execution semantics.
A reusable mechanism can require a supplied policy without choosing that
policy itself. New generic contracts need a product-independent meaning and
conformance evidence; moving a product condition behind an interface alone
does not make it reusable.

### Placing a change

Before selecting files, state the behavior's owner, where it runs, who owns
its retained state, and which contracts or consumers the change affects.
Keep those questions separate: a small edit can change an execution invariant,
and a large application feature can remain outside the agent rings.

| Decision                                                                                          | Owner                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Whether an explicitly attached image is included immediately or inspected on demand.              | R2 product policy, composed through R3; R1 supplies media resolution and input validation.              |
| Retain a chat's selected model and effort, including an unsent change, across clients or restart. | R3 product settings and persistence; R2 supplies execution policy and the client submits the selection. |
| Use the last explicitly chosen preference for a new chat.                                         | Application default policy and persistence, separate from an existing chat's settings.                  |
| Preserve the captured execution identity of already accepted work.                                | R0 invariant implemented by R1; R3 supplies and validates authority.                                    |
| Place an attachment outside a text bubble or display its preview.                                 | Application presentation outside the agent rings.                                                       |

A change spanning owners needs an explicit contract between them. Keep the
product choice at its owner and add only the capability the inner owner can
define independently. Check both the requested behavior and the invariant
preserved at that boundary. Do not move policy inward to avoid a protocol or
persistence change.

The [native implementation binding](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-core.md)
owns the concrete package mapping and checked dependency budgets. Application
features remain governed by their own domain contracts; these rings do not
turn unrelated application work into an agent-system project.

## Vocabulary

The [components contract](./components.md) owns the execution vocabulary.
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

## Topic contracts and studies

These pages specify one topic each. They defer to the three contracts above
for every concept those contracts own.

| Topic                         | Pages                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Environment and authority     | [Environments](./environments.md), [Execution authority](./execution-authority.md), [Permission policy](./permissions.md), [Workspaces](./workspace.md)                              |
| Durable work and control      | [Turn authority](./turn-authority.md), [Lifecycle events](./events.md), [Hooks](./hooks.md)                                                                                          |
| Capability and context design | [Tools](./tools.md), [Tool design](./tool-design.md), [MCP and connectors](./mcp.md), [Visual perception](./vision.md), [Binary files](./binary.md), [Scratch](./scratch.md)         |
| Product behavior              | [Compositor](./compositor.md), [Plan mode](./mode-plan.md), [Triggers](./triggers.md), [Cost optimization](./cost-optimization.md)                                                   |
| Hosting                       | [Local daemon](./daemon.md)                                                                                                                                                          |
| Protocol and provider studies | [ACP integration](./acp.md), [ACP provider class](./acp-provider.md), [Codex provider profile](./acp-provider-codex.md), [Subscription provider](./chatgpt-subscription-provider.md) |

[Grida bindings](../grida/index.md) describe the existing product's concrete
integration. They remain a separate reference for that implementation.
