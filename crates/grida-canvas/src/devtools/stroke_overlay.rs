use crate::cache::scene::SceneCache;

use crate::fonts::geistmono::sk_font_geistmono;
use crate::node::schema::NodeId;
use crate::painter::layer::{Layer, PainterPictureTextLayer};
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::FontRepository;
use crate::sk;
use skia_safe::{Canvas, Color, Font, Paint, PaintStyle, Path};

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
        _fonts: &std::cell::RefCell<FontRepository>,
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
                                Self::text_layer_path(cache, t)
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

    fn text_layer_path(cache: &SceneCache, layer: &PainterPictureTextLayer) -> Path {
        // Try to get paragraph from cache first
        if let Some(entry) = cache.paragraph.borrow().get(&layer.base.id) {
            let paragraph = &entry.paragraph;
            let mut paragraph_ref = paragraph.borrow_mut();

            // Apply layout if width is specified
            if let Some(width) = layer.width {
                paragraph_ref.layout(width);
            }

            let mut path = Path::new();
            let lines = paragraph_ref.line_number();
            for i in 0..lines {
                let (_, line_path) = paragraph_ref.get_path_at(i);
                path.add_path(&line_path, (0.0, 0.0), None);
            }
            path
        } else {
            // This should not happen now that Painter shares the SceneCache's paragraph cache
            unreachable!("text layer not in cache - this should not happen with shared cache")
        }
    }
}
