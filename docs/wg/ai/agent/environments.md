---
title: Runtime Environments
description: The three environments an agent can be hosted in — web (a browser page), cloud sandbox (an ephemeral container or virtual machine), and computer (the user's machine) — and which capabilities, enforcement, and persistence each can honestly offer.
keywords:
  [
    agent-system,
    environments,
    web,
    cloud-sandbox,
    computer,
    capabilities,
    sandbox,
    hosting,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Runtime Environments

An agent runs in one of three environments. The environment decides which
capabilities a host can offer, what enforces their bounds, and where the
session record lives. Choosing it is the host's decision; the agent sees only
the capabilities offered for each step, as [Tools](./tools.md) describes.
[Execution authority](./execution-authority.md) owns principals, grants, and
routing in every environment.

| Environment   | Where it runs                                       | What bounds the agent                           | Session record             |
| ------------- | --------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| Web           | A browser page                                      | The browser's origin policy                     | Whatever the host persists |
| Cloud sandbox | An ephemeral container or virtual machine           | Container or VM isolation with an egress policy | Outside the sandbox        |
| Computer      | The user's machine: a desktop app, IDE, or terminal | Host grants plus confinement for raw execution  | Local and durable          |

Capabilities below use five categories: **files** (read and write), **raw
execution** (commands and processes), **network** (outbound requests),
**credentials** (provider and service custody), and **output** (streaming to a
client).

## Web

The agent runs inside a browser page, typically embedded in a product.

| Capability    | Offered                                                                |
| ------------- | ---------------------------------------------------------------------- |
| Files         | Only through a host-provided virtual project; no general filesystem.   |
| Raw execution | None.                                                                  |
| Network       | Requests the browser permits under its origin and cross-origin policy. |
| Credentials   | Only what the host deliberately exposes to the page; usually none.     |
| Output        | Yes.                                                                   |

The browser is the boundary. The agent reaches nothing the host does not expose
through an explicit bridge. Work that needs real files, processes, version
control, or installed tools does not belong here. A session is durable only if
the host persists it, typically to a server.

## Cloud sandbox

The agent runs in a container or virtual machine created for the job and
discarded or snapshotted afterward.

| Capability    | Offered                                                        |
| ------------- | -------------------------------------------------------------- |
| Files         | Within the container's writable mounts.                        |
| Raw execution | Within the container.                                          |
| Network       | Through an egress allowlist, a forward proxy, or default deny. |
| Credentials   | Through the host's injection layer, scoped to the job.         |
| Output        | Yes.                                                           |

The host configures the container so the agent's file scope equals its writable
mounts, network scope equals its egress policy, and privileged operations are
denied. The session record lives outside the container so a replacement can
continue interrupted work. One container per session avoids interference, and
idle and total lifetimes are bounded. Snapshotting at input boundaries supports
[history branching](./master.md#branching-and-editing-history) that must also
restore side effects.

## Computer

The agent runs on the user's own machine as a long-lived host, an IDE
extension, or a terminal program.

| Capability    | Offered                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Files         | Within the effective host-issued grant and the selected [permission preset](./permissions.md). |
| Raw execution | Only through execution confinement.                                                            |
| Network       | As a structured capability, or within an explicit destination grant on a host route.           |
| Credentials   | In the host's private custody; never handed to raw execution unless deliberately delegated.    |
| Output        | Yes.                                                                                           |

**Availability follows enforcement.** Each capability is offered only where the
host can enforce its declared bounds. When the confinement backend is
unavailable on a platform, commands, external agent runtimes, and extension
runtimes that need it are withheld; structured file operations and inference
keep their own requirements.

**Raw execution.** Every agent-controlled process tree runs under one immutable
authority set derived from the host and user ceiling, the declared
requirements, and what the parent may delegate. Permission review can narrow
that set; it cannot mint authority. The concrete platform mechanisms and their
support boundary belong to the
[native sandbox binding](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-sandbox.md).

**Defense in depth.** Three independent layers:

1. The host refuses an operation outside the step's offered capabilities and
   grants.
2. The permission policy decides whether the operation proceeds, asks, or is
   denied.
3. Operating-system confinement refuses anything the first two let through by
   mistake.

**Host discipline.**

- One long-lived host per user owns session state and credential custody.
- A per-launch credential protects the host's local interface, which is never
  exposed to the network.
- Host services, structured capabilities, extensions, and raw execution keep
  separate authority paths.
- An already-authorized destination is reached through the effective host
  route. Removing a sandbox does not by itself provide proxy, proxy
  authentication, or transport-trust compatibility.

The session record is a local durable store
([Components / storage and recovery](./components.md#storage-and-recovery)).
Synchronization, if added, is a layer above it.

## Choosing and combining

| If the host is …                                      | Choose        |
| ----------------------------------------------------- | ------------- |
| A web product with no install footprint               | Web           |
| A managed service running agents for many users       | Cloud sandbox |
| A desktop app, IDE, or terminal on the user's machine | Computer      |

A host MAY offer more than one — for example, a desktop product that runs work
locally or in a hosted sandbox. A task's capability requirements stay the same;
only what the environment can offer changes.

## Invariants across environments

- **Offered capabilities are the contract.** Each tool declares what it
  requires, and the host refuses calls outside the step's grants.
- **The permission policy applies everywhere**, even where the environment
  forbids the underlying capability outright.
- **The session model is the same.** Sessions, turns, and their records have
  the same meaning wherever the work ran ([Components](./components.md)).
- **Child tasks share their parent's environment** and receive derived grants,
  never wider ones.

## Not specified here

- Container images, virtual machine bootstrap, or the cloud provider.
- The browser's permission prompts.
- Platform sandbox profiles and their tuning.

## See also

- [Execution authority](./execution-authority.md) — principals, grants, and
  host routing.
- [Permission policy](./permissions.md) — presets, approval, and protected
  paths.
- [Local daemon](./daemon.md) — the long-lived host on a computer.
