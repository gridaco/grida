//! Render-time viewport filters.
//!
//! These filters restrict what the renderer draws and hit-tests without
//! mutating the document, caches, or layout. They are pure viewport
//! overlays — the scene graph stays fully loaded and laid out.
//!
//! The [`RenderFilter`] struct is the single home for all viewport-time
//! filters. Adding a new filter category (e.g. visibility overrides,
//! layer-type filters, debug tints) means adding a field here — no need
//! to plumb a fresh field through every layer.

use crate::node::schema::NodeId;

// ---------------------------------------------------------------------------
// IsolationMode
// ---------------------------------------------------------------------------

/// Viewport filter that restricts which part of the scene is drawn and
/// hit-tested. Does NOT mutate the document, caches, or layout.
///
/// This is the same primitive Blender calls "Local View", Maya/Max/C4D
/// call "Isolate Select", Illustrator calls "Isolation Mode", and After
/// Effects calls "Solo".
#[derive(Debug, Clone)]
pub struct IsolationMode {
    /// The only node whose subtree (including itself) is drawn and
    /// hit-tested. Everything else is invisible to paint and pointer.
    pub root: NodeId,
    // Future fields may include:
    //   pub outside: OutsideStyle,      // "hide" | "fade" | "cover"
    //   pub roots: Vec<NodeId>,         // multi-root isolation
    //   pub hit_test: bool,             // scope hit-testing too? default yes
}

// ---------------------------------------------------------------------------
// RenderFilter
// ---------------------------------------------------------------------------

/// Composite render-time filter owned by the Renderer.
///
/// Isolation is the first slot; future filters (visibility overrides,
/// layer-type filters, debug tints) can hang off the same struct without
/// plumbing a fresh field through every layer.
#[derive(Debug, Clone, Default)]
pub struct RenderFilter {
    /// When set, only the isolation root and its descendants are drawn
    /// and hit-tested. Everything else is invisible.
    pub isolation_mode: Option<IsolationMode>,
}
