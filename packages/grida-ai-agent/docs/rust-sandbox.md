# Native sandbox

This document specifies native command confinement for the
[Rust agent core](./rust-core.md) and records the platform guarantees each
backend must evidence. The [`agent-kit-sandbox` README](../../../crates/agent-kit-sandbox/README.md)
documents its launch sequence, platform requirements, and native fixtures.

## Decision

One `agent-kit-sandbox` crate with private platform modules and one trusted
helper executable confines finite raw commands on macOS and Linux. The raw
network profile is denied. Native Windows raw execution is deferred: it remains
unavailable until a separate backend meets the same requested profile.

The adapter receives an immutable host-issued execution scope. It resolves and
validates that scope, establishes native restrictions, owns the launched process,
and returns lifecycle evidence. Product modes, approval decisions, provider
credentials, model requests, and scheduling remain with their existing owners.

Confinement surrounds launched commands. Containing the trusted agent host
itself is a separate deployment choice; the native host chooses its hardening
profile independently while preserving raw-execution confinement and credential
custody. [Host authority policy](../../../desktop/docs/agent-authority.md).

## Selected mechanisms

| Concern          | Mechanism                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| macOS            | A generated deny-default Seatbelt profile with an explicit scope, run through `/usr/bin/sandbox-exec` |
| Linux            | Bubblewrap namespaces, a trusted inner helper and seccomp                                             |
| Linux dependency | A host-selected, trusted non-setuid bubblewrap build with required probes                             |
| Raw networking   | Denied                                                                                                |
| Native Windows   | Unavailable                                                                                           |
| Parent host      | Independent host deployment policy                                                                    |

