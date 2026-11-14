//! GRIDA-SEC-004 — a file reference names a local file and grants nothing.
//!
//! The host records the reference with the person's message and shows the
//! model its path and facts. It never opens the file: the agent reaches it
//! only through tools its permissions already allow, so a reference cannot
//! widen what the agent may read.

use super::problem;
use agent_kit_core::messages::{MediaRef, Retention};
use agent_kit_core::{ArtifactId, BindingId, ErrorKind, Fingerprint, Result};
use grida_agent_master::file_reference::{self, FileReference};
use std::path::Path;

/// At most one reference per message, like other attachments.
pub(super) const MAX_REFERENCES: usize = 1;

pub(super) fn media(reference: &FileReference) -> Result<MediaRef> {
    reference
        .validate()
        .map_err(|code| problem(ErrorKind::InvalidInput, code))?;
    let identity = Fingerprint::of(reference)?;
    let id = uuid::Uuid::from_bytes(
        identity.bytes()[..16]
            .try_into()
            .expect("fingerprint prefix"),
    );
    Ok(MediaRef {
        id: ArtifactId::new(format!("file-reference/{id}"))?,
        media_type: file_reference::MEDIA_TYPE.into(),
        locator: file_reference::locator(reference),
        access_scope: BindingId::new("file-reference")?,
        retention: Retention::Retained,
    })
}

/// A workspace path must name the same file as the absolute path, inside the
/// chat's working directory. The host compares the two strings only.
pub(super) fn check_workspace_path(reference: &FileReference, cwd: &Path) -> Result<()> {
    let Some(relative) = &reference.workspace_path else {
        return Ok(());
    };
    if cwd.join(relative) != Path::new(&reference.path) {
        return Err(problem(
            ErrorKind::InvalidInput,
            "file_reference_workspace_mismatch",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reference() -> FileReference {
        FileReference {
            name: "clip.mov".into(),
            path: "/work/project/media/clip.mov".into(),
            workspace_path: Some("media/clip.mov".into()),
            mime_type: Some("video/quicktime".into()),
            size: Some(42),
            preview: None,
        }
    }

    #[test]
    fn a_reference_is_a_retained_display_part_with_a_stable_identity() {
        let first = media(&reference()).unwrap();
        assert_eq!(first, media(&reference()).unwrap());
        assert_eq!(file_reference::reference(&first), Some(reference()));
        assert!(first.id.as_str().starts_with("file-reference/"));
    }

    #[test]
    fn the_workspace_path_must_match_the_absolute_path() {
        check_workspace_path(&reference(), Path::new("/work/project")).unwrap();
        let error = check_workspace_path(&reference(), Path::new("/work/other")).unwrap_err();
        assert_eq!(error.code, "file_reference_workspace_mismatch");
        let mut outside = reference();
        outside.workspace_path = None;
        check_workspace_path(&outside, Path::new("/work/other")).unwrap();
    }
}
