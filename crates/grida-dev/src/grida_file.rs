//! `.grida` file format detection and decoding — thin wrapper around
//! [`cg::io::io_grida_file`] with `anyhow::Result` ergonomics.

use anyhow::{anyhow, Result};
use cg::io::{io_grida_fbs, io_grida_file};
use cg::node::schema::Scene;

/// Re-export the format enum for callers that need it.
#[allow(unused_imports)]
pub use io_grida_file::Format;

/// Decodes a `.grida` file (any format) into a [`Scene`].
///
/// If the file contains multiple scenes, only the first is returned.
/// Use [`decode_all`] to get all scenes.
#[allow(dead_code)]
pub fn decode(bytes: &[u8]) -> Result<Scene> {
    io_grida_file::decode(bytes).map_err(|e| anyhow!("{e}"))
}

/// Decodes a `.grida` file (any format) into all [`Scene`]s it contains.
pub fn decode_all(bytes: &[u8]) -> Result<Vec<Scene>> {
    io_grida_file::decode_all(bytes).map_err(|e| anyhow!("{e}"))
}

/// Decodes a `.grida` file (FBS or ZIP) with internal→string ID mapping.
///
/// Returns an error for JSON input.
#[allow(dead_code)]
pub fn decode_with_id_map(bytes: &[u8]) -> Result<io_grida_fbs::DecodeResult> {
    io_grida_file::decode_with_id_map(bytes).map_err(|e| anyhow!("{e}"))
}
