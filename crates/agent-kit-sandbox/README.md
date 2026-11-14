# agent-kit-sandbox

Run a bounded process, or a long-running process session, under a
host-issued native filesystem scope with raw networking denied. The caller validates current authority and chooses the
approved executable, working directory, runtime files, environment, and limits.
The crate owns preparation, launch, cancellation, and native evidence.

## Launch

1. Construct `Sandbox` with the installed same-version helper's absolute path
   and pinned SHA-256. On Linux also supply a trusted, non-setuid bubblewrap
   installation. Keep both executables outside every writable scope.
2. Probe the proposed scope on the actual host. Use explicit canonical runtime
   roots for the executable, interpreters, and dynamic libraries. The probe
   also confirms that the filesystem reports the location identities a capture
   fingerprint needs.
3. Prepare the exact command and scope. The executable and working directory
   must already be covered. Preparation captures location identities, checks
   mandatory denials, measures the setup frame the helper will read, and
   allocates private temporary storage.
4. After the caller admits the operation, consume `PreparedProcess` to spawn
   from within a Tokio runtime. The sandbox rechecks identity and lifetime and
   starts the launcher from a thread it owns, so the calling thread may end
   while the process runs. The payload's explicit environment and bounded stdin
   enter through a private pipe after trusted setup starts in a cleared
   environment.
5. Await `RunningProcess::finish` for bounded output and execution evidence.
   Request cancellation through the supplied token or the owned running handle.
   A lost lifecycle record leaves the execution uncertain.

Ordinary payloads inherit only stdin, stdout, and stderr. The helper reports
whether a command started and how it exited on a separate close-on-exec
descriptor. The owner's end of that descriptor is also its control channel.
When it closes, for example because the owner process ended, the helper ends
everything it launched. Launcher exit alone cannot establish payload
completion. Stopping an operation bounds cleanup attempts and preserves
uncertain effects.

Trusted embedders on macOS and Linux can open bidirectional stdio with
`PreparedProcess::spawn_streaming`. This requires a reviewed system executable
and its pinned digest, and the process specification must have empty fixed
stdin. The host supplies the exact arguments and scope during preparation.
The stream carries opaque bytes through bounded buffers. Closing its writer
sends EOF. Read stdout concurrently with request writes and continue draining
it through shutdown. The existing output budget covers streamed stdout and
captured stderr together, and the separate stdin budget stops excess input.
The running handle still owns cancellation, cleanup, and native evidence.

## Sessions

`PreparedProcess::spawn_session` starts the same prepared command as a
long-running session. The process specification's timeout and output budget
do not apply. The session ends when its command ends, the scope's
`valid_until` passes, the cancellation token fires, or a stop is requested.
Fixed stdin must be empty.

- Pipe sessions close the payload's stdin at once and merge stdout and stderr
  into one output in arrival order. Launcher diagnostics join that output.
- Terminal sessions allocate one pseudo-terminal inside the sandbox through
  the trusted helper, sized 80 columns by 24 rows. The payload leads a new
  session with the terminal as stdin, stdout, stderr, and controlling
  terminal. `RunningSession::write` types into it, at most 64 KiB at a time
  and 256 KiB undelivered. Output keeps the terminal's line endings and
  control sequences.

Output is retained until read: the first half of `retained_output_bytes`
and a rolling last half. Readers drain it into the buffer whether or not the
owner reads, so the payload never waits on the owner. `RunningSession::read`
returns soon after output appears, once the session ended and everything was
read, or at its deadline. It consumes what it returns, and reports bytes
dropped from the buffer or elided to fit the requested size as one counted
span with its position.

`RunningSession::interrupt` delivers Ctrl-C through the helper. A terminal
session receives the interrupt character, which its line discipline turns
into `SIGINT` for the foreground process group unless the payload reads it as
input. A pipe session's payload process group receives `SIGINT`; on macOS
that is the launcher's group, whose helper ignores it, and on Linux the
payload's own group inside the PID namespace. Supervision, the status
channel, and the evidence continue.

`RunningSession::request_stop`, cancellation, the scope deadline, and
dropping the handle stop a session. The owner asks the helper to end the
payload and its own group, waits briefly for the report, and then applies the
same termination as a finite launch. `RunningSession::finish` returns the
same evidence as a finite launch with empty stdout and stderr. A session
whose owner process disappears without stopping it ends too: the helper sees
its control channel close and ends everything it launched.

On macOS a terminal payload leads a session outside the launcher's process
group, so the owner's group signal does not reach it. The helper signals the
payload's group while the payload is still unreaped and confirms it in its
report. Without that confirmation the evidence is `Unverified`. A descendant
that moves to another process group or session, such as a job-control shell's
background job, can outlive the stop. Linux sessions keep the PID namespace
guarantee in both modes.

## Profiles

- macOS generates a deny-by-default Seatbelt profile for the supplied paths.
  The command and descendants inherit its confinement. Cancellation signals an
  owned process group. After normal payload exit, the helper reports the exit
  and stays alive for the owner's group signal and reap. Closing the status
  channel ends the helper and everything left in its group. A descendant that creates another session can
  outlive the group, so this backend refuses a required all-descendant guarantee.
- Linux uses bubblewrap user, mount, PID, IPC, UTS, and network namespaces.
  The trusted helper verifies mounted identities, disables inspection of
  itself, and installs seccomp before spawning the command. Namespace teardown
  is reported when verified. Interrupted launches can retain an unverified
  disposition. Linux requires kernel 5.11 or later, bubblewrap 0.8 or later,
  working unprivileged user namespaces, private procfs mounting, and a native
  x86-64 or arm64 syscall ABI. Capture fingerprints also require a filesystem
  that reports file birth time, which some network and virtual filesystems do
  not.
- Native Windows and WSL command execution are unavailable. The caller can
  independently expose other structured capabilities.

The scope uses paths and validated root identities. Hard-link aliases reachable
through a grant remain readable. A protected path inside a granted location is
carved out of it. One that equals or contains a granted location refuses the
scope when that location grants what it denies; a read or runtime location
under an unwritable path stays read-only. A protected path may not exist yet. Seatbelt denies it by rule.
bubblewrap needs a mount point, so where a writable mount would let the payload
create the missing path, the supervisor holds an empty, read-only placeholder
directory there for the launch. It removes the placeholder once no launch can
still observe it. A launch whose end is unverified leaves the empty directory
in place. A missing protected path whose parent is also missing refuses the
scope on Linux.

Temporary storage is allocated under a private host directory separate from
visible roots. Other launches' temporary storage stays hidden, also from a
scope that reads anywhere on disk.

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
bounded output, cancellation, and sessions: retained output, terminal input,
interrupts, stops with background descendants, and the owner process ending. Their native enforcement evidence belongs to
the OS, kernel, and bubblewrap configuration on which they execute.
