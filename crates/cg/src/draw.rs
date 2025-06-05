use crate::repository::NodeRepository;
use crate::schema::{
    BlendMode, Color as SchemaColor, ContainerNode, EllipseNode, FilterEffect, FontWeight,
    GradientStop, GroupNode, ImageNode, LineNode, Node, NodeId, Paint, PathNode, PolygonNode,
    RectangleNode, RectangularCornerRadius, RegularPolygonNode, RegularStarPolygonNode, Scene,
    TextAlign, TextAlignVertical, TextDecoration, TextNode, TextSpanNode,
};
use skia_safe::{
    Color, Font, FontMgr, FontStyle, Image, MaskFilter, Paint as SkiaPaint, Point, RRect, Rect,
    Shader, Surface, TextBlob, Typeface, surfaces,
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

pub struct Renderer {
    image_cache: HashMap<String, Image>,
    backend: Option<Backend>,
    font_mgr: FontMgr,
    font_collection: FontCollection,
    dpi: f32,
}

impl Renderer {
    pub fn new(dpi: f32) -> Self {
        let mut font_collection = FontCollection::new();
        let font_mgr = FontMgr::new();
        font_collection.set_default_font_manager(font_mgr.clone(), None);

        Self {
            image_cache: HashMap::new(),
            backend: None,
            font_collection,
            font_mgr,
            dpi,
        }
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
        self.image_cache.insert(src, image);
    }

    pub fn add_font(&mut self, bytes: &[u8]) {
        self.font_mgr.new_from_data(bytes, None);
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

    pub fn render_scene(&self, scene: &Scene) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            canvas.save();
            canvas.scale((self.dpi, self.dpi));
            for child_id in &scene.children {
                self.render_node(child_id, &scene.nodes);
            }
            canvas.restore();
        }
    }

    pub fn render_node(&self, id: &NodeId, repository: &NodeRepository) {
        let node = match repository.get(id) {
            Some(node) => node,
            None => return,
        };

        match node {
            Node::Group(node) => self.draw_group_node(node, repository),
            Node::Container(node) => self.draw_container_node(node, repository),
            Node::Rectangle(node) => self.draw_rect_node(node),
            Node::Ellipse(node) => self.draw_ellipse_node(node),
            Node::Polygon(node) => self.draw_polygon_node(node),
            Node::RegularPolygon(node) => self.draw_regular_polygon_node(node),
            Node::TextSpan(node) => self.draw_text_span_node(node),
            Node::Line(node) => self.draw_line_node(node),
            Node::Image(node) => self.draw_image_node(node),
            Node::Path(node) => self.draw_path_node(node),
            Node::RegularStarPolygon(node) => self.draw_regular_star_polygon_node(node),
        }
    }

    pub fn draw_rect(&self, x: f32, y: f32, w: f32, h: f32, r: f32, g: f32, b: f32, a: f32) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();

            let color = Color::from_argb(
                (a * 255.0) as u8,
                (r * 255.0) as u8,
                (g * 255.0) as u8,
                (b * 255.0) as u8,
            );

            let mut paint = SkiaPaint::default();
            paint.set_color(color);

            canvas.draw_rect(Rect::from_xywh(x, y, w, h), &paint);
        }
    }

    pub fn draw_rect_node(&self, node: &RectangleNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            let paint = sk_paint(
                &node.fill,
                node.opacity,
                (node.size.width, node.size.height),
            );
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let RectangularCornerRadius { tl, tr, bl, br } = node.corner_radius;
            // Draw drop shadow effect if present
            if let Some(FilterEffect::DropShadow(shadow)) = &node.effect {
                let mut shadow_paint = SkiaPaint::default();
                let SchemaColor(r, g, b, a) = shadow.color;
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
                if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                    let rrect = RRect::new_rect_radii(
                        rect,
                        &[
                            Point::new(tl, tl), // top-left
                            Point::new(tr, tr), // top-right
                            Point::new(br, br), // bottom-right
                            Point::new(bl, bl), // bottom-left
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
            // Draw fill and stroke as before
            if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(tl, tl), // top-left
                        Point::new(tr, tr), // top-right
                        Point::new(br, br), // bottom-right
                        Point::new(bl, bl), // bottom-left
                    ],
                );
                let mut fill_paint = paint.clone();
                fill_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_rrect(rrect, &fill_paint);
                // Draw stroke if stroke_width > 0
                if node.stroke_width > 0.0 {
                    let mut stroke_paint = sk_paint(
                        &node.stroke,
                        node.opacity,
                        (node.size.width, node.size.height),
                    );
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(node.stroke_width);
                    stroke_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_rrect(rrect, &stroke_paint);
                }
            } else {
                let mut fill_paint = paint.clone();
                fill_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_rect(rect, &fill_paint);
                // Draw stroke if stroke_width > 0
                if node.stroke_width > 0.0 {
                    let mut stroke_paint = sk_paint(
                        &node.stroke,
                        node.opacity,
                        (node.size.width, node.size.height),
                    );
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(node.stroke_width);
                    stroke_paint.set_blend_mode(node.blend_mode.into());
                    canvas.draw_rect(rect, &stroke_paint);
                }
            }
            canvas.restore();
        }
    }

    pub fn draw_ellipse(&self, x: f32, y: f32, rx: f32, ry: f32, r: f32, g: f32, b: f32, a: f32) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();

            let color = Color::from_argb(
                (a * 255.0) as u8,
                (r * 255.0) as u8,
                (g * 255.0) as u8,
                (b * 255.0) as u8,
            );

            let mut paint = SkiaPaint::default();
            paint.set_color(color);

            canvas.draw_oval(Rect::from_xywh(x - rx, y - ry, rx * 2.0, ry * 2.0), &paint);
        }
    }

    pub fn draw_ellipse_node(&self, node: &EllipseNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            let fill_paint = sk_paint(
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
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));
            // Draw fill
            let mut fill_paint = fill_paint.clone();
            fill_paint.set_blend_mode(node.blend_mode.into());
            canvas.draw_oval(rect, &fill_paint);
            // Draw stroke if stroke_width > 0
            if node.stroke_width > 0.0 {
                let mut stroke_paint = sk_paint(
                    &node.stroke,
                    node.opacity,
                    (node.size.width, node.size.height),
                );
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                stroke_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_oval(rect, &stroke_paint);
            }
            canvas.restore();
        }
    }

    pub fn draw_line_node(&self, node: &LineNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            let mut paint = sk_paint(&node.stroke, node.opacity, (node.size.width, 0.0));
            paint.set_stroke(true);
            paint.set_stroke_width(node.stroke_width);
            paint.set_blend_mode(node.blend_mode.into());
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));
            canvas.draw_line(
                Point::new(0.0, 0.0),
                Point::new(node.size.width, 0.0),
                &paint,
            );
            canvas.restore();
        }
    }

    pub fn draw_path_node(&self, node: &PathNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));

            let path = skia_safe::path::Path::from_svg(&node.data).expect("path is not valid");

            let fill_paint = sk_paint(&node.fill, node.opacity, (1.0, 1.0));
            if node.stroke_width > 0.0 {
                let mut stroke_paint = sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                // stroke_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &stroke_paint);
            }

            canvas.draw_path(&path, &fill_paint);
            canvas.restore();
        }
    }

    pub fn draw_polygon_node(&self, node: &PolygonNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();
            if node.points.len() < 3 {
                // Not enough points to form a polygon
                return;
            }
            let fill_paint = sk_paint(&node.fill, node.opacity, (1.0, 1.0));
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));

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
                let mut stroke_paint = sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                stroke_paint.set_blend_mode(node.blend_mode.into());
                canvas.draw_path(&path, &stroke_paint);
            }

            canvas.restore();
        }
    }

    pub fn draw_regular_polygon_node(&self, node: &RegularPolygonNode) {
        let poly = node.to_polygon();
        self.draw_polygon_node(&poly);
    }

    pub fn draw_text_span_node(&self, node: &TextSpanNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();

            // paints
            let mut fill_paint = sk_paint(
                &node.fill,
                node.opacity,
                (node.size.width, node.size.height),
            );
            fill_paint.set_blend_mode(node.blend_mode.into());

            // paragraph
            let mut paragraph_style = ParagraphStyle::new();
            paragraph_style.set_text_direction(skia_safe::textlayout::TextDirection::LTR);
            paragraph_style.set_text_align(node.text_align.into());
            let mut paragraph_builder =
                ParagraphBuilder::new(&paragraph_style, &self.font_collection);

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

            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));
            paragraph.paint(canvas, Point::new(node.transform.x(), node.transform.y()));
            canvas.restore();
            return;
        }
    }

    pub fn draw_image_node(&self, node: &ImageNode) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();

            if let Some(image) = self.image_cache.get(&node._ref) {
                canvas.save();
                canvas.concat(&sk_matrix(node.transform.matrix));

                // Draw drop shadow effect if present
                if let Some(FilterEffect::DropShadow(shadow)) = &node.effect {
                    let mut shadow_paint = SkiaPaint::default();
                    let SchemaColor(r, g, b, a) = shadow.color;
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
                    let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
                    let mut shadow_rect = rect;
                    shadow_rect.offset((offset_x, offset_y));
                    canvas.draw_image_rect(image, None, shadow_rect, &shadow_paint);
                }

                // Draw the image
                let mut paint = SkiaPaint::default();
                paint.set_anti_alias(true);
                paint.set_blend_mode(node.blend_mode.into());
                paint.set_alpha((node.opacity * 255.0) as u8);

                let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
                let RectangularCornerRadius { tl, tr, bl, br } = node.corner_radius;

                if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                    let rrect = RRect::new_rect_radii(
                        rect,
                        &[
                            Point::new(tl, tl), // top-left
                            Point::new(tr, tr), // top-right
                            Point::new(br, br), // bottom-right
                            Point::new(bl, bl), // bottom-left
                        ],
                    );
                    // For rounded rectangles, we need to use a clip path
                    canvas.save();
                    canvas.clip_rrect(rrect, None, true);
                    canvas.draw_image_rect(image, None, rect, &paint);
                    canvas.restore();
                } else {
                    canvas.draw_image_rect(image, None, rect, &paint);
                }

                // Draw stroke if stroke_width > 0
                if node.stroke_width > 0.0 {
                    let mut stroke_paint = sk_paint(
                        &node.stroke,
                        node.opacity,
                        (node.size.width, node.size.height),
                    );
                    stroke_paint.set_stroke(true);
                    stroke_paint.set_stroke_width(node.stroke_width);
                    stroke_paint.set_blend_mode(node.blend_mode.into());

                    if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                        let rrect = RRect::new_rect_radii(
                            rect,
                            &[
                                Point::new(tl, tl), // top-left
                                Point::new(tr, tr), // top-right
                                Point::new(br, br), // bottom-right
                                Point::new(bl, bl), // bottom-left
                            ],
                        );
                        canvas.draw_rrect(rrect, &stroke_paint);
                    } else {
                        canvas.draw_rect(rect, &stroke_paint);
                    }
                }

                canvas.restore();
            }
        }
    }

    pub fn draw_group_node(&self, node: &GroupNode, repository: &NodeRepository) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();

            // Save canvas state for transform
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));

            let needs_opacity_layer = node.opacity < 1.0;

            if needs_opacity_layer {
                // Start new layer with opacity
                canvas.save_layer_alpha(None, (node.opacity * 255.0) as u32);
            }

            // Recursively render children
            for child_id in &node.children {
                self.render_node(child_id, repository);
            }

            if needs_opacity_layer {
                // End opacity layer
                canvas.restore();
            }

            // Restore transform
            canvas.restore();
        }
    }

    pub fn draw_container_node(&self, node: &ContainerNode, repository: &NodeRepository) {
        if let Some(backend) = &self.backend {
            let surface = unsafe { &mut *backend.get_surface() };
            let canvas = surface.canvas();

            // Save canvas state for transform
            canvas.save();
            canvas.concat(&sk_matrix(node.transform.matrix));

            let needs_opacity_layer = node.opacity < 1.0;

            if needs_opacity_layer {
                // Start new layer with opacity
                canvas.save_layer_alpha(None, (node.opacity * 255.0) as u32);
            }

            // Draw the background rectangle
            let rect = Rect::from_xywh(0.0, 0.0, node.size.width, node.size.height);
            let RectangularCornerRadius { tl, tr, bl, br } = node.corner_radius;

            // Draw drop shadow effect if present
            if let Some(FilterEffect::DropShadow(shadow)) = &node.effect {
                let mut shadow_paint = SkiaPaint::default();
                let SchemaColor(r, g, b, a) = shadow.color;
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
                if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                    let rrect = RRect::new_rect_radii(
                        rect,
                        &[
                            Point::new(tl, tl), // top-left
                            Point::new(tr, tr), // top-right
                            Point::new(br, br), // bottom-right
                            Point::new(bl, bl), // bottom-left
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

            // Draw fill
            let fill_paint = sk_paint(
                &node.fill,
                node.opacity,
                (node.size.width, node.size.height),
            );
            let mut fill_paint = fill_paint.clone();
            fill_paint.set_blend_mode(node.blend_mode.into());

            if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(tl, tl), // top-left
                        Point::new(tr, tr), // top-right
                        Point::new(br, br), // bottom-right
                        Point::new(bl, bl), // bottom-left
                    ],
                );
                canvas.draw_rrect(rrect, &fill_paint);
            } else {
                canvas.draw_rect(rect, &fill_paint);
            }

            // Draw stroke if present
            if let Some(stroke) = &node.stroke {
                let mut stroke_paint =
                    sk_paint(stroke, node.opacity, (node.size.width, node.size.height));
                stroke_paint.set_stroke(true);
                stroke_paint.set_stroke_width(node.stroke_width);
                stroke_paint.set_blend_mode(node.blend_mode.into());

                if tl > 0.0 || tr > 0.0 || bl > 0.0 || br > 0.0 {
                    let rrect = RRect::new_rect_radii(
                        rect,
                        &[
                            Point::new(tl, tl), // top-left
                            Point::new(tr, tr), // top-right
                            Point::new(br, br), // bottom-right
                            Point::new(bl, bl), // bottom-left
                        ],
                    );
                    canvas.draw_rrect(rrect, &stroke_paint);
                } else {
                    canvas.draw_rect(rect, &stroke_paint);
                }
            }

            // Recursively render children
            for child_id in &node.children {
                self.render_node(child_id, repository);
            }

            if needs_opacity_layer {
                // End opacity layer
                canvas.restore();
            }

            // Restore transform
            canvas.restore();
        }
    }

    pub fn draw_regular_star_polygon_node(&self, node: &RegularStarPolygonNode) {
        let poly = node.to_polygon();
        self.draw_polygon_node(&poly);
    }
}

