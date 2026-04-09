//! Geometry cache - Transform and bounds resolution
//!
//! ## Pipeline Guarantees
//!
//! This module guarantees:
//! - Every node in scene graph has a GeometryEntry
//! - All transforms are fully resolved (no None/fallbacks)
//! - All bounds include layout-computed dimensions for V2 nodes
//! - Consumes LayoutResult as immutable input from LayoutEngine
//! - Missing layout for Inset nodes is a PANIC (LayoutEngine bug)
//! - Missing geometry entry when accessed is a PANIC (GeometryCache bug)
//!
//! ## Property Split Optimization
//!
//! The `SceneGraph` stores compact `NodeGeoData` (~48 bytes/node) alongside
//! the full `Node` enum. This module resolves layout into a `GeoInput` struct
//! by reading only from `NodeGeoData` + `LayoutResult`, then runs the DFS on
//! that — never touching the full `Node` enum (~500+ bytes/node).
//! Working set for 136k nodes: ~7.6 MB instead of ~65 MB.

use crate::cache::fast_hash::DenseNodeMap;
use crate::cache::paragraph::ParagraphCache;
use crate::node::scene_graph::{GeoNodeKind, NodeGeoData, RenderBoundsInflation, SceneGraph};
use crate::node::schema::{Node, NodeId, Scene};
use crate::runtime::font_repository::FontRepository;
use math2::rect;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

// ---------------------------------------------------------------------------
// GeoInput — layout-resolved per-node geometry for the DFS
// ---------------------------------------------------------------------------

/// Layout-resolved per-node data for the geometry DFS.
///
/// Built from `NodeGeoData` (schema-level) + `LayoutResult` (layout-level).
/// The DFS reads only this — compact and `Copy`, ~48 bytes.
#[derive(Debug, Clone, Copy)]
struct GeoInput {
    transform: AffineTransform,
    width: f32,
    height: f32,
    /// Content origin offset within the node's local space.
    /// Non-zero for Path, Polygon, and Vector nodes whose shape data
    /// is offset from the transform origin.
    content_origin_x: f32,
    content_origin_y: f32,
    kind: GeoNodeKind,
    render_bounds_inflation: RenderBoundsInflation,
}

// ---------------------------------------------------------------------------
// GeometryEntry — public output (unchanged)
// ---------------------------------------------------------------------------

/// Geometry data used for layout, culling, and rendering.
///
/// `local_bounds` and `world_bounds` represent the tight geometry bounds of the shape.
/// `render_bounds` includes visual overflow from effects such as blur, stroke, or shadows,
/// and is used for visibility culling and picture recording regions.
///
/// All bounds are updated during geometry cache construction and reused throughout the pipeline.
#[derive(Debug, Clone)]
pub struct GeometryEntry {
    /// relative transform
    pub transform: AffineTransform,
    /// absolute (world) transform
    pub absolute_transform: AffineTransform,
    /// relative AABB (after the transform is applied)
    pub bounding_box: Rectangle,
    /// absolute (world) AABB (after the transform is applied)
    pub absolute_bounding_box: Rectangle,
    /// Expanded bounds that include visual effects like blur, shadow, stroke, etc.
    /// Used for render-time culling and picture recording.
    pub absolute_render_bounds: Rectangle,
    pub parent: Option<NodeId>,
    pub dirty_transform: bool,
    pub dirty_bounds: bool,
}

// ---------------------------------------------------------------------------
// GeometryCache — public API (unchanged)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct GeometryCache {
    entries: DenseNodeMap<GeometryEntry>,
}

impl Default for GeometryCache {
    fn default() -> Self {
        Self::new()
    }
}

impl GeometryCache {
    pub fn new() -> Self {
        Self {
            entries: DenseNodeMap::new(),
        }
    }

    pub fn from_scene(scene: &Scene, fonts: &FontRepository) -> Self {
        Self::from_scene_with_paragraph_cache(scene, &mut ParagraphCache::new(), fonts)
    }

    pub fn from_scene_with_paragraph_cache(
        scene: &Scene,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
    ) -> Self {
        let default_viewport = crate::node::schema::Size {
            width: 1920.0,
            height: 1080.0,
        };
        Self::from_scene_with_layout(scene, paragraph_cache, fonts, None, default_viewport)
    }

