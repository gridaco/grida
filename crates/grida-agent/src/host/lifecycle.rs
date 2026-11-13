//! Product controls over the session store and its owned turn workers.

use super::*;

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::messages::OutcomeStatus;
    use agent_kit_core::turn::{JournalAction, JournalChange};

    #[test]
    fn queue_readiness_coalesces_recovery_without_restricting_ordinary_wakes() {
        let session = SessionId::new("queued").unwrap();
        let mut work = Work::default();
        for revision in [2, 1, 3] {
            work.defer(ReadyWork::Queue(
                session.clone(),
                Some(SessionRevision(revision)),
            ));
        }
        assert_eq!(work.ready.len(), 1);
        assert!(matches!(
            work.ready.front(),
            Some(ReadyWork::Queue(_, Some(SessionRevision(3))))
        ));
        work.defer(ReadyWork::Queue(session.clone(), None));
        work.defer(ReadyWork::Queue(session, Some(SessionRevision(4))));
        assert_eq!(work.ready.len(), 1);
        assert!(matches!(
            work.ready.front(),
            Some(ReadyWork::Queue(_, None))
        ));
    }

    #[tokio::test]
    async fn stop_recovery_survives_pre_admission_worker_handoff() {
        let root = tempfile::tempdir().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap();
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let prompt = |id| PromptRequest {
            id: ChangeId::new(id).unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Fixture".into(),
            }],
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: Default::default(),
        };
        let view = host.store.inspect(session.clone()).await.unwrap();
        let original = prompt("original");
        let policy = host.submission_policy(&original, false).unwrap();
        let captured = host
            .capture_input(&view, original.id, original.parts, policy)
            .await
            .unwrap();
        let input = captured.id.clone();
        host.store.submit(session.clone(), captured).await.unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let turn = TurnId::new("original-turn").unwrap();
        let claim = new_claim(session.clone(), turn.clone(), view.revision, vec![input]).unwrap();
        let ClaimOutcome::Acquired(owner) = host.store.claim(claim).await.unwrap() else {
            panic!("expected original turn lease")
        };
        let state = owner.lease.journal().load().await.unwrap();
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    vec![JournalAction::Suspend],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        drop(owner);

        let view = host.store.inspect(session.clone()).await.unwrap();
        let current = view.current.unwrap();
        assert_eq!(current.disposition, TurnDisposition::Suspended);
        let stop_request = ChangeId::new("stop-original").unwrap();
        let stop = || {
            host.stop(
                session.clone(),
                turn.clone(),
                stop_request.clone(),
                view.revision,
                current.controls.revision,
            )
        };

        // The admission lock holds a real worker before it can inspect the
        // store. The drain lock lets a second registration win the handoff.
        let drain = host.wake_lock.lock().await;
        let mut admission = host.configuration_admission.lock().await;
        let competing = prompt("competing");
        let policy = host.submission_policy(&competing, false).unwrap();
        let first = host
            .register_prompt(competing, false, policy)
            .await
            .unwrap();
        let receipt = stop().await.unwrap();
        assert_eq!(receipt.turn.as_ref().unwrap().record().binding.turn, turn);
        {
            let work = host.work.lock().await;
            let active = work.active.get(&session).unwrap();
            assert!(!active.admitted);
            assert_ne!(active.turn, turn);
            assert_eq!(active.pending_stop.as_ref(), Some(&turn));
        }
        drop(admission);
        assert_eq!(
            first.admission.await.unwrap().err().unwrap().code,
            "session_admission_paused"
        );

        admission = host.configuration_admission.lock().await;
        let another = prompt("another");
        let policy = host.submission_policy(&another, false).unwrap();
        let second = host.register_prompt(another, false, policy).await.unwrap();
        {
            let work = host.work.lock().await;
            assert!(work.ready.iter().any(|ready| matches!(ready, ReadyWork::Stop(owner, target) if owner == &session && target == &turn)));
        }
        drop(admission);
        assert_eq!(
            second.admission.await.unwrap().err().unwrap().code,
            "session_admission_paused"
        );
        drop(drain);

        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let settled = host
                    .store
                    .inspect_turn_with(session.clone(), turn.clone(), |state| {
                        assert!(state.operations().is_empty());
                        Ok(state.outcome().map(|outcome| outcome.status))
                    })
                    .await
                    .unwrap();
                if let Some(status) = settled {
                    assert_eq!(status, OutcomeStatus::Cancelled);
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(stop().await.unwrap(), receipt);
        let settled = host.store.inspect(session.clone()).await.unwrap();
        assert!(settled.current.is_none() && settled.queued.is_empty());
        assert_eq!(settled.latest.unwrap().binding.turn, turn);
        host.shutdown().await.unwrap();
    }

    fn fixture_host(state: &std::path::Path, model: &str) -> Host {
        Host::open(
            state,
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new(model).unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
    }

    fn fixture_prompt(session: &SessionId, id: &str) -> PromptRequest {
        PromptRequest {
            id: ChangeId::new(id).unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Fixture".into(),
            }],
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: Default::default(),
        }
    }

    #[tokio::test]
    async fn compaction_waits_for_a_settled_turn_worker_to_release_the_session() {
        let root = tempfile::tempdir().unwrap();
        let host = fixture_host(&root.path().join("state"), "fixture");
        let session = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        // The store shows no turn, while a finishing worker still holds the
        // session in the work table.
        let finishing = tokio::spawn(std::future::pending::<()>());
        host.work.lock().await.active.insert(
            session.clone(),
            Active {
                turn: TurnId::new("finishing").unwrap(),
                admitted: true,
                handle: finishing.abort_handle(),
                pending_stop: None,
                missed_stop: false,
            },
        );
        let compaction = tokio::spawn({
            let host = host.clone();
            let session = session.clone();
            async move {
                host.compact(CompactRequest {
                    session,
                    request: ChangeId::new("compact-after-answer").unwrap(),
                    recover: false,
                })
                .await
            }
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(!compaction.is_finished());
        host.work.lock().await.active.remove(&session);
        host.changed.notify_waiters();
        finishing.abort();
        let report = tokio::time::timeout(Duration::from_secs(5), compaction)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(report.status, CompactionStatus::NoChange);
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn a_chat_keeps_the_route_its_queued_input_was_accepted_under() {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let first = fixture_host(&state, "fixture");
        let session = first
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let view = first.store.inspect(session.clone()).await.unwrap();
        let queued = fixture_prompt(&session, "queued");
        let policy = first.submission_policy(&queued, false).unwrap();
        let captured = first
            .capture_input(&view, queued.id, queued.parts, policy)
            .await
            .unwrap();
        first.store.submit(session.clone(), captured).await.unwrap();
        first.shutdown().await.unwrap();
        drop(first);

        // The same credential owner, another model.
        let second = fixture_host(&state, "another-fixture");
        let view = second.store.inspect(session.clone()).await.unwrap();
        assert_eq!(
            second.check_execution(&view).unwrap_err().code,
            "session_execution_configuration_changed"
        );
        let resumed = second
            .resume_queue(
                session.clone(),
                ChangeId::new("resume").unwrap(),
                view.revision,
            )
            .await
            .unwrap_err();
        assert_eq!(resumed.code, "session_execution_configuration_changed");

        // Withdrawing the queued input lets the chat follow the new model.
        second
            .edit_queue(
                session.clone(),
                ChangeId::new("withdraw").unwrap(),
                view.revision,
                QueueEdit::Withdraw {
                    input: ChangeId::new("queued").unwrap(),
                },
            )
            .await
            .unwrap();
        let view = second.store.inspect(session.clone()).await.unwrap();
        assert!(view.queued.is_empty());
        second.check_execution(&view).unwrap();

        // Work accepted under the new route keeps the chat movable.
        let next = fixture_prompt(&session, "next");
        let policy = second.submission_policy(&next, false).unwrap();
        let captured = second
            .capture_input(&view, next.id, next.parts, policy)
            .await
            .unwrap();
        second
            .store
            .submit(session.clone(), captured)
            .await
            .unwrap();
        let view = second.store.inspect(session.clone()).await.unwrap();
        second.check_execution(&view).unwrap();
        second.shutdown().await.unwrap();
    }
}

pub enum QueueEdit {
    Replace {
        input: ChangeId,
        replacement: ChangeId,
        parts: Vec<PromptPart>,
        questions: bool,
    },
    Withdraw {
        input: ChangeId,
    },
    Reorder {
        inputs: Vec<ChangeId>,
    },
}

pub struct TurnControl {
    pub session: SessionId,
    pub turn: TurnId,
    pub request: ChangeId,
    pub expected_session: SessionRevision,
    pub expected_control: ControlRevision,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSettings {
    pub model: Option<agent_kit_core::ModelId>,
    #[serde(default)]
    pub operating_regime: OperatingRegime,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<EffortPreset>,
    /// The reasoning level the input was accepted with. Part of the input's
    /// identity on retry; not published with its settings.
    #[serde(skip)]
    pub reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
    #[serde(default)]
    pub questions: bool,
    #[serde(default)]
    pub allow_wakeups: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub allow_library_selection: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal_start: Option<GoalRequest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal_max_cost_mills: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<crate::skills::SkillDescription>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_instruction_revision: Option<String>,
}

pub struct InputInspection {
    pub receipt: DurableSubmission,
    pub settings: InputSettings,
    pub parts: Vec<PromptPart>,
}

impl InputSettings {
    /// A retried input must carry the effort it was accepted with: its preset
    /// and its reasoning level, when the retry names them.
    pub(super) fn require_effort(
        &self,
        selection: Option<EffortPreset>,
        reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    ) -> Result<()> {
        if selection.is_some_and(|selected| selected != self.effort.unwrap_or_default())
            || reasoning.is_some_and(|level| Some(level) != self.reasoning)
        {
            return Err(problem(ErrorKind::Conflict, "submission_effort_changed"));
        }
        Ok(())
    }

    pub fn for_input(input: &Submission) -> Result<Self> {
        if input.payload.schema().as_str() != INPUT_SCHEMA {
            return Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            ));
        }
        match input.payload.version() {
            INPUT_VERSION => {
                let stored: StoredPrompt = decode_input(input)?;
                let goal_max_cost_mills = matches!(&stored.goal, Some(goals::GoalInput::Start(_)))
                    .then(|| {
                        stored
                            .spending
                            .as_ref()
                            .map(|selection| selection.maximum().to_owned())
                    })
                    .flatten();
                Ok(Self {
                    goal_max_cost_mills,
                    model: stored.model,
                    operating_regime: stored.operating_regime,
                    effort: stored.effort.map(|policy| policy.preset()),
                    reasoning: stored.reasoning,
                    max_input_tokens: stored
                        .configuration
                        .defaults
                        .context
                        .max_input_tokens
                        .map(|limit| limit.get()),
                    max_output_tokens: stored.max_output_tokens,
                    questions: stored.questions,
                    allow_wakeups: stored.allow_wakeups,
                    allow_library_selection: stored.allow_library_selection,
                    goal_start: match stored.goal {
                        Some(goals::GoalInput::Start(goal)) => Some(goal),
                        _ => None,
                    },
                    skills: stored
                        .guidance
                        .as_ref()
                        .map(|guidance| guidance.selected())
                        .unwrap_or_default(),
                    project_instruction_revision: stored
                        .guidance
                        .as_ref()
                        .and_then(|guidance| guidance.project_revision())
                        .map(str::to_owned),
                })
            }
            _ => Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            )),
        }
    }
}

