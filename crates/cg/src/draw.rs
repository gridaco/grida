use crate::schema::{
    Color as SchemaColor, EllipseNode, FilterEffect, GradientStop, LineNode, LinearGradientPaint,
    Paint, PolygonNode, RadialGradientPaint, RectangleNode, RectangularCornerRadius,
    RegularPolygonNode, TextAlign, TextAlignVertical, TextSpanNode,
};
use console_error_panic_hook::set_once as init_panic_hook;
use skia_safe::{
    Color, Font, FontMgr, FontStyle, Paint as SkiaPaint, Point, RRect, Rect, Shader, Surface,
    TextBlob, Typeface, surfaces,
};
use std::cell::RefCell;
use std::f32::consts::PI;

thread_local! {
    static DEFAULT_TYPEFACE: RefCell<Option<Typeface>> = RefCell::new(None);
}

fn default_typeface() -> Typeface {
    DEFAULT_TYPEFACE.with(|typeface| {
        let mut typeface = typeface.borrow_mut();
        if typeface.is_none() {
            let font_mgr = FontMgr::new();
            *typeface = Some(
                font_mgr
                    .legacy_make_typeface(None, FontStyle::default())
                    .unwrap(),
            );
        }
        typeface
            .as_ref()
            .expect("Failed to initialize default typeface")
            .clone()
    })
}

pub struct Renderer;

impl Renderer {
    pub fn init(width: i32, height: i32) -> *mut Surface {
        init_panic_hook();
        let surface = surfaces::raster_n32_premul((width, height)).unwrap();
        Box::into_raw(Box::new(surface))
    }

