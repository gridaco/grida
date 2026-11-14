//! GRIDA-SEC-004 — long-running process sessions under the native scope.
//!
//! A session runs the prepared command with no wall-clock limit of its own.
//! Output is retained (head and tail) until the owner reads it. The owner
//! reaches the helper through the private status channel: an interrupt or a
//! stop request, and end of stream when the owner is gone.

use super::process::{self, DRAIN_GRACE, REAP_GRACE, Running};
use super::*;
use crate::wire::{CONTROL_INTERRUPT, CONTROL_STOP, STATUS_GROUP_ENDED, STATUS_SETUP_FAILED};
use std::collections::VecDeque;
use std::os::fd::AsRawFd;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::net::unix::{OwnedReadHalf, OwnedWriteHalf};
use tokio::process::Child;
use tokio::sync::{Notify, mpsc};

pub(super) const MIN_RETAINED: usize = 1024;
pub(super) const MAX_RETAINED: usize = 8 * 1024 * 1024;
/// The largest single terminal write.
const MAX_WRITE: usize = 64 * 1024;
/// Terminal input accepted but not yet delivered to the helper.
const MAX_QUEUED_INPUT: usize = 256 * 1024;
/// A read waits this long after output first appears, so one burst is not
/// split across reads.
const SETTLE: Duration = Duration::from_millis(75);
/// How long the helper may take to end the payload and report after a stop
/// request, before the launcher group is signalled regardless.
const STOP_GRACE: Duration = Duration::from_secs(3);
/// How often supervision checks the launcher while a session runs. The
/// helper's report normally ends a session first.
const LAUNCHER_POLL: Duration = Duration::from_millis(100);
/// `R`, the exit or signal frame, and the group confirmation.
const REPORT_BYTES: usize = 7;

/// Unread output: the first half of the capacity, then a rolling last half.
/// Bytes pushed out between them are counted.
pub(super) struct Retained {
    head: Vec<u8>,
    tail: VecDeque<u8>,
    head_capacity: usize,
    tail_capacity: usize,
    dropped: u64,
}

/// One drained read of [`Retained`].
#[derive(Debug, Eq, PartialEq)]
pub(super) struct Taken {
    pub(super) output: Vec<u8>,
    pub(super) omitted: u64,
    pub(super) omitted_at: Option<usize>,
}

impl Retained {
    pub(super) fn new(capacity: usize) -> Self {
        let head_capacity = capacity / 2;
        Self {
            head: Vec::new(),
            tail: VecDeque::new(),
            head_capacity,
            tail_capacity: capacity - head_capacity,
            dropped: 0,
        }
    }

    pub(super) fn push(&mut self, mut bytes: &[u8]) {
        let room = self.head_capacity - self.head.len();
        let (head, rest) = bytes.split_at(room.min(bytes.len()));
        self.head.extend_from_slice(head);
        bytes = rest;
        if bytes.len() >= self.tail_capacity {
            let skipped = bytes.len() - self.tail_capacity;
            self.dropped += (self.tail.len() + skipped) as u64;
            self.tail.clear();
            self.tail.extend(&bytes[skipped..]);
        } else {
            let overflow = (self.tail.len() + bytes.len()).saturating_sub(self.tail_capacity);
            self.tail.drain(..overflow);
            self.dropped += overflow as u64;
            self.tail.extend(bytes);
        }
    }

    pub(super) fn is_empty(&self) -> bool {
        self.head.is_empty() && self.tail.is_empty()
    }

