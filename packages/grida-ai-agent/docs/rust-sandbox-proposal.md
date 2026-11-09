# Native sandbox proposal

This document specifies the proposed srt replacement for the
[Rust agent core](./rust-core-proposal.md). It selects a small first implementation
and records the platform guarantees that still require executable evidence.
Codex is the primary reference at `6107b9886c114702e5c1cfd1c1b54f7c48bfaf49`.
Zed supplies a second comparison at `62682ebde9e70b8a77a95863a2b16e9d59bf65eb`.

## Decision

Use one `agent-kit-sandbox` crate with private platform modules and one trusted
helper entrypoint. Implement finite raw commands on macOS and Linux first.
The initial raw network profile is denied. Native Windows raw execution remains
unavailable until a separate backend meets the same requested profile.

The adapter receives an immutable host-issued execution scope. It resolves and
validates that scope, establishes native restrictions, owns the launched process,
and returns lifecycle evidence. Product modes, approval decisions, provider
credentials, model requests, and scheduling remain with their existing owners.

Codex and Zed both have direct native enforcement. Their traced boundaries
surround launched commands. A universal sandbox around the trusted agent host is
an additional deployment choice. Grida's existing outer host-containment policy
describes the current TS deployment. The native host chooses its hardening
profile independently while preserving raw-execution confinement and credential
custody. [Codex launch transformation](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/sandboxing/src/manager.rs),
[Zed sandbox](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/sandbox/src/sandbox.rs),
[Current Grida host policy](../../../desktop/docs/agent-authority.md).

## Source comparison

| Concern          | Codex                                                       | Zed                                               | Proposed first implementation                               |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| macOS            | Generated Seatbelt profile through `/usr/bin/sandbox-exec`  | Same underlying facility                          | Seatbelt with an explicit scope                             |
| Linux            | Bubblewrap, namespaces, trusted inner helper, seccomp       | Bubblewrap, namespaces, inner validation, seccomp | One pinned helper and bubblewrap integration                |
| Linux dependency | System bubblewrap with bundled fallback                     | Usable non-setuid system bubblewrap               | Host-selected trusted non-setuid build with required probes |
| Raw networking   | Restricted proxy routing and additional modes               | Per-instance restricted proxy                     | Denied initially                                            |
| Native Windows   | Legacy token/account backends and capability-gated MXC/PSEC | WSL integration                                   | Unavailable initially                                       |
| Parent host      | Separate process hardening                                  | Trusted application                               | Independent host deployment policy                          |

These findings describe each project's implemented boundary. Zed's default broad
read access is insufficient evidence
for Grida's narrower credential and cross-session scope. Its external ACP server
launch also follows a different path from its sandboxed terminal tools.
[Codex Linux launcher](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/linux-sandbox/src/launcher.rs),
[Zed Linux launcher](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/sandbox/src/linux_bubblewrap.rs),
[Zed ACP transport](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/agent_servers/src/acp/transport.rs).

