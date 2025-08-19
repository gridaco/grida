use crate::cache::scene::SceneCache;
use crate::fonts::geistmono::sk_font_geistmono;
use crate::node::schema::NodeId;
use crate::painter::{
    cvt,
    layer::{Layer, PainterPictureTextLayer},
};
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::FontRepository;
use crate::sk;
use skia_safe::{textlayout, Canvas, Color, Font, Paint, PaintStyle, Path};

#[derive(Debug, Clone)]
pub struct StrokeOverlayStyle {
    pub stroke_width: f32,
    pub stroke: crate::cg::CGColor,
}

impl Default for StrokeOverlayStyle {
    fn default() -> Self {
        Self {
            stroke_width: 3.0,
            stroke: crate::cg::CGColor(0, 255, 0, 200),
        }
    }
}

thread_local! {
    static FONT: Font = sk_font_geistmono(20.0);
}

pub struct StrokeOverlay;

impl StrokeOverlay {
    pub fn draw(
        canvas: &Canvas,
        nodes: &[NodeId],
        camera: &Camera2D,
        cache: &SceneCache,
        fonts: &std::cell::RefCell<FontRepository>,
        style: Option<&StrokeOverlayStyle>,
    ) {
        let style = style.cloned().unwrap_or_default();
        let mut paint = Paint::default();
        paint.set_color(Color::from_argb(
            style.stroke.3,
            style.stroke.0,
            style.stroke.1,
            style.stroke.2,
        ));
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(style.stroke_width);
        paint.set_anti_alias(true);

        for id in nodes {
            if let Some(layer) = cache.layers.layers.iter().find(|l| l.id() == id) {
                if cache.geometry.get_render_bounds(id).is_some() {
                    let shape = layer.shape();
                    let transform = layer.transform();

                    let mut path = if let Some(entry) = cache.path.borrow().get(id) {
                        (*entry.path).clone()
                    } else {
                        match layer {
                            crate::painter::layer::PainterPictureLayer::Text(t) => {
                                Self::text_layer_path(&fonts.borrow(), t)
                            }
                            _ => shape.to_path(),
                        }
                    };
                    path.transform(&sk::sk_matrix(transform.matrix));
                    path.transform(&sk::sk_matrix(camera.view_matrix().matrix));

                    canvas.draw_path(&path, &paint);
                }
            }
        }
    }

    fn text_layer_path(fonts: &FontRepository, layer: &PainterPictureTextLayer) -> Path {
        let size = crate::node::schema::Size {
            width: layer.shape.rect.width(),
            height: layer.shape.rect.height(),
        };
        let fill = layer
            .fills
            .first()
            .cloned()
            .unwrap_or(crate::cg::types::Paint::Solid(
                crate::cg::types::SolidPaint {
                    color: crate::cg::CGColor(0, 0, 0, 255),
                    opacity: 1.0,
                },
            ));
        let fill_paint = cvt::sk_paint(&fill, 1.0, (size.width, size.height));

        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(layer.text_align.clone().into());

        let mut builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());

        let mut ts = crate::painter::make_textstyle(&layer.text_style);
        ts.set_foreground_paint(&fill_paint);
        builder.push_style(&ts);
        let transformed_text = crate::text::text_transform::transform_text(
            &layer.text,
            layer.text_style.text_transform,
        );
        builder.add_text(&transformed_text);
        let mut paragraph = builder.build();
        builder.pop();
        paragraph.layout(size.width);

        let mut path = Path::new();
        let lines = paragraph.line_number();
        for i in 0..lines {
            let (_, line_path) = paragraph.get_path_at(i);
            path.add_path(&line_path, (0.0, 0.0), None);
        }
        path
    }
}
