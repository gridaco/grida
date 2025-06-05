//

use crate::cvt;
use crate::schema::*;
use crate::{
    camera::Camera,
    repository::{FontRepository, ImageRepository, NodeRepository},
};
use skia_safe::{
    Image, MaskFilter, Paint as SkPaint, Picture, PictureRecorder, Point, RRect, Rect, Surface,
    canvas::SaveLayerRec, image_filters::blur, surfaces, textlayout::*,
};

/// Choice of GPU vs. raster backend
pub enum Backend {
    GL(*mut Surface),
    Raster(*mut Surface),
}

impl Backend {
    pub fn get_surface(&self) -> *mut Surface {
        match self {
            Backend::GL(ptr) | Backend::Raster(ptr) => *ptr,
        }
    }
}

/// A painter that handles all drawing operations for nodes,
/// with proper effect ordering and layer-blur pipeline.
pub struct Painter {
    font_collection: FontCollection,
}

impl Painter {
    /// Create a new Painter, using fonts from the FontRepository
    pub fn new(font_repository: &FontRepository) -> Self {
        let mut font_collection = FontCollection::new();
        font_collection.set_default_font_manager(font_repository.font_mgr().clone(), None);
        Self { font_collection }
    }

    // ============================
    // === Helper Methods ========
    // ============================

    /// Save/restore transform state and apply a 2×3 matrix
    fn with_canvas_state<F: FnOnce()>(
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

    /// If opacity < 1.0, wrap drawing in a save_layer_alpha, else draw directly.
    fn with_opacity_layer<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, opacity: f32, f: F) {
        if opacity < 1.0 {
            canvas.save_layer_alpha(None, (opacity * 255.0) as u32);
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// Wrap a closure `f` in a layer that applies a Gaussian blur to everything drawn inside.
    fn with_layer_blur<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, radius: f32, f: F) {
        let image_filter = blur((radius, radius), None, None, None);
        let mut paint = SkPaint::default();
        paint.set_image_filter(image_filter);
        canvas.save_layer(&SaveLayerRec::default().paint(&paint));
        f();
        canvas.restore();
    }

    /// Draw a drop shadow behind the content at `rect` with corner radii.
    fn draw_shadow(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        shadow: &FeDropShadow,
    ) {
        let mut shadow_paint = SkPaint::default();
        let Color(r, g, b, a) = shadow.color;
        shadow_paint.set_color(skia_safe::Color::from_argb(a, r, g, b));
        shadow_paint.set_anti_alias(true);
        if shadow.blur > 0.0 {
            shadow_paint.set_mask_filter(MaskFilter::blur(
                skia_safe::BlurStyle::Normal,
                shadow.blur,
                None,
            ));
        }

        let offset_x = shadow.dx;
        let offset_y = shadow.dy;
        let RectangularCornerRadius { tl, tr, bl, br } = *radii;

        if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
            // Rounded rect shadow
            let rrect = RRect::new_rect_radii(
                rect,
                &[
                    Point::new(tl, tl),
                    Point::new(tr, tr),
                    Point::new(br, br),
                    Point::new(bl, bl),
                ],
            );
            let mut shadow_rrect = rrect;
            shadow_rrect.offset((offset_x, offset_y));
            canvas.draw_rrect(shadow_rrect, &shadow_paint);
        } else {
            // Regular rect shadow
            let mut shadow_rect = rect;
            shadow_rect.offset((offset_x, offset_y));
            canvas.draw_rect(shadow_rect, &shadow_paint);
        }
    }

    /// Draw a backdrop blur: blur what's behind `rect`, clipped to rounded-corner area.
    fn draw_backdrop_blur(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        blur: &FeBackdropBlur,
    ) {
        // Create a paint that blurs
        let mut paint = SkPaint::default();
        paint.set_mask_filter(MaskFilter::blur(
            skia_safe::BlurStyle::Normal,
            blur.radius,
            None,
        ));

        // Clip to the shape's rounded rectangle (or rect) so blur only inside
        let RectangularCornerRadius { tl, tr, bl, br } = *radii;
        if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
            let rrect = RRect::new_rect_radii(
                rect,
                &[
                    Point::new(tl, tl),
                    Point::new(tr, tr),
                    Point::new(br, br),
                    Point::new(bl, bl),
                ],
            );
            canvas.save();
            canvas.clip_rrect(rrect, None, true);
        } else {
            canvas.save();
            canvas.clip_rect(rect, None, true);
        }

        // Draw a rectangle filled with the blurred background
        // Here, draw_rect with a blur mask filter effectively blurs everything behind the rect
        canvas.save_layer_alpha(None, 255);
        canvas.draw_rect(rect, &paint);
        canvas.restore();

