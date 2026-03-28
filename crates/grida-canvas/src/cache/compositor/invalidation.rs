//! Invalidation pipeline for the layer compositing cache.
//!
//! Provides a unified interface for marking cached layer images as dirty
//! in response to scene changes, zoom changes, font/image loading, etc.

use crate::cache::compositor::cache::LayerImageCache;
use crate::node::schema::NodeId;

/// Describes why a cache invalidation was triggered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidationEvent {
    /// A node's content (fills, strokes, effects, text) changed.
    NodeContentChanged(NodeId),
    /// A node's transform changed. For layer compositing this is a no-op
    /// because the transform is applied at composite time, not baked into
    /// the cached image.
    NodeTransformChanged(NodeId),
    /// A child of a promoted parent changed (requires re-rasterization of
    /// the parent if the parent is promoted as a subtree).
    ChildChanged { parent_id: NodeId },
    /// The camera zoom changed — all cached images need re-rasterization
    /// at the new density.
    ZoomChanged,
    /// A font was loaded — mark affected text nodes dirty.
    FontLoaded,
    /// An image resource was loaded — mark affected image nodes dirty.
    ImageLoaded,
    /// Full scene reload — clear everything.
    SceneReload,
}

/// Apply an invalidation event to the layer image cache.
///
/// This is the central dispatcher that translates high-level scene events
/// into cache mutations.
pub fn apply_invalidation(cache: &mut LayerImageCache, event: InvalidationEvent) {
    match event {
        InvalidationEvent::NodeContentChanged(id) => {
            cache.invalidate(&id);
        }
        InvalidationEvent::NodeTransformChanged(_id) => {
            // Transform is applied at composite time (world-space blit).
            // The cached image content doesn't change — no-op.
        }
        InvalidationEvent::ChildChanged { parent_id } => {
            // If the parent is promoted as a subtree, its cached image
            // includes the child's content and must be refreshed.
            cache.invalidate(&parent_id);
        }
        InvalidationEvent::ZoomChanged => {
            // All images were rasterized at the old density. Mark as
            // stale (not dirty) — they remain valid for GPU-stretched
            // blitting and are progressively re-rasterized within the
            // per-frame budget.
            cache.mark_all_stale();
        }
        InvalidationEvent::FontLoaded | InvalidationEvent::ImageLoaded => {
            // Conservative: mark everything dirty. A more targeted
            // approach would track which nodes reference which resources.
            cache.invalidate_all();
        }
        InvalidationEvent::SceneReload => {
            cache.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::compositor::cache::LayerImageCache;
    use math2::rect::Rectangle;

    use crate::cg::prelude::LayerBlendMode;

    fn make_test_image(w: i32, h: i32) -> skia_safe::Image {
        use skia_safe::surfaces;
        let mut surface =
            surfaces::raster_n32_premul((w, h)).expect("Failed to create test surface");
        surface.image_snapshot()
    }

    fn zero_rect() -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }

    fn ins(cache: &mut LayerImageCache, id: u64, w: i32, h: i32) {
        cache.insert(
            id,
            make_test_image(w, h),
            1.0,
            zero_rect(),
            1.0,
            LayerBlendMode::default(),
        );
    }

    #[test]
    fn node_content_changed_marks_dirty() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        ins(&mut cache, 1, 10, 10);

        apply_invalidation(&mut cache, InvalidationEvent::NodeContentChanged(1));
        assert!(cache.get(&1).is_none());
        assert!(cache.is_promoted(&1));
    }

    #[test]
    fn transform_changed_is_noop() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        ins(&mut cache, 1, 10, 10);

        apply_invalidation(&mut cache, InvalidationEvent::NodeTransformChanged(1));
        assert!(cache.get(&1).is_some());
    }

    #[test]
    fn zoom_changed_marks_stale_not_dirty() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        ins(&mut cache, 1, 10, 10);
        ins(&mut cache, 2, 10, 10);

        apply_invalidation(&mut cache, InvalidationEvent::ZoomChanged);
        // Stale entries are still returned by get() — they are valid
        // for GPU-stretched blitting.
        let e1 = cache.get(&1).unwrap();
        assert!(e1.stale);
        assert!(!e1.dirty);
        let e2 = cache.get(&2).unwrap();
        assert!(e2.stale);
        assert!(!e2.dirty);
        assert_eq!(cache.stale_count(), 2);
    }

    #[test]
    fn scene_reload_clears_cache() {
        let mut cache = LayerImageCache::new(1024 * 1024);
        ins(&mut cache, 1, 10, 10);

        apply_invalidation(&mut cache, InvalidationEvent::SceneReload);
        assert_eq!(cache.len(), 0);
    }
}
