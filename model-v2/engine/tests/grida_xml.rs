//! Consumer contract for Draft 0 `.grida.xml`: the public parser's document
//! reaches the existing pure stages and the one frame entry without an
//! XML-specific engine API. The fixture is deliberately probe-friendly.

use anchor_engine::drawlist::{self, Item, ItemKind};
use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{Color as ModelColor, Paints};
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{
    image::CachingHint, surfaces, AlphaType, Color, ColorType, IPoint, Image, ImageInfo,
};

const SOURCE: &str = include_str!("../rig/fixtures/nested-rects.grida.xml");
const WIDTH: i32 = 96;
const HEIGHT: i32 = 80;

fn options() -> ResolveOptions {
    ResolveOptions {
        viewport: (WIDTH as f32, HEIGHT as f32),
        ..Default::default()
    }
}

fn assert_rect_fill(item: &Item, world: Affine, width: f32, height: f32, argb: u32) {
    assert_eq!(item.world, world);
    assert_eq!(
        item.kind,
        ItemKind::RectFill {
            w: width,
            h: height,
            paints: Paints::solid(ModelColor(argb)),
        }
    );
}

fn rgba_at(image: &Image, x: i32, y: i32) -> [u8; 4] {
    let info = ImageInfo::new((1, 1), ColorType::RGBA8888, AlphaType::Unpremul, None);
    let mut rgba = [0u8; 4];
    assert!(
        image.read_pixels(
            &info,
            &mut rgba,
            4,
            IPoint::new(x, y),
            CachingHint::Disallow,
        ),
        "read RGBA probe at ({x}, {y})"
    );
    rgba
}

#[test]
fn draft0_nested_rects_materialize_in_the_drawlist() {
    let doc = grida_xml::parse(SOURCE).expect("Draft 0 fixture parses");
    let resolved = resolve(&doc, &options());
    let list = drawlist::build(&doc, &resolved);

    // The structural <grida> envelope and implicit document root emit no ink.
    // The authored container and nested rectangles emit only their authored
    // fills. There is no engine-invented frame border.
    assert_eq!(list.items.len(), 3);
    assert_rect_fill(&list.items[0], Affine::IDENTITY, 96.0, 80.0, 0xFFFF_FFFF);
    assert_rect_fill(
        &list.items[1],
        Affine::translate(16.0, 16.0),
        64.0,
        48.0,
        0xFFFF_0000,
    );
    assert_rect_fill(
        &list.items[2],
        Affine::translate(32.0, 28.0),
        24.0,
        16.0,
        0xFF00_00FF,
    );
}

#[test]
fn draft0_nested_rects_render_through_the_frame_entry() {
    let doc = grida_xml::parse(SOURCE).expect("Draft 0 fixture parses");
    let mut surface = surfaces::raster_n32_premul((WIDTH, HEIGHT)).expect("raster surface");
    surface.canvas().clear(Color::WHITE);

    let paint_ctx = PaintCtx::new(None);
    let (_, list, _) = frame::render(
        surface.canvas(),
        &doc,
        &options(),
        &Affine::IDENTITY,
        &paint_ctx,
    );
    assert_eq!(list.items.len(), 3, "the frame used the expected drawlist");

    // Force RGBA8888 readback so the assertions do not depend on native N32
    // channel order. Every point is well inside a solid region, away from AA.
    let image = surface.image_snapshot();
    assert_eq!(rgba_at(&image, 8, 8), [255, 255, 255, 255]);
    assert_eq!(rgba_at(&image, 20, 20), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&image, 40, 36), [0, 0, 255, 255]);
    assert_eq!(rgba_at(&image, 70, 52), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&image, 88, 72), [255, 255, 255, 255]);
}
