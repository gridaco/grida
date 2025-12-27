use crate::cache::scene::SceneCache;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{Node, NodeId};
use crate::painter::layer::Layer;
use crate::sk;
use math2::{rect, rect::Rectangle, vector2::Vector2};

// TODO: Performance optimization opportunity
//
// Current Implementation:
// - Clipping checks are performed by traversing the parent hierarchy for each candidate node
// - This results in O(depth) work per candidate, where depth is the nesting level
// - The check happens after RTree spatial queries and bounds checks
//
// Performance Characteristics:
// - For typical nesting depths (2-5 levels): Acceptable performance
// - For deep nesting (10+ levels): May become a bottleneck
// - Hit testing is already throttled in the editor, mitigating impact
//
// Browser Alignment:
// - ✅ Correctly respects parent container clipping (clip = true)
// - ✅ Matches browser hit testing behavior
//
// Potential Optimization:
// - Pre-compute effective clip bounds during geometry cache construction
// - Store `effective_clip_bounds: Option<Rectangle>` in `GeometryEntry`
// - Compute as intersection of all parent container clip bounds during `GeometryCache::from_scene`
// - This would reduce hit testing from O(depth × candidates) to O(candidates)
// - Trade-off: Requires scene graph access during geometry cache construction
//
// Consider optimizing if profiling shows hit testing is a bottleneck in scenes with deep nesting.

/// Hit testing utilities for [`SceneCache`].
///
/// This module implements a simple geometry based hit tester. It queries
/// [`GeometryCache`] bounds stored inside a [`SceneCache`] and returns the node
/// identifiers that intersect a screen point.
///
/// Hit testing happens in a few steps:
/// 1. Filter nodes whose render bounds contain the point
/// 2. Sort the filtered nodes by z-index (which reflects tree order)
/// 3. Filter out nodes that are culled by parent container clipping
/// 4. Return the first match (path level checks TBD)
///
/// The sorted order mirrors DOM hit testing behaviour where the deepest node is
/// evaluated first.  Step three is left as a TODO until more reliable path
/// testing is implemented.
#[derive(Debug)]
pub struct HitTester<'a> {
    cache: &'a SceneCache,
    /// Optional scene graph reference for checking parent container clipping.
    /// When provided, hit testing will exclude nodes that are culled by parent containers.
    graph: Option<&'a SceneGraph>,
}

impl<'a> HitTester<'a> {
    /// Create a new [`HitTester`] backed by the given scene cache.
    pub fn new(cache: &'a SceneCache) -> Self {
        Self { cache, graph: None }
    }

    /// Create a new [`HitTester`] with scene graph for culling checks.
    /// When a scene graph is provided, hit testing will exclude nodes that are
    /// culled by parent containers with `clip = true`.
    pub fn with_graph(cache: &'a SceneCache, graph: &'a SceneGraph) -> Self {
        Self {
            cache,
            graph: Some(graph),
        }
    }

    /// Check if a point is within all parent container clip bounds.
    /// Returns `true` if the point is not culled by any parent container with `clip = true`.
    ///
    /// This function traverses up the parent hierarchy starting from the given node's parent,
    /// checking if the point is within each parent container's bounds when `clip = true`.
    fn is_point_within_parent_clip_bounds(&self, node_id: &NodeId, point: Vector2) -> bool {
        let Some(graph) = self.graph else {
            // If no scene graph is available, we can't check clipping, so assume it's valid
            return true;
        };

        // Start from the parent of the current node (clip only affects descendants)
        let mut current_id = self.cache.geometry.get_parent(node_id);

        while let Some(id) = current_id {
            // Get the node to check if it's a container with clip enabled
            if let Ok(node) = graph.get_node(&id) {
                match node {
                    Node::Container(n) => {
                        if n.clip {
                            // Check if the point is within this container's bounds
                            if let Some(bounds) = self.cache.geometry.get_world_bounds(&id) {
                                if !rect::contains_point(&bounds, point) {
                                    // Point is outside this clipping container's bounds
                                    return false;
                                }
                            }
                        }
                    }
                    _ => {
                        // Other node types don't have clipping
                    }
                }
            }

            // Move up to the next parent
            current_id = self.cache.geometry.get_parent(&id);
        }

        // Point passed all parent clip checks
        true
    }

