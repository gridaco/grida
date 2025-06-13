use super::cvt;
use super::geometry::*;
use crate::node::schema::*;
use crate::repository::{FontRepository, ImageRepository, NodeRepository};
use skia_safe::{
    Paint as SkPaint, Path, PathOp, Point, StrokeRec, canvas::SaveLayerRec, stroke_rec::InitStyle,
    textlayout::*,
};
use std::cell::RefCell;
use std::rc::Rc;

/// Computes the stroke geometry path for a given input `Path`, enabling rich stroke
/// rendering features such as image fills, gradients, and complex stroke alignment.
///
/// This function generates a *filled path* that visually represents the stroke outline,
/// based on stroke width, alignment, and optional dash pattern. The result can be used
/// with any fill-based rendering pipeline, e.g. image shaders, gradients, or masking.
///
/// # Parameters
///
/// - `source_path`: The original vector path to be stroked.
/// - `stroke_width`: The stroke width (measured in logical pixels).
/// - `stroke_align`: Controls how the stroke is aligned relative to the path.
///   - `StrokeAlign::Center`: Stroke is centered on the path (default Skia behavior).
///   - `StrokeAlign::Inside`: Stroke lies entirely inside the path boundary.
///   - `StrokeAlign::Outside`: Stroke lies entirely outside the path boundary.
/// - `stroke_dash_array`: Optional dash pattern (e.g., `[10.0, 4.0]` for 10 on, 4 off).
///
/// # Returns
///
/// A `Path` representing the stroke outline as a filled geometry. This path can be used
/// with image or gradient fills, or for clipping, hit-testing, or boolean operations.
///
/// # Behavior
///
/// - If `stroke_align` is not `Center`, the result uses boolean path operations to clip or subtract
///   the stroke geometry relative to the original path.
/// - If a dash array is provided, it is applied before stroking.
/// - If the path is empty or invalid, an empty `Path` is returned.
///
/// # Example
///
/// ```rust
/// let stroke_path = stroke_geometry(
///     &original_path,
///     4.0,
///     StrokeAlign::Inside,
///     Some(&vec![8.0, 4.0])
/// );
/// canvas.draw_path(&stroke_path, &image_paint);
/// ```
///
/// # See Also
///
/// - [`SkStrokeRec`](https://github.com/google/skia/blob/main/include/core/SkStrokeRec.h)
/// - [`SkPath::op`](https://github.com/google/skia/blob/main/include/core/SkPath.h)
/// - [`SkDashPathEffect`](https://github.com/google/skia/blob/main/include/effects/SkDashPathEffect.h)
pub fn stroke_geometry(
    source_path: &Path,
    stroke_width: f32,
    stroke_align: StrokeAlign,
    _stroke_dash_array: Option<&Vec<f32>>, // TODO: implement dash pattern
) -> Path {
    use StrokeAlign::*;

    let adjusted_width = match stroke_align {
        Center => stroke_width,
        Inside => stroke_width * 2.0,  // we'll clip it later
        Outside => stroke_width * 2.0, // we'll subtract later
    };

    // Create a stroke record with the adjusted width
    let mut stroke_rec = StrokeRec::new(InitStyle::Hairline);
    stroke_rec.set_stroke_style(adjusted_width, false);

    // Apply the stroke to create the outline
    let mut stroked_path = Path::new();
    if stroke_rec.apply_to_path(&mut stroked_path, source_path) {
        match stroke_align {
            Center => stroked_path,
            Inside => {
                // Clip to original path: intersection
                if let Some(result) = Path::op(&stroked_path, source_path, PathOp::Intersect) {
                    result
                } else {
                    stroked_path
                }
            }
            Outside => {
                // Subtract original path from stroke outline
                if let Some(result) = Path::op(&stroked_path, source_path, PathOp::Difference) {
                    result
                } else {
                    stroked_path
                }
            }
        }
    } else {
        Path::new()
    }
}

/// A painter that handles all drawing operations for nodes,
/// with proper effect ordering and a layer‐blur/backdrop‐blur pipeline.
pub struct Painter<'a> {
    canvas: &'a skia_safe::Canvas,
    fonts: Rc<RefCell<FontRepository>>,
    images: Rc<RefCell<ImageRepository>>,
}