Broad default read access is insufficient for Grida's narrower credential and
cross-session scope. External agent processes launched over ACP are confined
like other commands; a separate, unconfined launcher is not acceptable.
[bubblewrap](https://github.com/containers/bubblewrap),
[seccomp(2)](https://man7.org/linux/man-pages/man2/seccomp.2.html).

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

The helper ships as the crate's same-version `agent-kit-sandbox-helper`
executable, installed at an absolute path with a pinned SHA-256. It accepts
only the validated internal launch protocol and never opens a public command
service. Platform backends are private modules of the one crate.

Helpers and bubblewrap use absolute deployment-owned paths, with version and
integrity validation. They remain outside raw writable scopes or retain an
equivalent pinned executable identity. Workspace-controlled `PATH` lookup cannot
select an enforcement executable.

## Minimal public contract

The public object owns execution resources. The consumer does not receive a bare
wrapper string that can be launched after discarding its guards.

| Operation                      | Input                                                | Result                                                                                    |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Sandbox::probe`               | Requested native scope                               | Enforceable features or a typed unavailable reason on this host                           |
| `Sandbox::prepare`             | Explicit process specification and host-issued scope | A single-use `PreparedProcess` retaining validated identities and setup resources         |
| `PreparedProcess::spawn`       | The prepared operation and a cancellation token      | `RunningProcess`, or a launch disposition stating what started and what remains uncertain |
| `RunningProcess::request_stop` | None                                                 | Idempotent request to stop the owned execution                                            |
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
access.

The command adapter supplies bounded complete execution. Trusted embedders can
also use `PreparedProcess::spawn_streaming` for bidirectional stdio with a
reviewed, digest-pinned system executable, which the confined external ACP peer
uses. PTY interaction, yield/poll handles, and processes retained after a turn
require a separate adapter capability with an explicit owner and lifetime. A sandbox
launch handle alone does not establish that user-facing process-session contract.

Trusted launchers, bubblewrap, and setup helpers start with a minimal host-owned
environment and designated setup descriptors. Payload environment travels as
inert launch data and is installed for the final exec after confinement is active.
Payload loader variables, startup hooks, and search paths cannot influence
trusted setup. Cleaning these only inside a dynamically linked helper's entrypoint
is too late, because the loader has already read them.

| Scope material               | Required meaning                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Grant and principal identity | The host authority being exercised, including its revision and lifetime                      |
| Read and write locations     | Canonical approved locations with the backend's identity evidence                            |
| Protected locations          | Read-denied or write-denied subtrees whose restrictions must survive ancestor grants         |
| Runtime locations            | Explicit interpreter, library, and system reads needed by the selected executable            |
| Private temporary location   | Per-execution storage, separate from other sessions and host secrets                         |
| Network posture              | Denied                                                                                       |
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
control.

Use a private process group for normal cancellation and worker reaping. Seatbelt
inheritance establishes continuing confinement, while a descendant can escape
that process group by creating a new session. The backend therefore cannot
claim hard revocation of every hostile descendant and refuses a required
all-descendant guarantee. A profile requiring
that guarantee remains unavailable until a stronger mechanism is demonstrated.
If a descendant may still affect a shared resource, its ownership remains
unresolved. [Host lifecycle limit](../../../desktop/docs/agent-authority.md).

## Linux

Use bubblewrap to construct the filesystem view and user, mount, PID, IPC, UTS,
and network namespaces. Drop capabilities and create a private `/proc` view and
temporary filesystem. The trusted inner helper validates mounted identities,
sets `no_new_privs`, installs seccomp, and then executes the payload.
Its PID-namespace owner forwards cancellation and reaps descendants. Use
`--die-with-parent` together with explicit parent-side termination and waiting.

With networking denied, isolate the network stack and block socket families and
syscalls that could reach privileged host IPC or bypass the network boundary.
The supported architecture's seccomp policy covers Unix/VSOCK access, relevant
`io_uring` paths, and process-inspection escape routes. Mount restrictions hide
host service sockets. The exact syscall set is versioned implementation material.

Use a trusted, host-selected non-setuid bubblewrap executable with a declared
supported version and architecture set. Bundling it or accepting a validated
system installation is a packaging decision. Host probes establish that the
required namespace operations work under the actual kernel and distribution
policy. A missing binary, blocked user namespace, unsupported syscall policy,
or incompatible mount behavior makes the requested profile unavailable.

The backend omits system-version compatibility translations and a Landlock-only
fallback, because filesystem rules alone cannot isolate privileged
host sockets.

## Windows and WSL

Native Windows raw execution is deferred and unavailable. Structured host
capabilities retain their own availability. A native candidate backend is
MXC/PSEC with actual creation and per-feature probes, including
read/write/deny semantics, inherited handles, network posture, and job lifetime.
OS version detection alone is insufficient.

A candidate backend must also state its hard-link semantics and loopback
networking reach, which can be broader than a proxy-only grant. These require
separate evaluation against the requested scope.

WSL2 may be selected explicitly as a Linux execution environment. Its identity,
filesystem, executable, and network belong to that environment. Windows-drive
mounts and interop bridges require their own isolation evidence before admission.
A Windows command is never silently relocated to WSL, whose filesystem
semantics differ from the native ones.

## Network and filesystem limits

The adapter provides denied raw networking. Provider calls, downloads, and
other structured network operations use their separately authorized host
capabilities. Commands needing network remain unavailable under this profile.
A `ProxyOnly` profile is deferred; it needs an attributable per-execution mediator,
destination checks, OS-enforced reachability, and a Linux namespace bridge.
Proxy environment variables alone cannot establish the boundary.

Approved locations retain filesystem identity through setup. Linux can pin
locations with descriptors and verify the mounted object before payload exec.
Canonical path strings alone leave a check-to-mount race. Protected locations
that do not yet exist need an enforceable creation restriction or protected
ancestor. Silently omitting a missing deny path is invalid.

Path restrictions do not establish object confidentiality when the same bytes
are reachable through an allowed hard-link alias. Each backend declares its
alias semantics and rejects profiles requiring guarantees it cannot enforce.
Raw scopes exclude credential stores and other sessions' storage. Credential
custody must also account for aliases and inherited handles. Stronger isolation
can require a separate filesystem view or separately held credentials.

The host must also control later execution of writable project content by
unsandboxed watchers, hooks, or language services. A tool sandbox cannot confine
a different trusted process that subsequently executes the generated content.

## Acceptance

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
| A network-dependent command runs under the denied profile             | Direct networking remains denied                                                                                                                 |
| Windows or WSL lacks a required guarantee                             | The affected raw execution is unavailable                                                                                                        |

The ownership, single-use launch, denied-network profile, platform selection,
and typed lifecycle evidence are fixed contracts. Syscall lists, minimum tested
OS versions, alias coverage, and stronger macOS revocation follow the native
tests. Source review and policy-unit tests cannot substitute for native
adversarial execution tests.
