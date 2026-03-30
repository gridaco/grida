//! `.grida` / `.grida1` file format detection and unified decoding.
//!
//! A `.grida` file can be one of three variants:
//!
//! | Variant        | Magic / Signature                        |
//! |----------------|------------------------------------------|
//! | Raw FlatBuffers| `"GRID"` identifier at bytes 4–7         |
//! | ZIP archive    | PK magic (`\x50\x4b\x03\x04`)           |
//! | JSON (legacy)  | Starts with `{` or `[` (UTF-8)           |
//!
//! This module provides:
//! - [`detect`] — sniff the format from raw bytes.
//! - [`decode`] / [`decode_all`] — unified decode that auto-dispatches.
//! - [`decode_with_id_map`] — full decode with internal→string ID mapping
//!   (FBS/ZIP only).
//!
//! # Example
//!
//! ```no_run
//! use cg::io::io_grida_file;
//!
//! let bytes = std::fs::read("scene.grida").unwrap();
//! let scenes = io_grida_file::decode_all(&bytes).unwrap();
//! println!("decoded {} scene(s)", scenes.len());
//! ```

use std::fmt;
use std::io::{Cursor, Read};

use crate::io::{id_converter::IdConverter, io_grida, io_grida_fbs};
use crate::node::schema::Scene;

// ─────────────────────────────────────────────────────────────────────────────
// Format detection
// ─────────────────────────────────────────────────────────────────────────────

/// Detected variant of a `.grida` / `.grida1` file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// Raw FlatBuffers binary (`"GRID"` file identifier at bytes 4–7).
    RawFbs,
    /// ZIP archive containing `manifest.json` + `document.grida`.
    Zip,
    /// Legacy JSON format (starts with `{` or `[`).
    Json,
    /// Unrecognized format.
    Unknown,
}

impl fmt::Display for Format {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Format::RawFbs => write!(f, "Raw FlatBuffers"),
            Format::Zip => write!(f, "ZIP archive"),
            Format::Json => write!(f, "JSON"),
            Format::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Detect the file format from raw bytes.
pub fn detect(bytes: &[u8]) -> Format {
    // ZIP magic: PK\x03\x04 or PK\x05\x06 (end-of-central-dir)
    if bytes.len() >= 4
        && bytes[0] == 0x50
        && bytes[1] == 0x4b
        && ((bytes[2] == 0x03 && bytes[3] == 0x04) || (bytes[2] == 0x05 && bytes[3] == 0x06))
    {
        return Format::Zip;
    }
    // Raw FlatBuffers: file identifier "GRID" at bytes 4–7
    if bytes.len() >= 8 && &bytes[4..8] == b"GRID" {
        return Format::RawFbs;
    }
    // JSON: first non-whitespace/BOM byte is '{' or '['
    let first_significant = bytes
        .iter()
        .position(|&b| !b.is_ascii_whitespace() && b != 0xEF && b != 0xBB && b != 0xBF)
        .map(|i| bytes[i])
        .unwrap_or(0);
    if first_significant == b'{' || first_significant == b'[' {
        return Format::Json;
    }
    Format::Unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

/// Errors that can occur when decoding a `.grida` file.
#[derive(Debug)]
pub enum DecodeError {
    /// The file format could not be recognized.
    UnrecognizedFormat,
    /// An error occurred while reading the ZIP archive.
    Zip(String),
    /// FlatBuffers decode error.
    Fbs(io_grida_fbs::FbsDecodeError),
    /// JSON parse error.
    Json(String),
    /// JSON-to-scene conversion error.
    Conversion(String),
    /// Attempted an FBS-only operation on a JSON file.
    JsonNotSupported,
    /// The decoded file contained no scenes.
    NoScenes,
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DecodeError::UnrecognizedFormat => write!(
                f,
                "unrecognized file format: expected .grida FlatBuffers, ZIP, or JSON"
            ),
            DecodeError::Zip(msg) => write!(f, "ZIP error: {msg}"),
            DecodeError::Fbs(e) => write!(f, "FlatBuffers decode error: {e}"),
            DecodeError::Json(msg) => write!(f, "JSON parse error: {msg}"),
            DecodeError::Conversion(msg) => write!(f, "scene conversion error: {msg}"),
            DecodeError::JsonNotSupported => write!(
                f,
                "this operation requires FlatBuffers or ZIP format (JSON is not supported)"
            ),
            DecodeError::NoScenes => write!(f, "no scenes found in .grida file"),
        }
    }
}

impl std::error::Error for DecodeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            DecodeError::Fbs(e) => Some(e),
            _ => None,
        }
    }
}

