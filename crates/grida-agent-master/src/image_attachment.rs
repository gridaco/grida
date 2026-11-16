//! Product context for eager attached images and explicit historical omissions.
//!
//! Storage remains host-owned. This small context travels alongside its opaque
//! retained locator so the master can describe provenance without adding text
//! to the person's transcript or exposing storage internals to the model.

use agent_kit_core::messages::{Content, MediaRef, Message, ResultContent};
use serde::{Deserialize, Serialize};

pub const LOCATOR_PREFIX: &str = "retained-raster:";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub source: Source,
    pub source_width: u32,
    pub source_height: u32,
    pub width: u32,
    pub height: u32,
    pub first_frame: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Source {
    Disk { path: String },
    Snapshot { name: String, resource: String },
}

impl Context {
    pub fn description(&self) -> String {
        let identity = match &self.source {
            Source::Disk { path } => format!(
                "Attached image source path: {path:?}. This is the verified path at capture, not a new filesystem grant."
            ),
            Source::Snapshot { name, resource } => format!(
                "Attached image snapshot {name:?}, retained resource {resource:?}. No original local path was supplied."
            ),
        };
        let scale = if (self.width, self.height) != (self.source_width, self.source_height) {
            format!(
                " A bounded {}×{} view of the {}×{} source is supplied; it does not expose every original pixel.",
                self.width, self.height, self.source_width, self.source_height
            )
        } else {
            format!(" The supplied view is {}×{}.", self.width, self.height)
        };
        let frame = if self.first_frame {
            " Only the first still frame is supplied; the animation has not been inspected."
        } else {
            ""
        };
        format!("{identity}{scale}{frame}")
    }
}

fn context(media: &MediaRef) -> Option<Context> {
    #[derive(Deserialize)]
    struct Descriptor {
        context: Context,
    }
    let raw = media.locator.strip_prefix(LOCATOR_PREFIX)?;
    if raw.len() > 16 * 1024 {
        return None;
    }
    serde_json::from_str::<Descriptor>(raw)
        .ok()
        .map(|descriptor| descriptor.context)
}

/// Project accepted history into the current model's supported perception.
/// Intake rejects unsupported new image submissions before accepting them.
/// This projection neither erases the retained history nor claims inspection.
pub(crate) fn project(messages: &mut [Message], accepts_images: bool) {
    for message in messages {
        let mut projected = Vec::with_capacity(message.content.len());
        for part in std::mem::take(&mut message.content) {
            match part {
                Content::Media(media) if media.media_type.starts_with("image/") => {
                    if let Some(context) = context(&media) {
                        projected.push(Content::Text(if accepts_images {
                            context.description()
                        } else {
                            let source = match context.source {
                                Source::Disk { path } => format!(" Source path at capture: {path:?}."),
                                Source::Snapshot { name, resource } => format!(" Retained snapshot {name:?}, resource {resource:?}."),
                            };
                            format!("[An earlier image attachment is retained, but its pixels are omitted because this model does not accept images. It has not been inspected by this request.]{source}")
                        }));
                    } else if !accepts_images {
                        projected.push(Content::Text("[Earlier image pixels are omitted because this model does not accept images. The retained image has not been inspected by this request.]".into()));
                    }
                    if accepts_images {
                        projected.push(Content::Media(media));
                    }
                }
                Content::ToolResult(mut result) => {
                    if !accepts_images {
                        for content in &mut result.content {
                            if matches!(content, ResultContent::Media(media) if media.media_type.starts_with("image/"))
                            {
                                *content = ResultContent::Text("[Earlier tool image pixels are omitted because this model does not accept images; they have not been inspected by this request.]".into());
                            }
                        }
                    }
                    projected.push(Content::ToolResult(result));
                }
                other => projected.push(other),
            }
        }
        message.content = projected;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::messages::{Provenance, ProvenanceKind, Retention, Role};
    use agent_kit_core::{ArtifactId, BindingId, MessageId};

    fn message() -> Message {
        let context = Context {
            source: Source::Disk {
                path: "/photos/original.jpg".into(),
            },
            source_width: 4000,
            source_height: 3000,
            width: 1024,
            height: 768,
            first_frame: false,
        };
        Message {
            id: MessageId::new("image-input").unwrap(),
            role: Role::User,
            phase: None,
            provenance: Provenance {
                source: "test".into(),
                kind: ProvenanceKind::Supplied,
                fingerprint: None,
            },
            content: vec![Content::Media(MediaRef {
                id: ArtifactId::new("image-original").unwrap(),
                media_type: "image/png".into(),
                locator: format!(
                    "{LOCATOR_PREFIX}{}",
                    serde_json::json!({"context":context,"image":{"privateStorage":"opaque"}})
                ),
                access_scope: BindingId::new("test").unwrap(),
                retention: Retention::Retained,
            })],
        }
    }

    #[test]
    fn eager_projection_keeps_pixels_and_truthful_path_without_storage_internals() {
        let original = message();
        let mut projected = vec![original.clone()];
        project(&mut projected, true);
        assert_eq!(projected[0].content[1], original.content[0]);
        let Content::Text(description) = &projected[0].content[0] else {
            panic!()
        };
        assert!(description.contains("/photos/original.jpg"));
        assert!(description.contains("bounded"));
        assert!(!description.contains("privateStorage"));
    }

    #[test]
    fn text_only_projection_is_explicit_and_leaves_original_untouched() {
        let original = message();
        let mut projected = vec![original.clone()];
        project(&mut projected, false);
        assert_eq!(projected[0].content.len(), 1);
        let Content::Text(description) = &projected[0].content[0] else {
            panic!()
        };
        assert!(description.contains("omitted"));
        assert!(description.contains("not been inspected"));
        assert!(matches!(original.content[0], Content::Media(_)));
    }

    #[test]
    fn omitted_tool_pixels_preserve_call_result_correlation_and_outcome() {
        use agent_kit_core::ToolCallId;
        use agent_kit_core::messages::{OutcomeStatus, ToolResult};
        let mut tool = message();
        let Content::Media(media) = tool.content.remove(0) else {
            panic!()
        };
        let call = ToolCallId::new("observed-image-call").unwrap();
        tool.role = Role::Tool;
        tool.content = vec![Content::ToolResult(ToolResult {
            call: call.clone(),
            status: OutcomeStatus::Succeeded,
            content: vec![
                ResultContent::Text("The retained result remains available.".into()),
                ResultContent::Media(media),
            ],
            structured: None,
            truncated: false,
        })];
        let mut messages = vec![tool.clone()];
        project(&mut messages, false);
        let Content::ToolResult(result) = &messages[0].content[0] else {
            panic!()
        };
        assert_eq!(result.call, call);
        assert_eq!(result.status, OutcomeStatus::Succeeded);
        assert_eq!(
            result.content[0],
            match &tool.content[0] {
                Content::ToolResult(result) => result.content[0].clone(),
                _ => panic!(),
            }
        );
        assert!(
            matches!(&result.content[1], ResultContent::Text(text) if text.contains("omitted") && text.contains("not been inspected"))
        );
    }
}
