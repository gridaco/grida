//! ENG-0.2 / ENG-2 · the scene raster cache must be byte-identical to a fresh
//! render — a fast-but-wrong compositor is the one failure worse than slow.
//! Covers: cache-cold, integer-pan blit (the win path), zoom re-raster (the
//! bitmap-can't-rescale boundary), and doc-dirty re-raster.

use anchor_engine::cache::{composited_to_bytes, SceneCache};
use anchor_engine::damage::diff_frame;
use anchor_engine::drawlist::build_glyphless_unchecked;
use anchor_engine::frame;
use anchor_engine::paint::{raster_to_bytes_unchecked, PaintCtx};
use anchor_engine::replay::resolved_bits_eq;
use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue, PropertyValues};
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};
use skia_safe::{surfaces, Color as SkColor, FontMgr};

const W: i32 = 1360;
const H: i32 = 900;
const INTER: &[u8] =
    include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (2000.0, 1400.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

fn ctx() -> PaintCtx {
    PaintCtx::new(None)
}

fn font_ctx() -> PaintCtx {
    let typeface = FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    PaintCtx::new(Some(typeface))
}

/// root + a handful of free shapes (one rotated) at known world positions.
fn scene() -> Document {
    let mut b = DocBuilder::new();
    let mk = |x: f32, y: f32, w: f32, h: f32, rot: f32, kind: ShapeDesc| {
        let mut hd = Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h));
        hd.x = AxisBinding::start(x);
        hd.y = AxisBinding::start(y);
        hd.rotation = rot;
        (hd, Payload::Shape { desc: kind })
    };
    let (h1, p1) = mk(100.0, 100.0, 80.0, 60.0, 0.0, ShapeDesc::Rect);
    let a = b.add(0, h1, p1);
    let (h2, p2) = mk(240.0, 160.0, 70.0, 70.0, 20.0, ShapeDesc::Rect);
    let c = b.add(0, h2, p2);
    let (h3, p3) = mk(360.0, 120.0, 90.0, 50.0, 0.0, ShapeDesc::Ellipse);
    let e = b.add(0, h3, p3);
    let mut doc = b.build();
    doc.get_mut(a).fills = Paints::solid("#4A90D9".into());
    doc.get_mut(c).fills = Paints::solid("#E2574C".into());
    doc.get_mut(e).fills = Paints::solid("#57B894".into());
    doc
}

fn text_scene() -> Document {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Fixed(260.0), SizeIntent::Auto);
    header.x = AxisBinding::start(80.0);
    header.y = AxisBinding::start(90.0);
    let text = builder.add(
        0,
        header,
        Payload::Text {
            content: "Cache office AV".into(),
            font_size: 32.0,
        },
    );
    let mut doc = builder.build();
    doc.get_mut(text).fills = Paints::solid(Color::BLACK);
    doc
}

fn image_scene() -> (Document, NodeId) {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Fixed(120.0), SizeIntent::Fixed(80.0));
    header.x = AxisBinding::start(40.0);
    header.y = AxisBinding::start(40.0);
    let node = builder.add(
        0,
        header,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(node).fills = Paints::new([Paint::Image(ImagePaint::from_rid("asset"))]);
    (builder.build(), node)
}

fn fresh_bytes(doc: &Document, view: &Affine) -> Vec<u8> {
    let r = resolve(doc, &opts());
    let list = build_glyphless_unchecked(doc, &r);
    raster_to_bytes_unchecked(&list, view, W, H, &ctx())
}

fn fresh_frame_bytes(doc: &Document, view: &Affine, ctx: &PaintCtx) -> Vec<u8> {
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    frame::render(surface.canvas(), doc, &opts(), view, ctx).expect("valid fresh frame");
    anchor_engine::paint::read_pixels(&mut surface, W, H)
}

fn cached_frame_bytes(
    cache: &mut SceneCache,
    doc: &Document,
    view: &Affine,
    ctx: &PaintCtx,
    doc_dirty: bool,
) -> (Vec<u8>, bool) {
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let rerastered = cache
        .frame(surface.canvas(), doc, &opts(), view, ctx, doc_dirty)
        .expect("valid cached frame");
    (
        anchor_engine::paint::read_pixels(&mut surface, W, H),
        rerastered,
    )
}

fn cached_value_frame_bytes(
    cache: &mut SceneCache,
    doc: &Document,
    values: &PropertyValues,
    view: &Affine,
    ctx: &PaintCtx,
) -> (Vec<u8>, bool) {
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let rerastered = cache
        .frame_with_values(surface.canvas(), doc, values, &opts(), view, ctx, false)
        .unwrap();
    (
        anchor_engine::paint::read_pixels(&mut surface, W, H),
        rerastered,
    )
}