impl Host {
    pub(crate) async fn inspect_with_retry(
        &self,
        session: SessionId,
    ) -> Result<(SessionView, Option<u64>)> {
        self.store
            .inspect_with_current(session, |current| {
                current.map_or(Ok(None), grida_agent_master::pending_retry_not_before)
            })
            .await
    }

    pub(super) async fn owned_control<T, F>(
        &self,
        operation: impl FnOnce(Host) -> F + Send + 'static,
    ) -> Result<T>
    where
        T: Send + 'static,
        F: std::future::Future<Output = Result<T>> + Send + 'static,
    {
        let permit = self.controls.clone().try_acquire_owned().map_err(|error| {
            if error == tokio::sync::TryAcquireError::Closed {
                problem(ErrorKind::Unavailable, "host_shutting_down")
            } else {
                problem(ErrorKind::LimitExceeded, "host_control_limit")
            }
        })?;
        let host = self.clone();
        tokio::spawn(async move {
            // A disconnected caller drops its response, while the bounded
            // host task keeps its settings capture and durable write together.
            let changed = host.changed.clone();
            let result = operation(host).await;
            drop(permit);
            changed.notify_waiters();
            result
        })
        .await
        .map_err(|_| problem(ErrorKind::Uncertain, "control_worker_interrupted"))?
    }

