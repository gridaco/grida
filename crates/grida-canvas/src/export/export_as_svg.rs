use crate::{
    export::{ExportAsSVG, Exported},
    node::schema::Scene,
    runtime::{
        camera::Camera2D,
        scene::{Backend, Renderer},
    },
};
use math2::Rectangle;
use skia_safe::{svg, Rect as SkRect};

pub fn export_node_as_svg(
    scene: &Scene,
    rect: Rectangle,
    _options: ExportAsSVG,
) -> Option<Exported> {
    let width = rect.width;
    let height = rect.height;

    // Create SVG canvas
    let bounds = SkRect::from_wh(width, height);
    let canvas = svg::Canvas::new(bounds, None);

    // Camera focusing on the node bounds
    let camera = Camera2D::new_from_bounds(rect);

    // Temporary renderer using raster backend
    let mut renderer = Renderer::new(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        camera,
    );

    renderer.load_scene(scene.clone());

    renderer.render_to_canvas(&canvas, width, height);

    let data = canvas.end();

    renderer.free();

    Some(Exported::SVG(data.as_bytes().to_vec()))
}
