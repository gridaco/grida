//! A trusted, read-only, locally supervised ACP turn driver.
//!
//! GRIDA-SEC-004: the foreign peer receives only bounded stdio and an explicit
//! no-network sandbox scope. No request from the peer expands that scope.

use super::transport::{self, Delivery};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::v1::schema::{
    CancelNotification, ContentBlock, InitializeRequest, NewSessionRequest, PromptRequest,
    RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SessionId as PeerSession, SessionNotification, SessionUpdate, StopReason, TextContent,
};
use agent_client_protocol::{
    Channel, Client, Error as WireError, on_receive_notification, on_receive_request,
};
use agent_kit_core::authority::{AuthorityRequest, AuthorityValidator};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{
    CommitReceipt, ControlRevision, JournalAction, JournalChange, TurnLease, TurnOutcome, TurnState,
};
use agent_kit_core::{
    BoxFuture, CancellationToken, ChangeId, Envelope, Error, ErrorKind, Fingerprint, MessageId,
    OperationId, Result, SchemaId,
};
use agent_kit_sandbox::{
    Completion, Descendants, ExecutionScope, PreparedProcess, ProcessEvidence, ProcessSpec,
    Sandbox, TrustedExecutable,
};
use agent_kit_sessions::{ClaimedTurn, DriverOutcome, Submission, TurnDriver};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncWriteExt, DuplexStream};
use uuid::Uuid;

const PROFILE: &str = "grida.external-acp.profile";
const INPUT: &str = "grida.external-acp.input";
const DISPATCH: &str = "grida.external-acp.dispatch";
const ACCOUNT: &str = "grida.external-acp.account";
const MAX_TEXT_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
const CLOSE_GRACE: Duration = Duration::from_secs(1);

/// Selected only by a trusted embedding. The caller owns read/runtime grants.
pub struct ExternalAcpLaunch {
    pub executable: TrustedExecutable,
    pub arguments: Vec<String>,
    pub cwd: PathBuf,
    pub scope: ExecutionScope,
    pub timeout: Duration,
}

/// Drives one text request per owned stdio process. It never sends retained
/// work again and does not attach to an existing foreign session.
#[derive(Clone)]
pub struct ExternalAcpDriver(Arc<Driver>);

struct Driver {
    sandbox: Arc<Sandbox>,
    launch: ExternalAcpLaunch,
    authority: Arc<dyn AuthorityValidator>,
    configuration: Envelope,
}

#[derive(Deserialize, Serialize)]
struct Dispatch {
    action: Fingerprint,
    input: ChangeId,
}

#[derive(Serialize)]
struct Account<'a> {
    code: &'static str,
    peer_session: Option<&'a str>,
    peer_stop: Option<StopReason>,
    response_truncated: bool,
    cleanup_verified: bool,
}

impl ExternalAcpDriver {
    pub fn new(
        sandbox: Arc<Sandbox>,
        launch: ExternalAcpLaunch,
        authority: Arc<dyn AuthorityValidator>,
    ) -> Result<Self> {
        if !launch.scope.write.is_empty() {
            return Err(problem(
                ErrorKind::InvalidInput,
                "external_acp_read_only_required",
            ));
        }
        let configuration = profile(&prepare(&sandbox, &launch)?, &launch)?;
        Ok(Self(Arc::new(Driver {
            sandbox,
            launch,
            authority,
            configuration,
        })))
    }

    /// Bind a new local session to this exact selected profile.
    pub fn configuration(&self) -> Envelope {
        self.0.configuration.clone()
    }

    pub fn submission(id: ChangeId, prompt: &str) -> Result<Submission> {
        validate_prompt(prompt)?;
        Ok(Submission {
            id,
            payload: encode(INPUT, &prompt)?,
        })
    }
}

impl TurnDriver for ExternalAcpDriver {
    fn run(&self, claim: ClaimedTurn) -> BoxFuture<'static, Result<DriverOutcome>> {
        let driver = self.0.clone();
        Box::pin(async move {
            // The worker retains the lease and process until cleanup even if
            // its caller no longer awaits the result.
            tokio::runtime::Handle::try_current()
                .map_err(|_| {
                    problem(
                        ErrorKind::InvalidState,
                        "external_acp_async_runtime_required",
                    )
                })?
                .spawn(async move { driver.run(claim).await })
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "external_acp_worker_lost"))?
        })
    }
}

