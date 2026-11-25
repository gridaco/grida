//! GRIDA-SEC-004 / GRIDA-SEC-014 — Native approval controls and turn-bound tool authority.

use super::*;
use crate::command::CommandSupervisor;
use crate::permissions::{
    ApprovalDecision, ApprovalRequest, PermissionCapture, PermissionProfile, TurnPermissions,
    is_approval, read_approval,
};
use agent_kit_core::ScopeId;
use agent_kit_core::turn::{ControlRevision, TurnState};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub wait_id: agent_kit_core::WaitId,
    pub request: ApprovalRequest,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub reviewing: bool,
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
    material: MaterialTools,
    waits: WaitTools,
    hooks: HookTools,
    host_tools: Vec<Arc<host_tools::TurnTools>>,
    delegation: Option<Arc<sponsorship::DelegationAccess>>,
    workers: Option<Arc<delegation::Access>>,
}

/// Tools that read material the host holds for this turn, each under its own
/// turn-bound grant rather than workspace permissions.
pub(super) struct MaterialTools {
    pub(super) image: Option<Arc<image_tools::TurnImage>>,
    pub(super) file: Option<Arc<retained_file::TurnFile>>,
    pub(super) skills: Option<Arc<bundled_skills::TurnSkills>>,
}

#[derive(Default)]
pub(super) struct WaitTools {
    pub(super) scheduled: Option<Arc<wakeups::WakeupAccess>>,
    pub(super) clock: Option<clock::Access>,
}

pub(super) struct HookTools {
    pub(super) completion: Option<Arc<completion_checks::CompletionAccess>>,
    pub(super) before_tool: Option<Arc<before_tool::BeforeToolCheck>>,
    pub(super) lifecycle: Option<Arc<lifecycle_hooks::LifecycleAccess>>,
}

pub(super) struct DelegationTools {
    pub(super) review: Option<Arc<sponsorship::DelegationAccess>>,
    pub(super) workers: Option<Arc<delegation::Access>>,
}

impl ToolAuthority {
    pub(super) fn bind(
        base: Arc<ExecutionAuthority>,
        permissions: Option<Arc<TurnPermissions>>,
        material: MaterialTools,
        waits: WaitTools,
        hooks: HookTools,
        host_tools: Vec<Arc<host_tools::TurnTools>>,
        delegation: DelegationTools,
    ) -> Option<Arc<Self>> {
        let DelegationTools {
            review: delegation,
            workers,
        } = delegation;
        if permissions.is_none()
            && material.image.is_none()
            && material.file.is_none()
            && material.skills.is_none()
            && waits.scheduled.is_none()
            && waits.clock.is_none()
            && hooks.completion.is_none()
            && hooks.before_tool.is_none()
            && hooks.lifecycle.is_none()
            && host_tools.is_empty()
            && delegation.is_none()
            && workers.is_none()
        {
            return None;
        }
        Some(Arc::new(Self {
            base,
            permissions,
            material,
            waits,
            hooks,
            host_tools,
            delegation,
            workers,
        }))
    }
}

