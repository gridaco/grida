---
title: Local Daemon
description: The agent server as a long-lived, discoverable local process — one server, many clients. The discovery contract (registration record, persistent credential, atomic publish, single-daemon convergence), the authenticated probe and protocol gate, connect-or-spawn, the browser exception, and the production shape.
keywords:
  [
    agent-system,
    daemon,
    discovery,
    loopback,
    auth,
    cors,
    sse,
    cli,
    acp,
    browser,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Local Daemon

An agent system that conforms to this guide is already an HTTP
server on a loopback interface — the host starts it, a client
transport drives it ([`foundations`](./foundations.md)). What a
single-host embedding lacks is **discoverability**: the server's
address and credential live in one supervisor's memory, so only
that supervisor's client can reach it. Every other would-be client
— a CLI invocation, a second app window, an ACP adapter, a web
page, a test harness — has no path in.

The **local daemon** model removes that limitation. The agent
server becomes a long-lived per-user process that **publishes its
existence** to a well-known place on disk, guarded by a persistent
credential. Any local client connects to the same daemon, sees the
same sessions, and rides the same wire contract. The privileged
supervisor channel stops being load-bearing; it becomes one client
among many.

This is the same shape peer agent systems converge on: one local
server, a thin CLI, an editor adapter, a web client — all over one
contract. The benefit that motivates the change is **debugging
what you ship**: when the dev loop runs a normal server reached by
a normal browser, the three-layer embedded build (shell, bridge,
server) stops being the only way to observe the system.

## Vocabulary

- **Daemon** — the agent server process when it runs long-lived
  and published, rather than embedded in and private to one host.
- **Registration** — the on-disk record announcing a live daemon:
  where it listens, who claims it, how to judge compatibility.
- **Credential** — the shared secret a client must present on
  every request. See [Auth model](#auth-model).
- **State directory** — the per-user directory the agent component
  owns; the registration and credential live here.
- **Local-process client** — a client that runs as the same OS
  user and can read the state directory: the CLI, a desktop shell,
  an ACP adapter, a test harness.
- **Browser client** — a client that cannot read files: a web page.
  See [The browser exception](#the-browser-exception).

## Discovery contract

### The registration record

A daemon that wants to be discoverable MUST publish a registration
record in the state directory containing at least:

| Field     | Meaning                                                                                                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | A random per-launch claim token. The ownership fact: a daemon owns the registration iff the record's `id` is the one it wrote.                                                                                                                                                                                          |
| `version` | The implementation version, informational. NOT the compatibility gate — see [Probe](#probe-and-protocol-gate).                                                                                                                                                                                                          |
| `url`     | The loopback base URL the daemon listens on. Readers MUST reject any other host: accept exactly `127.0.0.1`, `localhost`, or IPv6 `::1` — deliberately narrower than the full `127.0.0.0/8` range, since implementations only ever bind the canonical address and a tampered record gains nothing from the wider range. |
| `pid`     | The daemon's OS process id. For diagnostics and last-resort termination; never for liveness.                                                                                                                                                                                                                            |

### Atomic publish

The record MUST be written atomically (write-temp-then-rename or
equivalent) so a concurrent reader can never observe a partial
record. The record and the credential MUST be readable only by the
owning OS user (owner-only file mode).

### Single-daemon convergence

At most one daemon per state directory is the steady state. The
mechanism is **last writer wins**:

- Publishing is unconditional — a new daemon overwrites whatever
  record exists.
- A running daemon MUST re-read the registration on an interval
  and **stand down** (graceful shutdown) when the record's `id` is
  no longer its own. The newest claimant wins; the displaced
  daemon exits instead of fighting.
- On graceful shutdown a daemon MUST remove the registration —
  but only if it still owns it (compare `id` before delete, never
  blind-delete).

Removing the registration file is therefore also an administrative
"stand down" signal: a daemon that finds its record gone treats it
the same as being displaced.

### Stale records

A registration proves nothing by existing. Liveness is proven by
the [probe](#probe-and-protocol-gate), never by file presence or
by `pid` checks (PIDs are reused; ports are reused). A record
whose probe fails is **stale**; any client MAY remove it. A client
MUST NOT kill the recorded `pid` without first proving — via an
authenticated probe — that the process behind the record is
actually the daemon the record describes.

## Probe and protocol gate

The probe is one **authenticated handshake** against the recorded
URL. A single round-trip proves three facts:

1. **Liveness** — something is accepting connections at `url`.
2. **Identity** — that something holds the credential (it accepted
   an authenticated request), so it is the daemon the record
   claims, not an unrelated process that grabbed a reused port.
3. **Compatibility** — the handshake response carries the wire
   protocol identifier; the client gates on protocol equality.

There is deliberately **no unauthenticated health route**. Every
legitimate local-process client can read the credential file, so
an open endpoint would serve only port-scanners. This is a
divergence from peer systems that run an open `health` route and
support a no-password mode: a conforming daemon under this guide
is **never** open — see [Auth model](#auth-model).

The compatibility gate is the **wire protocol identifier**, not
the `version` string. Version strings move on every release;
the protocol identifier moves only on incompatible wire changes.
Gating on version would force a daemon restart per release even
when the wire is unchanged; gating on protocol restarts only when
a restart is actually required.

Probes MUST be time-bounded. A hung socket is a failed probe.

## Connect-or-spawn

The client-side convergence algorithm:

1. **Read** the registration. Absent → spawn path.
2. **Probe** it. Healthy and protocol-compatible → connect; done.
3. Stale or incompatible → **spawn** a daemon process, detached
   from the calling client (the daemon MUST outlive the client
   that spawned it), instructed to publish on start.
4. **Poll** — re-read and re-probe on a short interval, bounded by
   a total timeout. First healthy probe → connect.

The property that matters: **N concurrent clients converge on one
daemon**. Two clients that race the spawn path start two daemon
processes; last-writer-wins publication plus stand-down (see
[convergence](#single-daemon-convergence)) collapses them to one,
and both clients end up connected to the survivor. The algorithm
is eventually consistent without any lock service.

Spawning is a policy, not a requirement. An interactive CLI MAY
fall back to a private throwaway server instead of spawning a
persistent daemon; a supervisor MAY only ever connect to what it
itself started. What conforming implementations share is the
read-probe-connect path, so that **whenever a daemon is running,
every client finds it**.

## Auth model

Everything in [the session guide's perimeter](./session.md) holds;
the daemon model adds the credential-lifetime question and one
attach affordance.

- **All routes are authenticated, always.** There is no
  "no-password" development mode. A loopback port is reachable by
  every process and every browser tab on the machine; the
  credential is the only line between "my tools" and "any local
  code".
- **Credential lifetime.** An embedded host MAY mint a per-launch
  credential (it dies with the process). A daemon MUST use a
  **persistent** credential: clients that were not alive when the
  daemon started — or that outlive a daemon restart — must still
  be able to connect. Persistent means: generated once with high
  entropy, stored owner-only in the state directory, reused across
  daemon launches.
- **Header-less stream attach.** Some event-stream consumers
  cannot set request headers. A daemon MAY accept the credential
  as a query parameter **on event-stream routes only** — never on
  mutating routes. The query token is the same credential, not a
  second secret. Implementations SHOULD keep the set of
  query-token routes explicit and small, and MUST apply the same
  constant-time comparison as the header path. (Peer systems
  accept the query token on every route; this guide narrows it to
  streams, where the header limitation actually exists.)

## The browser exception

Discovery-by-file serves local-process clients. A browser tab can
fetch `http://127.0.0.1:…` (subject to CORS), but it **cannot read
the state directory** — so it can discover neither the port nor
the credential. Two conforming paths:

### Path 1 — daemon-served, same-origin

The daemon serves the web client's assets itself. The page's
origin IS the daemon; requests are same-origin (no CORS at all),
and the daemon can hand the page its credential at page-serve time
(injected into the document, or a session cookie scoped to the
loopback origin). Natural fit for
[shape B](#production-shape), where the daemon is the product.

### Path 2 — origin-bridged handoff

The web client is served from a different origin (a dev server, a
hosted web app). Reaching the daemon is then a cross-origin call
and requires both:

- **Origin allowlist** — the daemon's CORS policy admits the web
  origin explicitly. The allowlist is host configuration; nothing
  is admitted by default.
- **Credential handoff** — a one-time, user-mediated transfer of
  the credential to the page, in the spirit of a loopback OAuth
  redirect: the daemon (or its CLI) opens the web client with a
  single-use token; the page exchanges it for the credential and
  holds it in memory.

In development, path 2 degrades honestly: the developer reads the
credential from the daemon's own output (it is their credential,
on their machine) and supplies it to the dev page; the allowlist
admits the dev origin. The handoff ceremony is for when a real
product rides this path, not for the dev loop.

What is NOT conformant: widening CORS to `*`, an unauthenticated
route "just for the web client", or embedding a long-lived
credential in served-from-elsewhere page source.

## Production shape

Two shapes, one direction:

- **Shape A — shell over daemon.** The desktop product keeps its
  shell and supervisor, but the supervised server _also_ publishes
  a registration. The shell's private channel keeps working;
  every other client (CLI, ACP, dev browser) can now attach to the
  same live system. Strictly additive; this is the migration
  step.
- **Shape B — daemon as the product.** The daemon is the unit
  that ships. Shells, CLIs, web pages, and editor adapters are
  all thin clients; the web UI is served by the daemon
  ([path 1](#path-1--daemon-served-same-origin)) or hosted
  ([path 2](#path-2--origin-bridged-handoff)). The desktop app
  degrades gracefully into "a window onto the daemon".

A MAY ship without B. B is the direction: every capability that
lands SHOULD land daemon-first (server route + CLI verb), with
shell or web affordances as wrappers — the inverse layering
(feature exists in the shell, absent from the daemon surface) is
the smell this model exists to prevent.

## Conformance

A conforming daemon implementation can demonstrate:

1. **Round-trip discovery** — publish, read back, probe, connect;
   registration and credential are owner-only on disk; a partial
   record is never observable.
2. **Convergence** — two daemons started concurrently collapse to
   one; the survivor owns the registration; clients of the loser
   reconnect to the survivor on their next connect.
3. **Stale handling** — a registration pointing at a dead port
   fails the probe and is treated as absent; a foreign process
   squatting the recorded port fails the authenticated probe
   (identity), not just the version check.
4. **Protocol gate** — a daemon advertising a different wire
   protocol is rejected at connect time with a distinguishable
   error.
5. **Perimeter, from a real browser.** Server-side tests can
   forge any header, so they cannot prove what a browser may
   actually do. Conformance MUST therefore include
   **browser-engine tests** — a real browser context driving the
   daemon: a preflighted, authenticated request from an
   allowlisted origin succeeds end-to-end; a non-allowlisted
   origin is blocked by CORS; an event-stream attach (including
   the header-less query-token affordance) delivers ordered frames
   and survives detach/reattach. This harness is a **system
   harness**, not product end-to-end testing: it proves the
   perimeter contract for the one client class that server-side
   tests cannot impersonate.

## Anti-goals

- **Not a network service.** The daemon binds loopback. Exposing
  it on a routable interface, with or without the credential, is
  out of scope and out of contract.
- **Not multi-user.** One state directory, one OS user, one
  credential. Cross-user sharing is a different product with a
  different threat model.
- **Not a hosted gateway.** The daemon is the local agent system;
  multi-tenant hosting concerns (quotas, org auth, billing) live
  elsewhere and do not reach into this contract.
- **The registration is not an IPC bus.** It carries discovery
  facts only. Anything dynamic (status, sessions, capabilities)
  is asked of the daemon itself over the wire.

## See also

- [Session Lifecycle](./session.md) — the perimeter the daemon
  inherits; status streams, resume.
- [ACP Integration](./acp.md) — the editor-facing adapter that
  rides the daemon as a local-process client.
- [Debugging](./debugging.md) — what "debug what you ship"
  buys; the inspection formats served over the same wire.
- [Environments](./environments.md) — where the daemon sits in
  the web / sandbox / computer taxonomy.
