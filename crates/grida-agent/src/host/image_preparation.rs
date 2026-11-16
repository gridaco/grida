//! GRIDA-SEC-004 / GRIDA-SEC-014 — bounded explicit raster preparation.
//!
//! Originals and model pixels have different budgets. The original is retained
//! unchanged; a normalized still is frozen separately at input acceptance.

use super::problem;
use agent_kit_core::{ErrorKind, Result};
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

pub(crate) const MAX_SOURCE_BYTES: usize = 20 * 1024 * 1024;
pub(super) const MAX_PREPARED_BYTES: usize = 384 * 1024;
const MAX_SOURCE_PIXELS: u64 = 64 * 1024 * 1024;
const MAX_DECODE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_SOURCE_SIDE: u32 = 16_384;
const MAX_PREPARED_SIDE: u32 = 2048;
const MAX_PREPARED_PIXELS: u64 = 2 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preparation {
    pub version: u32,
    pub source_width: u32,
    pub source_height: u32,
    pub width: u32,
    pub height: u32,
    pub image_count: u32,
    /// Animated formats are represented by the first decoded still only.
    pub first_frame: bool,
}

impl Preparation {
    pub(crate) fn description(&self) -> String {
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
        format!("{scale}{frame}")
    }

    pub(super) fn validate(&self) -> Result<()> {
        if self.version != 1
            || self.image_count != 1
            || self.source_width == 0
            || self.source_height == 0
            || self.source_width > MAX_SOURCE_SIDE
            || self.source_height > MAX_SOURCE_SIDE
            || u64::from(self.source_width) * u64::from(self.source_height) > MAX_SOURCE_PIXELS
            || self.width == 0
            || self.height == 0
            || self.width > MAX_PREPARED_SIDE
            || self.height > MAX_PREPARED_SIDE
            || u64::from(self.width) * u64::from(self.height) > MAX_PREPARED_PIXELS
        {
            return Err(invalid());
        }
        Ok(())
    }
}

#[derive(Debug)]
pub(crate) struct PreparedImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
    pub preparation: Preparation,
}

