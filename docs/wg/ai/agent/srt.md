---
title: Retired sandbox backend study — srt
description: Historical evaluation of the retired srt backend and the confinement guarantees its native replacement preserves, including host routing and independent authority domains.
keywords:
  [
    agent-system,
    sandbox,
    srt,
    sandbox-runtime,
    sandbox-exec,
    seatbelt,
    bubblewrap,
    landlock,
    reference-implementation,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Retired sandbox backend study — srt

This is a historical study. Native confinement has replaced srt, and no
current host depends on it. The page records the retired backend's capabilities
and limitations because its findings informed the native adapter's
requirements. The
[native sandbox binding](https://github.com/gridaco/grida/blob/main/crates/grida-agent/docs/rust-sandbox.md)
defines the current platform mechanisms, launch contract, and support limits.

For the `computer` environment
([`environments / computer`](./environments.md#computer)), every raw
agent-controlled process tree requires an attributable OS-level sandbox.
The retired host also selected outer containment for its trusted service.
These have independent profiles and availability. [Execution authority](./execution-authority.md)
owns the distinction and the deployment-level choice of host containment.

The retired implementation used
[`anthropic-experimental/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime)
(`srt`). The audited release has macOS and Linux backends plus an alpha Windows
backend whose lifecycle is assessed separately below. It
supplies filesystem deny-then-allow, network allow-only, and a mandatory deny
set for common escape paths. Its host-route and concurrent-authority limitations
are described below. The replacement is evaluated against the contracts in
[Environments](./environments.md), [Execution authority](./execution-authority.md),
and [Components](./components.md#integration-capabilities-and-bounds).

## What srt provides

| Concern        | Pattern                | Default            | Notes                                                           |
| -------------- | ---------------------- | ------------------ | --------------------------------------------------------------- |
| Read           | deny-then-allow        | allowed everywhere | `allow_read` overrides `deny_read`. Carve out sensitive paths.  |
| Write          | allow-only             | denied everywhere  | `deny_write` overrides `allow_write`. Enumerate writable roots. |
| Network (HTTP) | allow-only domain list | denied             | Routed through an HTTP proxy srt runs on the host.              |
| Network (TCP)  | allow-only domain list | denied             | Routed through a SOCKS5 proxy on the host.                      |
| Unix sockets   | allow-only             | denied             | Linux blocks via seccomp BPF; macOS via Seatbelt.               |

srt ships a **mandatory deny set** that is always blocked regardless of policy
— shell startup files, version-control hooks and configuration, IDE
configuration, MCP configuration, and similar paths that are common sandbox
escape vectors. The guide RECOMMENDS that any substitute keep an equivalent
set.

`allowLocalBinding` is ambient local-network authority, not a substitute for a
specific IPC capability. A host that needs only an already-connected socket
SHOULD keep it false and transfer that socket explicitly. In the 0.0.65 macOS
backend, enabling it permits local bind/inbound operations and loopback
outbound connections, which is broader than serving one host-selected
connection. Linux uses a private network namespace and needs its own
descriptor-transfer proof rather than an inference from the macOS profile.

## Enforcement primitives

| OS      | Backend                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS   | [Seatbelt](https://reverse.put.as/wp-content/uploads/2011/09/Apple-Sandbox-Guide-v1.0.pdf) profile, run under `sandbox-exec`.                                |
| Linux   | `bubblewrap` with bind mounts and network-namespace stripping; HTTP/SOCKS5 proxies bridged via Unix sockets; optional seccomp BPF for `socket(AF_UNIX, …)`.  |
| Windows | Alpha `srt-win` helper: dedicated local account, WFP egress fence, filesystem ACEs, restricted token, and Job object; distinct provisioning/spawn lifecycle. |

The Windows backend in the audited 0.0.65 release is not drop-in parity with
the macOS/Linux wrapper. A host must own its helper provisioning, argv-based
spawn, packaging, lifecycle, and regression suite before claiming support.
These requirements concern the existing backend. The rebuild's native Windows
support boundary is defined in the native sandbox proposal.

## How it sits in the guide's stack

srt can provide either of the OS boundaries named in
[`environments / computer / sandbox`](./environments.md#computer):

- a filesystem-and-process host-containment profile whose networking is not an
  agent destination policy; and
- an execution-confinement profile for one raw runtime authority.

These roles MUST NOT share mutable authority. For `shell.run`, the execution
policy is built from the effective host-issued grant; the
[watchdog](./permissions.md) may narrow that grant but cannot mint
authority. The three defense-in-depth layers are:

1. The runtime's capability check refuses out-of-scope arguments at the API
   boundary.
2. The watchdog inspects the call and may `allow` / `ask` / `deny`.
3. srt, or its substitute, refuses anything the runtime mis-let-through.

The shape of the confinement policy — what paths, destinations, and socket
classes are reachable — is the principal's authority plus runtime context, not
srt's business. srt compiles that reachability policy into Seatbelt /
bubblewrap and `exec`s the child under it. The host supervisor still owns
executable resolution, argument and environment validation, subprocess rules,
lifetime, and process-tree termination. Destination authorization must precede
host routing as required by
[execution authority A6](./execution-authority.md#a6--destination-authorization-precedes-host-routing).

## Host-route limits

In its ordinary, non-TLS-terminating proxy mode, the audited `0.0.65` release
captures `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` from its host and can chain
HTTP, HTTPS `CONNECT`, and child SOCKS traffic through that static parent route.
It does not discover an operating system's proxy configuration, evaluate PAC
rules per destination, or provide a general proxy-authentication integration.
The behavior is visible in the tagged
[`parent-proxy` resolver](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/parent-proxy.ts)
and
[`SandboxManager` initialization](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/sandbox-manager.ts),
[`CONNECT` forwarding](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/http-proxy.ts),
and [SOCKS forwarding](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/socks-proxy.ts).
The optional TLS-termination path is an exception: its upstream leg does not
yet honor the parent proxy, as shown by the tagged
[`tls-terminate-proxy` implementation](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/tls-terminate-proxy.ts).
Running srt outside the confined child means ordinary host routes, route-based
VPNs, and host DNS can still apply; it does not mean every user network
configuration is honored.

The same distinction applies to transport trust. Opaque HTTPS tunneling leaves
certificate validation with the client, while an upstream HTTPS proxy is
validated by the host runtime. Neither behavior guarantees use of the system
trust store. A conforming host therefore supplies a host-route and
transport-trust adapter around the confinement primitive; it does not assume
that proxy environment variables or unsandboxed sockets are equivalent to the
effective host network.

The route claim is client-specific:

| Client class                                          | Route and trust behavior the host may rely on                                                                                                                                                                 | Conforming posture                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Host-owned Chromium/Electron transport                | Consults Chromium's system proxy resolver and supports its proxy-authentication flow; uses Chromium/platform trust integration.                                                                               | Preferred for host-service HTTP and streaming.                                                           |
| Host-owned Node transport                             | Uses proxy environment only when an appropriate dispatcher is installed; system trust requires deliberate runtime configuration such as [`--use-system-ca`](https://nodejs.org/api/cli.html#--use-system-ca). | Configure explicitly; do not claim PAC or integrated proxy auth from ambient Node alone.                 |
| Configurable tools such as `curl` or version control  | Behavior depends on the executable's own proxy, configuration, and trust inputs.                                                                                                                              | Supply only inputs within the grant and verify the exact client/platform pair.                           |
| Opaque or bundled clients, including some Go binaries | May ignore proxy configuration or use a trust mechanism unavailable inside confinement.                                                                                                                       | Deny network or expose a diagnosed, explicit unmanaged-network grant; never silently bypass confinement. |

Electron's host-owned transport is documented to use Chromium's networking
library, including automatic proxy configuration, at
[`net`](https://www.electronjs.org/docs/latest/api/net). This does not make it
a transparent tunnel for opaque child processes; it is a designed host-service
transport.

## Authority-instance limits

The audited `0.0.65` manager holds configuration, network proxies, parent-route
state, and callbacks in process-global state. Per-command custom configuration
can specialize filesystem profiles for newly launched processes, but network
filtering still consults the shared policy. Reinitialization also disrupts
shared proxy infrastructure. See the tagged
[`SandboxManager` state](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/sandbox-manager.ts)
and [network-filter update path](https://github.com/anthropic-experimental/sandbox-runtime/blob/v0.0.65/src/sandbox/sandbox-manager.ts).

Consequently, one in-process manager cannot enforce different immutable
network grants for concurrent commands, extensions, external agents, or
subagents. A conforming host must use one manager-owning process per authority
domain, add an attributable network mediator, or substitute an enforcer with
instance-scoped state. Version bumps must re-audit this limitation rather than
assuming a custom per-call policy supplies network identity.

## Replacement requirements

The replacement preserves the authority model while supplying its own native
enforcement. The model distinguishes declarations, admission decisions, and
the OS boundary that enforces them.

| Concern               | Required owner and evidence                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host containment      | The host independently selects and establishes any outer confinement profile required by its deployment.                                          |
| Raw execution         | The native adapter binds an immutable grant to one attributable process tree, including inherited filesystem, network, socket, and handle access. |
| Concurrent principals | Each execution keeps independent authority. Shared mutable network policy cannot widen another execution's grant.                                 |
| Sensitive paths       | Host policy defines mandatory protected paths and the backend proves the effective restrictions on each supported platform.                       |
| Routing and trust     | The host supplies destination authorization, routing, proxy behavior, and transport trust independently of the confinement backend.               |
| Lifecycle             | The executor reports cancellation, worker termination, descendant revocation, and cleanup according to the evidence it has.                       |
| Platform availability | The adapter reports which requested profiles it can enforce, and admission rejects unsupported profiles.                                          |

Process-group cancellation alone cannot prove that a deliberately detached
descendant has terminated. It can remain confined while still modifying resources
inside its grant. Releasing conflicting resource ownership requires verified
termination or revocation of the relevant access. Until then, the replacement
retains an unresolved disposition. This distinction belongs to the durable
execution contract as well as the native backend.

Platform primitives, helper processes, packaging, and revocation techniques
require implementation evidence. The component contract does not select them.

## What this guide does not specify

- **Bundling.** How a host ships the selected backend with its installer —
  single binary, system dependency, container layer — is host territory.
- **Violation surfacing.** macOS reports violations via the system log store;
  Linux requires `strace` or equivalent. How a host surfaces these to the user
  or feeds them back to the agent loop is a UX question the guide does not
  answer.
- **Process topology.** A confined runtime may be launched by the host daemon
  or by a supervisor. The conformance requirement is that the launcher is
  host-owned, one authority domain cannot mutate another, and a raw spawn
  primitive is never exposed to the model.
- **Version pinning.** The host owns dependency pinning and review of changes
  to the selected enforcement implementation.

## See also

- [Environments](./environments.md#computer) — where the sandbox sits in the
  `computer` environment.
- [Execution authority](./execution-authority.md) — principal separation,
  host routing, and grant attribution.
- [Tools](./tools.md#capability-requirements) — the capability shape srt
  compiles from.
- srt source and documentation:
  [`anthropic-experimental/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime).
