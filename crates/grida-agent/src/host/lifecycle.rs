//! Product controls over the session store and its owned turn workers.

use super::*;

pub enum QueueEdit {
    Replace {
        input: ChangeId,
        replacement: ChangeId,
        parts: Vec<PromptPart>,
        questions: bool,
        configuration_permission: crate::ConfigurationPermission,
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
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
    #[serde(default)]
    pub questions: bool,
    #[serde(default)]
    pub configuration_permission: crate::ConfigurationPermission,
}

pub struct InputInspection {
    pub receipt: DurableSubmission,
    pub settings: InputSettings,
    pub parts: Vec<PromptPart>,
}

impl InputSettings {
    pub fn for_input(input: &Submission) -> Result<Self> {
        if input.payload.schema().as_str() != INPUT_SCHEMA {
            return Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            ));
        }
        match input.payload.version() {
            1 => Ok(Self::default()),
            2 => {
                let stored: StoredPrompt = decode_input(input)?;
                Ok(Self {
                    model: stored.model,
                    max_input_tokens: stored
                        .configuration
                        .defaults
                        .context
                        .max_input_tokens
                        .map(|limit| limit.get()),
                    max_output_tokens: stored.max_output_tokens,
                    questions: stored.questions,
                    configuration_permission: stored.configuration_permission,
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
        prompt_input(&request.id, &request.parts)?;
        let admission = self.configuration_admission.lock().await;
        if let Some(accepted) = self.existing_submission(&request).await? {
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
        let input = self
            .capture_submission(
                request.id,
                request.parts,
                request.questions,
                request.configuration_permission,
            )
            .await?;
        let acceptance = self.store.submit(request.session, input).await?;
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
        let parts = if view.input.payload.version() == 1 {
            let messages: Vec<Message> = decode_input(&view.input)?;
            messages
                .into_iter()
                .flat_map(|message| message.content)
                .filter_map(|content| match content {
                    Content::Text(text) => Some(PromptPart::Text { text }),
                    _ => None,
                })
                .collect()
        } else {
            decode_input::<StoredPrompt>(&view.input)?.parts
        };
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
                configuration_permission,
            } => {
                prompt_input(&replacement, &parts)?;
                let replacement = if let Some(previous) = self
                    .store
                    .input(session.clone(), replacement.clone())
                    .await?
                {
                    check_input(&previous.input, &parts)?;
                    previous.input
                } else {
                    let view = self.store.inspect(session.clone()).await?;
                    self.check_execution(&view)?;
                    self.capture_submission(replacement, parts, questions, configuration_permission)
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
            let admission = host.configuration_admission.lock().await;
            let view = host.store.inspect(session.clone()).await?;
            if view.current.is_none() && !view.queued.is_empty() {
                host.check_ready_capacity(&session).await?;
            }
            let receipt = host
                .store
                .control(ControlRequest {
                    id: request,
                    session: session.clone(),
                    expected_revision: expected,
                    action: SessionControl::ResumeAdmission,
                })
                .await?;
            host.kick_queue(session).await;
            drop(admission);
            Ok(receipt)
        })
        .await
    }

    pub async fn pause(&self, control: TurnControl) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            host.store
                .control(ControlRequest {
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
        if let Some(view) = self.store.claim_receipt(request.clone()).await? {
            return Ok(view);
        }
        let ticket = {
            let mut work = self.work.lock().await;
            self.register(
                &mut work,
                control.session.clone(),
                control.turn.clone(),
                Launch::Resume(request.clone()),
            )
        };
        let ticket = match ticket {
            Ok(ticket) => ticket,
            Err(error) => return self.store.claim_receipt(request).await?.ok_or(error),
        };
        ticket
            .admission
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))??;
        self.store.inspect_turn(control.session, control.turn).await
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
        if work.closed || work.active.contains_key(&session) {
            return;
        }
        if work.active.len() >= MAX_ACTIVE_RUNS {
            work.defer(ReadyWork::Stop(session, turn));
            return;
        }
        let _ = self.register(&mut work, session, turn, Launch::RecoverStopped(recovery));
    }

    pub async fn steer(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        parts: Vec<PromptPart>,
    ) -> Result<ControlReceipt> {
        let mut messages = prompt_input(&control.request, &parts)?;
        for message in &mut messages {
            message.id = MessageId::new(format!("steer/{}", message.id.as_str()))?;
        }
        self.owned_control(move |host| async move {
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
        1 => {
            let previous: Vec<Message> = decode_input(input)?;
            let current = prompt_input(&input.id, parts)?;
            previous.len() == 1 && previous[0].content == current[0].content
        }
        2 => {
            let previous: StoredPrompt = decode_input(input)?;
            previous.parts == parts
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
