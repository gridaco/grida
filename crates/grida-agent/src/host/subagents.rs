//! GRIDA-SEC-004 — parent-scoped, independently authorized child assignments.

use super::*;
use agent_kit_store_sqlite::InputObservation;
use grida_agent_master::subagents::{self, Allocation, Assignment, Profile};

pub struct SubagentInspection {
    pub parent: SessionId,
    pub child: SessionId,
    pub name: String,
    pub allocation: Allocation,
    pub revision: SessionRevision,
    pub admission_paused: bool,
    pub queued: Vec<ChangeId>,
    pub current: Option<TurnView>,
    pub latest: Option<TurnView>,
    pub assignment: Option<SubagentWork>,
}

pub struct SubagentWork {
    pub input: ChangeId,
    pub parent_turn: TurnId,
    pub max_generation_steps: u32,
    pub disposition: InputDisposition,
    pub turn: Option<TurnView>,
}

pub struct SubagentAssignment {
    pub parent: SessionId,
    pub child: SessionId,
    pub parent_turn: TurnId,
    pub input: ChangeId,
    pub instructions: String,
}

impl Host {
    /// Allow the trusted private launcher to own bounded inference-only
    /// children. This adds no model-facing delegation authority.
    pub fn with_subagents(mut self) -> Self {
        self.subagents_enabled = true;
        self
    }

    pub(crate) fn subagents_available(&self) -> bool {
        self.subagents_enabled
            && self.operating_regime.is_act()
            && self.side_context.is_none()
            && self
                .execution
                .as_ref()
                .is_some_and(|execution| execution.config.max_output_tokens.is_some())
    }

