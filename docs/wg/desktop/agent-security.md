---
title: Agent security
description: Desktop binding of GRIDA-SEC-004 and GRIDA-SEC-008 for AgentSidecar, the renderer bridge, HTTP perimeter, sandbox, native provider OAuth, and secrets discipline.
keywords:
  [desktop, agent-sidecar, grida-sec-004, grida-sec-008, chatgpt, security]
format: md
tags:
  - internal
  - wg
  - desktop
---

# Agent security

> **Status: current implementation record.** The sections below describe the
> shipping whole-sidecar boundary plus the landed host-routed provider
> transport. The remaining raw-execution re-scope is specified by
> [Execution authority](../ai/agent/execution-authority.md) and the
> [Desktop delta](./agent-sandbox-wrap.md); supervisor-owned shell, ACP, and
> extension workers must not be represented here as shipped. The current outer
> sandbox applies on macOS/Linux; Windows is unwrapped, with shell and external
> ACP withheld but structured local filesystem capabilities still exposed.

> **GRIDA-SEC-008 is active.** The ChatGPT Subscription provider adds the
> main-owned callback, sidecar-owned credential lifecycle, safe renderer
> bridge, and exact provider destinations as one registered boundary. The
> implementation is still an experimental interoperability profile; an active
> local security boundary is not a claim of OpenAI support or approval.

`GRIDA-SEC-004` is the trust boundary between the URL-loaded renderer and the
long-lived agent server. On supported macOS/Linux hosts, the boundary uses
several distinct controls. They are defense in depth, but they do not all
protect the same authority: the main-owned socket listener controls entry to
the daemon protocol, the outer sandbox constrains the process tree, and the
native provider transport constrains and correctly routes provider HTTP.
Windows lacks the outer-sandbox control and does not make the same containment
claim.