    /// Drain everything retained into at most `max` bytes. Anything left out
    /// is one contiguous span, which includes the bytes dropped earlier.
    pub(super) fn take(&mut self, max: usize) -> Taken {
        let head = std::mem::take(&mut self.head);
        let tail = Vec::from(std::mem::take(&mut self.tail));
        let dropped = std::mem::take(&mut self.dropped);
        let total = head.len() + tail.len();
        if total <= max {
            let omitted_at = (dropped > 0).then_some(head.len());
            let mut output = head;
            output.extend_from_slice(&tail);
            return Taken {
                output,
                omitted: dropped,
                omitted_at,
            };
        }
        // Keep the elided span around the earlier gap between head and tail.
        let mut start = (max / 2).min(head.len());
        let mut end = max - start;
        if end > tail.len() {
            end = tail.len();
            start = max - end;
        }
        let mut output = head[..start].to_vec();
        output.extend_from_slice(&tail[tail.len() - end..]);
        Taken {
            output,
            omitted: dropped + (total - max) as u64,
            omitted_at: Some(start),
        }
    }
}

/// State a session handle shares with its supervisor.
pub(super) struct Shared {
    retained: Mutex<Retained>,
    changed: Notify,
    ended: AtomicBool,
    input: Option<mpsc::UnboundedSender<Vec<u8>>>,
    queued: AtomicUsize,
    interrupts: mpsc::UnboundedSender<()>,
}

impl Shared {
    fn push(&self, bytes: &[u8]) {
        self.retained
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(bytes);
        self.changed.notify_waiters();
    }

    fn has_output(&self) -> bool {
        !self
            .retained
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .is_empty()
    }

    fn end(&self) {
        self.ended.store(true, Ordering::Release);
        self.changed.notify_waiters();
    }
}

/// What the supervisor receives from the handle.
pub(super) struct Io {
    shared: Arc<Shared>,
    input: Option<mpsc::UnboundedReceiver<Vec<u8>>>,
    interrupts: mpsc::UnboundedReceiver<()>,
}

pub(crate) struct Session {
    shared: Arc<Shared>,
    running: Running,
}

pub(super) fn spawn(
    prepared: Prepared,
    options: SessionOptions,
    cancellation: CancellationToken,
) -> Result<Session> {
    let (input_sender, input) = if options.terminal {
        let (sender, receiver) = mpsc::unbounded_channel();
        (Some(sender), Some(receiver))
    } else {
        (None, None)
    };
    let (interrupt_sender, interrupts) = mpsc::unbounded_channel();
    let shared = Arc::new(Shared {
        retained: Mutex::new(Retained::new(options.retained_output_bytes)),
        changed: Notify::new(),
        ended: AtomicBool::new(false),
        input: input_sender,
        queued: AtomicUsize::new(0),
        interrupts: interrupt_sender,
    });
    let io = Io {
        shared: Arc::clone(&shared),
        input,
        interrupts,
    };
    let running = process::spawn(prepared, cancellation, process::Supervision::Session(io))?;
    Ok(Session { shared, running })
}

impl Session {
    pub(crate) async fn read(&self, until: Instant, max_bytes: usize) -> SessionRead {
        let mut settle: Option<Instant> = None;
        loop {
            let changed = self.shared.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            let ended = self.shared.ended.load(Ordering::Acquire);
            let now = Instant::now();
            if ended || now >= until || settle.is_some_and(|settle| now >= settle) {
                return self.take(max_bytes, ended);
            }
            if settle.is_none() && self.shared.has_output() {
                settle = Some((now + SETTLE).min(until));
            }
            let wake = settle.unwrap_or(until);
            tokio::select! {
                _ = &mut changed => {}
                _ = tokio::time::sleep_until(wake.into()) => {}
            }
        }
    }

    fn take(&self, max_bytes: usize, ended: bool) -> SessionRead {
        let taken = self
            .shared
            .retained
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take(max_bytes);
        SessionRead {
            output: taken.output,
            omitted_bytes: taken.omitted,
            omitted_at: taken.omitted_at,
            ended,
        }
    }

