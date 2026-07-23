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

The tool does not accept an artifact kind, renderer, window, or workspace
identifier. The artifact's workspace-relative path is the grounded
reference.

## Surface tool family

The tool identifiers use underscores because model-facing tool names are
flat. Together, they form the `surface` product capability.

### `surface_open`

`surface_open` asks the current host to open an existing workspace
artifact and make it the active surface.

The target:

- already exists;
- is inside the current workspace;
- is a file or a recognized bundle directory;
- is identified by its workspace-relative `path`.

The operation is idempotent. Opening an artifact that is already open
activates the existing surface instead of creating a duplicate.

`surface_open` does not:

- create or modify content;
- switch or expand the workspace;
- grant the agent additional read authority;
- attach an artifact as model context;
- create a branch;
- enter slideshow or fullscreen presentation mode.

The result reports what happened: the target was opened, its existing
surface was activated, the host was non-interactive, or the target was
unavailable.

### `surface_list_open`

`surface_list_open` reports the artifact paths currently represented by
the host and identifies the active path.

It reports presentation state only. It is not a workspace file listing
and does not grant access to any artifact. The agent does not need to call
it before `surface_open`, because opening is idempotent.

## Interactive and non-interactive hosts

Interactivity is host-provided context, not an argument chosen by the
agent.

In an interactive host:

- `surface_open` resolves through the host's artifact-opening behavior;
- `surface_list_open` reports the host's current surface state;
- each result reports the real visible outcome.

In a non-interactive host:

- `surface_open` resolves successfully as an honest no-op;
- its result says that the host is non-interactive and no surface opened;
- `surface_list_open` returns an empty open set and no active surface.

Presentation is auxiliary. Artifact creation, editing, verification, and
task completion never depend on an artifact being opened. A
non-interactive result does not change the underlying work, trigger a
retry, or turn successful artifact work into a failure.

The same guidance can therefore use the surface tools in interactive and
non-interactive environments without changing the model's artifact
behavior.

## Agent presentation policy

The agent opens the primary user-facing artifact when it is ready to be
viewed.

For canvas work:

1. create or update the `.canvas` bundle;
2. reach a renderable state;
3. call `surface_open` with the bundle path;
4. continue the task regardless of the presentation result.

The agent opens an artifact again only when intentionally switching the
primary view or when the user asks to see it. It does not call
`surface_open` after every write and does not repeatedly call it to force
focus.

Supporting artifacts and references remain in the background unless the
user asks to view them or the task clearly changes its primary artifact.

## User authority

An explicit `surface_open` call activates its target. Navigation by the
user always supersedes that request. The agent does not repeatedly pull
the user back to an artifact they have left.

Opening is separate from creating, branching, and referencing:

- opening selects which existing artifact the user sees;
- branching creates a distinct artifact or conversation identity;
- referencing makes permitted material available as task context.

Opening alone does not perform either of the other operations.

## Reopen continuity

Application startup restores the last valid workspace. When no valid
workspace is available, the application shows the welcome page.

Within that workspace, Grida restores the last active artifact when it
still exists. If the artifact is unavailable, the workspace still opens
without it.

Workspace and surface restoration are durable product state. They do not
depend on replaying a chat transcript, and loading an old conversation
does not replay presentation effects from its historical tool calls.
