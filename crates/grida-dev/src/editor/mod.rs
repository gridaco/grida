//! Dev-only editor — owns document state, handles gestures, flushes
//! scenes to the `cg` renderer.
//!
//! This module is the **grida-dev counterpart** to the web editor's
//! React/Redux layer. It:
//! - Owns a mutable copy of the `Scene` (the editor document).
//! - Reads gesture/selection state from the `cg` surface.
//! - Performs mutations on its own document copy.
//! - Flushes the mutated scene to the renderer via `load_scene()`.
//!
//! The `cg` crate remains a pure renderer — it never knows about
//! mutations. This editor is strictly for dev/testing purposes.

pub mod document;
pub mod mutation;
