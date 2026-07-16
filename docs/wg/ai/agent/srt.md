---
title: Sandbox Runtime (srt) — reference confinement primitive
description: srt is the reference macOS and Linux confinement primitive for the computer environment, with explicit limits around host routing and concurrent authority domains.
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

# Sandbox Runtime (`srt`) — reference confinement primitive

For the `computer` environment
([`environments / computer`](./environments.md#computer)), the runtime MUST
retain host containment for structured capabilities and MUST wrap every **raw
agent-controlled process tree** in an attributable OS-level sandbox. Those are
distinct authority domains; [Execution authority](./execution-authority.md)
owns the distinction.

The guide does not lock to any single primitive — `Seatbelt`, `Landlock`,
`bubblewrap`, `AppContainer`, and others all qualify when wired correctly.

This guide uses
[`anthropic-experimental/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime)
(`srt`) as its concrete macOS and Linux reference; the audited release also has
an alpha Windows backend whose lifecycle is assessed separately below. It
supplies filesystem deny-then-allow, network allow-only, and a mandatory deny
set for common escape paths. It does **not** by itself satisfy the host-route or
concurrent-authority contracts in
[Execution authority](./execution-authority.md). This page names it explicitly,
the same way [`foundations`](./foundations.md) names AI SDK v6 (the chunk shape)
and SQLite (the persistence shape).

Naming srt here is a recommendation, not a requirement. An implementor MAY
substitute any equivalent that delivers the same capability surface;
conformance with [`environments`](./environments.md) and
[Execution authority](./execution-authority.md) is what matters.

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
Until then it SHOULD gate sandbox-requiring features off or substitute another
AppContainer + Job-objects-based primitive.

## How it sits in the guide's stack

srt can provide either of the OS boundaries named in
[`environments / computer / sandbox`](./environments.md#computer):

- a filesystem-and-process host-containment profile whose networking is not an
  agent destination policy; and
- an execution-confinement profile for one raw runtime authority.

These roles MUST NOT share mutable authority. For `shell.run`, the execution
policy is built from the effective host-issued grant; the
[watchdog](./foundations.md#watchdog) may narrow that grant but cannot mint
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

## Why this guide names it

Three reasons, matching the AI-SDK-v6 and SQLite picks:

- **It is a concrete, integrated baseline.** Its macOS and Linux backends make
  the required filesystem, network, and Unix-socket restrictions testable
  rather than leaving the guide at an abstract policy shape.
- **The capability shape is a useful baseline.** srt's `allow_read` /
  `allow_write` / `allowed_domains` / `allow_unix_sockets` covers the core
  declaration vocabulary in
  [`tools`](./tools.md#capability-requirements). Authority attribution and host
  routing remain host responsibilities.
- **Its mandatory deny set is good.** Implementors who roll their own routinely
  forget shell startup files, version-control hooks, or IDE configuration. srt
  does the bookkeeping.

## What this guide does not specify

- **Bundling.** How a host ships srt, or its substitute, with its installer —
  single binary, system dependency, container layer — is host territory.
- **Violation surfacing.** macOS reports violations via the system log store;
  Linux requires `strace` or equivalent. How a host surfaces these to the user
  or feeds them back to the agent loop is a UX question the guide does not
  answer.
- **Process topology.** A confined runtime may be launched by the host daemon
  or by a supervisor. The conformance requirement is that the launcher is
  host-owned, one authority domain cannot mutate another, and a raw spawn
  primitive is never exposed to the model.
- **Version pinning.** Pinning a specific srt release and auditing changelogs
  before bumping is RECOMMENDED but not normative.

## See also

- [Environments](./environments.md#computer) — where the sandbox sits in the
  `computer` environment.
- [Execution authority](./execution-authority.md) — principal separation,
  host routing, and grant attribution.
- [Foundations](./foundations.md#watchdog) — the pre-execute hook above the
  sandbox.
- [Tools](./tools.md#capability-requirements) — the capability shape srt
  compiles from.
- srt source and documentation:
  [`anthropic-experimental/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime).
