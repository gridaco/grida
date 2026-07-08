//! ENG-2 · the scene raster cache (the compositor tier).
//!
//! Rasters the scene ONCE into a backend-matched offscreen image (GPU stays
//! GPU via `Canvas::new_surface`) covering the viewport plus a margin, then
//! re-composites it under camera PANS with a single blit — turning the
//! O(nodes) `execute` wall into an O(1) image draw. It re-rasters only on a
//! document change, a ZOOM change (a bitmap can't be crisply rescaled — that
//! is the re-raster boundary, ENG-2 growth), or a pan beyond the cached
//! margin. The cached drawlist is reused across clean re-rasters, so a
//! camera-only frame never re-resolves or re-builds either (the retained-
//! drawlist win folded in).
//!
//! Correctness (gate_diff L2): for an INTEGER-pixel pan the composite is
//! byte-identical to a fresh render — a shape translated by a whole pixel
//! rasterizes to identically-shifted pixels. Fractional pan resamples (a
//! visual approximation the live editor accepts, re-rastering on settle); the
//! gate proves the integer case, which is the contract.

use anchor_lab::math::Affine;
use anchor_lab::model::Document;
use anchor_lab::resolve::{resolve, ResolveOptions};
use skia_safe::{Canvas, Color, FilterMode, Image, ImageInfo, MipmapMode, SamplingOptions};

use crate::drawlist::{build, DrawList};
use crate::paint::{execute, PaintCtx};

/// Extra content rastered around the viewport, so small pans blit without a
/// re-raster. Larger margin = fewer re-raster hitches, more offscreen memory.
const MARGIN: f32 = 256.0;

/// The scene compositor. Holds a cached image (backend-matched) and the view
/// it was rastered at.
pub struct SceneCache {
    image: Option<Image>,
    /// The drawlist the cached image was rendered from — reused across clean
    /// re-rasters (pan-out / zoom) so only a doc change rebuilds it.
    list: Option<DrawList>,
    ref_view: Affine,
    vw: i32,
    vh: i32,
}

impl SceneCache {
    pub fn new(vw: i32, vh: i32) -> Self {
        SceneCache {
            image: None,
            list: None,
            ref_view: Affine::IDENTITY,
            vw,
            vh,
        }
    }

    /// Composite the scene for `view` onto `canvas`. `doc_dirty` = the host
    /// mutated the document since the last frame (it knows: it applied an op).
    /// Returns `true` if this frame re-rastered (a diagnostic for the probe;
    /// the amortized win is that most frames return `false`).
    pub fn frame(
        &mut self,
        canvas: &Canvas,
        doc: &Document,
        opts: &ResolveOptions,
        view: &Affine,
        ctx: &PaintCtx,
        doc_dirty: bool,
    ) -> bool {
        let dx = view.e - self.ref_view.e;
        let dy = view.f - self.ref_view.f;
        let same_zoom = view.a == self.ref_view.a
            && view.b == self.ref_view.b
            && view.c == self.ref_view.c
            && view.d == self.ref_view.d;
        let reraster = self.image.is_none()
            || doc_dirty
            || !same_zoom
            || dx.abs() > MARGIN
            || dy.abs() > MARGIN;

        if reraster {
            self.raster(canvas, doc, opts, view, ctx, doc_dirty);
        }

        // Blit the cached image at the (now possibly zero) integer pan offset.
        let (dx, dy) = (view.e - self.ref_view.e, view.f - self.ref_view.f);
        let img = self.image.as_ref().expect("image present after raster");
        // Nearest sampling: for an integer offset each dest pixel maps to exactly
        // one src pixel (byte-exact); it never silently blurs at non-integer.
        let sampling = SamplingOptions::new(FilterMode::Nearest, MipmapMode::None);
        canvas.draw_image_with_sampling_options(img, (-MARGIN + dx, -MARGIN + dy), sampling, None);
        reraster
    }

    /// (Re)render the scene into a fresh backend-matched offscreen image sized
    /// viewport + 2·margin, shifted by +margin so screen (0,0) lands at image
    /// pixel (margin, margin).
    fn raster(
        &mut self,
        canvas: &Canvas,
        doc: &Document,
        opts: &ResolveOptions,
        view: &Affine,
        ctx: &PaintCtx,
        doc_dirty: bool,
    ) {
        if doc_dirty || self.list.is_none() {
            let resolved = resolve(doc, opts);
            self.list = Some(build(doc, &resolved));
        }
        let list = self.list.as_ref().unwrap();

        let m = MARGIN as i32;
        let info = ImageInfo::new_n32_premul((self.vw + 2 * m, self.vh + 2 * m), None);
        let mut off = canvas
            .new_surface(&info, None)
            .expect("backend-matched offscreen surface");
        let oc = off.canvas();
        oc.clear(Color::WHITE);
        let mut shifted = *view;
        shifted.e += MARGIN;
        shifted.f += MARGIN;
        execute(oc, list, &shifted, ctx);

        self.image = Some(off.image_snapshot());
        self.ref_view = *view;
    }
}

/// Render one composited frame to a fresh raster surface and return its bytes —
/// the optimized side of the gate_diff L2 row. Pairs with
/// [`crate::paint::raster_to_bytes`] (the reference). A fresh cache is passed so
/// the first frame is a cache-cold re-raster; call twice with panned views to
/// exercise the blit path.
pub fn composited_to_bytes(
    cache: &mut SceneCache,
    doc: &Document,
    opts: &ResolveOptions,
    view: &Affine,
    ctx: &PaintCtx,
    doc_dirty: bool,
    w: i32,
    h: i32,
) -> Vec<u8> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    cache.frame(canvas, doc, opts, view, ctx, doc_dirty);
    crate::paint::read_pixels(&mut surface, w, h)
}
