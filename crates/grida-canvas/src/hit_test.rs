use crate::cache::scene::SceneCache;
use crate::node::schema::NodeId;
use crate::painter::{cvt, layer::Layer};
use math2::rect;
use math2::vector2::Vector2;

/// Hit testing utilities for [`SceneCache`].
///
/// This module implements a simple geometry based hit tester. It queries
/// [`GeometryCache`] bounds stored inside a [`SceneCache`] and returns the node
/// identifiers that intersect a screen point.
///
/// Hit testing happens in a few steps:
/// 1. Filter nodes whose render bounds contain the point
/// 2. Sort the filtered nodes by z-index (which reflects tree order)
/// 3. Return the first match (path level checks TBD)
///
/// The sorted order mirrors DOM hit testing behaviour where the deepest node is
/// evaluated first.  Step three is left as a TODO until more reliable path
/// testing is implemented.
#[derive(Debug)]
pub struct HitTester<'a> {
    cache: &'a SceneCache,
}

impl<'a> HitTester<'a> {
    /// Create a new [`HitTester`] backed by the given scene cache.
    pub fn new(cache: &'a SceneCache) -> Self {
        Self { cache }
    }

    /// Fast hit testing using only axis-aligned bounding boxes.
    pub fn hit_first_fast(&self, point: Vector2) -> Option<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        for idx in indices.into_iter().rev() {
            let layer = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(layer.id()) {
                if rect::contains_point(&bounds, point) {
                    return Some(layer.id().clone());
                }
            }
        }
        None
    }

    /// Return all nodes whose bounding boxes contain the point.
    pub fn hits_fast(&self, point: Vector2) -> Vec<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        let mut out = Vec::with_capacity(indices.len());
        for idx in indices.into_iter().rev() {
            let layer = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(layer.id()) {
                if rect::contains_point(&bounds, point) {
                    out.push(layer.id().clone());
                }
            }
        }
        out
    }

    /// Check bounding box containment for a single node.
    pub fn contains_fast(&self, id: &NodeId, point: Vector2) -> bool {
        self.cache
            .geometry
            .get_render_bounds(id)
            .map(|b| rect::contains_point(&b, point))
            .unwrap_or(false)
    }

    /// Returns the top-most node containing the point, if any.
    ///
    /// Layers are checked from deepest to shallowest, so the first match mimics
    /// DOM hit testing semantics. This stops as soon as a match is found,
    /// making it faster when only one result is needed.
    pub fn hit_first(&self, point: Vector2) -> Option<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        for idx in indices.into_iter().rev() {
            let layer = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(layer.id()) {
                if rect::contains_point(&bounds, point) {
                    let base = match layer {
                        crate::painter::layer::PainterPictureLayer::Shape(s) => &s.base,
                        crate::painter::layer::PainterPictureLayer::Text(t) => &t.base,
                    };
                    let mut path = if let Some(entry) = self.cache.path.borrow().get(layer.id()) {
                        (*entry.path).clone()
                    } else {
                        base.shape.to_path()
                    };
                    path.transform(&cvt::sk_matrix(base.transform.matrix));
                    if path.contains((point[0], point[1])) {
                        return Some(layer.id().clone());
                    }
                }
            }
        }
        None
    }

    /// Returns all nodes containing the point ordered from top to bottom.
    ///
    /// The returned vector is sorted from deepest to shallowest, mirroring how
    /// events bubble in typical DOM systems.
    pub fn hits(&self, point: Vector2) -> Vec<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        let mut out = Vec::with_capacity(indices.len());
        for idx in indices.into_iter().rev() {
            let layer = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(layer.id()) {
                if rect::contains_point(&bounds, point) {
                    let base = match layer {
                        crate::painter::layer::PainterPictureLayer::Shape(s) => &s.base,
                        crate::painter::layer::PainterPictureLayer::Text(t) => &t.base,
                    };
                    let mut path = if let Some(entry) = self.cache.path.borrow().get(layer.id()) {
                        (*entry.path).clone()
                    } else {
                        base.shape.to_path()
                    };
                    path.transform(&cvt::sk_matrix(base.transform.matrix));
                    if path.contains((point[0], point[1])) {
                        out.push(layer.id().clone());
                    }
                }
            }
        }
        out
    }

    /// Returns `true` if the specified node contains the point within its
    /// render bounds.
    pub fn contains(&self, id: &NodeId, point: Vector2) -> bool {
        if let Some(layer) = self.cache.layers.layers.iter().find(|l| l.id() == id) {
            let base = match layer {
                crate::painter::layer::PainterPictureLayer::Shape(s) => &s.base,
                crate::painter::layer::PainterPictureLayer::Text(t) => &t.base,
            };
            let mut path = if let Some(entry) = self.cache.path.borrow().get(id) {
                (*entry.path).clone()
            } else {
                base.shape.to_path()
            };
            path.transform(&cvt::sk_matrix(base.transform.matrix));
            path.contains((point[0], point[1]))
        } else {
            false
        }
    }
}
