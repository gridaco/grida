//! Caption edits are host-owned transformations of immutable accepted input.

use super::*;

pub(super) fn text_editable(input: &Submission) -> bool {
    is_stored_input(&input.payload)
        && decode_input::<StoredPrompt>(input).is_ok_and(|prompt| {
            prompt.goal.is_none()
                && !prompt.allow_library_selection
                && !prompt.allow_wakeups
                && prompt.subagent.is_none()
                && prompt.worker.is_none()
        })
}

fn replacement(original: &Submission, id: ChangeId, text: String) -> Result<Submission> {
    if !text_editable(original) {
        return Err(problem(ErrorKind::Conflict, "queued_text_not_editable"));
    }
    let prompt = decode_input::<StoredPrompt>(original)?;
    if prompt.editor_tool_context_id.is_some() && text.trim().is_empty() {
        return Err(problem(
            ErrorKind::Unsupported,
            "editor_tool_context_requires_attached_act_text",
        ));
    }
    let mut inserted = false;
    let mut parts = Vec::with_capacity(prompt.parts.len() + 1);
    for part in prompt.parts {
        if matches!(part, PromptPart::Text { .. }) {
            if !inserted && !text.is_empty() {
                parts.push(PromptPart::Text { text: text.clone() });
            }
            inserted = true;
        } else {
            parts.push(part);
        }
    }
    if !inserted && !text.is_empty() {
        parts.insert(0, PromptPart::Text { text });
    }
    validate_prompt_record(&parts)?;
    // Change only the parts member. Unknown captured fields and all existing
    // settings/authority values survive without recapturing current defaults.
    let mut value: serde_json::Value = decode_input(original)?;
    value["parts"] = serde_json::to_value(parts)
        .map_err(|_| problem(ErrorKind::InvalidState, "input_encoding_failed"))?;
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

impl Host {
    pub(crate) async fn queued_text_editable(
        &self,
        session: &SessionId,
        input: &ChangeId,
        expected: SessionRevision,
    ) -> Result<bool> {
        let view = self.store.inspect(session.clone()).await?;
        if view.revision != expected {
            return Err(problem(ErrorKind::Conflict, "session_revision_changed"));
        }
        Ok(view.queued.iter().any(|row| {
            &row.input.id == input
                && row.disposition == InputDisposition::Queued
                && text_editable(&row.input)
        }))
    }

    /// Replace only user text, preserving the exact captured non-text input,
    /// settings and authority. A retry replays the original control receipt.
    pub async fn replace_queued_text(
        &self,
        session: SessionId,
        request: ChangeId,
        expected: SessionRevision,
        input: ChangeId,
        replacement_id: ChangeId,
        text: String,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let _admission = host.configuration_admission.lock().await;
            let original = host
                .store
                .input(session.clone(), input.clone())
                .await?
                .ok_or_else(|| problem(ErrorKind::Unavailable, "input_unavailable"))?;
            let control = ControlRequest {
                id: request,
                session,
                expected_revision: expected,
                action: SessionControl::ReplaceQueued {
                    input,
                    replacement: replacement(&original.input, replacement_id, text)?,
                },
            };
            // The original input is immutable even after supersession. Derive
            // the identical action before checking membership so lost replies
            // remain recoverable after admission or a process restart.
            if let Some(receipt) = host.store.control_receipt(control.clone()).await? {
                return Ok(receipt);
            }
            if original.disposition != InputDisposition::Queued {
                return Err(problem(ErrorKind::Conflict, "queued_text_not_editable"));
            }
            host.store.control(control).await
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn text_transformation_preserves_every_other_captured_field_and_refuses_special_inputs() {
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
        let view = host.inspect(session.clone()).await.unwrap();
        let request = PromptRequest {
            id: ChangeId::new("original").unwrap(),
            session,
            parts: vec![
                PromptPart::Text {
                    text: "First".into(),
                },
                PromptPart::ResourceLink {
                    name: "Reference".into(),
                    uri: "urn:reference".into(),
                    mime_type: None,
                },
                PromptPart::Text {
                    text: "Second".into(),
                },
            ],
            questions: true,
            question_batches: false,
            operating_regime: None,
            effort: None,
            reasoning: None,
        };
        let policy = host.submission_policy(&request, false).unwrap();
        let mut original = host
            .capture_input(&view, request.id, request.parts, policy)
            .await
            .unwrap();
        let mut captured: serde_json::Value = decode_input(&original).unwrap();
        captured["future_capture"] = serde_json::json!({"opaque":"must survive"});
        original.payload = Envelope::new(
            original.payload.schema().clone(),
            original.payload.version(),
            serde_json::to_vec(&captured).unwrap(),
        )
        .unwrap();
        let changed = replacement(
            &original,
            ChangeId::new("changed").unwrap(),
            "Changed".into(),
        )
        .unwrap();
        let mut changed: serde_json::Value = decode_input(&changed).unwrap();
        let parts = changed.as_object_mut().unwrap().remove("parts").unwrap();
        assert_eq!(
            parts,
            serde_json::json!([
                {"kind":"text","text":"Changed"},captured["parts"][1]
            ])
        );
        captured.as_object_mut().unwrap().remove("parts");
        assert_eq!(changed, captured);
        let empty = replacement(&original, ChangeId::new("empty").unwrap(), String::new()).unwrap();
        let empty = decode_input::<StoredPrompt>(&empty).unwrap();
        assert!(matches!(
            empty.parts.as_slice(),
            [PromptPart::ResourceLink { .. }]
        ));
        let added = replacement(
            &Submission {
                id: ChangeId::new("empty").unwrap(),
                payload: Envelope::new(
                    original.payload.schema().clone(),
                    original.payload.version(),
                    serde_json::to_vec(&empty).unwrap(),
                )
                .unwrap(),
            },
            ChangeId::new("added").unwrap(),
            "Added".into(),
        )
        .unwrap();
        assert!(
            matches!(decode_input::<StoredPrompt>(&added).unwrap().parts.as_slice(),[PromptPart::Text { text }, PromptPart::ResourceLink { .. }] if text == "Added")
        );
        for field in ["allow_library_selection", "allow_wakeups"] {
            let mut value: serde_json::Value = decode_input(&original).unwrap();
            value[field] = true.into();
            let special = Submission {
                id: original.id.clone(),
                payload: Envelope::new(
                    original.payload.schema().clone(),
                    original.payload.version(),
                    serde_json::to_vec(&value).unwrap(),
                )
                .unwrap(),
            };
            assert!(!text_editable(&special), "{field}");
            assert_eq!(
                replacement(&special, ChangeId::new("refused").unwrap(), "No".into())
                    .unwrap_err()
                    .code,
                "queued_text_not_editable"
            );
        }
        let foreign = Submission {
            id: original.id.clone(),
            payload: Envelope::new(
                SchemaId::new("foreign.input").unwrap(),
                1,
                original.payload.bytes().to_vec(),
            )
            .unwrap(),
        };
        assert!(!text_editable(&foreign));
        host.shutdown().await.unwrap();
    }
}
