//! GRIDA-SEC-004 / GRIDA-SEC-014 — validate PNG intake and its retained identity.

use super::{Host, PromptPart, StoredPrompt, decode_input, problem};
use crate::scratch::AssetRef;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, MediaRef, Retention, Role};
use agent_kit_core::{ArtifactId, BindingId, ChangeId, ErrorKind, MessageId, Result, SessionId};
use agent_kit_sessions::{InputDisposition, SessionRevision};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::io::{BufRead, Cursor, Seek};
use std::path::Path;
use std::sync::Arc;

const MIME: &str = "image/png";
pub(super) const NAME: &str = "image.png";
const LOCATOR: &str = "retained-input:";
const RASTER_LOCATOR: &str = "retained-raster:";
pub(crate) const MAX_IMAGE_BYTES: usize = 256 * 1024;
pub(super) const MAX_PIXELS: u64 = 4 * 1024 * 1024;
pub(super) const MAX_DECODED_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy)]
pub(crate) enum QueueReadBasis<'a> {
    Waiting(SessionRevision),
    Checkout(&'a ChangeId),
}

impl Host {
    /// Preview a waiting or checked-out input at its exact retained identity.
    pub(crate) async fn queued_message_parts(
        &self,
        session: &SessionId,
        input: &ChangeId,
        basis: QueueReadBasis<'_>,
    ) -> Result<(
        Vec<PromptPart>,
        bool,
        Vec<super::message_context::DisplayPart>,
    )> {
        let view = self
            .inspect(session.clone())
            .await
            .map_err(|_| queued_image_unavailable())?;
        let selected = match basis {
            QueueReadBasis::Waiting(expected) if view.revision == expected => view
                .queued
                .iter()
                .find(|row| &row.input.id == input && row.disposition == InputDisposition::Queued),
            QueueReadBasis::Checkout(id) => view.checkout.as_ref().filter(|row| {
                &row.input.id == input
                    && matches!(&row.disposition, InputDisposition::CheckedOut { checkout } if checkout == id)
            }),
            _ => None,
        }
        .ok_or_else(queued_image_unavailable)?;
        let editable = super::queued_text::text_editable(&selected.input);
        decode_input::<StoredPrompt>(&selected.input)
            .map(|prompt| {
                let skills = prompt
                    .guidance
                    .as_ref()
                    .map(crate::skills::CapturedGuidance::selected)
                    .unwrap_or_default();
                let display = super::message_context::display_parts(&prompt.parts, &skills);
                (prompt.parts, editable, display)
            })
            .map_err(|_| queued_image_unavailable())
    }

    /// Read one bounded chunk from an original retained by this exact queued
    /// input. Membership and the observed basis are checked around the byte read.
    pub(crate) async fn read_queued_input_image_chunk(
        &self,
        session: SessionId,
        input: ChangeId,
        basis: QueueReadBasis<'_>,
        attachment: ArtifactId,
        offset: usize,
    ) -> Result<(String, usize, Vec<u8>, Option<usize>)> {
        let media = self
            .queued_image_reference(&session, &input, basis, &attachment)
            .await?;
        let selected = media.clone();
        let state_dir = self
            .state_dir
            .clone()
            .ok_or_else(queued_image_unavailable)?;
        let images = self
            .execution
            .as_ref()
            .and_then(|execution| execution.retained_inputs.clone());
        let (mime, bytes) = tokio::task::spawn_blocking(move || {
            let images = match images {
                Some(images) => images,
                None => Arc::new(super::retained_inputs::RetainedInputs::open(&state_dir)?),
            };
            images.resolve_original(&selected)
        })
        .await
        .map_err(|_| queued_image_unavailable())?
        .map_err(|_| queued_image_unavailable())?;
        if self
            .queued_image_reference(&session, &input, basis, &attachment)
            .await?
            != media
            || offset >= bytes.len()
            || !offset.is_multiple_of(256 * 1024)
        {
            return Err(queued_image_unavailable());
        }
        let total = bytes.len();
        let end = offset.saturating_add(256 * 1024).min(total);
        Ok((
            mime,
            total,
            bytes[offset..end].to_vec(),
            (end < total).then_some(end),
        ))
    }