#[test]
fn cache_cold_matches_fresh() {
    let doc = scene();
    let view = Affine::translate(200.0, 150.0);
    let mut cache = SceneCache::new(W, H);
    let context = ctx();
    // First frame is a cache-cold re-raster at `view`.
    let got = composited_to_bytes(&mut cache, &doc, &opts(), &view, &context, false, W, H)
        .expect("valid cached frame");
    assert_eq!(got, fresh_bytes(&doc, &view), "cache-cold must equal fresh");
}

#[test]
fn integer_pan_blit_matches_fresh() {
    let doc = scene();
    let ref_view = Affine::translate(200.0, 150.0);
    let panned = Affine::translate(250.0, 180.0); // +50,+30 — integer, within margin

    let mut cache = SceneCache::new(W, H);
    let context = ctx();
    // Prime at ref_view (cold), then pan: the second frame is a pure blit.
    let (_, cold_reraster) = cached_frame_bytes(&mut cache, &doc, &ref_view, &context, false);
    let (got, panned_reraster) = cached_frame_bytes(&mut cache, &doc, &panned, &context, false);
    assert!(cold_reraster, "the first frame must populate the cache");
    assert!(
        !panned_reraster,
        "an in-margin pan with one stable context must be a pure blit"
    );

    assert_eq!(
        got,
        fresh_bytes(&doc, &panned),
        "an integer-pan blit must be byte-identical to a fresh render"
    );
}

#[test]
fn zoom_forces_reraster_and_matches_fresh() {
    let doc = scene();
    let ref_view = Affine::translate(200.0, 150.0);
    let zoomed = Affine {
        a: 1.5,
        b: 0.0,
        c: 0.0,
        d: 1.5,
        e: 200.0,
        f: 150.0,
    };
    let mut cache = SceneCache::new(W, H);
    let context = ctx();
    let _ = composited_to_bytes(&mut cache, &doc, &opts(), &ref_view, &context, false, W, H)
        .expect("valid cached frame");
    // Different zoom → a bitmap blit would be wrong; the cache must re-raster.
    let got = composited_to_bytes(&mut cache, &doc, &opts(), &zoomed, &context, false, W, H)
        .expect("valid cached frame");
    assert_eq!(
        got,
        fresh_bytes(&doc, &zoomed),
        "zoom must re-raster crisply"
    );
}

#[test]
fn doc_dirty_forces_reraster_and_matches_fresh() {
    let mut doc = scene();
    let view = Affine::translate(200.0, 150.0);
    let mut cache = SceneCache::new(W, H);
    let context = ctx();
    let _ = composited_to_bytes(&mut cache, &doc, &opts(), &view, &context, false, W, H)
        .expect("valid cached frame");

    // Mutate: move the first shape. With doc_dirty the cache rebuilds + re-rasters.
    let r = resolve(&doc, &opts());
    anchor_lab::ops::apply(
        &mut doc,
        &r,
        &anchor_lab::ops::Op::SetX {
            id: 1,
            value: 400.0,
        },
    )
    .unwrap();

    let got = composited_to_bytes(&mut cache, &doc, &opts(), &view, &context, true, W, H)
        .expect("valid dirty cached frame");
    assert_eq!(
        got,
        fresh_bytes(&doc, &view),
        "a dirty re-raster must reflect the mutation"
    );
}

#[test]
fn cache_builds_text_with_the_same_shaping_oracle_as_a_fresh_frame() {
    let doc = text_scene();
    let context = font_ctx();
    let view = Affine::IDENTITY;
    let mut cache = SceneCache::new(W, H);

    let cached = composited_to_bytes(&mut cache, &doc, &opts(), &view, &context, false, W, H)
        .expect("valid cached text frame");
    let fresh = fresh_frame_bytes(&doc, &view, &context);
    assert_eq!(cached, fresh);
    assert!(cached.chunks_exact(4).any(|pixel| pixel[0] < 100));
}

