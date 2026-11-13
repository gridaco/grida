---
title: Runtime Environments
description: The three runtime environments an agent can be hosted in — web (limited capabilities), cloud sandbox (ephemeral container/VM), and computer (the user's machine). How the locked tool set degrades and which capabilities each environment provides.
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

An agent runs in **one of three environments**. The environment
determines which capabilities the runtime can offer, how the
sandbox is enforced, and how the locked tool set
([Tools](./tools.md))
degrades. Choosing the environment is the host's call; the agent
sees only the capabilities the chosen environment exposes.

| Environment       | Where it runs                                      | Sandbox model                                 | Persistence           |
| ----------------- | -------------------------------------------------- | --------------------------------------------- | --------------------- |
| **Web**           | Inside a browser tab — the user's open page        | Browser's same-origin policy + CORS           | Transient (tab close) |
| **Cloud sandbox** | Ephemeral container or micro-VM in a managed cloud | Container / VM isolation + outbound allowlist | Per-job lifetime      |
| **Computer**      | The user's own machine (desktop host, IDE, CLI)    | OS-enforced raw execution                     | Local-first, durable  |

Each environment is described below.

## Web

The agent runs inside a browser tab — typically as part of a single
page application, embedded in a product UI, or in a web-based IDE.

**Capabilities offered.**

| Capability    | Available?                                                                |
| ------------- | ------------------------------------------------------------------------- |
| `fs.read`     | **No** — the browser has no general filesystem.                           |
| `fs.write`    | **No** — same.                                                            |
| `shell.run`   | **No** — no shell, no subprocess.                                         |
| `net.fetch`   | **Yes**, constrained by browser CORS + same-origin policy.                |
| `secrets.has` | **Yes** if the host stores credentials in browser storage (with caution). |
| `stream.send` | **Yes**.                                                                  |

**Locked tool availability.**

| Tool          | Web                                                                                   |
| ------------- | ------------------------------------------------------------------------------------- |
| `read`        | Not available unless the host exposes a virtual file API (e.g. an in-memory project). |
| `write`       | Same.                                                                                 |
| `edit`        | Same.                                                                                 |
| `glob`        | Same.                                                                                 |
| `grep`        | Same.                                                                                 |
| `bash`        | **Not available.**                                                                    |
| `todo`        | Available.                                                                            |
| `task`        | Available (subagents share the same environment).                                     |
| `question`    | Available.                                                                            |
| `web_search`  | Available via a hosted provider.                                                      |
| `web_fetch`   | Available, subject to CORS.                                                           |
| `skill`       | Available (skills index discovered from the host's bundled or fetched skill set).     |
| `tool_search` | Available.                                                                            |

**Sandbox.** The browser is the sandbox. The agent cannot reach the
user's filesystem, cannot spawn processes, cannot bind ports. Outbound
HTTP is bounded by CORS. The agent's only escape is whatever surface
the host explicitly exposes — typically a postMessage bridge to a
trusted endpoint, or a virtual project the host maintains in memory.

**Use cases.**

- A product-embedded coding assistant operating on documents the
  product already loaded.
- An in-browser IDE with the project mounted into an in-memory virtual
  filesystem (the host implements `fs.*` against that virtual FS).
- A "discuss-and-recommend" agent that does not modify anything — pure
  conversation + web search.

**What this environment cannot do.**

- Run arbitrary user code.
- Interact with the user's installed tools, version control, or
  package manager.
- Persist data beyond the host's storage layer (which the host MUST
  provide explicitly).

**Persistence.** Browser storage (IndexedDB, localStorage) is the host's
choice. The session store is durable only if the host writes it; a
default web host SHOULD treat sessions as ephemeral unless it
synchronizes to a server.

## Cloud sandbox

The agent runs in an ephemeral container or micro-VM provisioned by a
cloud host. The container is created for the job, lives long enough to
serve it, and is destroyed (or snapshotted) afterward.

**Capabilities offered.**

| Capability    | Available?                                                            |
| ------------- | --------------------------------------------------------------------- |
| `fs.read`     | **Yes**, scoped to the container's filesystem.                        |
| `fs.write`    | **Yes**, scoped to the container's filesystem.                        |
| `shell.run`   | **Yes**, scoped to the container.                                     |
| `net.fetch`   | **Yes**, subject to an outbound allowlist or a forward proxy.         |
| `secrets.has` | **Yes** via the cloud host's secret-injection layer (env vars, etc.). |
| `stream.send` | **Yes**.                                                              |

**Locked tool availability.** All locked tools are available; their
scope is the container.

**Sandbox.** The container or VM is the sandbox. Anything the agent
does inside is bounded by the container's mounts, its netns, and its
syscall filter. The host MUST configure the container so that:

- The agent's `fs` capability scope matches the container's writable
  mounts; nothing else is writable.
- The agent's `net` capability scope is enforced by the container's
  network policy (an allowlist, a forward proxy, or a default-deny
  egress rule).
- Privileged operations (mounting, raw sockets, ptrace) are denied.

**Use cases.**

- Hosted code review / refactoring / migration agents.
- "Try this in a sandbox" CI-adjacent runners.
- Multi-tenant agent services where each user's session gets its own
  container.

**Persistence.** Per-container. When the container exits, its
filesystem is gone unless the host snapshots it. The session store
SHOULD live outside the container so a re-spawned container can
continue an interrupted session.

**Recommended discipline.**

- Treat the container as untrusted from the host's perspective; a
  compromised agent that escapes the runtime's capability check is
  still bounded by the container.
- Snapshot the container's filesystem at user-message boundaries if
  side-effect rewind ([Master / branching and editing history](./master.md#branching-and-editing-history))
  is required.
- Run one container per session to avoid cross-session interference.
- Time-bound the container (idle timeout, max lifetime).

## Computer

The agent runs on the user's own machine — as a long-lived local daemon
process, an IDE plugin, a CLI invocation, or any local process.

**Capabilities offered.**

| Capability    | Available?                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| `fs.read`     | **Yes**, scoped by the effective host-issued grant and the selected host profile.           |
| `fs.write`    | **Yes**, same scoping.                                                                      |
| `shell.run`   | **Yes**, through one execution-confinement authority.                                       |
| `net.fetch`   | **Yes**, only as a structured capability or within an explicit execution destination grant. |
| `secrets.has` | **Yes** via the OS keychain or a local secrets file.                                        |
| `stream.send` | **Yes**.                                                                                    |

**Tool availability.** Each capability is available only where the host can
enforce its declared profile. An unavailable raw-execution backend withholds
shell, external-runtime, and extension execution that requires it. Structured
file operations and inference have their own requirements. If the deployment
also requires whole-host containment, that requirement is checked separately.

**Sandbox.** Raw commands, external agents, and extension runtimes require
execution confinement. A deployment can add host containment for trusted
in-process services. Any permitted connection uses a compatible host network
route within its destination grant. An incompatible opaque client fails closed.
See [Execution authority](./execution-authority.md).

Native confinement is the current backend: a deny-default platform sandbox
profile on macOS, and user, mount, PID, IPC and network namespaces with a
syscall filter on Linux. Raw networking is denied, and native Windows raw
execution is unavailable. Its platform backends satisfy these authority
boundaries. The host supplies routing and transport trust, and concurrent
executions retain independent grants. The
[retired srt backend study](./srt.md) records the findings that informed it. The
concrete platform choices and support boundary live in the
[native sandbox binding](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-sandbox.md).

For `shell.run`, the host creates a confined process tree from the effective
grant: the host/user ceiling ∩ declared requirements ∩ parent-delegable
authority. The watchdog may narrow that result; it cannot mint authority
([Permission policy](./permissions.md)). The trusted agent host
uses its own authority and selected containment profile. Its provider calls use
the host-service destination grant and transport.

**Defense in depth.** Three layers:

1. The runtime's capability check refuses out-of-scope arguments at
   the API boundary.
2. The watchdog inspects the call and may deny / ask.
3. The OS sandbox refuses anything the runtime mis-let-through.

Each layer is sufficient for its kind of failure; together they bound
the agent.

**Use cases.**

- Personal-productivity agents acting on the user's projects.
- Developer-tool agents that need real shell, real version control,
  real package managers.
- Long-lived "always-on" assistants that survive across reboots.

**Persistence.** Local-first, durable. The session store is a
filesystem-resident database
([Components / storage and recovery](./components.md#storage-and-recovery)). Sync, if added, is a layer above.

**Recommended discipline.**

- Run one daemon process per user; let it own all session state and
  secrets.
- Generate a per-launch credential for the host's IPC perimeter (HTTP
  loopback / Unix socket / named pipe); do not expose the agent host to
  the network.
- Keep host services, structured capabilities, extensions, and raw execution on
  separate authority paths. Enforce the selected host-containment profile and
  apply execution confinement to every raw process tree the agent controls,
  including external agents that own their own tool loop.
- Resolve an already-authorized destination through the effective host network
  route. Merely removing a network sandbox does not provide system proxy, PAC,
  proxy-authentication, or transport-trust compatibility.

## How a host picks

The decision is mostly forced by product shape:

| If the host is …                                  | Pick …        |
| ------------------------------------------------- | ------------- |
| A web app with no install footprint               | Web           |
| A managed service running agents for many users   | Cloud sandbox |
| A desktop / IDE / CLI installed on the user's box | Computer      |

A host MAY straddle environments — for example, a desktop product
that offers "run this locally" (Computer) and "run this in our cloud"
(Cloud sandbox) for the same agent. The agent's capability
requirements are constant across environments; only what the runtime
exposes shifts.

## Cross-environment invariants

Regardless of environment:

- **The capability surface is the contract.** Every tool's `requires`
  is declared upfront, and the runtime refuses any out-of-scope call.
- **The watchdog runs.** A pre-execute hook on every tool call is
  available in every environment, even if the environment forbids
  the underlying capability outright.
- **The session shape is the same.** A session row from a web host is
  inspectable next to a session row from a desktop host
  ([Components / storage and recovery](./components.md#storage-and-recovery)).
- **The streaming substrate is the same.** AI SDK v6 chunks regardless
  of where the loop runs ([Components / inference](./components.md#inference)).
- **Subagents share the parent's environment.** A subagent spawned in
  a cloud sandbox runs in the same container; a subagent spawned in
  the web environment is also a browser-side runner.

## What this guide does not specify

- **The container image, the VM bootstrap, or the cloud provider.**
  Containerization is the host's choice (Docker, Firecracker,
  gVisor, K8s, …). The guide specifies only the capability surface
  the runtime exposes.
- **The browser permission UI.** Browser-host UI for "this agent
  wants to read clipboard / access file X" is the host's concern.
- **OS-level sandbox flag tuning.** Specific seatbelt rules, landlock
  layers, or AppContainer SIDs are implementation details.

## See also

- [Tools](./tools.md) — per-tool detail and the result envelope.