    pub fn draw_rect(
        ptr: *mut Surface,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        r: f32,
        g: f32,
        b: f32,
        a: f32,
    ) {
        let surface = unsafe { &mut *ptr };
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

    pub fn draw_rect_node(ptr: *mut Surface, node: &RectangleNode) {
        let surface = unsafe { &mut *ptr };
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
            use skia_safe::{MaskFilter, Paint as SkiaPaint};
            let mut shadow_paint = SkiaPaint::default();
            let crate::schema::Color(r, g, b, a) = shadow.color;
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
            fill_paint.set_blend_mode(node.base.blend_mode.into());
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
                stroke_paint.set_blend_mode(node.base.blend_mode.into());
                canvas.draw_rrect(rrect, &stroke_paint);
            }
        } else {
            let mut fill_paint = paint.clone();
            fill_paint.set_blend_mode(node.base.blend_mode.into());
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
                stroke_paint.set_blend_mode(node.base.blend_mode.into());
                canvas.draw_rect(rect, &stroke_paint);
            }
        }
        canvas.restore();
    }

    pub fn draw_ellipse(
        ptr: *mut Surface,
        x: f32,
        y: f32,
        rx: f32,
        ry: f32,
        r: f32,
        g: f32,
        b: f32,
        a: f32,
    ) {
        let surface = unsafe { &mut *ptr };
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

    pub fn draw_ellipse_node(ptr: *mut Surface, node: &EllipseNode) {
        let surface = unsafe { &mut *ptr };
        let canvas = surface.canvas();
        let fill_paint = sk_paint(
            &node.fill,
            node.opacity,
            (node.size.width, node.size.height),
        );
        let rect = Rect::from_xywh(
            -node.size.width / 2.0,
            -node.size.height / 2.0,
            node.size.width,
            node.size.height,
        );
        canvas.save();
        canvas.concat(&sk_matrix(node.transform.matrix));
        // Draw fill
        let mut fill_paint = fill_paint.clone();
        fill_paint.set_blend_mode(node.base.blend_mode.into());
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
            stroke_paint.set_blend_mode(node.base.blend_mode.into());
            canvas.draw_oval(rect, &stroke_paint);
        }
        canvas.restore();
    }

    pub fn draw_line_node(ptr: *mut Surface, node: &LineNode) {
        let surface = unsafe { &mut *ptr };
        let canvas = surface.canvas();
        let mut paint = sk_paint(&node.stroke, node.opacity, (node.size.width, 0.0));
        paint.set_stroke(true);
        paint.set_stroke_width(node.stroke_width);
        paint.set_blend_mode(node.base.blend_mode.into());
        canvas.save();
        canvas.concat(&sk_matrix(node.transform.matrix));
        canvas.draw_line(
            Point::new(0.0, 0.0),
            Point::new(node.size.width, 0.0),
            &paint,
        );
        canvas.restore();
    }

    pub fn draw_polygon_node(ptr: *mut Surface, node: &crate::schema::PolygonNode) {
        let surface = unsafe { &mut *ptr };
        let canvas = surface.canvas();
        if node.points.len() < 3 {
            // Not enough points to form a polygon
            return;
        }
        let fill_paint = sk_paint(&node.fill, node.opacity, (1.0, 1.0));
        let mut path = skia_safe::Path::new();
        let mut points_iter = node.points.iter();
        if let Some(&(x0, y0)) = points_iter.next() {
            path.move_to((x0, y0));
            for &(x, y) in points_iter {
                path.line_to((x, y));
            }
            path.close();
        }
        canvas.save();
        canvas.concat(&sk_matrix(node.transform.matrix));
        // Draw fill
        let mut fill_paint = fill_paint.clone();
        fill_paint.set_blend_mode(node.base.blend_mode.into());
        canvas.draw_path(&path, &fill_paint);
        // Draw stroke if stroke_width > 0
        if node.stroke_width > 0.0 {
            let mut stroke_paint = sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
            stroke_paint.set_stroke(true);
            stroke_paint.set_stroke_width(node.stroke_width);
            stroke_paint.set_blend_mode(node.base.blend_mode.into());
            canvas.draw_path(&path, &stroke_paint);
        }
        canvas.restore();
    }

    pub fn draw_regular_polygon_node(ptr: *mut Surface, node: &RegularPolygonNode) {
        let poly = cg_regular_to_polygon(node);
        Self::draw_polygon_node(ptr, &poly);
    }

    pub fn draw_text_span_node(ptr: *mut Surface, node: &TextSpanNode) {
        let surface = unsafe { &mut *ptr };
        let canvas = surface.canvas();

        // Create font with the specified size
        let font = Font::from_typeface(default_typeface(), node.text_style.font_size);

        // Create text blob
        let blob = TextBlob::from_str(&node.text, &font).unwrap();

        // Calculate text position based on alignment
        let (x, y) = match (node.text_align, node.text_align_vertical) {
            (TextAlign::Left, TextAlignVertical::Top) => (0.0, node.text_style.font_size),
            (TextAlign::Left, TextAlignVertical::Center) => (0.0, node.size.height / 2.0),
            (TextAlign::Left, TextAlignVertical::Bottom) => (0.0, node.size.height),
            (TextAlign::Center, TextAlignVertical::Top) => {
                (node.size.width / 2.0, node.text_style.font_size)
            }
            (TextAlign::Center, TextAlignVertical::Center) => {
                (node.size.width / 2.0, node.size.height / 2.0)
            }
            (TextAlign::Center, TextAlignVertical::Bottom) => {
                (node.size.width / 2.0, node.size.height)
            }
            (TextAlign::Right, TextAlignVertical::Top) => {
                (node.size.width, node.text_style.font_size)
            }
            (TextAlign::Right, TextAlignVertical::Center) => {
                (node.size.width, node.size.height / 2.0)
            }
            (TextAlign::Right, TextAlignVertical::Bottom) => (node.size.width, node.size.height),
            (TextAlign::Justify, _) => (0.0, node.text_style.font_size), // Justify not supported yet
        };

        canvas.save();
        canvas.concat(&sk_matrix(node.transform.matrix));

        // Draw stroke if specified
        if let (Some(stroke), Some(stroke_width)) = (&node.stroke, node.stroke_width) {
            let mut stroke_paint =
                sk_paint(stroke, node.opacity, (node.size.width, node.size.height));
            stroke_paint.set_style(skia_safe::paint::Style::Stroke);
            stroke_paint.set_stroke_width(stroke_width);
            stroke_paint.set_blend_mode(node.base.blend_mode.into());
            canvas.draw_text_blob(&blob, (x, y), &stroke_paint);
        }

        // Draw fill
        let mut fill_paint = sk_paint(
            &node.fill,
            node.opacity,
            (node.size.width, node.size.height),
        );
        fill_paint.set_blend_mode(node.base.blend_mode.into());
        canvas.draw_text_blob(&blob, (x, y), &fill_paint);

        canvas.restore();
    }

    pub fn flush(_ptr: *mut Surface) {
        // No flush needed for raster surfaces
    }

    pub fn free(ptr: *mut Surface) {
        unsafe { Box::from_raw(ptr) };
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

pub fn cg_regular_to_polygon(node: &RegularPolygonNode) -> PolygonNode {
    let RegularPolygonNode {
        base,
        transform,
        size,
        point_count,
        fill,
        stroke,
        stroke_width,
        opacity,
    } = node;

    let cx = size.width / 2.0;
    let cy = size.height / 2.0;
    let r = cx.min(cy); // fit within bounding box

    let angle_offset = if point_count % 2 == 0 {
        PI / *point_count as f32
    } else {
        -PI / 2.0
    };

    let points: Vec<(f32, f32)> = (0..*point_count)
        .map(|i| {
            let angle = (i as f32 / *point_count as f32) * 2.0 * PI + angle_offset;
            let x = cx + r * angle.cos();
            let y = cy + r * angle.sin();
            (x, y)
        })
        .collect();

    PolygonNode {
        base: base.clone(),
        transform: *transform,
        points,
        fill: fill.clone(),
        stroke: stroke.clone(),
        stroke_width: *stroke_width,
        opacity: *opacity,
    }
}
