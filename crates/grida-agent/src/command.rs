//! Reviewed finite commands and host-owned process cleanup.
//!
//! The model's commands run as chat-owned sessions; see [`crate::processes`].
//! This supervisor runs the host's own reviewed checks (hooks) under the same
//! native sandbox and cleanup barrier.

use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::{Invocation, InvocationContext, ToolOutcome};
use agent_kit_core::{
    AttemptId, CancellationToken, Envelope, Error, ErrorKind, OperationId, Result, SchemaId,
};
use agent_kit_sandbox::{
    Backend, Completion, Descendants, ExecutionScope, PreparedProcess, ProcessEvidence,
    ProcessSpec, RunningProcess, Sandbox, StopReason, Termination, TrustedExecutable,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Component, Path};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{Notify, oneshot};

const MAX_ACTIVE: usize = 4;
const MAX_RETAINED: usize = 16;

/// Fixed command constraints chosen by the host. `timeout` bounds reviewed
/// checks; input and output bound each model command call.
#[derive(Clone, Copy, Debug)]
pub struct CommandLimits {
    pub timeout: Duration,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandIdentity {
    pub operation: OperationId,
    pub attempt: AttemptId,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct CommandQuiescence {
    /// Supervisors still preparing, running, or cleaning up.
    pub pending: Vec<CommandIdentity>,
    /// Completed supervisors whose native cleanup evidence is incomplete.
    pub unverified: Vec<CommandIdentity>,
}

impl CommandQuiescence {
    pub fn is_verified(&self) -> bool {
        self.pending.is_empty() && self.unverified.is_empty()
    }
}

/// A host-owned finite command supervisor for reviewed checks.
///
/// Keep this handle and its Tokio runtime alive through `stop_and_wait` before
/// releasing resources that depend on native cleanup. The runtime can settle an
/// invocation as uncertain before the supervisor finishes.
// GRIDA-SEC-004: finite command authority and cleanup stay with the host.
pub struct CommandSupervisor {
    sandbox: Arc<Sandbox>,
    activity: Arc<Activity>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandAccess {
    Read,
    ReadWrite,
}

pub(crate) type SpawnCommand =
    dyn Fn(PreparedProcess, CancellationToken) -> Result<RunningProcess> + Send + Sync;

pub(crate) struct ReviewedCommand {
    pub spec: ProcessSpec,
    pub scope: ExecutionScope,
    pub executable: TrustedExecutable,
    pub spawn: Arc<SpawnCommand>,
}

impl CommandSupervisor {
    /// The host must probe native support before running reviewed checks.
    pub fn new(sandbox: Arc<Sandbox>) -> Self {
        Self {
            sandbox,
            activity: Arc::default(),
        }
    }

    pub(crate) async fn invoke_reviewed(
        &self,
        invocation: &Invocation,
        context: InvocationContext,
        command: ReviewedCommand,
        project: fn(ProcessEvidence, usize) -> (ToolOutcome, bool),
    ) -> ToolOutcome {
        let ReviewedCommand {
            spec,
            mut scope,
            executable,
            spawn,
        } = command;
        let now = Instant::now();
        scope.valid_until = scope.valid_until.min(now + spec.timeout);
        if let Some(deadline) = context.deadline {
            scope.valid_until = scope.valid_until.min(deadline);
        }
        if context.cancellation.is_cancelled() || scope.valid_until <= now {
            return cancelled_before_launch();
        }
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return ToolOutcome::failed("command_runtime_unavailable");
        };
        let cancellation = context.cancellation.child_token();
        let _request_stop_on_drop = cancellation.clone().drop_guard();
        let identity = CommandIdentity {
            operation: invocation.id().clone(),
            attempt: context.attempt,
        };
        if let Err(error) = self
            .activity
            .register(identity.clone(), cancellation.clone())
        {
            return ToolOutcome::failed(&error.code);
        }
        let (send, receive) = oneshot::channel();
        let sandbox = Arc::clone(&self.sandbox);
        let activity = Arc::clone(&self.activity);
        runtime.spawn(async move {
            let (outcome, verified) = execute(
                sandbox,
                spec,
                scope,
                (executable, spawn),
                cancellation,
                project,
            )
            .await;
            activity.finish(&identity.operation, verified);
            let _ = send.send(outcome);
        });
        receive.await.unwrap_or_else(|_| ToolOutcome::uncertain())
    }

    /// Close admission, request stop, and await cleanup.
    ///
    /// A deadline leaves the supervisors owned by this capability. A later
    /// call can wait again. Unverified evidence stays visible after completion.
    /// Verification follows the scope's declared backend guarantee.
    pub async fn stop_and_wait(&self, deadline: Instant) -> CommandQuiescence {
        self.activity.close();
        loop {
            // notify_waiters wakes a Notified created before the state check.
            let changed = self.activity.changed.notified();
            let state = self.activity.quiescence();
            if state.pending.is_empty() {
                return state;
            }
            if tokio::time::timeout_at(deadline.into(), changed)
                .await
                .is_err()
            {
                return self.activity.quiescence();
            }
        }
    }
}

impl Drop for CommandSupervisor {
    fn drop(&mut self) {
        self.activity.close();
    }
}

/// An absolute path with no parent components or NUL.
pub(crate) fn valid_path(path: &Path) -> bool {
    path.is_absolute()
        && path.to_str().is_some_and(|value| !value.contains('\0'))
        && !path.components().any(|part| part == Component::ParentDir)
}

/// Whether native cleanup evidence establishes that the launch ended.
pub(crate) fn cleanup_verified(evidence: &ProcessEvidence) -> bool {
    evidence.temporary_removed
        && match evidence.descendants {
            Descendants::NoPayload | Descendants::NamespaceEnded => true,
            Descendants::ProcessGroupSignalled => {
                evidence.support.termination == Termination::ProcessGroup
            }
            Descendants::Unverified => false,
        }
}

#[derive(Default)]
struct Activity {
    state: Mutex<ActivityState>,
    changed: Notify,
}

#[derive(Default)]
struct ActivityState {
    closed: bool,
    jobs: BTreeMap<OperationId, Job>,
}

struct Job {
    identity: CommandIdentity,
    state: JobState,
}

enum JobState {
    Active(CancellationToken),
    Finished {
        verified: bool,
        finished_at: Instant,
    },
}

impl Activity {
    fn register(&self, identity: CommandIdentity, cancellation: CancellationToken) -> Result<()> {
        let mut state = self.state.lock().expect("command activity lock");
        if state.closed {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "command_admission_closed",
            ));
        }
        if state.jobs.contains_key(&identity.operation) {
            return Err(Error::new(
                ErrorKind::Conflict,
                "command_operation_already_registered",
            ));
        }
        if state
            .jobs
            .values()
            .filter(|job| matches!(job.state, JobState::Active(_)))
            .count()
            >= MAX_ACTIVE
        {
            return Err(Error::new(
                ErrorKind::LimitExceeded,
                "command_activity_limit",
            ));
        }
        if state.jobs.len() >= MAX_RETAINED {
            let evict = state
                .jobs
                .iter()
                .filter_map(|(id, job)| match job.state {
                    JobState::Finished {
                        verified: true,
                        finished_at,
                    } => Some((finished_at, id)),
                    _ => None,
                })
                .min()
                .map(|(_, id)| id.clone());
            let Some(evict) = evict else {
                return Err(Error::new(
                    ErrorKind::LimitExceeded,
                    "command_unverified_activity_limit",
                ));
            };
            state.jobs.remove(&evict);
        }
        state.jobs.insert(
            identity.operation.clone(),
            Job {
                identity,
                state: JobState::Active(cancellation),
            },
        );
        Ok(())
    }

