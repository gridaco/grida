use crate::schema::{
    Color as SchemaColor, EllipseNode, LineNode, RectNode, RectangularCornerRadius,
};
use console_error_panic_hook::set_once as init_panic_hook;
use skia_safe::{Color, Paint, Point, RRect, Rect, Surface, surfaces};

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

    let mut paint = Paint::default();
    paint.set_color(color);

    canvas.draw_rect(Rect::from_xywh(x, y, w, h), &paint);
}

pub fn draw_rect_node(ptr: *mut Surface, node: &RectNode) {
    let surface = unsafe { &mut *ptr };
    let canvas = surface.canvas();

    let mut paint = Paint::default();
    let SchemaColor(r, g, b, a) = node.fill;
    let final_alpha = (a as f32 * node.opacity) as u8;
    paint.set_color(Color::from_argb(final_alpha, r, g, b));

    canvas.save();
    let [[a, c, tx], [b, d, ty]] = node.transform.matrix;
    let matrix = [a, b, c, d, tx, ty];
    canvas.concat(&skia_safe::Matrix::from_affine(&matrix));

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

    let mut paint = Paint::default();
    paint.set_color(color);

    canvas.draw_oval(Rect::from_xywh(x - rx, y - ry, rx * 2.0, ry * 2.0), &paint);
}

pub fn draw_ellipse_node(ptr: *mut Surface, node: &EllipseNode) {
    let surface = unsafe { &mut *ptr };
    let canvas = surface.canvas();

    let mut paint = Paint::default();
    let SchemaColor(r, g, b, a) = node.fill;
    let final_alpha = (a as f32 * node.opacity) as u8;
    paint.set_color(Color::from_argb(final_alpha, r, g, b));

    canvas.save();
    let [[a, c, tx], [b, d, ty]] = node.transform.matrix;
    let matrix = [a, b, c, d, tx, ty];
    canvas.concat(&skia_safe::Matrix::from_affine(&matrix));

    let rect = Rect::from_xywh(
        -node.size.width / 2.0,
        -node.size.height / 2.0,
        node.size.width,
        node.size.height,
    );
    canvas.draw_oval(rect, &paint);

    canvas.restore();
}

pub fn draw_line_node(ptr: *mut Surface, node: &LineNode) {
    let surface = unsafe { &mut *ptr };
    let canvas = surface.canvas();

    let mut paint = Paint::default();
    let SchemaColor(r, g, b, a) = node.fill;
    let final_alpha = (a as f32 * node.opacity) as u8;
    paint.set_color(Color::from_argb(final_alpha, r, g, b));

    canvas.save();
    let [[a, c, tx], [b, d, ty]] = node.transform.matrix;
    let matrix = [a, b, c, d, tx, ty];
    canvas.concat(&skia_safe::Matrix::from_affine(&matrix));

    // Draw a line from (0,0) to (width,height)
    canvas.draw_line(
        Point::new(0.0, 0.0),
        Point::new(node.size.width, node.size.height),
        &paint,
    );

    canvas.restore();
}

pub fn flush(_ptr: *mut Surface) {
    // No flush needed for raster surfaces
}

pub fn free(ptr: *mut Surface) {
    unsafe { Box::from_raw(ptr) };
}
