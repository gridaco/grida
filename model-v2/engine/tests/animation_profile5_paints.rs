//! Profile 5 fill-color samples through effective values, draw lists, damage,
//! queries, and pixels without a paint-specific renderer path.

use anchor_engine::damage::diff_frame;
use anchor_engine::drawlist::ItemKind;
use anchor_engine::frame::{self, FrameRequest};
use anchor_engine::paint::PaintCtx;
use anchor_engine::replay::resolved_bits_eq;
use anchor_lab::animation::SampleTime;
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeId, Paint};
use anchor_lab::resolve::ResolveOptions;
use anchor_lab::svg_animation::{SourceSnapshot, SvgAnimationSource};

const W: i32 = 64;
const H: i32 = 32;

fn options() -> ResolveOptions {
    ResolveOptions {
        viewport: (W as f32, H as f32),
        ..Default::default()
    }
}

fn named(document: &Document, name: &str) -> NodeId {
    (0..document.capacity() as NodeId)
        .find(|id| {
            document
                .get_opt(*id)
                .and_then(|node| node.header.name.as_deref())
                == Some(name)
        })
        .expect("named SVG rectangle exists")
}

fn pixel(bytes: &[u8], x: i32, y: i32) -> &[u8] {
    let offset = ((y * W + x) * 4) as usize;
    &bytes[offset..offset + 4]
}

#[test]
fn sampled_fill_color_is_one_coherent_paint_only_frame() {
    let compiled = SvgAnimationSource::parse(SourceSnapshot::new(
        "profile5-paint-frame.svg",
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="probe" x="8" y="8" width="32" height="16" fill="#102030"><animate attributeName="fill" from="#fd0000" to="#0000fd" dur="2s" fill="freeze"/></rect></svg>"##,
    ))
    .unwrap()
    .into_compiled_profile5()
    .unwrap();
    let probe = named(compiled.document(), "probe");
    let context = PaintCtx::new(None);
    let base = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Base,
        &options(),
        &context,
    )
    .unwrap();
    let midpoint = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::from_nanoseconds(1_000_000_000),
        },
        &options(),
        &context,
    )
    .unwrap();

    assert!(
        resolved_bits_eq(base.resolved(), midpoint.resolved()),
        "fill animation does not create geometry"
    );
    for point in [(4.0, 4.0), (16.0, 16.0), (48.0, 24.0)] {
        assert_eq!(
            base.query().hit_point(point.0, point.1),
            midpoint.query().hit_point(point.0, point.1)
        );
    }
    assert_eq!(midpoint.query().hit_point(16.0, 16.0), Some(probe));
    assert_eq!(diff_frame(&base, &midpoint).changed, [probe]);

    let base_pixels = base
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    let midpoint_pixels = midpoint
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_eq!(pixel(&base_pixels, 16, 16), &[16, 32, 48, 255]);
    assert_eq!(pixel(&midpoint_pixels, 16, 16), &[127, 0, 127, 255]);
    assert_eq!(pixel(&base_pixels, 4, 4), &[255, 255, 255, 255]);
    assert_eq!(pixel(&midpoint_pixels, 4, 4), &[255, 255, 255, 255]);

    let fills = midpoint
        .drawlist()
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::RectFill { paints, .. } if item.node == probe => Some(paints),
            _ => None,
        });
    assert!(matches!(
        fills,
        Some(paints)
            if matches!(paints.as_slice(), [Paint::Solid(paint)] if paint.color.0 == 0xFF7F_007F)
    ));
}

#[test]
fn straight_rgba_reaches_drawlist_and_alpha_composites_once() {
    let compiled = SvgAnimationSource::parse(SourceSnapshot::new(
        "profile5-alpha-frame.svg",
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="probe" x="8" y="8" width="32" height="16" fill="#102030"><animate attributeName="fill" from="#ff000000" to="#0000ffff" dur="2s" fill="freeze"/></rect></svg>"##,
    ))
    .unwrap()
    .into_compiled_profile5()
    .unwrap();
    let probe = named(compiled.document(), "probe");
    let context = PaintCtx::new(None);
    let midpoint = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::from_nanoseconds(1_000_000_000),
        },
        &options(),
        &context,
    )
    .unwrap();

    let fills = midpoint
        .drawlist()
        .items
        .iter()
        .find_map(|item| match &item.kind {
            ItemKind::RectFill { paints, .. } if item.node == probe => Some(paints),
            _ => None,
        })
        .expect("animated rectangle fill is in the ordinary drawlist");
    assert!(matches!(
        fills.as_slice(),
        [Paint::Solid(paint)] if paint.color.0 == 0x8080_0080
    ));

    let pixels = midpoint
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_eq!(pixel(&pixels, 16, 16), &[191, 127, 191, 255]);
}

#[test]
fn remove_falls_through_to_the_authored_fill_through_the_same_frame_seam() {
    let compiled = SvgAnimationSource::parse(SourceSnapshot::new(
        "profile5-paint-fallthrough.svg",
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="probe" x="8" y="8" width="32" height="16" fill="#22c55e"><animate attributeName="fill" from="#dc2626" to="#2563eb" dur="1s" fill="remove"/></rect></svg>"##,
    ))
    .unwrap()
    .into_compiled_profile5()
    .unwrap();
    let context = PaintCtx::new(None);
    let at = |time| {
        frame::resolve_and_build_request(
            compiled.document(),
            FrameRequest::Sample {
                program: compiled.animation(),
                time: SampleTime::from_nanoseconds(time),
            },
            &options(),
            &context,
        )
        .unwrap()
    };
    let active = at(0);
    let removed = at(1_000_000_000);
    let active_pixels = active
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    let removed_pixels = removed
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();

    assert_eq!(pixel(&active_pixels, 16, 16), &[220, 38, 38, 255]);
    assert_eq!(pixel(&removed_pixels, 16, 16), &[34, 197, 94, 255]);
    assert!(
        compiled
            .animation()
            .sample(
                compiled.document(),
                SampleTime::from_nanoseconds(1_000_000_000),
            )
            .unwrap()
            .is_empty(),
        "post-remove sampling leaves the renderer on authored paints"
    );
    assert_eq!(diff_frame(&active, &removed).changed.len(), 1);
}
