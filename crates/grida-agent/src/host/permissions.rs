//! GRIDA-SEC-004 / GRIDA-SEC-014 — Native approval controls and turn-bound tool authority.

use super::*;
use crate::command::CommandTool;
use crate::permissions::{
    ApprovalDecision, ApprovalRequest, PermissionCapture, PermissionProfile, TurnPermissions,
    approval_answer, is_approval, read_approval,
};
use agent_kit_core::ScopeId;
use agent_kit_core::turn::{ControlRevision, TurnState};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub wait_id: agent_kit_core::WaitId,
    pub request: ApprovalRequest,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review_failure: Option<grida_agent_master::approval_review::AskReason>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Approvals {
    pub session_id: SessionId,
    pub turn_id: TurnId,
    pub control_revision: ControlRevision,
    pub approvals: Vec<PendingApproval>,
}

pub(super) struct ToolAuthority {
    base: Arc<ExecutionAuthority>,
    permissions: Option<Arc<TurnPermissions>>,
    attachments: AttachmentTools,
    wakeups: Option<Arc<wakeups::WakeupAccess>>,
    completion: Option<Arc<completion_checks::CompletionAccess>>,
    host_tools: Vec<Arc<host_tools::TurnTools>>,
    delegation: Option<Arc<sponsorship::DelegationAccess>>,
}

pub(super) struct AttachmentTools {
    pub(super) image: Option<Arc<image_tools::TurnImage>>,
    pub(super) file: Option<Arc<retained_file::TurnFile>>,
}

impl ToolAuthority {
    pub(super) fn bind(
        base: Arc<ExecutionAuthority>,
        permissions: Option<Arc<TurnPermissions>>,
        attachments: AttachmentTools,
        wakeups: Option<Arc<wakeups::WakeupAccess>>,
        completion: Option<Arc<completion_checks::CompletionAccess>>,
        host_tools: Vec<Arc<host_tools::TurnTools>>,
        delegation: Option<Arc<sponsorship::DelegationAccess>>,
    ) -> Option<Arc<Self>> {
        if permissions.is_none()
            && attachments.image.is_none()
            && attachments.file.is_none()
            && wakeups.is_none()
            && completion.is_none()
            && host_tools.is_empty()
            && delegation.is_none()
        {
            return None;
        }
        Some(Arc::new(Self {
            base,
            permissions,
            attachments,
            wakeups,
            completion,
            host_tools,
            delegation,
        }))
    }
}