    async fn queued_image_reference(
        &self,
        session: &SessionId,
        input: &ChangeId,
        basis: QueueReadBasis<'_>,
        attachment: &ArtifactId,
    ) -> Result<MediaRef> {
        let (parts, _, _) = self.queued_message_parts(session, input, basis).await?;
        let mut selected = None;
        for part in parts {
            let media = match part {
                PromptPart::RetainedImage { asset } => media(&asset),
                PromptPart::PreparedImage { image } => raster_media(&image),
                _ => continue,
            }
            .map_err(|_| queued_image_unavailable())?;
            if &media.id != attachment {
                continue;
            }
            if selected.is_some() || !asset_ref(&media).is_ok_and(|asset| asset.owner() == session)
            {
                return Err(queued_image_unavailable());
            }
            selected = Some(media);
        }
        selected.ok_or_else(queued_image_unavailable)
    }

    /// Read one original PNG already represented by this chat's visible local
    /// user message. The selection comes from the journal, never a supplied
    /// path or serialized asset. Model input eligibility is unrelated.
    pub(crate) async fn read_input_image(
        &self,
        session: SessionId,
        message: MessageId,
        attachment: ArtifactId,
    ) -> Result<Vec<u8>> {
        let media = self
            .input_image_reference(&session, &message, &attachment)
            .await?;
        let selected = media.clone();
        if retained_raster(&media).is_some() {
            // The original-only PNG operation predates richer raster input;
            // never return a resized derivative or a different MIME through it.
            return Err(input_image_unavailable());
        }
        let state_dir = self.state_dir.clone().ok_or_else(input_image_unavailable)?;
        let images = self
            .execution
            .as_ref()
            .and_then(|execution| execution.retained_inputs.clone());
        let bytes = tokio::task::spawn_blocking(move || {
            let images = match images {
                Some(images) => images,
                None => Arc::new(super::retained_inputs::RetainedInputs::open(&state_dir)?),
            };
            images.resolve_selected_image(&selected, MAX_IMAGE_BYTES)
        })
        .await
        .map_err(|_| input_image_unavailable())?
        .map_err(|_| input_image_unavailable())?;
        // A concurrent revision or deletion cannot leave a retired message's
        // input readable through a formerly valid selection.
        if self
            .input_image_reference(&session, &message, &attachment)
            .await?
            != media
        {
            return Err(input_image_unavailable());
        }
        Ok(bytes)
    }

    pub(crate) async fn read_input_image_chunk(
        &self,
        session: SessionId,
        message: MessageId,
        attachment: ArtifactId,
        offset: usize,
    ) -> Result<(String, usize, Vec<u8>, Option<usize>)> {
        let media = self
            .input_image_reference(&session, &message, &attachment)
            .await?;
        let selected = media.clone();
        let state_dir = self.state_dir.clone().ok_or_else(input_image_unavailable)?;
        let images = self
            .execution
            .as_ref()
            .and_then(|execution| execution.retained_inputs.clone());
        let (mime, bytes) = tokio::task::spawn_blocking(move || {
            let images = match images {
                Some(images) => images,
                None => Arc::new(super::retained_inputs::RetainedInputs::open(&state_dir)?),
            };
            images.resolve_original(&selected)
        })
        .await
        .map_err(|_| input_image_unavailable())?
        .map_err(|_| input_image_unavailable())?;
        if self
            .input_image_reference(&session, &message, &attachment)
            .await?
            != media
            || offset >= bytes.len()
            || !offset.is_multiple_of(256 * 1024)
        {
            return Err(input_image_unavailable());
        }
        let total = bytes.len();
        let end = offset.saturating_add(256 * 1024).min(total);
        Ok((
            mime,
            total,
            bytes[offset..end].to_vec(),
            (end < total).then_some(end),
        ))
    }

    async fn input_image_reference(
        &self,
        session: &SessionId,
        message: &MessageId,
        attachment: &ArtifactId,
    ) -> Result<MediaRef> {
        let mut replay = self
            .store
            .open_history_replay(
                session.clone(),
                grida_agent_master::history::project,
                |seed| Ok(seed.records.len()),
            )
            .await
            .map_err(|_| input_image_unavailable())?;
        let mut selected = None;
        // Bounded transcript pages include old local turns after context
        // compaction. Inherited seed records are skipped: those are not this
        // session's original inputs.
        while let Some(records) = replay.next().await.map_err(|_| input_image_unavailable())? {
            for HistoryRecord::Message(record) in records {
                if record.role != Role::User || &record.id != message {
                    continue;
                }
                for content in record.content {
                    if let Content::Media(media) = content
                        && &media.id == attachment
                        && is_retained_image(&media)
                    {
                        if selected.is_some()
                            || !asset_ref(&media).is_ok_and(|asset| asset.owner() == session)
                        {
                            return Err(input_image_unavailable());
                        }
                        selected = Some(media);
                    }
                }
            }
        }
        selected.ok_or_else(input_image_unavailable)
    }
}