    pub async fn create_subagent(
        &self,
        parent: SessionId,
        request: ChangeId,
        name: String,
        work_turns: u8,
    ) -> Result<SessionId> {
        self.owned_control(move |host| async move {
            host.require_subagents()?;
            let _admission = host.configuration_admission.lock().await;
            let view = host.store.inspect(parent.clone()).await?;
            host.check_execution(&view)?;
            let mut configuration = session_configuration(&view)?;
            if configuration.subagent.is_some() {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "subagent_delegation_unavailable",
                ));
            }
            let execution = host.execution()?;
            let profile = Profile::new(
                parent,
                name,
                work_turns,
                &execution.authority.inference.authority,
            )?;
            let child = profile.identity(&request)?;
            configuration.execution = execution.configuration;
            configuration.subagent = Some(profile);
            host.store
                .create(CreateSession {
                    id: child.clone(),
                    request,
                    configuration: encode(SESSION_SCHEMA, 2, &configuration)?,
                })
                .await?;
            Ok(child)
        })
        .await
    }

    pub async fn assign_subagent(&self, assignment: SubagentAssignment) -> Result<SubagentWork> {
        self.owned_control(move |host| async move { host.accept_assignment(assignment).await })
            .await
    }

    async fn accept_assignment(&self, assignment: SubagentAssignment) -> Result<SubagentWork> {
        self.require_subagents()?;
        subagents::validate_assignment(&assignment.instructions)?;
        let SubagentAssignment {
            parent,
            child,
            parent_turn,
            input,
            instructions,
        } = assignment;
        let _admission = self.configuration_admission.lock().await;
        let (view, previous) = self
            .store
            .inspect_with_input(child.clone(), input.clone())
            .await
            .map_err(child_observation_error)?;
        let profile = child_profile(&parent, &view)?;
        let parts = vec![PromptPart::Text { text: instructions }];
        if let Some(previous) = previous {
            let stored: StoredPrompt = decode_input(&previous.input.input)?;
            if !images::same_prompt(&stored.parts, &parts)
                || stored
                    .subagent
                    .as_ref()
                    .map(|assignment| &assignment.parent_turn)
                    != Some(&parent_turn)
            {
                return Err(problem(
                    ErrorKind::Conflict,
                    "subagent_assignment_identity_reused",
                ));
            }
            if previous.input.disposition == InputDisposition::Queued
                && self.check_execution(&view).is_ok()
                && profile
                    .require_authority(&self.execution()?.authority.inference.authority)
                    .is_ok()
            {
                self.kick_queue(child.clone()).await;
            }
            return subagent_work(previous, stored);
        }

        self.check_execution(&view)?;
        profile.require_authority(&self.execution()?.authority.inference.authority)?;
        let allocation = profile.allocation(&view.driver_state)?;
        if usize::from(allocation.reserved) + view.queued.len()
            >= usize::from(allocation.work_turns)
        {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "subagent_allocation_exhausted",
            ));
        }
        self.validate_subagent_sponsor(&parent, &parent_turn)
            .await?;
        if view.current.is_none() && !view.admission_paused {
            self.check_ready_capacity(&child).await?;
        }
        let submission = self
            .capture_input(
                &view,
                input.clone(),
                parts,
                SubmissionPolicy {
                    questions: false,
                    configuration_permission: crate::ConfigurationPermission::Disabled,
                    allow_wakeups: false,
                    allow_host_tools: false,
                    operating_regime: OperatingRegime::Act,
                    subagent: Some(Assignment {
                        parent_turn: parent_turn.clone(),
                    }),
                },
            )
            .await?;
        self.store
            .submit_at_revision(child.clone(), submission, view.revision)
            .await?;
        self.kick_queue(child).await;
        Ok(SubagentWork {
            input,
            parent_turn,
            max_generation_steps: subagents::INFERENCE_STEPS_PER_ASSIGNMENT,
            disposition: InputDisposition::Queued,
            turn: None,
        })
    }

    async fn validate_subagent_sponsor(&self, parent: &SessionId, turn: &TurnId) -> Result<()> {
        let sponsor = self
            .store
            .inspect_turn(parent.clone(), turn.clone())
            .await?;
        if sponsor.disposition != TurnDisposition::Settled {
            return Err(problem(ErrorKind::Conflict, "subagent_sponsor_unsettled"));
        }
        let inputs = self
            .store
            .turn_submissions(parent.clone(), turn.clone())
            .await?;
        let [input] = inputs.as_slice() else {
            return Err(problem(
                ErrorKind::Unsupported,
                "subagent_sponsor_unavailable",
            ));
        };
        if !InputSettings::for_input(input)?.operating_regime.is_act() {
            return Err(problem(
                ErrorKind::Unsupported,
                "subagent_sponsor_requires_act",
            ));
        }
        Ok(())
    }

    pub async fn inspect_subagent(
        &self,
        parent: SessionId,
        child: SessionId,
        input: Option<ChangeId>,
    ) -> Result<SubagentInspection> {
        self.require_subagents()?;
        let (view, profile, assignment) = match input {
            Some(input) => {
                let (view, accepted) = self
                    .store
                    .inspect_with_input(child.clone(), input)
                    .await
                    .map_err(child_observation_error)?;
                let profile = child_profile(&parent, &view)?;
                let accepted = accepted.ok_or_else(|| {
                    problem(ErrorKind::Unavailable, "subagent_assignment_unavailable")
                })?;
                let stored: StoredPrompt = decode_input(&accepted.input.input)?;
                (view, profile, Some(subagent_work(accepted, stored)?))
            }
            None => {
                let (view, profile) = self.subagent_view(&parent, child.clone()).await?;
                (view, profile, None)
            }
        };
        Ok(SubagentInspection {
            parent,
            child,
            name: profile.name().to_owned(),
            allocation: profile.allocation(&view.driver_state)?,
            revision: view.revision,
            admission_paused: view.admission_paused,
            queued: view
                .queued
                .into_iter()
                .map(|input| input.input.id)
                .collect(),
            current: view.current,
            latest: view.latest,
            assignment,
        })
    }

    pub async fn pause_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &control.session).await?;
        self.pause(control).await
    }

    pub async fn resume_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
        epoch: u64,
        position: JournalPosition,
    ) -> Result<TurnView> {
        self.child_for_control(&parent, &control.session)
            .await?
            .require_authority(&self.execution()?.authority.inference.authority)?;
        self.resume(control, epoch, position).await
    }

    pub async fn steer_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
        expected_history: HistoryPosition,
        instructions: String,
    ) -> Result<ControlReceipt> {
        subagents::validate_assignment(&instructions)?;
        self.child_for_control(&parent, &control.session)
            .await?
            .require_authority(&self.execution()?.authority.inference.authority)?;
        self.steer(
            control,
            expected_history,
            vec![PromptPart::Text { text: instructions }],
        )
        .await
    }

    /// Stop the active assignment and close advancement of its queue.
    pub async fn stop_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &control.session).await?;
        let stopped = self
            .stop(
                control.session.clone(),
                control.turn.clone(),
                control.request.clone(),
                control.expected_session,
                control.expected_control,
            )
            .await;
        if !matches!(&stopped, Err(error) if error.code == "request_identity_reused") {
            return stopped;
        }
        // A retained receipt may predate queued child assignments. This
        // request already has a receipt, so the fallback can only replay it.
        self.owned_control(move |host| async move {
            let previous = host
                .store
                .control(ControlRequest {
                    id: control.request,
                    session: control.session.clone(),
                    expected_revision: control.expected_session,
                    action: SessionControl::Turn {
                        turn: control.turn.clone(),
                        expected: control.expected_control,
                        directive: ControlDirective::Cancel,
                    },
                })
                .await?;
            host.kick_stopped(control.session, control.turn).await;
            Ok(previous)
        })
        .await
    }

    pub async fn resume_subagent_queue(
        &self,
        parent: SessionId,
        child: SessionId,
        request: ChangeId,
        expected: SessionRevision,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &child)
            .await?
            .require_authority(&self.execution()?.authority.inference.authority)?;
        self.resume_queue(child, request, expected).await
    }

    pub async fn withdraw_subagent_input(
        &self,
        parent: SessionId,
        child: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        input: ChangeId,
    ) -> Result<ControlReceipt> {
        self.child_for_control(&parent, &child).await?;
        self.edit_queue(child, request, expected, QueueEdit::Withdraw { input })
            .await
    }

    async fn child_for_control(&self, parent: &SessionId, child: &SessionId) -> Result<Profile> {
        self.require_subagents()?;
        self.subagent_view(parent, child.clone())
            .await
            .map(|(_, profile)| profile)
    }

    fn require_subagents(&self) -> Result<()> {
        if !self.subagents_available() {
            return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
        }
        Ok(())
    }

    async fn subagent_view(
        &self,
        parent: &SessionId,
        child: SessionId,
    ) -> Result<(SessionView, Profile)> {
        let view = self
            .store
            .inspect(child)
            .await
            .map_err(child_observation_error)?;
        let profile = child_profile(parent, &view)?;
        Ok((view, profile))
    }
}

fn child_observation_error(error: Error) -> Error {
    if error.code == "session_missing" {
        problem(ErrorKind::Unavailable, "subagent_unavailable")
    } else {
        error
    }
}

fn child_profile(parent: &SessionId, view: &SessionView) -> Result<Profile> {
    session_configuration(view)?
        .subagent
        .filter(|profile| profile.parent() == parent)
        .ok_or_else(|| problem(ErrorKind::Unavailable, "subagent_unavailable"))
}

fn subagent_work(accepted: InputObservation, stored: StoredPrompt) -> Result<SubagentWork> {
    let assignment = stored
        .subagent
        .ok_or_else(|| problem(ErrorKind::InvalidState, "subagent_assignment_missing"))?;
    let max_generation_steps = stored
        .max_steps
        .ok_or_else(|| problem(ErrorKind::InvalidState, "subagent_assignment_limit_missing"))?;
    Ok(SubagentWork {
        input: accepted.input.input.id,
        parent_turn: assignment.parent_turn,
        max_generation_steps,
        disposition: accepted.input.disposition,
        turn: accepted.turn,
    })
}
