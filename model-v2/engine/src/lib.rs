//! anchor-engine — the phase-4 canvas engine skeleton on the `anchor`
//! model ([`anchor_lab`], consumed as a library — the same relationship
//! `crates/grida` will have with the model crate after the migration).
//!
//! This crate is the pipeline: `document -> resolve -> drawlist -> paint`
//! (the browser's staged-and-pure discipline) plus the read tier
//! (`query`), time-as-data (`journal`/`replay`), and the sockets every
//! future optimization plugs into (`damage`, `ident`, `oracle`). The
//! contracts it encodes are catalogued in `model-v2/a/ENGINE.md`
//! (ENG-0…ENG-5); each module names the contract it serves.
//!
//! Host chrome (winit/egui/GL) lives in the host (the spike, later
//! `crates/grida`), never here. Raster access is confined to [`paint`];
//! [`text_layout`] may use Skia Paragraph only as an explicit shaping oracle.

pub mod cache;
pub mod damage;
pub mod drawlist;
pub mod frame;
pub mod ident;
pub mod journal;
pub mod oracle;
pub mod paint;
pub mod query;
pub mod replay;
mod text_layout;
pub mod trace;