impl Driver {
    async fn run(&self, claim: ClaimedTurn) -> Result<DriverOutcome> {
        let [input] = claim.inputs.as_slice() else {
            return Err(problem(
                ErrorKind::InvalidInput,
                "external_acp_one_input_required",
            ));
        };
        let prompt: String = decode(INPUT, &input.payload)?;
        validate_prompt(&prompt)?;
        let lease = claim.lease;
        let binding = lease.binding();
        let configuration: Fingerprint = decode(PROFILE, &claim.configuration)?;
        let action = Fingerprint::of(&(
            configuration,
            &binding.session,
            &binding.turn,
            &input.id,
            &input.payload,
        ))?;
        let state = lease.journal().load().await?;
        if let Some(checkpoint) = state.checkpoint() {
            let started: Dispatch = decode(DISPATCH, checkpoint)?;
            if started.action != action || started.input != input.id {
                return Err(problem(
                    ErrorKind::Conflict,
                    "external_acp_dispatch_mismatch",
                ));
            }
            return settle(
                &lease,
                OutcomeStatus::Uncertain,
                "external_acp_previous_dispatch_unconfirmed",
                &Transcript::default(),
                false,
            )
            .await;
        }
        if !state.controls().admits_work() {
            return before_launch_control(&lease, &state).await;
        }
        if claim.configuration != self.configuration {
            return Err(problem(ErrorKind::Conflict, "external_acp_profile_changed"));
        }
        let prepared = prepare(&self.sandbox, &self.launch)?;
        if profile(&prepared, &self.launch)? != self.configuration {
            return Err(problem(ErrorKind::Conflict, "external_acp_profile_changed"));
        }
        let request = AuthorityRequest {
            operation: OperationId::new(binding.turn.as_str())?,
            action,
            selection: self.launch.scope.grants.clone(),
        };
        let deadline = (Instant::now() + self.launch.timeout).min(self.launch.scope.valid_until);
        let initial_control = state.controls().revision;
        tokio::select! {
            biased;
            changed = interrupted(&lease, initial_control) => {
                changed?;
                return before_launch_control(&lease, &lease.journal().load().await?).await;
            }
            authorization = tokio::time::timeout_at(deadline.into(), self.authority.validate(request.clone())) => {
                if !matches!(authorization, Ok(Ok(()))) {
                    return settle(&lease, OutcomeStatus::Failed, "external_acp_admission_refused", &Transcript::default(), true).await;
                }
            }
        }
        let started = encode(
            DISPATCH,
            &Dispatch {
                action,
                input: input.id.clone(),
            },
        )?;
        let started = commit(
            &lease,
            &state,
            vec![
                JournalAction::SetCheckpoint(started),
                JournalAction::AppendHistory(vec![message(
                    Role::User,
                    prompt.clone(),
                    ProvenanceKind::Supplied,
                    Some(action),
                )?]),
            ],
        )
        .await;
        if started
            .as_ref()
            .is_err_and(|error| error.kind == ErrorKind::Conflict)
        {
            let current = lease.journal().load().await?;
            if current
                .controls()
                .interruption
                .is_some_and(|last| last.revision > initial_control)
                && current.checkpoint().is_none()
            {
                return before_launch_control(&lease, &current).await;
            }
        }
        started?;

        // The checkpoint records possible handoff before any external code
        // can start. Exact control changes since admission also close launch.
        let controls = lease.controls().read().await?;
        if !controls.admits_work() || controls.revision != initial_control {
            return settle(
                &lease,
                OutcomeStatus::Cancelled,
                "external_acp_admission_closed",
                &Transcript::default(),
                true,
            )
            .await;
        }
        let (running, stream) =
            match prepared.spawn_streaming(&self.launch.executable, CancellationToken::new()) {
                Ok(value) => value,
                Err(error) => {
                    let uncertain = error.kind == ErrorKind::Uncertain;
                    return settle(
                        &lease,
                        if uncertain {
                            OutcomeStatus::Uncertain
                        } else {
                            OutcomeStatus::Failed
                        },
                        if uncertain {
                            "external_acp_launch_unconfirmed"
                        } else {
                            "external_acp_launch_refused"
                        },
                        &Transcript::default(),
                        !uncertain,
                    )
                    .await;
                }
            };
        let (transcript, closed) = peer(
            stream,
            &lease,
            initial_control,
            self,
            request,
            prompt,
            deadline,
        )
        .await;
        if !closed {
            running.request_stop();
        }
        let evidence = running.finish().await;
        let verified = evidence.as_ref().is_ok_and(cleanup_verified);
        let valid_wire = closed
            && evidence
                .as_ref()
                .is_ok_and(|evidence| evidence.stopped.is_none() && !evidence.output_truncated);
        let (status, code) = disposition(&transcript, verified, valid_wire);
        settle(&lease, status, code, &transcript, verified).await
    }
}

