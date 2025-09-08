use crate::{
    export::{ExportAsPDF, Exported},
    node::schema::Scene,
    runtime::{
        camera::Camera2D,
        repository::FontRepository,
        scene::{Backend, Renderer},
    },
};
use math2::Rectangle;
use skia_safe::{pdf, Size as SkSize};
use std::io::Cursor;

pub fn export_node_as_pdf(
    scene: &Scene,
    fonts: &FontRepository,
    rect: Rectangle,
    _options: ExportAsPDF,
) -> Option<Exported> {
    // Create a PDF document in memory
    let mut cursor = Cursor::new(Vec::new());

    // Create PDF document
    let doc = pdf::new_document(&mut cursor, None);

    // Calculate page size based on the node bounds
    let width = rect.width;
    let height = rect.height;

    // Begin a new page
    let mut page = doc.begin_page(SkSize::new(width, height), None);
    let canvas = page.canvas();

    // Create a camera that focuses on the specific node bounds
    let camera = Camera2D::new_from_bounds(rect);

    // Create a renderer with a temporary backend
    let mut renderer = Renderer::new(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        camera,
    );

    renderer.fonts = fonts.clone();

    // Load the scene
    renderer.load_scene(scene.clone());

    // Render the scene to the PDF canvas
    renderer.render_to_canvas(canvas, width, height);

    // End the page
    let doc = page.end_page();

    // Close the document
    doc.close();

    // Get the PDF data
    let pdf_data = cursor.into_inner();

    // Clean up the renderer
    renderer.free();

    Some(Exported::PDF(pdf_data))
}