fn input_image_unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "input_image_unavailable")
}

fn queued_image_unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "queued_input_image_unavailable")
}

/// A private launcher can ingest a clipboard snapshot only from this one
/// staging root. Ordinary tools still deny the whole native state directory.
/// Merely claiming `snapshot` cannot turn an arbitrary protected path into input.
pub(super) fn check_snapshot_path(state: Option<&Path>, path: &Path) -> Result<()> {
    let denied = || {
        problem(
            ErrorKind::Unavailable,
            "selected_image_snapshot_unavailable",
        )
    };
    let state = state.ok_or_else(denied)?;
    let custody = state.join("desktop-image-custody");
    let root = custody.join("snapshots");
    if path.parent() != Some(root.as_path()) || path.canonicalize().map_err(|_| denied())? != path {
        return Err(denied());
    }
    for directory in [&custody, &root] {
        if directory.canonicalize().map_err(|_| denied())? != *directory {
            return Err(denied());
        }
        crate::scratch::check_private_directory(directory).map_err(|_| denied())?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = std::fs::symlink_metadata(path).map_err(|_| denied())?;
        if !metadata.is_file()
            || metadata.nlink() != 1
            || metadata.mode() & 0o777 != 0o600
            || metadata.uid() != rustix::process::geteuid().as_raw()
        {
            return Err(denied());
        }
    }
    Ok(())
}
/// Transient supplied PNG. Only the retained asset identity is serializable.
#[derive(Clone, PartialEq, Eq)]
pub struct ImageUpload {
    pub(super) bytes: Vec<u8>,
    pub(super) digest: [u8; 32],
    pub(super) source: Option<Box<RasterSource>>,
}

#[derive(Clone, PartialEq, Eq)]
pub(super) struct RasterSource {
    pub bytes: Vec<u8>,
    pub mime: String,
    pub name: String,
    pub preparation: super::image_preparation::Preparation,
    pub selection: Option<SelectedImage>,
}

/// Private-launcher identity of the exact user-selected snapshot. The digest
/// binds the bytes selected by Main; `source` controls provenance, never grants.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectedImage {
    pub path: String,
    pub sha256: [u8; 32],
    pub name: String,
    pub source: ImageSource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageSource {
    Disk,
    Snapshot,
}

impl SelectedImage {
    pub(crate) fn validate(&self) -> Result<()> {
        crate::workspace::validate_absolute(Path::new(&self.path))?;
        if self.path.len() > 4096
            || self.path.chars().any(char::is_control)
            || self.name.is_empty()
            || self.name.len() > 255
            || self
                .name
                .chars()
                .any(|c| c.is_control() || c == '/' || c == '\\')
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "selected_image_identity_invalid",
            ));
        }
        Ok(())
    }

    pub(super) fn read(&self) -> Result<ImageUpload> {
        self.validate()?;
        let bytes = super::selected_file::read_selected(
            Path::new(&self.path),
            super::image_preparation::MAX_SOURCE_BYTES,
            "selected_image_unavailable",
            "selected_image_changed",
            "image_source_size_limit",
        )?;
        if <[u8; 32]>::from(Sha256::digest(&bytes)) != self.sha256 {
            return Err(problem(ErrorKind::Conflict, "selected_image_changed"));
        }
        ImageUpload::from_raster(bytes, self.name.clone(), Some(self.clone()))
    }
}

/// Product metadata that links one retained original to one frozen model still.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedRaster {
    pub original: AssetRef,
    pub prepared: AssetRef,
    pub mime_type: String,
    pub name: String,
    pub preparation: super::image_preparation::Preparation,
    pub selection: Option<SelectedImage>,
}

impl RetainedRaster {
    pub(crate) fn source_path(&self) -> Option<&str> {
        self.selection
            .as_ref()
            .filter(|s| s.source == ImageSource::Disk)
            .map(|s| s.path.as_str())
    }

