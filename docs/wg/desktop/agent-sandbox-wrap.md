---
title: Agent sandbox wrap
description: How Grida Desktop adapts agent-daemon sandbox policy to srt and supervises the AgentSidecar process.
keywords: [desktop, agent-sidecar, sandbox, srt, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent sandbox wrap

> **Status: in flight.** Shipped: the two-mode model (`accept-edits` / `auto`),
> the retired command allowlist, the enumerated dev-network allowlist, and the
> filesystem read/write scope (workspace-scoped reads, writable-root writes,
> no-clobber protected paths). Still design-time: the supervised **approval
> prompt** — the `accept-edits` gate currently _rejects_ a non-read-only command
> with `needs-approval` rather than surfacing Allow/Deny — and the **per-call
> srt sub-policy** (its spawn path is parked; the in-process secret-arg check is
> the interim secret-dir guard).

This page is the **desktop-specific binding** of the
[agent RFC's sandbox primitive](../ai/agent/srt.md). The abstract
contract (what srt does, deny-then-allow / allow-only patterns, the
mandatory deny set, Seatbelt / bubblewrap backends, three-layer
defense-in-depth) lives in the RFC. Read that first.

What follows is delta:

- The package-owned sandbox policy intent for an agent-daemon outer-wrap.
- The inner per-call sub-policy spawn path Grida picked.
- The Windows decision.
- The four open implementation questions before V1 ships.

## Agent-Daemon Outer-Wrap Policy

`buildAgentDaemonSandboxPolicy()` is exported from `@grida/agent/sandbox`.
It returns package-owned policy intent: allowed network hosts, denied
secret paths, and broad read/write shape. The desktop supervisor supplies
host facts such as `userData` and `home`, then adapts the result to the
[`srt` SDK](../ai/agent/srt.md).

| Capability           | Value                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs.read`            | deny high-value secret paths; host adapters may narrow further when dynamic workspace policy lands                                                                                           |
| `fs.write`           | `{userData}` plus host platform temp/home roots needed by Node/Electron runtime today                                                                                                        |
| `net.allowedDomains` | BYOK provider hosts + a curated dev-network allowlist (package registries, git hosts). `srt` forbids `*` / broad patterns, so this is **enumerated, not open** — see the network model below |
| `allowLocalBinding`  | `true` — required for Hono's `127.0.0.1:<random>` bind                                                                                                                                       |
| `allowUnixSockets`   | `[]` (denied; agent host doesn't use Unix-domain sockets today)                                                                                                                              |

The path/host variable shape (`{workspace}`, `{ad-hoc}`, `{userData}`)
is locked by the RFC; see
[agent/tools.md / capability requirements](../ai/agent/tools.md#capability-requirements).

**`fs.read` deny scope — what the host's own `userData` is NOT.** The
`fs.read` deny set covers HOME secrets (`~/.ssh`, `~/.aws`, shell rc files):
the host has no legitimate read there, so the kernel-level deny is safe.
It deliberately does **not** include the agent host's own `userData` (BYOK
`auth.json`, `workspaces.json`, `recent.json`, sessions db). srt confines the
whole sidecar including the host process, and the host process must read
`auth.json` for provider calls — denying that root here would break host
auth. The shell _child_ is instead kept out of `userData` in-process by the
shell runner's per-arg check (`shell/runner.ts`), which rejects any command
arg resolving inside it. So secret-read ownership is split: srt owns HOME
secrets, the in-process runner owns the host's own `userData`. See
[agent-security / Layer 4b](./agent-security.md).

`allowLocalBinding: true` is a binary knob in srt — no port-scope filter
exists upstream. The residual risk: the wrapped process can bind any
loopback port and accept connections from any local user-mode process.
The existing [GRIDA-SEC-004 layers](./agent-security.md) (per-spawn Basic
Auth, Origin/Referer guards) are the mitigation. `allowLocalBinding`
does **not** weaken outbound network policy and does **not** let the
agent host reach external hosts.

## Spawn shape

The supervisor (`desktop/src/main/agent-sidecar-supervisor.ts`) holds the
host `child_process.spawn` primitive. It asks `@grida/agent/sandbox` for
agent-daemon policy intent, initializes `srt` through
`desktop/src/main/sandbox/manager.ts`, calls `wrap`, and the resulting child is
the daemon sidecar running inside `srt`.

Switching from `utilityProcess.fork` to `child_process.spawn` requires
flipping the `RunAsNode` Electron fuse in `forge.config.ts`. Residual
risk: a local attacker who already controls the binary; documented and
accepted.

## Permission model — modes over the sandbox, not a command list

Containment is binary. A command either runs inside an OS sandbox that confines
its filesystem reach, its network reach, and the blast radius of anything it
spawns — or it does not run. A hand-curated list of "safe-ish" commands is
neither half of that. It is friction wearing the texture of safety:

- **The OS sandbox already permits process execution unconditionally.** A
  sandboxed process may `exec` any binary, and the child inherits the same
  confinement (kernel-enforced, whole process tree). So an interpreter or a
  shell is no more reachable than `ls` once it is _on_ the allowlist — and no
  less contained when it is _off_ it. The allowlist governs nothing the sandbox
  doesn't already govern better.
- **A single rich command collapses the guarantee.** Any allowlisted command
  expressive enough to be useful — a version-control tool, a search tool with a
  config file, anything that reads a dotfile or shells out — is itself an
  arbitrary-code / arbitrary-read vector. One such entry makes the "only safe
  commands run" claim false while the list still blocks honest work.

So the boundary is the sandbox, and the agent's surface is governed by a
**mode**. The full posture space mature coding agents converge on has more
positions than a user should have to reason about — read-only, edit-only,
fully-automatic-with-a-safety-classifier, no-checks. This binding implements
that space under the hood but **exposes only two** modes:

| Exposed mode               | Auto-runs without friction                                                                                                                             | Needs **Auto** to proceed                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Accept Edits** (default) | broad reads (minus the sensitive deny set); file writes/edits within the [writable roots](#filesystem--network-model); read-only / inspection commands | arbitrary command execution, network commands, writes outside the writable roots |
| **Auto**                   | everything — any command; the sandbox is the sole guard                                                                                                | —                                                                                |

- **Accept Edits is the default** and is approximately today's behavior: the
  agent reads, edits files in scope, and inspects — but does not execute
  arbitrary code or reach the network. The low-blast-radius posture; the user
  reviews the resulting edits (the diff), not each action. Because this host has
  no interactive permission prompt, the boundary it draws is _what auto-runs_,
  not _what to ask about_: the line sits at "mutating / executing arbitrary
  code" — a category, not a blessed-binary list. Telling read-only from mutating
  is the one judgment this mode needs; like the sensitive-read set it must fail
  _safe_ — a command that cannot be classified read-only is treated as mutating
  and therefore needs Auto, so a gap in the categorization over-restricts (a
  prompt to switch modes) rather than over-permits.
- **Auto is the opt-in bypass posture.** Every command runs; the OS sandbox
  (outer wrap + [per-call sub-policy](#inner-sub-policy--per-call-shellrun)) is
  the only thing between the agent and the machine. The **semantic safety
  check** a mature implementation runs in this mode — a classifier /
  [watchdog](../ai/agent/foundations.md#watchdog) that blocks escalating,
  externally-directed, or injection-driven actions _before_ they run — is
  **deferred** in the first cut. Auto therefore relies on the sandbox's
  structural containment alone, with no behavioral analysis. This is an
  accepted, stated risk: it is the behavior of a no-checks bypass mode, narrowed
  by the sandbox. The classifier is the named next layer (it is what a future
  interactive/rule-based `ask` posture would also build on).

**Fail-closed where the OS can't wrap.** The shell capability is exposed only
where the host can wrap the process tree. On an unsupported OS the agent keeps
fs/edit/skills but has **no** `run_command` at all — so Auto degrades to "no
shell," never to "unsandboxed shell." _No containment, no capability._

## Filesystem & network model

Three managed shapes define what the agent may touch, **independent of mode**.
They are enforced at two layers that must agree: the fs tools (the agent's
logical read/write scope) and the OS sandbox (the kernel floor under any shell
child). A mode decides _whether a command runs_; these shapes decide _what any
running command, or any tool, may reach_.

**Writable roots.** Writes — by an fs-edit tool or a shell command — land only
inside a small, explicit set: the **opened workspace(s)** plus an **ephemeral
temp/scratch** root. (The workspace is the working root the user granted by
opening it; this is the "additional writable directories" shape.) The host's own
runtime roots — its state dir and the platform temp/home paths the sidecar's
runtime needs — are writable by the _host process_, not by the agent's shell
child; the per-call sub-policy drops them. The current global write set is
broader than this (it includes the whole home root and the host state dir);
narrowing the _agent's_ write surface to the writable roots is the formalization
this model calls for.

**Read — broad, minus a sensitive deny set.** Reads are allowed everywhere by
default; the only carve-outs are a **managed glob list of sensitive paths** —
credential and key material (`~/.ssh`, `~/.aws`, cloud / VCS credential stores,
the host's own BYOK secret file) plus the OS sandbox's built-in escape-vector
set. This denylist is the _one_ place a hand-managed list is correct: it
enumerates **secrets to withhold**, so it fails _safe_ (a missing entry
over-denies nothing) — the mirror image of a command allowlist, which fails
_open_. Anything the **user explicitly references** — an @-mention, a dropped
file or folder — is in read scope by construction, even when it sits outside an
opened workspace. (Today the read-file tool is workspace-scoped, so out-of-scope
references are unreadable through it; widening the tool's scope to
broad-minus-sensitive, with user references always included, is part of this
model.)

**Protected (no-clobber) paths.** A second managed glob list marks config and
state that must never be _auto-written_ even when it lives inside a writable
root: VCS metadata and hooks, shell rc files, package-manager config and
lockfiles, the agent's own config. Writes to these are denied in both exposed
modes. It overlaps the sensitive set but answers a different question — _don't
corrupt this_ vs the sensitive set's _don't leak this_.

**Network — enumerated, not open.** The agent needs the network for real work
(install dependencies, fetch code), so the egress policy is broadened beyond the
provider hosts. But it is **not** open: `srt`'s network model is allow-only and
deliberately rejects `*` / overly-broad patterns, and its structural sandbox is
also its network sandbox (the OS profile permits outbound only to `srt`'s
loopback proxy, which enforces the domain list) — so there is no "disable
network isolation" knob. The policy is therefore a **curated dev-network
allowlist**: the BYOK provider hosts plus the major package registries and git
hosts. It is a maintained list — the same shape as the sensitive-read set, and
the one place a hand-maintained list is right, because it enumerates what to
permit for a known need; a host not on it is simply unreachable. Egress
_judgment_ beyond "is this host allowed" (exfil intent) is the classifier's job,
deferred.

These map directly onto the sandbox's `allow_write` / `deny_write` / `deny_read`
/ `allowed_domains` config (deny overrides allow) and onto the fs tools' scope
checks. The enforcement split — the broad outer wrap for the host, a strictly
tighter per-call wrap for the shell child — is below.

## Inner sub-policy — per-call `shell.run`

The [filesystem model](#filesystem--network-model) is enforced for a shell child
by spawning it under a profile **strictly tighter than the outer wrap**. Auto is
only sound once that per-call profile closes **two gaps the allowlist was
silently masking** — both are reads or writes the _host_ legitimately needs but
the _shell child_ never does, which is exactly why they belong in a per-call
profile and cannot be moved to the global one:

1. **The host's own secret dir (`{userData}`: BYOK `auth.json`, the sessions
   db, workspace/recent metadata).** The outer wrap deliberately leaves this
   _readable_, because the host process must read `auth.json` for provider calls
   — denying it globally would break host auth (the ownership split in
   [agent-security / Layer 4b](./agent-security.md#layer-4b--agent-shell-execution)).
   Under the allowlist that was tolerable: no allowlisted command could read it
   back, and an in-process per-argument path check covered the literal case. An
   unrestricted shell defeats a per-argument string check trivially (a `-c`
   one-liner, an interpreter opening the file by a computed path), so the
   protection must become kernel-level **for the child only**: the per-call
   sub-policy adds `{userData}` to the child's `deny_read`. This is precisely the
   move the global policy cannot make and the per-call profile can — the child,
   unlike the host, never needs to read `auth.json`. Kernel-enforced, it also
   binds everything the child spawns. With this in place the in-process
   per-argument check becomes defense-in-depth, not the load-bearing guard.

2. **Write scope.** The outer wrap allows writes across the host runtime roots
   the _sidecar_ needs (platform temp, the home root). A shell child needs only
   its workspace and ephemeral temp; leaving the broad home root writable to an
   unrestricted shell is a persistence-write surface (login/startup items and
   the like). The per-call sub-policy narrows `allow_write` to the workspace
   root plus ephemeral temp and drops the broad home root.

Net: the outer wrap stays broad enough for the host runtime; the shell child
runs under a strictly tighter profile — `deny_read += {userData}`,
`allow_write = {workspace, temp}` — layered on the outer wrap's network
allow-list and mandatory deny set. Network is unchanged from the outer wrap: the
enumerated dev-network allowlist (registries + git + provider), not open (see
[Residual risks](#residual-risks-auto-mode)).

```
┌─ Daemon (agent tenant mounted)  (OS-sandboxed; outer wrap: host-runtime fs + provider net) ─┐
│                                                                         │
│   run_command (auto mode):                                              │
│   ┌─ per-call sub-policy (strictly tighter) → spawn ───────────────┐   │
│   │  any command — interpreter, package manager, shell, user script │   │
│   │  • cwd ∈ opened workspace                                       │   │
│   │  • deny_read += {userData}   (kernel-blocks BYOK-key read)      │   │
│   │  • allow_write = {workspace, temp}  (no broad home write)       │   │
│   │  • inherits outer mandatory deny set + dev-network allowlist    │   │
│   │  • fresh env (no host credential / PATH leakage)                │   │
│   └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

The tighter profile must be applied at spawn time. The shape of that spawn path
— re-wrapping inside the already-wrapped sidecar vs. a supervisor-mediated spawn
— is an [open question](#open-questions); the mode model and the two protections
above are independent of which shape wins.

## Residual risks (auto mode)

`auto` trades the allowlist's false assurance for the sandbox's real, _bounded_
assurance. What it deliberately does **not** stop, stated plainly:

- **No semantic safety check (the deferred classifier).** Auto runs every action
  with no behavioral analysis of _what_ it does — nothing blocks an action that
  escalates beyond the request, targets unrecognized infrastructure, or is
  driven by hostile content the agent read. The sandbox bounds the blast radius
  (writable roots, sensitive-read denial, the enumerated network allowlist); it
  does not judge intent. Restoring that judgment is the classifier/watchdog
  layer, named and deferred. Until it lands, Auto is an informed-consent posture.
- **Broad reads.** The read model is deny-then-allow: everything is readable
  except the deny sets, so a shell can read most of the user's files. The
  containment is the _write_ and _network_ boundary, not read secrecy. An agent
  that has read a file can still surface its contents in its own reply or to an
  allowed provider host. The answer to _that_ is the `ask` mode / watchdog, not
  the sandbox.
- **Exfil via an allowed host.** Outbound is the enumerated dev-network
  allowlist (registries + git + provider) — broader than provider-only, so the
  egress surface is larger. Any allowed host is a network egress. This is the
  same caveat as the outer wrap
  (see [agent-security / Layer 4](./agent-security.md#layer-4--os-level-outer-sandbox)).
- **Platform asymmetry.** Where network containment is steered by proxy
  environment rather than enforced at the kernel, a non-cooperating binary's
  outbound story is weaker than where the kernel enforces it. Named in the
  [RFC](../ai/agent/srt.md).
- **Privileged local attacker.** An attacker with system privileges is out of
  scope, as for every layer (see [agent-security / Layer 5](./agent-security.md#layer-5--secrets-discipline)).

## Dynamic policy refresh

Opening a new workspace or ad-hoc file adds a path the policy needs to
allow.

- **macOS.** The current V1 policy relies on broad host roots plus explicit
  secret-path denies. Narrow workspace/ad-hoc roots are a follow-up.
- **Linux.** Paths are literal. A future narrowed policy will require `srt`
  reset plus a daemon sidecar re-spawn when workspace roots change, which
  drops in-flight agent streams.

## Windows

`srt` does not support Windows. Per-feature decision matrix:

| Feature                    | Windows behavior                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Workspace open / file edit | Runs unwrapped today; rely on GRIDA-SEC-004 HTTP/bridge layers and secret discipline.    |
| Agent `shell.run`          | Block until an AppContainer + Job-objects backend ships, OR feature-gate off on Windows. |
| Provider HTTP (BYOK)       | Works without srt — outer-wrap fs/net policy is best-effort, layer 2 carries the weight. |

The Windows backend is **deferred**; tracked here so it isn't forgotten.

## Reviewer cross-link

When adding a feature that touches `buildAgentDaemonSandboxPolicy()` or any
`ShellRunRequirement`, run the [security checklist](./agent-security.md#reviewer-checklist).
Anything that weakens a srt layer (`enableWeakerNestedSandbox`,
`enableWeakerNetworkIsolation`, an overly broad `allowed_domains`) is a
`GRIDA-SEC-004` review, not a config tweak.

## Open questions

These get answered before V1 ships. Until then, the agent host is `v0.x.y`.

- **Per-call spawn path (deferred).** How the tighter
  [per-call sub-policy](#inner-sub-policy--per-call-shellrun) is applied at
  spawn: re-wrapping the child inside the already-wrapped sidecar (nested
  sandbox), or sending a spawn-request to the supervisor over a host-private
  channel so the supervisor wraps it (the [RFC](../ai/agent/srt.md) recommends
  the latter). Deciding factors: notarization/signing interaction with nesting
  (see "Code signing × `sandbox-exec`" below), the platform weakness of nested
  wrapping, and the plumbing cost of a host-private spawn channel. The mode
  model does not depend on the outcome; the choice is left to implementation.
- **Code signing × `sandbox-exec`.** Does the existing hardened-runtime
  - `disable-library-validation` bundle conflict with `sandbox-exec`
    under notarization? Needs a notarized test build before the srt-wrap
    phase merges. If conflict, may need
    `com.apple.security.cs.allow-dyld-environment-variables`.
- **Asar × ripgrep discovery.** `extraResource` lands outside asar;
  srt's `which`-based ripgrep discovery may need an explicit `PATH`
  hint.
- **`OnlyLoadAppFromAsar` fuse interaction.** With
  `ELECTRON_RUN_AS_NODE=1` + the bin inside `node_modules` inside asar,
  Electron's asar transparent-read should serve it — verify under
  signing.
- **Violation surfacing on Linux.** macOS auto-reports via the system
  log store. Linux requires `strace` and we deliberately don't ship one
  in V1 — failures show up as supervisor restart-loop stderr. A
  `GRIDA_SRT_LINUX_STRACE=1` developer opt-in is on the table.

## See also

- [Agent system RFC / Sandbox runtime](../ai/agent/srt.md) — the
  abstract sandbox primitive contract.
- [Agent system RFC / Environments / Computer](../ai/agent/environments.md#computer)
  — the environment this implements.
- [Agent system RFC / Tools / capability requirements](../ai/agent/tools.md#capability-requirements)
  — the variable expansion shape.
- [Agent security](./agent-security.md) — layers 3 + 4 of GRIDA-SEC-004.
- [Process model](./process-model.md) — where the supervisor and the
  agent host sit.
