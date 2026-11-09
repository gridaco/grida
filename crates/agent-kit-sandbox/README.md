# agent-kit-sandbox

Run a finite command under a host-issued native filesystem scope with raw
networking denied. The caller validates current authority and chooses the
approved executable, working directory, runtime files, environment, and limits.
The crate owns preparation, launch, cancellation, and native evidence.

## Launch

1. Construct `Sandbox` with the installed same-version helper's absolute path
   and pinned SHA-256. On Linux also supply a trusted, non-setuid bubblewrap
   installation. Keep both executables outside every writable scope.
2. Probe the proposed scope on the actual host. Use explicit canonical runtime
   roots for the executable, interpreters, and dynamic libraries.
3. Prepare the exact command and scope. The executable and working directory
   must already be covered. Preparation captures location identities, checks
   mandatory denials, and allocates private temporary storage.
4. After the caller admits the operation, consume `PreparedProcess` to spawn.
   The sandbox rechecks identity and lifetime. The payload's explicit environment
   and bounded stdin enter through a private pipe after trusted setup starts in
   a cleared environment.
5. Await `RunningProcess::finish` for bounded output and execution evidence.
   Request cancellation through the supplied token or the owned running handle.
   A lost lifecycle record leaves the execution uncertain.

Ordinary payloads inherit only stdin, stdout, and stderr. The helper reports
whether a command started and how it exited on a separate close-on-exec
descriptor. Launcher exit alone cannot establish payload completion. Stopping
an operation bounds cleanup attempts and preserves uncertain effects.

## Profiles

- macOS generates a deny-by-default Seatbelt profile for the supplied paths.
  The command and descendants inherit its confinement. Cancellation signals an
  owned process group. After normal payload exit, the helper reports the exit
  and stays alive for the owner's group signal and reap. Closing the status
  channel releases that wait. A descendant that creates another session can
  outlive the group, so this backend refuses a required all-descendant guarantee.
- Linux uses bubblewrap user, mount, PID, IPC, UTS, and network namespaces.
  The trusted helper verifies mounted identities, disables inspection of
  itself, and installs seccomp before spawning the command. Namespace teardown
  is reported when verified. Interrupted launches can retain an unverified
  disposition. Linux requires working unprivileged user namespaces, private
  procfs mounting, and a native x86-64 or arm64 syscall ABI.
- Native Windows and WSL command execution are unavailable. The caller can
  independently expose other structured capabilities.

The scope uses paths and validated root identities. Hard-link aliases reachable
through a grant remain readable. Overlapping mandatory denials fail closed
when they cannot be enforced by the backend. Temporary storage is allocated
under a private host directory separate from visible roots.

## Verification

Run ordinary contract tests from the workspace root.

```sh
cargo test -p agent-kit-sandbox --locked
cargo clippy -p agent-kit-sandbox --all-targets --locked -- -D warnings
```

Run the native fixtures on macOS from a process that can apply Seatbelt, or
on Linux with a compatible bubblewrap installation and working namespaces.

```sh
cargo test -p agent-kit-sandbox --locked --test native -- --include-ignored
AGENT_KIT_TEST_BWRAP=/usr/bin/bwrap cargo test -p agent-kit-sandbox --locked --test native -- --include-ignored
```

The fixtures exercise explicit input and environment, permitted files, denied
filesystem and IPC access, descriptor inheritance, temporary isolation,
bounded output, and cancellation. Their native enforcement evidence belongs to
the OS, kernel, and bubblewrap configuration on which they execute.
