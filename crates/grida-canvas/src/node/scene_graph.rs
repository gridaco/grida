use super::repository::NodeRepository;
use super::schema::{extract_layer_core, Node, NodeGeometryMixin, NodeId, NodeLayerCore, NodeRectMixin};
use crate::cache::fast_hash::DenseNodeMap;
use crate::cg::prelude::*;
use math2::transform::AffineTransform;
use std::collections::HashMap;

/// Parent reference in the scene graph
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Parent {
    /// Root-level node (direct child of the scene)
    Root,
    /// Child of another node
    NodeId(NodeId),
}

/// Error type for SceneGraph operations
#[derive(Debug, Clone)]
pub enum SceneGraphError {
    NodeNotFound(NodeId),
    ParentNotFound(NodeId),
    ChildNotFound(NodeId),
    IndexOutOfBounds {
        parent: NodeId,
        index: usize,
        len: usize,
    },
}

impl std::fmt::Display for SceneGraphError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SceneGraphError::NodeNotFound(id) => write!(f, "Node not found: {}", id),
            SceneGraphError::ParentNotFound(id) => write!(f, "Parent not found: {}", id),
            SceneGraphError::ChildNotFound(id) => write!(f, "Child not found: {}", id),
            SceneGraphError::IndexOutOfBounds { parent, index, len } => {
                write!(
                    f,
                    "Index out of bounds for parent {}: index {} but length is {}",
                    parent, index, len
                )
            }
        }
    }
}

impl std::error::Error for SceneGraphError {}

pub type SceneGraphResult<T> = Result<T, SceneGraphError>;

// ---------------------------------------------------------------------------
// NodeGeoData — compact, schema-level geometry data per node
// ---------------------------------------------------------------------------

/// Classifies how a node participates in geometry computation.
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum GeoNodeKind {
    Group,
    InitialContainer,
    Container,
    BooleanOperation,
    TextSpan,
    Leaf,
}

/// Pre-computed render bounds inflation.
///
/// Stores per-side pixel expansion from stroke + effects, computed at
/// construction time. `Copy`, no heap allocation, 16 bytes total.
/// The geometry cache inflates world bounds by these values at DFS time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RenderBoundsInflation {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl RenderBoundsInflation {
    pub const ZERO: Self = Self {
        top: 0.0,
        right: 0.0,
        bottom: 0.0,
        left: 0.0,
    };

    /// Uniform inflation on all sides.
    pub fn uniform(delta: f32) -> Self {
        Self {
            top: delta,
            right: delta,
            bottom: delta,
            left: delta,
        }
    }

    /// Expand this inflation to include another inflation (per-side max).
    pub fn expand(&self, other: &Self) -> Self {
        Self {
            top: self.top.max(other.top),
            right: self.right.max(other.right),
            bottom: self.bottom.max(other.bottom),
            left: self.left.max(other.left),
        }
    }

    /// Whether this inflation is all zeros.
    pub fn is_zero(&self) -> bool {
        self.top == 0.0 && self.right == 0.0 && self.bottom == 0.0 && self.left == 0.0
    }
}

/// Compact, schema-level geometry data extracted from a `Node` at construction
/// time. Stored in a parallel `DenseNodeMap` on the `SceneGraph` so that the
/// geometry cache never needs to iterate over the full `Node` enum.
///
/// Layout-dependent fields (final width/height/position) are resolved by the
/// geometry cache using this data + `LayoutResult`.
///
/// This struct is `Copy` — no heap allocations, ~48 bytes total.
#[derive(Debug, Clone, Copy)]
pub struct NodeGeoData {
    /// The node's transform as stored in the schema.
    ///
    /// For Container nodes, this is `AffineTransform::new(fallback_x, fallback_y, rotation)`.
    /// The geometry cache may override x/y from layout results.
    pub schema_transform: AffineTransform,
    /// Schema width (from size, rect(), or network.bounds()).
    pub schema_width: f32,
    /// Schema height.
    pub schema_height: f32,
    /// What kind of node (determines DFS behavior).
    pub kind: GeoNodeKind,
    /// Pre-computed per-side render bounds inflation from stroke + effects.
    pub render_bounds_inflation: RenderBoundsInflation,
    /// Container rotation (needed to reconstruct transform from layout x/y).
    /// Only meaningful for Container nodes; 0.0 for others.
    pub rotation: f32,
}

