//! Dirty-flag invalidation for the renderer.
//!
//! This module centralizes the **classification** side of the
//! invalidation pipeline: mutation sites classify each change into a
//! [`ChangeKind`] (directly or via [`differ::diff_node`]), the
//! classifier in [`SceneDirty::apply`] translates that into per-phase
//! dirty sets, and mutation-site reporting (`GlobalFlag`) routes
//! scene-wide events into [`GlobalDirty`].
//!
//! The **dispatch** side — the "read the dirty sets and drive the
//! caches" function — lives on [`super::scene::Renderer::apply_changes`]
//! rather than in this module. Rationale: the dispatch mutates every
//! cache-owning field on `Renderer` (`scene_cache`, `layout_engine`,
//! `compositor_atlas`, pan/zoom image caches, font repository, window
//! context), and a free-function form would either need a large
//! context struct or `&mut Renderer`, both of which push more coupling
//! than they remove. Keeping the dispatcher on `Renderer` lets it use
//! disjoint field borrows directly.
//!
//! Rule: caches are dirty-unaware. Only `apply_changes` reads
//! `SceneDirty` and drives cache rebuilds.
//!
//! The classifier contract — which dirty sets each [`ChangeKind`]
//! populates — is documented as a table in
//! [`SceneDirty`](scene_dirty::SceneDirty).

pub mod change_kind;
pub mod differ;
pub mod lens;
pub mod scene_dirty;

pub use change_kind::{ChangeKind, Damage, GlobalFlag};
pub use differ::diff_node;
pub use scene_dirty::{GlobalDirty, SceneDirty};

/// `GRIDA_INVALIDATION_LOG=1` enables per-frame invalidation trace
/// logs. Checked once per process so interactive drag doesn't pay the
/// `std::env::var` syscall on every frame.
pub fn log_enabled() -> bool {
    use std::sync::OnceLock;
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("GRIDA_INVALIDATION_LOG").is_ok())
}
