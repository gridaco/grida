use crate::node::schema::Size;
use crate::{
    export::{ExportAsImage, ExportSize, Exported},
    node::schema::Scene,
    runtime::{
        camera::Camera2D,
        font_repository::FontRepository,
        image_repository::ImageRepository,
        scene::{Backend, Renderer, RendererOptions},
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
    fonts: &FontRepository,
    images: &ImageRepository,
    size: ExportSize,
    rect: Rectangle,
    format: ExportAsImage,
) -> Option<Exported> {
    let skfmt: EncodedImageFormat = format.clone().into();

    // Create camera with original bounds to determine world-space view
    let mut camera = Camera2D::new_from_bounds(rect);

    // Scale the camera size to target resolution and adjust zoom to maintain same world-space view
    // When we increase the viewport size and zoom IN proportionally, we see the same world-space rect
    // but at higher resolution (scale = 2 means 2x zoom, 2x pixels, same world-space view)
    let scale = size.width / rect.width;
    camera.set_size(Size {
        width: size.width,
        height: size.height,
    });
    camera.set_zoom(scale);

    let store = fonts.store();
    let mut r = Renderer::new_with_store(
        Backend::new_from_raster(size.width as i32, size.height as i32),
        None,
        camera,
        store,
        RendererOptions::default(),
    );

    r.fonts = fonts.clone();
    r.images = images.clone();
    r.load_scene(scene.clone());

    // Render directly at target resolution - this ensures fonts work correctly
    let image = r.snapshot();
    r.free();

    // Extract quality for JPEG and WEBP formats
    let quality = match &format {
        ExportAsImage::JPEG(jpeg_config) => jpeg_config.quality,
        ExportAsImage::WEBP(webp_config) => webp_config.quality,
        _ => None,
    };

    let Some(data) = image.encode(None, skfmt, quality) else {
        return None;
    };

    // Return the exported data
    let exported = match format {
        ExportAsImage::PNG(_) => Some(Exported::PNG(data.to_vec())),
        ExportAsImage::JPEG(_) => Some(Exported::JPEG(data.to_vec())),
        ExportAsImage::WEBP(_) => Some(Exported::WEBP(data.to_vec())),
        ExportAsImage::BMP(_) => Some(Exported::BMP(data.to_vec())),
    };

    exported
}