pub(crate) fn prepare(bytes: &[u8]) -> Result<PreparedImage> {
    if bytes.is_empty() || bytes.len() > MAX_SOURCE_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "image_source_size_limit"));
    }
    let format = image::guess_format(bytes).map_err(|_| invalid())?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Gif => "image/gif",
        _ => return Err(problem(ErrorKind::Unsupported, "unsupported_image_format")),
    };
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SOURCE_SIDE);
    limits.max_image_height = Some(MAX_SOURCE_SIDE);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(decode_error)?;
    let (width, height) = decoder.dimensions();
    if width == 0
        || height == 0
        || u64::from(width) * u64::from(height) > MAX_SOURCE_PIXELS
        || decoder.total_bytes() > MAX_DECODE_BYTES
    {
        return Err(problem(ErrorKind::LimitExceeded, "image_decode_limit"));
    }
    let orientation = decoder.orientation().map_err(|_| invalid())?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(decode_error)?;
    image.apply_orientation(orientation);
    // The decoder's explicit CICP encoding is converted to the normalized
    // output space. Untagged/ICC-only input follows the decoder's sRGB default;
    // the untouched original remains available for color-critical inspection.
    image
        .apply_color_space(image::metadata::Cicp::SRGB, Default::default())
        .map_err(|_| invalid())?;
    let source_width = image.width();
    let source_height = image.height();
    let first_frame = format == ImageFormat::Gif
        || (format == ImageFormat::WebP && webp_animation(bytes))
        || (format == ImageFormat::Png && png_animation(bytes));
    if format == ImageFormat::Png
        && !first_frame
        && orientation == image::metadata::Orientation::NoTransforms
        && source_width <= MAX_PREPARED_SIDE
        && source_height <= MAX_PREPARED_SIDE
        && u64::from(source_width) * u64::from(source_height) <= MAX_PREPARED_PIXELS
        && bytes.len() <= MAX_PREPARED_BYTES
    {
        return Ok(PreparedImage {
            bytes: bytes.to_vec(),
            mime,
            preparation: Preparation {
                version: 1,
                source_width,
                source_height,
                width: source_width,
                height: source_height,
                image_count: 1,
                first_frame,
            },
        });
    }
    if image.width() > MAX_PREPARED_SIDE || image.height() > MAX_PREPARED_SIDE {
        image = image.resize(
            MAX_PREPARED_SIDE,
            MAX_PREPARED_SIDE,
            image::imageops::FilterType::Triangle,
        );
    }
    if u64::from(image.width()) * u64::from(image.height()) > MAX_PREPARED_PIXELS {
        let ratio = (MAX_PREPARED_PIXELS as f64
            / (f64::from(image.width()) * f64::from(image.height())))
        .sqrt();
        image = image.resize(
            (f64::from(image.width()) * ratio).floor().max(1.0) as u32,
            (f64::from(image.height()) * ratio).floor().max(1.0) as u32,
            image::imageops::FilterType::Triangle,
        );
    }
    // PNG derivatives preserve alpha and are accepted by every supported
    // native user/tool-image adapter. Account for worst-case compression by
    // shrinking again until the complete encoded still fits its own budget.
    loop {
        let mut encoded = Cursor::new(Vec::new());
        image
            .write_to(&mut encoded, ImageFormat::Png)
            .map_err(|_| invalid())?;
        let encoded = encoded.into_inner();
        if encoded.len() <= MAX_PREPARED_BYTES {
            return Ok(PreparedImage {
                bytes: encoded,
                mime,
                preparation: Preparation {
                    version: 1,
                    source_width,
                    source_height,
                    width: image.width(),
                    height: image.height(),
                    image_count: 1,
                    first_frame,
                },
            });
        }
        if image.width() == 1 && image.height() == 1 {
            return Err(problem(ErrorKind::LimitExceeded, "image_preparation_limit"));
        }
        image = image.resize(
            (image.width() * 3 / 4).max(1),
            (image.height() * 3 / 4).max(1),
            image::imageops::FilterType::Triangle,
        );
    }
}

fn webp_animation(bytes: &[u8]) -> bool {
    bytes.len() >= 21 && &bytes[12..16] == b"VP8X" && bytes[20] & 2 != 0
}

fn png_animation(bytes: &[u8]) -> bool {
    // Decoding already validated the image. Walk bounded chunks, rather than
    // matching arbitrary compressed pixel bytes for an animation marker.
    let mut offset = 8usize;
    while let Some(chunk) = bytes.get(offset..offset.saturating_add(12)) {
        if &chunk[4..8] == b"acTL" {
            return true;
        }
        let length = u32::from_be_bytes(chunk[..4].try_into().expect("chunk length")) as usize;
        let Some(next) = offset
            .checked_add(length)
            .and_then(|value| value.checked_add(12))
        else {
            return false;
        };
        offset = next;
    }
    false
}

fn invalid() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "invalid_raster_image")
}