    pub(super) fn context(&self) -> grida_agent_master::image_attachment::Context {
        use grida_agent_master::image_attachment::{Context, Source};
        Context {
            source: match self.source_path() {
                Some(path) => Source::Disk { path: path.into() },
                None => Source::Snapshot {
                    name: self.name.clone(),
                    resource: self.original.id().as_str().into(),
                },
            },
            source_width: self.preparation.source_width,
            source_height: self.preparation.source_height,
            width: self.preparation.width,
            height: self.preparation.height,
            first_frame: self.preparation.first_frame,
        }
    }

    fn validate(&self) -> Result<()> {
        self.preparation.validate()?;
        if self.original.owner() != self.prepared.owner()
            || !self.original.id().as_str().starts_with("input/raster/")
            || !self
                .prepared
                .id()
                .as_str()
                .starts_with("input/raster-prepared/")
            || self.original.version() != 1
            || self.prepared.version() != 1
            || self.prepared.name() != NAME
            || self.original.size() == 0
            || self.original.size() > super::image_preparation::MAX_SOURCE_BYTES as u64
            || self.prepared.size() == 0
            || self.prepared.size() > super::image_preparation::MAX_PREPARED_BYTES as u64
            || !["image/png", "image/jpeg", "image/webp", "image/gif"]
                .contains(&self.mime_type.as_str())
            || self.name.is_empty()
            || self.name.len() > 255
            || self.name.chars().any(char::is_control)
        {
            return Err(retained_unavailable());
        }
        if let Some(selection) = &self.selection {
            selection.validate()?;
            if &selection.sha256 != self.original.digest() || selection.name != self.name {
                return Err(retained_unavailable());
            }
        }
        Ok(())
    }

    pub(super) fn matches_selection(&self, selected: &SelectedImage) -> bool {
        self.selection.as_ref() == Some(selected) && self.original.digest() == &selected.sha256
    }

    pub(super) fn matches_upload(&self, upload: &ImageUpload) -> bool {
        upload.source.as_ref().is_some_and(|source| {
            source.selection == self.selection
                && source.name == self.name
                && source.mime == self.mime_type
                && self.prepared.digest() == &upload.digest
                && self.original.digest() == &<[u8; 32]>::from(Sha256::digest(&source.bytes))
                && self.preparation == source.preparation
        })
    }
}

pub(crate) fn retained_raster(media: &MediaRef) -> Option<RetainedRaster> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Descriptor {
        image: RetainedRaster,
        context: grida_agent_master::image_attachment::Context,
    }
    let raw = media.locator.strip_prefix(RASTER_LOCATOR)?;
    if raw.len() > 16 * 1024 {
        return None;
    }
    let descriptor: Descriptor = serde_json::from_str(raw).ok()?;
    let image = descriptor.image;
    image.validate().ok()?;
    if descriptor.context != image.context() {
        return None;
    }
    (media.id == *image.original.id()
        && media.media_type == MIME
        && media.retention == Retention::Retained
        && media.access_scope == scope_id(image.original.owner()).ok()?)
    .then_some(image)
}

pub(super) fn raster_media(image: &RetainedRaster) -> Result<MediaRef> {
    image.validate()?;
    Ok(MediaRef {
        id: image.original.id().clone(),
        media_type: MIME.into(),
        locator: format!(
            "{RASTER_LOCATOR}{}",
            serde_json::to_string(&serde_json::json!({"image":image,"context":image.context()}))
                .map_err(|_| retained_unavailable())?
        ),
        access_scope: scope_id(image.original.owner())?,
        retention: Retention::Retained,
    })
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
        Self::from_png(bytes)
    }

    pub(crate) fn from_png(bytes: Vec<u8>) -> Result<Self> {
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(image_too_large());
        }
        validate_png(&bytes)?;
        Ok(Self {
            digest: Sha256::digest(&bytes).into(),
            bytes,
            source: None,
        })
    }

    pub(super) fn from_raster(
        bytes: Vec<u8>,
        name: String,
        selection: Option<SelectedImage>,
    ) -> Result<Self> {
        let prepared = super::image_preparation::prepare(&bytes)?;
        Ok(Self {
            digest: Sha256::digest(&prepared.bytes).into(),
            bytes: prepared.bytes,
            source: Some(Box::new(RasterSource {
                bytes,
                mime: prepared.mime.into(),
                name,
                preparation: prepared.preparation,
                selection,
            })),
        })
    }

    pub(crate) fn read_selected_png(path: &Path) -> Result<Self> {
        Self::from_png(super::selected_file::read_selected(
            path,
            MAX_IMAGE_BYTES,
            "selected_image_unavailable",
            "selected_image_changed",
            "image_size_limit",
        )?)
    }

    pub(super) fn matches(&self, asset: &AssetRef) -> bool {
        self.bytes.len() as u64 == asset.size() && &self.digest == asset.digest()
    }
}

