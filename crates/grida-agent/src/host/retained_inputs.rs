//! GRIDA-SEC-004 / GRIDA-SEC-014 — owner-scoped retained inputs and working copies.

use super::{
    images::{ImageUpload, MAX_IMAGE_BYTES, NAME, asset_ref, media, retained_unavailable},
    problem,
    retained_file::FileUpload,
};
use crate::file_tools::ImageCapture;
use crate::scratch::{AssetRef, ScratchLimits, ScratchScope, WorkingCopyProof, WorkingCopyReceipt};
use crate::workspace::ProtectedRoots;
use agent_kit_core::messages::MediaRef;
use agent_kit_core::{ArtifactId, ChangeId, ErrorKind, Fingerprint, Result, SessionId, WaitId};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const STORAGE: &str = "retained-inputs";
const SELECTED_IMAGE: &str = "input/";
pub(super) const WORKSPACE_VIEW: &str = "workspace-view/";
pub(super) const WORKSPACE_REFERENCE: &str = "workspace-reference/";
pub(super) const LIBRARY_SELECTION: &str = "library-selection/";
const LIMITS: ScratchLimits = ScratchLimits {
    max_assets: 16,
    max_asset_bytes: MAX_IMAGE_BYTES as u64,
    max_source_bytes: 2 * 1024 * 1024,
    max_work_bytes: 2 * 1024 * 1024,
};

pub(super) struct RetainedInputs {
    base: PathBuf,
    // ScratchScope has an exclusive per-session lock. Keep local intake and
    // provider reads from racing each other for it.
    access: Mutex<()>,
}

impl RetainedInputs {
    pub(super) fn retirement_identity(
        state_dir: &Path,
        session: &SessionId,
    ) -> Result<Option<[u8; 32]>> {
        crate::scratch::retirement_identity(state_dir, STORAGE, session)
    }

    pub(super) fn retire(state_dir: &Path, session: &SessionId, identity: [u8; 32]) -> Result<()> {
        crate::scratch::retire(state_dir, STORAGE, session, identity)
    }