#[derive(Default)]
struct Transcript {
    session: Option<PeerSession>,
    text: String,
    prompt_sent: bool,
    interrupted: bool,
    stop: Option<StopReason>,
    truncated: bool,
    wrong_session: bool,
    prompt_refused: bool,
}

async fn peer(
    stream: DuplexStream,
    lease: &TurnLease,
    initial_control: ControlRevision,
    driver: &Driver,
    request: AuthorityRequest,
    prompt: String,
    deadline: Instant,
) -> (Transcript, bool) {
    let transcript = Arc::new(Mutex::new(Transcript::default()));
    let updates = transcript.clone();
    let reported = transcript.clone();
    let delivery = Arc::new(Delivery::new());
    let (sdk, wire) = Channel::duplex();
    let (incoming, outgoing) = wire.into_parts();
    let (read, mut write) = tokio::io::split(stream);
    let result = {
        let wire = async {
            tokio::try_join!(transport::read(read, outgoing, delivery.clone()), async {
                transport::write(&mut write, incoming, delivery.clone()).await?;
                write
                    .shutdown()
                    .await
                    .map_err(|_| wire_failure("external_acp_close_failed"))
            })
        };
        let operation = Client
            .v1()
            .on_receive_request(
                async |_: RequestPermissionRequest, responder, _| {
                    responder.respond(RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled))
                },
                on_receive_request!(),
            )
            .on_receive_notification(
                async move |notification: SessionNotification, _| {
                    let mut updates = updates.lock().unwrap();
                    if let SessionUpdate::AgentMessageChunk(chunk) = notification.update
                        && let ContentBlock::Text(text) = chunk.content
                    {
                        if updates.session.as_ref() != Some(&notification.session_id) || !updates.prompt_sent {
                            updates.wrong_session = true;
                        } else if !updates.truncated {
                            let end = text.text.floor_char_boundary(MAX_TEXT_BYTES - updates.text.len());
                            updates.text.push_str(&text.text[..end]);
                            updates.truncated = end < text.text.len();
                        }
                    }
                    Ok(())
                },
                on_receive_notification!(),
            )
            .connect_with(sdk, async |connection| {
                let session = tokio::select! {
                    biased;
                    changed = interrupted(lease, initial_control) => {
                        changed.map_err(|_| wire_failure("external_acp_control_lost"))?;
                        reported.lock().unwrap().interrupted = true;
                        return Ok(());
                    }
                    initialized = async {
                        let response = connection.send_request(InitializeRequest::new(ProtocolVersion::V1)).block_task().await?;
                        if response.protocol_version != ProtocolVersion::V1 {
                            return Err(wire_failure("external_acp_version_unsupported"));
                        }
                        let response = connection.send_request(NewSessionRequest::new(driver.launch.cwd.clone())).block_task().await?;
                        Ok(response.session_id)
                    } => initialized?,
                };
                if session.0.is_empty() || session.0.len() > 256 || session.0.chars().any(char::is_control) {
                    return Err(wire_failure("external_acp_session_invalid"));
                }
                reported.lock().unwrap().session = Some(session.clone());
                tokio::select! {
                    biased;
                    changed = interrupted(lease, initial_control) => {
                        changed.map_err(|_| wire_failure("external_acp_control_lost"))?;
                        reported.lock().unwrap().interrupted = true;
                        return Ok(());
                    }
                    granted = driver.authority.validate(request) => {
                        if granted.is_err() {
                            reported.lock().unwrap().prompt_refused = true;
                            return Ok(());
                        }
                    }
                }
                let controls = lease.controls().read().await.map_err(|_| wire_failure("external_acp_control_lost"))?;
                if controls.revision != initial_control || !controls.admits_work() {
                    reported.lock().unwrap().interrupted = true;
                    return Ok(());
                }
                reported.lock().unwrap().prompt_sent = true;
                let response = connection.send_request(PromptRequest::new(session.clone(), vec![ContentBlock::Text(TextContent::new(prompt))])).block_task();
                tokio::pin!(response);
                let response = tokio::select! {
                    biased;
                    changed = interrupted(lease, initial_control) => {
                        changed.map_err(|_| wire_failure("external_acp_control_lost"))?;
                        reported.lock().unwrap().interrupted = true;
                        connection.send_notification(CancelNotification::new(session))?;
                        tokio::time::timeout(CLOSE_GRACE, &mut response).await
                            .map_err(|_| wire_failure("external_acp_cancel_unconfirmed"))??
                    }
                    response = &mut response => response?,
                };
                reported.lock().unwrap().stop = Some(response.stop_reason);
                Ok(())
            });
        tokio::pin!(wire, operation);
        tokio::time::timeout_at(deadline.into(), async {
            tokio::select! {
                result = &mut operation => {
                    let drain = tokio::time::timeout(CLOSE_GRACE, &mut wire).await;
                    result.is_ok() && matches!(drain, Ok(Ok(_)))
                }
                result = &mut wire => result.is_ok() && operation.await.is_ok(),
            }
        })
        .await
        .unwrap_or(false)
    };
    let transcript = std::mem::take(&mut *transcript.lock().unwrap());
    (transcript, result)
}