    fn finish(&self, id: &OperationId, verified: bool) {
        {
            let mut state = self.state.lock().expect("command activity lock");
            let job = state.jobs.get_mut(id).expect("registered command");
            job.state = JobState::Finished {
                verified,
                finished_at: Instant::now(),
            };
        }
        self.changed.notify_waiters();
    }

    fn close(&self) {
        let mut state = self.state.lock().expect("command activity lock");
        state.closed = true;
        for job in state.jobs.values() {
            if let JobState::Active(cancellation) = &job.state {
                cancellation.cancel();
            }
        }
    }

    fn quiescence(&self) -> CommandQuiescence {
        let state = self.state.lock().expect("command activity lock");
        let mut summary = CommandQuiescence::default();
        for job in state.jobs.values() {
            match job.state {
                JobState::Active(_) => summary.pending.push(job.identity.clone()),
                JobState::Finished {
                    verified: false, ..
                } => summary.unverified.push(job.identity.clone()),
                JobState::Finished { verified: true, .. } => {}
            }
        }
        summary
    }
}

async fn execute(
    sandbox: Arc<Sandbox>,
    spec: ProcessSpec,
    scope: ExecutionScope,
    (executable, spawn): (TrustedExecutable, Arc<SpawnCommand>),
    cancellation: CancellationToken,
    project: fn(ProcessEvidence, usize) -> (ToolOutcome, bool),
) -> (ToolOutcome, bool) {
    let maximum = spec.max_output_bytes;
    let stop = cancellation.clone();
    let running = tokio::task::spawn_blocking(move || {
        if stop.is_cancelled() {
            return Ok(None);
        }
        // Native preparation may inspect paths before it decides containment.
        // Its diagnostics must not disclose whether a refused path exists.
        let prepared = sandbox
            .prepare(spec, scope)
            .map_err(|error| Error::new(error.kind, "command_preparation_refused"))?;
        if stop.is_cancelled() {
            return Ok(None);
        }
        prepared.verify_executable(&executable)?;
        spawn(prepared, stop).map(Some)
    })
    .await;
    match running {
        Ok(Ok(Some(running))) => match running.finish().await {
            Ok(evidence) => project(evidence, maximum),
            Err(_) => (ToolOutcome::uncertain(), false),
        },
        Ok(Ok(None)) => (cancelled_before_launch(), true),
        Ok(Err(error)) if error.kind == ErrorKind::Uncertain => (ToolOutcome::uncertain(), false),
        Ok(Err(error)) if error.code == "sandbox_admission_closed" => {
            (cancelled_before_launch(), true)
        }
        Ok(Err(error)) => (ToolOutcome::failed(&error.code), true),
        Err(_) => (ToolOutcome::uncertain(), false),
    }
}

