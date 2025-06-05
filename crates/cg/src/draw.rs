use crate::cvt;
use crate::schema::*;
use crate::{
    camera::Camera,
    repository::{FontRepository, ImageRepository, NodeRepository},
};
use skia_safe::{
    FontMgr, Image, ImageFilter, MaskFilter, Paint as SkPaint, Picture, PictureRecorder, Point,
    RRect, Rect, Surface,
    canvas::SaveLayerRec,
    surfaces,
    textlayout::{FontCollection, ParagraphBuilder, ParagraphStyle, TextStyle},
};
use std::collections::HashMap;

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

/// A painter that handles all drawing operations for nodes.
/// This struct is responsible for the actual painting operations,
/// while Renderer manages the high-level rendering flow.
pub struct Painter {
    font_collection: FontCollection,
}

impl Painter {
    pub fn new(font_repository: &FontRepository) -> Self {
        let mut font_collection = FontCollection::new();
        font_collection.set_default_font_manager(font_repository.font_mgr().clone(), None);

        Self { font_collection }
    }

    // --- Helper methods for internal use ---
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

    fn with_opacity_layer<F: FnOnce()>(&self, canvas: &skia_safe::Canvas, opacity: f32, f: F) {
        if opacity < 1.0 {
            canvas.save_layer_alpha(None, (opacity * 255.0) as u32);
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    fn draw_drop_shadow(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        shadow: &FilterEffect,
    ) {
        match shadow {
            FilterEffect::DropShadow(shadow) => {
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
                    let mut shadow_rect = rect;
                    shadow_rect.offset((offset_x, offset_y));
                    canvas.draw_rect(shadow_rect, &shadow_paint);
                }
            }
            FilterEffect::BackdropBlur(blur) => {
                self.draw_backdrop_blur(canvas, rect, radii, blur);
            }
            FilterEffect::GaussianBlur(blur) => {
                let mut paint = SkPaint::default();
                paint.set_anti_alias(true);
                paint.set_mask_filter(MaskFilter::blur(
                    skia_safe::BlurStyle::Normal,
                    blur.radius,
                    None,
                ));

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
                    canvas.draw_rrect(rrect, &paint);
                } else {
                    canvas.draw_rect(rect, &paint);
                }
            }
        }
    }

    fn draw_backdrop_blur(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        blur: &FeBackdropBlur,
    ) {
        // Create a layer for the backdrop blur effect
        let mut paint = SkPaint::default();
        paint.set_mask_filter(MaskFilter::blur(
            skia_safe::BlurStyle::Normal,
            blur.radius,
            None,
        ));

        // Save the current canvas state
        canvas.save();

        // Apply rounded corners if needed
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
            canvas.clip_rrect(rrect, None, true);
        } else {
            canvas.clip_rect(rect, None, true);
        }

        // Create a layer for the blur effect
        canvas.save_layer_alpha(None, 255);

        // Draw the blurred content
        canvas.draw_rect(rect, &paint);

