---
title: Scratch
description: The per-session, system-managed, ephemeral filesystem area where an agent does working I/O and where produced files land by default — distinct from the durable workspace. The scratch contract (host-owned and per-session; ephemeral with durability only by promotion; the default output sink; reachable without per-operation approval yet inside sandbox containment; not the workspace), its lifecycle, and what hosts are free to vary.
keywords:
  [
    agent-system,
    scratch,
    workspace,
    artifact,
    promotion,
    ephemeral,
    filesystem,
    output,
    sandbox,
    session,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Scratch

An agent produces files that are **not** edits to the user's project — a
generated image, a downloaded asset, a converted document, an intermediate of
some computation. Those files need somewhere to land. Writing them into the
user's project is wrong: that project is the user's durable property, and a
throwaway render does not belong in it. **Scratch** is the answer — a
per-session, system-managed, ephemeral area that serves as the agent's working
space and the default home for what it produces.

This page specifies what scratch is, the contract that governs it, and the line
between scratch and the **workspace** that the whole concept exists to draw. It
gives a name to a thing the guide has already leaned on informally (the
stage-to-[`scratch`](./vision.md) perception path, the
[`binary`](./binary.md) archive-extraction scratch-space).

The keywords **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## What scratch is

Scratch is a filesystem area with four defining properties:

- **Per-session.** Each conversation has its own scratch; one session's working
  files are not another's.
- **System-managed.** The host creates and owns it. The agent does not choose
  where it is — it is _told_.
- **Ephemeral.** It is throwaway, with a bounded lifetime. It is a bench, not an
  archive.
- **The default output sink.** A file the agent produces lands here unless the
  agent is directed elsewhere.

## Scratch and the workspace

An agent reaches two filesystem surfaces, and conflating them is the failure
this concept exists to prevent:

- The **workspace** is the user's opened project — durable, authored, the thing
  edits change. It is the root the agent's filesystem is anchored to (see
  [directory-rooted execution](./foundations.md)).
- **Scratch** is per-session and ephemeral — the agent's working space and the
  sink for what it produces.

**Authoring goes to the workspace; producing goes to scratch.** A file in
scratch is not part of the user's project; it becomes durable only when the
agent **promotes** it — moves it into the workspace or another durable location.
This keeps produced-but-maybe-throwaway output out of the user's files by
default, and makes "keep this" an explicit act rather than an accident of where
a tool happened to write.

Scratch is also **not** a durable user-asset store. Where a host keeps a user's
saved generations, uploads, or library is a separate concern; scratch is the
transient bench in front of it.

## Vocabulary

- **Scratch** — the per-session ephemeral working area defined here.
- **Workspace** — the durable user project the agent's filesystem is rooted at.
  The sibling surface scratch is defined against.
- **Artifact** — a file the agent produced (a generation, a download, a
  conversion, an intermediate).
- **Promotion** — moving an artifact out of scratch into a durable location.
  The only way an artifact survives the session.

## The scratch contract

Five invariants govern scratch. A conforming implementation MUST honor all five.

### S1 — Host-owned and per-session

The host MUST create and own a scratch area **per session**, and the agent MUST
be _told_ its location rather than choosing it. The agent has no say in where
scratch lives; it receives a handle the same way it receives its working root.

A consequence: scratch isolation is structural. One session cannot reach
another's working files because each is handed only its own.

### S2 — Ephemeral; durability only by promotion

Scratch MUST have a **bounded lifetime** and the agent MUST NOT rely on it as
durable storage. A produced file survives the session only if it is **promoted**
(S-vocabulary) — moved into the workspace or another durable location. An agent
that "saves" something by leaving it in scratch has not saved it.

This is what lets the host reclaim scratch freely: nothing of lasting value is
ever _only_ in scratch, because lasting value is defined as having been promoted
out of it.

### S3 — The default output sink

