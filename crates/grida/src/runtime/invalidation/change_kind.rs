//! [`ChangeKind`], [`Damage`], and [`GlobalFlag`] taxonomy.
//!
//! Four per-node variants (`None`, `Layout`, `Paint`, `Full`) plus a
//! small set of global flags for orthogonal invalidations. Splitting
//! `Full` or `Paint` further (`PaintFill` / `PaintEffect`) is future
//! work; the classifier contract in [`super::scene_dirty`] absorbs
//! those additions without rewiring downstream consumers.

/// What changed on a node.
///
/// Produced by the differ (or directly emitted by a mutation API when
/// the caller already knows the change shape, e.g.
/// `MutationCommand::Translate` → `Layout`). Consumed by
/// [`super::SceneDirty::apply`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ChangeKind {
    /// Old and new are equal. Skip all invalidation.
    #[default]
    None,

    /// The node's own placement in its parent's space changed —
    /// `AffineTransform` on leaf variants, or `position + rotation`
    /// on `Container`/`Tray`. Both are surfaced uniformly by
    /// [`super::lens::motion_of`].
    ///
    /// Semantically a layout change: a node's position in space is
    /// a layout concern, regardless of whether a flex recompute is
    /// needed. The downstream cache-refresh strategy (whether to
    /// re-run Taffy, whether to rebuild geometry per-subtree, etc.)
    /// is a separate concern owned by the dispatcher.
    Layout,

    /// Paint-only properties changed (fill, stroke, blend mode,
    /// opacity, compatible effects).
    ///
    /// No layout, no geometry, no effect-tree rebuild. Downstream
    /// work is LayerList rebuild (paint fields are cached on layer
    /// structs) plus per-node picture-cache invalidation + viewport
    /// damage.
    Paint,

    /// Anything else: size change, layout-affecting property,
    /// structural change, compound change, or differ uncertainty.
    ///
    /// Routes to the current full-rebuild path. The `Full` variant is
    /// the safe fallback whenever the differ cannot confidently pick a
    /// narrower kind.
    Full,
}

/// Viewport image-cache invalidation.
///
/// In v1 only `None` and `Full` are used; `Rect(IRect)` is reserved
/// for future partial-raster invalidation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Damage {
    /// Keep pan/zoom caches as-is.
    #[default]
    None,
    /// Drop both pan and zoom caches.
    Full,
}

impl Damage {
    /// Combine two damage values, taking the broader of the two.
    pub const fn merge(self, other: Damage) -> Damage {
        match (self, other) {
            (Damage::Full, _) | (_, Damage::Full) => Damage::Full,
            _ => Damage::None,
        }
    }
}

/// Global invalidations orthogonal to per-node work.
///
/// These don't come from the differ; they're set by the renderer when
/// external events (scene load, viewport resize, font/image load,
/// config change) happen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GlobalFlag {
    SceneLoad,
    ViewportSize,
    FontLoaded,
    ImageLoaded,
    Config,
    RenderFilter,
    /// Scene-wide layout-dirty signal (e.g. emitted after a
    /// viewport-affecting config change). Per-node layout dirtying goes
    /// through [`ChangeKind::Full`] / [`super::SceneDirty::layout`]
    /// instead.
    Layout,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_change_kind_is_none() {
        assert_eq!(ChangeKind::default(), ChangeKind::None);
    }

    #[test]
    fn damage_merge_is_monotonic() {
        assert_eq!(Damage::None.merge(Damage::None), Damage::None);
        assert_eq!(Damage::None.merge(Damage::Full), Damage::Full);
        assert_eq!(Damage::Full.merge(Damage::None), Damage::Full);
        assert_eq!(Damage::Full.merge(Damage::Full), Damage::Full);
    }
}