For the abstract defense-in-depth model the agent system specifies, see
[agent/foundations.md / watchdog vs permission rules vs sandbox](../ai/agent/foundations.md#watchdog-vs-permission-rules-vs-sandbox)
and [agent/tools.md / defense in depth](../ai/agent/tools.md#defense-in-depth).
This page is the desktop-specific landing.

## Defense-in-depth controls

| Control                                   | Where                                                                                                                                                                                            | What it stops                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Path-scoped `window.grida`                | Preload (`desktop/src/preload.ts`); exposed iff `location.pathname` is `/desktop` or starts with `/desktop/`; later navigation is blocked by preload history guards and `desktop/src/window.ts`. | XSS on any other `grida.co` page cannot reach the agent server — `window.grida` is `undefined` there.            |
| CSP-strict `/desktop/*` routes            | `editor/proxy.ts` and the desktop route group.                                                                                                                                                   | Third-party scripts and inline-script injection on privileged desktop pages.                                     |
| Main-owned daemon socket + HTTP perimeter | Electron main accepts exact-loopback sockets; the socketless daemon applies Basic Auth, `Referer`, `Origin`, and route guards.                                                                   | A sidecar bind/connect escape; cross-origin or cross-process callers without the host credential and provenance. |
| OS-level outer sandbox (macOS/Linux)      | [`agent-sandbox-wrap`](./agent-sandbox-wrap.md). Wraps the daemon process tree on supported platforms.                                                                                           | A compromised agent server reading SSH keys, writing shell rc files, calling arbitrary hosts.                    |
| Secrets discipline                        | `auth.json` at chmod `0o600`; preload holds the agent server password in closure; never on `window`.                                                                                             | A non-Grida process on the same machine reading the token file; a renderer script enumerating credentials.       |
| Host-routed provider transport            | Electron main, reached only through bounded framed stdin/stdout.                                                                                                                                 | Provider calls bypassing the system proxy/trust route; turning provider configuration into generic native fetch. |
| ChatGPT OAuth credential boundary         | Electron main callback + AgentSidecar credential manager + guarded bridge (`GRIDA-SEC-008`).                                                                                                     | Renderer or local callback callers obtaining/replaying provider credentials; provider OAuth widening into ACP.   |

## Path-scoped `window.grida`

The preload exposes the bridge only when the initial document URL is under
`/desktop/*`. `contextBridge` has no revocation API, so
`desktop/src/window.ts` blocks navigation from an exposed desktop page to
non-desktop paths. Cross-link:
[renderer-bridge / capability boundary](./renderer-bridge.md#the-capability-boundary).

**What this catches.** A future bug that introduces an `<iframe>` on
`grida.co/blog/...` to load the same Electron renderer. The bridge stays
detached; the iframe sees no agent server API.

**What this does not catch.** A bug _inside_ `/desktop/*` that runs
attacker-controlled JS. CSP and the authenticated daemon perimeter remain
independent controls.

## CSP-strict `/desktop/*` routes

`editor/proxy.ts` attaches a nonce-based CSP to `/desktop/*` responses. The
desktop route group does not run third-party analytics or marketing scripts.

**What this catches.** A future desktop page that accidentally depends on an
inline script or third-party script include.

**What this does not catch.** A trusted framework script compromised before it
reaches the page. The daemon perimeter still rejects requests that do not carry
the host-held credentials.

## Main-owned daemon socket and HTTP perimeter

Electron main binds an ephemeral port on exact `127.0.0.1` with accepted
sockets paused. Once the sidecar is ready, main transfers only an
already-connected loopback socket over the per-spawn Node IPC descriptor.
AgentSidecar starts the daemon without a listener and injects that socket into
an unbound HTTP server. It receives no listener, target field, bind operation,
or connect operation. Every request on the transferred socket must:

- Carry the per-spawn Basic Auth password (regenerated each agent host
  start; never persisted).
- Have a `Referer` header whose path is under the host-declared desktop route root.
- Have an `Origin` on the host-declared allowlist.

**What this catches.** A non-Grida process on the same machine
discovering the loopback port and trying to call the API, plus a compromised
sidecar attempting to turn daemon reachability into generic local networking.

**What this does not catch.** An attacker who already controls the
renderer and can reach `window.grida` — they're inside the bridge boundary. The
outer sandbox catches the worst filesystem/network blast radius if that
boundary fails.

## OS-level outer sandbox

On macOS and Linux, the daemon runs inside `srt`
([agent-sandbox-wrap](./agent-sandbox-wrap.md)) with the package-owned
outer-wrap intent: network limited to an **enumerated allowlist**
(and `srt` forbids `*` / open patterns), secret-path read/write denies, and
host-supplied write roots for the sidecar's persisted state and platform temp
paths. Desktop omits the daemon development-host baseline, disables external
ACP, and supplies `host_routed_provider_http: true`, so the Desktop sidecar's
direct external allowlist is empty. Provider/GG calls can leave only through
the host-routed provider transport. `allow_local_binding` is false: the daemon
remains reachable only because main transfers a connected socket it already
accepted. CLI hosts preserve the package defaults unless they opt into the same
strict construction switches.

Windows currently has no equivalent enabled outer boundary. srt 0.0.65 ships
an alpha Windows backend, but Desktop withholds it until the argv-based spawn,
machine provisioning, packaging, and lifecycle contract are supported. The
host withholds shell and external ACP, but not structured local filesystem
tools, so the shipping Windows posture is a known gap against the accepted
fail-closed authority model. The package policy is not a kernel egress fence on
that unwrapped process; the other controls do not turn it into sandboxed local
execution.

**What this catches.** A compromised agent server that wants to read
`~/.ssh`, write `~/.zshrc`, or exfiltrate to a random host.

**What this does not catch.** A compromised agent that sends data to an origin
already granted through the provider transport. The RFC's
[watchdog](../ai/agent/foundations.md#watchdog) is the answer to semantic misuse
inside a legitimate provider request — host-configured policy, not srt.

## Agent shell execution

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
[Desktop authority binding / raw execution and extensions](https://github.com/gridaco/grida/blob/main/desktop/docs/agent-authority.md#raw-execution-and-extensions).

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
sub-policy). Desktop's empty direct external allowlist prevents that child
from exfiltrating it over the network; local disclosure within the contained
process tree remains the gap.

**`auto` is informed-consent, not a guarantee.** `auto` removes
command-identity gating; the sandbox still bounds the blast radius (writable
roots and no direct external networking) but does not judge intent — an
injected or confused agent can read broadly and run anything within those
bounds. Intent judgment is the
[watchdog](../ai/agent/foundations.md#watchdog) layer, deferred.
`auto` is opt-in; the default `accept-edits` keeps a read-only-only shell.

## Secrets discipline

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

## Host-routed provider transport

AgentSidecar receives a construction-time `ProviderHttpTransport` whose only
operations are provider request and credential-free provider-asset download.
Requests cross the inherited stdin/stdout pair as bounded, ordered frames.
Electron main executes them in a dedicated non-persistent Chromium `Session`
configured for the system proxy route; there is no renderer handle, loopback
listener, argv or environment token, or generic arbitrary-URL API.

Main owns immutable built-in provider grants and memory-only exact-origin
grants for custom endpoints. A custom endpoint is canonicalized and its route
posture is displayed in a native confirmation before the grant exists. Only
`localhost`, subdomains of `.localhost`, and IP literals are eligible. Remote
hostnames, including `.local`, remain withheld because proxy/PAC selection and
DNS resolution cannot yet be bound atomically to Chromium's connection. Grant updates are revisioned and
acknowledged, and each completed upload is re-authorized against the current
snapshot before I/O. Every request also validates operation class, origin,
method, headers, body bounds, and redirects. Credential-bearing cross-origin
redirects fail closed. Provider-asset downloads are HTTPS/default-port only,
carry no provider credentials, and are limited to enumerated provider-owned
origin namespaces; there is no arbitrary-public-URL grant.

AgentSidecar still owns BYOK and GG credentials and attaches them to provider
requests. Electron main can observe those credentials transiently while
performing the request, but does not persist or log them and does not place them
in the Chromium cookie jar. Main has transient routing authority, not durable
credential custody. The host transport is an explicit trust boundary, not a
claim that main cannot see in-flight authorization.

The ChatGPT credential follows the same routing distinction under
`GRIDA-SEC-008`: AgentSidecar owns credential lifecycle; main may route an
in-flight authorized request but gains no durable custody; the renderer
receives neither.

**What this catches.** A provider call that would otherwise inherit the
sidecar's static proxy/SRT route instead of the user's Chromium/system route;
an attempt to turn endpoint configuration or a credential-free download into
unrestricted native HTTP; or a cross-origin credential redirect.

**What this does not catch.** A compromised AgentSidecar exfiltrating data to
an already granted provider origin or a trusted enterprise TLS-inspection proxy
observing request contents. Chromium can consume OS-stored or integrated proxy
credentials, but Desktop does not collect interactive proxy credentials; that
challenge fails with a specific diagnostic. This control honors an effective
system route; it is not a censorship-circumvention tunnel and cannot create a
route where Chromium and the operating system have none.

## ChatGPT Subscription OAuth boundary

The experimental provider is a native Grida model provider, never ACP.
**“Sign in with your ChatGPT account”** supplies eligible model capacity while
Grida keeps the session, agent loop, tools, approvals, sandbox, transcript,
and recovery. No part of the ceremony starts Codex or transfers credentials
to an external agent.

The active `GRIDA-SEC-008` invariant is:

> A renderer may ask Grida to connect a ChatGPT account, but no renderer,
> project, transcript, command, extension, or external agent can obtain or
> replay the authorization result or credential.

It is enforced by all of the following:

- an experimental public native Codex OAuth client identity, replaceable by a
  host-owned client-id override and never described as a Grida-owned or
  OpenAI-approved identity;
- exact authorization/token/Responses destinations and exact callback address,
  ports, method, Host, and path;
- fresh cryptographic state and PKCE S256 for each short-lived attempt;
- listener-before-browser ordering, one-time callback consumption, timeout,
  cancellation, and close-on-every-terminal-path;
- state validation before atomic attempt claim, so an invalid callback does
  not consume the legitimate attempt;
- renderer operations limited to connect, cancel, safe status, and sign-out;
- callback and token material transient in main, never persisted or logged;
- bounded account/display claims parsed only from the response returned by the
  exact TLS-authenticated token endpoint;
- one durable credential owner, serialized refresh, and atomic refresh-token
  rotation;
- sign-out and account change winning over in-flight login, refresh, and
  inference;
- exact provider authorization/inference destinations through the native
  provider transport, with no generic fetch or local-binding grant;
- bounded, sanitized errors with no token, claim, authorization URL, account
  identifier, or upstream secret;
- no credential import from Codex or another application.

The current profile does **not** send an OIDC nonce and does not independently
verify JWT signature, JWKS, issuer, or audience. Its claim trust derives from
the pinned token endpoint plus the platform TLS trust path; callback,
renderer, project, and imported credential data are never claim sources. This
accepted experimental limit and the use of the public Codex native client
identity are why a stable legal/support contract with OpenAI remains an
external release gate.

The separate `grida://` Grida-account login boundary is not reused. A provider
authorization, entitlement, rate, or quota failure remains on the selected
provider; it cannot silently fail over to BYOK, GG, a local endpoint, or ACP.

`SECURITY.md` remains authoritative for the registered security tag. The
user-facing ChatGPT Subscription guide must preserve the availability and
support caveat until the external OpenAI gate is resolved; “active boundary”
describes local enforcement, not product support.

## Reviewer checklist

Before merging a PR that touches `/desktop/*` UI, the preload, the
agent server's HTTP layer, `buildAgentDaemonSandboxPolicy()`, or any source file under
`packages/grida-ai-agent/`:

1. **Bridge scope intact?** Preload path-scoping still fails closed. Window
   navigation still blocks exposed desktop pages from leaving `/desktop/*`.
2. **CSP intact?** `/desktop/*` routes keep the nonce CSP and do not
   add third-party scripts.
3. **Daemon ingress intact?** Main alone owns the exact loopback listener and
   transfers only accepted connected sockets. Every new route handler runs the
   auth + Referer + Origin guards. No "internal" bypass.
4. **Outer sandbox intact?** The Desktop policy keeps direct external egress
   empty and local binding false; filesystem paths cover only what the code
   reads/writes and the mandatory deny set is unmodified.
5. **Secrets intact?** No new secrets placed on `window`; `auth.json`
   write path still uses `0o600`; logs still elide content.
6. **Provider transport intact?** Provider traffic has no ambient-fetch fallback in
   Desktop; grants remain main-owned and destination-bound; channel frames,
   bodies, redirects, downloads, and response credit remain bounded; no
   credential or private channel reaches the renderer, argv, environment,
   disk, logs, shell, or ACP.
7. **ChatGPT boundary intact?** `GRIDA-SEC-008` still binds the exact callback,
   credential owner, safe renderer status, provider destinations,
   cancellation/sign-out races, and negative tests. Documentation must not
   invent nonce/JWT verification or call the experimental public-client
   profile OpenAI-approved.

Anything that weakens a control needs an explicit `GRIDA-SEC-004` review
note in the PR, not a silent regression.

## See also

- [`GRIDA-SEC-004` in `SECURITY.md`](https://github.com/gridaco/grida/blob/main/SECURITY.md)
  — the authoritative declaration.
- [`GRIDA-SEC-008` in `SECURITY.md`](https://github.com/gridaco/grida/blob/main/SECURITY.md)
  — the ChatGPT subscription OAuth credential boundary.
- [Process model](./process-model.md) — what each process owns.
- [Renderer bridge](./renderer-bridge.md) — path-scoped bridge detail.
- [Desktop agent authority](./agent-sandbox-wrap.md) — the landed native
  provider slice and the remaining raw-worker re-scope.
- [Agent storage layout](./agent-storage-layout.md) — secrets and state file map.
- [Agent system RFC / foundations / watchdog](../ai/agent/foundations.md#watchdog)
  — abstract defense-in-depth model.
- [ChatGPT Subscription native provider](../ai/agent/chatgpt-subscription-provider.md)
  — the golden provider contract and external activation gate.
