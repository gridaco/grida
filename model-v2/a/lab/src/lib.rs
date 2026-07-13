//! anchor-lab — the model-v2 `anchor` proving lab.
//!
//! Implements the model of `model-v2/models/a.md` (lab subset) to run the
//! experiment ledger of `model-v2/a/README.md`:
//! - E1 rotation-in-flow (both semantics behind [`resolve::RotationInFlow`])
//! - E3 agent text IR ([`textir`])
//! - E4 resolver spike ([`resolve`])
//!
//! Standalone by design; promoted into `crates/` only at phase 4.

pub mod grida_xml;
pub mod grida_xml_source;
pub mod math;
pub mod measure;
pub mod model;
pub mod ops;
pub mod path;
pub mod pick;
pub mod properties;
pub mod renderability;
pub mod resolve;
pub mod rounded_box;
pub mod svgout;
pub mod text_layout;
pub mod textir;
