//! `ScopedSvgPaintState` — context shared along the paint walk.
//!
//! Carries the resource table and any other per-paint context that
//! shape/container painters need. Mirrors Blink's `ScopedSVGPaintState`.
//! Light for now (just `Resources`); grows to include CSS context, paint
//! mode, etc. as features land.
//!
//! Blink anchor: `core/paint/scoped_svg_paint_state.{h,cc}`.

use csscascade::dom::{DemoDom, NodeId};

use crate::htmlcss::svg::resources::svg_resources::Resources;
use crate::htmlcss::svg::FontResolver;
use crate::htmlcss::ImageProvider;

/// Maximum nested-`<use>` depth. Matches Blink's
/// `kSVGUseRecursionLimit` (which is also 8). Protects against
/// pathological self-referential `<use>` chains that the resvg-test-suite
/// stress-tests deliberately.
pub const MAX_USE_DEPTH: u32 = 8;

/// Maximum nested-mask depth. The spec leaves cyclic mask references
/// undefined; resvg cuts the recursion early. We take 4 (deep enough
/// for legitimate use, shallow enough that pathological cycles abort
/// before stack space runs out).
pub const MAX_MASK_DEPTH: u32 = 4;

/// Maximum nested-filter depth. Filters can self-reference through
/// `<use>` chains and `feImage`; bound the recursion so the saveLayer
/// stack stays finite. Same rationale as [`MAX_MASK_DEPTH`].
pub const MAX_FILTER_DEPTH: u32 = 4;

/// Maximum nested-pattern depth. A pattern child can paint a shape
/// whose `fill=url(#self)` re-enters pattern resolution; without a
/// guard we recur until stack exhaustion. 4 is enough for legitimate
/// patterns-of-patterns and stops cycles short.
pub const MAX_PATTERN_DEPTH: u32 = 4;

/// Maximum nested-marker depth. Per SVG 2 §11.6.4 a marker's own
/// content does not paint markers — `marker-*` references inside a
/// `<marker>` subtree are ignored. (Blink:
/// `LayoutSVGShape::ShouldGenerateMarkerPositions` skips when the
/// containing layout object is a marker.) We model that by gating
/// at depth 1: the original shape paints its markers at depth 0,
/// and any shape painted inside a marker is at depth ≥ 1 and skips.
pub const MAX_MARKER_DEPTH: u32 = 1;

#[derive(Clone, Copy)]
pub struct PaintCtx<'a> {
    pub dom: &'a DemoDom,
    pub resources: &'a Resources,
    /// Image source for `<image>` and `feImage` `href`s. Inline `data:`
    /// URIs are decoded by the painter directly; non-data URLs are
    /// looked up here. Pass `&NoImages` when no external images are
    /// available (the default for `render_to_picture`).
    pub images: &'a dyn ImageProvider,
    /// Typeface source for `<text>` painting. Pass `&SystemFonts` to
    /// use the platform `FontMgr`; pass a host-supplied `PreloadedFonts`
    /// (or any `FontResolver` impl) to drive the painter from a curated
    /// font set.
    pub fonts: &'a dyn FontResolver,
    /// Current `<use>` expansion depth. Container/shape painters pass
    /// this through unchanged; `paint_use` increments before recursing.
    pub use_depth: u32,
    /// Current mask nesting depth — incremented every time we enter a
    /// mask layer.
    pub mask_depth: u32,
    /// Current filter nesting depth — incremented every time we enter
    /// a filtered subtree.
    pub filter_depth: u32,
    /// Current pattern nesting depth — incremented every time we
    /// recurse into a `<pattern>` subtree to record its tile picture.
    pub pattern_depth: u32,
    /// Current marker nesting depth — incremented every time we
    /// recurse into a `<marker>` subtree.
    pub marker_depth: u32,
    /// Initial viewport size in user units — the rendering canvas
    /// dimensions the host gave us. Used to resolve `vw` / `vh` /
    /// `vmin` / `vmax` (CSS Values 4 §8). For a standalone SVG
    /// rendered to a 500×500 PNG, this is `(500.0, 500.0)`.
    pub initial_viewport: (f32, f32),
    /// Stack of nested `<use>` elements whose subtree we're currently
    /// painting, innermost last. Inheritable property resolution
    /// (fill, stroke, font-size, …) consults attributes here in
    /// addition to the DOM ancestor chain so an SVG like
    /// `<use fill="green" href="#g"/>` propagates the green fill into
    /// the cloned subtree. Mirrors Blink's "use shadow tree"
    /// composition (`SVGUseElement::CreateInstanceTree`).
    ///
    /// Modeled as a stack of references so multiple levels of `<use>`
    /// each contribute (innermost wins, then outer). Implemented as a
    /// linked list of stack frames so `PaintCtx` stays `Copy` — each
    /// recursion adds one frame on the caller's stack and points
    /// `use_chain` at it.
    pub use_chain: Option<&'a UseFrame<'a>>,
}

/// One link in the `<use>` recursion stack. Carries the `<use>`
/// element id (for inheritance lookup) and the resolved target id
/// (for cycle detection — non-ancestor cycles like `#a → #b → #a`
/// are caught by walking this chain).
#[derive(Clone, Copy)]
pub struct UseFrame<'a> {
    pub use_id: NodeId,
    pub target_id: NodeId,
    pub parent: Option<&'a UseFrame<'a>>,
}

impl<'a> UseFrame<'a> {
    /// Returns true if `target` already appears in the chain — used
    /// by `paint_use` to abort recursion before painting a cyclic
    /// reference.
    pub fn contains_target(&self, target: NodeId) -> bool {
        if self.target_id == target {
            return true;
        }
        match self.parent {
            Some(p) => p.contains_target(target),
            None => false,
        }
    }
}

/// Walk the `<use>` chain innermost-first. Each `use_id` is yielded
/// in turn so callers can read inheritable attributes from the
/// closest `<use>` first.
pub fn use_chain_iter<'a>(chain: Option<&'a UseFrame<'a>>) -> impl Iterator<Item = NodeId> + 'a {
    let mut cursor = chain;
    std::iter::from_fn(move || {
        let frame = cursor?;
        cursor = frame.parent;
        Some(frame.use_id)
    })
}

impl<'a> PaintCtx<'a> {
    pub fn new(
        dom: &'a DemoDom,
        resources: &'a Resources,
        images: &'a dyn ImageProvider,
        fonts: &'a dyn FontResolver,
        initial_viewport: (f32, f32),
    ) -> Self {
        Self {
            dom,
            resources,
            images,
            fonts,
            use_depth: 0,
            mask_depth: 0,
            filter_depth: 0,
            pattern_depth: 0,
            marker_depth: 0,
            initial_viewport,
            use_chain: None,
        }
    }

    pub fn with_use_chain(self, frame: &'a UseFrame<'a>) -> Self {
        Self {
            use_chain: Some(frame),
            ..self
        }
    }

    pub fn with_deeper_use(self) -> Self {
        Self {
            use_depth: self.use_depth + 1,
            ..self
        }
    }

    pub fn with_deeper_mask(self) -> Self {
        Self {
            mask_depth: self.mask_depth + 1,
            ..self
        }
    }

    pub fn with_deeper_filter(self) -> Self {
        Self {
            filter_depth: self.filter_depth + 1,
            ..self
        }
    }

    pub fn with_deeper_pattern(self) -> Self {
        Self {
            pattern_depth: self.pattern_depth + 1,
            ..self
        }
    }

    pub fn with_deeper_marker(self) -> Self {
        Self {
            marker_depth: self.marker_depth + 1,
            ..self
        }
    }
}