fn cancelled_before_launch() -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Cancelled,
        content: vec![],
        structured: None,
        receipt: None,
        truncated: false,
    }
}

/// The launch's native evidence, the outcome status it supports, and whether
/// cleanup was verified.
pub(crate) fn summarize(evidence: &ProcessEvidence) -> (serde_json::Value, OutcomeStatus, bool) {
    let backend = match evidence.support.backend {
        Backend::Seatbelt => "seatbelt",
        Backend::Bubblewrap => "bubblewrap",
    };
    let descendants = match evidence.descendants {
        Descendants::NoPayload => "no_payload",
        Descendants::ProcessGroupSignalled => "process_group_signalled",
        Descendants::NamespaceEnded => "namespace_ended",
        Descendants::Unverified => "unverified",
    };
    let verified = cleanup_verified(evidence);
    let completion = match evidence.completion {
        Completion::Exited(code) => json!({"kind": "exited", "code": code}),
        Completion::Signaled(signal) => json!({"kind": "signaled", "signal": signal}),
        Completion::SetupFailed => json!({"kind": "setup_failed"}),
        Completion::Uncertain => json!({"kind": "uncertain"}),
    };
    let stop_reason = evidence.stopped.map(|reason| match reason {
        StopReason::Requested => "requested",
        StopReason::Deadline => "deadline",
        StopReason::InputLimit => "input_limit",
        StopReason::OutputLimit => "output_limit",
    });
    let status = match (verified, evidence.completion, evidence.stopped) {
        (false, _, _) | (_, Completion::Uncertain, _) => OutcomeStatus::Uncertain,
        (_, Completion::SetupFailed, _) => OutcomeStatus::Failed,
        (_, Completion::Exited(0), None) => OutcomeStatus::Succeeded,
        (_, _, Some(StopReason::Requested)) => OutcomeStatus::Cancelled,
        _ => OutcomeStatus::Failed,
    };
    let details = json!({
        "backend": backend,
        "completion": completion,
        "stop_reason": stop_reason,
        "descendants": descendants,
        "temporary_removed": evidence.temporary_removed,
        "cleanup_verified": verified,
    });
    (details, status, verified)
}

/// The bounded receipt that records a launch's evidence.
pub(crate) fn receipt(details: &serde_json::Value) -> Envelope {
    Envelope::new(
        SchemaId::new("grida.command.execution").expect("command receipt schema"),
        1,
        serde_json::to_vec(details).expect("command receipt encoding"),
    )
    .expect("bounded command receipt")
}