impl From<io_grida_fbs::FbsDecodeError> for DecodeError {
    fn from(e: io_grida_fbs::FbsDecodeError) -> Self {
        DecodeError::Fbs(e)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP extraction
// ─────────────────────────────────────────────────────────────────────────────

/// Hard limit on the uncompressed size of `document.grida` inside a ZIP
/// archive. Protects against zip bombs and absurd allocations.
/// Set to 8 GiB (2³³) — design files with many embedded images can be large.
const MAX_UNCOMPRESSED_SIZE: u64 = 1 << 33; // 8 GiB

fn extract_fbs_from_zip(bytes: &[u8]) -> Result<Vec<u8>, DecodeError> {
    let cursor = Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| DecodeError::Zip(format!("open: {e}")))?;

    if archive.by_name("manifest.json").is_err() {
        return Err(DecodeError::Zip("missing manifest.json".into()));
    }

    let mut doc = archive
        .by_name("document.grida")
        .map_err(|e| DecodeError::Zip(format!("missing document.grida: {e}")))?;

    // Reject files whose announced uncompressed size exceeds the limit.
    let announced_size = doc.size();
    if announced_size > MAX_UNCOMPRESSED_SIZE {
        return Err(DecodeError::Zip(format!(
            "document.grida uncompressed size ({announced_size} bytes) exceeds limit ({MAX_UNCOMPRESSED_SIZE} bytes)"
        )));
    }

    // Use a bounded reader to guard against actual data exceeding the limit
    // (the announced size may be smaller than the real content in a crafted ZIP).
    let alloc_hint = std::cmp::min(announced_size, MAX_UNCOMPRESSED_SIZE) as usize;
    let mut fbs_bytes = Vec::with_capacity(alloc_hint);
    // Read::take() on a mutable reference avoids consuming `doc`.
    (&mut doc)
        .take(MAX_UNCOMPRESSED_SIZE + 1)
        .read_to_end(&mut fbs_bytes)
        .map_err(|e| DecodeError::Zip(format!("read document.grida: {e}")))?;

    if fbs_bytes.len() as u64 > MAX_UNCOMPRESSED_SIZE {
        return Err(DecodeError::Zip(format!(
            "document.grida actual size ({} bytes) exceeds limit ({MAX_UNCOMPRESSED_SIZE} bytes)",
            fbs_bytes.len()
        )));
    }

    Ok(fbs_bytes)
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve raw FBS bytes from any format (FBS passthrough, ZIP extraction)
// ─────────────────────────────────────────────────────────────────────────────

/// Given raw file bytes, resolve to the FlatBuffers payload.
///
/// - `RawFbs` → returns the bytes as-is.
/// - `Zip` → extracts `document.grida` from the archive.
/// - `Json` / `Unknown` → returns an error (no FBS payload).
fn resolve_fbs_bytes(bytes: &[u8]) -> Result<Vec<u8>, DecodeError> {
    match detect(bytes) {
        Format::RawFbs => Ok(bytes.to_vec()),
        Format::Zip => extract_fbs_from_zip(bytes),
        Format::Json => Err(DecodeError::JsonNotSupported),
        Format::Unknown => Err(DecodeError::UnrecognizedFormat),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decode — JSON path
// ─────────────────────────────────────────────────────────────────────────────

fn decode_json(bytes: &[u8]) -> Result<Vec<Scene>, DecodeError> {
    let json_str =
        std::str::from_utf8(bytes).map_err(|e| DecodeError::Json(format!("invalid UTF-8: {e}")))?;
    let file = io_grida::parse(json_str).map_err(|e| DecodeError::Json(format!("{e}")))?;
    let mut converter = IdConverter::new();
    let scene = converter
        .convert_json_canvas_file(file)
        .map_err(|e| DecodeError::Conversion(e.to_string()))?;
    Ok(vec![scene])
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Decode the first scene from a `.grida` file (any format).
pub fn decode(bytes: &[u8]) -> Result<Scene, DecodeError> {
    decode_all(bytes)?
        .into_iter()
        .next()
        .ok_or(DecodeError::NoScenes)
}

/// Decode all scenes from a `.grida` file (any format).
pub fn decode_all(bytes: &[u8]) -> Result<Vec<Scene>, DecodeError> {
    match detect(bytes) {
        Format::RawFbs => Ok(io_grida_fbs::decode_all(bytes)?),
        Format::Zip => {
            let fbs_bytes = extract_fbs_from_zip(bytes)?;
            Ok(io_grida_fbs::decode_all(&fbs_bytes)?)
        }
        Format::Json => decode_json(bytes),
        Format::Unknown => Err(DecodeError::UnrecognizedFormat),
    }
}

/// Decode a `.grida` file (FBS or ZIP) and return scenes plus the
/// internal→string ID mapping.
///
/// JSON files are not supported here because the JSON codec does not preserve
/// the FBS-level ID map.  Use [`decode_all`] for JSON files.
pub fn decode_with_id_map(bytes: &[u8]) -> Result<io_grida_fbs::DecodeResult, DecodeError> {
    let fbs_bytes = resolve_fbs_bytes(bytes)?;
    Ok(io_grida_fbs::decode_with_id_map(&fbs_bytes)?)
}
