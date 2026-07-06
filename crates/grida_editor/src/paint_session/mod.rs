//! Paint sessions — the in-canvas editing surfaces for one paint
//! (`docs/wg/canvas/paint-session/`). The [edit-mode](crate::mode) slot
//! owns a session's lifecycle; these modules own each paint kind's
//! surface and the coordinate model it edits.
//!
//! Each surface follows the vector-edit split: a pure, session-agnostic
//! math core (control-point ↔ transform, value edits, hit-testing,
//! chrome) with a stateful machine on top. Today only the
//! [`gradient`] session exists; the image session is its future
//! sibling.

pub mod gradient;
