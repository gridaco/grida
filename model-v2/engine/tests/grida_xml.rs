//! Consumer contract for Draft 0 `.grida.xml`: the public parser's document
//! reaches the existing pure stages and the one frame entry without an
//! XML-specific engine API. The fixture is deliberately probe-friendly.

mod support;

use anchor_engine::drawlist::{self, Item, ItemKind};
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml;
use anchor_lab::math::Affine;
use anchor_lab::model::{Color as ModelColor, CornerSmoothing, Paints, RectangularCornerRadius};
use anchor_lab::resolve::{resolve, ResolveOptions};

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
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing::default(),
            paints: Paints::solid(ModelColor(argb)),
        }
    );
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
    let paint_ctx = PaintCtx::new(None);
    let (image, list) = support::render_xml(SOURCE, WIDTH, HEIGHT, &paint_ctx);
    assert_eq!(list.items.len(), 3, "the frame used the expected drawlist");

    // Force RGBA8888 readback so the assertions do not depend on native N32
    // channel order. Every point is well inside a solid region, away from AA.
    assert_eq!(image.at(8, 8), [255, 255, 255, 255]);
    assert_eq!(image.at(20, 20), [255, 0, 0, 255]);
    assert_eq!(image.at(40, 36), [0, 0, 255, 255]);
    assert_eq!(image.at(70, 52), [255, 0, 0, 255]);
    assert_eq!(image.at(88, 72), [255, 255, 255, 255]);
}