/// Extract schema-level geometry data from a `Node`.
///
/// This is a pure function of the Node — no layout results, no font metrics,
/// no paragraph cache. Called once per node during SceneGraph construction.
/// All values are `Copy` — zero heap allocations.
pub fn extract_geo_data(node: &Node) -> NodeGeoData {
    match node {
        Node::Group(n) => NodeGeoData {
            schema_transform: n.transform.unwrap_or_default(),
            schema_width: 0.0,
            schema_height: 0.0,
            kind: GeoNodeKind::Group,
            render_bounds_inflation: RenderBoundsInflation::ZERO, // union of children
            rotation: 0.0,
        },
        Node::InitialContainer(_) => NodeGeoData {
            schema_transform: AffineTransform::identity(),
            schema_width: 0.0,
            schema_height: 0.0,
            kind: GeoNodeKind::InitialContainer,
            render_bounds_inflation: RenderBoundsInflation::ZERO,
            rotation: 0.0,
        },
        Node::BooleanOperation(n) => NodeGeoData {
            schema_transform: n.transform.unwrap_or_default(),
            schema_width: 0.0,
            schema_height: 0.0,
            kind: GeoNodeKind::BooleanOperation,
            render_bounds_inflation: compute_inflation_uniform(
                n.stroke_width.value_or_zero(),
                n.stroke_style.stroke_align,
                &n.effects,
            ),
            rotation: 0.0,
        },
        Node::Container(n) => {
            let fallback_x = n.position.x().unwrap_or(0.0);
            let fallback_y = n.position.y().unwrap_or(0.0);
            let schema_transform = AffineTransform::new(fallback_x, fallback_y, n.rotation);

            let render_bounds_inflation = if let Some(rect_stroke) = n.rectangular_stroke_width() {
                compute_inflation_rectangular(&rect_stroke, n.stroke_style.stroke_align, &n.effects)
            } else {
                compute_inflation_uniform(
                    n.render_bounds_stroke_width(),
                    n.stroke_style.stroke_align,
                    &n.effects,
                )
            };

            NodeGeoData {
                schema_transform,
                schema_width: n.layout_dimensions.layout_target_width.unwrap_or(0.0),
                schema_height: n.layout_dimensions.layout_target_height.unwrap_or(0.0),
                kind: GeoNodeKind::Container,
                render_bounds_inflation,
                rotation: n.rotation,
            }
        }
        Node::TextSpan(n) => NodeGeoData {
            schema_transform: n.transform,
            schema_width: n.width.unwrap_or(0.0),
            schema_height: n.height.unwrap_or(0.0),
            kind: GeoNodeKind::TextSpan,
            render_bounds_inflation: compute_inflation_uniform(
                n.stroke_width,
                n.stroke_align,
                &super::schema::LayerEffects::default(),
            ),
            rotation: 0.0,
        },
        _ => {
            // Leaf nodes: Rectangle, Ellipse, Image, RegularPolygon,
            // RegularStarPolygon, Line, Polygon, Path, Vector, Error.
            let (schema_transform, schema_width, schema_height) = match node {
                Node::Rectangle(n) => (n.transform, n.size.width, n.size.height),
                Node::Ellipse(n) => (n.transform, n.size.width, n.size.height),
                Node::Image(n) => (n.transform, n.size.width, n.size.height),
                Node::RegularPolygon(n) => (n.transform, n.size.width, n.size.height),
                Node::RegularStarPolygon(n) => (n.transform, n.size.width, n.size.height),
                Node::Line(n) => (n.transform, n.size.width, 0.0),
                Node::Polygon(n) => {
                    let rect = n.rect();
                    (n.transform, rect.width, rect.height)
                }
                Node::Path(n) => {
                    let rect = n.rect();
                    (n.transform, rect.width, rect.height)
                }
                Node::Vector(n) => {
                    let rect = n.network.bounds();
                    (n.transform, rect.width, rect.height)
                }
                Node::Error(n) => (n.transform, n.size.width, n.size.height),
                _ => unreachable!("Non-leaf variants handled above"),
            };

            let render_bounds_inflation = extract_leaf_inflation(node);

            NodeGeoData {
                schema_transform,
                schema_width,
                schema_height,
                kind: GeoNodeKind::Leaf,
                render_bounds_inflation,
                rotation: 0.0,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Render bounds inflation computation — pure scalars, no heap allocations
// ---------------------------------------------------------------------------

/// Stroke outset for a given alignment.
fn stroke_outset(align: StrokeAlign, width: f32) -> f32 {
    match align {
        StrokeAlign::Inside => 0.0,
        StrokeAlign::Center => width / 2.0,
        StrokeAlign::Outside => width,
    }
}

/// Compute per-side inflation from a uniform stroke + effects.
fn compute_inflation_uniform(
    stroke_width: f32,
    stroke_align: StrokeAlign,
    effects: &super::schema::LayerEffects,
) -> RenderBoundsInflation {
    let stroke_delta = stroke_outset(stroke_align, stroke_width);
    let base = RenderBoundsInflation::uniform(stroke_delta);
    expand_inflation_with_effects(base, effects)
}

/// Compute per-side inflation from a rectangular (per-side) stroke + effects.
fn compute_inflation_rectangular(
    rect_stroke: &RectangularStrokeWidth,
    stroke_align: StrokeAlign,
    effects: &super::schema::LayerEffects,
) -> RenderBoundsInflation {
    let base = match stroke_align {
        StrokeAlign::Center => RenderBoundsInflation {
            top: rect_stroke.stroke_top_width / 2.0,
            right: rect_stroke.stroke_right_width / 2.0,
            bottom: rect_stroke.stroke_bottom_width / 2.0,
            left: rect_stroke.stroke_left_width / 2.0,
        },
        StrokeAlign::Inside => RenderBoundsInflation::ZERO,
        StrokeAlign::Outside => RenderBoundsInflation {
            top: rect_stroke.stroke_top_width,
            right: rect_stroke.stroke_right_width,
            bottom: rect_stroke.stroke_bottom_width,
            left: rect_stroke.stroke_left_width,
        },
    };
    expand_inflation_with_effects(base, effects)
}

/// Expand a base inflation with the effect-induced expansion.
///
/// Effects are additive: blur expands uniformly, drop shadows expand
/// asymmetrically (offset + blur + spread).
fn expand_inflation_with_effects(
    base: RenderBoundsInflation,
    effects: &super::schema::LayerEffects,
) -> RenderBoundsInflation {
    let mut result = base;

    if let Some(blur_effect) = &effects.blur {
        let radius = match &blur_effect.blur {
            crate::cg::prelude::FeBlur::Gaussian(g) => g.radius * 3.0,
            crate::cg::prelude::FeBlur::Progressive(p) => p.radius.max(p.radius2) * 3.0,
        };
        result = result.expand(&RenderBoundsInflation::uniform(radius));
    }

    for shadow in &effects.shadows {
        let effect: crate::cg::prelude::FilterEffect = shadow.clone().into();
        let shadow_inflation = compute_effect_inflation(&effect);
        result = result.expand(&shadow_inflation);
    }

    result
}

/// Compute per-side inflation from a single filter effect.
fn compute_effect_inflation(effect: &crate::cg::prelude::FilterEffect) -> RenderBoundsInflation {
    use crate::cg::prelude::FilterEffect;
    match effect {
        FilterEffect::LiquidGlass(glass) => RenderBoundsInflation::uniform(glass.blur_radius * 3.0),
        FilterEffect::LayerBlur(blur) => {
            let r = match &blur.blur {
                crate::cg::prelude::FeBlur::Gaussian(g) => g.radius * 3.0,
                crate::cg::prelude::FeBlur::Progressive(p) => p.radius.max(p.radius2) * 3.0,
            };
            RenderBoundsInflation::uniform(r)
        }
        FilterEffect::BackdropBlur(blur) => {
            let r = match &blur.blur {
                crate::cg::prelude::FeBlur::Gaussian(g) => g.radius * 3.0,
                crate::cg::prelude::FeBlur::Progressive(p) => p.radius.max(p.radius2) * 3.0,
            };
            RenderBoundsInflation::uniform(r)
        }
        FilterEffect::DropShadow(shadow) => {
            // Shadow creates a shifted, blurred copy of the shape.
            // The per-side inflation from the original bounds is:
            //   side = max(0, blur*3 + spread ± offset)
            // where the sign of the offset depends on direction.
            let blur_r = shadow.blur * 3.0;
            let spread = shadow.spread.max(0.0);
            let base = blur_r + spread;
            RenderBoundsInflation {
                top: (base - shadow.dy).max(0.0),
                right: (base + shadow.dx).max(0.0),
                bottom: (base + shadow.dy).max(0.0),
                left: (base - shadow.dx).max(0.0),
            }
        }
        FilterEffect::Noise(_) | FilterEffect::InnerShadow(_) => RenderBoundsInflation::ZERO,
    }
}

/// Extract render bounds inflation for leaf nodes.
fn extract_leaf_inflation(node: &Node) -> RenderBoundsInflation {
    match node {
        Node::Rectangle(n) => {
            if let Some(rect_stroke) = n.rectangular_stroke_width() {
                compute_inflation_rectangular(&rect_stroke, n.stroke_style.stroke_align, &n.effects)
            } else {
                compute_inflation_uniform(
                    n.render_bounds_stroke_width(),
                    n.stroke_style.stroke_align,
                    &n.effects,
                )
            }
        }
        Node::Ellipse(n) => compute_inflation_uniform(
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::Polygon(n) => compute_inflation_uniform(
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::RegularPolygon(n) => compute_inflation_uniform(
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::RegularStarPolygon(n) => compute_inflation_uniform(
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::Path(n) => compute_inflation_uniform(
            n.stroke_width.value_or_zero(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::Vector(n) => {
            compute_inflation_uniform(n.stroke_width, n.get_stroke_align(), &n.effects)
        }
        Node::Image(n) => compute_inflation_uniform(
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::Line(n) => {
            compute_inflation_uniform(n.stroke_width, n.get_stroke_align(), &n.effects)
        }
        _ => RenderBoundsInflation::ZERO,
    }
}

/// A scene graph that manages both the tree structure and node data.
///
/// The SceneGraph maintains:
/// - Root node IDs (direct children of the scene)
/// - An adjacency list (parent->children) for the tree structure
/// - A node repository for storing actual node data
/// - A parallel `geo_data` map with compact, schema-level geometry data
///
/// The `geo_data` map is populated at construction time from the `Node` data.
/// It enables the geometry cache to compute transforms and bounds without
/// iterating over the full `Node` enum (critical for WASM performance).
///
/// This provides a centralized, efficient way to manage scene hierarchy
/// separate from node attributes.
#[derive(Debug, Clone)]
pub struct SceneGraph {
    /// Root node IDs - direct children of the scene
    roots: Vec<NodeId>,
    /// Parent to children adjacency list
    links: DenseNodeMap<Vec<NodeId>>,
    /// Node data repository
    nodes: NodeRepository,
    /// Optional display names for nodes (from the source file).
    names: HashMap<NodeId, String>,
    /// Compact, schema-level geometry data per node.
    ///
    /// Populated at construction time from `Node` data. The geometry cache
    /// reads this instead of iterating over the full `Node` enum.
    geo_data: DenseNodeMap<NodeGeoData>,
    /// Compact, layer-relevant data per node.
    ///
    /// Populated at construction time from `Node` data. The effect tree and
    /// layers DFS read this instead of iterating over the full `Node` enum
    /// for visibility / opacity / blend mode checks.
    layer_core: DenseNodeMap<NodeLayerCore>,
    /// Whether the scene contains any flex layout containers.
    ///
    /// When `false`, the layout engine can skip Taffy entirely and use
    /// schema positions/sizes directly — saving ~1,500ms for 136K-node
    /// Figma imports where all containers use `LayoutMode::Normal`.
    has_flex: bool,
}

impl SceneGraph {
    /// Creates a new empty scene graph
    pub fn new() -> Self {
        Self {
            roots: Vec::new(),
            links: DenseNodeMap::new(),
            nodes: NodeRepository::new(),
            names: HashMap::new(),
            geo_data: DenseNodeMap::new(),
            layer_core: DenseNodeMap::new(),
            has_flex: false,
        }
    }

    /// Create a SceneGraph from a complete snapshot (typical IO loader use case).
    ///
    /// This is optimized for deserializing complete scene data where nodes and links
    /// are provided as separate collections.
    ///
    /// # Arguments
    /// * `nodes` - Iterator of nodes to add to the repository
    /// * `links` - HashMap of parent->children relationships
    /// * `roots` - Root node IDs (direct children of the scene)
    // TODO: Currently `new_from_snapshot` receives ALL nodes from the
    // document (across all scenes) but only one scene's roots. This means
    // geo_data, layer_core, and the node repository contain orphan nodes
    // not reachable from the current scene's roots. Downstream passes
    // (geometry, layout, layers, effects) already scope their work to
    // root-reachable nodes, but the extraction loop and storage still pay
    // O(total_nodes) instead of O(scene_nodes). In a multi-scene document
    // this is wasted work and memory.
    //
    // Future: either filter `node_pairs` to only scene-reachable nodes
    // before calling this, or accept a reachability set so extraction and
    // insertion can be bounded to the current scene.
    pub fn new_from_snapshot(
        node_pairs: impl IntoIterator<Item = (NodeId, Node)>,
        links: HashMap<NodeId, Vec<NodeId>>,
        roots: Vec<NodeId>,
    ) -> Self {
        let mut graph = Self::new();

        // Add all nodes to the repository with their explicit IDs,
        // extracting compact geo data and layer core at the same time.
        // Also detect whether any flex containers exist (for layout skip optimization).
        let mut has_flex = false;
        for (id, node) in node_pairs {
            graph.geo_data.insert(id, extract_geo_data(&node));
            let lc = extract_layer_core(&node);
            if lc.is_flex {
                has_flex = true;
            }
            graph.layer_core.insert(id, lc);
            graph.nodes.insert_with_id(id, node);
        }
        graph.has_flex = has_flex;

        // Convert HashMap links to DenseNodeMap
        let mut dense_links = DenseNodeMap::new();
        for (id, children) in links {
            dense_links.insert(id, children);
        }
        graph.links = dense_links;

        // Set roots
        graph.roots = roots;

        graph
    }

    // -------------------------------------------------------------------------
    // Graph Structure Methods
    // -------------------------------------------------------------------------

    /// Add a node to the graph and link it to a parent in one operation.
    ///
    /// Returns the node's ID.
    pub fn append_child(&mut self, node: Node, parent: Parent) -> NodeId {
        let geo = extract_geo_data(&node);
        let lc = extract_layer_core(&node);
        if lc.is_flex {
            self.has_flex = true;
        }
        let id = self.nodes.insert(node);
        self.geo_data.insert(id, geo);
        self.layer_core.insert(id, lc);

        match parent {
            Parent::Root => {
                self.roots.push(id.clone());
            }
            Parent::NodeId(parent_id) => {
                if let Some(children) = self.links.get_mut(&parent_id) {
                    children.push(id.clone());
                } else {
                    self.links.insert(parent_id, vec![id.clone()]);
                }
            }
        }

        id
    }

    /// Add multiple nodes to the graph and link them all to a parent in one operation.
    /// This is a bulk convenience method for adding multiple children to the same parent.
    ///
    /// Returns the node IDs in the same order as the input nodes.
    pub fn append_children(&mut self, nodes: Vec<Node>, parent: Parent) -> Vec<NodeId> {
        let mut ids = Vec::new();
        for node in nodes {
            let id = self.append_child(node, parent.clone());
            ids.push(id);
        }
        ids
    }

    /// Get children of a node, if any exist
    pub fn get_children(&self, id: &NodeId) -> Option<&Vec<NodeId>> {
        self.links.get(id)
    }

    /// Add a child to a parent's children list
    pub fn add_child(&mut self, parent: &NodeId, child: NodeId) -> SceneGraphResult<()> {
        let children = self
            .links
            .get_mut(parent)
            .ok_or_else(|| SceneGraphError::ParentNotFound(parent.clone()))?;
        children.push(child);
        Ok(())
    }

    /// Insert a child at a specific index in the parent's children list
    pub fn add_child_at(
        &mut self,
        parent: &NodeId,
        child: NodeId,
        index: usize,
    ) -> SceneGraphResult<()> {
        let children = self
            .links
            .get_mut(parent)
            .ok_or_else(|| SceneGraphError::ParentNotFound(parent.clone()))?;

        if index > children.len() {
            return Err(SceneGraphError::IndexOutOfBounds {
                parent: parent.clone(),
                index,
                len: children.len(),
            });
        }

        children.insert(index, child);
        Ok(())
    }

    /// Remove a child from a parent's children list
    pub fn remove_child(&mut self, parent: &NodeId, child: &NodeId) -> SceneGraphResult<()> {
        let children = self
            .links
            .get_mut(parent)
            .ok_or_else(|| SceneGraphError::ParentNotFound(parent.clone()))?;

        let pos = children
            .iter()
            .position(|id| id == child)
            .ok_or_else(|| SceneGraphError::ChildNotFound(child.clone()))?;

        children.remove(pos);
        Ok(())
    }

    /// Iterate over all parent->children pairs
    pub fn iter(&self) -> impl Iterator<Item = (NodeId, &Vec<NodeId>)> {
        self.links.iter()
    }

    /// Get the root nodes (direct children of the scene)
    pub fn roots(&self) -> &[NodeId] {
        &self.roots
    }

    /// Check if a node is a root node
    pub fn is_root(&self, id: &NodeId) -> bool {
        self.roots.contains(id)
    }

    /// Get the parent of a node
    /// Returns None if the node is a root or not found
    pub fn get_parent(&self, id: &NodeId) -> Option<NodeId> {
        for (parent_id, children) in &self.links {
            if children.contains(id) {
                return Some(parent_id);
            }
        }
        None
    }

    // -------------------------------------------------------------------------
    // Node Data Methods
    // -------------------------------------------------------------------------

    /// Get a reference to a node by ID
    pub fn get_node(&self, id: &NodeId) -> SceneGraphResult<&Node> {
        self.nodes
            .get(id)
            .ok_or_else(|| SceneGraphError::NodeNotFound(id.clone()))
    }

    /// Get a mutable reference to a node by ID
    pub fn get_node_mut(&mut self, id: &NodeId) -> SceneGraphResult<&mut Node> {
        self.nodes
            .get_mut(id)
            .ok_or_else(|| SceneGraphError::NodeNotFound(id.clone()))
    }

    /// Get the display name for a node, if one was set.
    pub fn get_name(&self, id: &NodeId) -> Option<&str> {
        self.names.get(id).map(|s| s.as_str())
    }

    /// Set the display name for a node.
    pub fn set_name(&mut self, id: NodeId, name: String) {
        self.names.insert(id, name);
    }

    /// Remove a node from the repository and return it
    pub fn remove_node(&mut self, id: &NodeId) -> SceneGraphResult<Node> {
        self.geo_data.remove(id);
        self.nodes
            .remove(id)
            .ok_or_else(|| SceneGraphError::NodeNotFound(id.clone()))
    }

    /// Check if a node exists in the repository
    pub fn has_node(&self, id: &NodeId) -> bool {
        self.nodes.get(id).is_some()
    }

    /// Get the number of nodes in the graph
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Check if the graph is empty
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Iterate over all `(NodeId, &Node)` pairs in the graph.
    ///
    /// The iteration order is not guaranteed; callers should use `roots()` +
    /// `get_children()` if they need tree order.
    pub fn nodes_iter(&self) -> impl Iterator<Item = (NodeId, &Node)> {
        self.nodes.iter()
    }

    /// Access the compact, schema-level geometry data map.
    ///
    /// This map is populated at construction time and contains only the fields
    /// needed for geometry computation (~48 bytes/node instead of ~500+).
    /// The geometry cache reads this instead of iterating over the full Node enum.
    pub fn geo_data(&self) -> &DenseNodeMap<NodeGeoData> {
        &self.geo_data
    }

    /// Access the compact layer-core data map.
    pub fn layer_core(&self) -> &DenseNodeMap<NodeLayerCore> {
        &self.layer_core
    }

    /// Get layer-core data for a single node.
    pub fn get_layer_core(&self, id: &NodeId) -> Option<&NodeLayerCore> {
        self.layer_core.get(id)
    }

    /// Whether the scene contains any flex layout containers.
    ///
    /// When `false`, all containers use `LayoutMode::Normal` (absolute
    /// positioning) and the layout engine can skip Taffy entirely.
    pub fn has_flex(&self) -> bool {
        self.has_flex
    }

    // -------------------------------------------------------------------------
    // Tree Traversal Methods
    // -------------------------------------------------------------------------

    /// Walk the tree in pre-order (parent before children)
    pub fn walk_preorder(
        &self,
        root: &NodeId,
        visitor: &mut impl FnMut(&NodeId),
    ) -> SceneGraphResult<()> {
        if !self.has_node(root) {
            return Err(SceneGraphError::NodeNotFound(root.clone()));
        }

        visitor(root);

        if let Some(children) = self.get_children(root) {
            for child in children {
                self.walk_preorder(child, visitor)?;
            }
        }

        Ok(())
    }

    /// Walk the tree in post-order (children before parent)
    pub fn walk_postorder(
        &self,
        root: &NodeId,
        visitor: &mut impl FnMut(&NodeId),
    ) -> SceneGraphResult<()> {
        if !self.has_node(root) {
            return Err(SceneGraphError::NodeNotFound(root.clone()));
        }

        if let Some(children) = self.get_children(root) {
            for child in children {
                self.walk_postorder(child, visitor)?;
            }
        }

        visitor(root);

        Ok(())
    }

    /// Get all ancestors of a node (path to root)
    pub fn ancestors(&self, id: &NodeId) -> SceneGraphResult<Vec<NodeId>> {
        if !self.has_node(id) {
            return Err(SceneGraphError::NodeNotFound(id.clone()));
        }

        let mut result = Vec::new();
        let mut current = id.clone();

        // Find parent by searching all links
        loop {
            let mut found_parent = false;
            for (parent_id, children) in &self.links {
                if children.contains(&current) {
                    result.push(parent_id.clone());
                    current = parent_id.clone();
                    found_parent = true;
                    break;
                }
            }

            if !found_parent {
                break;
            }
        }

        Ok(result)
    }

    /// Get all descendants of a node (all children recursively)
    pub fn descendants(&self, id: &NodeId) -> SceneGraphResult<Vec<NodeId>> {
        if !self.has_node(id) {
            return Err(SceneGraphError::NodeNotFound(id.clone()));
        }

        let mut result = Vec::new();

        self.walk_preorder(id, &mut |node_id| {
            if node_id != id {
                result.push(node_id.clone());
            }
        })?;

        Ok(result)
    }
}

impl Default for SceneGraph {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::schema::{ErrorNodeRec, Size};
    use math2::transform::AffineTransform;

    fn create_test_node() -> Node {
        Node::Error(ErrorNodeRec {
            active: true,
            transform: AffineTransform::identity(),
            size: Size {
                width: 10.0,
                height: 10.0,
            },
            error: "test".to_string(),
            opacity: 1.0,
        })
    }

    #[test]
    fn test_scene_graph_basic() {
        let mut graph = SceneGraph::new();

        let node_a = create_test_node();
        let node_b = create_test_node();
        let node_c = create_test_node();

        let id_a = graph.append_child(node_a, Parent::Root);
        let id_b = graph.append_child(node_b, Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(node_c, Parent::NodeId(id_a.clone()));

        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.get_children(&id_a).unwrap().len(), 2);
        assert_eq!(graph.get_children(&id_a).unwrap(), &vec![id_b, id_c]);
    }

    #[test]
    fn test_add_child() {
        let mut graph = SceneGraph::new();

        let node_a = create_test_node();
        let node_b = create_test_node();
        let node_c = create_test_node();

        // Create parent with one child first
        let id_a = graph.append_child(node_a, Parent::Root);
        let id_b = graph.append_child(node_b, Parent::NodeId(id_a.clone()));

        // Now add another child dynamically using add_child
        let id_c = graph.append_child(node_c, Parent::Root);
        graph.add_child(&id_a, id_c.clone()).unwrap();

        assert_eq!(graph.get_children(&id_a).unwrap().len(), 2);
        assert_eq!(graph.get_children(&id_a).unwrap()[0], id_b);
        assert_eq!(graph.get_children(&id_a).unwrap()[1], id_c);
    }

    #[test]
    fn test_add_child_at() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_d = graph.append_child(create_test_node(), Parent::Root);

        // Insert id_d at index 1 in id_a's children (between id_b and id_c)
        graph.add_child_at(&id_a, id_d.clone(), 1).unwrap();

        let children = graph.get_children(&id_a).unwrap();
        assert_eq!(children.len(), 3);
        assert_eq!(children[0], id_b);
        assert_eq!(children[1], id_d);
        assert_eq!(children[2], id_c);
    }

    #[test]
    fn test_remove_child() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));

        graph.remove_child(&id_a, &id_b).unwrap();

        let children = graph.get_children(&id_a).unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0], id_c);
    }

    #[test]
    fn test_roots() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let _id_c = graph.append_child(create_test_node(), Parent::NodeId(id_b.clone()));

        let roots = graph.roots();
        assert_eq!(roots.len(), 1);
        assert!(roots.contains(&id_a));
    }

    #[test]
    fn test_walk_preorder() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));

        let mut visited = Vec::new();
        graph
            .walk_preorder(&id_a, &mut |id| visited.push(id.clone()))
            .unwrap();

        assert_eq!(visited, vec![id_a.clone(), id_b, id_c]);
    }

    #[test]
    fn test_walk_postorder() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));

        let mut visited = Vec::new();
        graph
            .walk_postorder(&id_a, &mut |id| visited.push(id.clone()))
            .unwrap();

        assert_eq!(visited, vec![id_b, id_c, id_a]);
    }

    #[test]
    fn test_ancestors() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(), Parent::NodeId(id_b.clone()));

        let ancestors = graph.ancestors(&id_c).unwrap();
        assert_eq!(ancestors, vec![id_b, id_a]);
    }

    #[test]
    fn test_descendants() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(), Parent::Root);
        let id_b = graph.append_child(create_test_node(), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(), Parent::NodeId(id_b.clone()));

        let descendants = graph.descendants(&id_a).unwrap();
        assert_eq!(descendants.len(), 2);
        assert!(descendants.contains(&id_b));
        assert!(descendants.contains(&id_c));
    }

    #[test]
    fn test_error_node_not_found() {
        let graph = SceneGraph::new();
        let result = graph.get_node(&9999);
        assert!(matches!(result, Err(SceneGraphError::NodeNotFound(_))));
    }

    #[test]
    fn test_error_parent_not_found() {
        let mut graph = SceneGraph::new();
        let id_b = graph.append_child(create_test_node(), Parent::Root);
        let result = graph.add_child(&9999, id_b);
        assert!(matches!(result, Err(SceneGraphError::ParentNotFound(_))));
    }

    #[test]
    fn test_append_child_to_root() {
        let mut graph = SceneGraph::new();
        let node_a = create_test_node();
        let id_a = graph.append_child(node_a, Parent::Root);

        assert_eq!(graph.roots().len(), 1);
        assert!(graph.roots().contains(&id_a));
        assert!(graph.has_node(&id_a));
    }

    #[test]
    fn test_append_child_to_parent() {
        let mut graph = SceneGraph::new();
        let parent = create_test_node();
        let child = create_test_node();

        let parent_id = graph.append_child(parent, Parent::Root);
        let child_id = graph.append_child(child, Parent::NodeId(parent_id.clone()));

        assert_eq!(graph.get_children(&parent_id).unwrap().len(), 1);
        assert_eq!(graph.get_children(&parent_id).unwrap()[0], child_id);
    }

    #[test]
    fn test_append_multiple_children() {
        let mut graph = SceneGraph::new();
        let parent = create_test_node();
        let child1 = create_test_node();
        let child2 = create_test_node();

        let parent_id = graph.append_child(parent, Parent::Root);
        let child1_id = graph.append_child(child1, Parent::NodeId(parent_id.clone()));
        let child2_id = graph.append_child(child2, Parent::NodeId(parent_id.clone()));

        let children = graph.get_children(&parent_id).unwrap();
        assert_eq!(children.len(), 2);
        assert_eq!(children[0], child1_id);
        assert_eq!(children[1], child2_id);
    }

    #[test]
    fn test_append_children_to_root() {
        let mut graph = SceneGraph::new();
        let nodes = vec![create_test_node(), create_test_node(), create_test_node()];
        let ids = graph.append_children(nodes, Parent::Root);

        assert_eq!(graph.roots().len(), 3);
        assert_eq!(ids.len(), 3);
        assert!(graph.roots().contains(&ids[0]));
        assert!(graph.roots().contains(&ids[1]));
        assert!(graph.roots().contains(&ids[2]));
    }

    #[test]
    fn test_append_children_to_parent() {
        let mut graph = SceneGraph::new();
        let parent = create_test_node();
        let parent_id = graph.append_child(parent, Parent::Root);

        let children_nodes = vec![create_test_node(), create_test_node(), create_test_node()];
        let child_ids = graph.append_children(children_nodes, Parent::NodeId(parent_id.clone()));

        assert_eq!(child_ids.len(), 3);
        let children = graph.get_children(&parent_id).unwrap();
        assert_eq!(children.len(), 3);
        assert_eq!(children[0], child_ids[0]);
        assert_eq!(children[1], child_ids[1]);
        assert_eq!(children[2], child_ids[2]);
    }

    #[test]
    fn test_append_children_empty() {
        let mut graph = SceneGraph::new();
        let ids = graph.append_children(vec![], Parent::Root);

        assert_eq!(ids.len(), 0);
        assert_eq!(graph.roots().len(), 0);
    }

    #[test]
    fn test_new_from_snapshot() {
        let id_a = 1;
        let id_b = 2;
        let id_c = 3;

        let node_a = create_test_node();
        let node_b = create_test_node();
        let node_c = create_test_node();

        let node_pairs = vec![(id_a, node_a), (id_b, node_b), (id_c, node_c)];
        let mut links = HashMap::new();
        links.insert(id_a, vec![id_b, id_c]);
        let roots = vec![id_a];

        let graph = SceneGraph::new_from_snapshot(node_pairs, links, roots);

        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.roots().len(), 1);
        assert_eq!(graph.get_children(&id_a).unwrap().len(), 2);
    }

    #[test]
    fn test_new_from_snapshot_empty() {
        let graph = SceneGraph::new_from_snapshot(vec![], HashMap::new(), vec![]);

        assert_eq!(graph.node_count(), 0);
        assert_eq!(graph.roots().len(), 0);
        assert!(graph.is_empty());
    }

    #[test]
    fn test_new_from_snapshot_complex_hierarchy() {
        let id_root = 100;
        let id_a = 1;
        let id_b = 2;
        let id_c = 3;

        let node_root = create_test_node();
        let node_a = create_test_node();
        let node_b = create_test_node();
        let node_c = create_test_node();

        let node_pairs = vec![
            (id_root, node_root),
            (id_a, node_a),
            (id_b, node_b),
            (id_c, node_c),
        ];
        let mut links = HashMap::new();
        links.insert(id_root, vec![id_a, id_b]);
        links.insert(id_b, vec![id_c]);
        let roots = vec![id_root];

        let graph = SceneGraph::new_from_snapshot(node_pairs, links, roots);

        assert_eq!(graph.node_count(), 4);
        assert_eq!(graph.roots().len(), 1);
        assert_eq!(graph.roots()[0], id_root);
        assert_eq!(graph.get_children(&id_root).unwrap().len(), 2);
        assert_eq!(graph.get_children(&id_b).unwrap().len(), 1);
    }
}