        // Restore from clipping
        canvas.restore();
    }

    /// Draw fill and stroke for a shape at `rect` with `radii`, using given paints.
    fn draw_fill_and_stroke(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        fill: &Paint,
        stroke: Option<&Paint>,
        stroke_width: f32,
        blend_mode: BlendMode,
        opacity: f32,
    ) {
        let RectangularCornerRadius { tl, tr, bl, br } = *radii;
        let mut fill_paint = cvt::sk_paint(fill, opacity, (rect.width(), rect.height()));
        fill_paint.set_blend_mode(blend_mode.into());

        if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
            // Rounded rect fill
            let rrect = RRect::new_rect_radii(
                rect,
                &[
                    Point::new(tl, tl),
                    Point::new(tr, tr),
                    Point::new(br, br),
                    Point::new(bl, bl),
                ],
            );
            canvas.draw_rrect(rrect, &fill_paint);

            // Stroke if present
            if let Some(stroke) = stroke {
                if stroke_width > 0.0 {
                    let mut stroke_paint =
                        cvt::sk_paint(stroke, opacity, (rect.width(), rect.height()));
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(stroke_width);
                    stroke_paint.set_blend_mode(blend_mode.into());
                    canvas.draw_rrect(rrect, &stroke_paint);
                }
            }
        } else {
            // Regular rect fill
            canvas.draw_rect(rect, &fill_paint);

            // Stroke if present
            if let Some(stroke) = stroke {
                if stroke_width > 0.0 {
                    let mut stroke_paint =
                        cvt::sk_paint(stroke, opacity, (rect.width(), rect.height()));
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(stroke_width);
                    stroke_paint.set_blend_mode(blend_mode.into());
                    canvas.draw_rect(rect, &stroke_paint);
                }
            }
        }
    }

    /// Central dispatcher that applies the effect (drop‐shadow, layer‐blur, backdrop‐blur)
    /// around drawing the content (closure `draw_content`).
    fn apply_effect<F: FnOnce()>(
        &self,
        canvas: &skia_safe::Canvas,
        effect: &FilterEffect,
        rect: Rect,
        radii: &RectangularCornerRadius,
        draw_content: F,
    ) {
        match effect {
            FilterEffect::GaussianBlur(blur) => {
                // Layer‐blur: blur everything drawn inside the closure
                self.with_layer_blur(canvas, blur.radius, draw_content);
            }
            FilterEffect::DropShadow(shadow) => {
                // Drop shadow behind content, then draw content normally
                self.draw_shadow(canvas, rect, radii, shadow);
                draw_content();
            }
            FilterEffect::BackdropBlur(blur) => {
                // Backdrop blur behind content, then draw content normally
                self.draw_backdrop_blur(canvas, rect, radii, blur);
                draw_content();
            }
        }
    }

    // ============================
    // === Node Drawing Methods ===
    // ============================

    /// Draw a RectangleNode, respecting its transform, effect, fill, stroke, blend mode, opacity
    fn draw_rect_node(&self, canvas: &skia_safe::Canvas, node: &RectangleNode) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let radii = node.corner_radius;

            // If there's an effect, wrap draw in apply_effect
            if let Some(effect) = &node.effect {
                self.apply_effect(canvas, effect, rect, &radii, || {
                    self.draw_fill_and_stroke(
                        canvas,
                        rect,
                        &radii,
                        &node.fill,
                        Some(&node.stroke),
                        node.stroke_width,
                        node.blend_mode,
                        node.opacity,
                    );
                });
            } else {
                // No effect: just draw fill + stroke
                self.draw_fill_and_stroke(
                    canvas,
                    rect,
                    &radii,
                    &node.fill,
                    Some(&node.stroke),
                    node.stroke_width,
                    node.blend_mode,
                    node.opacity,
                );
            }
        });
    }

    /// Draw a ContainerNode (background + stroke + children)
    pub fn draw_container_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &ContainerNode,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
    ) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            // Respect container opacity by wrapping in a save_layer_alpha
            self.with_opacity_layer(canvas, node.opacity, || {
                let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
                let radii = node.corner_radius;

                // If there's an effect, wrap draw in apply_effect
                if let Some(effect) = &node.effect {
                    self.apply_effect(canvas, effect, rect, &radii, || {
                        // Draw fill + stroke
                        self.draw_fill_and_stroke(
                            canvas,
                            rect,
                            &radii,
                            &node.fill,
                            node.stroke.as_ref(),
                            node.stroke_width,
                            node.blend_mode,
                            node.opacity,
                        );
                    });
                } else {
                    // No effect: just draw fill + stroke
                    self.draw_fill_and_stroke(
                        canvas,
                        rect,
                        &radii,
                        &node.fill,
                        node.stroke.as_ref(),
                        node.stroke_width,
                        node.blend_mode,
                        node.opacity,
                    );
                }

                // Draw children on top
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node(canvas, child, repository, image_repository);
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
    ) {
        if let Some(image) = image_repository.get(&node._ref) {
            self.with_canvas_state(canvas, &node.transform.matrix, || {
                let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
                let radii = node.corner_radius;

                // If there's an effect, wrap draw in apply_effect
                if let Some(effect) = &node.effect {
                    self.apply_effect(canvas, effect, rect, &radii, || {
                        // Draw the image with rounded-rect clipping
                        let mut paint = SkPaint::default();
                        paint.set_anti_alias(true);
                        paint.set_blend_mode(node.blend_mode.into());
                        paint.set_alpha((node.opacity * 255.0) as u8);

                        if radii.tl > 0.0 || radii.tr > 0.0 || radii.bl > 0.0 || radii.br > 0.0 {
                            let rrect = RRect::new_rect_radii(
                                rect,
                                &[
                                    Point::new(radii.tl, radii.tl),
                                    Point::new(radii.tr, radii.tr),
                                    Point::new(radii.br, radii.br),
                                    Point::new(radii.bl, radii.bl),
                                ],
                            );
                            canvas.save();
                            canvas.clip_rrect(rrect, None, true);
                            canvas.draw_image_rect(image, None, rect, &paint);
                            canvas.restore();
                        } else {
                            canvas.draw_image_rect(image, None, rect, &paint);
                        }

                        // Draw stroke if needed
                        if node.stroke_width > 0.0 {
                            self.draw_fill_and_stroke(
                                canvas,
                                rect,
                                &radii,
                                &node.stroke,
                                None,
                                node.stroke_width,
                                node.blend_mode,
                                node.opacity,
                            );
                        }
                    });
                } else {
                    // No effect: draw image + stroke directly
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);
                    paint.set_blend_mode(node.blend_mode.into());
                    paint.set_alpha((node.opacity * 255.0) as u8);

                    if radii.tl > 0.0 || radii.tr > 0.0 || radii.bl > 0.0 || radii.br > 0.0 {
                        let rrect = RRect::new_rect_radii(
                            rect,
                            &[
                                Point::new(radii.tl, radii.tl),
                                Point::new(radii.tr, radii.tr),
                                Point::new(radii.br, radii.br),
                                Point::new(radii.bl, radii.bl),
                            ],
                        );
                        canvas.save();
                        canvas.clip_rrect(rrect, None, true);
                        canvas.draw_image_rect(image, None, rect, &paint);
                        canvas.restore();
                    } else {
                        canvas.draw_image_rect(image, None, rect, &paint);
                    }

                    if node.stroke_width > 0.0 {
                        self.draw_fill_and_stroke(
                            canvas,
                            rect,
                            &radii,
                            &node.stroke,
                            None,
                            node.stroke_width,
                            node.blend_mode,
                            node.opacity,
                        );
                    }
                }
            });
        }
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    pub fn draw_group_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &GroupNode,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
    ) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            self.with_opacity_layer(canvas, node.opacity, || {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node(canvas, child, repository, image_repository);
                    }
                }
            });
        });
    }

    /// Draw an EllipseNode
    pub fn draw_ellipse_node(&self, canvas: &skia_safe::Canvas, node: &EllipseNode) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);

            // No effect on ellipse for now; you could extend similarly to rect
            let mut fill_paint = cvt::sk_paint(
                &node.fill,
                node.opacity,
                (node.size.width, node.size.height),
            );
            fill_paint.set_blend_mode(node.blend_mode.into());
            canvas.draw_oval(rect, &fill_paint);

            if node.stroke_width > 0.0 {
                let mut stroke_paint = cvt::sk_paint(
                    &node.stroke,
                    node.opacity,
                    (node.size.width, node.size.height),
                );
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                stroke_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_oval(rect, &stroke_paint);
            }
        });
    }

    /// Draw a LineNode
    pub fn draw_line_node(&self, canvas: &skia_safe::Canvas, node: &LineNode) {
        let mut paint = cvt::sk_paint(&node.stroke, node.opacity, (node.size.width, 0.0));
        paint.set_stroke(true);
        paint.set_stroke_width(node.stroke_width);
        paint.set_blend_mode(node.blend_mode.into());
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            canvas.draw_line(
                Point::new(0.0, 0.0),
                Point::new(node.size.width, 0.0),
                &paint,
            );
        });
    }

    /// Draw a PathNode (SVG path data)
    pub fn draw_path_node(&self, canvas: &skia_safe::Canvas, node: &PathNode) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            // Build the Skia path from SVG data
            let path = skia_safe::path::Path::from_svg(&node.data).expect("invalid SVG path");

            // Compute bounding rect of path
            let bounds = path.compute_tight_bounds();
            let rect =
                Rect::from_xywh(bounds.left(), bounds.top(), bounds.width(), bounds.height());
            let radii = RectangularCornerRadius::zero(); // no corner radii for generic path

            // If there is an effect, wrap in apply_effect
            if let Some(effect) = &node.effect {
                self.apply_effect(canvas, effect, rect, &radii, || {
                    // Draw fill
                    let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                    fill_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &fill_paint);

                    // Draw stroke if needed
                    if node.stroke_width > 0.0 {
                        let mut stroke_paint =
                            cvt::sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                        stroke_paint.set_stroke(true);
                        stroke_paint.set_stroke_width(node.stroke_width);
                        stroke_paint.set_blend_mode(node.blend_mode.into());
                        canvas.draw_path(&path, &stroke_paint);
                    }
                });
            } else {
                // No effect: draw fill + stroke directly
                let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                fill_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &fill_paint);

                if node.stroke_width > 0.0 {
                    let mut stroke_paint = cvt::sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(node.stroke_width);
                    stroke_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &stroke_paint);
                }
            }
        });
    }

    /// Draw a PolygonNode (arbitrary polygon with optional corner radius)
    pub fn draw_polygon_node(&self, canvas: &skia_safe::Canvas, node: &PolygonNode) {
        if node.points.len() < 3 {
            return;
        }
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            // Build path
            let path = if node.corner_radius > 0.0 {
                node.to_path()
            } else {
                let mut p = skia_safe::path::Path::new();
                let mut iter = node.points.iter();
                if let Some(&pt) = iter.next() {
                    p.move_to((pt.x, pt.y));
                    for &pt in iter {
                        p.line_to((pt.x, pt.y));
                    }
                    p.close();
                }
                p
            };

            // Compute bounds + radii
            let bounds = path.compute_tight_bounds();
            let rect =
                Rect::from_xywh(bounds.left(), bounds.top(), bounds.width(), bounds.height());
            let radii = RectangularCornerRadius::all(node.corner_radius);

            // If effect, wrap
            if let Some(effect) = &node.effect {
                self.apply_effect(canvas, effect, rect, &radii, || {
                    // Draw fill
                    let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                    fill_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &fill_paint);

                    // Stroke
                    if node.stroke_width > 0.0 {
                        let mut stroke_paint =
                            cvt::sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                        stroke_paint.set_stroke(true);
                        stroke_paint.set_stroke_width(node.stroke_width);
                        stroke_paint.set_blend_mode(node.blend_mode.into());
                        canvas.draw_path(&path, &stroke_paint);
                    }
                });
            } else {
                // No effect
                let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                fill_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &fill_paint);

                if node.stroke_width > 0.0 {
                    let mut stroke_paint = cvt::sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(node.stroke_width);
                    stroke_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &stroke_paint);
                }
            }
        });
    }

    /// Draw a RegularPolygonNode by converting to a PolygonNode
    pub fn draw_regular_polygon_node(&self, canvas: &skia_safe::Canvas, node: &RegularPolygonNode) {
        let poly = node.to_polygon();
        self.draw_polygon_node(canvas, &poly);
    }

    /// Draw a RegularStarPolygonNode by converting to a PolygonNode
    pub fn draw_regular_star_polygon_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &RegularStarPolygonNode,
    ) {
        let poly = node.to_polygon();
        self.draw_polygon_node(canvas, &poly);
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
            skia_safe::font_style::Weight::from(node.text_style.font_weight.value()),
            skia_safe::font_style::Width::NORMAL,
            skia_safe::font_style::Slant::Upright,
        );
        ts.set_font_style(font_style);

        para_builder.push_style(&ts);
        para_builder.add_text(&node.text);
        let mut paragraph = para_builder.build();
        para_builder.pop();
        paragraph.layout(node.size.width);

        self.with_canvas_state(canvas, &node.transform.matrix, || {
            paragraph.paint(canvas, Point::new(0.0, 0.0));
        });
    }

    /// Dispatch to the correct node‐type draw method
    pub fn draw_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &Node,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
    ) {
        match node {
            Node::Group(n) => self.draw_group_node(canvas, n, repository, image_repository),
            Node::Container(n) => self.draw_container_node(canvas, n, repository, image_repository),
            Node::Rectangle(n) => self.draw_rect_node(canvas, n),
            Node::Ellipse(n) => self.draw_ellipse_node(canvas, n),
            Node::Polygon(n) => self.draw_polygon_node(canvas, n),
            Node::RegularPolygon(n) => self.draw_regular_polygon_node(canvas, n),
            Node::TextSpan(n) => self.draw_text_span_node(canvas, n),
            Node::Line(n) => self.draw_line_node(canvas, n),
            Node::Image(n) => self.draw_image_node(canvas, n, image_repository),
            Node::Path(n) => self.draw_path_node(canvas, n),
            Node::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(canvas, n),
        }
    }
}

