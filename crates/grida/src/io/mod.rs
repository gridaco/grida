//! Primary `.grida` format codec (and a couple of internal wire formats).
//!
//! External format conversion lives under [`crate::import`] / [`crate::formats`]
//! / [`crate::export`], not here.

pub mod generated;

pub mod io_grida_fbs;

pub mod io_grida_file;
pub mod vn_json;
