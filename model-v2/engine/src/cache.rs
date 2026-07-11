//! ENG-2 · the scene raster cache (the compositor tier).
//!
//! Rasters the scene ONCE into a backend-matched offscreen image (GPU stays
//! GPU via `Canvas::new_surface`) covering the viewport plus a margin, then
//! re-composites it under camera PANS with a single blit — turning the
//! O(nodes) `execute` wall into an O(1) image draw. It re-rasters only on a
//! document, resolve-option, or resource-environment change; a ZOOM change (a
//! bitmap can't be crisply rescaled — that is the re-raster boundary, ENG-2
//! growth); or a pan beyond the cached margin. The cached drawlist is reused
//! across clean camera re-rasters, so a camera-only frame never re-resolves or
//! re-builds either (the retained-drawlist win folded in).
//!
//! Correctness (gate_diff L2): for an INTEGER-pixel pan the composite is
//! byte-identical to a fresh render — a shape translated by a whole pixel
//! rasterizes to identically-shifted pixels. Fractional pan resamples (a
//! visual approximation the live editor accepts, re-rastering on settle); the
//! gate proves the integer case, which is the contract.

use anchor_lab::math::Affine;
use anchor_lab::model::Document;
use anchor_lab::resolve::{ResolveOptions, RotationInFlow};
use skia_safe::{Canvas, Color, FilterMode, Image, ImageInfo, MipmapMode, SamplingOptions};

use crate::drawlist::DrawList;
use crate::frame::resolve_and_build;
use crate::paint::{execute, PaintCtx};

/// Extra content rastered around the viewport, so small pans blit without a
/// re-raster. Larger margin = fewer re-raster hitches, more offscreen memory.
const MARGIN: f32 = 256.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ResolveOptionsKey {
    viewport_width: u32,
    viewport_height: u32,
    rotation_in_flow: RotationInFlow,
}

impl From<&ResolveOptions> for ResolveOptionsKey {
    fn from(options: &ResolveOptions) -> Self {
        Self {
            viewport_width: options.viewport.0.to_bits(),
            viewport_height: options.viewport.1.to_bits(),
            rotation_in_flow: options.rotation_in_flow,
        }
    }
}

/// The scene compositor. Holds a cached image (backend-matched) and the view
/// it was rastered at.
pub struct SceneCache {
    image: Option<Image>,
    /// The drawlist the cached image was rendered from — reused across clean
    /// camera re-rasters (pan-out / zoom). Semantic input changes rebuild it.
    list: Option<DrawList>,
    ref_view: Affine,
    vw: i32,
    vh: i32,
    /// Resource environment under which the drawlist was resolved and rastered.
    /// The drawlist retains exact text fonts, but a different or revised host
    /// context requests a new semantic resolution rather than stale reuse.
    ctx_id: Option<(u64, u64)>,
    /// Layout options are part of resolved-scene identity even when the camera
    /// and document are unchanged.
    opts_key: Option<ResolveOptionsKey>,
}

impl SceneCache {
    pub fn new(vw: i32, vh: i32) -> Self {
        SceneCache {
            image: None,
            list: None,
            ref_view: Affine::IDENTITY,
            vw,
            vh,
            ctx_id: None,
            opts_key: None,
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
        let rebuild_list = doc_dirty
            || self.list.is_none()
            || self.ctx_id != Some(ctx.identity())
            || self.opts_key != Some(opts.into());
        let reraster = self.image.is_none()
            || rebuild_list
            || !same_zoom
            || dx.abs() > MARGIN
            || dy.abs() > MARGIN;

        if reraster {
            self.raster(canvas, doc, opts, view, ctx, rebuild_list);
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
        rebuild_list: bool,
    ) {
        if rebuild_list {
            let (_, list) = resolve_and_build(doc, opts, ctx);
            self.list = Some(list);
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
        self.ctx_id = Some(ctx.identity());
        self.opts_key = Some(opts.into());
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