    /// Fast hit testing using only axis-aligned bounding boxes.
    pub fn hit_first_fast(&self, point: Vector2) -> Option<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        for idx in indices.into_iter().rev() {
            let entry = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(&entry.id) {
                if rect::contains_point(&bounds, point) {
                    // Check if the point is within all parent container clip bounds
                    if self.is_point_within_parent_clip_bounds(&entry.id, point) {
                        return Some(entry.id);
                    }
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
            let entry = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(&entry.id) {
                if rect::contains_point(&bounds, point) {
                    // Check if the point is within all parent container clip bounds
                    if self.is_point_within_parent_clip_bounds(&entry.id, point) {
                        out.push(entry.id);
                    }
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
    /// This method matches browser's `elementFromPoint()` behavior:
    /// - Returns the topmost (visually on top) node at the point
    /// - For siblings: later siblings (added later in DOM order) are preferred
    /// - For nested nodes: deeper nodes (children) are preferred over their parents
    ///
    /// This stops as soon as a match is found, making it faster when only one result is needed.
    pub fn hit_first(&self, point: Vector2) -> Option<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        for idx in indices.into_iter().rev() {
            let entry = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(&entry.id) {
                if rect::contains_point(&bounds, point) {
                    let transform = entry.layer.transform();
                    let mut path = if let Some(path_entry) = self.cache.path.borrow().get(&entry.id)
                    {
                        (*path_entry.path).clone()
                    } else {
                        entry.layer.shape().to_path()
                    };
                    path = path.make_transform(&sk::sk_matrix(transform.matrix));
                    if path.contains((point[0], point[1])) {
                        // Check if the point is within all parent container clip bounds
                        if self.is_point_within_parent_clip_bounds(&entry.id, point) {
                            return Some(entry.id);
                        }
                    }
                }
            }
        }
        None
    }

    /// Returns all nodes containing the point ordered from top to bottom.
    ///
    /// The returned vector matches browser's `elementsFromPoint()` behavior:
    /// - Ordered from topmost (visually on top) to bottommost (visually at bottom)
    /// - For siblings at the same depth: later siblings (added later in DOM order) appear on top
    /// - For nodes at different depths: deeper nodes (children) come before their parents
    ///
    /// This ordering reflects reverse paint order (topmost first), where nodes are:
    /// 1. Grouped by stacking context
    /// 2. Ordered by z-index (when z-index is set)
    /// 3. Ordered by DOM order when z-index is equal (later siblings = higher z-index = on top)
    pub fn hits(&self, point: Vector2) -> Vec<NodeId> {
        let mut indices = self.cache.intersects_point(point);
        indices.sort();
        let mut out = Vec::with_capacity(indices.len());
        for idx in indices.into_iter().rev() {
            let entry = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(&entry.id) {
                if rect::contains_point(&bounds, point) {
                    let shape = entry.layer.shape();
                    let transform = entry.layer.transform();
                    let mut path = if let Some(path_entry) = self.cache.path.borrow().get(&entry.id)
                    {
                        (*path_entry.path).clone()
                    } else {
                        shape.to_path()
                    };
                    path = path.make_transform(&sk::sk_matrix(transform.matrix));
                    if path.contains((point[0], point[1])) {
                        // Check if the point is within all parent container clip bounds
                        if self.is_point_within_parent_clip_bounds(&entry.id, point) {
                            out.push(entry.id);
                        }
                    }
                }
            }
        }
        out
    }

    /// Returns `true` if the specified node contains the point within its
    /// render bounds.
    pub fn contains(&self, id: &NodeId, point: Vector2) -> bool {
        if let Some(entry) = self.cache.layers.layers.iter().find(|e| &e.id == id) {
            let shape = entry.layer.shape();
            let transform = entry.layer.transform();
            let mut path = if let Some(path_entry) = self.cache.path.borrow().get(id) {
                (*path_entry.path).clone()
            } else {
                shape.to_path()
            };
            path = path.make_transform(&sk::sk_matrix(transform.matrix));
            path.contains((point[0], point[1]))
        } else {
            false
        }
    }

    /// Returns all nodes whose bounding boxes intersect the given rectangle.
    ///
    /// The returned vector matches browser's ordering: from topmost to bottommost.
    /// This matches the behavior of `hits()` - see that method's documentation for details.
    ///
    /// Note: This method checks if the rectangle center point is within parent clip bounds.
    /// For more precise culling, consider using point-based hit testing methods.
    pub fn intersects(&self, rect: &Rectangle) -> Vec<NodeId> {
        let mut indices = self.cache.intersects(*rect);
        indices.sort();
        let mut out = Vec::with_capacity(indices.len());
        // Use the center point of the rectangle for culling checks
        let center_point = [rect.x + rect.width / 2.0, rect.y + rect.height / 2.0];
        for idx in indices.into_iter().rev() {
            let entry = &self.cache.layers.layers[idx];
            if let Some(bounds) = self.cache.geometry.get_render_bounds(&entry.id) {
                if rect::intersects(&bounds, rect) {
                    // Check if the rectangle center is within all parent container clip bounds
                    if self.is_point_within_parent_clip_bounds(&entry.id, center_point) {
                        out.push(entry.id);
                    }
                }
            }
        }
        out
    }
}
