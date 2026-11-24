//! GRIDA-SEC-004 / GRIDA-SEC-014 — prepare one ordered set of selected inputs.

use super::*;
use agent_kit_core::ArtifactId;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) const MAX_ATTACHMENTS: usize = 8;
const MAX_ATTACHMENT_SOURCE_BYTES: usize = 64 * 1024 * 1024;

pub(crate) enum AttachmentEdit {
    Keep(usize),
    Add(PromptPart),
}

pub(crate) fn is_attachment(part: &PromptPart) -> bool {
    matches!(
        part,
        PromptPart::SelectedImage { .. }
            | PromptPart::Image { .. }
            | PromptPart::File { .. }
            | PromptPart::FileReference { .. }
            | PromptPart::RetainedImage { .. }
            | PromptPart::PreparedImage { .. }
            | PromptPart::RetainedFile { .. }
    )
}

pub(super) fn check_count(parts: &[PromptPart]) -> Result<()> {
    if parts.iter().filter(|part| is_attachment(part)).count() > MAX_ATTACHMENTS {
        return Err(problem(ErrorKind::LimitExceeded, "attachment_count_limit"));
    }
    Ok(())
}

fn is_upload(part: &PromptPart) -> bool {
    matches!(
        part,
        PromptPart::Image { .. } | PromptPart::SelectedImage { .. } | PromptPart::File { .. }
    )
}

fn accepted_assets(input: &Submission) -> Result<BTreeSet<ArtifactId>> {
    let mut assets = BTreeSet::new();
    for part in decode_input::<StoredPrompt>(input)?.parts {
        match part {
            PromptPart::RetainedImage { asset } => {
                assets.insert(asset.id().clone());
            }
            PromptPart::PreparedImage { image } => {
                assets.insert(image.original.id().clone());
                assets.insert(image.prepared.id().clone());
            }
            PromptPart::RetainedFile { work } => {
                assets.insert(work.asset().id().clone());
            }
            _ => {}
        }
    }
    Ok(assets)
}

pub(super) fn has_retained_assets(input: &Submission) -> bool {
    is_stored_input(&input.payload) && accepted_assets(input).is_ok_and(|assets| !assets.is_empty())
}

pub(super) fn edit_fingerprint(
    checkout: &ChangeId,
    text: &Option<String>,
    attachments: &[AttachmentEdit],
) -> Result<Fingerprint> {
    let entries = attachments
        .iter()
        .map(|entry| match entry {
            AttachmentEdit::Keep(index) => serde_json::json!(["keep", index]),
            AttachmentEdit::Add(PromptPart::SelectedImage { selection }) => {
                serde_json::json!(["image", selection])
            }
            AttachmentEdit::Add(PromptPart::File { file }) => {
                serde_json::json!(["file", file.name, file.digest, file.byte_len()])
            }
            AttachmentEdit::Add(PromptPart::FileReference { reference }) => {
                serde_json::json!(["reference", reference])
            }
            AttachmentEdit::Add(_) => unreachable!("attachment edit contains only selected input"),
        })
        .collect::<Vec<_>>();
    Fingerprint::of(&(checkout, text, entries))
}

