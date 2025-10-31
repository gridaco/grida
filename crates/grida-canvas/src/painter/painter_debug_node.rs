use super::geometry::*;
use crate::cache::geometry::GeometryCache;
use crate::cg::prelude::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::*;
use math2::rect::Rectangle;

/// Dummy bounds for V1 nodes that use schema sizing
/// V1 nodes ignore the bounds parameter and use their schema values
const DUMMY_BOUNDS: Rectangle = Rectangle {
    x: 0.0,
    y: 0.0,
    width: 0.0,
    height: 0.0,
};

/// A painter specifically for drawing nodes, using the main Painter for operations.
/// This separates node-specific drawing logic from the main Painter while maintaining
/// the ability to test golden outputs.
pub struct NodePainter<'a> {
    painter: &'a super::Painter<'a>,
}

impl<'a> NodePainter<'a> {
    /// Create a new NodePainter that uses the given Painter
    pub fn new(painter: &'a super::Painter<'a>) -> Self {
        Self { painter }
    }

    /// Draw a RectangleNode, respecting its transform, effect, fill, stroke, blend mode, opacity
    pub fn draw_rect_node(&self, node: &RectangleNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let node_enum = Node::Rectangle(node.clone());
            let shape = build_shape(&node_enum, &DUMMY_BOUNDS);
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter.draw_fills(&shape, &node.fills);
                            let stroke_width = node.render_bounds_stroke_width();
                            self.painter.draw_strokes(
                                &shape,
                                &node.strokes,
                                stroke_width,
                                node.stroke_style.stroke_align,
                                node.stroke_style.stroke_dash_array.as_ref(),
                            );
                        });
                    });
                });
        });
    }

    /// Draw an ImageNode, respecting transform, effect, rounded corners, blend mode, opacity
    pub fn draw_image_node(&self, node: &ImageNodeRec) -> bool {
        self.painter.with_transform(&node.transform.matrix, || {
            let node_enum = Node::Image(node.clone());
            let shape = build_shape(&node_enum, &DUMMY_BOUNDS);

            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            // Use the single image fill directly - aligns with web development patterns
                            // where <img> elements have one image source
                            // Create the Paint wrapper once and reuse the reference
                            let image_paint = Paint::Image(node.fill.clone());
                            self.painter
                                .draw_fills(&shape, std::slice::from_ref(&image_paint));
                            if !node.strokes.is_empty() {
                                let stroke_width = node.render_bounds_stroke_width();
                                self.painter.draw_strokes(
                                    &shape,
                                    &node.strokes,
                                    stroke_width,
                                    node.stroke_style.stroke_align,
                                    node.stroke_style.stroke_dash_array.as_ref(),
                                );
                            }
                        });
                    });
                });
        });
        true
    }

    /// Draw an EllipseNode
    pub fn draw_ellipse_node(&self, node: &EllipseNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let node_enum = Node::Ellipse(node.clone());
            let shape = build_shape(&node_enum, &DUMMY_BOUNDS);
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter.draw_fills(&shape, &node.fills);
                            self.painter.draw_strokes(
                                &shape,
                                &node.strokes,
                                node.stroke_width.value_or_zero(),
                                node.stroke_style.stroke_align,
                                node.stroke_style.stroke_dash_array.as_ref(),
                            );
                        });
                    });
                });
        });
    }

    /// Draw a LineNode
    pub fn draw_line_node(&self, node: &LineNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let node_enum = Node::Line(node.clone());
            let shape = build_shape(&node_enum, &DUMMY_BOUNDS);

            self.painter.with_opacity(node.opacity, || {
                self.painter.with_blendmode(node.blend_mode, || {
                    self.painter.draw_strokes(
                        &shape,
                        &node.strokes,
                        node.stroke_width,
                        node.get_stroke_align(),
                        node.stroke_dash_array.as_ref(),
                    );
                });
            });
        });
    }

    pub fn draw_vector_node(&self, node: &VectorNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let stroke_align = node.get_stroke_align();
            let shape = PainterShape::from_path(path);
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            if !node.fills.is_empty() {
                                self.painter.draw_fills(&shape, &node.fills);
                            }
                            self.painter.draw_strokes(
                                &shape,
                                &node.strokes,
                                node.stroke_width,
                                stroke_align,
                                node.stroke_dash_array.as_ref(),
                            );
                        });
                    });
                });
        });
    }

    /// Draw a PathNode (SVG path data)
    pub fn draw_path_node(&self, node: &SVGPathNodeRec) {
        // TODO: Pass id as parameter - using dummy 0 for now in debug mode
        let dummy_id = 0;
        self.painter.with_transform(&node.transform.matrix, || {
            let path = self.painter.cached_path(&dummy_id, &node.data);
            let shape = PainterShape::from_path((*path).clone());
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            if !node.fills.is_empty() {
                                self.painter.draw_fills(&shape, &node.fills);
                            }
                            if !node.strokes.is_empty() {
                                self.painter.draw_strokes(
                                    &shape,
                                    &node.strokes,
                                    node.stroke_width.value_or_zero(),
                                    node.stroke_style.stroke_align,
                                    node.stroke_style.stroke_dash_array.as_ref(),
                                );
                            }
                        });
                    });
                });
        });
    }

    /// Draw a PolygonNode (arbitrary polygon with optional corner radius)
    pub fn draw_polygon_node(&self, node: &PolygonNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path.clone());
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter.draw_fills(&shape, &node.fills);
                            self.painter.draw_strokes(
                                &shape,
                                &node.strokes,
                                node.stroke_width.value_or_zero(),
                                node.stroke_style.stroke_align,
                                node.stroke_style.stroke_dash_array.as_ref(),
                            );
                        });
                    });
                });
        });
    }

    /// Draw a RegularPolygonNode by converting to a PolygonNode
    pub fn draw_regular_polygon_node(&self, node: &RegularPolygonNodeRec) {
        let points = node.to_points();

        let polygon = PolygonNodeRec {
            active: node.active,
            opacity: node.opacity,
            blend_mode: node.blend_mode,
            mask: node.mask,
            transform: node.transform,
            points,
            corner_radius: node.corner_radius,
            fills: node.fills.clone(),
            strokes: node.strokes.clone(),
            stroke_style: node.stroke_style.clone(),
            stroke_width: node.stroke_width.clone(),
            effects: node.effects.clone(),
            layout_child: node.layout_child.clone(),
        };

        self.draw_polygon_node(&polygon);
    }

    /// Draw a RegularStarPolygonNode by converting to a PolygonNode
    pub fn draw_regular_star_polygon_node(&self, node: &RegularStarPolygonNodeRec) {
        let points = node.to_points();

        let polygon = PolygonNodeRec {
            active: node.active,
            opacity: node.opacity,
            blend_mode: node.blend_mode,
            mask: node.mask,
            transform: node.transform,
            points,
            corner_radius: node.corner_radius,
            fills: node.fills.clone(),
            strokes: node.strokes.clone(),
            stroke_style: node.stroke_style.clone(),
            stroke_width: node.stroke_width.clone(),
            effects: node.effects.clone(),
            layout_child: node.layout_child.clone(),
        };

        self.draw_polygon_node(&polygon);
    }

    /// Draw a TextSpanNode (simple text block)
    pub fn draw_text_span_node(&self, node: &TextSpanNodeRec) {
        if node.fills.is_empty() {
            return;
        }
        // TODO: Pass id as parameter - using dummy 0 for now in debug mode
        let dummy_id = 0;
        self.painter.with_transform(&node.transform.matrix, || {
            self.painter.with_opacity(node.opacity, || {
                self.painter.with_blendmode(node.blend_mode, || {
                    self.painter.draw_text_span(
                        &dummy_id,
                        &node.text,
                        &node.width,
                        &node.height,
                        &node.max_lines,
                        &node.ellipsis,
                        &node.fills,
                        &node.strokes,
                        node.stroke_width,
                        &node.stroke_align,
                        &node.text_align,
                        &node.text_align_vertical,
                        &node.text_style,
                    );
                });
            });
        });
    }

    /// Draw a ContainerNode (background + stroke + children)
    pub fn draw_error_node(&self, node: &ErrorNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let node_enum = Node::Error(node.clone());
            let shape = build_shape(&node_enum, &DUMMY_BOUNDS);

            // Create a red fill paint
            let fill = Paint::Solid(SolidPaint {
                color: CGColor(255, 0, 0, 51), // Semi-transparent red
                blend_mode: BlendMode::Normal,
                active: true,
            });
            let stroke = Paint::Solid(SolidPaint {
                color: CGColor(255, 0, 0, 255), // Solid red
                blend_mode: BlendMode::Normal,
                active: true,
            });

            self.painter.with_opacity(node.opacity, || {
                self.painter.draw_fills(&shape, std::slice::from_ref(&fill));
                self.painter.draw_strokes(
                    &shape,
                    std::slice::from_ref(&stroke),
                    1.0,
                    StrokeAlign::Inside,
                    None,
                );
            });
        });
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    pub fn draw_group_node_recursively(
        &self,
        id: &NodeId,
        node: &GroupNodeRec,
        graph: &SceneGraph,
        cache: &GeometryCache,
    ) {
        self.painter.with_transform_option(&node.transform, || {
            self.painter.with_opacity(node.opacity, || {
                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        if let Ok(child) = graph.get_node(child_id) {
                            self.draw_node_recursively(child_id, child, graph, cache);
                        }
                    }
                }
            });
        });
    }

    pub fn draw_boolean_operation_node_recursively(
        &self,
        id: &NodeId,
        node: &BooleanPathOperationNodeRec,
        graph: &SceneGraph,
        cache: &GeometryCache,
    ) {
        self.painter.with_transform_option(&node.transform, || {
            if let Some(shape) = boolean_operation_shape(id, node, graph, cache) {
                self.painter
                    .draw_shape_with_effects(&node.effects, &shape, || {
                        self.painter.with_opacity(node.opacity, || {
                            self.painter.with_blendmode(node.blend_mode, || {
                                if !node.fills.is_empty() {
                                    self.painter.draw_fills(&shape, &node.fills);
                                }
                                if !node.strokes.is_empty() {
                                    self.painter.draw_strokes(
                                        &shape,
                                        &node.strokes,
                                        node.stroke_width.value_or_zero(),
                                        node.stroke_style.stroke_align,
                                        node.stroke_style.stroke_dash_array.as_ref(),
                                    );
                                }
                            });
                        });
                    });
            } else {
                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        if let Ok(child) = graph.get_node(child_id) {
                            self.draw_node_recursively(child_id, child, graph, cache);
                        }
                    }
                }
            }
        });
    }

    pub fn draw_node(&self, node: &LeafNode) {
        if !node.active() {
            return;
        }
        match node {
            LeafNode::Error(n) => self.draw_error_node(n),
            LeafNode::Rectangle(n) => self.draw_rect_node(n),
            LeafNode::Ellipse(n) => self.draw_ellipse_node(n),
            LeafNode::Polygon(n) => self.draw_polygon_node(n),
            LeafNode::RegularPolygon(n) => self.draw_regular_polygon_node(n),
            LeafNode::TextSpan(n) => self.draw_text_span_node(n),
            LeafNode::Line(n) => self.draw_line_node(n),
            LeafNode::Image(n) => {
                self.draw_image_node(n);
            }
            LeafNode::Vector(n) => self.draw_vector_node(n),
            LeafNode::SVGPath(n) => self.draw_path_node(n),
            LeafNode::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }

    /// Dispatch to the correct node‐type draw method
    pub fn draw_node_recursively(
        &self,
        id: &NodeId,
        node: &Node,
        graph: &SceneGraph,
        cache: &GeometryCache,
    ) {
        if !node.active() {
            return;
        }
        match node {
            Node::Error(n) => self.draw_error_node(n),
            Node::Group(n) => self.draw_group_node_recursively(id, n, graph, cache),
            Node::Container(n) => {
                // Get pre-computed local transform from geometry cache
                let local_transform = cache
                    .get_transform(id)
                    .expect("Geometry must exist - pipeline bug");

                self.painter.with_transform(&local_transform.matrix, || {
                    self.painter.with_opacity(n.opacity, || {
                        // Geometry guaranteed to exist - no Option
                        let bounds = cache
                            .get_world_bounds(id)
                            .expect("Geometry must exist - pipeline bug");
                        let shape = build_shape(node, &bounds);

                        // Draw effects, fills, children (with optional clipping), then strokes last
                        self.painter
                            .draw_shape_with_effects(&n.effects, &shape, || {
                                self.painter.with_blendmode(n.blend_mode, || {
                                    // Paint fills first
                                    self.painter.draw_fills(&shape, &n.fills);

                                    // Children are drawn next; if `clip` is enabled we push
                                    // a clip region for the container's shape
                                    if let Some(children) = graph.get_children(id) {
                                        if n.clip {
                                            self.painter.with_clip(&shape, || {
                                                for child_id in children {
                                                    if let Ok(child) = graph.get_node(child_id) {
                                                        self.draw_node_recursively(
                                                            child_id, child, graph, cache,
                                                        );
                                                    }
                                                }
                                            });
                                        } else {
                                            for child_id in children {
                                                if let Ok(child) = graph.get_node(child_id) {
                                                    self.draw_node_recursively(
                                                        child_id, child, graph, cache,
                                                    );
                                                }
                                            }
                                        }
                                    }

                                    // Finally paint the stroke
                                    let stroke_width = n.render_bounds_stroke_width();
                                    self.painter.draw_strokes(
                                        &shape,
                                        &n.strokes,
                                        stroke_width,
                                        n.stroke_style.stroke_align,
                                        n.stroke_style.stroke_dash_array.as_ref(),
                                    );
                                });
                            });
                    });
                });
            }
            Node::InitialContainer(_) => {
                // ICB is invisible - only render children
                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        if let Ok(child_node) = graph.get_node(child_id) {
                            self.draw_node_recursively(child_id, child_node, graph, cache);
                        }
                    }
                }
            }
            Node::Rectangle(n) => self.draw_rect_node(n),
            Node::Ellipse(n) => self.draw_ellipse_node(n),
            Node::Polygon(n) => self.draw_polygon_node(n),
            Node::RegularPolygon(n) => self.draw_regular_polygon_node(n),
            Node::TextSpan(n) => self.draw_text_span_node(n),
            Node::Line(n) => self.draw_line_node(n),
            Node::Image(n) => {
                self.draw_image_node(n);
            }
            Node::Vector(n) => self.draw_vector_node(n),
            Node::SVGPath(n) => self.draw_path_node(n),
            Node::BooleanOperation(n) => {
                self.draw_boolean_operation_node_recursively(id, n, graph, cache)
            }
            Node::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }
}
