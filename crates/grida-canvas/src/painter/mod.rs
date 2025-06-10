pub mod cvt;
use crate::node::schema::*;
use crate::repository::{FontRepository, ImageRepository, NodeRepository};
use skia_safe::stroke_rec::InitStyle;
use skia_safe::{Paint as SkPaint, Path, Point, RRect, Rect, canvas::SaveLayerRec, textlayout::*};
use skia_safe::{PaintStyle, PathEffect, PathOp, StrokeRec, op};

/// Internal universal Painter's shape abstraction for optimized drawing
/// Virtual nodes like Group, BooleanOperation are not Painter's shapes, they use different methods.
pub struct PainterShape {
    pub rect: Rect,
    pub rect_shape: Option<Rect>,
    pub rrect: Option<RRect>,
    pub oval: Option<Rect>,
    pub path: Option<Path>,
}

impl PainterShape {
    /// Construct a plain rectangle shape
    pub fn from_rect(rect: Rect) -> Self {
        Self {
            rect,
            rect_shape: Some(rect),
            rrect: None,
            oval: None,
            path: None,
        }
    }
    /// Construct a rounded rectangle shape
    pub fn from_rrect(rrect: RRect) -> Self {
        Self {
            rect: rrect.rect().clone(),
            rect_shape: None,
            rrect: Some(rrect),
            oval: None,
            path: None,
        }
    }
    /// Construct an oval/ellipse shape
    pub fn from_oval(rect: Rect) -> Self {
        Self {
            rect,
            rect_shape: None,
            rrect: None,
            oval: Some(rect),
            path: None,
        }
    }
    /// Construct a path-based shape (bounding rect must be provided)
    pub fn from_path(path: Path) -> Self {
        Self {
            rect: path.bounds().clone(),
            rect_shape: None,
            rrect: None,
            oval: None,
            path: Some(path),
        }
    }

    pub fn to_path(&self) -> Path {
        let mut path = Path::new();

        if let Some(rect) = self.rect_shape {
            path.add_rect(rect, None);
        } else if let Some(rrect) = &self.rrect {
            path.add_rrect(rrect, None);
        } else if let Some(oval) = &self.oval {
            path.add_oval(oval, None);
        } else if let Some(existing_path) = &self.path {
            path = existing_path.clone();
        } else {
            // Fallback to rect if no specific shape is set
            path.add_rect(self.rect, None);
        }

        path
    }
}

fn build_shape(node: &IntrinsicSizeNode) -> PainterShape {
    match node {
        IntrinsicSizeNode::Rectangle(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl, r.tl),
                        Point::new(r.tr, r.tr),
                        Point::new(r.br, r.br),
                        Point::new(r.bl, r.bl),
                    ],
                );
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Ellipse(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            PainterShape::from_oval(rect)
        }
        IntrinsicSizeNode::Polygon(n) => {
            let path = if n.corner_radius > 0.0 {
                n.to_path()
            } else {
                let mut p = Path::new();
                let mut iter = n.points.iter();
                if let Some(&pt) = iter.next() {
                    p.move_to((pt.x, pt.y));
                    for &pt in iter {
                        p.line_to((pt.x, pt.y));
                    }
                    p.close();
                }
                p
            };
            PainterShape::from_path(path)
        }
        IntrinsicSizeNode::RegularPolygon(n) => {
            let poly = n.to_polygon();
            build_shape(&IntrinsicSizeNode::Polygon(poly))
        }
        IntrinsicSizeNode::RegularStarPolygon(n) => {
            let poly = n.to_polygon();
            build_shape(&IntrinsicSizeNode::Polygon(poly))
        }
        IntrinsicSizeNode::Line(n) => {
            let mut path = Path::new();
            path.move_to((0.0, 0.0));
            path.line_to((n.size.width, 0.0));
            PainterShape::from_path(path)
        }
        IntrinsicSizeNode::Path(n) => {
            if let Some(path) = Path::from_svg(&n.data) {
                PainterShape::from_path(path)
            } else {
                // Fallback to empty rect if path is invalid
                PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
            }
        }
        IntrinsicSizeNode::Container(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if r.tl > 0.0 || r.tr > 0.0 || r.bl > 0.0 || r.br > 0.0 {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl, r.tl),
                        Point::new(r.tr, r.tr),
                        Point::new(r.br, r.br),
                        Point::new(r.bl, r.bl),
                    ],
                );
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Image(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if r.tl > 0.0 || r.tr > 0.0 || r.bl > 0.0 || r.br > 0.0 {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl, r.tl),
                        Point::new(r.tr, r.tr),
                        Point::new(r.br, r.br),
                        Point::new(r.bl, r.bl),
                    ],
                );
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Error(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            PainterShape::from_rect(rect)
        }
        IntrinsicSizeNode::TextSpan(_) => {
            // Text spans don't have a shape
            PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
        }
    }
}

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
pub struct Painter {
    font_collection: FontCollection,
}