    pub(crate) fn write(&self, bytes: &[u8]) -> Result<()> {
        let Some(input) = &self.shared.input else {
            return Err(refused(
                ErrorKind::InvalidState,
                "sandbox_session_stdin_closed",
            ));
        };
        if bytes.len() > MAX_WRITE {
            return Err(refused(
                ErrorKind::LimitExceeded,
                "sandbox_session_input_limit",
            ));
        }
        if self.has_ended() {
            return Err(refused(ErrorKind::InvalidState, "sandbox_session_ended"));
        }
        if bytes.is_empty() {
            return Ok(());
        }
        let reserved =
            self.shared
                .queued
                .fetch_update(Ordering::AcqRel, Ordering::Acquire, |queued| {
                    (queued + bytes.len() <= MAX_QUEUED_INPUT).then_some(queued + bytes.len())
                });
        if reserved.is_err() {
            return Err(refused(
                ErrorKind::LimitExceeded,
                "sandbox_session_input_limit",
            ));
        }
        if input.send(bytes.to_vec()).is_err() {
            self.shared.queued.fetch_sub(bytes.len(), Ordering::AcqRel);
            return Err(refused(ErrorKind::InvalidState, "sandbox_session_ended"));
        }
        Ok(())
    }

    pub(crate) fn interrupt(&self) -> Result<()> {
        if self.has_ended() || self.shared.interrupts.send(()).is_err() {
            return Err(refused(ErrorKind::InvalidState, "sandbox_session_ended"));
        }
        Ok(())
    }

    pub(crate) fn request_stop(&self) {
        self.running.request_stop();
    }

    pub(crate) fn has_ended(&self) -> bool {
        self.shared.ended.load(Ordering::Acquire)
    }

    pub(crate) async fn finish(self) -> Result<ProcessEvidence> {
        self.running.finish().await
    }
}

async fn collect(mut input: impl AsyncRead + Unpin, shared: Arc<Shared>) -> bool {
    let mut bytes = [0; 16 * 1024];
    loop {
        match input.read(&mut bytes).await {
            Ok(0) => return true,
            Ok(count) => shared.push(&bytes[..count]),
            Err(_) => return false,
        }
    }
}

/// Read the helper's report until it is complete, setup failed, or the
/// channel ended.
async fn read_report(status: &mut OwnedReadHalf, bytes: &mut Vec<u8>) {
    let mut byte = [0];
    while bytes.len() < REPORT_BYTES && bytes.as_slice() != [STATUS_SETUP_FAILED] {
        match status.read(&mut byte).await {
            Ok(1) => bytes.push(byte[0]),
            _ => return,
        }
    }
}

/// Completion, and whether the helper confirmed ending the payload's group.
fn parse_report(bytes: &[u8]) -> (Completion, bool) {
    match bytes.len() {
        7 if bytes[6] == STATUS_GROUP_ENDED => (process::parse_status(&bytes[..6], false), true),
        7 => (Completion::Uncertain, false),
        _ => (process::parse_status(bytes, false), false),
    }
}

/// Send one control byte without raising SIGPIPE when the helper is gone.
#[allow(unsafe_code)]
async fn send_control(control: &OwnedWriteHalf, byte: u8) -> bool {
    #[cfg(target_os = "linux")]
    let flags = libc::MSG_NOSIGNAL;
    #[cfg(target_os = "macos")]
    let flags = 0;
    let stream = control.as_ref();
    loop {
        if stream.writable().await.is_err() {
            return false;
        }
        let fd = stream.as_raw_fd();
        let sent = stream.try_io(tokio::io::Interest::WRITABLE, || {
            let sent = unsafe { libc::send(fd, (&raw const byte).cast(), 1, flags) };
            if sent < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(sent)
            }
        });
        match sent {
            Ok(sent) => return sent == 1,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {}
            Err(_) => return false,
        }
    }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn suppress_sigpipe(control: &OwnedWriteHalf) {
    let enabled: libc::c_int = 1;
    unsafe {
        libc::setsockopt(
            control.as_ref().as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_NOSIGPIPE,
            (&raw const enabled).cast(),
            std::mem::size_of::<libc::c_int>() as libc::socklen_t,
        );
    }
}

