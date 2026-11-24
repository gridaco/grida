//! GRIDA-SEC-004 — ordered attachment intake through authenticated ACP extensions.

use super::*;
use crate::host::AttachmentEdit;
use grida_agent_master::file_reference::FileReference;

pub(super) const CAPABILITY: &str = "co.grida/session/attachment-batches";
const MAX_INLINE_BYTES: usize = 384 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Attachment {
    Image {
        selection: crate::host::SelectedImage,
    },
    File {
        name: String,
        data: String,
    },
    StagedFile {
        selection: crate::host::SelectedImage,
        size: usize,
    },
    Reference {
        reference: FileReference,
    },
    Keep {
        index: usize,
    },
}

impl std::fmt::Debug for Attachment {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let kind = match self {
            Self::Image { .. } => "image",
            Self::File { .. } => "file",
            Self::StagedFile { .. } => "staged_file",
            Self::Reference { .. } => "reference",
            Self::Keep { .. } => "keep",
        };
        formatter
            .debug_struct("Attachment")
            .field("kind", &kind)
            .finish()
    }
}

pub(super) fn decode(
    attachments: Vec<Attachment>,
    sessions: &Mutex<ConnectionSessions>,
    session: &SessionId,
    edit: bool,
) -> Result<Vec<AttachmentEdit>> {
    require(sessions, CAPABILITY, Some(session))?;
    if attachments.len() > crate::host::MAX_ATTACHMENTS {
        return Err(Error::invalid_params().data("attachment_count_limit"));
    }
    let mut bytes = 0;
    attachments
        .into_iter()
        .map(|attachment| {
            let part = match attachment {
                Attachment::Keep { index } if edit => return Ok(AttachmentEdit::Keep(index)),
                Attachment::Keep { .. } => {
                    return Err(Error::invalid_params().data("queue_attachment_unavailable"));
                }
                Attachment::Image { selection } => {
                    require(sessions, IMAGE_INTAKE, Some(session))?;
                    selection.validate().map_err(host_error)?;
                    PromptPart::SelectedImage { selection }
                }
                Attachment::File { name, data } => {
                    require(sessions, FILE_INTAKE, Some(session))?;
                    let file = crate::host::FileUpload::decode(&name, &data).map_err(host_error)?;
                    bytes += file.byte_len();
                    if bytes > MAX_INLINE_BYTES {
                        return Err(Error::invalid_params().data("attachment_batch_bytes_limit"));
                    }
                    PromptPart::File { file }
                }
                Attachment::StagedFile { selection, size } => {
                    require(sessions, FILE_INTAKE, Some(session))?;
                    PromptPart::File {
                        file: crate::host::FileUpload::staged(selection, size)
                            .map_err(host_error)?,
                    }
                }
                Attachment::Reference { reference } => {
                    require(sessions, FILE_REFERENCE, Some(session))?;
                    reference
                        .validate()
                        .map_err(|code| Error::invalid_params().data(code))?;
                    PromptPart::FileReference { reference }
                }
            };
            Ok(AttachmentEdit::Add(part))
        })
        .collect()
}

pub(super) fn append(
    parts: &mut Vec<PromptPart>,
    attachments: Vec<Attachment>,
    sessions: &Mutex<ConnectionSessions>,
    session: &SessionId,
    incompatible: bool,
) -> Result<()> {
    if parts.iter().any(crate::host::is_attachment) {
        return Err(Error::invalid_params().data("attachment_batch_conflict"));
    }
    let entries = decode(attachments, sessions, session, false)?;
    let has_text = parts
        .iter()
        .any(|part| matches!(part, PromptPart::Text { text } if !text.trim().is_empty()));
    for entry in entries {
        let AttachmentEdit::Add(part) = entry else {
            return Err(Error::invalid_params().data("queue_attachment_unavailable"));
        };
        match part {
            PromptPart::File { .. } if incompatible => {
                return Err(Error::invalid_params().data("selected_file_options_unsupported"));
            }
            PromptPart::FileReference { .. } if incompatible => {
                return Err(Error::invalid_params().data("file_reference_options_unsupported"));
            }
            PromptPart::File { .. } if !has_text => {
                return Err(Error::invalid_params().data("selected_file_requires_text"));
            }
            PromptPart::FileReference { .. } if !has_text => {
                return Err(Error::invalid_params().data("file_reference_requires_text"));
            }
            _ => parts.push(part),
        }
    }
    Ok(())
}