fn sk_matrix(m: [[f32; 3]; 2]) -> skia_safe::Matrix {
    let [[a, c, tx], [b, d, ty]] = m;
    skia_safe::Matrix::from_affine(&[a, b, c, d, tx, ty])
}

fn sk_paint(paint: &Paint, opacity: f32, size: (f32, f32)) -> SkiaPaint {
    let mut skia_paint = SkiaPaint::default();
    skia_paint.set_anti_alias(true);
    let (width, height) = size;
    match paint {
        Paint::Solid(solid) => {
            let SchemaColor(r, g, b, a) = solid.color;
            let final_alpha = (a as f32 * opacity) as u8;
            skia_paint.set_color(Color::from_argb(final_alpha, r, g, b));
        }
        Paint::LinearGradient(gradient) => {
            let (colors, positions) = cg_build_gradient_stops(&gradient.stops, opacity);
            let shader = Shader::linear_gradient(
                (Point::new(0.0, 0.0), Point::new(width, 0.0)),
                &colors[..],
                Some(&positions[..]),
                skia_safe::TileMode::Clamp,
                None,
                Some(&sk_matrix(gradient.transform.matrix)),
            )
            .unwrap();
            skia_paint.set_shader(shader);
        }
        Paint::RadialGradient(gradient) => {
            let (colors, positions) = cg_build_gradient_stops(&gradient.stops, opacity);
            let center = Point::new(width / 2.0, height / 2.0);
            let radius = width.min(height) / 2.0;
            let shader = Shader::radial_gradient(
                center,
                radius,
                &colors[..],
                Some(&positions[..]),
                skia_safe::TileMode::Clamp,
                None,
                Some(&sk_matrix(gradient.transform.matrix)),
            )
            .unwrap();
            skia_paint.set_shader(shader);
        }
    }
    skia_paint
}

fn cg_build_gradient_stops(stops: &[GradientStop], opacity: f32) -> (Vec<Color>, Vec<f32>) {
    let mut colors = Vec::with_capacity(stops.len());
    let mut positions = Vec::with_capacity(stops.len());

    for stop in stops {
        let SchemaColor(r, g, b, a) = stop.color;
        let alpha = (a as f32 * opacity).round().clamp(0.0, 255.0) as u8;
        colors.push(Color::from_argb(alpha, r, g, b));
        positions.push(stop.offset);
    }

    (colors, positions)
}