fn decode_error(error: image::ImageError) -> agent_kit_core::Error {
    match error {
        image::ImageError::Limits(_) => problem(ErrorKind::LimitExceeded, "image_decode_limit"),
        _ => invalid(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb, Rgba};

    fn encoded(format: ImageFormat) -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(12, 8, Rgb([70, 20, 90])));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, format).unwrap();
        bytes.into_inner()
    }

    #[test]
    fn common_formats_are_decoded_from_bytes_and_prepare_actual_pixels() {
        for (format, mime) in [
            (ImageFormat::Png, "image/png"),
            (ImageFormat::Jpeg, "image/jpeg"),
            (ImageFormat::WebP, "image/webp"),
            (ImageFormat::Gif, "image/gif"),
        ] {
            let bytes = encoded(format);
            let prepared = prepare(&bytes).unwrap();
            assert_eq!(prepared.mime, mime);
            assert_eq!(prepared.preparation.source_width, 12);
            assert_eq!(prepared.preparation.source_height, 8);
            assert_eq!(prepared.preparation.first_frame, format == ImageFormat::Gif);
            assert_eq!(
                image::guess_format(&prepared.bytes).unwrap(),
                ImageFormat::Png
            );
            let actual = image::load_from_memory(&prepared.bytes).unwrap().to_rgb8();
            let pixel = actual.get_pixel(0, 0).0;
            for (actual, expected) in pixel.into_iter().zip([70i16, 20, 90]) {
                assert!((i16::from(actual) - expected).abs() <= 3);
            }
        }
    }

    #[test]
    fn alpha_is_preserved_and_noise_is_bounded_with_resize_disclosure() {
        let image = DynamicImage::ImageRgba8(ImageBuffer::from_fn(2100, 1200, |x, y| {
            Rgba([(x % 251) as u8, (y % 253) as u8, ((x * y) % 255) as u8, 91])
        }));
        let mut original = Cursor::new(Vec::new());
        image.write_to(&mut original, ImageFormat::Png).unwrap();
        let prepared = prepare(original.get_ref()).unwrap();
        assert!(prepared.bytes.len() <= MAX_PREPARED_BYTES);
        assert!(prepared.preparation.width <= MAX_PREPARED_SIDE);
        assert!(prepared.preparation.description().contains("bounded"));
        let pixels = image::load_from_memory(&prepared.bytes).unwrap().to_rgba8();
        assert_eq!(pixels.get_pixel(0, 0)[3], 91);
    }

    #[test]
    fn malformed_and_oversized_inputs_refuse_before_retention() {
        assert_eq!(
            prepare(b"not pixels").unwrap_err().code,
            "invalid_raster_image"
        );
        assert_eq!(
            prepare(&vec![0; MAX_SOURCE_BYTES + 1]).unwrap_err().code,
            "image_source_size_limit"
        );
        let mut png = encoded(ImageFormat::Png);
        png.truncate(png.len() / 2);
        assert!(prepare(&png).is_err());
    }

    #[test]
    fn exif_orientation_is_applied_before_recording_dimensions() {
        let jpeg = encoded(ImageFormat::Jpeg);
        let exif: [u8; 32] = [
            b'E', b'x', b'i', b'f', 0, 0, b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1,
            0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
        ];
        let mut tagged = jpeg[..2].to_vec();
        tagged.extend([0xff, 0xe1, 0, 34]);
        tagged.extend(exif);
        tagged.extend(&jpeg[2..]);
        let prepared = prepare(&tagged).unwrap();
        assert_eq!(
            (
                prepared.preparation.source_width,
                prepared.preparation.source_height
            ),
            (8, 12)
        );
        let pixels = image::load_from_memory(&prepared.bytes).unwrap();
        assert_eq!((pixels.width(), pixels.height()), (8, 12));
    }

    #[test]
    fn animated_input_supplies_only_the_first_frame_with_disclosure() {
        use image::{Delay, Frame};
        let mut encoded = Vec::new();
        {
            let mut encoder = image::codecs::gif::GifEncoder::new(&mut encoded);
            for color in [Rgba([230, 10, 20, 255]), Rgba([10, 20, 230, 255])] {
                encoder
                    .encode_frame(Frame::from_parts(
                        ImageBuffer::from_pixel(4, 3, color),
                        0,
                        0,
                        Delay::from_numer_denom_ms(100, 1),
                    ))
                    .unwrap();
            }
        }
        let prepared = prepare(&encoded).unwrap();
        assert!(prepared.preparation.first_frame);
        assert!(
            prepared
                .preparation
                .description()
                .contains("first still frame")
        );
        let pixels = image::load_from_memory(&prepared.bytes).unwrap().to_rgba8();
        assert_eq!(pixels.get_pixel(0, 0).0, [230, 10, 20, 255]);
    }

    #[test]
    fn decode_dimensions_are_bounded_before_pixel_allocation() {
        let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(
            MAX_SOURCE_SIDE + 1,
            1,
            Rgb([1, 2, 3]),
        ));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        assert_eq!(
            prepare(bytes.get_ref()).unwrap_err().code,
            "image_decode_limit"
        );
    }
}
