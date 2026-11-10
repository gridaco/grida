# Grida tool-host contract

This is the proposed Rust/Electron binding for Grida capabilities. The
[component contract](https://grida.co/docs/wg/ai/agent/components) owns generic
execution semantics. This document defines the product boundary used by the
built-in agent, independent MCP clients, and headless callers.

## Composition and ownership

Use one Grida capability dispatcher in the concrete Rust host. The native Tool
adapter calls it directly. The MCP adapter maps public calls onto it. Both use
the same definitions, argument validation, authorization, routing, and results.
The dispatcher can run without constructing the Grida agent master, model
providers, or agent Sessions. External callers own their own agent lifecycle.

```text
Grida master -> Runtime -> native Tool adapter --+
                                                |
External agent -> Grida MCP adapter -------------+-> capability dispatcher
                                                     -> headless executor
                                                     -> Electron main
                                                          -> editor controller
```

| Owner                            | Owns                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Grida master                     | Prompts, context selection, exposed tool set, workflow, verification, and completion policy.                     |
| Rust Runtime/Sessions            | The built-in agent's admission, turn controls, accounting, journal, and recovery of recorded invocations.        |
| Concrete Rust tool host          | Capability catalog, caller authentication and grants, endpoint registration, dispatch, and native/MCP adapters.  |
| Electron main                    | Trusted editor registration, sender/window validation, routing to the registered owner, and connection lifetime. |
| Document implementation          | Its representation, reads and edits, validation, persistence, undo, collaboration, and any conflict behavior.    |
| Headless document/media executor | The supported document, render, or media operations over explicit inputs and grants.                             |

Grida's document direction is text IR. Each document implementation defines how
its tools interpret and change that representation, whether execution happens
in an editor or headlessly. Any required versions, preconditions, or edit results
belong to that capability's input/output schema. The agent and dispatcher carry
those values without defining a common document state or editing model.

These are roles within existing packages. The Rust host can start with
`tool_host.rs` and `mcp.rs` modules. Electron uses a narrow main/preload/editor
bridge. Share the boundary schema across languages and check it with contract
fixtures. Internal document objects stay with their owning implementation.

The [native capability host](../../../crates/grida-agent/src/tool_host.rs)
issues a lease for one capability at one registered endpoint. The native
adapter and direct callers use the same invocation method. The first
executor implements the non-interactive `surface_open` result. Its
`requested: false` result reports that no presentation was requested.
The standalone MCP service exposes this definition through the same lease.
Production editor registration remains a separate binding.

## Catalog and capability requirements

A capability definition has a stable ID, definition revision, description,
input/output schemas, execution requirements, effect classification, and limits.
Native and MCP names map to that ID. Authentication and endpoint authority are
supplied by the host, outside model-controlled arguments.

| Family          | Examples                                               | Execution requirement                                                 |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Editor context  | Read active document, selected nodes/range, open views | Authorized live editor endpoint.                                      |
| Document        | Read or edit a document, export                        | A compatible live or headless document implementation.                |
| Rendering/media | Render a preview, process a supported media asset      | Registered renderer/media executor and input/output grants.           |
| Presentation    | Request opening or revealing an artifact               | A presentation endpoint, or the declared non-interactive disposition. |

Discovery describes availability and grants no access by itself. Focus and
selection changes update editor-context data. Context payloads and document
references follow their owning capability's schema.

Optional presentation retains the [workspace surface behavior](https://grida.co/docs/wg/ai/grida/workspace-surfaces).
A headless `surface.open` can return `not_presented` with reason
`non_interactive`. An operation requiring a live editor reports an unavailable
endpoint when that editor is missing. Any saved-file or headless alternative is
an explicitly supported operation with its own declared inputs.

## Binding an editor

Electron main registers an editor endpoint with a main-issued binding ID,
generation, and supported capabilities. Reloading or replacing the endpoint
creates a new generation. Main validates sender identity on every exchange.
An invocation addressed to one endpoint cannot silently move to its replacement
or to whichever tab is now active. Late replies retain their original call and
endpoint identity.

For workspace chat, `surface_list_open` reads the captured workbench's active
file and open files when invoked. The workbench owns the observations. Main
authorizes the attached frame and publishes a bounded view of workspace-relative
paths over private stdio. Rust retains the binding with the accepted Act input
and validates each reply before projecting it as a tool result. An empty
workbench returns an empty view. A detached or replaced workbench is unavailable.
An unverified reply supplies no editor data. The binding grants no filesystem
access or document mutation.

When the same workbench offers presentation, `surface_open` asks that exact
frame to open a workspace artifact. Main binds the request to a call identity
and the frame's last published view. The editor validates the target and
checks the view again before changing tabs. A dispatch receipt confirms Main
accepted the send to the captured frame. Observed display requires separate
evidence. An unconfirmed dispatch remains in the turn's account and leaves
the model free to continue work. Reopening a chat never replays presentation.

The document tool defines the meaning of its document, selection, and content
arguments. It returns its own domain result or error. A tool that requires a
version or other precondition validates it inside the document implementation.
The bridge transports those arguments and results. All document-state decisions
remain inside the document implementation.

## Host operations

Start with three logical operations. Fix transport spellings and limits in the
first fixtures.

| Operation | Input                      | Result                                                    |
| --------- | -------------------------- | --------------------------------------------------------- |
| Describe  | Optional capability filter | Authorized definitions and available execution endpoints. |
| Invoke    | Identified capability call | Correlated progress and a typed result or failure.        |
| Cancel    | Active call ID             | Cancellation request delivered or its unavailable status. |

Context reads are ordinary capabilities under Invoke. Describe does not
serialize private document contents.

The invocation envelope contains a call ID, capability ID and definition
revision, the selected endpoint binding where needed, schema-validated
arguments, and a bounded deadline. Caller identity and grants come from
authenticated request context. A native adapter correlates the call with its
agent invocation. An MCP caller needs no Grida agent session or turn.

Call IDs correlate requests and replies. Deduplication and effect recovery
depend on capabilities supplied by the executor. The native dispatcher
retains a versioned receipt with the original call binding and whether it
verified a reply. Results retain the capability's structured output, bounded
readable content, and any artifacts. Domain errors pass through with their
meaning intact. A request to present an artifact and observed display remain
separate evidence.

## Execution, cancellation, and recovery

Before dispatch, validate the definition, arguments, current caller grants,
endpoint, and limits. Electron main routes only to the registered owner. The
owning implementation performs the operation and returns its outcome. Rust
checks response correlation. For a built-in agent call, Runtime records the
outcome in its existing journal.

If a connection fails after dispatch, the outcome may be unknown. Preserve the
original invocation identity and available evidence. An adapter uses readback,
status lookup, or safe repetition only when the executor actually supports it.
A lost reply alone cannot authorize an automatic repeat of an effectful call.

Cancellation requests stopping the identified call. Its implementation reports
what stopped and any available result. Cancellation supplies no evidence that
previous effects were reversed. A long-running executor can expose status or
cancel tools for its own job references when needed. Those capabilities define
their lifetime and recovery contract. The dispatcher remains a routing and
authorization boundary.

## Native and MCP bindings

The native adapter maps its recorded invocation to the dispatcher and maps
progress/results back to the Tool contract. Rust-owned operations execute
locally. Editor operations use the Electron bridge.

The MCP server uses the same catalog for `tools/list` and dispatches
`tools/call` through Invoke. Preserve the same domain schemas, access checks,
errors, and results. Resources can additionally expose authorized context or
artifacts. Optional prompts or skills explain workflows. The external agent
chooses how to use them.

MCP content represents the underlying result using supported structured data,
text, images, and resource references. Transport request IDs and cancellation
map to call correlation and cancellation. Executor-specific job controls are
ordinary advertised capabilities. Tool search remains the built-in master's
exposure policy. MCP clients can use standard discovery directly.

The public transport starts with an explicitly enabled, authenticated
loopback MCP Streamable HTTP endpoint owned by the Rust host. Desktop's ACP
stdio connection has its own lifecycle. Apply the selected MCP transport's origin
and authentication checks before dispatch. Remote exposure and a stdio bridge
can be added as deployment bindings when required.

The service pins the official Rust SDK and supports the 2026-07-28 and
2025-11-25 wire revisions without retaining MCP sessions. The
2026-07-28 lifecycle, metadata, and transport requirements govern the current
binding.
[MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

Public exposure includes only reviewed Grida capabilities. Credential storage,
agent-internal controls, and renderer evaluation have separate authorization.

## Initial acceptance cases

| Situation                                            | Required observation                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Native and MCP callers invoke the same capability    | Same domain definition, authorization, executor, and result meaning.               |
| An external client calls with no Grida agent running | The capability host serves the call without creating a model session.              |
| Focus changes after an endpoint is selected          | The invocation remains addressed to that endpoint.                                 |
| A renderer reloads before an old reply arrives       | The reply belongs to its original call and endpoint generation.                    |
| A document implementation returns a domain error     | Both adapters preserve the document implementation's result and error meaning.     |
| A reply is lost after dispatch                       | The outcome remains uncertain unless the executor provides evidence to resolve it. |
| A caller cancels an active operation                 | Cancellation reaches the owner and preserves any reported effects.                 |
| Headless work requests optional presentation         | Return the declared non-interactive result while retaining the artifact outcome.   |

Document editing tests belong to the relevant document implementation. These
fixtures verify the tool-host boundary and faithful transport of domain results.
Current source provides useful seams. The toolset selects server/client
executors, the live SVG binding owns its document behavior, and Electron gates
IPC senders. The current external-agent configuration reserves an MCP server but
passes an empty server list.
[Toolset](../src/tools/index.ts),
[live binding](../../../editor/scaffolds/desktop/ai-sidebar/agent-fs-binding.ts),
[IPC gate](../../../desktop/src/main/ipc-handlers.ts),
[external configuration](../src/agent-provider/config.ts).