pub(super) fn asset_ref(media: &MediaRef) -> Result<AssetRef> {
    if let Some(image) = retained_raster(media) {
        return Ok(image.prepared);
    }
    let asset: AssetRef = media
        .locator
        .strip_prefix(LOCATOR)
        .filter(|value| value.len() <= 1024)
        .and_then(|value| serde_json::from_str(value).ok())
        .ok_or_else(retained_unavailable)?;
    if !is_retained_image(media)
        || media.id != *asset.id()
        || media.access_scope != scope_id(asset.owner())?
        || asset.name() != NAME
        || asset.version() != 1
    {
        return Err(retained_unavailable());
    }
    Ok(asset)
}

pub(super) fn media(asset: &AssetRef) -> Result<MediaRef> {
    let locator = serde_json::to_string(asset).map_err(|_| retained_unavailable())?;
    Ok(MediaRef {
        id: asset.id().clone(),
        media_type: MIME.into(),
        locator: format!("{LOCATOR}{locator}"),
        access_scope: scope_id(asset.owner())?,
        retention: Retention::Retained,
    })
}

/// The byte size of a retained image, when its asset identity is intact.
pub(crate) fn retained_image_size(media: &MediaRef) -> Option<u64> {
    retained_raster(media)
        .map(|image| image.original.size())
        .or_else(|| asset_ref(media).ok().map(|asset| asset.size()))
}

pub(crate) fn is_retained_image(media: &MediaRef) -> bool {
    media.media_type == MIME
        && media.retention == Retention::Retained
        && (media.locator.starts_with(LOCATOR) || retained_raster(media).is_some())
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
                (PromptPart::PreparedImage { image }, PromptPart::SelectedImage { selection }) => {
                    image.matches_selection(selection)
                }
                (PromptPart::PreparedImage { image }, PromptPart::Image { image: upload }) => {
                    image.matches_upload(upload)
                }
                (PromptPart::RetainedFile { work }, PromptPart::File { file }) => {
                    file.matches(work.asset())
                }
                _ => stored == supplied,
            })
}

fn scope_id(owner: &SessionId) -> Result<BindingId> {
    BindingId::new(format!("retained-input/{owner}"))
}

pub(super) fn validate_prepared_png(bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() || bytes.len() > super::image_preparation::MAX_PREPARED_BYTES {
        return Err(image_too_large());
    }
    validate_png_with_limits(
        bytes,
        super::image_preparation::MAX_PREPARED_PIXELS,
        // PNG supports four 16-bit channels. The source preparation contract
        // permits that precision even for a highly compressed retained still.
        super::image_preparation::MAX_PREPARED_PIXELS as usize * 8,
        Some(super::image_preparation::MAX_PREPARED_SIDE),
    )
}

fn validate_png(bytes: &[u8]) -> Result<()> {
    validate_png_with_limits(bytes, MAX_PIXELS, MAX_DECODED_BYTES, None)
}

fn validate_png_with_limits(
    bytes: &[u8],
    max_pixels: u64,
    max_decoded: usize,
    max_side: Option<u32>,
) -> Result<()> {
    let mut source = Cursor::new(bytes);
    let mut decoder = png::Decoder::new(&mut source);
    decoder.set_limits(png::Limits { bytes: max_decoded });
    decoder.set_ignore_text_chunk(true);
    decoder.set_ignore_iccp_chunk(true);
    let header = decoder.read_header_info().map_err(|_| invalid_png())?;
    if u64::from(header.width) * u64::from(header.height) > max_pixels
        || max_side.is_some_and(|side| header.width > side || header.height > side)
    {
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
        .filter(|size| *size <= max_decoded)
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

pub(super) fn retained_unavailable() -> agent_kit_core::Error {
    problem(ErrorKind::Unavailable, "retained_image_unavailable")
}
