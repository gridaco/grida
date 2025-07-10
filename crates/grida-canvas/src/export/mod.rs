pub mod types;
pub use types::*;

use crate::{
    cache::geometry::GeometryCache,
    node::schema::Scene,
    runtime::{
        camera::Camera2D,
        scene::{Backend, Renderer},
    },
};

use skia_safe::EncodedImageFormat;

type FileData = Vec<u8>;

impl Into<EncodedImageFormat> for ExportAs {
    fn into(self) -> EncodedImageFormat {
        match self {
            ExportAs::PNG(_) => EncodedImageFormat::PNG,
            ExportAs::JPEG(_) => EncodedImageFormat::JPEG,
            ExportAs::WEBP(_) => EncodedImageFormat::WEBP,
            ExportAs::BMP(_) => EncodedImageFormat::BMP,
        }
    }
}

pub enum Exported {
    PNG(FileData),
    JPEG(FileData),
    WEBP(FileData),
    BMP(FileData),
}

impl Exported {
    pub fn data(&self) -> &[u8] {
        match self {
            Exported::PNG(data) => data,
            Exported::JPEG(data) => data,
            Exported::WEBP(data) => data,
            Exported::BMP(data) => data,
        }
    }
}

pub trait Exportable {
    fn export_as_png(self, config: ExportAsPNG) -> Exported;
    fn export_as_jpeg(self, config: ExportAsJPEG) -> Exported;
    fn export_as_webp(self, config: ExportAsWEBP) -> Exported;
    fn export_as_bmp(self, config: ExportAsBMP) -> Exported;
}

struct ExportSize {
    pub width: f32,
    pub height: f32,
}

impl ExportSize {
    fn apply_constraints(&self, constraints: &ExportConstraints) -> Self {
        match constraints {
            ExportConstraints::Scale(scale) => Self {
                width: self.width * scale,
                height: self.height * scale,
            },
            ExportConstraints::ScaleToWidth(width) => Self {
                width: *width as f32,
                height: self.height * *width as f32 / self.width,
            },
            ExportConstraints::ScaleToHeight(height) => Self {
                width: self.width * *height as f32 / self.height,
                height: *height as f32,
            },
        }
    }
}

pub fn export_node_as(
    scene: &Scene,
    geometry: &GeometryCache,
    node_id: &str,
    format: ExportAs,
) -> Option<Exported> {
    // 1. find node
    // get the size of the node
    let Some(rect) = geometry.get_render_bounds(node_id) else {
        return None;
    };

    let width = rect.width;
    let height = rect.height;

    let size = ExportSize { width, height };
    let size = size.apply_constraints(format.get_constraints());

    let camera = Camera2D::new_from_bounds(rect);

    // 2. create a renderer
    let mut r = Renderer::new(
        Backend::new_from_raster(size.width as i32, size.height as i32),
        None,
        camera,
    );

    r.load_scene(scene.clone());
    let image = r.snapshot();
    #[allow(deprecated)]
    let Some(data) = image.encode_to_data(format.clone().into()) else {
        return None;
    };

    // 2. export node

    match format {
        ExportAs::PNG(_) => Some(Exported::PNG(data.to_vec())),
        ExportAs::JPEG(_) => Some(Exported::JPEG(data.to_vec())),
        ExportAs::WEBP(_) => Some(Exported::WEBP(data.to_vec())),
        ExportAs::BMP(_) => Some(Exported::BMP(data.to_vec())),
    }
}