pub(super) async fn supervise(
    mut child: Child,
    status: tokio::net::UnixStream,
    prepared: Prepared,
    setup: Vec<u8>,
    cancellation: CancellationToken,
    stop: CancellationToken,
    io: Io,
) -> ProcessEvidence {
    let Io {
        shared,
        input,
        mut interrupts,
    } = io;
    let (mut status, control) = status.into_split();
    #[cfg(target_os = "macos")]
    suppress_sigpipe(&control);
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    // Launcher diagnostics on stderr join the session output. Readers never
    // wait for the owner, so the payload is never blocked on output.
    let mut output_tasks = [
        tokio::spawn(collect(stdout, Arc::clone(&shared))),
        tokio::spawn(collect(stderr, Arc::clone(&shared))),
    ];
    let mut stdin = child.stdin.take().expect("stdin piped");
    let input_task = tokio::spawn({
        let shared = Arc::clone(&shared);
        async move {
            stdin.write_all(&(setup.len() as u32).to_be_bytes()).await?;
            stdin.write_all(&setup).await?;
            // A pipe session's payload reads EOF at once. Terminal input
            // flows until the session ends.
            if let Some(mut input) = input {
                while let Some(bytes) = input.recv().await {
                    let written = stdin.write_all(&bytes).await;
                    shared.queued.fetch_sub(bytes.len(), Ordering::AcqRel);
                    written?;
                }
            }
            stdin.shutdown().await
        }
    });
    let pid = child.id().expect("spawned process has id") as i32;
    let bubblewrap = prepared.support.backend == Backend::Bubblewrap;
    let mut report = Vec::new();
    let mut observation = None;
    let stopped = loop {
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => break Some(StopReason::Requested),
            _ = stop.cancelled() => break Some(StopReason::Requested),
            _ = tokio::time::sleep_until(prepared.valid_until.into()) => {
                break Some(StopReason::Deadline)
            }
            Some(()) = interrupts.recv() => {
                send_control(&control, CONTROL_INTERRUPT).await;
            }
            _ = read_report(&mut status, &mut report) => break None,
            result = process::wait_without_reaping(pid, LAUNCHER_POLL) => {
                observation = Some(result);
                break None;
            }
        }
    };
    // The helper ends the payload and its own group first, then reports.
    // Only then is the launcher group signalled, which on macOS ends the
    // helper. On Linux the helper exits after its report, ending the PID
    // namespace before the launcher exits on its own.
    let mut launcher_exited = matches!(observation, Some(Ok(())));
    if observation.is_none() {
        if stopped.is_some() {
            send_control(&control, CONTROL_STOP).await;
        }
        launcher_exited = tokio::time::timeout(STOP_GRACE, async {
            read_report(&mut status, &mut report).await;
            bubblewrap
                && process::wait_without_reaping(pid, process::EXIT_POLL)
                    .await
                    .is_ok()
        })
        .await
        .unwrap_or(false);
        if launcher_exited {
            observation = Some(Ok(()));
        }
    }
    input_task.abort();
    let process_group_signalled = match observation {
        Some(Err(_)) => false,
        _ => process::signal_process_group(pid).is_ok(),
    };
    let mut control = control;
    let _ = control.shutdown().await;
    let reaped = tokio::time::timeout(REAP_GRACE, child.wait())
        .await
        .is_ok_and(|result| result.is_ok());
    let _ = tokio::time::timeout(DRAIN_GRACE, read_report(&mut status, &mut report)).await;
    let mut outputs_complete = true;
    let drained = tokio::time::timeout(DRAIN_GRACE, async {
        for task in &mut output_tasks {
            if !matches!(task.await, Ok(true)) {
                outputs_complete = false;
            }
        }
    })
    .await
    .is_ok();
    if !drained {
        outputs_complete = false;
        for task in &output_tasks {
            task.abort();
        }
    }
    let (completion, group_ended) = parse_report(&report);
    let descendants = match (completion, prepared.support.backend) {
        (Completion::SetupFailed, _) if reaped => Descendants::NoPayload,
        (_, Backend::Seatbelt) if group_ended && process_group_signalled && reaped => {
            Descendants::ProcessGroupSignalled
        }
        (Completion::Exited(_) | Completion::Signaled(_), Backend::Bubblewrap)
            if launcher_exited && reaped =>
        {
            Descendants::NamespaceEnded
        }
        _ => Descendants::Unverified,
    };
    prepared.placeholders.release(matches!(
        descendants,
        Descendants::NoPayload | Descendants::NamespaceEnded
    ));
    let temporary_removed = prepared.temporary.close().is_ok();
    shared.end();
    ProcessEvidence {
        support: prepared.support,
        completion,
        stopped,
        stdout: Vec::new(),
        stderr: Vec::new(),
        output_truncated: !outputs_complete,
        descendants,
        temporary_removed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retained_output_keeps_the_head_and_a_rolling_tail() {
        let mut retained = Retained::new(8);
        retained.push(b"abc");
        assert_eq!(
            retained.take(100),
            Taken {
                output: b"abc".to_vec(),
                omitted: 0,
                omitted_at: None
            }
        );
        // Each read starts a fresh head.
        retained.push(b"0123");
        retained.push(b"456789");
        retained.push(b"xy");
        assert_eq!(
            retained.take(100),
            Taken {
                output: b"012389xy".to_vec(),
                omitted: 4,
                omitted_at: Some(4)
            }
        );
        assert!(retained.is_empty());
        assert_eq!(
            retained.take(100),
            Taken {
                output: vec![],
                omitted: 0,
                omitted_at: None
            }
        );
        // One push larger than the tail keeps only its last bytes.
        retained.push(b"ABCDEFGHIJKLMNOP");
        assert_eq!(
            retained.take(100),
            Taken {
                output: b"ABCDMNOP".to_vec(),
                omitted: 8,
                omitted_at: Some(4)
            }
        );
    }

    #[test]
    fn a_short_read_elides_one_middle_span_around_earlier_drops() {
        let mut retained = Retained::new(8);
        retained.push(b"0123456789");
        // Retained "0123" + dropped 2 + "6789"; a four byte read keeps the
        // ends and counts everything between them.
        assert_eq!(
            retained.take(4),
            Taken {
                output: b"0189".to_vec(),
                omitted: 6,
                omitted_at: Some(2)
            }
        );
        // A read refills the head before the tail.
        let mut retained = Retained::new(8);
        retained.push(b"a");
        let first = retained.take(100);
        assert_eq!(first.output, b"a");
        retained.push(b"b");
        retained.push(b"cdefgh");
        assert_eq!(
            retained.take(3),
            Taken {
                output: b"bgh".to_vec(),
                omitted: 4,
                omitted_at: Some(1)
            }
        );
        // A short tail leaves more room for the head.
        let mut retained = Retained::new(8);
        retained.push(b"abcde");
        assert_eq!(
            retained.take(4),
            Taken {
                output: b"abce".to_vec(),
                omitted: 1,
                omitted_at: Some(3)
            }
        );
        let mut retained = Retained::new(8);
        retained.push(b"abc");
        assert_eq!(
            retained.take(0),
            Taken {
                output: vec![],
                omitted: 3,
                omitted_at: Some(0)
            }
        );
    }

    #[test]
    fn the_report_needs_the_group_confirmation_to_vouch_for_cleanup() {
        assert_eq!(
            parse_report(b"RE\0\0\0\x07K"),
            (Completion::Exited(7), true)
        );
        assert_eq!(
            parse_report(b"RS\0\0\0\x09"),
            (Completion::Signaled(9), false)
        );
        assert_eq!(parse_report(b"RE\0\0\0\0X"), (Completion::Uncertain, false));
        assert_eq!(parse_report(b"F"), (Completion::SetupFailed, false));
        assert_eq!(parse_report(b"R"), (Completion::Uncertain, false));
        assert_eq!(parse_report(b"E\0\0\0\0K"), (Completion::Uncertain, false));
    }
}