pub struct Renderer {
    painter: Painter,
    backend: Option<Backend>,
    dpi: f32,
    logical_width: f32,
    logical_height: f32,
    camera: Option<Camera>,
    image_repository: ImageRepository,
    font_repository: FontRepository,
}

/// ---------------------------------------------------------------------------
/// Renderer: manages backend, DPI, camera, and iterates over scene children
/// ---------------------------------------------------------------------------

impl Renderer {
    pub fn new(width: f32, height: f32, dpi: f32) -> Self {
        let font_repository = FontRepository::new();
        Self {
            painter: Painter::new(&font_repository),
            backend: None,
            dpi,
            logical_width: width,
            logical_height: height,
            camera: None,
            image_repository: ImageRepository::new(),
            font_repository,
        }
    }

    pub fn set_logical_size(&mut self, width: f32, height: f32) {
        self.logical_width = width;
        self.logical_height = height;
    }

    pub fn init_raster(width: i32, height: i32) -> *mut Surface {
        let surface =
            surfaces::raster_n32_premul((width, height)).expect("Failed to create raster surface");
        Box::into_raw(Box::new(surface))
    }

    pub fn set_backend(&mut self, backend: Backend) {
        self.backend = Some(backend);
    }

    pub fn add_image(&mut self, src: String, image: Image) {
        self.image_repository.add(src, image);
    }

