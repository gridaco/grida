---
title: Agent security
description: Desktop binding of GRIDA-SEC-004 for AgentSidecar, the renderer bridge, HTTP perimeter, sandbox, and secrets discipline.
keywords: [desktop, agent-sidecar, grida-sec-004, security]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent security

> **Status: V1.x in flight.** Layers 1–3 are wired for Desktop; layer 4
> lands with the agent `shell.run` capability.

`GRIDA-SEC-004` is the trust boundary between the URL-loaded renderer
and the long-lived agent server. The boundary is enforced by **five
independent layers**. The discipline: a reviewer should be able to
compromise any single layer and have the remaining four still defend
the user.

For the abstract defense-in-depth model the agent system specifies, see
[agent/foundations.md / watchdog vs permission rules vs sandbox](../ai/agent/foundations.md#watchdog-vs-permission-rules-vs-sandbox)
and [agent/tools.md / defense in depth](../ai/agent/tools.md#defense-in-depth).
This page is the desktop-specific landing.

## The five layers

| #   | Layer                          | Where                                                                                                                                                                                            | What it stops                                                                                                    |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Path-scoped `window.grida`     | Preload (`desktop/src/preload.ts`); exposed iff `location.pathname` is `/desktop` or starts with `/desktop/`; later navigation is blocked by preload history guards and `desktop/src/window.ts`. | XSS on any other `grida.co` page cannot reach the agent server — `window.grida` is `undefined` there.            |
| 2   | CSP-strict `/desktop/*` routes | `editor/proxy.ts` and the desktop route group.                                                                                                                                                   | Third-party scripts and inline-script injection on privileged desktop pages.                                     |
| 3   | Agent server HTTP perimeter    | Daemon HTTP routes (`packages/grida-daemon/src/http/` + the agent tenant`s route groups in `packages/grida-ai-agent/src/http/routes/`).                                                          | Cross-origin / cross-process callers without the per-spawn password, the right `Referer`, or the right `Origin`. |
| 4   | OS-level outer sandbox (`srt`) | [`agent-sandbox-wrap`](./agent-sandbox-wrap.md). Wraps the daemon process tree.                                                                                                                  | A compromised agent server reading SSH keys, writing shell rc files, calling arbitrary hosts.                    |
| 5   | Secrets discipline             | `auth.json` at chmod `0o600`; preload holds the agent server password in closure; never on `window`.                                                                                             | A non-Grida process on the same machine reading the token file; a renderer script enumerating credentials.       |

## Layer 1 — Path-scoped `window.grida`

The preload exposes the bridge only when the initial document URL is under
`/desktop/*`. `contextBridge` has no revocation API, so
`desktop/src/window.ts` blocks navigation from an exposed desktop page to
non-desktop paths. Cross-link:
[renderer-bridge / capability boundary](./renderer-bridge.md#the-capability-boundary).

**What this catches.** A future bug that introduces an `<iframe>` on
`grida.co/blog/...` to load the same Electron renderer. The bridge stays
detached; the iframe sees no agent server API.

**What this does not catch.** A bug _inside_ `/desktop/*` that runs
attacker-controlled JS. Layers 2 and 3 catch that.

## Layer 2 — CSP-strict `/desktop/*` routes

`editor/proxy.ts` attaches a nonce-based CSP to `/desktop/*` responses. The
desktop route group does not run third-party analytics or marketing scripts.

**What this catches.** A future desktop page that accidentally depends on an
inline script or third-party script include.

**What this does not catch.** A trusted framework script compromised before it
reaches the page. Layer 3 catches requests that do not carry the host-held
credentials.

## Layer 3 — Agent server HTTP perimeter

The daemon binds on `127.0.0.1:<random>`. Every request must:

- Carry the per-spawn Basic Auth password (regenerated each agent host
  start; never persisted).
- Have a `Referer` header whose path is under the host-declared desktop route root.
- Have an `Origin` on the host-declared allowlist.

**What this catches.** A non-Grida process on the same machine
discovering the loopback port and trying to call the API.

**What this does not catch.** An attacker who already controls the
renderer and can reach `window.grida` — they're inside layer 1. Layer 4
catches the worst filesystem/network blast radius if layer 1 fails.

## Layer 4 — OS-level outer sandbox

The daemon runs inside `srt` ([agent-sandbox-wrap](./agent-sandbox-wrap.md)) with the
package-owned outer-wrap intent: network limited to an **enumerated allowlist**
(BYOK provider hosts + a curated dev-network set — package registries, git
hosts; `srt` forbids `*` / open patterns), secret-path read/write denies, and
host-supplied write roots for the sidecar's persisted state and platform temp
paths. Loopback binding is allowed so the HTTP server can bind
`127.0.0.1:<random>`.

**What this catches.** A compromised agent server that wants to read
`~/.ssh`, write `~/.zshrc`, or exfiltrate to a random host.

**What this does not catch.** A compromised agent that uses an
allowlisted host (e.g. the provider) for exfiltration. The RFC's
[watchdog](../ai/agent/foundations.md#watchdog) is the answer to that —
host-configured policy, not srt.

## Layer 4b — Agent shell execution

The `run_command` agent tool spawns child processes through the shell
runner (`packages/grida-daemon/src/shell/runner.ts`) with `shell: false`.
There is **no command allowlist** — a per-session **permission mode**
(`protocol/mode.ts`) governs the surface: `accept-edits` (default — read-only
inspection commands auto-run; a mutating/executing command **pauses for a
supervised Allow/Deny prompt** and runs only on approval) or `auto` (every
command runs; the OS sandbox is the guard, the semantic classifier deferred).
The supervised gate is the AI SDK's native `needsApproval` on the tool
(`tools/run-command.ts`), wired from the mode at `workspace-agent-bindings.ts` —
not the command backend, which only runs an already-cleared call. The
approval _answer_ is server-validated: the renderer's Allow/Deny rides an
explicit `approval_answer` body field (the host owns message state, so the answer
is not smuggled in a client-mutated message) and `store.answerApproval` (via
`run-input.ts` `applyApprovalAnswer`) flips a part to `approval-responded` only
when it was a real pending approval, so the renderer can answer but never forge a
call. Two
structural gates hold in every mode: the cwd-must-be-inside-an-opened-workspace
check and the in-process secret-arg containment check (below); the fs-edit tools
additionally refuse no-clobber paths (`fs/scope.ts`). The OS sandbox confines the
whole sidecar; the full per-command fs/net sub-policy that would constrain each
spawned child (the kernel-level finish of the secret-dir guard) is deferred — see
[agent-sandbox-wrap / inner sub-policy](./agent-sandbox-wrap.md#inner-sub-policy--per-call-shellrun).

**Secret-dir containment — the srt / in-process split.** There are two
classes of secret on disk, owned by two different gates:

- **HOME secrets** (`~/.ssh`, `~/.aws`, shell rc files) are denied for the
  entire tree by the srt `deny_read` policy. The host has no legitimate read
  there, so a kernel-level deny is safe.
- **The agent host's own secret dir** — its `userData`, where BYOK
  `auth.json`, `workspaces.json`, `recent.json`, and the sessions db live —
  is **not** in srt `deny_read`. srt confines the whole sidecar including the
  host process, and the host process must read `auth.json` for provider
  calls. Denying it at the kernel level would break host auth. Instead the
  shell _child_ is kept out of it in-process: `validateShellRequest` rejects
  any command arg that resolves (after realpath of the nearest existing
  ancestor, mirroring the cwd discipline so a symlink can't bypass it) inside
  that protected root, threaded down from the runtime.

This is the responsibility-and-reconciliation rule for secret reads: srt owns
HOME secrets at the kernel; the in-process runner owns the host's own
`userData`. **Caveat (`auto`):** the in-process arg check only inspects
top-level argv, so an interpreter/shell reachable in `auto` (`bash -c`,
`python3 -c`) can read `userData` by a computed path. Closing that for the
shell child needs the kernel-level per-call `deny_read` (the deferred
sub-policy); meanwhile the enumerated network + the key being the user's own
provider credential bound the exfil.

**`auto` is informed-consent, not a guarantee.** `auto` removes
command-identity gating; the sandbox still bounds the blast radius (writable
roots, the enumerated network) but does not judge intent — an injected or
confused agent can read broadly and run anything within those bounds. Intent
judgment is the [watchdog](../ai/agent/foundations.md#watchdog) layer, deferred.
`auto` is opt-in; the default `accept-edits` keeps a read-only-only shell.

## Layer 5 — Secrets discipline

- `auth.json` at chmod `0o600` ([agent-storage-layout](./agent-storage-layout.md)).
- The agent server password is generated per-spawn, passed to the sidecar
  over stdin, fetched by preload through guarded IPC, held in preload closure,
  **never** placed on argv, env, disk, or `window`.
- Logs never include tokens, message content, tool args, or model
  output ([sessions / security boundary in
  bedrock](../ai/agent/persistency.md) carries the same rule).
- `secrets.get` is not exposed in the bridge. The renderer may check, set, or
  delete keys, but key material never crosses back from the agent host.

**What this catches.** A renderer script enumerating `window` looking
for credentials; an unauthorized user on the same machine reading the
token file.

**What this does not catch.** Root on the box. The RFC is explicit that
an OS sandbox is not a defense against an attacker with system
privileges.

## Reviewer checklist

Before merging a PR that touches `/desktop/*` UI, the preload, the
agent server's HTTP layer, `buildAgentDaemonSandboxPolicy()`, or any source file under
`packages/grida-ai-agent/`:

1. **Layer 1 intact?** Preload path-scoping still fails closed. Window
   navigation still blocks exposed desktop pages from leaving `/desktop/*`.
2. **Layer 2 intact?** `/desktop/*` routes keep the nonce CSP and do not
   add third-party scripts.
3. **Layer 3 intact?** Every new route handler runs the auth + Referer
   - Origin guards. No "internal" bypass.
4. **Layer 4 intact?** `buildAgentDaemonSandboxPolicy()` paths/hosts cover what the new
   code reads / writes / fetches; mandatory deny set unmodified.
5. **Layer 5 intact?** No new secrets placed on `window`; `auth.json`
   write path still uses `0o600`; logs still elide content.

Anything that weakens a layer needs an explicit `GRIDA-SEC-004` review
note in the PR, not a silent regression.

## See also

- [`GRIDA-SEC-004` in `SECURITY.md`](https://github.com/gridaco/grida/blob/main/SECURITY.md)
  — the authoritative declaration.
- [Process model](./process-model.md) — what each process owns.
- [Renderer bridge](./renderer-bridge.md) — layer 1 detail.
- [Agent sandbox wrap](./agent-sandbox-wrap.md) — layer 4 detail.
- [Agent storage layout](./agent-storage-layout.md) — layer 5 file map.
- [Agent system RFC / foundations / watchdog](../ai/agent/foundations.md#watchdog)
  — abstract defense-in-depth model.
