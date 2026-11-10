//! GRIDA-SEC-004 — parent-scoped, independently authorized child assignments.

use super::*;
use grida_agent_master::subagents::{self, Allocation, Assignment, Profile};

pub struct SubagentInspection {
    pub parent: SessionId,
    pub child: SessionId,
    pub name: String,
    pub allocation: Allocation,
    pub revision: SessionRevision,
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
        let (view, profile) = self.subagent_view(&parent, child.clone()).await?;
        let parts = vec![PromptPart::Text { text: instructions }];
        if let Some(previous) = self.store.input(child.clone(), input.clone()).await? {
            let stored: StoredPrompt = decode_input(&previous.input)?;
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
            if previous.disposition == InputDisposition::Queued {
                self.kick_queue(child.clone()).await;
            }
            return self.subagent_work(&child, previous, stored).await;
        }

        self.check_execution(&view)?;
        profile.require_authority(&self.execution()?.authority.inference.authority)?;
        if view.current.is_some() || !view.queued.is_empty() || view.admission_paused {
            return Err(problem(ErrorKind::Conflict, "subagent_busy"));
        }
        let allocation = profile.allocation(&view.driver_state)?;
        if allocation.reserved == allocation.work_turns {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "subagent_allocation_exhausted",
            ));
        }
        self.validate_subagent_sponsor(&parent, &parent_turn)
            .await?;
        self.check_ready_capacity(&child).await?;
        let submission = self
            .capture_input(
                &view,
                input.clone(),
                parts,
                SubmissionPolicy {
                    questions: false,
                    configuration_permission: crate::ConfigurationPermission::Disabled,
                    allow_wakeups: false,
                    allow_mcp: false,
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
        let (view, profile) = self.subagent_view(&parent, child.clone()).await?;
        let assignment = match input {
            Some(input) => {
                let accepted = self
                    .store
                    .input(child.clone(), input)
                    .await?
                    .ok_or_else(|| {
                        problem(ErrorKind::Unavailable, "subagent_assignment_unavailable")
                    })?;
                let stored: StoredPrompt = decode_input(&accepted.input)?;
                Some(self.subagent_work(&child, accepted, stored).await?)
            }
            None => None,
        };
        Ok(SubagentInspection {
            parent,
            child,
            name: profile.name().to_owned(),
            allocation: profile.allocation(&view.driver_state)?,
            revision: view.revision,
            current: view.current,
            latest: view.latest,
            assignment,
        })
    }

    async fn subagent_work(
        &self,
        child: &SessionId,
        accepted: agent_kit_sessions::InputView,
        stored: StoredPrompt,
    ) -> Result<SubagentWork> {
        let assignment = stored
            .subagent
            .ok_or_else(|| problem(ErrorKind::InvalidState, "subagent_assignment_missing"))?;
        let max_generation_steps = stored
            .max_steps
            .ok_or_else(|| problem(ErrorKind::InvalidState, "subagent_assignment_limit_missing"))?;
        let turn = match &accepted.disposition {
            InputDisposition::Claimed { turn } | InputDisposition::Completed { turn } => {
                Some(self.store.inspect_turn(child.clone(), turn.clone()).await?)
            }
            _ => None,
        };
        Ok(SubagentWork {
            input: accepted.input.id,
            parent_turn: assignment.parent_turn,
            max_generation_steps,
            disposition: accepted.disposition,
            turn,
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

    /// Cancel the exact child turn. No other assignment can be queued while
    /// this child is busy, so a later explicit assignment can reuse it.
    pub async fn stop_subagent(
        &self,
        parent: SessionId,
        control: TurnControl,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            host.child_for_control(&parent, &control.session).await?;
            let receipt = host
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
            Ok(receipt)
        })
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
        let view = self.store.inspect(child).await.map_err(|error| {
            if error.code == "session_missing" {
                problem(ErrorKind::Unavailable, "subagent_unavailable")
            } else {
                error
            }
        })?;
        let profile = session_configuration(&view)?
            .subagent
            .filter(|profile| profile.parent() == parent)
            .ok_or_else(|| problem(ErrorKind::Unavailable, "subagent_unavailable"))?;
        Ok((view, profile))
    }
}