    pub fn from_scene_with_layout(
        scene: &Scene,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
        layout_result: Option<&crate::layout::cache::LayoutResult>,
        viewport_size: crate::node::schema::Size,
    ) -> Self {
        let graph = &scene.graph;
        let schema_geo = graph.geo_data();

        #[cfg(feature = "perf")]
        let _t_resolve_start = crate::sys::perf_now();

        // ── Layout resolution pass ──
        // Resolve layout-dependent fields (position, size) from the compact
        // NodeGeoData + LayoutResult. Text measurement for nodes without
        // layout falls back to accessing the Node enum (rare path).
        //
        // This pass iterates over NodeGeoData (~48 bytes/node) instead of
        // Node (~500+ bytes/node).
        let mut is_layout_container = DenseNodeMap::with_capacity(graph.node_count());
        for (id, geo) in schema_geo.iter() {
            let is_container = matches!(
                geo.kind,
                GeoNodeKind::Container | GeoNodeKind::InitialContainer
            );
            is_layout_container.insert(id, is_container);
        }

        // Build parent map from the graph's link structure.
        let mut parent_map: DenseNodeMap<NodeId> = DenseNodeMap::with_capacity(graph.node_count());
        for (id, _) in schema_geo.iter() {
            if let Some(children) = graph.get_children(&id) {
                for child_id in children {
                    parent_map.insert(*child_id, id);
                }
            }
        }

        let mut geo_inputs = DenseNodeMap::with_capacity(graph.node_count());

        for (id, geo) in schema_geo.iter() {
            let parent_id = parent_map.get(&id).copied();
            let resolved = resolve_layout(
                &id,
                geo,
                parent_id,
                layout_result,
                &is_layout_container,
                graph,
                paragraph_cache,
                fonts,
                viewport_size,
            );
            geo_inputs.insert(id, resolved);
        }

        #[cfg(feature = "perf")]
        let _t_resolve_end = crate::sys::perf_now();

        // ── DFS pass ──
        let mut cache = Self {
            entries: DenseNodeMap::with_capacity(graph.node_count()),
        };
        let root_world = AffineTransform::identity();

        for child in graph.roots() {
            Self::build_recursive(child, &root_world, None, &mut cache, graph, &geo_inputs);
        }

        #[cfg(feature = "perf")]
        {
            let _t_dfs_end = crate::sys::perf_now();
            eprintln!(
                "[geometry] resolve={:.0}ms dfs={:.0}ms total={:.0}ms",
                _t_resolve_end - _t_resolve_start,
                _t_dfs_end - _t_resolve_end,
                _t_dfs_end - _t_resolve_start,
            );
        }

        cache
    }

    /// DFS that operates on layout-resolved `GeoInput` data.
    fn build_recursive(
        id: &NodeId,
        parent_world: &AffineTransform,
        parent_id: Option<NodeId>,
        cache: &mut GeometryCache,
        graph: &SceneGraph,
        geo_inputs: &DenseNodeMap<GeoInput>,
    ) -> Rectangle {
        let geo = geo_inputs
            .get(id)
            .expect("GeoInput not found — resolve pass missed a node");

        match geo.kind {
            GeoNodeKind::Group => {
                let world_transform = parent_world.compose(&geo.transform);
                let mut union_bounds: Option<Rectangle> = None;
                let mut union_render_bounds: Option<Rectangle> = None;

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            &world_transform,
                            Some(*id),
                            cache,
                            graph,
                            geo_inputs,
                        );
                        union_bounds = match union_bounds {
                            Some(b) => Some(rect::union(&[b, child_bounds])),
                            None => Some(child_bounds),
                        };
                        if let Some(rb) = cache.get_render_bounds(child_id) {
                            union_render_bounds = match union_render_bounds {
                                Some(b) => Some(rect::union(&[b, rb])),
                                None => Some(rb),
                            };
                        }
                    }
                }