fn disposition(
    transcript: &Transcript,
    verified: bool,
    valid_wire: bool,
) -> (OutcomeStatus, &'static str) {
    if !verified || transcript.wrong_session {
        return (OutcomeStatus::Uncertain, "external_acp_evidence_unverified");
    }
    if transcript.prompt_sent && !valid_wire {
        return (OutcomeStatus::Uncertain, "external_acp_receipt_unconfirmed");
    }
    if transcript.prompt_refused {
        return (OutcomeStatus::Failed, "external_acp_prompt_refused");
    }
    match (
        transcript.prompt_sent,
        transcript.interrupted,
        transcript.stop,
    ) {
        (true, _, Some(StopReason::Cancelled)) => {
            (OutcomeStatus::Cancelled, "external_acp_cancelled")
        }
        (true, false, Some(StopReason::EndTurn)) => {
            (OutcomeStatus::Succeeded, "external_acp_completed")
        }
        (true, false, Some(StopReason::Refusal)) => (OutcomeStatus::Failed, "external_acp_refused"),
        (true, false, Some(StopReason::MaxTokens | StopReason::MaxTurnRequests)) => {
            (OutcomeStatus::Failed, "external_acp_limit")
        }
        (false, true, _) => (
            OutcomeStatus::Cancelled,
            "external_acp_cancelled_before_prompt",
        ),
        (false, false, _) => (OutcomeStatus::Failed, "external_acp_no_prompt"),
        _ => (OutcomeStatus::Uncertain, "external_acp_receipt_unconfirmed"),
    }
}

fn cleanup_verified(evidence: &ProcessEvidence) -> bool {
    matches!(
        evidence.completion,
        Completion::Exited(_) | Completion::Signaled(_) | Completion::SetupFailed
    ) && evidence.descendants != Descendants::Unverified
        && evidence.temporary_removed
}

async fn before_launch_control(lease: &TurnLease, state: &TurnState) -> Result<DriverOutcome> {
    if !state.controls().cancelled {
        return match commit(lease, state, vec![JournalAction::Suspend]).await? {
            CommitReceipt::Suspended(receipt) => Ok(DriverOutcome::Suspended(receipt)),
            _ => Err(problem(
                ErrorKind::Uncertain,
                "external_acp_suspension_unconfirmed",
            )),
        };
    }
    settle(
        lease,
        OutcomeStatus::Cancelled,
        "external_acp_admission_closed",
        &Transcript::default(),
        true,
    )
    .await
}

async fn interrupted(lease: &TurnLease, admitted: ControlRevision) -> Result<()> {
    let mut revision = admitted;
    loop {
        let state = lease.controls().changed(revision).await?;
        if !state.admits_work()
            || state
                .interruption
                .is_some_and(|last| last.revision > admitted)
        {
            return Ok(());
        }
        revision = state.revision;
    }
}