#[test]
fn changing_the_context_font_invalidates_cached_text_without_document_dirtiness() {
    let doc = text_scene();
    let view = Affine::IDENTITY;
    let mut cache = SceneCache::new(W, H);
    let mut context = font_ctx();

    let (shaped, cold_reraster) = cached_frame_bytes(&mut cache, &doc, &view, &context, false);
    let (_, clean_reraster) = cached_frame_bytes(&mut cache, &doc, &view, &context, false);
    assert!(cold_reraster);
    assert!(
        !clean_reraster,
        "an unchanged environment must reuse its image"
    );
    assert!(shaped.chunks_exact(4).any(|pixel| pixel[0] < 100));

    context.set_font(None);
    let (fontless, font_reraster) = cached_frame_bytes(&mut cache, &doc, &view, &context, false);
    assert!(
        font_reraster,
        "changing the shaping environment must rebuild the drawlist"
    );
    assert_eq!(fontless, fresh_frame_bytes(&doc, &view, &context));
    assert_ne!(fontless, shaped);
}

#[test]
fn changing_resolve_options_invalidates_the_cached_resolved_scene() {
    let doc = scene();
    let context = ctx();
    let view = Affine::IDENTITY;
    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    let base = opts();

    assert!(cache
        .frame(surface.canvas(), &doc, &base, &view, &context, false)
        .unwrap());
    assert!(!cache
        .frame(surface.canvas(), &doc, &base, &view, &context, false)
        .unwrap());

    let viewport_changed = ResolveOptions {
        viewport: (base.viewport.0 + 100.0, base.viewport.1),
        ..base
    };
    assert!(cache
        .frame(
            surface.canvas(),
            &doc,
            &viewport_changed,
            &view,
            &context,
            false,
        )
        .unwrap());
    assert!(!cache
        .frame(
            surface.canvas(),
            &doc,
            &viewport_changed,
            &view,
            &context,
            false,
        )
        .unwrap());

    let rotation_changed = ResolveOptions {
        rotation_in_flow: RotationInFlow::AabbParticipates,
        ..viewport_changed
    };
    assert!(cache
        .frame(
            surface.canvas(),
            &doc,
            &rotation_changed,
            &view,
            &context,
            false,
        )
        .unwrap());
}

#[test]
fn changed_effective_values_invalidate_without_document_dirtiness() {
    let doc = scene();
    let node = doc.root + 1;
    let target = PropertyTarget::new(doc.key_of(node).unwrap(), PropertyKey::Fills);
    let blue = PropertyValues::new(
        &doc,
        [(
            target,
            PropertyValue::Paints(Paints::solid("#2563EB".into())),
        )],
    )
    .unwrap();
    let red = PropertyValues::new(
        &doc,
        [(
            target,
            PropertyValue::Paints(Paints::solid("#DC2626".into())),
        )],
    )
    .unwrap();
    let context = ctx();
    let view = Affine::IDENTITY;
    let mut cache = SceneCache::new(W, H);

    let (blue_bytes, cold) = cached_value_frame_bytes(&mut cache, &doc, &blue, &view, &context);
    let (_, reused) = cached_value_frame_bytes(&mut cache, &doc, &blue, &view, &context);
    let (red_bytes, changed) = cached_value_frame_bytes(&mut cache, &doc, &red, &view, &context);

    assert!(cold);
    assert!(
        !reused,
        "the same immutable values reuse the retained scene"
    );
    assert!(
        changed,
        "effective values invalidate without a document dirty hint"
    );
    assert_ne!(blue_bytes, red_bytes);
}

#[test]
fn a_fresh_document_arena_invalidates_even_with_empty_values() {
    let doc = scene();
    let clone = doc.clone();
    let context = ctx();
    let view = Affine::IDENTITY;
    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();

    assert!(cache
        .frame(surface.canvas(), &doc, &opts(), &view, &context, false)
        .unwrap());
    assert!(!cache
        .frame(surface.canvas(), &doc, &opts(), &view, &context, false)
        .unwrap());
    assert!(cache
        .frame(surface.canvas(), &clone, &opts(), &view, &context, false,)
        .unwrap());
    assert!(!cache
        .frame(surface.canvas(), &clone, &opts(), &view, &context, false,)
        .unwrap());
}

