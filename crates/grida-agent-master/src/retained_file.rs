//! Model-facing display of an attachment held by the native file owner.

use agent_kit_core::messages::{MediaRef, Retention};

pub const MEDIA_TYPE: &str = "application/octet-stream";
pub const LOCATOR_PREFIX: &str = "retained-file-name:";
pub const MAX_NAME_BYTES: usize = 100;

pub fn display(media: &MediaRef) -> Option<String> {
    display_name(name(media)?)
}

/// The attachment's file name, when `media` is a retained file attachment.
pub fn name(media: &MediaRef) -> Option<&str> {
    if media.media_type != MEDIA_TYPE || media.retention != Retention::Retained {
        return None;
    }
    let name = media.locator.strip_prefix(LOCATOR_PREFIX)?;
    display_name(name).map(|_| name)
}

pub fn display_name(name: &str) -> Option<String> {
    if name.is_empty()
        || name.len() > MAX_NAME_BYTES
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return None;
    }
    Some(format!("\n\nAttached file {name}."))
}
