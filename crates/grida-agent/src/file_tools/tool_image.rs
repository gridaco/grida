//! GRIDA-SEC-004 — bounded image results from a correlated tool call.

use super::ImageCapture;
use agent_kit_core::messages::MediaRef;
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageFormat, ImageReader, Limits};
use std::io::Cursor;
use std::sync::Arc;

const JPEG: &str = "image/jpeg";
const MAX_JPEG_BYTES: usize = 256 * 1024;
const MAX_JPEG_SIDE: u32 = 1024;
pub(crate) const MAX_TOOL_JPEG_BASE64_BYTES: usize = MAX_JPEG_BYTES.div_ceil(3) * 4;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ToolImageError {
    Invalid,
    Unavailable,
}

#[derive(Debug)]
pub(crate) struct PreparedToolImage {
    pub(crate) media: MediaRef,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

/// Validate the owner's original pixels before an MCP client receives them.
pub(crate) async fn verify_tool_jpeg(mime: &str, base64: &str) -> Result<(), ToolImageError> {
    let bytes = decode(mime, base64)?;
    tokio::task::spawn_blocking(move || {
        let pixels = reader(&bytes)
            .decode()
            .map_err(|_| ToolImageError::Invalid)?;
        validate_dimensions(pixels.width(), pixels.height())
    })
    .await
    .map_err(|_| ToolImageError::Unavailable)?
}

/// Retain a normalized PNG under the image authority of this tool's turn.
pub(crate) async fn prepare_tool_jpeg(
    mime: &str,
    base64: &str,
    capture: Option<Arc<ImageCapture>>,
) -> Result<PreparedToolImage, ToolImageError> {
    let bytes = decode(mime, base64)?;
    let capture = capture.ok_or(ToolImageError::Unavailable)?;
    let prepared = tokio::task::spawn_blocking(move || {
        let (width, height) = reader(&bytes)
            .into_dimensions()
            .map_err(|_| ToolImageError::Invalid)?;
        validate_dimensions(width, height)?;
        crate::host::image_preparation::prepare(&bytes).map_err(|_| ToolImageError::Invalid)
    })
    .await
    .map_err(|_| ToolImageError::Unavailable)??;

    // A cancelled call can drop decoded pixels while awaiting preparation.
    // Start retention only after preparation returns to the owning request.
    tokio::task::spawn_blocking(move || {
        let media = capture(prepared.bytes).map_err(|_| ToolImageError::Unavailable)?;
        Ok(PreparedToolImage {
            media,
            width: prepared.preparation.width,
            height: prepared.preparation.height,
        })
    })
    .await
    .map_err(|_| ToolImageError::Unavailable)?
}

fn decode(mime: &str, base64: &str) -> Result<Vec<u8>, ToolImageError> {
    if mime != JPEG || base64.len() > MAX_TOOL_JPEG_BASE64_BYTES {
        return Err(ToolImageError::Invalid);
    }
    let bytes = STANDARD
        .decode(base64)
        .map_err(|_| ToolImageError::Invalid)?;
    // Some JPEG decoders tolerate truncation. Require an explicit end marker.
    if bytes.len() > MAX_JPEG_BYTES
        || !bytes.starts_with(&[0xff, 0xd8])
        || !bytes.ends_with(&[0xff, 0xd9])
    {
        return Err(ToolImageError::Invalid);
    }
    Ok(bytes)
}

fn reader(bytes: &[u8]) -> ImageReader<Cursor<&[u8]>> {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_JPEG_SIDE);
    limits.max_image_height = Some(MAX_JPEG_SIDE);
    limits.max_alloc = Some(u64::from(MAX_JPEG_SIDE).pow(2) * 4);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Jpeg);
    reader.limits(limits);
    reader
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), ToolImageError> {
    if width == 0 || height == 0 || width.max(height) > MAX_JPEG_SIDE {
        return Err(ToolImageError::Invalid);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::messages::Retention;
    use agent_kit_core::{ArtifactId, BindingId, Error, ErrorKind};
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new(&mut bytes)
            .encode(
                &vec![42; (width * height * 3) as usize],
                width,
                height,
                image::ExtendedColorType::Rgb8,
            )
            .unwrap();
        bytes
    }

    #[tokio::test]
    async fn normalizes_valid_tool_jpeg_under_the_supplied_retention_scope() {
        let capture: Arc<ImageCapture> = Arc::new(|bytes| {
            assert_eq!(image::guess_format(&bytes).unwrap(), ImageFormat::Png);
            assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 16);
            Ok(MediaRef {
                id: ArtifactId::new("retained-capture").unwrap(),
                access_scope: BindingId::new("owning-turn").unwrap(),
                media_type: "image/png".into(),
                locator: "retained:captured-asset".into(),
                retention: Retention::Retained,
            })
        });
        let base64 = STANDARD.encode(jpeg(16, 12));
        let prepared = prepare_tool_jpeg(JPEG, &base64, Some(capture))
            .await
            .unwrap();
        assert_eq!((prepared.width, prepared.height), (16, 12));
        assert_eq!(prepared.media.access_scope.as_str(), "owning-turn");
        assert_eq!(prepared.media.media_type, "image/png");
    }

    #[tokio::test]
    async fn refuses_invalid_tool_jpeg_without_calling_storage() {
        let valid = jpeg(16, 16);
        let large = jpeg(MAX_JPEG_SIDE + 1, 1);
        let mut bytes_over_limit = valid[..valid.len() - 2].to_vec();
        bytes_over_limit.resize(MAX_JPEG_BYTES - 1, 0);
        bytes_over_limit.extend_from_slice(&[0xff, 0xd9]);
        let mut malformed = valid.clone();
        let scan = malformed
            .windows(2)
            .position(|bytes| bytes == [0xff, 0xda])
            .unwrap();
        // Select a missing Huffman table while preserving the frame end.
        malformed[scan + 6] = 0x33;
        let cases = [
            ("image/png", STANDARD.encode(&valid)),
            (JPEG, STANDARD.encode(&valid[..valid.len() - 2])),
            (JPEG, STANDARD.encode(&large)),
            (JPEG, STANDARD.encode(&bytes_over_limit)),
            (JPEG, STANDARD.encode(&malformed)),
            (JPEG, "definitely not base64".to_owned()),
        ];
        let calls = Arc::new(AtomicUsize::new(0));
        let capture: Arc<ImageCapture> = {
            let calls = calls.clone();
            Arc::new(move |_| {
                calls.fetch_add(1, Ordering::Relaxed);
                Err(Error::new(ErrorKind::InvalidState, "fixture_retention"))
            })
        };
        for (mime, base64) in cases {
            assert_eq!(
                verify_tool_jpeg(mime, &base64).await,
                Err(ToolImageError::Invalid)
            );
            assert_eq!(
                prepare_tool_jpeg(mime, &base64, Some(capture.clone()))
                    .await
                    .unwrap_err(),
                ToolImageError::Invalid,
            );
        }
        assert_eq!(calls.load(Ordering::Relaxed), 0);
        let base64 = STANDARD.encode(valid);
        assert_eq!(
            prepare_tool_jpeg(JPEG, &base64, None).await.unwrap_err(),
            ToolImageError::Unavailable,
        );
        assert_eq!(
            prepare_tool_jpeg(JPEG, &base64, Some(capture))
                .await
                .unwrap_err(),
            ToolImageError::Unavailable,
        );
    }
}
