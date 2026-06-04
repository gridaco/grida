---
title: Agent sandbox wrap
description: How Grida Desktop adapts AgentHost sandbox policy to srt and supervises the AgentSidecar process.
keywords: [desktop, agent-sidecar, sandbox, srt, grida-sec-004]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent sandbox wrap

> **Status: V1.x in flight.** The outer srt wrap is wired in the Desktop
> supervisor. The per-call `shell.run` sub-policy remains design-time until the
> shell capability ships.

This page is the **desktop-specific binding** of the
[agent RFC's sandbox primitive](../ai/agent/srt.md). The abstract
contract (what srt does, deny-then-allow / allow-only patterns, the
mandatory deny set, Seatbelt / bubblewrap backends, three-layer
defense-in-depth) lives in the RFC. Read that first.

What follows is delta:

- The package-owned sandbox policy intent for an AgentHost outer-wrap.
- The inner per-call sub-policy spawn path Grida picked.
- The Windows decision.
- The four open implementation questions before V1 ships.

## AgentHost Outer-Wrap Policy

`buildAgentHostSandboxPolicy()` is exported from `@grida/agent/sandbox`.
It returns package-owned policy intent: allowed network hosts, denied
secret paths, and broad read/write shape. The desktop supervisor supplies
host facts such as `userData` and `home`, then adapts the result to the
[`srt` SDK](../ai/agent/srt.md).

| Capability           | Value                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `fs.read`            | deny high-value secret paths; host adapters may narrow further when dynamic workspace policy lands |
| `fs.write`           | `{userData}` plus host platform temp/home roots needed by Node/Electron runtime today              |
| `net.allowedDomains` | BYOK provider hosts from the package-owned sandbox policy (`openrouter.ai`, AI Gateway hosts)      |
| `allowLocalBinding`  | `true` — required for Hono's `127.0.0.1:<random>` bind                                             |
| `allowUnixSockets`   | `[]` (denied; agent host doesn't use Unix-domain sockets today)                                    |

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
AgentHost policy intent, initializes `srt` through
`desktop/src/main/sandbox/manager.ts`, calls `wrap`, and the resulting child is
the AgentHost sidecar running inside `srt`.

Switching from `utilityProcess.fork` to `child_process.spawn` requires
flipping the `RunAsNode` Electron fuse in `forge.config.ts`. Residual
risk: a local attacker who already controls the binary; documented and
accepted.

## Inner sub-policy — per-call `shell.run`

When the agent calls `runtime.shell.run(...)`, the package contract should
match against the manifest's allowlist (cmd + args + cwd) and compile a
per-call sub-policy for the child. The current package exposes the shell policy
shape, but Desktop does not yet ship the per-call spawn path.

```
┌─ AgentHost  (OS-sandboxed by srt; outer policy) ─────────────────┐
│                                                                │
│   when agent declares requires.shell.run:                      │
│   ┌─ per-call srt sub-policy → child_process.spawn ─────────┐  │
│   │  shell tool, MCP server, bundler, user-script …         │  │
│   │  • per-cmd allowlist (cmd + args pattern + cwd)         │  │
│   │  • per-child fs / net sub-policy from manifest          │  │
│   │  • fresh env (no PATH leakage from AgentHost)              │  │
│   │  • streamed AsyncIterable<ShellChunk>                   │  │
│   └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Spawn path choice — recommended: supervisor IPC, not nested wrap.**
The RFC names both options (nested sandbox via
`enableWeakerNestedSandbox`, or sending a spawn-request to the
supervisor). If per-call process spawning is needed, the AgentHost sidecar
sends a `spawn-request` over a host-private channel; the supervisor calls
`wrapWithSandbox` itself and pipes stdio back. This avoids the danger
knob.

## Dynamic policy refresh

Opening a new workspace or ad-hoc file adds a path the policy needs to
allow.

- **macOS.** The current V1 policy relies on broad host roots plus explicit
  secret-path denies. Narrow workspace/ad-hoc roots are a follow-up.
- **Linux.** Paths are literal. A future narrowed policy will require `srt`
  reset plus an AgentHost sidecar re-spawn when workspace roots change, which
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

When adding a feature that touches `buildAgentHostSandboxPolicy()` or any
`ShellRunRequirement`, run the [security checklist](./agent-security.md#reviewer-checklist).
Anything that weakens a srt layer (`enableWeakerNestedSandbox`,
`enableWeakerNetworkIsolation`, an overly broad `allowed_domains`) is a
`GRIDA-SEC-004` review, not a config tweak.

## Open questions

These get answered before V1 ships. Until then, the agent host is `v0.x.y`.

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
