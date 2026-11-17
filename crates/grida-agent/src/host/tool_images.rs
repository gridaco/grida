//! GRIDA-SEC-004 — exact retained tool-result images, never source-path authority.

use super::{Host, images::asset_ref, problem};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, MediaRef, OutcomeStatus, ResultContent, Role, ToolResult};
use agent_kit_core::{ArtifactId, ErrorKind, Result, SessionId, ToolCallId, TurnId};
use serde::Serialize;
use std::sync::Arc;

pub(crate) const MAX_IMAGES: usize = 8;
pub(crate) const MAX_CONTENT: usize = 1024;
pub(crate) const CHUNK_BYTES: usize = 256 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolImage {
    pub media_id: ArtifactId,
    pub content_index: usize,
    pub mime_type: &'static str,
    pub total_bytes: u64,
}

fn reference(media: &MediaRef, owner: &SessionId, index: usize) -> Option<ToolImage> {
    if index >= MAX_CONTENT
        || !media
            .id
            .as_str()
            .starts_with(super::retained_inputs::WORKSPACE_VIEW)
        || media.id.as_str().len() > 512
    {
        return None;
    }
    let asset = asset_ref(media).ok()?;
    (asset.owner() == owner
        && asset.size() > 0
        && asset.size() <= super::image_preparation::MAX_PREPARED_BYTES as u64)
        .then(|| ToolImage {
            media_id: media.id.clone(),
            content_index: index,
            mime_type: "image/png",
            total_bytes: asset.size(),
        })
}

/// Projection is metadata only: retention is not a promise that bytes remain
/// available. The read operation checks membership and retained integrity.
pub(crate) fn references(result: &ToolResult, owner: &SessionId) -> Vec<ToolImage> {
    if result.status != OutcomeStatus::Succeeded {
        return Vec::new();
    }
    result
        .content
        .iter()
        .take(MAX_CONTENT)
        .enumerate()
        .filter_map(|(index, part)| {
            let ResultContent::Media(media) = part else {
                return None;
            };
            reference(media, owner, index)
        })
        .collect()
}

impl Host {
    pub(crate) async fn read_tool_image_chunk(
        &self,
        session: SessionId,
        turn: TurnId,
        call: ToolCallId,
        media_id: ArtifactId,
        content_index: usize,
        offset: usize,
    ) -> Result<(usize, Vec<u8>, Option<usize>)> {
        if content_index >= MAX_CONTENT || !offset.is_multiple_of(CHUNK_BYTES) {
            return Err(unavailable());
        }
        let media = self
            .tool_image_reference(&session, &turn, &call, &media_id, content_index)
            .await?;
        let selected = media.clone();
        let state = self.state_dir.clone().ok_or_else(unavailable)?;
        let images = self
            .execution
            .as_ref()
            .and_then(|execution| execution.retained_inputs.clone());
        let bytes = tokio::task::spawn_blocking(move || {
            let images = match images {
                Some(images) => images,
                None => Arc::new(super::retained_inputs::RetainedInputs::open(&state)?),
            };
            let bytes = images.resolve(&selected, super::image_preparation::MAX_PREPARED_BYTES)?;
            super::images::validate_prepared_png(&bytes)?;
            Ok::<_, agent_kit_core::Error>(bytes)
        })
        .await
        .map_err(|_| unavailable())?
        .map_err(|_| unavailable())?;
        if self
            .tool_image_reference(&session, &turn, &call, &media_id, content_index)
            .await?
            != media
            || offset >= bytes.len()
        {
            return Err(unavailable());
        }
        let total = bytes.len();
        let end = offset.saturating_add(CHUNK_BYTES).min(total);
        Ok((
            total,
            bytes[offset..end].to_vec(),
            (end < total).then_some(end),
        ))
    }