    pub async fn enqueue(&self, request: PromptRequest) -> Result<DurableSubmission> {
        self.owned_control(move |host| async move { host.enqueue_owned(request).await })
            .await
    }

    async fn enqueue_owned(&self, request: PromptRequest) -> Result<DurableSubmission> {
        validate_prompt_parts(&request.parts)?;
        let admission = self.configuration_admission.lock().await;
        if let Some(accepted) = self
            .existing_submission(&request, &SubmissionContext::default())
            .await?
        {
            return Ok(accepted);
        }
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let view = self.store.inspect(request.session.clone()).await?;
        self.check_execution(&view)?;
        if view.current.is_none() && !view.admission_paused {
            self.check_ready_capacity(&request.session).await?;
        }
        let policy = self.submission_policy(&request, false)?;
        let title = self.title_candidate(&view, &request.parts);
        let input = self
            .capture_input(&view, request.id, request.parts, policy)
            .await?;
        let acceptance = self.store.submit(request.session, input).await?;
        self.start_title(title);
        self.kick_queue(acceptance.session.clone()).await;
        drop(admission);
        Ok(DurableSubmission {
            session: acceptance.session,
            input: acceptance.input,
            position: acceptance.position,
            disposition: InputDisposition::Queued,
        })
    }

    pub(super) async fn check_ready_capacity(&self, session: &SessionId) -> Result<()> {
        let work = self.work.lock().await;
        if work.active.len() >= MAX_ACTIVE_RUNS
            && work.ready.len() >= MAX_READY_SESSIONS
            && !work.ready.iter().any(|ready| ready.session() == session)
            && !work.active.contains_key(session)
        {
            return Err(problem(ErrorKind::LimitExceeded, "host_ready_queue_limit"));
        }
        Ok(())
    }

