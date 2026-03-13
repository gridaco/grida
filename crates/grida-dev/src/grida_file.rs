//! `.grida` file format detection and decoding.
//!
//! A `.grida` file is one of two variants:
//! - **Raw FlatBuffers** – identified by the `"GRID"` file identifier at bytes 4–7.
//! - **ZIP archive** – identified by PK magic bytes; contains `manifest.json` and
//!   `document.grida` (a raw FlatBuffers binary) plus optional `images/` and `bitmaps/`.

use anyhow::{anyhow, Context, Result};
use cg::io::{id_converter::IdConverter, io_grida, io_grida_fbs};
use cg::node::schema::Scene;

/// Detected variant of a `.grida` file.
enum Format {
    RawFbs,
    Zip,
    Json,
    Unknown,
}

fn detect(bytes: &[u8]) -> Format {
    // ZIP magic: PK\x03\x04 or PK\x05\x06
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
    // JSON: starts with '{' or '[' (after optional UTF-8 BOM / whitespace)
    let trimmed = bytes
        .iter()
        .position(|&b| !b.is_ascii_whitespace() && b != 0xEF && b != 0xBB && b != 0xBF)
        .map(|i| bytes[i])
        .unwrap_or(0);
    if trimmed == b'{' || trimmed == b'[' {
        return Format::Json;
    }
    Format::Unknown
}

/// Extracts the raw FlatBuffers bytes from a `.grida` ZIP archive.
fn extract_fbs_from_zip(bytes: &[u8]) -> Result<Vec<u8>> {
    use std::io::{Cursor, Read};
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).context("failed to open .grida ZIP")?;

    anyhow::ensure!(
        archive.by_name("manifest.json").is_ok(),
        ".grida ZIP is missing manifest.json"
    );

    let mut doc_file = archive
        .by_name("document.grida")
        .context(".grida ZIP is missing document.grida")?;
    let mut fbs_bytes = Vec::with_capacity(doc_file.size() as usize);
    doc_file
        .read_to_end(&mut fbs_bytes)
        .context("failed to read document.grida from ZIP")?;
    Ok(fbs_bytes)
}

/// Decodes a `.grida` file (raw FlatBuffers or ZIP) into a [`Scene`].
///
/// If the file contains multiple scenes, only the first is returned.
/// Use [`decode_all`] to get all scenes.
pub fn decode(bytes: &[u8]) -> Result<Scene> {
    decode_all(bytes)?
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("no scenes found in .grida file"))
}

/// Decodes a `.grida` file into all [`Scene`]s it contains.
pub fn decode_all(bytes: &[u8]) -> Result<Vec<Scene>> {
    match detect(bytes) {
        Format::RawFbs => io_grida_fbs::decode_all(bytes).map_err(|err| anyhow!("{err}")),
        Format::Zip => {
            let fbs_bytes = extract_fbs_from_zip(bytes)?;
            io_grida_fbs::decode_all(&fbs_bytes).map_err(|err| anyhow!("{err}"))
        }
        Format::Json => {
            let json_str = std::str::from_utf8(bytes).context("invalid UTF-8 in JSON scene")?;
            let file = io_grida::parse(json_str)
                .map_err(|err| anyhow!("failed to parse JSON scene: {err}"))?;
            let mut converter = IdConverter::new();
            let scene = converter
                .convert_json_canvas_file(file)
                .map_err(|err| anyhow!("failed to convert JSON scene: {err}"))?;
            Ok(vec![scene])
        }
        Format::Unknown => Err(anyhow!(
            "unrecognized file format: expected a .grida FlatBuffers binary, ZIP archive, or JSON"
        )),
    }
}