                let world_bounds = union_bounds.unwrap_or(Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                });

                let local_bounds = if let Some(inv) = world_transform.inverse() {
                    transform_rect(&world_bounds, &inv)
                } else {
                    Rectangle {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    }
                };

                let render_bounds = union_render_bounds.unwrap_or(world_bounds);

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };

                let bounds = entry.absolute_bounding_box;
                cache.entries.insert(*id, entry);
                bounds
            }

            GeoNodeKind::InitialContainer => {
                let world_transform = parent_world.compose(&geo.transform);
                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: geo.width,
                    height: geo.height,
                };
                let mut union_world_bounds = transform_rect(&local_bounds, &world_transform);

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            &world_transform,
                            Some(*id),
                            cache,
                            graph,
                            geo_inputs,
                        );
                        union_world_bounds = rect::union(&[union_world_bounds, child_bounds]);
                    }
                }

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: union_world_bounds,
                    absolute_render_bounds: union_world_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };

                cache.entries.insert(*id, entry);
                union_world_bounds
            }

            GeoNodeKind::BooleanOperation => {
                let world_transform = parent_world.compose(&geo.transform);
                let mut union_bounds: Option<Rectangle> = None;

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            &world_transform,
                            Some(*id),
                            cache,
                            graph,
                            geo_inputs,
                        );
                        union_bounds = match union_bounds {
                            Some(b) => Some(rect::union(&[b, child_bounds])),
                            None => Some(child_bounds),
                        };
                    }
                }

                let world_bounds = union_bounds.unwrap_or(Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                });

                let local_bounds = if let Some(inv) = world_transform.inverse() {
                    transform_rect(&world_bounds, &inv)
                } else {
                    Rectangle {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    }
                };
                let render_bounds = inflate_rect_sides(world_bounds, &geo.render_bounds_inflation);

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };

                let bounds = entry.absolute_bounding_box;
                cache.entries.insert(*id, entry);
                bounds
            }

            GeoNodeKind::Container => {
                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: geo.width,
                    height: geo.height,
                };

                let world_transform = parent_world.compose(&geo.transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let mut union_world_bounds = world_bounds;
                let render_bounds = inflate_rect_sides(world_bounds, &geo.render_bounds_inflation);

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            &world_transform,
                            Some(*id),
                            cache,
                            graph,
                            geo_inputs,
                        );
                        union_world_bounds = rect::union(&[union_world_bounds, child_bounds]);
                    }
                }

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };
                cache.entries.insert(*id, entry);
                union_world_bounds
            }

            // Tray has explicit dimensions (like Container) but no clipping.
            // Children render inside the tray bounds.
            GeoNodeKind::Tray => {
                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: geo.width,
                    height: geo.height,
                };

                let world_transform = parent_world.compose(&geo.transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let render_bounds = inflate_rect_sides(world_bounds, &geo.render_bounds_inflation);

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        Self::build_recursive(
                            child_id,
                            &world_transform,
                            Some(*id),
                            cache,
                            graph,
                            geo_inputs,
                        );
                    }
                }

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };
                cache.entries.insert(*id, entry);
                world_bounds
            }

            GeoNodeKind::TextSpan => {
                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: geo.width,
                    height: geo.height,
                };
                let world_transform = parent_world.compose(&geo.transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let render_bounds = inflate_rect_sides(world_bounds, &geo.render_bounds_inflation);

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };
                let bounds = world_bounds;
                cache.entries.insert(*id, entry);
                bounds
            }

            GeoNodeKind::MarkdownEmbed | GeoNodeKind::Leaf => {
                let local_bounds = Rectangle {
                    x: geo.content_origin_x,
                    y: geo.content_origin_y,
                    width: geo.width,
                    height: geo.height,
                };

                let world_transform = parent_world.compose(&geo.transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let render_bounds = inflate_rect_sides(world_bounds, &geo.render_bounds_inflation);

                let entry = GeometryEntry {
                    transform: geo.transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };

                let bounds = entry.absolute_bounding_box;
                cache.entries.insert(*id, entry);
                bounds
            }
        }
    }

    /// Access the full geometry entry for a node.
    pub fn get_entry(&self, id: &NodeId) -> Option<&GeometryEntry> {
        self.entries.get(id)
    }

    pub fn get_transform(&self, id: &NodeId) -> Option<AffineTransform> {
        self.entries.get(id).map(|e| e.transform)
    }

    pub fn get_world_transform(&self, id: &NodeId) -> Option<AffineTransform> {
        self.entries.get(id).map(|e| e.absolute_transform)
    }

    pub fn get_world_bounds(&self, id: &NodeId) -> Option<Rectangle> {
        self.entries.get(id).map(|e| e.absolute_bounding_box)
    }

    pub fn get_render_bounds(&self, id: &NodeId) -> Option<Rectangle> {
        self.entries.get(id).map(|e| e.absolute_render_bounds)
    }

    pub fn get_parent(&self, id: &NodeId) -> Option<NodeId> {
        self.entries.get(id).and_then(|e| e.parent)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn has(&self, id: &NodeId) -> bool {
        self.entries.contains_key(id)
    }

    pub fn filter(&self, filter: impl Fn(&NodeId, &GeometryEntry) -> bool) -> Self {
        Self {
            entries: self
                .entries
                .iter()
                .filter(|(id, entry)| filter(id, entry))
                .map(|(id, entry)| (id, entry.clone()))
                .collect(),
        }
    }
}

// ---------------------------------------------------------------------------
// Layout resolution — NodeGeoData + LayoutResult → GeoInput
// ---------------------------------------------------------------------------

