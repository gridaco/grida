---
title: Workspaces and Project Directories
description: A resolved workspace binds named directory identities and a primary directory to agent work while keeping membership, authority, and scratch separate.
keywords:
  [agent-system, workspace, project, directories, filesystem, primary-directory]
format: md
tags: [internal, wg, agent-system]
---

# Workspaces and Project Directories

A workspace describes the authored directories available to a task and the
default location for relative work. It can contain several directories and a
designated primary directory. The host resolves this description into concrete
filesystem capabilities.

A product can present the named grouping as a **Project**, together with its
chats and settings. The component contract needs the resolved workspace view.
Project membership and storage layout remain host-owned.

## Distinct responsibilities

| Concept            | Responsibility                                                                      |
| ------------------ | ----------------------------------------------------------------------------------- |
| Project            | Product grouping of related directories, conversations, and settings.               |
| Workspace view     | Named directory bindings, primary directory, identity, and revision for the task.   |
| Files capability   | Read, list, write, copy, and publish under granted scopes with freshness checks.    |
| Scratch            | Host-managed working copies and temporary output, with independent retention.       |
| Artifact retention | Availability of submitted inputs and published results for their promised lifetime. |

Directories can contain repositories, documents, assets, or other user-authored
material. Repository discovery cannot silently expand an opened directory to a
larger ancestor. A task with only attachments can have no workspace directories
and still use [scratch storage](./scratch.md).

## Workspace descriptor

The resolved descriptor contains a stable workspace identity, revision, a set of
named directory bindings, and a designated primary binding when one is required
by the product. Each binding identifies a concrete directory and its current
binding generation. Display names and path strings help navigation. Authority
comes from separately resolved grants.

Each directory identity occurs once. A primary directory belongs to the same
set. A directory-free workspace has no primary directory. The host rejects
ambiguous aliases and diagnoses unavailable or conflicting bindings.

## Primary directory and additional directories

The primary directory supplies defaults for a new task's working directory and
relative path resolution. A selected additional directory supplies its own
explicit working location. Identical relative paths in two roots remain
different resources.

The master defines instruction and configuration discovery. It may begin with
the primary directory and load relevant material from another directory when
working there. Combining directories does not combine their instructions into
one unrestricted global policy.

Changing the primary directory changes later defaults. It cannot retarget an
already admitted operation. Cross-directory copy or publication identifies both
source and destination, and checks their respective grants.

## Authority and changes during work

Membership states which directories the product grouped. Read and write access
remain independently granted and can differ between roots. Adding a directory
requires the host's normal user-control path before execution can use it.

Each prepared operation uses its resolved directory binding and applicable
grants. A renamed alias or changed primary directory affects later resolution.
Access to a removed root or revoked grant is checked before further execution.

The host supplies the concrete path, mount, object, or handle mapping for local,
browser-backed, and remote file services. File and document tools own content
versions, edit semantics, and any conflict behavior. Their results identify what
the operation actually affected.

## Relationship to scratch

Scratch is outside the authored-directory set unless a host deliberately grants
a separate shared surface. Uploaded inputs and new previews can be worked on
without mutating any project root. Saving into a project is an explicit
publication operation under the destination's authority.

The runtime receives the resolved workspace and scratch capabilities needed by
its tools. It need not own a global project registry or understand the product's
navigation, organization, or account model.

## Conformance cases

| Case                                      | Required behavior                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Two roots both contain `README.md`        | Resolve relative access against the selected binding, or the explicit primary default. |
| Primary changes after an edit is admitted | The original target remains binding. Later work uses a newly resolved view.            |
| Additional root is read-only              | Reads can succeed while writes remain denied.                                          |
| A directory disappears or is replaced     | Report unavailable or conflicting identity before dependent effects.                   |
| A task has only an uploaded image         | Scratch-backed work succeeds without creating or editing a project directory.          |
| A result is saved into another root       | Validate the destination grant and return the publication tool's outcome.              |

## See also

- [Scratch storage](./scratch.md)
- [Files, workspaces, and scratch components](./components.md#files-workspaces-and-scratch)
- [Execution authority](./execution-authority.md)
- [Input routing](./compositor.md#resource-routing-policy)