impl Painter {
    /// Create a new Painter, using fonts from the FontRepository
    pub fn new(font_repository: &FontRepository, _image_repository: &ImageRepository) -> Self {
        let mut font_collection = FontCollection::new();
        font_collection.set_default_font_manager(font_repository.font_mgr().clone(), None);
        font_collection.set_asset_font_manager(Some(font_repository.provider().clone().into()));
        Self { font_collection }
    }

    /// Update the font collection from repository (called when new fonts are added)
    pub fn refresh_fonts(&mut self, repository: &FontRepository) {
        let mut font_collection = FontCollection::new();
        font_collection.set_default_font_manager(repository.font_mgr().clone(), None);
        font_collection.set_asset_font_manager(Some(repository.provider().clone().into()));
        self.font_collection = font_collection;
    }

    // ============================
    // === Helper Methods ========
    // ============================

    /// Save/restore transform state and apply a 2×3 matrix
    fn with_transform<F: FnOnce()>(
        &self,
        canvas: &skia_safe::Canvas,
        transform: &[[f32; 3]; 2],
        f: F,
    ) {
        canvas.save();
        canvas.concat(&cvt::sk_matrix(*transform));
        f();
        canvas.restore();
    }

    /// If opacity < 1.0, wrap drawing in a save_layer_alpha; else draw directly.
    fn with_opacity<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, opacity: f32, f: F) {
        if opacity < 1.0 {
            canvas.save_layer_alpha(None, (opacity * 255.0) as u32);
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// If blend mode is not Normal, wrap drawing in a save_layer with blend mode; else draw directly.
    fn with_blendmode<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, blend_mode: BlendMode, f: F) {
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
    fn with_clip<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, shape: &PainterShape, f: F) {
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
    fn with_layer_blur<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, radius: f32, f: F) {
        let image_filter = skia_safe::image_filters::blur((radius, radius), None, None, None);
        let mut paint = SkPaint::default();
        paint.set_image_filter(image_filter);
        canvas.save_layer(&SaveLayerRec::default().paint(&paint));
        f();
        canvas.restore();
    }

    /// Draw a drop shadow behind the content using a shape.
    fn draw_shadow(&self, canvas: &skia_safe::Canvas, shape: &PainterShape, shadow: &FeDropShadow) {
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
    fn draw_backdrop_blur(
        &self,
        canvas: &skia_safe::Canvas,
        shape: &PainterShape,
        blur: &FeBackdropBlur,
    ) {
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
    fn draw_fill(
        &self,
        canvas: &skia_safe::Canvas,
        shape: &PainterShape,
        fill: &Paint,
        image_repository: &ImageRepository,
    ) {
        let (mut fill_paint, image) = match fill {
            Paint::Image(image_paint) => {
                if let Some(image) = image_repository.get(&image_paint._ref) {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);
                    (paint, Some(image))
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
        canvas: &skia_safe::Canvas,
        shape: &PainterShape,
        stroke: &Paint,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
        image_repository: &ImageRepository,
    ) {
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
                if let Some(image) = image_repository.get(&image_paint._ref) {
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
                let mut paint = cvt::sk_paint_with_stroke(
                    stroke,
                    1.0,
                    (shape.rect.width(), shape.rect.height()),
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
        canvas: &skia_safe::Canvas,
        shape: &PainterShape,
        fill: Option<&Paint>,
        stroke: Option<&Paint>,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
        image_repository: &ImageRepository,
    ) {
        // Draw fill if present
        if let Some(fill) = fill {
            self.draw_fill(canvas, shape, fill, image_repository);
        }

        // Draw stroke if present
        if let Some(stroke) = stroke {
            self.draw_stroke(
                canvas,
                shape,
                stroke,
                stroke_width,
                stroke_align,
                stroke_dash_array,
                image_repository,
            );
        }
    }

    /// Shared utility to handle effect drawing for shapes
    fn draw_shape_with_effect<F: Fn()>(
        &self,
        canvas: &skia_safe::Canvas,
        effect: Option<&FilterEffect>,
        shape: &PainterShape,
        draw_content: F,
    ) {
        match effect {
            Some(FilterEffect::DropShadow(shadow)) => {
                self.draw_shadow(canvas, shape, shadow);
                draw_content();
            }
            Some(FilterEffect::BackdropBlur(blur)) => {
                self.draw_backdrop_blur(canvas, shape, blur);
                draw_content();
            }
            Some(FilterEffect::GaussianBlur(blur)) => {
                self.with_layer_blur(canvas, blur.radius, draw_content);
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
    fn draw_rect_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &RectangleNode,
        image_repository: &ImageRepository,
    ) {
        self.with_transform(canvas, &node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Rectangle(node.clone()));
            self.draw_shape_with_effect(canvas, node.effect.as_ref(), &shape, || {
                self.with_opacity(canvas, node.opacity, || {
                    self.with_blendmode(canvas, node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            canvas,
                            &shape,
                            Some(&node.fill),
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                            image_repository,
                        );
                    });
                });
            });
        });
    }

    /// Draw a ContainerNode (background + stroke + children)
    pub fn draw_container_node<F>(
        &self,
        canvas: &skia_safe::Canvas,
        node: &ContainerNode,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
        should_draw: &F,
    ) where
        F: Fn(&NodeId) -> bool,
    {
        self.with_transform(canvas, &node.transform.matrix, || {
            self.with_opacity(canvas, node.opacity, || {
                let shape = build_shape(&IntrinsicSizeNode::Container(node.clone()));

                // Draw effects first (if any) - these won't be clipped
                self.draw_shape_with_effect(canvas, node.effect.as_ref(), &shape, || {
                    self.with_blendmode(canvas, node.blend_mode, || {
                        self.draw_fill_and_stroke(
                            canvas,
                            &shape,
                            Some(&node.fill),
                            node.stroke.as_ref(),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                            image_repository,
                        );
                    });
                });

                // Draw children with clipping if enabled
                if node.clip {
                    self.with_clip(canvas, &shape, || {
                        for child_id in &node.children {
                            if let Some(child) = repository.get(child_id) {
                                if should_draw(child_id) {
                                    self.draw_node(
                                        canvas,
                                        child,
                                        repository,
                                        image_repository,
                                        should_draw,
                                    );
                                }
                            }
                        }
                    });
                } else {
                    // Draw children without clipping
                    for child_id in &node.children {
                        if let Some(child) = repository.get(child_id) {
                            if should_draw(child_id) {
                                self.draw_node(
                                    canvas,
                                    child,
                                    repository,
                                    image_repository,
                                    should_draw,
                                );
                            }
                        }
                    }
                }
            });
        });
    }

    /// Draw an ImageNode, respecting transform, effect, rounded corners, blend mode, opacity
    pub fn draw_image_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &ImageNode,
        image_repository: &ImageRepository,
    ) -> bool {
        self.with_transform(canvas, &node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Image(node.clone()));

            if let Some(image) = image_repository.get(&node._ref) {
                // Image is ready - draw it
                self.draw_shape_with_effect(canvas, node.effect.as_ref(), &shape, || {
                    self.with_opacity(canvas, node.opacity, || {
                        self.with_blendmode(canvas, node.blend_mode, || {
                            // Draw the image with rounded‐rect clipping
                            let mut paint = SkPaint::default();
                            paint.set_anti_alias(true);

                            if node.corner_radius.tl > 0.0
                                || node.corner_radius.tr > 0.0
                                || node.corner_radius.bl > 0.0
                                || node.corner_radius.br > 0.0
                            {
                                canvas.save();
                                canvas.clip_path(&shape.to_path(), None, true);
                                canvas.draw_image_rect(image, None, shape.rect, &paint);
                                canvas.restore();
                            } else {
                                canvas.draw_image_rect(image, None, shape.rect, &paint);
                            }

                            // Draw stroke if needed
                            if node.stroke_width > 0.0 {
                                self.draw_fill_and_stroke(
                                    canvas,
                                    &shape,
                                    None,
                                    Some(&node.stroke),
                                    node.stroke_width,
                                    node.stroke_align,
                                    node.stroke_dash_array.as_ref(),
                                    image_repository,
                                );
                            }
                        });
                    });
                });
            } else {
                // Image is not ready - draw only stroke and effects
                self.draw_shape_with_effect(canvas, node.effect.as_ref(), &shape, || {
                    self.with_opacity(canvas, node.opacity, || {
                        self.with_blendmode(canvas, node.blend_mode, || {
                            // Draw only stroke with transparent fill
                            self.draw_fill_and_stroke(
                                canvas,
                                &shape,
                                None,
                                Some(&node.stroke),
                                node.stroke_width,
                                node.stroke_align,
                                node.stroke_dash_array.as_ref(),
                                image_repository,
                            );
                        });
                    });
                });
            }
        });
        true
    }

    pub fn draw_error_node(&self, canvas: &skia_safe::Canvas, node: &ErrorNode) {
        self.with_transform(canvas, &node.transform.matrix, || {
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

            self.with_opacity(canvas, node.opacity, || {
                self.draw_fill_and_stroke(
                    canvas,
                    &shape,
                    Some(&fill),
                    Some(&stroke),
                    1.0, // stroke width
                    StrokeAlign::Inside,
                    None, // no dash array
                    &ImageRepository::new(),
                );
            });
        });
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    pub fn draw_group_node<F>(
        &self,
        canvas: &skia_safe::Canvas,
        node: &GroupNode,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
        should_draw: &F,
    ) where
        F: Fn(&NodeId) -> bool,
    {
        self.with_transform(canvas, &node.transform.matrix, || {
            self.with_opacity(canvas, node.opacity, || {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        if should_draw(child_id) {
                            self.draw_node(
                                canvas,
                                child,
                                repository,
                                image_repository,
                                should_draw,
                            );
                        }
                    }
                }
            });
        });
    }

    /// Draw an EllipseNode
    pub fn draw_ellipse_node(&self, canvas: &skia_safe::Canvas, node: &EllipseNode) {
        self.with_transform(canvas, &node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Ellipse(node.clone()));

            self.with_opacity(canvas, node.opacity, || {
                self.with_blendmode(canvas, node.blend_mode, || {
                    let mut fill_paint = cvt::sk_paint(
                        &node.fill,
                        node.opacity,
                        (node.size.width, node.size.height),
                    );
                    canvas.draw_path(&shape.to_path(), &fill_paint);

                    if node.stroke_width > 0.0 {
                        let mut stroke_paint = cvt::sk_paint(
                            &node.stroke,
                            node.opacity,
                            (node.size.width, node.size.height),
                        );
                        stroke_paint.set_stroke(true);
                        stroke_paint.set_stroke_width(node.stroke_width);
                        canvas.draw_path(&shape.to_path(), &stroke_paint);
                    }
                });
            });
        });
    }

    /// Draw a LineNode
    pub fn draw_line_node(&self, canvas: &skia_safe::Canvas, node: &LineNode) {
        self.with_transform(canvas, &node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Line(node.clone()));

            self.with_opacity(canvas, node.opacity, || {
                self.with_blendmode(canvas, node.blend_mode, || {
                    let mut paint = cvt::sk_paint_with_stroke(
                        &node.stroke,
                        node.opacity,
                        (node.size.width, 0.0),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                    );
                    canvas.draw_path(&shape.to_path(), &paint);
                });
            });
        });
    }

    /// Draw a PathNode (SVG path data)
    pub fn draw_path_node(&self, canvas: &skia_safe::Canvas, node: &PathNode) {
        self.with_transform(canvas, &node.transform.matrix, || {
            let path = skia_safe::path::Path::from_svg(&node.data).expect("invalid SVG path");
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effect(canvas, node.effect.as_ref(), &shape, || {
                let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                fill_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &fill_paint);
                if node.stroke_width > 0.0 {
                    let mut stroke_paint = cvt::sk_paint_with_stroke(
                        &node.stroke,
                        node.opacity,
                        (1.0, 1.0),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                    );
                    stroke_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &stroke_paint);
                }
            });
        });
    }

    /// Draw a PolygonNode (arbitrary polygon with optional corner radius)
    pub fn draw_polygon_node(&self, canvas: &skia_safe::Canvas, node: &PolygonNode) {
        self.with_transform(canvas, &node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effect(canvas, node.effect.as_ref(), &shape, || {
                let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                fill_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &fill_paint);
                if node.stroke_width > 0.0 {
                    let mut stroke_paint = cvt::sk_paint_with_stroke(
                        &node.stroke,
                        node.opacity,
                        (1.0, 1.0),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                    );
                    stroke_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &stroke_paint);
                }
            });
        });
    }

    /// Draw a RegularPolygonNode by converting to a PolygonNode
    pub fn draw_regular_polygon_node(&self, canvas: &skia_safe::Canvas, node: &RegularPolygonNode) {
        let polygon = node.to_polygon();
        self.draw_polygon_node(canvas, &polygon);
    }

    /// Draw a RegularStarPolygonNode by converting to a PolygonNode
    pub fn draw_regular_star_polygon_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &RegularStarPolygonNode,
    ) {
        let polygon = node.to_polygon();
        self.draw_polygon_node(canvas, &polygon);
    }

    #[deprecated(note = "Boolean operations are not implemented properly")]
    pub fn draw_boolean_operation_node<F>(
        &self,
        canvas: &skia_safe::Canvas,
        node: &BooleanPathOperationNode,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
        should_draw: &F,
    ) where
        F: Fn(&NodeId) -> bool,
    {
        self.with_transform(canvas, &node.transform.matrix, || {
            for child_id in &node.children {
                if should_draw(child_id) {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node(canvas, child, repository, image_repository, should_draw);
                    }
                }
            }
        });
    }

    /// Draw a TextSpanNode (simple text block)
    pub fn draw_text_span_node(&self, canvas: &skia_safe::Canvas, node: &TextSpanNode) {
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

        let mut para_builder = ParagraphBuilder::new(&paragraph_style, &self.font_collection);

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

        self.with_transform(canvas, &node.transform.matrix, || {
            paragraph.paint(canvas, Point::new(0.0, 0.0));
        });
    }

    /// Dispatch to the correct node‐type draw method
    pub fn draw_node<F>(
        &self,
        canvas: &skia_safe::Canvas,
        node: &Node,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
        should_draw: &F,
    ) where
        F: Fn(&NodeId) -> bool,
    {
        match node {
            Node::Error(n) => self.draw_error_node(canvas, n),
            Node::Group(n) => {
                self.draw_group_node(canvas, n, repository, image_repository, should_draw)
            }
            Node::Container(n) => {
                self.draw_container_node(canvas, n, repository, image_repository, should_draw)
            }
            Node::Rectangle(n) => self.draw_rect_node(canvas, n, image_repository),
            Node::Ellipse(n) => self.draw_ellipse_node(canvas, n),
            Node::Polygon(n) => self.draw_polygon_node(canvas, n),
            Node::RegularPolygon(n) => self.draw_regular_polygon_node(canvas, n),
            Node::TextSpan(n) => self.draw_text_span_node(canvas, n),
            Node::Line(n) => self.draw_line_node(canvas, n),
            Node::Image(n) => {
                self.draw_image_node(canvas, n, image_repository);
            }
            Node::Path(n) => self.draw_path_node(canvas, n),
            Node::BooleanOperation(n) => self.draw_boolean_operation_node(
                canvas,
                n,
                repository,
                image_repository,
                should_draw,
            ),
            Node::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(canvas, n),
        }
    }
}
