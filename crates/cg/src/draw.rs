use crate::schema::{
    Color as SchemaColor, EllipseNode, GradientStop, LineNode, LinearGradientPaint, Paint,
    RadialGradientPaint, RectNode, RectangularCornerRadius, SolidPaint,
};
use console_error_panic_hook::set_once as init_panic_hook;
use skia_safe::{Color, Paint as SkiaPaint, Point, RRect, Rect, Shader, Surface, surfaces};

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

    pub fn draw_rect_node(ptr: *mut Surface, node: &RectNode) {
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
            canvas.draw_rrect(rrect, &paint);
        } else {
            canvas.draw_rect(rect, &paint);
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
        canvas.draw_path(&path, &fill_paint);
        // Draw stroke if stroke_width > 0
        if node.stroke_width > 0.0 {
            let mut stroke_paint = sk_paint(&node.stroke, node.opacity, (1.0, 1.0));
            stroke_paint.set_stroke(true);
            stroke_paint.set_stroke_width(node.stroke_width);
            canvas.draw_path(&path, &stroke_paint);
        }
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
