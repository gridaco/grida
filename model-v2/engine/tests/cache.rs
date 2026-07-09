//! ENG-0.2 / ENG-2 · the scene raster cache must be byte-identical to a fresh
//! render — a fast-but-wrong compositor is the one failure worse than slow.
//! Covers: cache-cold, integer-pan blit (the win path), zoom re-raster (the
//! bitmap-can't-rescale boundary), and doc-dirty re-raster.

use anchor_engine::cache::{composited_to_bytes, SceneCache};
use anchor_engine::drawlist::build;
use anchor_engine::paint::{raster_to_bytes, PaintCtx};
use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};

const W: i32 = 1360;
const H: i32 = 900;

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (2000.0, 1400.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

fn ctx() -> PaintCtx {
    PaintCtx { font: None }
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
    doc.get_mut(a).fill = Some("#4A90D9".into());
    doc.get_mut(c).fill = Some("#E2574C".into());
    doc.get_mut(e).fill = Some("#57B894".into());
    doc
}

fn fresh_bytes(doc: &Document, view: &Affine) -> Vec<u8> {
    let r = resolve(doc, &opts());
    let list = build(doc, &r);
    raster_to_bytes(&list, view, W, H, &ctx())
}

#[test]
fn cache_cold_matches_fresh() {
    let doc = scene();
    let view = Affine::translate(200.0, 150.0);
    let mut cache = SceneCache::new(W, H);
    // First frame is a cache-cold re-raster at `view`.
    let got = composited_to_bytes(&mut cache, &doc, &opts(), &view, &ctx(), false, W, H);
    assert_eq!(got, fresh_bytes(&doc, &view), "cache-cold must equal fresh");
}

#[test]
fn integer_pan_blit_matches_fresh() {
    let doc = scene();
    let ref_view = Affine::translate(200.0, 150.0);
    let panned = Affine::translate(250.0, 180.0); // +50,+30 — integer, within margin

    let mut cache = SceneCache::new(W, H);
    // Prime at ref_view (cold), then pan: the second frame is a pure blit.
    let _ = composited_to_bytes(&mut cache, &doc, &opts(), &ref_view, &ctx(), false, W, H);
    let got = composited_to_bytes(&mut cache, &doc, &opts(), &panned, &ctx(), false, W, H);

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
    let _ = composited_to_bytes(&mut cache, &doc, &opts(), &ref_view, &ctx(), false, W, H);
    // Different zoom → a bitmap blit would be wrong; the cache must re-raster.
    let got = composited_to_bytes(&mut cache, &doc, &opts(), &zoomed, &ctx(), false, W, H);
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
    let _ = composited_to_bytes(&mut cache, &doc, &opts(), &view, &ctx(), false, W, H);

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

    let got = composited_to_bytes(&mut cache, &doc, &opts(), &view, &ctx(), true, W, H);
    assert_eq!(
        got,
        fresh_bytes(&doc, &view),
        "a dirty re-raster must reflect the mutation"
    );
}
