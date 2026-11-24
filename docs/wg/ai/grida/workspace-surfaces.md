---
title: Workspace surfaces
description: The current Grida product contract for repository-backed workspaces, visible artifacts, canvas-first agent behavior, and auxiliary surface presentation.
keywords: [grida, ai, workspace, surfaces, canvas, artifacts, desktop]
format: md
tags:
  - internal
  - wg
  - ai
  - editor
  - canvas
---

# Workspace surfaces

This document defines Grida's product model for connecting an agent
workspace to artifacts the user can see and interact with. It is a
Grida-specific binding, not part of the implementation-agnostic
[agent RFC](../agent/index.md).

The workspace remains the storage and authority boundary. The visible
product experience is organized around artifacts rendered as surfaces.
This preserves a general repository underneath while giving design work
a clear, immediate visual focus.

## Product model

| Term               | Meaning                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**      | The storage, filesystem, and authority boundary available to an agent session. It may contain multiple artifacts and supporting files.   |
| **Artifact**       | A user-visible unit represented by either a file or a recognized bundle directory.                                                       |
| **Bundle**         | A directory recognized by Grida as one artifact. A `.canvas` directory is a canvas bundle even though it contains multiple files inside. |
| **Surface**        | A host-rendered view of an artifact. A surface is presentation state, not storage or artifact identity.                                  |
| **Active surface** | The artifact currently shown as the user's primary working view.                                                                         |

A plain directory is not automatically an artifact. It becomes one only
when Grida recognizes the directory as a bundle.

## Canvas-first product policy

The canvas is the primary artifact for Grida design work. When the agent
creates or materially changes a canvas, it opens the `.canvas` bundle once
the bundle is renderable so the user can see the work directly.

Canvas-first behavior is product and skill policy, not part of the surface
tool's type system. The surface capability remains artifact-agnostic:

- a canvas is opened by passing its `.canvas` bundle directory;
- a standalone artifact is opened by passing its file;
- the host determines how a recognized target is rendered;
- the workspace may continue to contain supporting files and other
  artifact kinds.

A filesystem path identifies the artifact and the workbench chooses its
viewer. A relative path starts at the workspace root. An absolute path
uses the host filesystem and must resolve inside that workspace.

## Workbench tools

The workbench owns visible tabs and selection. Browser tools operate on
explicit authorized web pages and own the background pages they create.

### `workbench_show`

`workbench_show` requests a visible target in the attached workbench. A
`file` target identifies an existing workspace artifact. A browser-enabled
workbench also accepts an HTTP(S) `url` to open a browser tab and a `tab` ID
to show an existing tab. The hosted router resolves registered Grida `/_/`
links in the browser. Window focus is an explicit choice when available.

A file target names an existing file or recognized bundle directory inside
the captured workspace. For example, `design/Poster.canvas`,
`./design/Poster.canvas`, and the artifact's full filesystem path can
identify the same bundle. The workspace boundary applies even when a
command can read files elsewhere.

Opening an artifact that is already open
activates the existing surface instead of creating a duplicate.

The host acknowledges dispatch without waiting for the editor to render the
artifact. The result records dispatch, known unavailability, or an unconfirmed
request. A trusted file reveal can remain unconfirmed while the agent
continues artifact work. URL opens, tab selection and explicit focus retain
their normal outcome requirements.

Showing a target does not:

- create or modify content;
- switch or expand the workspace;
- grant the agent additional read authority;
- attach an artifact as model context;
- create a branch;
- enter slideshow or fullscreen presentation mode.

### `workbench_list_tabs`

`workbench_list_tabs` reads the current open tabs and selection within the
captured workbench. The inventory identifies the active tab and supplies
workspace-relative paths for file tabs. When Browser is available, the same
inventory includes visible browser tabs and their exact identities. A file
can be shown by path without a prior listing. Access to contents follows
separate permissions.

### `workbench_close_browser_tab`

This requests closure of one user-visible browser tab by ID. `browser_close`
manages pages created for background work. Existing MCP profiles and
previously accepted native input retain their recorded definitions.

## Interactive and non-interactive hosts

Interactivity is host-provided context, not an argument chosen by the
agent.

An interactive input captures the workbench that can fulfill its requests.
The standalone `surface_open` compatibility tool can report a non-interactive
result when there is no editor.

Trusted file presentation is auxiliary. Artifact creation, editing, verification, and
task completion never depend on an artifact being opened. The renderer
never owns completion of either tool call, and no later success
reconciliation is required. A missed request or non-interactive result does
not change the underlying work, trigger a retry, or turn successful artifact
work into a failure.

## Agent presentation policy

The [product agent](../agent/master.md#product-instructions-and-extension-guidance)
knows when it is working in Grida Desktop from the host context. When the
current mode and editor binding permit presentation, it requests a view of
the primary user-facing artifact at its first meaningful renderable
checkpoint so the user can watch the remaining work develop. It describes
what the user can see only when it has evidence of the visible outcome.

A meaningful renderable checkpoint is the earliest non-empty state the host
can show without a structural or parse error. It communicates the intended
frame or direction, but it does not need complete content, final assets,
polish, exhaustive validation, or final verification. A bundle reaches this
checkpoint when its valid manifest references at least one existing,
renderable document.

For canvas work:

1. choose the basic direction;
2. create a minimal but meaningful valid document and bundle manifest;
3. call `workbench_show` with the bundle as a file target;
4. continue production, refinement, and validation while the surface remains
   visible;
5. finish without reopening the same surface.

Presentation is an early progress milestone, not a final "validate and open"
step. The agent does not delay it for complete content, preview generation,
polish, or task completion. For nontrivial creation, the agent intentionally
establishes a lightweight first checkpoint instead of authoring the finished
artifact before opening it. It also does not open an empty document, an invalid
artifact, or a bundle whose referenced document is missing.

When the primary artifact already exists, the agent opens it before substantial
edits so the user can observe the change. A dedicated artifact editor already
satisfies this policy because its artifact is visible from the start.

The agent opens an artifact again only when intentionally switching the
primary view or when the user asks to see it. It does not call
`workbench_show` after every write and does not repeatedly call it to force
focus.

Supporting artifacts and references remain in the background unless the
user asks to view them or the task clearly changes its primary artifact.

## User authority

The editor can activate a requested target while the original view remains
current. User navigation supersedes a pending request. Further openings are
reserved for an intentional change of primary artifact or a user request.

Opening is separate from creating, branching, and referencing:

- opening selects which existing artifact the user sees;
- branching creates a distinct artifact or conversation identity;
- referencing makes permitted material available as task context.

Opening alone does not perform either of the other operations.

## Reopen continuity

Application startup restores the last valid workspace. When no valid
workspace is available, the application shows the welcome page.

Within that workspace, Grida resumes the last selected available chat and
restores its tab order and selection from a local snapshot. Switching to
another chat restores that chat's own tab set. New chats start fresh, with
any artifact explicitly chosen for the start. Missing files are omitted.

Tab snapshots are optional application state. The workspace remains the
shared home of its files, and reopening a conversation never replays its
recorded presentation requests. A tool invocation retains its original live
workbench binding, which can become unavailable if the user switches chats.
