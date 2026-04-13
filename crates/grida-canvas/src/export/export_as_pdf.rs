use crate::{
    export::{ExportAsPDF, ExportPdfDocumentOptions, Exported, PdfPageSize},
    node::schema::Scene,
    runtime::{
        camera::Camera2D,
        font_repository::FontRepository,
        image_repository::ImageRepository,
        scene::{Backend, Renderer, RendererOptions},
    },
};
use math2::Rectangle;
use skia_safe::{pdf, Size as SkSize};
use std::io::Cursor;

/// Export a single node as a one-page PDF.
///
/// This is the original single-node export path, preserved for the
/// per-node `ExportAs::PDF` flow.
pub fn export_node_as_pdf(
    scene: &Scene,
    fonts: &FontRepository,
    images: &ImageRepository,
    rect: Rectangle,
    _options: ExportAsPDF,
) -> Option<Exported> {
    // Delegate to the multi-page path with a single page.
    export_pdf_document_inner(scene, fonts, images, &[(rect, None)], None)
}

/// Export multiple nodes as a single multi-page PDF document.
///
/// Each `(rect, page_size_override)` pair becomes one page. The renderer is
/// created **once** and the scene is loaded once; only the camera is re-aimed
/// per page. Skia automatically deduplicates shared resources (fonts, images)
/// across pages.
///
/// `uniform_page_size` applies to every page unless overridden per-page.
/// When both are `None`, the page is sized to the node's render bounds.
pub fn export_pdf_document(
    scene: &Scene,
    fonts: &FontRepository,
    images: &ImageRepository,
    rects: &[Rectangle],
    options: &ExportPdfDocumentOptions,
) -> Option<Exported> {
    if rects.is_empty() {
        return None;
    }

    let pages: Vec<(Rectangle, Option<&PdfPageSize>)> = rects
        .iter()
        .map(|r| (*r, options.page_size.as_ref()))
        .collect();

    export_pdf_document_inner(scene, fonts, images, &pages, None)
}

// ---------------------------------------------------------------------------
// Internal helper shared by single-node and multi-page paths
// ---------------------------------------------------------------------------

fn export_pdf_document_inner(
    scene: &Scene,
    fonts: &FontRepository,
    images: &ImageRepository,
    pages: &[(Rectangle, Option<&PdfPageSize>)],
    metadata: Option<&pdf::Metadata>,
) -> Option<Exported> {
    if pages.is_empty() {
        return None;
    }

    // Use the first page to size the throwaway raster backend.
    // The raster surface is never read — it exists only because Renderer
    // requires a Backend at construction. All actual output goes to the
    // PDF canvas provided by Skia's pdf::Document.
    let first = &pages[0].0;
    let init_w = first.width.max(1.0) as i32;
    let init_h = first.height.max(1.0) as i32;

    let store = fonts.store();
    let camera = Camera2D::new_from_bounds(*first);
    let mut renderer = Renderer::new_with_store(
        Backend::new_from_raster(init_w, init_h),
        None,
        camera,
        store,
        RendererOptions::default(),
    );
    renderer.fonts = fonts.clone();
    renderer.images = images.clone();
    renderer.load_scene(scene.clone());

    // --- Build the PDF -------------------------------------------------------
    let mut cursor = Cursor::new(Vec::new());
    let mut doc = pdf::new_document(&mut cursor, metadata);

    for (rect, page_size) in pages {
        // Determine the output page dimensions.
        let (page_w, page_h) = match page_size {
            Some(ps) => (ps.width, ps.height),
            None => (rect.width, rect.height),
        };

        if (page_w as i32) <= 0 || (page_h as i32) <= 0 {
            // Skip degenerate pages — don't abort the whole document.
            continue;
        }

        // Re-aim the camera at this node's bounds.
        renderer.camera = Camera2D::new_from_bounds(*rect);

        let mut page = doc.begin_page(SkSize::new(page_w, page_h), None);
        renderer.render_to_canvas(page.canvas(), page_w, page_h);
        doc = page.end_page();
    }

    doc.close();
    let pdf_data = cursor.into_inner();

    renderer.free();

    if pdf_data.is_empty() {
        return None;
    }

    Some(Exported::PDF(pdf_data))
}