A tool that **produces a file** MUST write it to scratch by default; it MAY
write elsewhere only when explicitly directed (by the user, or by an agent
acting on the user's instruction). Produced files share one well-known home
rather than each tool inventing a location, so the agent always knows where its
output went and the user always knows where to look.

### S4 — Reachable without friction, inside containment

The agent MUST be able to read, move, copy, and [perceive](./vision.md) files in
scratch **without per-operation user approval** — scratch is a pre-authorized
working area, not a series of prompts. At the same time, scratch MUST remain
inside the session's **sandbox containment**: it is a sanctioned place to write,
not an escape from the capability surface. Free movement _within_ scratch; no
movement _out of_ the sandbox.

The tension these two halves resolve is the practical one: a default output sink
the agent must beg permission to use every time is not a default sink, but an
unbounded writable area is a hole in the sandbox. Scratch is the bounded,
pre-authorized middle.

### S5 — Scratch is not the workspace

Writing to scratch MUST NOT be treated as editing the user's project. The
contracts that govern workspace edits — read-before-edit, the freshness token an
edit requires — do not apply to scratch. Perceiving or producing a scratch file
is not reading-to-edit a user file, and MUST NOT satisfy those obligations.

## Lifecycle

- **Creation** is on demand — at session start or first use. An idle session
  need not have allocated anything.
- **Cleanup** is bounded: a host MAY reclaim scratch on session end, on a
  retention window, or on a coarser sweep. The invariant is only that the
  lifetime is bounded and that S2 holds — nothing of value is lost, because
  value lives outside scratch by promotion.
- **Promotion** is explicit and agent-driven: there is no implicit "scratch is
  saved" step. To keep an artifact, the agent moves it.

## Bindings

These vary legitimately between hosts; a conformant scratch fixes the contract
above and leaves these open. The recommended lean is given; the alternative is
conformant.

| Binding          | The choice                                                           | Lean                                                         |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Location         | Under the host data area, an OS temp area, or a per-session mount    | Host's call — invisible to the agent, which is told a handle |
| Cleanup policy   | On session end, a retention window, or an external sweep             | Bounded; tie to session lifetime unless retention is needed  |
| Reach mechanism  | A writable root the agent is told about, an allowlist, or a mount    | Pre-authorize so S4 holds without prompts                    |
| Surface exposure | A full structured-filesystem scope, or only shell + perception reach | Enough that the agent can read / move / copy / perceive (S4) |

## Implementor checklist

A conforming implementation MUST:

- Create a scratch area per session, host-owned, and tell the agent its location
  rather than letting it choose (S1).
- Bound scratch's lifetime and never make it the only home of durable value;
  durability is by promotion (S2).
- Make scratch the default destination for tools that produce files (S3).
- Let the agent read, move, copy, and perceive within scratch without
  per-operation approval, while keeping scratch inside sandbox containment (S4).
- Keep scratch writes outside the workspace-edit contracts (read-before-edit /
  freshness) (S5).

## What this guide does not specify

- **The exact path.** Where scratch physically lives is a binding; the agent
  sees a handle, not a path policy.
- **The cleanup timing.** Session-end, a TTL, or an external sweep — all
  conformant, subject to "bounded."
- **Durable user-asset storage.** Where promoted artifacts, saved generations,
  or a user library live is a separate concern.
- **The produce-file tools.** Image / video generation, downloads, and
  conversions are specified elsewhere; this page only fixes where their output
  lands.

## See also

- [Visual perception](./vision.md) — the stage-to-scratch lowering path and
  scratch as a source the agent perceives.
- [Binary file handling](./binary.md) — the scratch-space pattern for archive
  extraction; the same working-area concept applied to attachments.
- [Foundations](./foundations.md) — directory-rooted execution; the workspace
  root scratch is defined against.
- [Runtime Environments](./environments.md) — how the filesystem surface
  (including scratch) differs across web, cloud sandbox, and computer.
- [Session Lifecycle](./session.md) / [Persistency](./persistency.md) — the
  session whose lifetime scratch tracks.
- [Tools](./tools.md) — the produce-file and filesystem tools that write to and
  move within scratch.