    pub async fn inspect_input(&self, session: SessionId, id: ChangeId) -> Result<InputInspection> {
        let view = self
            .store
            .input(session.clone(), id.clone())
            .await?
            .ok_or_else(|| problem(ErrorKind::Unavailable, "input_unavailable"))?;
        let settings = InputSettings::for_input(&view.input)?;
        let mut parts = decode_input::<StoredPrompt>(&view.input)?.parts;
        for part in &mut parts {
            if let PromptPart::Skill { reference } = part
                && reference.uri().is_none()
                && let Some(selected) = settings
                    .skills
                    .iter()
                    .find(|skill| skill.name == reference.name())
            {
                *reference =
                    crate::skills::SkillReference::from_uri(&selected.uri)?.ok_or_else(|| {
                        problem(ErrorKind::InvalidState, "invalid_captured_skill_reference")
                    })?;
            }
        }
        Ok(InputInspection {
            receipt: DurableSubmission {
                session,
                input: id,
                position: view.position,
                disposition: view.disposition,
            },
            settings,
            parts,
        })
    }

    pub async fn edit_queue(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        edit: QueueEdit,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            host.edit_queue_owned(session, request, expected, edit)
                .await
        })
        .await
    }

    async fn edit_queue_owned(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        edit: QueueEdit,
    ) -> Result<ControlReceipt> {
        // Capture settings atomically with new queue inputs. A retry reuses
        // the retained replacement's payload rather than recapturing defaults.
        let _admission = self.configuration_admission.lock().await;
        let action = match edit {
            QueueEdit::Replace {
                input,
                replacement,
                parts,
                questions,
            } => {
                validate_prompt_parts(&parts)?;
                let original = self.store.input(session.clone(), input.clone()).await?;
                let original = original
                    .as_ref()
                    .filter(|input| input.disposition == InputDisposition::Queued)
                    .map(|input| &input.input);
                let original_settings = original.map(InputSettings::for_input).transpose()?;
                if original_settings
                    .as_ref()
                    .is_some_and(|settings| settings.goal_start.is_some())
                {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "queued_goal_requires_withdrawal",
                    ));
                }
                if original_settings
                    .as_ref()
                    .is_some_and(|settings| settings.allow_library_selection)
                {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "queued_library_selection_requires_withdrawal",
                    ));
                }
                let replacement = if let Some(previous) = self
                    .store
                    .input(session.clone(), replacement.clone())
                    .await?
                {
                    check_input(&previous.input, &parts)?;
                    if InputSettings::for_input(&previous.input)?.allow_library_selection {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "queued_library_selection_requires_withdrawal",
                        ));
                    }
                    previous.input
                } else {
                    let view = self.store.inspect(session.clone()).await?;
                    self.check_execution(&view)?;
                    let operating_regime = if !self.operating_regime.is_act() {
                        self.operating_regime
                    } else {
                        original_settings
                            .map_or(self.operating_regime, |settings| settings.operating_regime)
                    };
                    let stored = original
                        .filter(|input| is_stored_input(&input.payload))
                        .map(decode_input::<StoredPrompt>)
                        .transpose()?;
                    let capture = stored
                        .as_ref()
                        .and_then(|input| input.host_tools_capture.as_ref());
                    if let Some(capture) = capture {
                        self.retained_host_tools(capture)?;
                    }
                    let allow_host_tools = capture.is_some();
                    let desktop_image_generation = stored
                        .as_ref()
                        .and_then(|input| input.desktop_image_generation.clone());
                    let allow_image_placement = stored
                        .as_ref()
                        .is_some_and(|input| input.allow_image_placement);
                    let spending = stored.as_ref().and_then(|input| input.spending.clone());
                    let reasoning = stored.as_ref().and_then(|input| input.reasoning);
                    let effort = stored.and_then(|input| input.effort);
                    self.capture_input(
                        &view,
                        replacement,
                        parts,
                        SubmissionPolicy {
                            questions,
                            allow_wakeups: false,
                            allow_library_selection: false,
                            allow_host_tools,
                            desktop_image_generation,
                            allow_image_placement,
                            editor_endpoint: None,
                            editor_presentation: false,
                            editor_svg_target: None,
                            operating_regime,
                            subagent: None,
                            effort,
                            reasoning,
                            spending,
                        },
                    )
                    .await?
                };
                SessionControl::ReplaceQueued { input, replacement }
            }
            QueueEdit::Withdraw { input } => SessionControl::WithdrawQueued { input },
            QueueEdit::Reorder { inputs } => SessionControl::ReorderQueued { inputs },
        };
        self.store
            .control(ControlRequest {
                id: request,
                session,
                expected_revision: expected,
                action,
            })
            .await
    }

    pub async fn resume_queue(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let _admission = host.configuration_admission.lock().await;
            let control = ControlRequest {
                id: request,
                session: session.clone(),
                expected_revision: expected,
                action: SessionControl::ResumeAdmission,
            };
            if let Some(receipt) = host.store.control_receipt(control.clone()).await? {
                // Recover a committed Resume whose worker never claimed its
                // queue, without allowing the retry to release newer work.
                host.kick_queue_at(session, Some(receipt.revision)).await;
                return Ok(receipt);
            }
            let view = host.store.inspect(session.clone()).await?;
            if view.current.is_none() && super::subagents::queued_work(&view).is_some() {
                // Queued work this route cannot run is withdrawn, not resumed.
                host.check_execution(&view)?;
                host.check_ready_capacity(&session).await?;
            }
            let receipt = host.store.control(control).await?;
            host.kick_queue(session).await;
            Ok(receipt)
        })
        .await
    }

    pub async fn pause(&self, control: TurnControl) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            host.pause_sponsorship(ControlRequest {
                id: control.request,
                session: control.session,
                expected_revision: control.expected_session,
                action: SessionControl::Turn {
                    turn: control.turn,
                    expected: control.expected_control,
                    directive: ControlDirective::Pause,
                },
            })
            .await
        })
        .await
    }

    pub async fn resume(
        &self,
        control: TurnControl,
        epoch: u64,
        position: JournalPosition,
    ) -> Result<TurnView> {
        let request = ClaimRequest {
            id: control.request,
            session: control.session.clone(),
            expected_revision: control.expected_session,
            selection: TurnSelection::ResumePaused {
                turn: control.turn.clone(),
                epoch,
                position,
                control_revision: control.expected_control,
            },
        };
        self.resume_claim(request, control.turn).await
    }

    pub(super) async fn resume_claim(
        &self,
        request: ClaimRequest,
        turn: TurnId,
    ) -> Result<TurnView> {
        if let Some(view) = self.resume_receipt(request.clone()).await? {
            return Ok(view);
        }
        let session = request.session.clone();
        // A goal's work turn resumes only through goal control. Decide that
        // before admission, so the refusal does not depend on whether the
        // paused turn's worker has released the session yet.
        let goal_turn = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), |state| {
                Ok(grida_agent_master::goals::Goal::reservation_for_turn(state)?.is_some())
            })
            .await?;
        if goal_turn {
            let view = self.store.inspect(session.clone()).await?;
            goals::require_resumable(&view, &turn)?;
        }
        let ticket = {
            let mut work = self.work.lock().await;
            self.register(
                &mut work,
                session.clone(),
                turn.clone(),
                Launch::Resume(request.clone()),
            )
        };
        let ticket = match ticket {
            Ok(ticket) => ticket,
            Err(error) => return self.resume_receipt(request).await?.ok_or(error),
        };
        ticket
            .admission
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))??;
        self.store.inspect_turn(session, turn).await
    }

    pub(super) async fn kick_stopped(&self, session: SessionId, turn: TurnId) {
        if self.work.lock().await.closed {
            return;
        }
        let Ok(view) = self.store.inspect_turn(session.clone(), turn.clone()).await else {
            return;
        };
        if !view.controls.cancelled
            || !matches!(
                view.disposition,
                TurnDisposition::Suspended | TurnDisposition::Interrupted
            )
        {
            return;
        }
        let Ok(id) = change_id() else { return };
        let recovery = RecoveryRequest {
            id,
            session: session.clone(),
            turn: turn.clone(),
            expected_epoch: view.binding.epoch,
        };
        let mut work = self.work.lock().await;
        if work.closed {
            return;
        }
        if let Some(active) = work.active.get_mut(&session) {
            match &active.pending_stop {
                None => active.pending_stop = Some(turn),
                Some(pending) if pending != &turn => {
                    // Revisit other durable stops after this worker releases.
                    active.missed_stop = true;
                }
                Some(_) => {}
            }
            return;
        }
        if work.active.len() >= MAX_ACTIVE_RUNS {
            work.defer(ReadyWork::Stop(session, turn));
            return;
        }
        let _ = self.register(&mut work, session, turn, Launch::RecoverStopped(recovery));
    }

    /// Revisit one bounded page after a stop wake could not fit in memory.
    /// Only a durably cancelled turn under this host's authority can be
    /// registered; inspection itself never starts provider work.
    pub(super) async fn scan_missed_stops(&self) {
        let after = {
            let mut work = self.work.lock().await;
            if work.closed || work.active.len() >= MAX_ACTIVE_RUNS {
                return;
            }
            if !work.stop_scan_active {
                if !work.missed_stops {
                    return;
                }
                work.missed_stops = false;
                work.stop_scan_active = true;
                work.stop_scan_after = None;
            }
            work.stop_scan_after.clone()
        };

        let page = self.store.active_turn_page(after).await;
        let mut last = None;
        let mut more = false;
        if let Ok(page) = &page {
            for (index, entry) in page.entries.iter().enumerate() {
                {
                    let work = self.work.lock().await;
                    if work.closed || work.active.len() >= MAX_ACTIVE_RUNS {
                        more = true;
                        break;
                    }
                }
                last = Some(entry.session.clone());
                more = index + 1 < page.entries.len() || page.next_after.is_some();
                let Ok(turn) = self
                    .store
                    .inspect_turn(entry.session.clone(), entry.turn.clone())
                    .await
                else {
                    continue;
                };
                if !turn.controls.cancelled
                    || !matches!(
                        turn.disposition,
                        TurnDisposition::Suspended | TurnDisposition::Interrupted
                    )
                {
                    continue;
                }
                let Ok(view) = self.store.inspect(entry.session.clone()).await else {
                    continue;
                };
                if self.check_execution(&view).is_err()
                    || !view
                        .current
                        .as_ref()
                        .is_some_and(|current| current.binding.turn == entry.turn)
                {
                    continue;
                }
                self.kick_stopped(entry.session.clone(), entry.turn.clone())
                    .await;
                // Interleave ordinary ready work with cancellation recovery.
                break;
            }
        }

        let mut work = self.work.lock().await;
        if page.is_err() {
            work.stop_scan_active = false;
            work.stop_scan_after = None;
            eprintln!("[agent] stopped-turn recovery scan unavailable");
        } else if more {
            if let Some(last) = last {
                work.stop_scan_after = Some(last);
            }
        } else {
            work.stop_scan_active = false;
            work.stop_scan_after = None;
        }
    }

    pub async fn steer(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        parts: Vec<PromptPart>,
    ) -> Result<ControlReceipt> {
        validate_prompt_parts(&parts)?;
        if parts
            .iter()
            .any(|part| matches!(part, PromptPart::Skill { .. }))
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "skill_selection_requires_new_input",
            ));
        }
        let mut messages = prompt_input(&control.request, &parts)?;
        for message in &mut messages {
            message.id = MessageId::new(format!("steer/{}", message.id.as_str()))?;
        }
        self.owned_control(move |host| async move {
            if host
                .compaction_plan(control.session.clone(), control.turn.clone())
                .await?
                .is_some()
            {
                return Err(problem(ErrorKind::Conflict, "cannot_steer_compaction"));
            }
            host.store
                .control(ControlRequest {
                    id: control.request,
                    session: control.session,
                    expected_revision: control.expected_session,
                    action: SessionControl::AppendHistory {
                        turn: control.turn,
                        expected: control.expected_control,
                        expected_history,
                        records: messages.into_iter().map(HistoryRecord::Message).collect(),
                    },
                })
                .await
        })
        .await
    }
}

pub(super) fn check_input(input: &Submission, parts: &[PromptPart]) -> Result<()> {
    if input.payload.schema().as_str() != INPUT_SCHEMA {
        return Err(problem(
            ErrorKind::Unsupported,
            "unsupported_submission_schema",
        ));
    }
    let same = match input.payload.version() {
        INPUT_VERSION => {
            let previous: StoredPrompt = decode_input(input)?;
            previous.goal.is_none() && images::same_prompt(&previous.parts, parts)
        }
        _ => {
            return Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            ));
        }
    };
    if !same {
        return Err(problem(ErrorKind::Conflict, "submission_input_changed"));
    }
    Ok(())
}