#[test]
fn same_rid_replacement_is_environment_damage_and_invalidates_the_cache() {
    const CHECKER: &[u8] = include_bytes!("../../../fixtures/images/checker.png");
    const STRIPES: &[u8] = include_bytes!("../../../fixtures/images/stripes.png");

    let (document, node) = image_scene();
    let view = Affine::IDENTITY;
    let mut context = ctx();
    context.insert_encoded("asset", CHECKER).unwrap();
    let before_environment = context.environment_key();
    let before = frame::resolve_and_build(&document, &opts(), &context).expect("valid frame");
    assert_eq!(before.environment(), before_environment);
    let mut cache = SceneCache::new(W, H);
    let (before_pixels, cold) = cached_frame_bytes(&mut cache, &document, &view, &context, false);
    assert!(cold);

    context.insert_encoded("asset", STRIPES).unwrap();
    let after_environment = context.environment_key();
    let after = frame::resolve_and_build(&document, &opts(), &context).expect("valid frame");
    assert_eq!(after.environment(), after_environment);
    assert!(resolved_bits_eq(before.resolved(), after.resolved()));
    assert_eq!(
        before.drawlist(),
        after.drawlist(),
        "the logical RID did not change"
    );

    let environment_damage = diff_frame(&before, &after);
    assert_eq!(environment_damage.changed, vec![node]);
    assert!(environment_damage.union_world.is_some());

    let (after_pixels, rerastered) =
        cached_frame_bytes(&mut cache, &document, &view, &context, false);
    assert!(
        rerastered,
        "resource revision invalidates without doc dirtiness"
    );
    assert_ne!(before_pixels, after_pixels);
}

#[test]
fn failed_rebuild_preserves_destination_and_previous_cache_entry() {
    let valid = scene();
    let view = Affine::IDENTITY;
    let context = ctx();
    let mut cache = SceneCache::new(W, H);

    let mut first_surface = surfaces::raster_n32_premul((W, H)).unwrap();
    first_surface.canvas().clear(SkColor::WHITE);
    assert!(cache
        .frame(
            first_surface.canvas(),
            &valid,
            &opts(),
            &view,
            &context,
            false,
        )
        .unwrap());
    let first = anchor_engine::paint::read_pixels(&mut first_surface, W, H);

    let mut invalid = valid.clone();
    let node = invalid.root + 1;
    invalid.get_mut(node).fills = Paints::new([Paint::LinearGradient(LinearGradientPaint {
        transform: Affine {
            a: 1e-20,
            b: 1e-20,
            c: 0.0,
            d: 1e-20,
            e: 0.0,
            f: 0.0,
        },
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color::BLACK,
            },
            GradientStop {
                offset: 1.0,
                color: Color(0xFFFF_FFFF),
            },
        ],
        ..Default::default()
    })]);

    let mut failed_surface = surfaces::raster_n32_premul((W, H)).unwrap();
    failed_surface.canvas().clear(SkColor::MAGENTA);
    let before_failure = anchor_engine::paint::read_pixels(&mut failed_surface, W, H);
    cache
        .frame(
            failed_surface.canvas(),
            &invalid,
            &opts(),
            &view,
            &context,
            true,
        )
        .expect_err("invalid replacement frame must fail before cache commit");
    let after_failure = anchor_engine::paint::read_pixels(&mut failed_surface, W, H);
    assert_eq!(after_failure, before_failure, "destination canvas changed");

    let mut reused_surface = surfaces::raster_n32_premul((W, H)).unwrap();
    reused_surface.canvas().clear(SkColor::WHITE);
    assert!(!cache
        .frame(
            reused_surface.canvas(),
            &valid,
            &opts(),
            &view,
            &context,
            false,
        )
        .unwrap());
    assert_eq!(
        anchor_engine::paint::read_pixels(&mut reused_surface, W, H),
        first,
        "failed rebuild replaced the prior retained frame"
    );

    let mut missing_image = valid.clone();
    let node = missing_image.root + 1;
    missing_image.get_mut(node).fills =
        Paints::new([Paint::Image(ImagePaint::from_rid("missing"))]);
    let mut image_failure_surface = surfaces::raster_n32_premul((W, H)).unwrap();
    image_failure_surface.canvas().clear(SkColor::CYAN);
    let before_image_failure = anchor_engine::paint::read_pixels(&mut image_failure_surface, W, H);
    cache
        .frame(
            image_failure_surface.canvas(),
            &missing_image,
            &opts(),
            &view,
            &context,
            true,
        )
        .expect_err("missing image must fail checked cache execution");
    assert_eq!(
        anchor_engine::paint::read_pixels(&mut image_failure_surface, W, H),
        before_image_failure,
        "image execution failure changed the destination"
    );

    let mut final_surface = surfaces::raster_n32_premul((W, H)).unwrap();
    final_surface.canvas().clear(SkColor::WHITE);
    assert!(!cache
        .frame(
            final_surface.canvas(),
            &valid,
            &opts(),
            &view,
            &context,
            false,
        )
        .unwrap());
    assert_eq!(
        anchor_engine::paint::read_pixels(&mut final_surface, W, H),
        first,
        "image execution failure replaced the prior retained frame"
    );
}
