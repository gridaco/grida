//! Checkout and steering operate on accepted inputs and their retained parts.

use super::*;
use agent_kit_sessions::QueueAction;

pub(super) const STEERING_SOURCE: &str = "queued-steering";

/// Facts scoped to one observed main chat and its active turn.
#[derive(Default)]
pub(crate) struct QueueActions {
    editable: bool,
    steer_target: Option<QueueSteerTarget>,
}

#[derive(Clone, Default)]
pub(super) struct QueueSteerTarget {
    raster: Option<Arc<retained_inputs::RetainedInputs>>,
}

impl QueueSteerTarget {
    pub(super) fn with_raster(storage: Option<Arc<retained_inputs::RetainedInputs>>) -> Self {
        Self { raster: storage }
    }
}

impl QueueActions {
    pub(crate) fn checkoutable(&self, input: &Submission) -> bool {
        self.editable && queued_text::text_editable(input)
    }

    pub(crate) fn steerable(&self, input: &Submission) -> bool {
        self.steer_target
            .as_ref()
            .is_some_and(|target| steer_parts(input, target).is_ok())
    }
}

fn main_chat(view: &SessionView) -> Result<bool> {
    let configuration = session_configuration(view)?;
    Ok(configuration.side.is_none()
        && configuration.subagent.is_none()
        && configuration.worker.is_none())
}

fn steer_parts(input: &Submission, target: &QueueSteerTarget) -> Result<Vec<PromptPart>> {
    if !queued_text::text_editable(input) {
        return Err(source_unavailable());
    }
    let stored: StoredPrompt = decode_input(input)?;
    if !stored.operating_regime.is_act()
        || stored.effort.is_some()
        || stored.unavailable_library_selection_requested
        || stored.editor_tool_context_id.is_some()
        || stored.editor_svg_target.is_some()
        || stored.completion_checks.is_some()
        || !stored.parts.iter().all(|part| match part {
            PromptPart::Text { .. } | PromptPart::FileReference { .. } => true,
            PromptPart::RetainedImage { .. } | PromptPart::PreparedImage { .. } => {
                target.raster.is_some()
            }
            _ => false,
        })
    {
        return Err(source_unavailable());
    }
    Ok(stored.parts)
}

pub(super) fn steering_message_id(input: &ChangeId) -> Result<MessageId> {
    MessageId::new(format!("steer/{}", prompt_message_id(input)?.as_str()))
}

fn source_unavailable() -> Error {
    problem(ErrorKind::Conflict, "queued_input_not_steerable")
}

fn target_unavailable() -> Error {
    problem(ErrorKind::Conflict, "queue_steer_target_unavailable")
}

impl Host {
    pub(crate) async fn queue_actions(&self, view: &SessionView) -> Result<QueueActions> {
        if !main_chat(view)? {
            return Ok(QueueActions::default());
        }
        let steer_target = match &view.current {
            Some(turn) => self.queued_steer_target(&view.session, turn).await,
            None => None,
        };
        Ok(QueueActions {
            editable: view.checkout.is_none(),
            steer_target,
        })
    }

    async fn queued_steer_target(
        &self,
        session: &SessionId,
        turn: &TurnView,
    ) -> Option<QueueSteerTarget> {
        if turn.disposition != TurnDisposition::Running
            || turn.controls.paused
            || turn.controls.cancelled
            || turn.history_position.0 == 0
            || needs_user_input(&turn.pending_request_schemas, Some(turn.disposition))
        {
            return None;
        }
        self.work
            .lock()
            .await
            .active
            .get(session)
            .filter(|active| active.turn == turn.binding.turn)?
            .queued_steer
            .clone()
    }

    pub(crate) async fn queue_action_receipt(
        &self,
        session: SessionId,
        request: ChangeId,
    ) -> Result<Option<ControlReceipt>> {
        self.store.queue_action_receipt(session, request).await
    }

