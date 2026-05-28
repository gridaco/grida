---
title: Sandbox Runtime (srt) — reference implementation
description: srt is named here as the reference sandbox implementation for the computer environment — the only mature, ready-to-go option matching the capability surface this guide describes. The protocol does not lock to it; implementors MAY substitute any equivalent.
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

# Sandbox Runtime (`srt`) — reference implementation

For the `computer` environment ([`environments / computer`](./environments.md#computer)),
the runtime MUST wrap the agent process tree in an OS-level sandbox.
The guide does not lock to any single primitive — `Seatbelt`,
`Landlock`, `bubblewrap`, `AppContainer`, and others all qualify
when wired correctly.

In practice, the only **ready-to-go** implementation that matches the
capability surface this guide describes — per-process tree
restriction, per-call sub-policies, fs deny-then-allow / network
allow-only, mandatory deny set for the most common escape paths — is
[`anthropic-experimental/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime)
("srt"). This page names it explicitly, the same way
[`foundations`](./foundations.md) names AI SDK v6 (the chunk shape)
and SQLite (the persistence shape).

Naming srt here is a recommendation, not a requirement. An
implementor MAY substitute any equivalent that delivers the same
capability surface; conformance with [`environments`](./environments.md)
is what matters.

## What srt provides

| Concern        | Pattern                | Default            | Notes                                                                 |
| -------------- | ---------------------- | ------------------ | --------------------------------------------------------------------- |
| Read           | deny-then-allow        | allowed everywhere | `allow_read` overrides `deny_read`. Carve out sensitive paths.        |
| Write          | allow-only             | denied everywhere  | `deny_write` overrides `allow_write`. Must enumerate what's writable. |
| Network (HTTP) | allow-only domain list | denied             | Routed through an HTTP proxy `srt` runs on the host.                  |
| Network (TCP)  | allow-only domain list | denied             | Routed through a SOCKS5 proxy on the host.                            |
| Unix sockets   | allow-only             | denied             | Linux blocks via seccomp BPF; macOS via Seatbelt.                     |

srt ships a **mandatory deny set** that is always blocked regardless
of policy — shell rc files, git hooks and config, IDE config,
`.mcp.json`, and similar paths that are the most common
sandbox-escape vectors (writing a hook that runs on the user's next
`git commit`, planting an MCP config that auto-loads, etc.). The
guide RECOMMENDS that any substitute keep an equivalent set.

## Enforcement primitives

| OS      | Backend                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS   | [Seatbelt](https://reverse.put.as/wp-content/uploads/2011/09/Apple-Sandbox-Guide-v1.0.pdf) profile, run under `sandbox-exec`.                               |
| Linux   | `bubblewrap` with bind mounts and network-namespace stripping; HTTP/SOCKS5 proxies bridged via Unix sockets; optional seccomp BPF for `socket(AF_UNIX, …)`. |
| Windows | Not supported by srt today.                                                                                                                                 |

The Windows gap is the largest practical caveat. Implementors who
must support Windows under the `computer` environment SHOULD either
gate sandbox-requiring features off on Windows, or substitute an
AppContainer + Job-objects-based primitive and adapt the policy
shape.

## How it sits in the guide's stack

srt provides the **outer sandbox primitive** named in
[`environments / computer / sandbox`](./environments.md#computer). The
runtime layers a **per-tool-call sub-policy** on top — for
`shell.run`, the sub-policy is built from the agent's declared
allowlist plus the [watchdog's](./foundations.md#watchdog) runtime
evaluation. The three defense-in-depth layers are unchanged:

1. The runtime's capability check refuses out-of-scope arguments at
   the API boundary.
2. The watchdog inspects the call and may `allow` / `ask` / `deny`.
3. srt (or its substitute) refuses anything the runtime
   mis-let-through.

The shape of the sub-policy — what fs paths, what hosts, what
commands — is the agent's manifest plus runtime context, not srt's
business. srt's job is to compile the policy into Seatbelt /
bubblewrap and `exec` the child under it.

## Why this guide names it

Three reasons, matching the AI-SDK-v6 and SQLite picks:

- **It exists, it works, it's the only one.** No other open
  implementation today covers per-process-tree fs + net + Unix-socket
  enforcement with per-call sub-policies on both macOS and Linux. A
  guide that omits the only working option is just abstraction with no
  landing pad.
- **The capability shape matches.** srt's `allow_read` / `allow_write`
  / `allowed_domains` / `allow_unix_sockets` maps 1:1 to the
  capability declarations in [`tools`](./tools.md#requirementset). The
  translation is mechanical.
- **Its mandatory deny set is good.** Implementors who roll their own
  routinely forget shell rc, git hooks, or IDE config. srt does the
  bookkeeping.

## What this guide does not specify

- **Bundling.** How a host ships srt (or its substitute) with its
  installer — single binary, system dependency, container layer — is
  host territory.
- **Violation surfacing.** macOS reports violations via the system log
  store; Linux requires `strace` or equivalent. How a host surfaces
  these to the user or feeds them back to the agent loop is a UX
  question the guide does not answer.
- **Nested-sandbox spawn path.** Whether the inner per-call wrap is
  performed by the agent process itself (nested sandbox; weaker on
  some platforms) or by sending a spawn-request to the host's
  supervisor over IPC is an implementation choice. The latter is
  RECOMMENDED.
- **Version pinning.** Pinning a specific srt release and auditing
  changelogs before bumping is RECOMMENDED but not normative.

## See also

- [Environments](./environments.md#computer) — where the sandbox sits
  in the `computer` environment.
- [Foundations](./foundations.md#watchdog) — the pre-execute hook that
  rides above the sandbox.
- [Tools](./tools.md#requirementset) — the capability shape srt
  compiles from.
- srt source / docs: [`anthropic-experimental/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime).
