//! Scene graph mutation commands and writers.
//!
//! Commands describe *what* to change. The `apply` function writes
//! the change to a `Scene` in-place. The caller is responsible for
//! flushing the mutated scene to the renderer.
//!
//! # Unsupported node types
//!
//! **Vector nodes** do not support `Resize`. Vector geometry is defined
//! by a `VectorNetwork` with no separate `size` field. Future options:
//! - Re-plot: scale all vertices/tangents (lossy under repetition).
//! - Render scale: add `render_scale: [f32; 2]` to `VectorNodeRec`.

use cg::cg::prelude::*;
use cg::node::scene_graph::SceneGraph;
use cg::node::schema::*;

/// A scene-graph mutation command.
#[derive(Debug, Clone)]
pub enum MutationCommand {
    /// Translate nodes by a canvas-space delta.
    Translate { ids: Vec<NodeId>, dx: f32, dy: f32 },
    /// Resize a single node.
    /// `None` per axis = leave unchanged (preserves auto-sizing for text).
    /// Not supported for Vector nodes (no-op).
    Resize {
        id: NodeId,
        width: Option<f32>,
        height: Option<f32>,
    },
}

/// Apply a mutation command to a scene in-place.
/// Returns `true` if the scene was actually modified.
pub fn apply(scene: &mut Scene, cmd: &MutationCommand) -> bool {
    match cmd {
        MutationCommand::Translate { ids, dx, dy } => {
            if dx.abs() < 0.0001 && dy.abs() < 0.0001 {
                return false;
            }
            for id in ids {
                translate_node(&mut scene.graph, id, *dx, *dy);
            }
            true
        }
        MutationCommand::Resize { id, width, height } => {
            if let Ok(node) = scene.graph.get_node(id) {
                if !node_supports_resize(node) {
                    return false;
                }
            } else {
                return false;
            }
            resize_node(scene, id, *width, *height)
        }
    }
}

/// Whether a node type supports resize.
///
/// Returns `true` only for node types that `resize_node` can actually
/// mutate. Group, BooleanOperation, Vector, Path, Polygon, and
/// InitialContainer are excluded — they derive size from children or
/// geometry, and resize_node no-ops for them.
pub fn node_supports_resize(node: &Node) -> bool {
    matches!(
        node,
        Node::Rectangle(_)
            | Node::Ellipse(_)
            | Node::RegularPolygon(_)
            | Node::RegularStarPolygon(_)
            | Node::Line(_)
            | Node::Image(_)
            | Node::Error(_)
            | Node::Container(_)
            | Node::Tray(_)
            | Node::TextSpan(_)
            | Node::AttributedText(_)
            | Node::Markdown(_)
    )
}

// ── Node accessors ───────────────────────────────────────────────────────
// These are editor-only helpers for reaching into Node variant fields.
// They live here (not on `impl Node` in cg) because cg is a renderer
// and should not expose mutable setters on its data model.

/// Mutable reference to a node's `AffineTransform`, if it has one.
/// Container/Tray store position/rotation separately — returns `None`.
fn node_transform_mut(node: &mut Node) -> Option<&mut math2::transform::AffineTransform> {
    match node {
        Node::Rectangle(n) => Some(&mut n.transform),
        Node::Ellipse(n) => Some(&mut n.transform),
        Node::RegularPolygon(n) => Some(&mut n.transform),
        Node::RegularStarPolygon(n) => Some(&mut n.transform),
        Node::Line(n) => Some(&mut n.transform),
        Node::TextSpan(n) => Some(&mut n.transform),
        Node::AttributedText(n) => Some(&mut n.transform),
        Node::Path(n) => Some(&mut n.transform),
        Node::Polygon(n) => Some(&mut n.transform),
        Node::Image(n) => Some(&mut n.transform),
        Node::Error(n) => Some(&mut n.transform),
        Node::Group(n) => n.transform.as_mut(),
        Node::BooleanOperation(n) => n.transform.as_mut(),
        Node::Vector(n) => Some(&mut n.transform),
        Node::Markdown(n) => Some(&mut n.transform),
        Node::Container(_) | Node::Tray(_) | Node::InitialContainer(_) => None,
    }
}

/// Mutable reference to a node's `Size`, if it has one.
/// Container/Tray use layout_dimensions. Group/BooleanOp derive from children.
fn node_size_mut(node: &mut Node) -> Option<&mut Size> {
    match node {
        Node::Rectangle(n) => Some(&mut n.size),
        Node::Ellipse(n) => Some(&mut n.size),
        Node::RegularPolygon(n) => Some(&mut n.size),
        Node::RegularStarPolygon(n) => Some(&mut n.size),
        Node::Line(n) => Some(&mut n.size),
        Node::Image(n) => Some(&mut n.size),
        Node::Error(n) => Some(&mut n.size),
        Node::Markdown(n) => Some(&mut n.size),
        _ => None,
    }
}

