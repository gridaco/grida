//! GRIDA-SEC-004 / GRIDA-SEC-014 — retain supplied bytes and resolve only exact originals.

use super::{PromptPart, problem};
use crate::scratch::{AssetRef, ScratchLimits, ScratchScope};
use crate::workspace::ProtectedRoots;
use agent_kit_core::messages::{MediaRef, Retention};
use agent_kit_core::{ArtifactId, BindingId, ChangeId, ErrorKind, Fingerprint, Result, SessionId};
use base64::{Engine, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};
use std::fmt;
use std::io::{BufRead, Cursor, Seek};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MIME: &str = "image/png";
const NAME: &str = "image.png";
const LOCATOR: &str = "retained-input:";
pub(super) const MAX_IMAGE_BYTES: usize = 256 * 1024;
const MAX_PIXELS: u64 = 4 * 1024 * 1024;
pub(super) const MAX_DECODED_BYTES: usize = 8 * 1024 * 1024;
const LIMITS: ScratchLimits = ScratchLimits {
    max_assets: 16,
    max_asset_bytes: MAX_IMAGE_BYTES as u64,
    max_source_bytes: 2 * 1024 * 1024,
    max_work_bytes: 2 * 1024 * 1024,
};

/// Transient supplied PNG. Only the retained asset identity is serializable.
#[derive(Clone, PartialEq, Eq)]
pub struct ImageUpload {
    bytes: Vec<u8>,
    digest: [u8; 32],
}

impl fmt::Debug for ImageUpload {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ImageUpload")
            .field("size", &self.bytes.len())
            .finish_non_exhaustive()
    }
}

impl ImageUpload {
    pub(crate) fn decode(mime: &str, data: &str) -> Result<Self> {
        if mime != MIME {
            return Err(problem(ErrorKind::Unsupported, "unsupported_image_mime"));
        }
        if data.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
            return Err(image_too_large());
        }
        let bytes = STANDARD.decode(data).map_err(|_| invalid_png())?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(image_too_large());
        }
        validate_png(&bytes)?;
        Ok(Self {
            digest: Sha256::digest(&bytes).into(),
            bytes,
        })
    }

    pub(super) fn matches(&self, asset: &AssetRef) -> bool {
        self.bytes.len() as u64 == asset.size() && &self.digest == asset.digest()
    }
}

pub(super) struct Images {
    base: PathBuf,
    // ScratchScope has an exclusive per-session lock. Keep local intake and
    // provider reads from racing each other for it.
    access: Mutex<()>,
}

impl Images {
    pub(super) fn open(state_dir: &Path) -> Result<Self> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            let state_dir = state_dir
                .canonicalize()
                .map_err(|_| storage_unavailable())?;
            crate::scratch::check_private_directory(&state_dir)?;
            Ok(Self {
                base: state_dir.join("retained-inputs"),
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

    pub(super) fn retain(
        &self,
        session: &SessionId,
        cwd: &Path,
        input: &ChangeId,
        upload: ImageUpload,
    ) -> Result<AssetRef> {
        let _access = self.access.lock().unwrap();
        let protected = ProtectedRoots::new(vec![cwd.to_owned()])?;
        protected.check(&self.base)?;
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
        let identity = Fingerprint::of(&(input, upload.digest))?;
        let id = uuid::Uuid::from_bytes(
            identity.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        scope.retain(
            ArtifactId::new(format!("input/{id}"))?,
            1,
            NAME,
            upload.bytes.as_slice(),
        )
    }

    pub(super) fn resolve(&self, media: &MediaRef, maximum: usize) -> Result<Vec<u8>> {
        let asset = asset_ref(media)?;
        self.with_scope(asset.owner(), |scope| {
            scope.read_retained(&asset, maximum.min(MAX_IMAGE_BYTES))
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

pub(super) fn asset_ref(media: &MediaRef) -> Result<AssetRef> {
    let asset: AssetRef = media
        .locator
        .strip_prefix(LOCATOR)
        .filter(|value| value.len() <= 1024)
        .and_then(|value| serde_json::from_str(value).ok())
        .ok_or_else(invalid_reference)?;
    if !is_retained_image(media)
        || media.id != *asset.id()
        || media.access_scope != scope_id(asset.owner())?
        || asset.name() != NAME
        || asset.version() != 1
    {
        return Err(invalid_reference());
    }
    Ok(asset)
}

pub(super) fn media(asset: &AssetRef) -> Result<MediaRef> {
    let locator = serde_json::to_string(asset).map_err(|_| invalid_reference())?;
    Ok(MediaRef {
        id: asset.id().clone(),
        media_type: MIME.into(),
        locator: format!("{LOCATOR}{locator}"),
        access_scope: scope_id(asset.owner())?,
        retention: Retention::Retained,
    })
}

pub(crate) fn is_retained_image(media: &MediaRef) -> bool {
    media.media_type == MIME
        && media.retention == Retention::Retained
        && media.locator.starts_with(LOCATOR)
}

pub(super) fn same_prompt(left: &[PromptPart], right: &[PromptPart]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(stored, supplied)| match (stored, supplied) {
                (PromptPart::RetainedImage { asset }, PromptPart::Image { image }) => {
                    image.matches(asset)
                }
                _ => stored == supplied,
            })
}

fn scope_id(owner: &SessionId) -> Result<BindingId> {
    BindingId::new(format!("retained-input/{owner}"))
}

fn validate_png(bytes: &[u8]) -> Result<()> {
    let mut source = Cursor::new(bytes);
    let mut decoder = decoder(&mut source);
    let header = decoder.read_header_info().map_err(|_| invalid_png())?;
    if u64::from(header.width) * u64::from(header.height) > MAX_PIXELS {
        return Err(image_too_large());
    }
    let mut reader = decoder.read_info().map_err(|_| invalid_png())?;
    if reader.info().animation_control.is_some() {
        return Err(problem(
            ErrorKind::Unsupported,
            "animated_image_unsupported",
        ));
    }
    let size = reader
        .output_buffer_size()
        .filter(|size| *size <= MAX_DECODED_BYTES)
        .ok_or_else(image_too_large)?;
    reader
        .next_frame(&mut vec![0; size])
        .map_err(|_| invalid_png())?;
    reader.finish().map_err(|_| invalid_png())?;
    drop(reader);
    if source.position() != bytes.len() as u64 {
        return Err(invalid_png());
    }
    Ok(())
}

pub(super) fn decoder<R: BufRead + Seek>(source: R) -> png::Decoder<R> {
    let mut decoder = png::Decoder::new(source);
    decoder.set_limits(png::Limits {
        bytes: MAX_DECODED_BYTES,
    });
    decoder.set_ignore_text_chunk(true);
    decoder.set_ignore_iccp_chunk(true);
    decoder
}

fn invalid_png() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "invalid_png_image")
}

fn image_too_large() -> agent_kit_core::Error {
    problem(ErrorKind::LimitExceeded, "image_size_limit")
}

fn invalid_reference() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "retained_image_unavailable")
}

fn storage_unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "attachment_storage_unavailable")
}
