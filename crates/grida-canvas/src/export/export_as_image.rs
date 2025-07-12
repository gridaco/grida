use crate::{
    export::{ExportAsImage, ExportSize, Exported},
    node::schema::Scene,
    runtime::{
        camera::Camera2D,
        scene::{Backend, Renderer},
    },
};
use math2::Rectangle;
use skia_safe::EncodedImageFormat;

impl Into<EncodedImageFormat> for ExportAsImage {
    fn into(self) -> EncodedImageFormat {
        match self {
            ExportAsImage::PNG(_) => EncodedImageFormat::PNG,
            ExportAsImage::JPEG(_) => EncodedImageFormat::JPEG,
            ExportAsImage::WEBP(_) => EncodedImageFormat::WEBP,
            ExportAsImage::BMP(_) => EncodedImageFormat::BMP,
        }
    }
}

pub fn export_node_as_image(
    scene: &Scene,
    size: ExportSize,
    rect: Rectangle,
    format: ExportAsImage,
) -> Option<Exported> {
    let skfmt: EncodedImageFormat = format.clone().into();

    let camera = Camera2D::new_from_bounds(rect);

    // 2. create a renderer
    let mut r = Renderer::new(
        Backend::new_from_raster(size.width as i32, size.height as i32),
        None,
        camera,
    );

    r.load_scene(scene.clone());
    let image = r.snapshot();

    let Some(data) = image.encode(None, skfmt, None) else {
        r.free();
        return None;
    };

    // 2. export node
    let exported = match format {
        ExportAsImage::PNG(_) => Some(Exported::PNG(data.to_vec())),
        ExportAsImage::JPEG(_) => Some(Exported::JPEG(data.to_vec())),
        ExportAsImage::WEBP(_) => Some(Exported::WEBP(data.to_vec())),
        ExportAsImage::BMP(_) => Some(Exported::BMP(data.to_vec())),
    };

    r.free();

    exported
}
