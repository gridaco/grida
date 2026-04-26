//! Dev-only editor — owns document state, handles gestures, flushes
//! scenes to the `grida` renderer.
//!
//! This module is the **grida_dev counterpart** to the web editor's
//! React/Redux layer. It:
//! - Owns a mutable copy of the `Scene` (the editor document).
//! - Reads gesture/selection state from the `grida` surface.
//! - Performs mutations on its own document copy.
//! - Flushes the mutated scene to the renderer via `load_scene()`.
//!
//! The `grida` crate remains a pure renderer — it never knows about
//! mutations. This editor is strictly for dev/testing purposes.

pub mod document;
pub mod mutation;