    /// The store addresses one committed local turn snapshot directly. No
    /// chat-length scan, inherited seed or client-supplied locator is involved.
    async fn tool_image_reference(
        &self,
        session: &SessionId,
        turn: &TurnId,
        call: &ToolCallId,
        media_id: &ArtifactId,
        content_index: usize,
    ) -> Result<MediaRef> {
        let owner = session.clone();
        let call = call.clone();
        let media_id = media_id.clone();
        self.store
            .inspect_turn_with(session.clone(), turn.clone(), move |state| {
                let mut selected = None;
                let mut calls = 0;
                let mut results = 0;
                for HistoryRecord::Message(message) in state.history().records() {
                    for content in &message.content {
                        match content {
                            Content::ToolCall(candidate)
                                if message.role == Role::Assistant && candidate.id == call =>
                            {
                                calls += 1;
                            }
                            Content::ToolResult(result)
                                if message.role == Role::Tool && result.call == call =>
                            {
                                results += 1;
                                if result.status != OutcomeStatus::Succeeded {
                                    return Err(unavailable());
                                }
                                let Some(ResultContent::Media(media)) =
                                    result.content.get(content_index)
                                else {
                                    return Err(unavailable());
                                };
                                if media.id != media_id
                                    || reference(media, &owner, content_index).is_none()
                                {
                                    return Err(unavailable());
                                }
                                selected = Some(media.clone());
                            }
                            _ => {}
                        }
                    }
                }
                if calls != 1 || results != 1 {
                    return Err(unavailable());
                }
                selected.ok_or_else(unavailable)
            })
            .await
            .map_err(|_| unavailable())
    }
}

fn unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "tool_image_unavailable")
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::messages::Retention;
    use serde_json::json;

    fn result() -> (SessionId, ToolResult) {
        let owner = SessionId::new("owner").unwrap();
        let asset: crate::scratch::AssetRef = serde_json::from_value(json!({
            "owner":owner,"id":"workspace-view/captured","version":1,
            "name":"image.png","size":300000,"digest":vec![0;32]
        }))
        .unwrap();
        let media = super::super::images::media(&asset).unwrap();
        (
            owner,
            ToolResult {
                call: ToolCallId::new("call").unwrap(),
                status: OutcomeStatus::Succeeded,
                content: vec![
                    ResultContent::Text("Prepared a bounded view.".into()),
                    ResultContent::Media(media),
                ],
                structured: None,
                truncated: false,
            },
        )
    }

    #[test]
    fn projection_requires_success_retention_owner_and_workspace_view_namespace() {
        let (owner, mut result) = result();
        let projected = references(&result, &owner);
        assert_eq!(
            serde_json::to_value(&projected).unwrap(),
            json!([{
                "mediaId":"workspace-view/captured","contentIndex":1,"mimeType":"image/png","totalBytes":300000
            }])
        );
        assert!(references(&result, &SessionId::new("foreign").unwrap()).is_empty());
        for status in [
            OutcomeStatus::Failed,
            OutcomeStatus::Cancelled,
            OutcomeStatus::Uncertain,
        ] {
            result.status = status;
            assert!(references(&result, &owner).is_empty());
        }
        result.status = OutcomeStatus::Succeeded;
        let ResultContent::Media(media) = &mut result.content[1] else {
            unreachable!()
        };
        media.retention = Retention::Ephemeral;
        assert!(references(&result, &owner).is_empty());
        let (_, mut result) = self::result();
        let ResultContent::Media(media) = &mut result.content[1] else {
            unreachable!()
        };
        media.id = ArtifactId::new("input/not-tool-output").unwrap();
        assert!(references(&result, &owner).is_empty());
    }

    #[test]
    fn prepared_png_validation_preserves_sixteen_bit_pixels_and_refuses_overlarge_dimensions() {
        let encode = |width, height| {
            let mut encoded = Vec::new();
            {
                let mut encoder = png::Encoder::new(&mut encoded, width, height);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Sixteen);
                let mut writer = encoder.write_header().unwrap();
                writer
                    .write_image_data(&vec![0; width as usize * height as usize * 8])
                    .unwrap();
            }
            encoded
        };
        let accepted = encode(2048, 1024);
        assert!(accepted.len() <= super::super::image_preparation::MAX_PREPARED_BYTES);
        super::super::images::validate_prepared_png(&accepted).unwrap();
        assert!(super::super::images::validate_prepared_png(&encode(2049, 1)).is_err());
        assert!(super::super::images::validate_prepared_png(b"not a PNG").is_err());
    }

    #[test]
    fn result_content_index_is_bounded_and_does_not_use_text_as_authority() {
        let (owner, mut result) = result();
        let media = result.content[1].clone();
        result.content = vec![ResultContent::Text("workspace-view/captured".into()); MAX_CONTENT];
        result.content.push(media.clone());
        assert!(references(&result, &owner).is_empty());
        result.content[MAX_CONTENT - 1] = media;
        let projected = references(&result, &owner);
        assert_eq!(projected.len(), 1);
        assert_eq!(projected[0].content_index, MAX_CONTENT - 1);
    }
}
