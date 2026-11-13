---
title: Tools
description: Shared invocation semantics and product-owned tool profiles, authority, results, and presentation.
keywords: [agent-system, tools, capabilities, permissions, results, truncation]
format: md
tags: [internal, wg, agent-system]
---

# Tools

A tool exposes an operation through a declared input/output contract. The
[components](./components.md#tools) own shared invocation mechanics. The
[master](./master.md#context-and-tool-design) owns which tools are offered and
how their names, instructions, and results serve the task. Concrete executors
own each operation's meaning.

## Tool contract

A definition identifies the operation and version, describes its input/output
schema, and declares required capabilities, bounds, and recovery support.
An invocation captures that definition and validated arguments. Its executor
returns correlated progress and a result. Direct, remote, and MCP adapters
preserve these semantics across their boundaries.

The executor receives explicitly granted capabilities. Adding a definition
introduces an available operation. Execution authority is supplied separately
by the host and checked before effects. Concrete tool implementations own
resource access and enforce their operation-specific requirements.

## Tool profiles

The product harness owns tool profiles. Tool names and schemas can be tuned to the
selected models and environment. A core consumer can expose any coherent set
of declared capabilities.

Typical product profiles include file reads and edits, scoped search, command
execution, questions, child agents, and tool discovery. Their implementations
can be native or MCP-backed. The product selects the profile and documents any
compatibility promise it makes about names or schemas. The text-file profile
below has its own concrete editing contract.

### Text-file mutation contract

This contract belongs to the concrete text-file tools. Other document tools
define their own edit semantics.

`edit` is a conditional mutation over the file's **current content**. During
each invocation, the tool reads the current text and applies the replacement
only when the supplied old text identifies the requested location. A missing
match or an ambiguous match is a conflict result; the tool MUST leave the file
unchanged.

A prior `read` is often how an agent obtains exact edit context, but it is
guidance, not authorization. Conformance MUST NOT depend on a session-local
ledger recording that the agent read the path earlier. Such a ledger loses its
meaning when a run pauses, resumes, or moves between workers. In particular, an
agent MAY edit a file it just successfully wrote without reading the same bytes
back first.

An implementation SHOULD close the gap between validation and publication with
an atomic or conditional backend write when its storage layer supports one. If
it cannot, it MUST still read current content during the invocation and
serialize its own same-path mutations; it must not claim cross-process
atomicity.

`write` creates or overwrites the full file at the selected path. It is intentionally different from `edit` and SHOULD be used only when
replacing the complete content is the caller's intent.

An implementation MAY impose a bounded text-file size. If it does, the same
bound MUST govern successful reads, writes, and edits, and an oversized
operation MUST return an explicit typed size failure rather than masquerading
as a missing file. This preserves the guarantee that a successful write remains
eligible for a later edit, including after the runtime is reconstructed.

## The question tool

A question tool declares its response schema and delegates interaction delivery
to the host. Registration and awaiting a response are separate operations.
The master decides whether work continues while a question is open. A tool can
return the registration receipt immediately, or keep its result pending until
a response arrives. The [interaction contract](./components.md#ownership-and-settlement)
owns correlation, suspension, and response lifetime.

## Capability requirements

A definition describes the capabilities an operation needs. The host resolves
those requirements against current grants. Filesystem access, network access,
process execution, and other host capabilities can use different scope models.
The [execution authority contract](./execution-authority.md) owns that boundary.

A product configuration can offer named scope variables such as `{workspace}`,
`{ad-hoc}`, or `{user-data}`. Its host defines their expansion and validates the
result. Unresolved or empty scopes grant no access. Template syntax and pattern
matching belong to that configuration binding.

## Tool result envelope

The shared result retains invocation identity, an outcome, structured data, and
available artifact or recovery references. A failure remains distinguishable
from success, cancellation, and uncertainty. The executor defines its domain
results. The model adapter and client adapter select representations appropriate
to their consumers.

Storage row names, provider wire envelopes, and UI cards belong to their
respective bindings. Recovery evidence stays in the execution record. A visible
projection can omit private or irrelevant fields while preserving outcome
meaning and provenance.

## Truncation

The executor and host enforce supplied input/output limits. The master selects
how much returned content reaches the model. A bounded projection identifies
omitted content and provides an authorized retrieval reference when available.

First-byte excerpts, head-and-tail excerpts, summaries, pagination, and artifact
references are implementation choices. Local file spooling belongs to the host
or concrete tool. Its retention follows the declared lifetime and active
dependencies. Closing a conversation view alone does not establish that retained
content can be deleted.

## Permissions at the tool boundary

A tool declares the effect of each action; it does not decide whether the
action may run. The [permission policy](./permissions.md) owns that decision,
the presets and the defaults.

The host owns authority, revocation, and policy configuration. The master and
host authorization adapter choose which eligible operations require approval,
who reviews them, and how failures are handled. Runtime checks current authority
and control state before dispatch and retains the associated evidence.

An unattended product may deny an unanswered approval, suspend with an
input-required result, or use an authorized reviewer. The host and master choose
that behavior. An unresolved review provides no execution grant.

## The watchdog

A product can supply a pre-invocation policy check through the generic admission
gate. It can perform bounded recorded work or open an interaction before
returning a grant selection, denial, or deferred wait. It covers tool calls
produced inside an inference step as well as explicitly invoked tools.

Hook matching, reviewer routing, decision schemas, and recursion rules belong
to the host implementation. After a check, dispatch still validates current
host-issued authority and controls. See [Hooks](./hooks.md).

### Defense in depth

The host and concrete executors enforce complementary boundaries. Argument
validation establishes a well-formed request. Authorization establishes its
allowed scope. A native sandbox enforces the declared process limits. Product
review adds semantic checks within that authority. The [environment contract](./environments.md)
and [execution authority contract](./execution-authority.md) define their roles.

## ACP tool kind taxonomy

An [ACP adapter](./acp.md#tool-kind-mapping) maps operations to the protocol's
supported kinds and content. These are transport and client presentation
choices. The generic Tool contract carries the underlying operation identity,
progress, and results independently.

## Implementor checklist

- Publish the definition and validate complete arguments before dispatch.
- Use supplied authority and declare actual execution/recovery capabilities.
- Preserve invocation identity, correlated outcomes, and uncertainty.
- Report cancellation and partial effects according to the executor's contract.
- Keep domain behavior, output projection, and storage conventions with their owners.

## See also

- [Components](./components.md)
- [Tool design](./tool-design.md)
- [MCP](./mcp.md)
