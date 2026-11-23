# Grida tool-host contract

This is the Rust/Electron binding for Grida capabilities. The
[component contract](https://grida.co/docs/wg/ai/agent/components) owns generic
execution semantics. This document defines the product boundary used by the
built-in agent, independent MCP clients, and headless callers.

## Composition and ownership

The concrete Rust host has one Grida capability dispatcher. The native Tool
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

These are roles within existing packages. In the Rust host, the
[capability host](../src/tool_host.rs) owns the
dispatcher and the [MCP service](../src/mcp.rs) its
public binding. Electron uses a narrow main/preload/editor bridge. Internal
document objects stay with their owning implementation.

The capability host issues a lease for one capability at one registered
endpoint. The native adapter and direct callers use the same invocation
method. The headless executor implements the non-interactive `surface_open`
result, and the standalone MCP service exposes the same definition through the
same lease. Desktop registers its live workbench as an editor endpoint for the
editor-context and presentation capabilities below.

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

New workspace turns with an unconditional read command grant in the primary
directory use `exec_command` to find, search, and read workspace files. In Act,
`write_file` and `edit_file` use the named-directory write grants.

The optional `exec_command.input_file` supplies one bounded UTF-8 file as
stdin to a finite, offline, read-only command at the primary root. It uses an
explicit directory ID and relative path. It is offered for eligible narrow
read profiles under an independent named-directory or exact-file grant.
A disk-read profile reads ordinary files through plain commands. An
outside-project approval binds the file identity and version. The source
stays with the host. The invocation disallows a network request, terminal,
background yield, workspace writes, `workdir`, and a command-level directory.

Restricted tools keep the global config file protected. A person edits
the file, and a trusted ACP client can inspect or reload it. Accepted
inputs keep the defaults they captured at submission.

Profiles without an unconditional primary read command grant may offer bounded
file tools. Scoped reviews can use them, and observed-file verification profiles
retain `read_file` for their recorded-byte evidence. Accepted inputs keep their
original tools through queueing and recovery, including earlier
`read_scoped_file` calls. Existing chat data keeps its format.

A Plan command requires a read command grant and a confined backend. Its read
scope follows the captured launch profile's disk-read posture. It can write
only to private scratch and runs offline and noninteractively. These limits
apply even under Full access. Previously accepted inputs keep their recorded
read policy.

The MCP export selects its capability names explicitly at startup and obtains
one grant per selected name. Discovery and dispatch use that same collection.
Registering another capability with the host does not expose it through MCP.
An unknown or duplicate selection fails before the listener binds. The headless
export and default Desktop editor export select one capability each. The opt-in
Desktop browser export selects the reviewed browser and workbench catalog.

Optional presentation retains the [workspace surface behavior](https://grida.co/docs/wg/ai/grida/workspace-surfaces).
A headless `surface_open` succeeds with the structured result
`{path, requested: false, reason: "not_interactive"}`. An operation requiring a live editor reports an unavailable
endpoint when that editor is missing. Any saved-file or headless alternative is
an explicitly supported operation with its own declared inputs.

## Binding an editor

Electron main registers an editor endpoint with a main-issued binding ID,
generation, and supported capabilities. Reloading or replacing the endpoint
creates a new generation. Main validates sender identity on every exchange.
An invocation addressed to one endpoint cannot silently move to its replacement
or to whichever tab is now active. Late replies retain their original call and
endpoint identity.

For workspace chat, `workbench_list_tabs` reads the current view of the
captured workbench. Main authorizes the attached frame and publishes a
bounded inventory with the active tab ID and workspace-relative file
paths. A live Browser lease can contribute visible browser tabs. An empty
workbench returns an empty view. A detached or replaced workbench is
unavailable. Rust retains the binding with the accepted Act input and
validates each reply before projecting it. The binding grants no filesystem
access or document mutation.

Desktop Main registers eligible operations with their source identity,
definition and handler. A registration generation belongs to that source
and endpoint. The host retains the captured endpoint, registrations and tool
definitions with accepted input. Source replacement retires the previous
generation even when the replacement has identical definitions. Revoking
one source leaves other grants available on the same endpoint. Main checks
the captured source, generation and definition revision before invocation.

Desktop packages declare their stable ID, summary and local skill names in
`extensions/<id>/extension.json`. Only declared
`skills/<name>/SKILL.md` documents are compiled into the package's skill
catalog. A package may declare zero or more skills. Its source ID remains
reserved even if it contributes no tools. Its README is developer
documentation. Standalone bundled instructions live under the repository's
`skills/`. Both kinds of instructions follow the same skill contract.

Browser's tool definitions live beside its manifest and apply to the native
binding and the Desktop MCP producer. Browser guidance enters the accepted
catalog with the Browser tool grant. FX guidance enters through the verified
bundled-command launch profile. The feature defines its readiness conditions.
The product master supplies shared Desktop presentation instructions when the
host has captured a compatible presentation grant.

Native discovery first presents one bounded summary per extension. A query
spanning several extensions returns
their summaries so the model can choose a source. A source-specific query or
an exact tool lookup can reveal captured definitions, which become available
on the model request after search. A concurrent invocation from the request
that performed the lookup still uses
that request's original inventory. A continued turn keeps the recorded
definitions even after the source disconnects. Calls to that source report
unavailable before dispatch. Execution requires the exact captured source
generation and live endpoint.

The default disposable Desktop export grants only `surface_list_open` and
uses the same definition, snapshot validation, and domain result through its
authenticated MCP listener.
The launcher selects an exact registered workspace and Main binds its first
admitted workbench frame independently of chat. A bounded reverse stdio read
asks Main for that frame's current published view on each tool call. Loss of
the frame withdraws the view for the lifetime of the export. Losing the private
stdio connection closes the listener.

When the same workbench offers presentation, `workbench_show` asks that exact
frame to show a workspace artifact as a file target. Main resolves the
workspace-relative or in-workspace absolute path against the captured
workspace. It binds the reveal to a call identity and the frame's published
view regardless of Browser readiness. The editor checks that view and the
artifact's eligibility before changing tabs, then chooses the viewer. A dispatch receipt confirms Main
accepted the send to the captured frame. Observed display requires separate
evidence. An unconfirmed dispatch remains in the turn's account and leaves
the model free to continue work. Reopening a chat never replays presentation.

The built-in Workbench source owns tab inventory and presentation. A
negotiated Browser endpoint adds visible browser targets and a separate
Browser catalog over the same private MCP carrier. The tool host preserves
the captured endpoint throughout the accepted Act input. Main owns page
admission, document and viewport guards, and the guest.
`workbench_close_browser_tab` requests closure of an exact visible browser
tab. `browser_close` and scope cleanup retire background pages within their
creating scope. The opt-in external profile keeps its existing wire names and
schemas. Older accepted inputs keep their captured definitions and dispatch
contract. Revoked or replaced endpoints supply no observations.

Both paths use bounded MCP JPEG image content. Native chat validates the
image and, when the model connection accepts tool images, prepares it as
PNG in retained media scoped to the owning tool result. A lost reply after
a browser mutation remains uncertain. Repeating a call starts a new
operation.

Workspace turns with `editorPresentation` receive primary-artifact checkpoint
guidance even when `editorBrowserTools` enables the browser catalog.
A file reveal through the trusted workbench remains auxiliary when its reply is
unconfirmed. URL opens, tab selection and explicit focus retain ordinary
uncertain-outcome handling.

The editor selection contribution captures the exact selection when an
eligible Act input is sent or queued. `svg_inspect_selection` returns the
scoped SVG path and capture revision. For a whole document selected on a
board, it returns a single read-only target with the board path, pin ID, and
placement. The path addresses the SVG source. The pin ID addresses one
placement. For an editable SVG or slide, it returns paged locators of the live
editor buffer. A slide's SVG is its document identity and the deck is its
workbench tab identity. Each page carries up to 32 items and 28 KiB of encoded JSON.
Element locators are zero-based element-child paths from the document root.
Point locators use zero-based ordinals in the editor's vector model. A cursor
belongs to that capture. Each omitted locator identifies its original position
in the selection. Optional tags and authored IDs are included only when they
fit the label limit and contain valid Unicode. `svg_set_selection_opacity`
checks the inspected revision and applies the existing undoable opacity command
to the captured objects. For a capture of one editable plain text element,
`svg_read_selected_text` returns its text and the same capture revision.
`svg_replace_selected_text` verifies that revision and uses the editor's
undoable text command. An invalidated capture or closed editor yields a stale
or unavailable result. An unverified mutation reply stays uncertain. The editor
owns Save and retains its existing mtime precondition.

Peers with the earlier selected-text binding retain the accepted text grant
and its original tool revision.

The document tool defines the meaning of its document, selection, and content
arguments. It returns its own domain result or error. A tool that requires a
version or other precondition validates it inside the document implementation.
The bridge transports those arguments and results. All document-state decisions
remain inside the document implementation.

## Host operations

The capability host exposes three logical operations.

| Operation | Spelling                                                                                                           | Result                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Describe  | A grant's `describe`; MCP `tools/list` over the same catalog                                                       | The authorized definition, or an unavailable endpoint once the grant or host closes. |
| Invoke    | A grant's `invoke` with definition revision, arguments, cancellation, deadline, and output limit; MCP `tools/call` | A typed outcome with a call-evidence receipt, or a structural error before dispatch. |
| Cancel    | The call's cancellation token, MCP request cancellation, or revoking the grant or closing the endpoint             | Cancellation delivered to the executor; any later reply is discarded.                |

| Limit                       | Value                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Capability input and output | At most 512 KiB each per definition; larger arguments fail with `host_capability_input_limit`               |
| Concurrent calls            | At most 8 per registered endpoint; further calls fail with `host_capability_concurrency_limit`              |
| Call duration               | The caller's deadline, capped at 120 seconds                                                                |
| Output                      | The smaller of the caller's and the definition's limit; an oversized result is cleared and marked truncated |

A changed definition revision fails with `host_capability_changed` before
dispatch. Every host capability declares unavailable recovery, so an
interrupted call is never repeated automatically.

Context reads are ordinary capabilities under Invoke. Describe does not
serialize private document contents.

The invocation envelope contains a call ID, capability ID and definition
revision, the selected endpoint binding where needed, schema-validated
arguments, and a bounded deadline. Caller identity and grants come from
authenticated request context. A native adapter correlates the call with its
agent invocation. An MCP caller needs no Grida agent session or turn.

The host mints the call ID; it never comes from arguments. Call IDs correlate
requests and replies, and a reply that does not echo the exact call binding is
discarded as unverified. Deduplication and effect recovery depend on
capabilities supplied by the executor. The native dispatcher retains a
versioned receipt with the original call binding, whether it verified a reply,
and any owner receipt the executor returned. Results retain the capability's structured output, bounded
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

The public transport is an explicitly enabled, authenticated loopback MCP
Streamable HTTP endpoint owned by the Rust host. Desktop's ACP stdio connection
has its own lifecycle. The MCP transport's origin and authentication checks
run before dispatch. Remote exposure and a stdio bridge are not provided.

The service pins the official Rust SDK and supports the 2026-07-28 and
2025-11-25 wire revisions without retaining MCP sessions. The
2026-07-28 lifecycle, metadata, and transport requirements govern the current
binding.
[MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

Public exposure includes only reviewed Grida capabilities. Credential storage,
agent-internal controls, and renderer evaluation have separate authorization.

## Acceptance cases

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
The [tool-host tests](../tests/tool_host.rs) and
[MCP tests](../tests/mcp.rs) exercise the native
boundary. Desktop's [editor surface binding](../../../desktop/src/main/native-editor-surfaces.ts),
[editor MCP export](../../../desktop/src/main/native-editor-mcp-export.ts), and
[IPC gate](../../../desktop/src/main/ipc-handlers.ts) own sender validation and
routing to the registered workbench.