// ── Scene graph writers ──────────────────────────────────────────────────

fn translate_node(graph: &mut SceneGraph, id: &NodeId, dx: f32, dy: f32) {
    if let Ok(node) = graph.get_node_mut(id) {
        match node {
            Node::Container(n) => {
                let x = n.position.x().unwrap_or(0.0);
                let y = n.position.y().unwrap_or(0.0);
                n.position = LayoutPositioningBasis::Cartesian(CGPoint {
                    x: x + dx,
                    y: y + dy,
                });
            }
            Node::Tray(n) => {
                let x = n.position.x().unwrap_or(0.0);
                let y = n.position.y().unwrap_or(0.0);
                n.position = LayoutPositioningBasis::Cartesian(CGPoint {
                    x: x + dx,
                    y: y + dy,
                });
            }
            _ => {
                if let Some(t) = node_transform_mut(node) {
                    t.translate(dx, dy);
                }
            }
        }
        graph.refresh_node_geo_data(id);
    }
}

fn resize_node(scene: &mut Scene, id: &NodeId, width: Option<f32>, height: Option<f32>) -> bool {
    let mut changed = false;
    if let Ok(node) = scene.graph.get_node_mut(id) {
        match node {
            Node::Container(n) => {
                if let Some(w) = width {
                    n.layout_dimensions.layout_target_width = Some(w);
                    changed = true;
                }
                if let Some(h) = height {
                    n.layout_dimensions.layout_target_height = Some(h);
                    changed = true;
                }
            }
            Node::Tray(n) => {
                if let Some(w) = width {
                    n.layout_dimensions.layout_target_width = Some(w);
                    changed = true;
                }
                if let Some(h) = height {
                    n.layout_dimensions.layout_target_height = Some(h);
                    changed = true;
                }
            }
            Node::TextSpan(n) => {
                if let Some(w) = width {
                    n.width = Some(w);
                    changed = true;
                }
                if let Some(h) = height {
                    n.height = Some(h);
                    changed = true;
                }
            }
            Node::AttributedText(n) => {
                if let Some(w) = width {
                    n.width = Some(w);
                    changed = true;
                }
                if let Some(h) = height {
                    n.height = Some(h);
                    changed = true;
                }
            }
            Node::Vector(_) => {} // not supported
            _ => {
                if let Some(s) = node_size_mut(node) {
                    if let Some(w) = width {
                        s.width = w;
                        changed = true;
                    }
                    if let Some(h) = height {
                        s.height = h;
                        changed = true;
                    }
                }
            }
        }
        if changed {
            scene.graph.refresh_node_geo_data(id);
        }
    }
    changed
}

// ── Resize geometry helpers (pure math) ──────────────────────────────────

/// Which axes a resize direction affects: `(width, height)`.
pub fn resize_affected_axes(direction: cg::surface::ResizeDirection) -> (bool, bool) {
    use cg::surface::ResizeDirection;
    let w = matches!(
        direction,
        ResizeDirection::E
            | ResizeDirection::W
            | ResizeDirection::NE
            | ResizeDirection::NW
            | ResizeDirection::SE
            | ResizeDirection::SW
    );
    let h = matches!(
        direction,
        ResizeDirection::N
            | ResizeDirection::S
            | ResizeDirection::NE
            | ResizeDirection::NW
            | ResizeDirection::SE
            | ResizeDirection::SW
    );
    (w, h)
}

/// Compute new size + origin shift from a drag delta and current bounds.
/// Returns `(new_w, new_h, translate_x, translate_y)`.
pub fn compute_resize_geometry(
    direction: cg::surface::ResizeDirection,
    dx: f32,
    dy: f32,
    old_w: f32,
    old_h: f32,
) -> (f32, f32, f32, f32) {
    use cg::surface::ResizeDirection;
    match direction {
        ResizeDirection::SE => (old_w + dx, old_h + dy, 0.0, 0.0),
        ResizeDirection::NW => (old_w - dx, old_h - dy, dx, dy),
        ResizeDirection::NE => (old_w + dx, old_h - dy, 0.0, dy),
        ResizeDirection::SW => (old_w - dx, old_h + dy, dx, 0.0),
        ResizeDirection::E => (old_w + dx, old_h, 0.0, 0.0),
        ResizeDirection::W => (old_w - dx, old_h, dx, 0.0),
        ResizeDirection::S => (old_w, old_h + dy, 0.0, 0.0),
        ResizeDirection::N => (old_w, old_h - dy, 0.0, dy),
    }
}