pub(crate) fn project_process(
    evidence: ProcessEvidence,
    maximum: usize,
    include_streams: bool,
) -> (ToolOutcome, bool) {
    let (mut details, status, verified) = summarize(&evidence);
    let stdout = String::from_utf8_lossy(&evidence.stdout);
    let stderr = String::from_utf8_lossy(&evidence.stderr);
    let mut content = Vec::new();
    if include_streams {
        for (label, stream) in [("stdout", &stdout), ("stderr", &stderr)] {
            if !stream.is_empty() {
                content.push(ResultContent::Text(format!("{label}:\n{stream}")));
            }
        }
    }
    details["output_lossy"] = json!(
        matches!(stdout, std::borrow::Cow::Owned(_))
            || matches!(stderr, std::borrow::Cow::Owned(_))
    );
    details["native_output_truncated"] = json!(evidence.output_truncated);
    let receipt = receipt(&details);
    let outcome = ToolOutcome {
        status,
        content,
        structured: Some(details),
        receipt: Some(receipt),
        truncated: evidence.output_truncated,
    };
    (bound_projection(outcome, maximum), verified)
}

fn bound_projection(mut outcome: ToolOutcome, maximum: usize) -> ToolOutcome {
    let fits = |outcome: &ToolOutcome| {
        serde_json::to_vec(&(&outcome.content, &outcome.structured))
            .is_ok_and(|bytes| bytes.len() <= maximum)
    };
    if fits(&outcome) {
        return outcome;
    }
    let content = std::mem::take(&mut outcome.content);
    outcome.truncated = true;
    if !fits(&outcome) {
        outcome.structured = None;
    }
    for part in content {
        let ResultContent::Text(text) = part else {
            continue;
        };
        let mut low = 0;
        let mut high = text.len();
        while low < high {
            let mid = low + (high - low).div_ceil(2);
            let end = text.floor_char_boundary(mid);
            outcome
                .content
                .push(ResultContent::Text(text[..end].into()));
            if fits(&outcome) {
                low = mid;
            } else {
                high = mid - 1;
            }
            outcome.content.pop();
        }
        let end = text.floor_char_boundary(low);
        if end > 0 {
            outcome
                .content
                .push(ResultContent::Text(text[..end].into()));
        }
    }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_sandbox::Support;

    fn identity(operation: &str) -> CommandIdentity {
        CommandIdentity {
            operation: OperationId::new(operation).unwrap(),
            attempt: AttemptId::new("attempt").unwrap(),
        }
    }

    #[test]
    fn closing_signals_active_jobs_and_retains_unverified_cleanup() {
        let activity = Activity::default();
        let identity = identity("command");
        let cancellation = CancellationToken::new();
        activity
            .register(identity.clone(), cancellation.clone())
            .unwrap();
        activity.close();
        assert!(cancellation.is_cancelled());
        assert_eq!(
            activity.quiescence().pending,
            std::slice::from_ref(&identity)
        );
        activity.finish(&identity.operation, false);
        assert_eq!(
            activity.quiescence().unverified,
            std::slice::from_ref(&identity)
        );
        assert_eq!(
            activity
                .register(identity, CancellationToken::new())
                .unwrap_err()
                .code,
            "command_admission_closed"
        );
    }

    #[test]
    fn lifecycle_evidence_survives_bounded_lossy_output() {
        let evidence = ProcessEvidence {
            support: Support {
                backend: Backend::Seatbelt,
                termination: Termination::ProcessGroup,
            },
            completion: Completion::Exited(0),
            stopped: None,
            stdout: [vec![0xff], "é\n\\".repeat(256).into_bytes()].concat(),
            stderr: vec![],
            output_truncated: false,
            descendants: Descendants::ProcessGroupSignalled,
            temporary_removed: true,
        };
        let (outcome, verified) = project_process(evidence, 512, true);
        assert!(verified);
        assert_eq!(outcome.status, OutcomeStatus::Succeeded);
        assert!(outcome.truncated);
        assert!(
            serde_json::to_vec(&(&outcome.content, &outcome.structured))
                .unwrap()
                .len()
                <= 512
        );
        let details: serde_json::Value =
            serde_json::from_slice(outcome.receipt.unwrap().bytes()).unwrap();
        assert_eq!(details["output_lossy"], true);
        assert_eq!(details["completion"]["kind"], "exited");
        assert!(!outcome.content.is_empty());
    }
}