/// Build a `GeoInput` directly from schema data, bypassing any layout result.
fn geo_input_from_schema(geo: &NodeGeoData) -> GeoInput {
    GeoInput {
        // geo.rotation is in degrees (from Container/Tray); convert to
        // radians for AffineTransform::new which expects radians.
        transform: AffineTransform::new(
            geo.schema_transform.x(),
            geo.schema_transform.y(),
            geo.rotation.to_radians(),
        ),
        width: geo.schema_width,
        height: geo.schema_height,
        content_origin_x: geo.content_origin_x,
        content_origin_y: geo.content_origin_y,
        kind: geo.kind,
        render_bounds_inflation: geo.render_bounds_inflation,
    }
}

/// Resolve layout-dependent fields from `NodeGeoData` + `LayoutResult`.
///
/// For most nodes this is a lightweight copy from the pre-extracted data
/// with layout overrides for position/size. Only text spans without layout
/// results fall back to accessing the full `Node` for text measurement.
#[allow(clippy::too_many_arguments)]
fn resolve_layout(
    id: &NodeId,
    geo: &NodeGeoData,
    parent_id: Option<NodeId>,
    layout_result: Option<&crate::layout::cache::LayoutResult>,
    is_layout_container: &DenseNodeMap<bool>,
    graph: &SceneGraph,
    paragraph_cache: &mut ParagraphCache,
    fonts: &FontRepository,
    viewport_size: crate::node::schema::Size,
) -> GeoInput {
    match geo.kind {
        GeoNodeKind::Group | GeoNodeKind::BooleanOperation => GeoInput {
            transform: geo.schema_transform,
            width: geo.schema_width,
            height: geo.schema_height,
            content_origin_x: 0.0,
            content_origin_y: 0.0,
            kind: geo.kind,
            render_bounds_inflation: geo.render_bounds_inflation,
        },
        GeoNodeKind::InitialContainer => GeoInput {
            transform: geo.schema_transform,
            width: viewport_size.width,
            height: viewport_size.height,
            content_origin_x: 0.0,
            content_origin_y: 0.0,
            kind: geo.kind,
            render_bounds_inflation: geo.render_bounds_inflation,
        },
        GeoNodeKind::Container => {
            if let Some(computed) = layout_result.and_then(|r| r.get(id)) {
                GeoInput {
                    // geo.rotation is in degrees; convert to radians.
                    transform: AffineTransform::new(
                        computed.x,
                        computed.y,
                        geo.rotation.to_radians(),
                    ),
                    width: computed.width,
                    height: computed.height,
                    content_origin_x: 0.0,
                    content_origin_y: 0.0,
                    kind: geo.kind,
                    render_bounds_inflation: geo.render_bounds_inflation,
                }
            } else {
                // Fallback to schema data when layout result is missing.
                // This happens for orphan nodes not reachable from scene roots,
                // or when layout is skipped entirely (layout_result == None).
                geo_input_from_schema(geo)
            }
        }
        // Tray has explicit dimensions but never participates in Taffy layout,
        // so it always uses schema data directly.
        GeoNodeKind::Tray => geo_input_from_schema(geo),
        GeoNodeKind::TextSpan => {
            let layout = layout_result.and_then(|r| r.get(id));
            const MIN_SIZE_DIRTY_HACK: f32 = 1.0;

            let parent_is_layout_container = parent_id
                .as_ref()
                .and_then(|pid| is_layout_container.get(pid).copied())
                .unwrap_or(false);

            let (local_transform, width, height) = if let Some(l) = layout {
                let width = l.width.max(MIN_SIZE_DIRTY_HACK);
                let height = l.height.max(MIN_SIZE_DIRTY_HACK);
                let transform = if parent_is_layout_container {
                    AffineTransform::new(l.x, l.y, geo.schema_transform.rotation())
                } else {
                    geo.schema_transform
                };
                (transform, width, height)
            } else {
                // Fallback: text measurement via paragraph cache.
                // This requires accessing the Node for text content.
                // Only happens when layout_result is None (rare path).
                if let Ok(Node::TextSpan(n)) = graph.get_node(id) {
                    let measurements = paragraph_cache.measure(
                        &n.text,
                        &n.text_style,
                        &n.text_align,
                        &n.max_lines,
                        &n.ellipsis,
                        n.width,
                        fonts,
                        Some(id),
                    );
                    let width = measurements.max_width.max(MIN_SIZE_DIRTY_HACK);
                    let height = n
                        .height
                        .unwrap_or(measurements.height)
                        .max(MIN_SIZE_DIRTY_HACK);
                    (geo.schema_transform, width, height)
                } else if let Ok(Node::AttributedText(n)) = graph.get_node(id) {
                    let measurements = paragraph_cache.measure_attributed(
                        &n.attributed_string,
                        &n.text_align,
                        &n.max_lines,
                        &n.ellipsis,
                        n.width,
                        fonts,
                        Some(id),
                    );
                    let width = measurements.max_width.max(MIN_SIZE_DIRTY_HACK);
                    let height = n
                        .height
                        .unwrap_or(measurements.height)
                        .max(MIN_SIZE_DIRTY_HACK);
                    (geo.schema_transform, width, height)
                } else {
                    // Shouldn't happen; schema_width/height as fallback
                    (
                        geo.schema_transform,
                        geo.schema_width.max(MIN_SIZE_DIRTY_HACK),
                        geo.schema_height.max(MIN_SIZE_DIRTY_HACK),
                    )
                }
            };

            GeoInput {
                transform: local_transform,
                width,
                height,
                content_origin_x: 0.0,
                content_origin_y: 0.0,
                kind: geo.kind,
                render_bounds_inflation: geo.render_bounds_inflation,
            }
        }
        GeoNodeKind::MarkdownEmbed => {
            let layout = layout_result.and_then(|r| r.get(id));
            const MIN_SIZE: f32 = 1.0;

            let parent_is_layout_container = parent_id
                .as_ref()
                .and_then(|pid| is_layout_container.get(pid).copied())
                .unwrap_or(false);

            let (local_transform, width, height) = if let Some(l) = layout {
                let width = l.width.max(MIN_SIZE);
                let height = l.height.max(MIN_SIZE);
                let transform = if parent_is_layout_container {
                    AffineTransform::new(l.x, l.y, geo.schema_transform.rotation())
                } else {
                    geo.schema_transform
                };
                (transform, width, height)
            } else {
                // Fallback: measure markdown content height when layout is missing.
                if let Ok(Node::MarkdownEmbed(n)) = graph.get_node(id) {
                    let width = n.width.unwrap_or(400.0).max(MIN_SIZE);
                    let height = if let Some(h) = n.height {
                        h.max(MIN_SIZE)
                    } else {
                        let styled_html = crate::htmlcss::markdown_to_styled_html(&n.markdown);
                        crate::htmlcss::measure_content_height(
                            &styled_html,
                            width,
                            fonts,
                            &crate::htmlcss::NoImages,
                        )
                        .unwrap_or(0.0)
                        .max(MIN_SIZE)
                    };
                    (geo.schema_transform, width, height)
                } else {
                    (
                        geo.schema_transform,
                        geo.schema_width.max(MIN_SIZE),
                        geo.schema_height.max(MIN_SIZE),
                    )
                }
            };

            GeoInput {
                transform: local_transform,
                width,
                height,
                content_origin_x: 0.0,
                content_origin_y: 0.0,
                kind: geo.kind,
                render_bounds_inflation: geo.render_bounds_inflation,
            }
        }
        GeoNodeKind::Leaf => {
            let parent_is_layout_container = parent_id
                .as_ref()
                .and_then(|pid| is_layout_container.get(pid).copied())
                .unwrap_or(false);

            let (local_transform, width, height) = if parent_is_layout_container {
                let (x, y, width, height) =
                    if let Some(result) = layout_result.and_then(|r| r.get(id)) {
                        (result.x, result.y, result.width, result.height)
                    } else {
                        (
                            geo.schema_transform.x(),
                            geo.schema_transform.y(),
                            geo.schema_width,
                            geo.schema_height,
                        )
                    };
                (
                    AffineTransform::new(x, y, geo.schema_transform.rotation()),
                    width,
                    height,
                )
            } else {
                let width = layout_result
                    .and_then(|r| r.get(id))
                    .map(|l| l.width)
                    .unwrap_or(geo.schema_width);
                let height = layout_result
                    .and_then(|r| r.get(id))
                    .map(|l| l.height)
                    .unwrap_or(geo.schema_height);
                (geo.schema_transform, width, height)
            };

            GeoInput {
                transform: local_transform,
                width,
                height,
                content_origin_x: geo.content_origin_x,
                content_origin_y: geo.content_origin_y,
                kind: geo.kind,
                render_bounds_inflation: geo.render_bounds_inflation,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

fn transform_rect(rect: &Rectangle, t: &AffineTransform) -> Rectangle {
    rect::transform(*rect, t)
}

/// Inflate a rectangle by pre-computed per-side values.
fn inflate_rect_sides(rect: Rectangle, inf: &RenderBoundsInflation) -> Rectangle {
    if inf.is_zero() {
        return rect;
    }
    rect::inflate(
        rect,
        rect::Sides {
            top: inf.top,
            right: inf.right,
            bottom: inf.bottom,
            left: inf.left,
        },
    )
}