impl AuthorityValidator for ToolAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        if self
            .delegation
            .as_ref()
            .is_some_and(|scope| scope.accepts(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if self
            .completion
            .as_ref()
            .is_some_and(|scope| scope.handles(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if self
            .wakeups
            .as_ref()
            .is_some_and(|scope| scope.accepts(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if let Some(image) = self
            .attachments
            .image
            .as_ref()
            .filter(|image| image.handles(&request.selection))
        {
            return image.validate(request);
        }
        if self
            .attachments
            .file
            .as_ref()
            .is_some_and(|file| file.handles(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if let Some(permissions) = self
            .permissions
            .as_ref()
            .filter(|scope| scope.handles(&request.selection))
        {
            return permissions.validate(request);
        }
        if let Some(host_tools) = self
            .host_tools
            .iter()
            .find(|scope| scope.handles(&request.selection))
        {
            return host_tools.validate(request);
        }
        self.base.validate(request)
    }
}

impl ToolGate for ToolAuthority {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        if let Some(delegation) = self
            .delegation
            .as_ref()
            .filter(|scope| scope.accepts(&admission.grants))
        {
            return delegation.decide(admission, context);
        }
        if let Some(completion) = self
            .completion
            .as_ref()
            .filter(|scope| scope.handles(&admission.grants))
        {
            return completion.decide(admission, context);
        }
        if let Some(wakeups) = self
            .wakeups
            .as_ref()
            .filter(|scope| scope.accepts(&admission.grants))
        {
            return wakeups.decide(admission, context);
        }
        if let Some(image) = self
            .attachments
            .image
            .as_ref()
            .filter(|image| image.handles(&admission.grants))
        {
            return image.decide(admission, context);
        }
        if let Some(file) = self
            .attachments
            .file
            .as_ref()
            .filter(|file| file.handles(&admission.grants))
        {
            return file.decide(admission, context);
        }
        if let Some(permissions) = self
            .permissions
            .as_ref()
            .filter(|scope| scope.handles(&admission.grants))
        {
            return permissions.decide(admission, context);
        }
        if let Some(host_tools) = self
            .host_tools
            .iter()
            .find(|scope| scope.handles(&admission.grants))
        {
            return host_tools.decide(admission, context);
        }
        self.base.decide(admission, context)
    }
}

impl Host {
    /// Add the explicitly selected native profile before accepting work.
    pub fn with_permission_profile(mut self, profile: Arc<PermissionProfile>) -> Self {
        self.permissions = Some(profile);
        self
    }

    pub(super) fn capture_permissions(
        &self,
        session: &SessionView,
        input: &ChangeId,
    ) -> Result<Option<PermissionCapture>> {
        let Some(profile) = &self.permissions else {
            return Ok(None);
        };
        if !profile.matches_primary(&session_configuration(session)?.cwd) {
            return Ok(None);
        }
        Ok(Some(profile.capture(ScopeId::new(input.as_str())?)))
    }

    pub(super) fn bind_permissions(
        &self,
        capture: &PermissionCapture,
        binding: agent_kit_core::turn::TurnBinding,
    ) -> Result<Arc<TurnPermissions>> {
        let profile = self
            .permissions
            .as_ref()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "permission_profile_unavailable"))?;
        profile.bind(capture, binding, self.store.clone(), true)
    }

    pub async fn approvals(&self, session: SessionId, turn: TurnId) -> Result<Approvals> {
        self.store
            .inspect_turn_with(session, turn, pending_approvals)
            .await
    }

    /// The transport must authenticate the private reviewer before calling this
    /// method. The durable reply uses the exact recorded request and revisions.
    pub async fn answer_approval(
        &self,
        control: TurnControl,
        wait_id: agent_kit_core::WaitId,
        decision: ApprovalDecision,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let (answer, can_wake) = host
                .store
                .inspect_turn_with(control.session.clone(), control.turn.clone(), {
                    let wait_id = wait_id.clone();
                    move |state| {
                        let wait = state
                            .waits()
                            .get(&wait_id)
                            .filter(|wait| is_approval(wait))
                            .ok_or_else(|| {
                                problem(ErrorKind::Unavailable, "approval_unavailable")
                            })?;
                        let request = read_approval(wait)?;
                        if request.session != state.binding().session
                            || request.turn != state.binding().turn
                        {
                            return Err(problem(
                                ErrorKind::InvalidState,
                                "approval_binding_changed",
                            ));
                        }
                        Ok((
                            approval_answer(wait, decision)?,
                            state.outcome().is_none()
                                && state.controls().admits_work()
                                && state
                                    .waits()
                                    .values()
                                    .all(|other| other.id == wait_id || !other.is_pending()),
                        ))
                    }
                })
                .await?;
            let action = SessionControl::Resolve {
                turn: control.turn.clone(),
                expected: control.expected_control,
                wait: wait_id,
                answer,
            };
            host.resolve_interaction(control, action, can_wake, None)
                .await
        })
        .await
    }
}

pub(super) fn pending_approvals(state: &TurnState) -> Result<Approvals> {
    let approvals = state
        .waits()
        .values()
        .filter(|wait| wait.is_pending() && is_approval(wait))
        .map(|wait| {
            let request = read_approval(wait)?;
            if request.session != state.binding().session || request.turn != state.binding().turn {
                return Err(problem(ErrorKind::InvalidState, "approval_binding_changed"));
            }
            Ok(PendingApproval {
                wait_id: wait.id.clone(),
                review_failure: grida_agent_master::approval_review::recorded_failure(
                    state,
                    &request.operation,
                    request.action,
                    request.scope,
                )?,
                request,
            })
        })
        .collect::<Result<_>>()?;
    Ok(Approvals {
        session_id: state.binding().session.clone(),
        turn_id: state.binding().turn.clone(),
        control_revision: state.controls().revision,
        approvals,
    })
}

const CLEANUP_WAIT: Duration = Duration::from_secs(3);

/// The Host work registration remains held across this barrier. A timeout is
/// delivered immediately, while the supervisor stays owned until its pending
/// work drains or the entire host enters bounded shutdown.
pub(super) async fn finish_commands(
    command: Arc<CommandTool>,
    completion: &mut Option<oneshot::Sender<Result<RunResult>>>,
) -> Result<()> {
    let mut cleanup = command
        .stop_and_wait(std::time::Instant::now() + CLEANUP_WAIT)
        .await;
    if !cleanup.pending.is_empty() {
        let error = problem(ErrorKind::Uncertain, "command_cleanup_pending");
        if let Some(completion) = completion.take() {
            let _ = completion.send(Err(error.clone()));
        }
        while !cleanup.pending.is_empty() {
            cleanup = command
                .stop_and_wait(std::time::Instant::now() + CLEANUP_WAIT)
                .await;
        }
        return Err(error);
    }
    if !cleanup.is_verified() {
        return Err(problem(ErrorKind::Uncertain, "command_cleanup_unverified"));
    }
    Ok(())
}