    pub fn add_font(&mut self, bytes: &[u8]) {
        self.font_repository.add(bytes);
    }

    pub fn flush(&self) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            if let Some(mut gr_context) = surface.recording_context() {
                if let Some(mut direct_context) = gr_context.as_direct_context() {
                    direct_context.flush_and_submit();
                }
            }
        }
    }

    pub fn free(&mut self) {
        if let Some(backend) = self.backend.take() {
            let surface = unsafe { Box::from_raw(backend.get_surface()) };
            if let Some(mut gr_context) = surface.recording_context() {
                if let Some(mut direct_context) = gr_context.as_direct_context() {
                    direct_context.abandon();
                }
            }
        }
    }

    pub fn set_camera(&mut self, camera: Camera) {
        self.camera = Some(camera);
    }

    // Record the scene content without any camera transforms
    pub fn record_scene(&self, scene: &Scene) -> Option<Picture> {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let mut recorder = PictureRecorder::new();

            // Use the surface dimensions for the recording bounds
            let bounds = Rect::new(0.0, 0.0, surface.width() as f32, surface.height() as f32);
            let canvas = recorder.begin_recording(bounds, None);

            // Apply DPI scaling only
            canvas.scale((self.dpi, self.dpi));

            // Render scene nodes directly (without camera transform)
            for child_id in &scene.children {
                self.render_node(child_id, &scene.nodes);
            }

            // End recording and return the picture
            recorder.finish_recording_as_picture(None)
        } else {
            None
        }
    }

    // Render the scene
    pub fn render_scene(&self, scene: &Scene) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let width = surface.width() as f32;
            let height = surface.height() as f32;
            let canvas = surface.canvas();
            canvas.save();

            // Scale to logical size
            let scale_x = self.logical_width / width;
            let scale_y = self.logical_height / height;
            canvas.scale((scale_x, scale_y));

            // Apply DPI scaling
            canvas.scale((self.dpi, self.dpi));

            // Apply camera transform if present
            if let Some(camera) = &self.camera {
                let view_matrix = camera.view_matrix();
                canvas.concat(&cvt::sk_matrix(view_matrix.matrix));

                // Apply zoom
                let zoom = camera.zoom;
                canvas.scale((zoom, zoom));
            }

            // Render scene nodes
            for child_id in &scene.children {
                self.render_node(child_id, &scene.nodes);
            }

            canvas.restore();
        }
    }

    fn render_node(&self, id: &NodeId, repository: &NodeRepository) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            if let Some(node) = repository.get(id) {
                self.painter
                    .draw_node(canvas, node, repository, &self.image_repository);
            }
        }
    }
}
