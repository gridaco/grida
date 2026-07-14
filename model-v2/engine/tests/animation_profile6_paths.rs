//! Profile 6 path geometry crosses the ordinary effective-value frame seam.

use anchor_engine::cache::SceneCache;
use anchor_engine::damage::diff_frame;
use anchor_engine::drawlist::ItemKind;
use anchor_engine::frame::{self, FrameRequest};
use anchor_engine::paint::PaintCtx;
use anchor_lab::animation::SampleTime;
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeId};
use anchor_lab::path;
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue, PropertyValues};
use anchor_lab::resolve::ResolveOptions;
use anchor_lab::svg_animation::{SourceSnapshot, SvgAnimationSource};
use skia_safe::surfaces;

const W: i32 = 128;
const H: i32 = 64;

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
        .expect("named SVG path exists")
}

fn pixel(bytes: &[u8], x: i32, y: i32) -> &[u8] {
    let offset = ((y * W + x) * 4) as usize;
    &bytes[offset..offset + 4]
}

#[test]
fn sampled_path_moves_bounds_damage_drawlist_cache_and_pixels_together() {
    let compiled = SvgAnimationSource::parse(SourceSnapshot::new(
        "profile6-path-frame.svg",
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><path id="probe" fill="#7c3aed" d="M 8 8 L 40 8 L 24 40 Z"><animate attributeName="d" from="M 8 8 L 40 8 L 24 40 Z" to="M 72 16 L 120 16 L 96 56 Z" dur="2s" fill="freeze"/></path></svg>"##,
    ))
    .unwrap()
    .into_compiled_profile6()
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

    assert_eq!(
        base.resolved().resolved_path_of(probe).local_bounds,
        anchor_lab::math::RectF {
            x: 8.0,
            y: 8.0,
            w: 32.0,
            h: 32.0,
        }
    );
    assert_eq!(
        midpoint.resolved().resolved_path_of(probe).local_bounds,
        anchor_lab::math::RectF {
            x: 40.0,
            y: 12.0,
            w: 40.0,
            h: 36.0,
        }
    );
    assert_eq!(base.query().hit_point(24.0, 16.0), Some(probe));
    assert_eq!(
        midpoint.query().hit_point(24.0, 16.0),
        Some(probe),
        "the current engine query policy intentionally targets the path's declared box"
    );
    assert_eq!(midpoint.query().hit_point(60.0, 20.0), Some(probe));

    let damage = diff_frame(&base, &midpoint);
    assert_eq!(damage.changed, [probe]);
    assert!(damage.union_world.is_some());
    let path_item = midpoint
        .drawlist()
        .items
        .iter()
        .find(|item| item.node == probe)
        .expect("animated path reaches the ordinary drawlist");
    assert!(matches!(path_item.kind, ItemKind::PathFill { .. }));
    assert_eq!(
        midpoint.resolved().resolved_path_of(probe).fill_rule,
        anchor_lab::path::FillRule::NonZero,
        "animated geometry retains the current authored path fill rule"
    );

    let base_pixels = base
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    let midpoint_pixels = midpoint
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_ne!(pixel(&base_pixels, 24, 16), &[255, 255, 255, 255]);
    assert_eq!(pixel(&midpoint_pixels, 24, 16), &[255, 255, 255, 255]);
    assert_ne!(pixel(&midpoint_pixels, 60, 20), &[255, 255, 255, 255]);

    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    assert!(cache
        .frame_request(
            surface.canvas(),
            compiled.document(),
            FrameRequest::Base,
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());
    assert!(cache
        .frame_request(
            surface.canvas(),
            compiled.document(),
            FrameRequest::Sample {
                program: compiled.animation(),
                time: SampleTime::from_nanoseconds(1_000_000_000),
            },
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());
    assert!(
        !cache
            .frame_request(
                surface.canvas(),
                compiled.document(),
                FrameRequest::Sample {
                    program: compiled.animation(),
                    time: SampleTime::from_nanoseconds(1_000_000_000),
                },
                &options(),
                &Affine::IDENTITY,
                &context,
                false,
            )
            .unwrap(),
        "identical sampled path geometry reuses the cached scene"
    );

    let target = PropertyTarget::new(
        compiled.document().key_of(probe).unwrap(),
        PropertyKey::PathGeometry,
    );
    let visually_equal = |path| {
        PropertyValues::new(
            compiled.document(),
            [(target, PropertyValue::PathGeometry(path))],
        )
        .unwrap()
    };
    let absolute = visually_equal(
        path::analyze(
            "M .25 .25 L .75 .25 L .5 .75 Z",
            anchor_lab::path::FillRule::NonZero,
        )
        .unwrap()
        .geometry()
        .clone(),
    );
    let relative = visually_equal(
        path::analyze(
            "m .25 .25 l .5 0 l -.25 .5 z",
            anchor_lab::path::FillRule::NonZero,
        )
        .unwrap()
        .geometry()
        .clone(),
    );
    let mut spelling_cache = SceneCache::new(W, H);
    assert!(spelling_cache
        .frame_with_values(
            surface.canvas(),
            compiled.document(),
            &absolute,
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());
    assert!(
        !spelling_cache
            .frame_with_values(
                surface.canvas(),
                compiled.document(),
                &relative,
                &options(),
                &Affine::IDENTITY,
                &context,
                false,
            )
            .unwrap(),
        "equivalent normalized geometry must not reraster for source spelling alone"
    );
}
