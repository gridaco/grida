use crate::cvt;
use crate::schema::*;
use crate::{
    camera::Camera2D,
    geometry_cache::GeometryCache,
    rect,
    repository::{FontRepository, ImageRepository, NodeRepository},
    scene_cache, visibility,
};
use skia_safe::{
    canvas::SaveLayerRec, surfaces, textlayout::*, ClipOp, Image, Paint as SkPaint, Path, Picture,
    PictureRecorder, Point, RRect, Rect, Surface,
};
use skia_safe::{op, PathOp};

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

    /// If opacity < 1.0, wrap drawing in a save_layer_alpha; else draw directly.
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
        let image_filter = skia_safe::image_filters::blur((radius, radius), None, None, None);
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
            canvas.draw_rrect(rrect, &shadow_paint);
        } else {
            // Regular rect shadow
            canvas.draw_rect(rect, &shadow_paint);
        }
    }

    /// Draw a backdrop blur: blur what's behind `rect`, clipped to a rounded‐corner area.
    fn draw_backdrop_blur(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        blur: &FeBackdropBlur,
    ) {
        // 1) Build a Gaussian‐blur filter for the backdrop
        let image_filter =
            skia_safe::image_filters::blur((blur.radius, blur.radius), None, None, None).unwrap();

        // 2) Clip to the shape (rounded rect or plain rect)
        let RectangularCornerRadius { tl, tr, bl, br } = *radii;
        canvas.save();
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
            canvas.clip_rrect(rrect, None, true);
        } else {
            canvas.clip_rect(rect, None, true);
        }

        // 3) Use a SaveLayerRec with a backdrop filter so that everything behind is blurred
        let layer_rec = SaveLayerRec::default().backdrop(&image_filter);
        canvas.save_layer(&layer_rec);

        // We don't draw any content here—just pushing and popping the layer
        canvas.restore(); // pop the SaveLayer
        canvas.restore(); // pop the clip
    }

    /// Draw fill and stroke for a shape at `rect` with `radii`, using given paints.
    fn draw_fill_and_stroke(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        fill: Option<&Paint>,
        stroke: Option<&Paint>,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
        blend_mode: BlendMode,
        opacity: f32,
        image_repository: &ImageRepository,
    ) {
        let RectangularCornerRadius { tl, tr, bl, br } = *radii;

        // Draw fill if present
        if let Some(fill) = fill {
            let (mut fill_paint, image) = match fill {
                Paint::Image(image_paint) => {
                    if let Some(image) = image_repository.get(&image_paint._ref) {
                        let mut paint = SkPaint::default();
                        paint.set_anti_alias(true);
                        paint.set_blend_mode(blend_mode.into());
                        paint.set_alpha((opacity * 255.0) as u8);
                        (paint, Some(image))
                    } else {
                        // Image not ready - skip fill but continue to draw stroke
                        (SkPaint::default(), None)
                    }
                }
                _ => (
                    cvt::sk_paint(fill, opacity, (rect.width(), rect.height())),
                    None,
                ),
            };
            fill_paint.set_blend_mode(blend_mode.into());

            // Calculate stroke offset based on alignment
            let stroke_offset = match stroke_align {
                StrokeAlign::Inside => 0.0,
                StrokeAlign::Center => stroke_width / 2.0,
                StrokeAlign::Outside => stroke_width,
            };

            // Adjust rect for stroke alignment
            let adjusted_rect = if stroke_offset > 0.0 {
                Rect::new(
                    rect.left() - stroke_offset,
                    rect.top() - stroke_offset,
                    rect.right() + stroke_offset,
                    rect.bottom() + stroke_offset,
                )
            } else {
                rect
            };

            if let Some(image) = image {
                if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                    // Rounded rect fill (image)
                    let rrect = RRect::new_rect_radii(
                        adjusted_rect,
                        &[
                            Point::new(tl, tl),
                            Point::new(tr, tr),
                            Point::new(br, br),
                            Point::new(bl, bl),
                        ],
                    );
                    canvas.save();
                    canvas.clip_rrect(rrect, None, true);
                    canvas.draw_image_rect(image, None, adjusted_rect, &fill_paint);
                    canvas.restore();
                } else {
                    // Regular rect fill (image)
                    canvas.draw_image_rect(image, None, adjusted_rect, &fill_paint);
                }
            } else {
                // Non-image paint: draw with fill_paint
                if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                    let rrect = RRect::new_rect_radii(
                        adjusted_rect,
                        &[
                            Point::new(tl, tl),
                            Point::new(tr, tr),
                            Point::new(br, br),
                            Point::new(bl, bl),
                        ],
                    );
                    canvas.draw_rrect(rrect, &fill_paint);
                } else {
                    canvas.draw_rect(adjusted_rect, &fill_paint);
                }
            }
        }

        // Draw stroke if present
        if let Some(stroke) = stroke {
            if stroke_width > 0.0 {
                let (mut stroke_paint, stroke_image) = match stroke {
                    Paint::Image(image_paint) => {
                        if let Some(image) = image_repository.get(&image_paint._ref) {
                            let mut paint = SkPaint::default();
                            paint.set_anti_alias(true);
                            paint.set_blend_mode(blend_mode.into());
                            paint.set_alpha((opacity * 255.0) as u8);
                            paint.set_stroke(true);
                            paint.set_stroke_width(stroke_width);
                            (paint, Some(image))
                        } else {
                            // Image not ready - skip stroke
                            return;
                        }
                    }
                    _ => (
                        cvt::sk_paint_with_stroke(
                            stroke,
                            opacity,
                            (rect.width(), rect.height()),
                            stroke_width,
                            stroke_align,
                            stroke_dash_array,
                        ),
                        None,
                    ),
                };
                stroke_paint.set_blend_mode(blend_mode.into());

                if let Some(image) = stroke_image {
                    // --- CLIP TO STROKE BORDER ---
                    canvas.save();
                    if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                        // Rounded rect border
                        let rrect_outer = RRect::new_rect_radii(
                            rect,
                            &[
                                Point::new(tl, tl),
                                Point::new(tr, tr),
                                Point::new(br, br),
                                Point::new(bl, bl),
                            ],
                        );
                        let mut outer_path = Path::new();
                        outer_path.add_rrect(rrect_outer, None);
                        canvas.clip_path(&outer_path, ClipOp::Intersect, true);

                        // Calculate inner radii (subtract stroke width, but clamp to 0)
                        let inner_tl = (tl - stroke_width).max(0.0);
                        let inner_tr = (tr - stroke_width).max(0.0);
                        let inner_bl = (bl - stroke_width).max(0.0);
                        let inner_br = (br - stroke_width).max(0.0);
                        let inner_rect = Rect::new(
                            rect.left() + stroke_width,
                            rect.top() + stroke_width,
                            rect.right() - stroke_width,
                            rect.bottom() - stroke_width,
                        );
                        let rrect_inner = RRect::new_rect_radii(
                            inner_rect,
                            &[
                                Point::new(inner_tl, inner_tl),
                                Point::new(inner_tr, inner_tr),
                                Point::new(inner_br, inner_br),
                                Point::new(inner_bl, inner_bl),
                            ],
                        );
                        let mut inner_path = Path::new();
                        inner_path.add_rrect(rrect_inner, None);
                        canvas.clip_path(&inner_path, ClipOp::Difference, true);
                        canvas.draw_image_rect(image, None, rect, &stroke_paint);
                    } else {
                        // Regular rect border
                        let outer = rect;
                        let mut outer_path = Path::new();
                        outer_path.add_rect(outer, None);
                        canvas.clip_path(&outer_path, ClipOp::Intersect, true);

                        let inner = Rect::new(
                            rect.left() + stroke_width,
                            rect.top() + stroke_width,
                            rect.right() - stroke_width,
                            rect.bottom() - stroke_width,
                        );
                        let mut inner_path = Path::new();
                        inner_path.add_rect(inner, None);
                        canvas.clip_path(&inner_path, ClipOp::Difference, true);
                        canvas.draw_image_rect(image, None, rect, &stroke_paint);
                    }
                    canvas.restore();
                } else {
                    // Non-image stroke
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
                        canvas.draw_rrect(rrect, &stroke_paint);
                    } else {
                        canvas.draw_rect(rect, &stroke_paint);
                    }
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

    /// Helper method to apply clipping to a region with optional corner radius
    fn with_clip<F: FnOnce()>(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        f: F,
    ) {
        canvas.save();
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
            canvas.clip_rrect(rrect, None, true);
        } else {
            canvas.clip_rect(rect, None, true);
        }
        f();
        canvas.restore();
    }

    fn build_path_from_node(&self, node: &Node, repository: &NodeRepository) -> Option<Path> {
        match node {
            Node::Rectangle(n) => {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                let mut path = Path::new();
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
                    path.add_rrect(rrect, None);
                } else {
                    path.add_rect(rect, None);
                }
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::Ellipse(n) => {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                let mut path = Path::new();
                path.add_oval(rect, None);
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::Polygon(n) => {
                let mut path = if n.corner_radius > 0.0 {
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
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::RegularPolygon(n) => {
                let poly = n.to_polygon();
                self.build_path_from_node(&Node::Polygon(poly), repository)
            }
            Node::RegularStarPolygon(n) => {
                let poly = n.to_polygon();
                self.build_path_from_node(&Node::Polygon(poly), repository)
            }
            Node::Line(n) => {
                let mut path = Path::new();
                path.move_to((0.0, 0.0));
                path.line_to((n.size.width, 0.0));
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::Path(n) => {
                if let Some(mut path) = Path::from_svg(&n.data) {
                    path.transform(&cvt::sk_matrix(n.transform.matrix));
                    Some(path)
                } else {
                    None
                }
            }
            Node::Container(n) => {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                let mut path = Path::new();
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
                    path.add_rrect(rrect, None);
                } else {
                    path.add_rect(rect, None);
                }
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::Group(g) => {
                let mut result: Option<Path> = None;
                for child_id in &g.children {
                    if let Some(child) = repository.get(child_id) {
                        if let Some(p) = self.build_path_from_node(child, repository) {
                            result = Some(match result {
                                Some(acc) => op(&acc, &p, PathOp::Union).unwrap(),
                                None => p,
                            });
                        }
                    }
                }
                if let Some(mut path) = result {
                    path.transform(&cvt::sk_matrix(g.transform.matrix));
                    Some(path)
                } else {
                    None
                }
            }
            Node::BooleanOperation(b) => {
                let mut result: Option<Path> = None;
                for child_id in &b.children {
                    if let Some(child) = repository.get(child_id) {
                        if let Some(p) = self.build_path_from_node(child, repository) {
                            result = Some(match result {
                                Some(acc) => op(&acc, &p, b.op.clone().into()).unwrap(),
                                None => p,
                            });
                        }
                    }
                }
                result
            }
            Node::Image(n) => {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                let mut path = Path::new();
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
                    path.add_rrect(rrect, None);
                } else {
                    path.add_rect(rect, None);
                }
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::Error(n) => {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                let mut path = Path::new();
                path.add_rect(rect, None);
                path.transform(&cvt::sk_matrix(n.transform.matrix));
                Some(path)
            }
            Node::TextSpan(_) => None,
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
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let radii = node.corner_radius;

            if let Some(effect) = &node.effect {
                self.apply_effect(canvas, effect, rect, &radii, || {
                    self.draw_fill_and_stroke(
                        canvas,
                        rect,
                        &radii,
                        Some(&node.fill),
                        Some(&node.stroke),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                        node.blend_mode,
                        node.opacity,
                        image_repository,
                    );
                });
            } else {
                self.draw_fill_and_stroke(
                    canvas,
                    rect,
                    &radii,
                    Some(&node.fill),
                    Some(&node.stroke),
                    node.stroke_width,
                    node.stroke_align,
                    node.stroke_dash_array.as_ref(),
                    node.blend_mode,
                    node.opacity,
                    image_repository,
                );
            }
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
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            self.with_opacity_layer(canvas, node.opacity, || {
                let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
                let radii = node.corner_radius;

                // Draw effects first (if any) - these won't be clipped
                if let Some(effect) = &node.effect {
                    self.apply_effect(canvas, effect, rect, &radii, || {
                        self.draw_fill_and_stroke(
                            canvas,
                            rect,
                            &radii,
                            Some(&node.fill),
                            node.stroke.as_ref(),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                            node.blend_mode,
                            node.opacity,
                            image_repository,
                        );
                    });
                } else {
                    self.draw_fill_and_stroke(
                        canvas,
                        rect,
                        &radii,
                        Some(&node.fill),
                        node.stroke.as_ref(),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                        node.blend_mode,
                        node.opacity,
                        image_repository,
                    );
                }

                // Draw children with clipping if enabled
                if node.clip {
                    self.with_clip(canvas, rect, &radii, || {
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
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let radii = node.corner_radius;

            if let Some(image) = image_repository.get(&node._ref) {
                // Image is ready - draw it
                if let Some(effect) = &node.effect {
                    self.apply_effect(canvas, effect, rect, &radii, || {
                        // Draw the image with rounded‐rect clipping
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
                                None,
                                Some(&node.stroke),
                                node.stroke_width,
                                node.stroke_align,
                                node.stroke_dash_array.as_ref(),
                                node.blend_mode,
                                node.opacity,
                                image_repository,
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
                            None,
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                            node.blend_mode,
                            node.opacity,
                            image_repository,
                        );
                    }
                }
            } else {
                // Image is not ready - draw only stroke and effects
                if let Some(effect) = &node.effect {
                    self.apply_effect(canvas, effect, rect, &radii, || {
                        // Draw only stroke with transparent fill
                        self.draw_fill_and_stroke(
                            canvas,
                            rect,
                            &radii,
                            None,
                            Some(&node.stroke),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                            node.blend_mode,
                            node.opacity,
                            image_repository,
                        );
                    });
                } else {
                    // Draw only stroke without effects
                    self.draw_fill_and_stroke(
                        canvas,
                        rect,
                        &radii,
                        None,
                        Some(&node.stroke),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                        node.blend_mode,
                        node.opacity,
                        image_repository,
                    );
                }
            }
        });
        true
    }

    pub fn draw_error_node(&self, canvas: &skia_safe::Canvas, node: &ErrorNode) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let radii = RectangularCornerRadius::zero();

            // Create a red fill paint
            let fill = Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 51), // Semi-transparent red
                opacity: 1.0,
            });
            let stroke = Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 255), // Solid red
                opacity: 1.0,
            });

            self.draw_fill_and_stroke(
                canvas,
                rect,
                &radii,
                Some(&fill),
                Some(&stroke),
                1.0, // stroke width
                StrokeAlign::Inside,
                None, // no dash array
                BlendMode::Normal,
                node.opacity,
                &ImageRepository::new(),
            );
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
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            self.with_opacity_layer(canvas, node.opacity, || {
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
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);

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
        let mut paint = cvt::sk_paint_with_stroke(
            &node.stroke,
            node.opacity,
            (node.size.width, 0.0),
            node.stroke_width,
            node.stroke_align,
            node.stroke_dash_array.as_ref(),
        );
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

            // Calculate stroke offset based on alignment
            let stroke_offset = match node.stroke_align {
                StrokeAlign::Inside => 0.0,
                StrokeAlign::Center => node.stroke_width / 2.0,
                StrokeAlign::Outside => node.stroke_width,
            };

            // Adjust rect for stroke alignment
            let adjusted_rect = if stroke_offset > 0.0 {
                Rect::new(
                    rect.left() - stroke_offset,
                    rect.top() - stroke_offset,
                    rect.right() + stroke_offset,
                    rect.bottom() + stroke_offset,
                )
            } else {
                rect
            };

            if let Some(effect) = &node.effect {
                self.apply_effect(canvas, effect, adjusted_rect, &radii, || {
                    // Draw fill
                    let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                    fill_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &fill_paint);

                    // Draw stroke if needed
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
            } else {
                // No effect: draw fill + stroke directly
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

            // Calculate stroke offset based on alignment
            let stroke_offset = match node.stroke_align {
                StrokeAlign::Inside => 0.0,
                StrokeAlign::Center => node.stroke_width / 2.0,
                StrokeAlign::Outside => node.stroke_width,
            };

            // Adjust rect for stroke alignment
            let adjusted_rect = if stroke_offset > 0.0 {
                Rect::new(
                    rect.left() - stroke_offset,
                    rect.top() - stroke_offset,
                    rect.right() + stroke_offset,
                    rect.bottom() + stroke_offset,
                )
            } else {
                rect
            };

            if let Some(effect) = &node.effect {
                self.apply_effect(canvas, effect, adjusted_rect, &radii, || {
                    // Draw fill
                    let mut fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
                    fill_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_path(&path, &fill_paint);

                    // Stroke
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
            } else {
                // No effect
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
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            if let Some(path) =
                self.build_path_from_node(&Node::BooleanOperation(node.clone()), repository)
            {
                let bounds = path.compute_tight_bounds();
                let rect =
                    Rect::from_xywh(bounds.left(), bounds.top(), bounds.width(), bounds.height());
                let radii = RectangularCornerRadius::zero();

                if let Some(effect) = &node.effect {
                    self.apply_effect(canvas, effect, rect, &radii, || {
                        self.draw_fill_and_stroke(
                            canvas,
                            rect,
                            &radii,
                            Some(&node.fill),
                            node.stroke.as_ref(),
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                            node.blend_mode,
                            node.opacity,
                            image_repository,
                        );
                    });
                } else {
                    self.draw_fill_and_stroke(
                        canvas,
                        rect,
                        &radii,
                        Some(&node.fill),
                        node.stroke.as_ref(),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                        node.blend_mode,
                        node.opacity,
                        image_repository,
                    );
                }
            }
            // draw children individually if visibility check passes
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
            crate::text_transform::transform_text(&node.text, node.text_style.text_transform);
        para_builder.add_text(&transformed_text);
        let mut paragraph = para_builder.build();
        para_builder.pop();
        paragraph.layout(node.size.width);

        self.with_canvas_state(canvas, &node.transform.matrix, || {
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

pub struct Renderer {
    painter: Painter,
    backend: Option<Backend>,
    dpi: f32,
    logical_width: f32,
    logical_height: f32,
    camera: Option<Camera2D>,
    pub image_repository: ImageRepository,
    pub font_repository: FontRepository,
    geometry_cache: GeometryCache,
    scene_cache: scene_cache::SceneCache,
    pub feature_visibility_culling_enabled: bool,
}

/// ---------------------------------------------------------------------------
/// Renderer: manages backend, DPI, camera, and iterates over scene children
/// ---------------------------------------------------------------------------

impl Renderer {
    pub fn new(width: f32, height: f32, dpi: f32) -> Self {
        let font_repository = FontRepository::new();
        let image_repository = ImageRepository::new();
        Self {
            painter: Painter::new(&font_repository, &image_repository),
            backend: None,
            dpi,
            logical_width: width,
            logical_height: height,
            camera: None,
            image_repository,
            font_repository,
            geometry_cache: GeometryCache::new(),
            scene_cache: scene_cache::SceneCache::new(),
            feature_visibility_culling_enabled: false,
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

    pub fn register_image(&mut self, src: String, image: Image) {
        self.image_repository.add(src, image);
    }

    pub fn add_font(&mut self, family: &str, bytes: &[u8]) {
        self.font_repository.add(bytes, family);
        self.painter.refresh_fonts(&self.font_repository);
    }

    /// Create an image from raw encoded bytes.
    pub fn create_image(&self, bytes: &[u8]) -> Option<Image> {
        let data = skia_safe::Data::new_copy(bytes);
        Image::from_encoded(data)
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

    pub fn set_camera(&mut self, camera: Camera2D) {
        self.camera = Some(camera);
    }

    /// Record and store the entire scene into the internal cache.
    /// This assumes the scene is static and only the camera transforms at runtime.
    pub fn cache_scene(&mut self, scene: &Scene) {
        if let Some(picture) = self.record_scene(scene) {
            self.scene_cache.set_picture(picture);
        }
    }

    /// Clear the cached scene picture.
    pub fn invalidate_cache(&mut self) {
        self.scene_cache.invalidate();
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
    pub fn render_scene(&mut self, scene: &Scene) {
        if let Some(backend) = &self.backend {
            // Fast path: use cached picture when available
            if let Some(picture) = self.scene_cache.get_picture() {
                let surface = unsafe { &mut *backend.get_surface() };
                let width = surface.width() as f32;
                let height = surface.height() as f32;
                let canvas = surface.canvas();
                canvas.save();

                if let Some(bg_color) = scene.background_color {
                    let Color(r, g, b, a) = bg_color;
                    let color = skia_safe::Color::from_argb(a, r, g, b);
                    let mut paint = SkPaint::default();
                    paint.set_color(color);
                    canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
                }

                let scale_x = self.logical_width / width;
                let scale_y = self.logical_height / height;
                canvas.scale((scale_x, scale_y));
                canvas.scale((self.dpi, self.dpi));

                if let Some(camera) = &self.camera {
                    let view_matrix = camera.view_matrix();
                    canvas.concat(&cvt::sk_matrix(view_matrix.matrix));
                    let zoom = camera.zoom;
                    canvas.scale((zoom, zoom));
                }

                canvas.draw_picture(picture, None, None);
                canvas.restore();
                return;
            }

            self.geometry_cache = GeometryCache::from_scene(scene);
            let surface = unsafe { &mut *backend.get_surface() };
            let width = surface.width() as f32;
            let height = surface.height() as f32;
            let canvas = surface.canvas();
            canvas.save();

            // Paint background color first if present
            if let Some(bg_color) = scene.background_color {
                let Color(r, g, b, a) = bg_color;
                let color = skia_safe::Color::from_argb(a, r, g, b);
                let mut paint = SkPaint::default();
                paint.set_color(color);
                // Paint the entire canvas with the background color
                canvas.draw_rect(Rect::new(0.0, 0.0, width, height), &paint);
            }

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
            // Get viewport in world space from camera and apply DPI scaling
            let viewport = self.camera.as_ref().map_or_else(
                || rect::Rect::new(0.0, 0.0, self.logical_width, self.logical_height),
                |camera| {
                    let mut rect = camera.rect();

                    // Add margin for debugging visibility culling
                    rect.margin(1000.0);

                    // Scale by DPI to match the rendering scale
                    rect = rect::Rect::new(
                        rect.min_x * self.dpi,
                        rect.min_y * self.dpi,
                        rect.max_x * self.dpi,
                        rect.max_y * self.dpi,
                    );
                    rect
                },
            );

            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            if let Some(node) = repository.get(id) {
                let geometry_cache = &self.geometry_cache;
                let should_draw: Box<dyn Fn(&NodeId) -> bool> =
                    if self.feature_visibility_culling_enabled {
                        Box::new(move |id: &NodeId| {
                            visibility::is_node_visible(geometry_cache, id, &viewport)
                        })
                    } else {
                        Box::new(|_id: &NodeId| true) // Always draw when culling is disabled
                    };
                self.painter.draw_node(
                    canvas,
                    node,
                    repository,
                    &self.image_repository,
                    &should_draw,
                );
            }
        }
    }
}