async fn settle(
    lease: &TurnLease,
    status: OutcomeStatus,
    code: &'static str,
    transcript: &Transcript,
    cleanup_verified: bool,
) -> Result<DriverOutcome> {
    let account = encode(
        ACCOUNT,
        &Account {
            code,
            peer_session: transcript
                .session
                .as_ref()
                .map(|session| session.0.as_ref()),
            peer_stop: transcript.stop,
            response_truncated: transcript.truncated,
            cleanup_verified,
        },
    )?;
    let history = (!transcript.text.is_empty())
        .then(|| {
            message(
                Role::Assistant,
                transcript.text.clone(),
                ProvenanceKind::Observed,
                None,
            )
        })
        .transpose()?;
    for _ in 0..4 {
        let state = lease.journal().load().await?;
        let mut actions = Vec::with_capacity(2);
        if let Some(history) = &history {
            actions.push(JournalAction::AppendHistory(vec![history.clone()]));
        }
        actions.push(JournalAction::Settle(TurnOutcome {
            status,
            account: Some(account.clone()),
            evidence: vec![],
        }));
        match commit(lease, &state, actions).await {
            Ok(CommitReceipt::Settled(receipt)) => return Ok(DriverOutcome::Settled(receipt)),
            Ok(_) => break,
            Err(error) if error.kind == ErrorKind::Conflict => continue,
            Err(error) => return Err(error),
        }
    }
    Err(problem(
        ErrorKind::Uncertain,
        "external_acp_settlement_unconfirmed",
    ))
}

async fn commit(
    lease: &TurnLease,
    state: &TurnState,
    actions: Vec<JournalAction>,
) -> Result<CommitReceipt> {
    let id = ChangeId::new(Uuid::new_v4().to_string())?;
    let change = JournalChange::new(
        id.clone(),
        lease.binding().clone(),
        state.position(),
        state.controls().revision,
        actions,
    )?;
    match lease.journal().commit(change).await {
        Err(error) if error.kind == ErrorKind::Uncertain => {
            lease.journal().lookup(id).await?.ok_or(error)
        }
        result => result,
    }
}

fn prepare(sandbox: &Sandbox, launch: &ExternalAcpLaunch) -> Result<PreparedProcess> {
    sandbox.prepare(
        ProcessSpec {
            executable: launch.executable.path.clone(),
            arguments: launch.arguments.clone(),
            cwd: launch.cwd.clone(),
            environment: Default::default(),
            stdin: vec![],
            timeout: launch.timeout,
            max_output_bytes: MAX_OUTPUT_BYTES,
        },
        launch.scope.clone(),
    )
}

fn profile(prepared: &PreparedProcess, launch: &ExternalAcpLaunch) -> Result<Envelope> {
    prepared.verify_executable(&launch.executable)?;
    encode(
        PROFILE,
        &Fingerprint::of(&(
            prepared.capture_fingerprint()?,
            launch.executable.sha256,
            launch.timeout,
        ))?,
    )
}

fn message(
    role: Role,
    text: String,
    kind: ProvenanceKind,
    fingerprint: Option<Fingerprint>,
) -> Result<HistoryRecord> {
    Ok(HistoryRecord::Message(Message {
        id: MessageId::new(Uuid::new_v4().to_string())?,
        role,
        phase: None,
        content: vec![Content::Text(text)],
        provenance: Provenance {
            source: "external-acp".into(),
            kind,
            fingerprint,
        },
    }))
}

fn validate_prompt(prompt: &str) -> Result<()> {
    if prompt.trim().is_empty() || prompt.len() > MAX_TEXT_BYTES {
        return Err(problem(
            ErrorKind::InvalidInput,
            "external_acp_prompt_invalid",
        ));
    }
    Ok(())
}

fn encode<T: Serialize>(schema: &str, value: &T) -> Result<Envelope> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| problem(ErrorKind::InvalidInput, "external_acp_capture_invalid"))?;
    Envelope::new(SchemaId::new(schema)?, 1, bytes)
}

fn decode<T: for<'de> Deserialize<'de>>(schema: &str, value: &Envelope) -> Result<T> {
    if value.schema().as_str() != schema || value.version() != 1 {
        return Err(problem(
            ErrorKind::InvalidInput,
            "external_acp_capture_schema",
        ));
    }
    serde_json::from_slice(value.bytes())
        .map_err(|_| problem(ErrorKind::InvalidInput, "external_acp_capture_invalid"))
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}

fn wire_failure(code: &'static str) -> WireError {
    WireError::new(-32603, code)
}
