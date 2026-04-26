pub mod export_as_image;
pub mod export_as_pdf;
pub mod export_as_svg;
pub mod types;
pub use types::*;

use crate::{
    cache::geometry::GeometryCache,
    export::{
        export_as_image::export_node_as_image, export_as_pdf::export_node_as_pdf,
        export_as_svg::export_node_as_svg,
    },
    node::schema::{NodeId, Scene},
    runtime::{font_repository::FontRepository, image_repository::ImageRepository},
};

type FileData = Vec<u8>;

pub enum Exported {
    PNG(FileData),
    JPEG(FileData),
    WEBP(FileData),
    BMP(FileData),
    PDF(FileData),
    SVG(FileData),
}

impl Exported {
    pub fn data(&self) -> &[u8] {
        match self {
            Exported::PNG(data) => data,
            Exported::JPEG(data) => data,
            Exported::WEBP(data) => data,
            Exported::BMP(data) => data,
            Exported::PDF(data) => data,
            Exported::SVG(data) => data,
        }
    }
}

pub trait Exportable {
    fn export_as_png(self, config: ExportAsPNG) -> Exported;
    fn export_as_jpeg(self, config: ExportAsJPEG) -> Exported;
    fn export_as_webp(self, config: ExportAsWEBP) -> Exported;
    fn export_as_bmp(self, config: ExportAsBMP) -> Exported;
    fn export_as_pdf(self, config: ExportAsPDF) -> Exported;
    fn export_as_svg(self, config: ExportAsSVG) -> Exported;
}

pub struct ExportSize {
    pub width: f32,
    pub height: f32,
}

impl ExportSize {
    pub fn apply_constraints(&self, constraints: &ExportConstraints) -> Self {
        match constraints {
            ExportConstraints::None => Self {
                width: self.width,
                height: self.height,
            },
            ExportConstraints::Scale(scale) => Self {
                width: self.width * scale,
                height: self.height * scale,
            },
            ExportConstraints::ScaleToWidth(width) => {
                let target_w = *width;
                let target_h = if self.width > 0.0 {
                    self.height * target_w / self.width
                } else {
                    0.0
                };
                Self {
                    width: target_w,
                    height: target_h,
                }
            }
            ExportConstraints::ScaleToHeight(height) => {
                let target_h = *height;
                let target_w = if self.height > 0.0 {
                    self.width * target_h / self.height
                } else {
                    0.0
                };
                Self {
                    width: target_w,
                    height: target_h,
                }
            }
        }
    }
}

pub fn export_node_as(
    scene: &Scene,
    geometry: &GeometryCache,
    fonts: &FontRepository,
    images: &ImageRepository,
    node_id: &NodeId,
    format: ExportAs,
) -> Option<Exported> {
    let constraints = format.get_constraints();

    // 1. find node
    // get the size of the node
    let rect = geometry.get_render_bounds(node_id)?;
    let width = rect.width;
    let height = rect.height;

    let size = ExportSize { width, height };
    let size = size.apply_constraints(constraints);

    if format.is_format_pdf() {
        let format: ExportAsPDF = match format {
            ExportAs::PDF(pdf_format) => pdf_format,
            _ => unreachable!(),
        };
        export_node_as_pdf(scene, fonts, images, rect, format)
    } else if format.is_format_svg() {
        let format: ExportAsSVG = match format {
            ExportAs::SVG(svg_format) => svg_format,
            _ => unreachable!(),
        };
        export_node_as_svg(scene, fonts, images, rect, format)
    } else if format.is_format_image() {
        let format: ExportAsImage = format.clone().try_into().unwrap();
        export_node_as_image(scene, fonts, images, size, rect, format)
    } else {
        None
    }
}

// Re-export the multi-page PDF document export function.
// The Application layer resolves user IDs → internal NodeIds → render bounds
// and calls `export_pdf_document` directly.
pub use export_as_pdf::export_pdf_document;