impl Host {
    /// Resolve provisional bytes against durable admission. Callers hold the
    /// admission gate while another same-session intake could still publish.
    async fn reconcile_input_assets(
        &self,
        session: &SessionId,
        cwd: &Path,
        storage: &Arc<retained_inputs::RetainedInputs>,
    ) -> Result<()> {
        let read = (session.clone(), cwd.to_owned(), storage.clone());
        let pending =
            tokio::task::spawn_blocking(move || read.2.pending_input_assets(&read.0, &read.1))
                .await
                .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))??;
        if pending.is_empty() {
            return Ok(());
        }
        let mut accepted = BTreeMap::new();
        let mut decisions = Vec::with_capacity(pending.len());
        for record in pending {
            let assets = match accepted.entry(record.input.clone()) {
                std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                std::collections::btree_map::Entry::Vacant(entry) => {
                    let input = self
                        .store
                        .input(session.clone(), record.input.clone())
                        .await?;
                    entry.insert(
                        input
                            .as_ref()
                            .map(|view| accepted_assets(&view.input))
                            .transpose()?
                            .unwrap_or_default(),
                    )
                }
            };
            let keep = assets.contains(&record.asset);
            decisions.push((record, keep));
        }
        let write = (session.clone(), cwd.to_owned(), storage.clone());
        tokio::task::spawn_blocking(move || {
            write.2.finish_input_assets(&write.0, &write.1, decisions)
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))?
    }

    pub(super) async fn settle_input_assets(&self, session: &SessionId) {
        let result = async {
            let Some(storage) = &self.execution()?.retained_inputs else {
                return Ok(());
            };
            let view = self.store.inspect(session.clone()).await?;
            let cwd = session_configuration(&view)?.cwd;
            self.reconcile_input_assets(session, &cwd, storage).await
        }
        .await;
        if result.is_err() {
            // A later intake will reconcile again. The durable receipt remains authoritative.
            eprintln!("[agent] retained input custody reconciliation deferred");
        }
    }

    pub(super) fn check_attachment_paths(&self, parts: &[PromptPart], cwd: &Path) -> Result<()> {
        for part in parts {
            if let PromptPart::FileReference { reference } = part {
                file_references::check_workspace_path(reference, cwd)?;
            }
            if let PromptPart::SelectedImage { selection } = part {
                selection.validate()?;
                let path = Path::new(&selection.path);
                if selection.source == ImageSource::Snapshot {
                    images::check_snapshot_path(self.state_dir.as_deref(), path)?;
                } else {
                    if let Some(state) = &self.state_dir {
                        crate::workspace::ProtectedRoots::new(vec![state.to_path_buf()])?
                            .check(path)?;
                    }
                    if let Some(permissions) = &self.permissions {
                        permissions.check_selected_image(path)?;
                    }
                }
            }
            if let PromptPart::File { file } = part
                && let Some((selection, _)) = &file.source
            {
                images::check_snapshot_path(self.state_dir.as_deref(), Path::new(&selection.path))?;
            }
        }
        Ok(())
    }

    pub(super) async fn retain_prompt_attachments(
        &self,
        session: &SessionId,
        cwd: &Path,
        input: &ChangeId,
        parts: Vec<PromptPart>,
    ) -> Result<Vec<PromptPart>> {
        if !parts.iter().any(is_upload) {
            return Ok(parts);
        }
        if !self.accepts_images()
            && parts.iter().any(|part| {
                matches!(
                    part,
                    PromptPart::Image { .. } | PromptPart::SelectedImage { .. }
                )
            })
        {
            return Err(problem(ErrorKind::Unsupported, "image_input_unavailable"));
        }
        let storage = self
            .execution()?
            .retained_inputs
            .clone()
            .ok_or_else(|| problem(ErrorKind::Unsupported, "file_attachment_unavailable"))?;
        self.reconcile_input_assets(session, cwd, &storage).await?;
        let session = session.clone();
        let cwd = cwd.to_owned();
        let input = input.clone();
        tokio::task::spawn_blocking(move || {
            let mut source_bytes = 0;
            let parts = parts
                .into_iter()
                .map(|part| match part {
                    PromptPart::SelectedImage { selection } => {
                        let image = selection.read()?;
                        source_bytes += image
                            .source
                            .as_ref()
                            .map_or(image.bytes.len(), |source| source.bytes.len());
                        if source_bytes > MAX_ATTACHMENT_SOURCE_BYTES {
                            return Err(problem(
                                ErrorKind::LimitExceeded,
                                "attachment_batch_bytes_limit",
                            ));
                        }
                        Ok(PromptPart::Image { image })
                    }
                    PromptPart::File { file } => Ok(PromptPart::File {
                        file: file.read_staged()?,
                    }),
                    other => Ok(other),
                })
                .collect::<Result<Vec<_>>>()?;
            storage.retain_prompt_parts(&session, &cwd, &input, parts)
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))?
    }

    pub(super) async fn replace_queued_attachments(
        &self,
        view: &SessionView,
        original: &Submission,
        id: ChangeId,
        text: Option<String>,
        attachments: Vec<AttachmentEdit>,
        intent: Fingerprint,
    ) -> Result<Submission> {
        if !queued_text::text_editable(original) {
            return Err(problem(ErrorKind::Conflict, "queued_text_not_editable"));
        }
        let prompt = decode_input::<StoredPrompt>(original)?;
        let cwd = session_configuration(view)?.cwd;
        let owned = prompt
            .parts
            .iter()
            .filter(|part| is_attachment(part))
            .cloned()
            .collect::<Vec<_>>();
        let mut kept = BTreeSet::new();
        let mut next = Vec::new();
        for attachment in attachments {
            match attachment {
                AttachmentEdit::Keep(index) => {
                    let part =
                        owned
                            .get(index)
                            .filter(|_| kept.insert(index))
                            .ok_or_else(|| {
                                problem(ErrorKind::Conflict, "queue_attachment_unavailable")
                            })?;
                    next.push(part.clone());
                }
                AttachmentEdit::Add(part) => {
                    self.check_attachment_paths(std::slice::from_ref(&part), &cwd)?;
                    next.push(part);
                }
            }
        }
        let mut parts = Vec::with_capacity(prompt.parts.len() + next.len() + 1);
        let mut inserted_text = false;
        let mut insert_at = None;
        for part in prompt.parts {
            if is_attachment(&part) {
                insert_at.get_or_insert(parts.len());
                continue;
            }
            match (&text, &part) {
                (Some(text), PromptPart::Text { .. }) => {
                    if !inserted_text && !text.is_empty() {
                        parts.push(PromptPart::Text { text: text.clone() });
                    }
                    inserted_text = true;
                }
                _ => parts.push(part),
            }
        }
        parts.splice(
            insert_at.unwrap_or(parts.len())..insert_at.unwrap_or(parts.len()),
            next,
        );
        if !inserted_text
            && let Some(text) = text
            && !text.is_empty()
        {
            parts.insert(0, PromptPart::Text { text });
        }
        if (prompt.editor_tool_context_id.is_some() || prompt.editor_svg_target.is_some())
            && parts.iter().any(is_attachment)
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "editor_tool_context_requires_attached_act_text",
            ));
        }
        if prompt.editor_tool_context_id.is_some()
            && !parts
                .iter()
                .any(|part| matches!(part, PromptPart::Text { text } if !text.trim().is_empty()))
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "editor_tool_context_requires_attached_act_text",
            ));
        }
        check_count(&parts)?;
        validate_prompt_record(&parts)?;
        if parts.iter().any(is_upload) {
            let host = self
                .for_retained_input(original, "chat_selection_route_changed")
                .await?;
            parts = host
                .retain_prompt_attachments(&view.session, &cwd, &id, parts)
                .await?;
        }
        let mut value: serde_json::Map<String, serde_json::Value> = decode_input(original)?;
        value.remove("preceding_turn");
        if image_generation::attached_image(&parts, &view.session).is_none() {
            value.insert("allow_attachment_reference".into(), false.into());
        }
        value.insert("queue_attachment_edit".into(), intent.to_hex().into());
        value.insert(
            "parts".into(),
            serde_json::to_value(parts)
                .map_err(|_| problem(ErrorKind::InvalidState, "input_encoding_failed"))?,
        );
        Ok(Submission {
            id,
            payload: Envelope::new(
                original.payload.schema().clone(),
                original.payload.version(),
                serde_json::to_vec(&value)
                    .map_err(|_| problem(ErrorKind::InvalidState, "input_encoding_failed"))?,
            )?,
        })
    }
}
