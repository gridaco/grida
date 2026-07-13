use anchor_engine::drawlist::DrawList;
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::resolve::ResolveOptions;
use skia_safe::{
    image::CachingHint, surfaces, AlphaType, Color, ColorType, IPoint, Image, ImageInfo,
};

/// RGBA8888, unpremultiplied readback for stable raster probes.
///
/// Read the whole image once: probe-heavy tests should not cross Skia's
/// readback boundary once per pixel.
pub struct RgbaImage {
    width: i32,
    height: i32,
    pixels: Vec<u8>,
}

impl RgbaImage {
    pub fn from_image(image: &Image) -> Self {
        let width = image.width();
        let height = image.height();
        assert!(width > 0 && height > 0, "positive raster dimensions");
        let info = ImageInfo::new(
            (width, height),
            ColorType::RGBA8888,
            AlphaType::Unpremul,
            None,
        );
        let row_bytes = width as usize * 4;
        let mut pixels = vec![0; row_bytes * height as usize];
        assert!(
            image.read_pixels(
                &info,
                &mut pixels,
                row_bytes,
                IPoint::new(0, 0),
                CachingHint::Disallow,
            ),
            "read RGBA raster"
        );
        Self {
            width,
            height,
            pixels,
        }
    }

    pub fn at(&self, x: i32, y: i32) -> [u8; 4] {
        assert!(
            (0..self.width).contains(&x) && (0..self.height).contains(&y),
            "RGBA probe ({x}, {y}) outside {}x{} raster",
            self.width,
            self.height
        );
        let offset = ((y * self.width + x) * 4) as usize;
        self.pixels[offset..offset + 4]
            .try_into()
            .expect("four-byte RGBA pixel")
    }
}

pub fn render_xml(source: &str, width: i32, height: i32, ctx: &PaintCtx) -> (RgbaImage, DrawList) {
    render_xml_on(source, width, height, Color::WHITE, ctx)
}

pub fn render_xml_on(
    source: &str,
    width: i32,
    height: i32,
    clear: Color,
    ctx: &PaintCtx,
) -> (RgbaImage, DrawList) {
    let doc = grida_xml::parse(source).expect("Grida XML fixture parses");
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("raster surface");
    surface.canvas().clear(clear);
    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let (product, _) = frame::render(surface.canvas(), &doc, &options, &Affine::IDENTITY, ctx)
        .expect("valid fixture frame");
    assert_eq!(
        surface.canvas().save_count(),
        1,
        "display-list scopes leaked canvas state"
    );
    let image = RgbaImage::from_image(&surface.image_snapshot());
    let (_, drawlist, _) = product.into_parts();
    (image, drawlist)
}