impl<'a> Painter<'a> {
    /// Create a new Painter for the given canvas
    pub fn new(
        canvas: &'a skia_safe::Canvas,
        fonts: Rc<RefCell<FontRepository>>,
        images: Rc<RefCell<ImageRepository>>,
    ) -> Self {
        Self {
            canvas,
            fonts,
            images,
        }
    }

    // ============================
    // === Helper Methods ========
    // ============================

    /// Save/restore transform state and apply a 2×3 matrix
    fn with_transform<F: FnOnce()>(&self, transform: &[[f32; 3]; 2], f: F) {
        let canvas = self.canvas;
        canvas.save();
        canvas.concat(&cvt::sk_matrix(*transform));
        f();
        canvas.restore();
    }

    /// If opacity < 1.0, wrap drawing in a save_layer_alpha; else draw directly.
    fn with_opacity<F: FnOnce()>(&self, opacity: f32, f: F) {
        let canvas = self.canvas;
        if opacity < 1.0 {
            canvas.save_layer_alpha(None, (opacity * 255.0) as u32);
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// If blend mode is not Normal, wrap drawing in a save_layer with blend mode; else draw directly.
    fn with_blendmode<F: FnOnce()>(&self, blend_mode: BlendMode, f: F) {
        let canvas = self.canvas;
        if blend_mode != BlendMode::Normal {
            let mut paint = SkPaint::default();
            paint.set_blend_mode(blend_mode.into());
            canvas.save_layer(&SaveLayerRec::default().paint(&paint));
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// Helper method to apply clipping to a region with optional corner radius
    fn with_clip<F: FnOnce()>(&self, shape: &PainterShape, f: F) {
        let canvas = self.canvas;
        canvas.save();

        // Try to use the most efficient clipping method based on shape type
        if let Some(rect) = shape.rect_shape {
            // Simple rectangle - use clip_rect (fastest)
            canvas.clip_rect(rect, None, true);
        } else if let Some(rrect) = &shape.rrect {
            // Rounded rectangle - use clip_rrect (faster than path)
            canvas.clip_rrect(rrect, None, true);
        } else {
            // Complex shape - fall back to path clipping
            canvas.clip_path(&shape.to_path(), None, true);
        }

        f();
        canvas.restore();
    }

    /// Wrap a closure `f` in a layer that applies a Gaussian blur to everything drawn inside.
    fn with_layer_blur<F: FnOnce()>(&self, radius: f32, f: F) {
        let canvas = self.canvas;
        let image_filter = skia_safe::image_filters::blur((radius, radius), None, None, None);
        let mut paint = SkPaint::default();
        paint.set_image_filter(image_filter);
        canvas.save_layer(&SaveLayerRec::default().paint(&paint));
        f();
        canvas.restore();
    }

    /// Draw a drop shadow behind the content using a shape.
    fn draw_shadow(&self, shape: &PainterShape, shadow: &FeDropShadow) {
        let canvas = self.canvas;
        let Color(r, g, b, a) = shadow.color;
        let color = skia_safe::Color::from_argb(a, r, g, b);

        // Create drop shadow filter
        let image_filter = skia_safe::image_filters::drop_shadow(
            (shadow.dx, shadow.dy),     // offset as tuple
            (shadow.blur, shadow.blur), // sigma as tuple
            color,                      // color
            None,                       // color_space
            None,                       // input
            None,                       // crop_rect
        );

        // Create paint with the drop shadow filter
        let mut shadow_paint = SkPaint::default();
        shadow_paint.set_image_filter(image_filter);
        shadow_paint.set_anti_alias(true);

        // Draw the shadow using the shape's path
        canvas.draw_path(&shape.to_path(), &shadow_paint);
    }

    /// Draw a backdrop blur: blur what's behind the shape.
    fn draw_backdrop_blur(&self, shape: &PainterShape, blur: &FeBackdropBlur) {
        let canvas = self.canvas;
        // 1) Build a Gaussian‐blur filter for the backdrop
        let image_filter =
            skia_safe::image_filters::blur((blur.radius, blur.radius), None, None, None).unwrap();

        // 2) Clip to the shape
        canvas.save();
        canvas.clip_path(&shape.to_path(), None, true);

        // 3) Use a SaveLayerRec with a backdrop filter so that everything behind is blurred
        let layer_rec = SaveLayerRec::default().backdrop(&image_filter);
        canvas.save_layer(&layer_rec);

        // We don't draw any content here—just pushing and popping the layer
        canvas.restore(); // pop the SaveLayer
        canvas.restore(); // pop the clip
    }

    /// Draw fill for a shape using given paint.
    fn draw_fill(&self, shape: &PainterShape, fill: &Paint) {
        let canvas = self.canvas;
        let (mut fill_paint, image) = match fill {
            Paint::Image(image_paint) => {
                let images = self.images.borrow();
                if let Some(image) = images.get(&image_paint._ref) {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);
                    (paint, Some(image.clone()))
                } else {
                    // Image not ready - skip fill
                    return;
                }
            }
            _ => (
                cvt::sk_paint(fill, 1.0, (shape.rect.width(), shape.rect.height())),
                None,
            ),
        };

        if let Some(image) = image {
            // For image fills, we need to clip to the shape's path
            canvas.save();
            canvas.clip_path(&shape.to_path(), None, true);
            canvas.draw_image_rect(image, None, shape.rect, &fill_paint);
            canvas.restore();
        } else {
            // For regular fills, draw the shape directly
            canvas.draw_path(&shape.to_path(), &fill_paint);
        }
    }

    /// Draw stroke for a shape using given paint.
    fn draw_stroke(
        &self,
        shape: &PainterShape,
        stroke: &Paint,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
    ) {
        let canvas = self.canvas;
        if stroke_width <= 0.0 {
            return;
        }

        // Generate the stroke geometry
        let stroke_path = stroke_geometry(
            &shape.to_path(),
            stroke_width,
            stroke_align,
            stroke_dash_array,
        );

        // Draw the stroke using the generated geometry
        match stroke {
            Paint::Image(image_paint) => {
                let images = self.images.borrow();
                if let Some(image) = images.get(&image_paint._ref) {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);
                    paint.set_stroke(true);
                    paint.set_stroke_width(stroke_width);

                    // For image strokes, we need to clip to the stroke geometry
                    canvas.save();
                    canvas.clip_path(&stroke_path, None, true);
                    canvas.draw_image_rect(image, None, shape.rect, &paint);
                    canvas.restore();
                }
            }
            _ => {
                let mut paint =
                    cvt::sk_paint(stroke, 1.0, (shape.rect.width(), shape.rect.height()));
                let stroke_path = stroke_geometry(
                    &shape.to_path(),
                    stroke_width,
                    stroke_align,
                    stroke_dash_array,
                );
                canvas.draw_path(&stroke_path, &paint);
            }
        }
    }

    /// Draw fill and stroke for a shape using given paints.
    fn draw_fill_and_stroke(
        &self,
        shape: &PainterShape,
        fill: Option<&Paint>,
        stroke: Option<&Paint>,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
    ) {
        // Draw fill if present
        if let Some(fill) = fill {
            self.draw_fill(shape, fill);
        }

        // Draw stroke if present
        if let Some(stroke) = stroke {
            self.draw_stroke(
                shape,
                stroke,
                stroke_width,
                stroke_align,
                stroke_dash_array,
            );
        }
    }

    /// Shared utility to handle effect drawing for shapes
    fn draw_shape_with_effect<F: Fn()>(
        &self,
        effect: Option<&FilterEffect>,
        shape: &PainterShape,
        draw_content: F,
    ) {
        let canvas = self.canvas;
        match effect {
            Some(FilterEffect::DropShadow(shadow)) => {
                self.draw_shadow(shape, shadow);
                draw_content();
            }
            Some(FilterEffect::BackdropBlur(blur)) => {
                self.draw_backdrop_blur(shape, blur);
                draw_content();
            }
            Some(FilterEffect::GaussianBlur(blur)) => {
                self.with_layer_blur(blur.radius, draw_content);
            }
            None => {
                draw_content();
            }
        }
    }

    // ============================
    // === Node Drawing Methods ===
    // ============================

    /// Draw a RectangleNode, respecting its transform, effect, fill, stroke, blend mode, opacity
    fn draw_rect_node(&self, node: &RectangleNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Rectangle(node.clone()));
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            &shape,
                            Some(&node.fill),
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw an ImageNode, respecting transform, effect, rounded corners, blend mode, opacity
    pub fn draw_image_node(&self, node: &ImageNode) -> bool {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Image(node.clone()));
            let images = self.images.borrow();

            if let Some(image) = images.get(&node._ref) {
                // Image is ready - draw it
                self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                    self.with_opacity(node.opacity, || {
                        self.with_blendmode(node.blend_mode, || {
                            let mut paint = SkPaint::default();
                            paint.set_anti_alias(true);

                            // Use with_clip for rounded corners
                            self.with_clip(&shape, || {
                                self.canvas.draw_image_rect(image, None, shape.rect, &paint);
                            });

                            // Draw stroke if needed
                            if node.stroke_width > 0.0 {
                                self.draw_fill_and_stroke(
                                    &shape,
                                    None,
                                    Some(&node.stroke),
                                    node.stroke_width,
                                    node.stroke_align,
                                    node.stroke_dash_array.as_ref(),
                                );
                            }
                        });
                    });
                });
            } else {
                // Image is not ready - draw only stroke and effects
                self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                    self.with_opacity(node.opacity, || {
                        self.with_blendmode(node.blend_mode, || {
                            // Draw only stroke with transparent fill
                            self.draw_fill_and_stroke(
                                &shape,
                                None,
                                Some(&node.stroke),
                                node.stroke_width,
                                node.stroke_align,
                                node.stroke_dash_array.as_ref(),
                            );
                        });
                    });
                });
            }
        });
        true
    }

    /// Draw an EllipseNode
    pub fn draw_ellipse_node(&self, node: &EllipseNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Ellipse(node.clone()));
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            &shape,
                            Some(&node.fill),
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a LineNode
    pub fn draw_line_node(&self, node: &LineNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Line(node.clone()));

            self.with_opacity(node.opacity, || {
                self.with_blendmode(node.blend_mode, || {
                    let mut paint =
                        cvt::sk_paint(&node.stroke, node.opacity, (node.size.width, 0.0));
                    let stroke_path = stroke_geometry(
                        &shape.to_path(),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                    );
                    self.canvas.draw_path(&stroke_path, &paint);
                });
            });
        });
    }

    /// Draw a PathNode (SVG path data)
    pub fn draw_path_node(&self, node: &PathNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = skia_safe::path::Path::from_svg(&node.data).expect("invalid SVG path");
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            &shape,
                            Some(&node.fill),
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a PolygonNode (arbitrary polygon with optional corner radius)
    pub fn draw_polygon_node(&self, node: &PolygonNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            &shape,
                            Some(&node.fill),
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a RegularPolygonNode by converting to a PolygonNode
    pub fn draw_regular_polygon_node(&self, node: &RegularPolygonNode) {
        let polygon = node.to_polygon();
        self.draw_polygon_node(&polygon);
    }

    /// Draw a RegularStarPolygonNode by converting to a PolygonNode
    pub fn draw_regular_star_polygon_node(
        &self,
        node: &RegularStarPolygonNode,
    ) {
        let polygon = node.to_polygon();
        self.draw_polygon_node(&polygon);
    }

    /// Draw a TextSpanNode (simple text block)
    pub fn draw_text_span_node(&self, node: &TextSpanNode) {
        // Prepare paint for fill
        let mut fill_paint = cvt::sk_paint(
            &node.fill,
            node.opacity,
            (node.size.width, node.size.height),
        );
        fill_paint.set_blend_mode(node.blend_mode.into());

        // Build paragraph style
        let mut paragraph_style = ParagraphStyle::new();
        paragraph_style.set_text_direction(TextDirection::LTR);
        paragraph_style.set_text_align(node.text_align.into());

        let fonts = self.fonts.borrow();
        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());

        // Build text style
        let mut ts = skia_safe::textlayout::TextStyle::new();
        ts.set_foreground_paint(&fill_paint);
        ts.set_font_size(node.text_style.font_size);
        if let Some(letter_spacing) = node.text_style.letter_spacing {
            ts.set_letter_spacing(letter_spacing);
        }
        if let Some(line_height) = node.text_style.line_height {
            ts.set_height(line_height);
        }
        let mut decor = skia_safe::textlayout::Decoration::default();
        decor.ty = node.text_style.text_decoration.into();
        ts.set_decoration(&decor);
        ts.set_font_families(&[&node.text_style.font_family]);
        let font_style = skia_safe::FontStyle::new(
            skia_safe::font_style::Weight::from(node.text_style.font_weight.value() as i32),
            skia_safe::font_style::Width::NORMAL,
            skia_safe::font_style::Slant::Upright,
        );
        ts.set_font_style(font_style);

        para_builder.push_style(&ts);
        // Apply text transform before adding text
        let transformed_text =
            crate::text::text_transform::transform_text(&node.text, node.text_style.text_transform);
        para_builder.add_text(&transformed_text);
        let mut paragraph = para_builder.build();
        para_builder.pop();
        paragraph.layout(node.size.width);

        self.with_transform(&node.transform.matrix, || {
            paragraph.paint(self.canvas, Point::new(0.0, 0.0));
        });
    }

    /// Draw a ContainerNode (background + stroke + children)
    pub fn draw_container_node(
        &self,
        node: &ContainerNode,
        repository: &NodeRepository,
    ) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                let shape = build_shape(&IntrinsicSizeNode::Container(node.clone()));

                // Draw effects first (if any) - these won't be clipped
                self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            &shape,
                            Some(&node.fill),
                            node.stroke.as_ref(),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });

                // Draw children with clipping if enabled
                if node.clip {
                    self.with_clip(&shape, || {
                        for child_id in &node.children {
                            if let Some(child) = repository.get(child_id) {
                                self.draw_node(child, repository);
                            }
                        }
                    });
                } else {
                    // Draw children without clipping
                    for child_id in &node.children {
                        if let Some(child) = repository.get(child_id) {
                            self.draw_node(child, repository);
                        }
                    }
                }
            });
        });
    }

    pub fn draw_error_node(&self, node: &ErrorNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Error(node.clone()));

            // Create a red fill paint
            let fill = Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 51), // Semi-transparent red
                opacity: 1.0,
            });
            let stroke = Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 255), // Solid red
                opacity: 1.0,
            });

            self.with_opacity(node.opacity, || {
                self.draw_fill_and_stroke(
                    &shape,
                    Some(&fill),
                    Some(&stroke),
                    1.0, // stroke width
                    StrokeAlign::Inside,
                    None, // no dash array
                );
            });
        });
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    pub fn draw_group_node(
        &self,
        node: &GroupNode,
        repository: &NodeRepository,
    ) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node(child, repository);
                    }
                }
            });
        });
    }

    #[deprecated(note = "Boolean operations are not implemented properly")]
    pub fn draw_boolean_operation_node(
        &self,
        node: &BooleanPathOperationNode,
        repository: &NodeRepository,
    ) {
        self.with_transform(&node.transform.matrix, || {
            for child_id in &node.children {
                if let Some(child) = repository.get(child_id) {
                    self.draw_node(child, repository);
                }
            }
        });
    }

    /// Dispatch to the correct node‐type draw method
    pub fn draw_node(&self, node: &Node, repository: &NodeRepository) {
        match node {
            Node::Error(n) => self.draw_error_node(n),
            Node::Group(n) => self.draw_group_node(n, repository),
            Node::Container(n) => self.draw_container_node(n, repository),
            Node::Rectangle(n) => self.draw_rect_node(n),
            Node::Ellipse(n) => self.draw_ellipse_node(n),
            Node::Polygon(n) => self.draw_polygon_node(n),
            Node::RegularPolygon(n) => self.draw_regular_polygon_node(n),
            Node::TextSpan(n) => self.draw_text_span_node(n),
            Node::Line(n) => self.draw_line_node(n),
            Node::Image(n) => {
                self.draw_image_node(n);
            }
            Node::Path(n) => self.draw_path_node(n),
            Node::BooleanOperation(n) => self.draw_boolean_operation_node(n, repository),
            Node::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }
}