    pub(super) fn open(state_dir: &Path) -> Result<Self> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            let state_dir = state_dir
                .canonicalize()
                .map_err(|_| storage_unavailable())?;
            crate::scratch::check_private_directory(&state_dir)?;
            Ok(Self {
                base: state_dir.join(STORAGE),
                access: Mutex::new(()),
            })
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = state_dir;
            Err(problem(
                ErrorKind::Unsupported,
                "attachment_storage_unsupported",
            ))
        }
    }

    pub(super) fn retain_image(
        &self,
        session: &SessionId,
        cwd: &Path,
        input: &ChangeId,
        upload: ImageUpload,
    ) -> Result<AssetRef> {
        let identity = Fingerprint::of(&(input, upload.digest))?;
        self.retain_png(session, cwd, SELECTED_IMAGE, identity, &upload.bytes)
    }

    pub(super) fn retain_library_image(
        &self,
        session: &SessionId,
        cwd: &Path,
        wait: &WaitId,
        upload: ImageUpload,
    ) -> Result<AssetRef> {
        let identity = Fingerprint::of(&(wait, upload.digest))?;
        self.retain_png(session, cwd, LIBRARY_SELECTION, identity, &upload.bytes)
    }

    pub(super) fn workspace_image_capture(
        self: &Arc<Self>,
        session: SessionId,
        cwd: PathBuf,
    ) -> Arc<ImageCapture> {
        self.workspace_png_capture(session, cwd, WORKSPACE_VIEW)
    }

    pub(super) fn workspace_reference_capture(
        self: &Arc<Self>,
        session: SessionId,
        cwd: PathBuf,
    ) -> Arc<ImageCapture> {
        self.workspace_png_capture(session, cwd, WORKSPACE_REFERENCE)
    }

    fn workspace_png_capture(
        self: &Arc<Self>,
        session: SessionId,
        cwd: PathBuf,
        namespace: &'static str,
    ) -> Arc<ImageCapture> {
        let storage = self.clone();
        Arc::new(move |bytes| {
            let image = ImageUpload::from_png(bytes)?;
            let identity = Fingerprint::of(&image.digest)?;
            let asset = storage.retain_png(&session, &cwd, namespace, identity, &image.bytes)?;
            media(&asset)
        })
    }

    fn retain_png(
        &self,
        session: &SessionId,
        cwd: &Path,
        namespace: &str,
        identity: Fingerprint,
        bytes: &[u8],
    ) -> Result<AssetRef> {
        let id = uuid::Uuid::from_bytes(
            identity.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        self.with_intake_scope(session, cwd, |scope| {
            scope.retain(ArtifactId::new(format!("{namespace}{id}"))?, 1, NAME, bytes)
        })
    }

    pub(super) fn retain_file(
        &self,
        session: &SessionId,
        cwd: &Path,
        input: &ChangeId,
        upload: FileUpload,
    ) -> Result<WorkingCopyReceipt> {
        self.with_intake_scope(session, cwd, |scope| {
            let identity = Fingerprint::of(&("retained-file", input, &upload.name, upload.digest))?;
            let id = uuid::Uuid::from_bytes(
                identity.bytes()[..16]
                    .try_into()
                    .expect("fingerprint prefix"),
            );
            let asset = scope.retain(
                ArtifactId::new(format!("input/{id}"))?,
                1,
                &upload.name,
                upload.bytes.as_slice(),
            )?;
            Ok(scope.materialize(&asset)?.receipt().clone())
        })
    }

    fn with_intake_scope<T>(
        &self,
        session: &SessionId,
        cwd: &Path,
        operate: impl FnOnce(&mut ScratchScope) -> Result<T>,
    ) -> Result<T> {
        let _access = self.access.lock().unwrap();
        let protected = ProtectedRoots::new(vec![cwd.to_owned()])?;
        protected.check(&self.base)?;
        #[cfg_attr(not(unix), allow(unused_mut))]
        let mut directory = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            directory.mode(0o700);
        }
        match directory.create(&self.base) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(storage_unavailable()),
        }
        let mut scope = ScratchScope::open(&self.base, session.clone(), LIMITS, &protected)?;
        operate(&mut scope)
    }

    pub(super) fn resolve(&self, media: &MediaRef, maximum: usize) -> Result<Vec<u8>> {
        let unavailable = || {
            if media.id.as_str().starts_with(WORKSPACE_VIEW) {
                problem(
                    ErrorKind::Unavailable,
                    "retained_workspace_image_unavailable",
                )
            } else {
                retained_unavailable()
            }
        };
        let asset = asset_ref(media).map_err(|_| unavailable())?;
        let _access = self.access.lock().unwrap();
        let protected = ProtectedRoots::new(vec![])?;
        ScratchScope::read_existing_retained(
            &self.base,
            LIMITS,
            &protected,
            &asset,
            maximum.min(MAX_IMAGE_BYTES),
        )
        .map_err(|error| {
            if error.kind == ErrorKind::LimitExceeded {
                error
            } else {
                unavailable()
            }
        })
    }

    pub(super) fn resolve_selected_image(
        &self,
        media: &MediaRef,
        maximum: usize,
    ) -> Result<Vec<u8>> {
        if !media.id.as_str().starts_with(SELECTED_IMAGE) {
            return Err(retained_unavailable());
        }
        self.resolve(media, maximum)
    }

    pub(super) fn read_working(
        &self,
        owner: SessionId,
        proof: &WorkingCopyProof,
    ) -> Result<Vec<u8>> {
        let _access = self.access.lock().unwrap();
        let protected = ProtectedRoots::new(vec![])?;
        ScratchScope::read_working(&self.base, owner, LIMITS, &protected, proof)
    }

    pub(super) fn read_file(&self, work: &WorkingCopyReceipt) -> Result<Vec<u8>> {
        let _access = self.access.lock().unwrap();
        let protected = ProtectedRoots::new(vec![])?;
        let asset = work.asset();
        let size = usize::try_from(asset.size()).map_err(|_| storage_unavailable())?;
        ScratchScope::read_existing_retained(
            &self.base,
            LIMITS,
            &protected,
            asset,
            MAX_IMAGE_BYTES,
        )
        .map_err(|_| problem(ErrorKind::Unavailable, "retained_file_original_unavailable"))?;
        ScratchScope::read_working(
            &self.base,
            asset.owner().clone(),
            LIMITS,
            &protected,
            &WorkingCopyProof {
                source_id: asset.id().clone(),
                source_version: asset.version(),
                source_digest: *asset.digest(),
                id: work.id().clone(),
                size,
                digest: *asset.digest(),
            },
        )
        .map_err(|_| {
            problem(
                ErrorKind::Unavailable,
                "retained_file_working_copy_unavailable",
            )
        })
    }

    pub(super) fn with_scope<T>(
        &self,
        owner: &SessionId,
        operate: impl FnOnce(&mut ScratchScope) -> Result<T>,
    ) -> Result<T> {
        let _access = self.access.lock().unwrap();
        let protected = ProtectedRoots::new(vec![])?;
        let mut scope = ScratchScope::open(&self.base, owner.clone(), LIMITS, &protected)?;
        operate(&mut scope)
    }
}

fn storage_unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "attachment_storage_unavailable")
}
