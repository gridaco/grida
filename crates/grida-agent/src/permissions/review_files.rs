//! GRIDA-SEC-004 / GRIDA-SEC-014 — read-only evidence for the automatic reviewer.

use super::*;

impl TurnPermissions {
    pub(crate) const MAX_REVIEW_FILE_BYTES: usize = 8 * 1024;

    /// Private review uses the primary directory's independently granted reads.
    pub(crate) fn allows_review_inspection(&self) -> bool {
        cfg!(any(target_os = "macos", target_os = "linux"))
            && self.approve_for_me
            && !self.primary_review
            && !self.profile.hooks_only
            && !self.profile.unconfined
            && self.binding.get().is_some()
            && self.profile.allows_primary_review()
            && self
                .profile
                .workspace
                .primary()
                .is_some_and(|id| self.state().is_ok_and(|state| !state.revoked.contains(id)))
    }

    pub(crate) fn read_review_file(&self, relative: &Path) -> Result<String> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            use crate::file_tools::{
                open_root_file, read_bounded_text, validate_path, verify_named_file,
            };
            if !self.allows_review_inspection() {
                return Err(denied());
            }
            validate_path(relative)?;
            let root = self.captured_directory(None)?;
            let path = root.root().join(relative);
            self.profile.protected.check(&path)?;
            let mut file = open_root_file(root.pinned_directory(), root.root(), relative)?;
            // A descriptor can survive a concurrent move, unlink or revocation.
            verify_named_file(&file, &path)?;
            let text = read_bounded_text(&mut file, Self::MAX_REVIEW_FILE_BYTES, || {
                self.captured_directory(None).map(|_| ())
            })?;
            verify_named_file(&file, &path)?;
            self.profile.protected.check(&path)?;
            self.captured_directory(None)?;
            Ok(text)
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = relative;
            Err(denied())
        }
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn review_discards_a_read_if_the_open_file_moved_or_gained_an_alias() {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().canonicalize().unwrap();
        let path = root.join("note.txt");
        let moved = root.join("moved.txt");
        fs::write(&path, "local evidence").unwrap();
        let opened = fs::File::open(&path).unwrap();
        crate::file_tools::verify_named_file(&opened, &path).unwrap();
        fs::hard_link(&path, &moved).unwrap();
        assert!(crate::file_tools::verify_named_file(&opened, &path).is_err());
        fs::remove_file(&moved).unwrap();
        fs::rename(&path, moved).unwrap();
        assert!(crate::file_tools::verify_named_file(&opened, &path).is_err());
    }

    #[test]
    fn private_review_reads_only_bounded_files_from_the_granted_primary_workspace() {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().canonicalize().unwrap();
        let project = root.join("workspace");
        let protected = root.join("protected");
        fs::create_dir(&project).unwrap();
        fs::create_dir(&protected).unwrap();
        let secret = protected.join("private.txt");
        fs::write(&secret, "protected").unwrap();
        fs::write(project.join("task.txt"), "local evidence").unwrap();
        fs::write(project.join("large.txt"), vec![b'x'; 8193]).unwrap();
        fs::write(project.join("binary"), [0, 1]).unwrap();
        std::os::unix::fs::symlink(&secret, project.join("alias")).unwrap();
        fs::hard_link(&secret, project.join("linked")).unwrap();
        let mut profile =
            super::super::full_access_tests::profile(&project).with_approve_for_me(true);
        profile.protected = Arc::new(ProtectedRoots::new(vec![protected]).unwrap());
        profile.allow_full_access = true;
        let directory = profile.workspace.primary().unwrap().clone();
        let bind = |profile: &Arc<PermissionProfile>, mode: PermissionMode| {
            let capture = profile
                .capture_mode(ScopeId::new("input").unwrap(), mode)
                .unwrap();
            profile
                .bind(
                    &capture,
                    TurnBinding {
                        session: SessionId::new("chat").unwrap(),
                        turn: TurnId::new("turn").unwrap(),
                        epoch: 1,
                    },
                    Arc::new(SqliteStore::open_in_memory().unwrap()),
                    true,
                )
                .unwrap()
        };
        let readable = Arc::new(profile);
        let owner = bind(&readable, PermissionMode::ApproveForMe);
        assert!(owner.allows_review_inspection());
        assert_eq!(
            owner.read_review_file(Path::new("task.txt")).unwrap(),
            "local evidence"
        );
        for invalid in [
            "../protected/private.txt",
            "alias",
            "linked",
            "large.txt",
            "binary",
            "",
            "https://example.test/source",
        ] {
            assert!(
                owner.read_review_file(Path::new(invalid)).is_err(),
                "{invalid}"
            );
        }
        assert!(owner.read_review_file(&secret).is_err());
        owner.revoke(&directory).unwrap();
        assert!(!owner.allows_review_inspection());
        assert!(owner.read_review_file(Path::new("task.txt")).is_err());
        let full = bind(&readable, PermissionMode::FullAccess);
        assert!(!full.allows_review_inspection());
        assert!(full.read_review_file(Path::new("task.txt")).is_err());
        let mut restricted = (*readable).clone();
        restricted.directories.get_mut(&directory).unwrap().read = AccessRule::Ask;
        let no_grant = bind(&Arc::new(restricted), PermissionMode::ApproveForMe);
        assert!(!no_grant.allows_review_inspection());
        assert!(no_grant.read_review_file(Path::new("task.txt")).is_err());
        assert_eq!(fs::read_to_string(&secret).unwrap(), "protected");
    }
}