        // Restore the canvas state
        canvas.restore();
        canvas.restore();
    }

    fn draw_fill_and_stroke(
        &self,
        canvas: &skia_safe::Canvas,
        rect: Rect,
        radii: &RectangularCornerRadius,
        fill: &Paint,
        stroke: Option<&Paint>,
        stroke_width: f32,
        blend_mode: crate::schema::BlendMode,
        opacity: f32,
    ) {
        let RectangularCornerRadius { tl, tr, bl, br } = *radii;
        let mut fill_paint = cvt::sk_paint(fill, opacity, (rect.width(), rect.height()));
        fill_paint.set_blend_mode(blend_mode.into());
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
            canvas.draw_rrect(rrect, &fill_paint);
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
            canvas.draw_rect(rect, &fill_paint);
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

    // --- Node drawing methods ---
    pub fn draw_rect_node(&self, canvas: &skia_safe::Canvas, node: &RectangleNode) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let radii = node.corner_radius;
            if let Some(FilterEffect::GaussianBlur(blur)) = &node.effect {
                // First draw the content
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

                // Then apply the blur filter
                let image_filter =
                    skia_safe::image_filters::blur((blur.radius, blur.radius), None, None, None);
                let mut paint = SkPaint::default();
                paint.set_image_filter(image_filter);
                canvas.draw_rect(rect, &paint);
            } else {
                if let Some(effect) = &node.effect {
                    self.draw_drop_shadow(canvas, rect, &radii, effect);
                }
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

    pub fn draw_container_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &ContainerNode,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
    ) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            self.with_opacity_layer(canvas, node.opacity, || {
                let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
                let radii = node.corner_radius;
                if let Some(effect) = &node.effect {
                    self.draw_drop_shadow(canvas, rect, &radii, effect);
                }
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
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node(canvas, child, repository, image_repository);
                    }
                }
            });
        });
    }

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
                if let Some(effect) = &node.effect {
                    self.draw_drop_shadow(canvas, rect, &radii, effect);
                }
                // Draw the image (with optional rounded corners)
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
                // Draw stroke if stroke_width > 0
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
        }
    }

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

    pub fn draw_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &Node,
        repository: &NodeRepository,
        image_repository: &ImageRepository,
    ) {
        match node {
            Node::Group(node) => self.draw_group_node(canvas, node, repository, image_repository),
            Node::Container(node) => {
                self.draw_container_node(canvas, node, repository, image_repository)
            }
            Node::Rectangle(node) => self.draw_rect_node(canvas, node),
            Node::Ellipse(node) => self.draw_ellipse_node(canvas, node),
            Node::Polygon(node) => self.draw_polygon_node(canvas, node),
            Node::RegularPolygon(node) => self.draw_regular_polygon_node(canvas, node),
            Node::TextSpan(node) => self.draw_text_span_node(canvas, node),
            Node::Line(node) => self.draw_line_node(canvas, node),
            Node::Image(node) => self.draw_image_node(canvas, node, image_repository),
            Node::Path(node) => self.draw_path_node(canvas, node),
            Node::RegularStarPolygon(node) => self.draw_regular_star_polygon_node(canvas, node),
        }
    }

    pub fn draw_ellipse_node(&self, canvas: &skia_safe::Canvas, node: &EllipseNode) {
        let fill_paint = cvt::sk_paint(
            &node.fill,
            node.opacity,
            (node.size.width, node.size.height),
        );
        let rect = Rect::from_xywh(
            0.0, // x starts at 0 (top-left)
            0.0, // y starts at 0 (top-left)
            node.size.width,
            node.size.height,
        );
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            // Draw fill
            let mut fill_paint = fill_paint.clone();
            fill_paint.set_blend_mode(node.blend_mode.into());
            canvas.draw_oval(rect, &fill_paint);
            // Draw stroke if stroke_width > 0
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

    pub fn draw_path_node(&self, canvas: &skia_safe::Canvas, node: &PathNode) {
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            let path = skia_safe::path::Path::from_svg(&node.data).expect("path is not valid");

            let fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
            if node.stroke_width > 0.0 {
                let mut stroke_paint = cvt::sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                canvas.draw_path(&path, &stroke_paint);
            }

            canvas.draw_path(&path, &fill_paint);
        });
    }

    pub fn draw_polygon_node(&self, canvas: &skia_safe::Canvas, node: &PolygonNode) {
        if node.points.len() < 3 {
            // Not enough points to form a polygon
            return;
        }
        let fill_paint = cvt::sk_paint(&node.fill, node.opacity, (1.0, 1.0));
        self.with_canvas_state(canvas, &node.transform.matrix, || {
            // If corner_radius > 0, use the rounded polygon path
            let path = if node.corner_radius > 0.0 {
                node.to_path()
            } else {
                // Otherwise create a regular polygon path
                let mut path = skia_safe::Path::new();
                let mut points_iter = node.points.iter();
                if let Some(&point) = points_iter.next() {
                    path.move_to((point.x, point.y));
                    for point in points_iter {
                        path.line_to((point.x, point.y));
                    }
                    path.close();
                }
                path
            };

            // Draw fill
            let mut fill_paint = fill_paint.clone();
            fill_paint.set_blend_mode(node.blend_mode.into());
            canvas.draw_path(&path, &fill_paint);

            // Draw stroke if stroke_width > 0
            if node.stroke_width > 0.0 {
                let mut stroke_paint = cvt::sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                stroke_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &stroke_paint);
            }
        });
    }

    pub fn draw_regular_polygon_node(&self, canvas: &skia_safe::Canvas, node: &RegularPolygonNode) {
        let poly = node.to_polygon();
        self.draw_polygon_node(canvas, &poly);
    }

    pub fn draw_regular_star_polygon_node(
        &self,
        canvas: &skia_safe::Canvas,
        node: &RegularStarPolygonNode,
    ) {
        let poly = node.to_polygon();
        self.draw_polygon_node(canvas, &poly);
    }

    pub fn draw_text_span_node(&self, canvas: &skia_safe::Canvas, node: &TextSpanNode) {
        // paints
        let mut fill_paint = cvt::sk_paint(
            &node.fill,
            node.opacity,
            (node.size.width, node.size.height),
        );
        fill_paint.set_blend_mode(node.blend_mode.into());

        // paragraph
        let mut paragraph_style = ParagraphStyle::new();
        paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(node.text_align.into());
        let mut paragraph_builder = ParagraphBuilder::new(&paragraph_style, &self.font_collection);

        // text style
        let mut ts = TextStyle::new();
        ts.set_foreground_paint(&fill_paint);
        ts.set_font_size(node.text_style.font_size);
        if let Some(letter_spacing) = node.text_style.letter_spacing {
            ts.set_letter_spacing(letter_spacing);
        }
        if let Some(line_height) = node.text_style.line_height {
            ts.set_height(line_height);
        }
        let mut decoration = skia_safe::textlayout::Decoration::default();
        decoration.ty = node.text_style.text_decoration.into();
        ts.set_decoration(&decoration);
        ts.set_font_families(&[&node.text_style.font_family]);

        let font_style = skia_safe::FontStyle::new(
            skia_safe::font_style::Weight::from(node.text_style.font_weight.value()),
            skia_safe::font_style::Width::NORMAL,
            skia_safe::font_style::Slant::Upright,
        );
        ts.set_font_style(font_style);

        // paragraph builder
        paragraph_builder.push_style(&ts);
        paragraph_builder.add_text(&node.text);
        let mut paragraph = paragraph_builder.build();
        paragraph_builder.pop();
        paragraph.layout(node.size.width);

        self.with_canvas_state(canvas, &node.transform.matrix, || {
            // Paint at origin since transform is already applied
            paragraph.paint(canvas, Point::new(0.0, 0.0));
        });
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
