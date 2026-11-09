---
title: Scratch Storage
description: Host-managed working storage for staged inputs, temporary outputs, and recoverable agent work, separate from authored project files.
keywords:
  [
    agent-system,
    scratch,
    workspace,
    attachment,
    artifact,
    retention,
    filesystem,
  ]
format: md
tags: [internal, wg, agent-system]
---

# Scratch Storage

Scratch is host-managed working storage for an agent session. It holds
materialized inputs, intermediate files, and new outputs while the task is in
progress. It can exist without an open project. Workspace membership and
filesystem access are defined in [Workspaces](./workspace.md).

An attachment remains part of the conversation as content or a reference.
Materializing its bytes for a file-oriented tool is a separate operation.
Scratch provides that working location without implicitly adding files to the
user's authored directories.

## What scratch is

Scratch has a host-assigned scope, an execution owner, storage limits, and a
declared retention policy. A path is one possible representation of that scope.
A remote mount or scoped file handle can provide the same contract.

Scratch is working storage. Retained source assets and published results have
their own identities and availability contracts. They may share a storage
backend while retaining separate ownership and lifetimes.

## Vocabulary

| Term                     | Meaning                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Input asset              | The original submitted content with provenance and declared retrieval lifetime.                                            |
| Working copy             | A materialization that tools may read or modify under the scratch grant.                                                   |
| Intermediate             | A temporary file used to produce or verify a result.                                                                       |
| Published artifact       | A result retained at a destination with an explicit access and lifetime contract.                                          |
| Publication or promotion | An explicit operation that makes a result available at that destination. It may copy, move, or create a durable reference. |

These identities stay distinguishable. Editing a working copy preserves the
meaning of the original upload. Publication records which result was selected
according to the concrete publication tool's contract.

## The scratch contract

### S1 — Host-owned scope

The host allocates the scope and binds it to the session or explicitly selected
owner. Independent sessions and subagents receive independent scopes unless a
shared capability is deliberately granted. Knowing a path does not grant access.
Raw executors receive only the scratch authority they need, alongside their
other explicit grants. The shared scratch parent remains outside that authority.

### S2 — Declared retention and recoverability

Scratch has bounded retention, and its availability is explicit. A host may
retain it across pauses and process restarts. Required working files are held
until their consumers release them or a valid reconstruction path exists.
Holds and renewals have declared limits governed by that retention policy.

When recovery depends on input bytes, retain the original asset or another
byte-equivalent source. When it depends on modified intermediate state, retain
that state or the information needed to reproduce it safely. A path descriptor
alone cannot establish that the content is still available.

Expiration or loss produces an unavailable state. Recovery obtains the same
content or requests an explicit new decision. It cannot silently substitute a
new upload or repeat a paid operation.

### S3 — Working outputs stay separate from project edits

Materialized uploads, extracted archives, previews, and newly generated outputs
use scratch unless the task selects another destination. An authorized edit to
an existing workspace file retains that explicit target.

Using scratch requires no project to be open. Producing or inspecting a result
there does not implicitly publish it into a project directory.

### S4 — Normal authority and integrity checks apply

The host can pre-authorize routine work within the scratch scope. Operations
still enforce path containment, size limits, current authority, and the native
executor's restrictions. Concrete file tools own content checks and write behavior. Pre-authorization does not waive these
checks or authorize a write to another scope.

Generated names and uploaded filenames are bounded data. Materialization handles
collisions without overwriting unrelated files. A retry uses stable input identity
and returns or reconciles the existing materialization.

### S5 — Cleanup preserves live dependencies

Cleanup accounts for active executors, pending reads, publication, and resumable
work. An expiring session or closed view does not make an in-use file disposable.
A retention hold can be released after settlement or safe transfer of ownership.
If a declared hard retention limit expires first, the host records the dependency
as unavailable before reclaiming it so continuation can request recovery.
New dependent work is blocked, and active writing executors must quiesce or
release the resource before deletion.

The host validates its cleanup root and does not follow untrusted links into
another scope. Cleanup failures and expired content remain observable.

## Input staging

A routing policy chooses how an attachment reaches the model and tools. An image
can be sent as provider-native content while a byte-exact working copy is staged
for editing. An ordinary file can be represented by a scoped descriptor. An
existing authorized workspace reference can remain a reference.

The representations retain a shared input identity. Resizing an image for model
perception does not redefine the original bytes used by file tools. Staging
admits aggregate byte, file-count, and path limits before copying or allocating
working storage. It publishes descriptors only after the corresponding staged
content is ready. Partially failed staging removes only files owned by that request.

Durable submission acceptance includes a viable content lifetime or a recorded
rematerialization source. A message reference alone cannot make a temporary
upload recoverable.

The [compositor contract](./compositor.md#resource-routing-policy) owns input
routing. Messages retain the attachment relationship, the host resolves bytes,
and file-oriented tools receive scoped working references.

## Publication

Publishing a result selects a source and destination under the destination's
grant. The destination may be an authored workspace file, a retained artifact
store, or a user-selected export location. The concrete publication tool owns
write semantics, any content preconditions, and the meaning of its result.

Publication does not require deleting the working copy. A failed export leaves
the source outcome and remaining availability clear. The host can retain a
preview or download for a stated period without promising permanent storage.

## Example — annotate an uploaded PNG

1. Accept the PNG and preserve its attachment identity and original bytes for
   the promised lifetime.
2. Materialize a working copy in the session's scratch scope when the image
   executor requires a file path.
3. Produce the annotated PNG in scratch and inspect the result.
4. Return an accessible result with its retention information.
5. Copy it into an authored project directory only when that destination is
   selected. Record publication separately.
6. Release working files when no active or recoverable work depends on them.

## Bindings

| Binding     | Host choice                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------- |
| Storage     | Local directory, remote mount, object-backed materialization, or another scoped file service. |
| Allocation  | At session creation or on first use.                                                          |
| Limits      | File count, bytes, individual sizes, and retention bounds.                                    |
| Recovery    | Retain working bytes, reconstruct from retained inputs, or report unavailable.                |
| Exposure    | Structured file operations, granted native execution, or both.                                |
| Publication | Copy, move, or retained reference under the publication tool's contract.                      |

## See also

- [Workspaces](./workspace.md)
- [Files, workspaces, and scratch components](./components.md#files-workspaces-and-scratch)
- [Input routing](./compositor.md#resource-routing-policy)
- [Visual perception](./vision.md)
- [Binary file handling](./binary.md)