The official Codex permission documentation confirms the current Seatbelt,
bubblewrap/seccomp, and Windows backend distinctions. Concrete behavior in this
proposal is checked against the pinned source above.
[Codex enforcement documentation](https://learn.chatgpt.com/docs/permissions#how-enforcement-works).

## Ownership and package boundary

| Owner           | Responsibility                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Host            | Issue grants, resolve trusted executables, provide approved runtime files and environment, select supported deployment profiles |
| Master          | Select the permitted action and approval route                                                                                  |
| Runtime         | Commit admission before launch, apply cancellation and bounds, retain the tool's actual outcome                                 |
| Sandbox adapter | Validate and enforce the exact native profile, own native launch resources and lifecycle evidence                               |
| Sessions        | Preserve operation identity, pending or uncertain outcomes, and recovery disposition                                            |

The crate depends on Core authority values and native process/OS libraries.
It has no dependency on Runtime, Sessions, Electron, provider SDKs, or a database.
The finite-command tool adapts its result to the existing tool outcome.

```text
agent-kit-sandbox/
  src/
    lib.rs
    scope.rs
    process.rs
    macos.rs
    linux.rs
    helper.rs
```

These are proposed modules, with no scaffolding implied. The helper logic is
linked into a host executable's private early-dispatch entrypoint or a small
same-version installed executable. This choice follows packaging needs. The
helper accepts only the validated internal launch protocol and never opens a
public command service. Per-platform crates can wait for a real dependency or
release boundary.

Helpers and bubblewrap use absolute deployment-owned paths, with version and
integrity validation. They remain outside raw writable scopes or retain an
equivalent pinned executable identity. Workspace-controlled `PATH` lookup cannot
select an enforcement executable.

## Minimal public contract

The public object owns execution resources. The consumer does not receive a bare
wrapper string that can be launched after discarding its guards.

| Operation                      | Input                                                | Result                                                                                    |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Sandbox::probe`               | Requested native profile                             | Enforceable features or a typed unavailable reason on this host                           |
| `Sandbox::prepare`             | Explicit process specification and host-issued scope | A single-use `PreparedProcess` retaining validated identities and setup resources         |
| `PreparedProcess::spawn`       | The already prepared operation                       | `RunningProcess`, or a launch disposition stating what started and what remains uncertain |
| `RunningProcess::request_stop` | Stop reason                                          | Idempotent request to stop the owned execution                                            |
| `RunningProcess::finish`       | Ownership of the running handle                      | Native exit, output, confinement, descendant, and cleanup evidence                        |

The command tool calls `spawn` after Runtime admits its invocation and completes
the existing journal barrier.
Preparation can fail without executing the payload. A probe is advisory until
setup revalidates its requirements. Every prepared object is bound to the exact
command, scope, resource identities, and backend selected for admission.

The process specification contains an executable, argv, cwd, an explicit
environment, and bounded stdio requirements. The executable is host-resolved.
Shell syntax is supported by explicitly choosing a permitted shell executable
and its argv. Scope construction and shell interpretation remain separate.

Construct the payload environment from a cleared environment and an explicit
host projection. Ambient provider credentials, daemon tokens, private IPC
endpoints, and unrelated session state never enter by inheritance. Durable
process specifications retain approved ordinary values and secret binding
identities. The host resolves authorized secret values just before execution,
keeping those values out of prepared-input fingerprints, journals, and logs.
The same projection applies to hook commands and external-agent launchers.
Permission-profile labels in the environment describe policy and confer no
access. [Codex environment construction](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/core/src/exec_env.rs).

The first command adapter supplies bounded complete execution. PTY interaction,
later stdin, yield/poll handles, and processes retained after a turn require a
separate adapter capability with an explicit owner and lifetime. A sandbox
launch handle alone does not establish that user-facing process-session contract.

Trusted launchers, bubblewrap, and setup helpers start with a minimal host-owned
environment and designated setup descriptors. Payload environment travels as
inert launch data and is installed for the final exec after confinement is active.
Payload loader variables, startup hooks, and search paths cannot influence
trusted setup. Cleaning these only inside a dynamically linked helper's entrypoint
is too late. Codex's hardening source explicitly distinguishes its static Linux
release binaries when discussing loader-variable cleanup.
[Codex process hardening](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/process-hardening/src/lib.rs).

| Scope material               | Required meaning                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Grant and principal identity | The host authority being exercised, including its revision and lifetime                      |
| Read and write locations     | Canonical approved locations with the backend's identity evidence                            |
| Protected locations          | Read-denied or write-denied subtrees whose restrictions must survive ancestor grants         |
| Runtime locations            | Explicit interpreter, library, and system reads needed by the selected executable            |
| Private temporary location   | Per-execution storage, separate from other sessions and host secrets                         |
| Network posture              | Denied in the first implementation                                                           |
| Inherited descriptors        | Stdio and an explicit host-selected set, each within the scope                               |
| Bounds and lifetime          | Deadline, output limit, cancellation ownership, and required descendant-termination strength |

The caller cannot supply raw Seatbelt text, bubblewrap flags, helper commands,
or an arbitrary seccomp program. Those are private policy-compilation details.

## Launch protocol

1. Resolve the host grant and exact process specification. Capture filesystem
   identity and check protected paths, runtime reads, handles, and bounds.
2. Select a backend that can enforce the entire requested profile. Unsupported
   features produce a typed refusal before payload launch.
3. Prepare private temporary storage and a bounded startup-status channel. Keep
   these resources in the single-use prepared object. The control channel is
   private to the trusted helper and closes before payload execution through
   close-on-exec or an equivalent mechanism.
4. Runtime commits admission. Revalidate the scope and establish OS restrictions.
   The helper closes every inherited descriptor outside the explicit set.
5. The trusted startup protocol distinguishes setup failure, payload execution,
   payload exit, and uncertain launch. A wrapper exiting successfully cannot
   establish that the requested payload completed successfully.
6. Retain the native handle through output draining, termination, descendant
   disposition, and cleanup. Record the resulting evidence through Runtime.

Scope changes require a new prepared operation and admission. A failed launch
retains its original backend and disposition. Recovery reconciles possible work
before repeating an uncertain launch. Existing journal identities provide that
correlation.

A stored PID alone cannot identify a recovered execution or authorize killing
it. Recovery requires backend-specific identity evidence or retains an unresolved
disposition, including when the operating system has reused that PID.

## macOS

Compile the effective scope into a deny-default Seatbelt profile and invoke
the absolute `/usr/bin/sandbox-exec` executable. Declare runtime reads and
permitted process creation explicitly. Descendants inherit the restrictions.
The profile denies raw network access and unauthorized Unix-socket/IPC paths.
Environment cleanup and descriptor closure happen before the payload receives
control. [Codex Seatbelt implementation](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/sandboxing/src/seatbelt.rs),
[Codex base profile](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/sandboxing/src/seatbelt_base_policy.sbpl).

Use a private process group for normal cancellation and worker reaping. Seatbelt
inheritance establishes continuing confinement, while a descendant can escape
that process group by creating a new session. The initial backend therefore
cannot claim hard revocation of every hostile descendant. A profile requiring
that guarantee remains unavailable until a stronger mechanism is demonstrated.
If a descendant may still affect a shared resource, its ownership remains
unresolved. [Current Grida lifecycle limit](../../../desktop/docs/agent-authority.md).

## Linux

Use bubblewrap to construct the filesystem view and user, mount, PID, IPC, and
network namespaces. Drop capabilities and create a private `/proc` view and
temporary filesystem. The trusted inner helper validates mounted identities,
sets `no_new_privs`, installs seccomp, and then executes the payload.
Its PID-namespace owner forwards cancellation and reaps descendants. Use
`--die-with-parent` together with explicit parent-side termination and waiting.
[Codex Linux stages](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/linux-sandbox/src/linux_run_main.rs),
[Codex namespace construction](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/linux-sandbox/src/bwrap.rs).

With networking denied, isolate the network stack and block socket families and
syscalls that could reach privileged host IPC or bypass the network boundary.
The supported architecture's seccomp policy covers Unix/VSOCK access, relevant
`io_uring` paths, and process-inspection escape routes. Mount restrictions hide
host service sockets. The exact syscall set is versioned implementation material.
[Codex seccomp](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/linux-sandbox/src/seccomp.rs).

Use a trusted, host-selected non-setuid bubblewrap executable with a declared
supported version and architecture set. Bundling it or accepting a validated
system installation is a packaging decision. Host probes establish that the
required namespace operations work under the actual kernel and distribution
policy. A missing binary, blocked user namespace, unsupported syscall policy,
or incompatible mount behavior makes the requested profile unavailable.

The first implementation omits system-version compatibility translations and
legacy Landlock fallback. Current Codex rejects filesystem-restricted legacy
Landlock execution because it cannot isolate privileged app-server sockets.
[Codex legacy-policy rejection](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/linux-sandbox/src/linux_run_main.rs#L382).

## Windows and WSL

Native Windows raw execution is unavailable in the first implementation.
Structured host capabilities retain their own availability. The next native
candidate is MXC/PSEC with actual creation and per-feature probes, including
read/write/deny semantics, inherited handles, network posture, and job lifetime.
OS version detection alone is insufficient.

Codex's MXC path avoids the legacy account, ACL, elevation, and provisioning
subsystem. It currently accepts documented hard-link limitations and broader
loopback networking than a proxy-only grant. These require separate evaluation
against the requested scope. [Codex native Windows design](https://github.com/openai/codex/blob/6107b9886c114702e5c1cfd1c1b54f7c48bfaf49/codex-rs/mxc-sandbox/README.md).

WSL2 may be selected explicitly as a Linux execution environment. Its identity,
filesystem, executable, and network belong to that environment. Windows-drive
mounts and interop bridges require their own isolation evidence before admission.
A Windows command is never silently relocated to WSL. Zed documents WSL-specific
filesystem limitations that reinforce this distinction.
[Zed platform boundaries](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/docs/src/ai/sandboxing.md).

## Network and filesystem limits

The initial adapter provides denied raw networking. Provider calls, downloads,
and other structured network operations use their separately authorized host
capabilities. Commands needing network remain unavailable under this profile.
A later `ProxyOnly` profile needs an attributable per-execution mediator,
destination checks, OS-enforced reachability, and a Linux namespace bridge.
Proxy environment variables alone cannot establish the boundary.

Approved locations retain filesystem identity through setup. Linux can pin
locations with descriptors and verify the mounted object before payload exec.
Canonical path strings alone leave a check-to-mount race. Protected locations
that do not yet exist need an enforceable creation restriction or protected
ancestor. Silently omitting a missing deny path is invalid.
[Zed filesystem identity](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/sandbox/src/util/host_filesystem_location.rs).

Path restrictions do not establish object confidentiality when the same bytes
are reachable through an allowed hard-link alias. Each backend declares its
alias semantics and rejects profiles requiring guarantees it cannot enforce.
Raw scopes exclude credential stores and other sessions' storage. Credential
custody must also account for aliases and inherited handles. Stronger isolation
can require a separate filesystem view or separately held credentials.

The host must also control later execution of writable project content by
unsandboxed watchers, hooks, or language services. A tool sandbox cannot confine
a different trusted process that subsequently executes the generated content.
[Zed threat-model example](https://github.com/zed-industries/zed/blob/62682ebde9e70b8a77a95863a2b16e9d59bf65eb/crates/sandbox/README.md).

## Acceptance and lock boundary

| Case                                                                  | Required evidence                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Namespace, profile, or helper setup fails                             | Payload did not start, or the launch is explicitly uncertain                                                                                     |
| An approved path is swapped before mounting                           | Startup rejects changed identity before payload execution                                                                                        |
| A protected path is renamed, newly created, or hard-linked            | Its declared path/alias guarantee holds, or the profile is refused                                                                               |
| A child attempts host Unix-socket, VSOCK, or inherited-handle access  | Access stays inside the granted set                                                                                                              |
| A child uses an already-open descriptor to bypass a denied path       | Descriptor inheritance and native rules preserve the requested read/write restriction                                                            |
| Payload environment targets the loader or startup of a trusted helper | Trusted setup runs only with its host-owned environment before confinement is active                                                             |
| Host starts with provider credentials and private control endpoints   | An ordinary payload receives only the approved environment and durable records contain binding identities instead of host-managed secret values. |
| Two sessions run concurrently                                         | Grants, temporary storage, and native resources remain independent                                                                               |
| A child daemonizes or outlives its root process                       | Descendant and shared-resource disposition remains explicit                                                                                      |
| The owner crashes                                                     | Recovery retains uncertainty until termination or effective isolation is established                                                             |
| A network-dependent command runs under the initial profile            | Direct networking remains denied                                                                                                                 |
| Windows or WSL lacks a required guarantee                             | The affected raw execution is unavailable                                                                                                        |

Lock the ownership, single-use launch, denied-network first profile, platform
selection, and typed lifecycle evidence. Keep exact Rust signatures, helper
packaging details, syscall lists, minimum tested OS versions, alias coverage,
and stronger macOS revocation subject to implementation tests. Source review
and policy-unit tests cannot substitute for native adversarial execution tests.