    pub(crate) async fn checkout_queued(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        input: ChangeId,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let _admission = host.configuration_admission.lock().await;
            let control = ControlRequest {
                session: session.clone(),
                id: request,
                expected_revision: expected,
                action: SessionControl::CheckoutQueued {
                    input: input.clone(),
                },
            };
            if let Some(receipt) = host.store.control_receipt(control.clone()).await? {
                return Ok(receipt);
            }
            let view = host.store.inspect(session).await?;
            if !main_chat(&view)?
                || !view
                    .queued
                    .iter()
                    .any(|row| row.input.id == input && queued_text::text_editable(&row.input))
            {
                return Err(problem(ErrorKind::Conflict, "queued_text_not_editable"));
            }
            host.store.control(control).await
        })
        .await
    }

    pub(crate) async fn reinsert_queued(
        &self,
        session: SessionId,
        request: ChangeId,
        checkout: ChangeId,
        text: Option<String>,
        attachments: Option<Vec<AttachmentEdit>>,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let _admission = host.configuration_admission.lock().await;
            let intent = attachments
                .as_ref()
                .map(|items| attachment_batch::edit_fingerprint(&checkout, &text, items))
                .transpose()?;
            if let Some(intent) = intent
                && let Some(receipt) = host
                    .store
                    .queue_action_receipt(session.clone(), request.clone())
                    .await?
            {
                let changed = || problem(ErrorKind::Conflict, "attachment_batch_conflict");
                let Some(QueueAction::Reinserted {
                    checkout: previous,
                    input,
                }) = &receipt.queue_action
                else {
                    return Err(changed());
                };
                if previous != &checkout {
                    return Err(changed());
                }
                #[derive(Deserialize)]
                struct CapturedEdit {
                    queue_attachment_edit: Option<String>,
                }
                let accepted = host
                    .store
                    .input(session.clone(), input.clone())
                    .await?
                    .ok_or_else(changed)?;
                let stored: CapturedEdit = decode_input(&accepted.input)?;
                if stored.queue_attachment_edit.as_deref() != Some(intent.to_hex().as_str()) {
                    return Err(changed());
                }
                host.kick_queue_at(session, Some(receipt.revision)).await;
                return Ok(receipt);
            }
            let replacement = if text.is_some() || attachments.is_some() {
                let unavailable = || problem(ErrorKind::Conflict, "queue_checkout_unavailable");
                let checkout_receipt = host
                    .store
                    .queue_action_receipt(session.clone(), checkout.clone())
                    .await?
                    .ok_or_else(unavailable)?;
                let Some(QueueAction::CheckedOut { input }) = checkout_receipt.queue_action else {
                    return Err(unavailable());
                };
                let original = host
                    .store
                    .input(session.clone(), input)
                    .await?
                    .ok_or_else(unavailable)?;
                let replacement_id = ChangeId::new(format!(
                    "queue-edit/{}",
                    Fingerprint::of(&request)?.to_hex()
                ))?;
                Some(
                    if let (Some(attachments), Some(intent)) = (attachments, intent) {
                        if original.disposition
                            != (InputDisposition::CheckedOut {
                                checkout: checkout.clone(),
                            })
                        {
                            return Err(unavailable());
                        }
                        let view = host.store.inspect(session.clone()).await?;
                        host.replace_queued_attachments(
                            &view,
                            &original.input,
                            replacement_id,
                            text,
                            attachments,
                            intent,
                        )
                        .await?
                    } else {
                        queued_text::replacement(
                            &original.input,
                            replacement_id,
                            text.expect("ordinary edit has text"),
                        )?
                    },
                )
            } else {
                None
            };
            let control = ControlRequest {
                session: session.clone(),
                id: request,
                expected_revision: SessionRevision::default(),
                action: SessionControl::ReinsertQueued {
                    checkout,
                    replacement,
                },
            };
            if let Some(receipt) = host.store.control_receipt(control.clone()).await? {
                // Reconcile the exact committed wake without releasing newer work.
                host.kick_queue_at(session, Some(receipt.revision)).await;
                return Ok(receipt);
            }
            let result = host.store.control(control).await;
            if intent.is_some() {
                host.settle_input_assets(&session).await;
            }
            let receipt = result?;
            host.kick_queue(session).await;
            Ok(receipt)
        })
        .await
    }

    pub(crate) async fn steer_queued(
        &self,
        control: TurnControl,
        input: ChangeId,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let _admission = host.configuration_admission.lock().await;
            let source = host
                .store
                .input(control.session.clone(), input.clone())
                .await?
                .ok_or_else(source_unavailable)?;
            // Accepted inputs are immutable, so recovery can reconstruct the
            // transfer fingerprint without a live target or opening attachments.
            let stored: StoredPrompt = decode_input(&source.input)?;
            let message_id = steering_message_id(&input)?;
            let mut messages = prompt_input(&input, &stored.parts)?;
            if let [message] = messages.as_mut_slice() {
                message.id = message_id.clone();
                // An earlier queued utterance cannot answer a later approval.
                message.provenance.source = STEERING_SOURCE.into();
            } else {
                return Err(source_unavailable());
            }
            let request = ControlRequest {
                id: control.request,
                session: control.session,
                expected_revision: control.expected_session,
                action: SessionControl::TransferQueued {
                    input: input.clone(),
                    turn: control.turn.clone(),
                    expected: control.expected_control,
                    records: messages.into_iter().map(HistoryRecord::Message).collect(),
                },
            };
            if let Some(receipt) = host.store.control_receipt(request.clone()).await? {
                return Ok(receipt);
            }
            let view = host.store.inspect(request.session.clone()).await?;
            let turn = view
                .current
                .as_ref()
                .filter(|turn| turn.binding.turn == control.turn)
                .ok_or_else(target_unavailable)?;
            if !main_chat(&view)? {
                return Err(target_unavailable());
            }
            // Bind the eligibility read to the exact observed revisions. The
            // store checks these again in the transfer transaction.
            if view.revision != control.expected_session {
                return Err(problem(ErrorKind::Conflict, "stale_session_revision"));
            }
            if turn.controls.revision != control.expected_control {
                return Err(problem(ErrorKind::Conflict, "stale_control_revision"));
            }
            let target = host
                .queued_steer_target(&view.session, turn)
                .await
                .ok_or_else(target_unavailable)?;
            if source.disposition != InputDisposition::Queued {
                return Err(source_unavailable());
            }
            let parts = steer_parts(&source.input, &target)?;
            verify_raster(&view.session, &parts, target.raster).await?;
            let receipt = host.store.control(request).await?;
            host.activity_order
                .record_message(&view.session, &control.turn, &message_id);
            Ok(receipt)
        })
        .await
    }
}

async fn verify_raster(
    session: &SessionId,
    parts: &[PromptPart],
    storage: Option<Arc<retained_inputs::RetainedInputs>>,
) -> Result<()> {
    let media = parts
        .iter()
        .filter_map(|part| match part {
            PromptPart::RetainedImage { asset } => Some(images::media(asset)),
            PromptPart::PreparedImage { image } => Some(images::raster_media(image)),
            _ => None,
        })
        .collect::<Result<Vec<_>>>()?;
    if media.is_empty() {
        return Ok(());
    }
    let storage = storage.ok_or_else(source_unavailable)?;
    for item in &media {
        if images::asset_ref(item)?.owner() != session {
            return Err(source_unavailable());
        }
    }
    tokio::task::spawn_blocking(move || {
        for item in media {
            storage.resolve(&item, image_preparation::MAX_PREPARED_BYTES)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| images::retained_unavailable())?
}
