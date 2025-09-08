use crate::cache::scene::SceneCache;
use crate::devtools::text_overlay;

use crate::node::schema::NodeId;
use crate::painter::layer::Layer;
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::FontRepository;
use crate::sk;
use skia_safe::{Canvas, Color, Font, Paint, PaintStyle};

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
    static FONT: Font = Font::new(crate::fonts::embedded::typeface(crate::fonts::embedded::geistmono::BYTES), 20.0);
}

pub struct StrokeOverlay;

impl StrokeOverlay {
    pub fn draw(
        canvas: &Canvas,
        nodes: &[NodeId],
        camera: &Camera2D,
        cache: &SceneCache,
        _fonts: &FontRepository,
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
                                if let Some(text_path) =
                                    text_overlay::TextOverlay::text_layer_baseline(cache, t)
                                {
                                    text_path
                                } else {
                                    // Skip rendering if text path is not available
                                    continue;
                                }
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
}