impl AuthorityValidator for ToolAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        if self
            .hooks
            .before_tool
            .as_ref()
            .is_some_and(|check| check.is_fenced())
        {
            return Box::pin(async { Err(before_tool::uncertain()) });
        }
        if self
            .workers
            .as_ref()
            .is_some_and(|scope| scope.accepts(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if self
            .delegation
            .as_ref()
            .is_some_and(|scope| scope.accepts(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if self
            .hooks
            .completion
            .as_ref()
            .is_some_and(|scope| scope.handles(&request.selection))
            || self
                .hooks
                .before_tool
                .as_ref()
                .is_some_and(|scope| scope.handles(&request.selection))
            || self
                .hooks
                .lifecycle
                .as_ref()
                .is_some_and(|scope| scope.handles(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if self
            .waits
            .scheduled
            .as_ref()
            .is_some_and(|scope| scope.accepts(&request.selection))
            || self
                .waits
                .clock
                .as_ref()
                .is_some_and(|scope| scope.accepts(&request.selection))
        {
            return Box::pin(async { Ok(()) });
        }
        if let Some(image) = self
            .material
            .image
            .as_ref()
            .filter(|image| image.handles(&request.selection))
        {
            return image.validate(request);
        }
        if self
            .material
            .file
            .as_ref()
            .is_some_and(|file| file.handles(&request.selection))
            || self
                .material
                .skills
                .as_ref()
                .is_some_and(|skills| skills.handles(&request.selection))
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

impl ToolAuthority {
    fn decide_target(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        if let Some(check) = &self.hooks.before_tool
            && let Err(error) = check.require_unfenced(&context)
        {
            return Box::pin(async { Err(error) });
        }
        if let Some(workers) = self
            .workers
            .as_ref()
            .filter(|scope| scope.accepts(&admission.grants))
        {
            return workers.decide(admission, context);
        }
        if let Some(delegation) = self
            .delegation
            .as_ref()
            .filter(|scope| scope.accepts(&admission.grants))
        {
            return delegation.decide(admission, context);
        }
        if let Some(completion) = self
            .hooks
            .completion
            .as_ref()
            .filter(|scope| scope.handles(&admission.grants))
        {
            return completion.decide(admission, context);
        }
        if let Some(before_tool) = self
            .hooks
            .before_tool
            .as_ref()
            .filter(|scope| scope.handles(&admission.grants))
        {
            return Box::pin(async move { before_tool.admit(&admission, &context) });
        }
        if let Some(clock) = self
            .waits
            .clock
            .as_ref()
            .filter(|scope| scope.accepts(&admission.grants))
        {
            return Box::pin(async move { clock.decide(&admission) });
        }
        if let Some(wakeups) = self
            .waits
            .scheduled
            .as_ref()
            .filter(|scope| scope.accepts(&admission.grants))
        {
            return wakeups.decide(admission, context);
        }
        if let Some(image) = self
            .material
            .image
            .as_ref()
            .filter(|image| image.handles(&admission.grants))
        {
            return image.decide(admission, context);
        }
        if let Some(file) = self
            .material
            .file
            .as_ref()
            .filter(|file| file.handles(&admission.grants))
        {
            return file.decide(admission, context);
        }
        if let Some(skills) = self
            .material
            .skills
            .as_ref()
            .filter(|skills| skills.handles(&admission.grants))
        {
            return skills.decide(admission, context);
        }
        if let Some(permissions) = self
            .permissions
            .as_ref()
            .filter(|scope| scope.handles(&admission.grants))
        {
            if let Some(before_tool) = self
                .hooks
                .before_tool
                .as_ref()
                .filter(|scope| scope.matches(&admission.invocation))
            {
                return Box::pin(async move {
                    let decision = permissions
                        .decide(admission.clone(), context.clone())
                        .await?;
                    if matches!(decision, ToolDecision::Permit) {
                        return before_tool.review(&admission, &context).await;
                    }
                    Ok(decision)
                });
            }
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

impl ToolGate for ToolAuthority {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            if let Some(hooks) = &self.hooks.lifecycle {
                if hooks.unverified(&context.operations.view()) {
                    return Err(problem(ErrorKind::Uncertain, "lifecycle_hook_uncertain"));
                }
                if hooks.handles(&admission.grants) {
                    return hooks.admit(&admission, &context);
                }
            }
            let decision = self
                .decide_target(admission.clone(), context.clone())
                .await?;
            if !matches!(decision, ToolDecision::Permit) {
                return Ok(decision);
            }
            if let Some(hooks) = &self.hooks.lifecycle {
                // Internal checks never recursively dispatch user handlers.
                if !self
                    .hooks
                    .completion
                    .as_ref()
                    .is_some_and(|scope| scope.handles(&admission.grants))
                    && !self
                        .hooks
                        .before_tool
                        .as_ref()
                        .is_some_and(|scope| scope.handles(&admission.grants))
                {
                    hooks.before_tool(&admission, &context).await?;
                    // The runtime revalidates the exact original action's live
                    // authority after this gate. A hook supplies no grant.
                    return Ok(ToolDecision::Permit);
                }
            }
            Ok(decision)
        })
    }
}

impl Host {
    /// Add the explicitly selected native profile before accepting work.
    pub fn with_permission_profile(mut self, profile: Arc<PermissionProfile>) -> Self {
        self.permissions = Some(profile);
        self
    }

    pub(super) fn capture_workspace_permissions(
        &self,
        session: &SessionView,
        input: &ChangeId,
        regime: grida_agent_master::OperatingRegime,
    ) -> Result<Option<PermissionCapture>> {
        let Some(profile) = &self.permissions else {
            return Ok(None);
        };
        if !profile.matches_primary(&session_configuration(session)?.cwd) {
            return Ok(None);
        }
        Ok(Some(profile.capture_workspace(
            ScopeId::new(input.as_str())?,
            self.selected_permission_mode(session)?,
            regime,
        )?))
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

    pub(super) fn bind_worker_permissions(
        &self,
        capture: &PermissionCapture,
        binding: agent_kit_core::turn::TurnBinding,
    ) -> Result<Arc<TurnPermissions>> {
        self.permissions
            .as_ref()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "permission_profile_unavailable"))?
            .bind_worker(capture, binding, self.store.clone())
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
                        let review = grida_agent_master::approval_review::recorded_review(
                            state,
                            &request.operation,
                            request.action,
                            request.scope,
                        )?;
                        if wait.is_pending() && approval_is_reviewing(state, wait, &request) {
                            return Err(problem(
                                ErrorKind::Conflict,
                                "approval_review_in_progress",
                            ));
                        }
                        let deferred_review = review
                            .filter(|review| {
                                state.is_suspended()
                                    || grida_agent_master::approval_review::failure_reason(review)
                                        .is_some()
                            })
                            .map(|review| review.record.id.clone());
                        Ok((
                            crate::permissions::manual_approval_answer(
                                wait,
                                decision,
                                deferred_review,
                            )?,
                            !crate::permissions::is_live_network_wait(wait, &request)
                                && state.outcome().is_none()
                                && state.controls().admits_work()
                                && state.waits().values().all(|other| {
                                    other.id == wait_id
                                        || !grida_agent_master::questions::blocks_progress(other)
                                }),
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApprovalReview {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) review_id: Option<agent_kit_core::OperationId>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub(super) reconsidered: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_authorization: Option<grida_agent_master::approval_review::UserAuthorization>,
    decision: &'static str,
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    failure: Option<grida_agent_master::approval_review::AskReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rationale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    risk_level: Option<grida_agent_master::approval_review::RiskLevel>,
}

pub(super) fn approval_review_facts(state: &TurnState) -> Result<Vec<ApprovalReview>> {
    let mut reviews = Vec::new();
    use crate::permissions::ReviewResolution;
    for wait in state
        .waits()
        .values()
        .filter(|wait| !wait.withdrawn && is_approval(wait))
    {
        let request = read_approval(wait)?;
        let Some(review) = grida_agent_master::approval_review::recorded_review(
            state,
            &request.operation,
            request.action,
            request.scope,
        )?
        else {
            continue;
        };
        let decision = if wait.answer.is_some() {
            match crate::permissions::review_resolution(wait, &request, &review.record.id)? {
                Some(ReviewResolution::Applied(ApprovalDecision::ApproveOnce)) => "approved",
                Some(ReviewResolution::Applied(ApprovalDecision::Decline)) => "declined",
                Some(ReviewResolution::Deferred) => "needs_human",
                None => continue,
            }
        } else if shows_review_activity(state, wait, &request, Some(review)) {
            "reviewing"
        } else {
            "needs_human"
        };
        let can_reconsider = decision == "declined"
            && (!crate::permissions::is_live_network_wait(wait, &request)
                || request.launch_scope.is_some())
            && super::reconsideration::eligible_review(review);
        let Some((action, complete)) = approval_review_action(&request) else {
            continue;
        };
        let call = state
            .operations()
            .get(&request.operation)
            .and_then(|record| record.record.source_call.as_ref());
        let position = state
            .history()
            .records()
            .iter()
            .flat_map(|HistoryRecord::Message(message)| &message.content)
            .position(|part| matches!(part, Content::ToolCall(tool) if Some(&tool.id) == call))
            .unwrap_or(usize::MAX);
        let assessment = grida_agent_master::approval_review::scoped_assessment(review);
        let failure = visible_review_failure(decision == "reviewing", Some(review));
        reviews.push((
            position,
            ApprovalReview {
                review_id: (can_reconsider && complete).then(|| review.record.id.clone()),
                reconsidered: false,
                user_authorization: assessment.as_ref().map(|a| a.user_authorization),
                decision,
                action,
                failure,
                risk_level: assessment.as_ref().map(|review| review.risk_level),
                rationale: assessment.map(|review| review.rationale),
            },
        ));
    }
    reviews.sort_by_key(|(position, _)| *position);
    Ok(reviews.into_iter().map(|(_, review)| review).collect())
}

/// Project the full action label used to inform reconsideration. Its
/// completeness must agree at display time and when recording the request.
pub(super) fn approval_review_action(request: &ApprovalRequest) -> Option<(String, bool)> {
    use crate::permissions::ApprovalEffect;
    let action = match &request.effect {
        ApprovalEffect::Read { relative_path, .. } => {
            request.root.join(relative_path).display().to_string()
        }
        ApprovalEffect::EscalatedCommand {
            command,
            cwd,
            filesystem,
            network,
            listen_port,
            ..
        } => {
            use crate::permissions::CommandRetryNetwork;
            let network = match (network, listen_port) {
                (Some(CommandRetryNetwork::Denied), _) => "Network denied".into(),
                (Some(CommandRetryNetwork::Managed), _) => "Managed network access".into(),
                (Some(CommandRetryNetwork::Listen), Some(port)) => {
                    format!("TCP listener on port {port}")
                }
                _ => "Network details unavailable".into(),
            };
            command_review_label(command, cwd, filesystem.as_ref(), network)
        }
        ApprovalEffect::Command {
            network,
            command,
            cwd,
            filesystem,
            managed_network,
            ..
        } => {
            let network = match network {
                Some(destination) => {
                    format!("Network {}:{}", destination.host, destination.port)
                }
                None if *managed_network => "Managed network access".into(),
                None => "Command access".into(),
            };
            command_review_label(command, cwd, filesystem.as_ref(), network)
        }
        _ => return None,
    };
    Some(display_review_action(action))
}

fn command_review_label(
    command: &str,
    cwd: &std::path::Path,
    filesystem: Option<&grida_agent_master::approval_review::CommandFilesystem>,
    network: String,
) -> String {
    let Some(fs) = filesystem else {
        return format!(
            "{network} · Filesystem details unavailable · in {} · {command}",
            cwd.display()
        );
    };
    let reads = if fs.disk_read {
        "Disk reads outside protected paths".to_owned()
    } else {
        let roots = fs
            .read_roots
            .iter()
            .chain(&fs.runtime_roots)
            .chain(&fs.write_roots)
            .cloned()
            .collect::<Vec<_>>();
        format!("Read roots {}", roots.join(", "))
    };
    let mut writes = fs.write_roots.clone();
    if fs.private_temp_write {
        writes.push("private temporary directory".into());
    }
    format!(
        "{network} · {reads} · Write roots {} · in {} · {command}",
        writes.join(", "),
        fs.resolved_cwd
    )
}

/// The action is plain display text. A shortened or masked label cannot ground
/// informed reconsideration of the exact denied operation.
fn display_review_action(action: String) -> (String, bool) {
    let masked = |c: char| {
        c.is_control()
            || matches!(c,
        '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{2028}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
    };
    let complete = action.len() <= 4096 && !action.chars().any(masked);
    if complete {
        return (action, true);
    }
    let mut display: String = action
        .chars()
        .map(|c| if masked(c) { '�' } else { c })
        .collect();
    if display.len() > 4096 {
        display.truncate(display.floor_char_boundary(4096 - '…'.len_utf8()));
        display.push('…');
    }
    (display, false)
}

fn approval_is_reviewing(
    state: &TurnState,
    wait: &agent_kit_core::turn::WaitRecord,
    request: &ApprovalRequest,
) -> bool {
    if crate::permissions::is_live_network_wait(wait, request) {
        // The broker records a separate, exact wait only once it hands off.
        return wait.request.schema().as_str() != crate::permissions::NETWORK_HANDOFF;
    }
    wait.request.schema().as_str() == crate::permissions::SCOPED_REVIEW && !state.is_suspended()
}

/// Configured single-read review can still be preempted by its supervising
/// client. Both observational contracts show its pending review as activity.
fn shows_review_activity(
    state: &TurnState,
    wait: &agent_kit_core::turn::WaitRecord,
    request: &ApprovalRequest,
    review: Option<&agent_kit_core::turn::OperationState>,
) -> bool {
    approval_is_reviewing(state, wait, request)
        || (!state.is_suspended()
            && state.controls().admits_work()
            && review.is_some_and(|op| {
                grida_agent_master::approval_review::is_configured_read_review(op)
                    && grida_agent_master::approval_review::failure_reason(op).is_none()
            }))
}

/// An internal tool step or retry can temporarily have no valid assessment.
fn visible_review_failure(
    reviewing: bool,
    review: Option<&agent_kit_core::turn::OperationState>,
) -> Option<grida_agent_master::approval_review::AskReason> {
    if reviewing {
        None
    } else {
        review.and_then(grida_agent_master::approval_review::failure_reason)
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
            let review = grida_agent_master::approval_review::recorded_review(
                state,
                &request.operation,
                request.action,
                request.scope,
            )?;
            let reviewing = shows_review_activity(state, wait, &request, review);
            let review_failure = visible_review_failure(reviewing, review);
            Ok(PendingApproval {
                wait_id: wait.id.clone(),
                reviewing,
                review_failure,
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
    command: Arc<CommandSupervisor>,
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

#[cfg(test)]
mod review_display_tests {
    use super::display_review_action;

    #[test]
    fn shortened_or_masked_actions_cannot_offer_reconsideration() {
        assert!(display_review_action("printf ok".into()).1);
        let (label, complete) = display_review_action(format!("{}tail", "é".repeat(2048)));
        assert!(label.len() <= 4096 && label.ends_with('…'));
        assert!(!complete);
        assert_eq!(
            display_review_action("printf\u{202e}ok".into()),
            ("printf�ok".into(), false)
        );
    }
}
