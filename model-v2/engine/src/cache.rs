//! ENG-2 · the scene raster cache (the compositor tier).
//!
//! Rasters the scene ONCE into a backend-matched offscreen image (GPU stays
//! GPU via `Canvas::new_surface`) covering the viewport plus a margin, then
//! re-composites it under camera PANS with a single blit — turning the
//! O(nodes) `execute` wall into an O(1) image draw. It re-rasters only on a
//! runtime-document incarnation, effective-value, resolve-option, or
//! paint-environment change; a ZOOM change (a bitmap can't be crisply rescaled
//! — that is the re-raster boundary, ENG-2 growth); or a pan beyond the cached
//! margin. The cached drawlist is reused across clean camera re-rasters, so a
//! camera-only frame never re-resolves or re-builds either (the
//! retained-drawlist win folded in).
//!
//! Correctness (gate_diff L2): for an INTEGER-pixel pan the composite is
//! byte-identical to a fresh render — a shape translated by a whole pixel
//! rasterizes to identically-shifted pixels. Fractional pan resamples (a
//! visual approximation the live editor accepts, re-rastering on settle); the
//! gate proves the integer case, which is the contract.

use anchor_lab::animation::SampleError;
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeKey};
use anchor_lab::properties::{PropertyError, PropertyValues, ValueView};
use anchor_lab::resolve::{ResolveOptions, RotationInFlow};
use skia_safe::{Canvas, Color, FilterMode, Image, ImageInfo, MipmapMode, SamplingOptions};

use crate::drawlist::DrawList;
use crate::frame::{
    resolve_and_build_view, EvaluatedFrameRequest, FrameBuildError, FrameExecutionError,
    FrameRequest,
};
use crate::paint::{execute_unchecked, PaintCtx, PaintEnvironmentKey};

/// Extra content rastered around the viewport, so small pans blit without a
/// re-raster. Larger margin = fewer re-raster hitches, more offscreen memory.
const MARGIN: f32 = 256.0;

/// Failure before a value-aware cached frame can reach the destination
/// canvas. Property validation precedes resolution; frame construction then
/// preflights the exact drawlist and resolved paint boxes.
#[derive(Debug, Clone, PartialEq)]
pub enum SceneCacheError {
    Property(PropertyError),
    FrameBuild(FrameBuildError),
    FrameExecution(FrameExecutionError),
}

impl std::fmt::Display for SceneCacheError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SceneCacheError::Property(error) => error.fmt(f),
            SceneCacheError::FrameBuild(error) => error.fmt(f),
            SceneCacheError::FrameExecution(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for SceneCacheError {}

impl From<PropertyError> for SceneCacheError {
    fn from(error: PropertyError) -> Self {
        SceneCacheError::Property(error)
    }
}

impl From<FrameBuildError> for SceneCacheError {
    fn from(error: FrameBuildError) -> Self {
        SceneCacheError::FrameBuild(error)
    }
}

impl From<FrameExecutionError> for SceneCacheError {
    fn from(error: FrameExecutionError) -> Self {
        SceneCacheError::FrameExecution(error)
    }
}

/// Failure at the explicit Base/Sample cache seam. Sampling completes before
/// cache comparison or destination drawing.
#[derive(Debug, Clone, PartialEq)]
pub enum SceneCacheRequestError {
    Sample(SampleError),
    Cache(SceneCacheError),
}

impl std::fmt::Display for SceneCacheRequestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SceneCacheRequestError::Sample(error) => error.fmt(f),
            SceneCacheRequestError::Cache(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for SceneCacheRequestError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SceneCacheRequestError::Sample(error) => Some(error),
            SceneCacheRequestError::Cache(error) => Some(error),
        }
    }
}

impl From<SampleError> for SceneCacheRequestError {
    fn from(error: SampleError) -> Self {
        SceneCacheRequestError::Sample(error)
    }
}

impl From<SceneCacheError> for SceneCacheRequestError {
    fn from(error: SceneCacheError) -> Self {
        SceneCacheRequestError::Cache(error)
    }
}

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
    environment_key: Option<PaintEnvironmentKey>,
    /// Layout options are part of resolved-scene identity even when the camera
    /// and document are unchanged.
    opts_key: Option<ResolveOptionsKey>,
    /// Arena-scoped scene identity. Exact empty values are shared by all
    /// static documents, so values alone cannot detect document replacement.
    scene_key: Option<NodeKey>,
    /// Exact immutable effective values used to build `list`. Comparing the
    /// data itself keeps correctness independent from a caller-supplied dirty
    /// hint; the empty set is the static path's canonical cache key.
    values_key: PropertyValues,
}

impl SceneCache {
    pub fn new(vw: i32, vh: i32) -> Self {
        SceneCache {
            image: None,
            list: None,
            ref_view: Affine::IDENTITY,
            vw,
            vh,
            environment_key: None,
            opts_key: None,
            scene_key: None,
            values_key: PropertyValues::default(),
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
    ) -> Result<bool, SceneCacheError> {
        let values = PropertyValues::default();
        self.frame_view(
            canvas,
            &ValueView::base(doc),
            &values,
            opts,
            view,
            ctx,
            doc_dirty,
        )
    }

    /// Composite one explicit Base or Sample request. Time itself never enters
    /// the cache key: the sampled `PropertyValues` is the complete visual key.
    pub fn frame_request(
        &mut self,
        canvas: &Canvas,
        doc: &Document,
        request: FrameRequest<'_>,
        opts: &ResolveOptions,
        view: &Affine,
        ctx: &PaintCtx,
        doc_dirty: bool,
    ) -> Result<bool, SceneCacheRequestError> {
        match request.evaluate(doc)? {
            EvaluatedFrameRequest::Base => self
                .frame(canvas, doc, opts, view, ctx, doc_dirty)
                .map_err(Into::into),
            EvaluatedFrameRequest::Sample { values } => self
                .frame_with_values(canvas, doc, &values, opts, view, ctx, doc_dirty)
                .map_err(Into::into),
        }
    }

    /// Composite one frame with immutable effective property values. Invalid
    /// or stale targets fail before cache comparison or raster work. A changed
    /// value set rebuilds the retained drawlist even when `doc_dirty` is
    /// false.
    pub fn frame_with_values(
        &mut self,
        canvas: &Canvas,
        doc: &Document,
        values: &PropertyValues,
        opts: &ResolveOptions,
        view: &Affine,
        ctx: &PaintCtx,
        doc_dirty: bool,
    ) -> Result<bool, SceneCacheError> {
        let value_view = ValueView::new(doc, values)?;
        self.frame_view(canvas, &value_view, values, opts, view, ctx, doc_dirty)
    }

    fn frame_view(
        &mut self,
        canvas: &Canvas,
        values: &ValueView<'_>,
        values_key: &PropertyValues,
        opts: &ResolveOptions,
        view: &Affine,
        ctx: &PaintCtx,
        doc_dirty: bool,
    ) -> Result<bool, SceneCacheError> {
        let document = values.document();
        let scene_key = document
            .key_of(document.root)
            .expect("a render document has one live implicit root");
        let dx = view.e - self.ref_view.e;
        let dy = view.f - self.ref_view.f;
        let same_zoom = view.a == self.ref_view.a
            && view.b == self.ref_view.b
            && view.c == self.ref_view.c
            && view.d == self.ref_view.d;
        let rebuild_list = doc_dirty
            || self.list.is_none()
            || self.environment_key != Some(ctx.environment_key())
            || self.opts_key != Some(opts.into())
            || self.scene_key != Some(scene_key)
            || self.values_key != *values_key;
        let reraster = self.image.is_none()
            || rebuild_list
            || !same_zoom
            || dx.abs() > MARGIN
            || dy.abs() > MARGIN;

        if reraster {
            self.raster(canvas, values, values_key, opts, view, ctx, rebuild_list)?;
        }

        // Blit the cached image at the (now possibly zero) integer pan offset.
        let (dx, dy) = (view.e - self.ref_view.e, view.f - self.ref_view.f);
        let img = self.image.as_ref().expect("image present after raster");
        // Nearest sampling: for an integer offset each dest pixel maps to exactly
        // one src pixel (byte-exact); it never silently blurs at non-integer.
        let sampling = SamplingOptions::new(FilterMode::Nearest, MipmapMode::None);
        canvas.draw_image_with_sampling_options(img, (-MARGIN + dx, -MARGIN + dy), sampling, None);
        Ok(reraster)
    }

    /// (Re)render the scene into a fresh backend-matched offscreen image sized
    /// viewport + 2·margin, shifted by +margin so screen (0,0) lands at image
    /// pixel (margin, margin).
    fn raster(
        &mut self,
        canvas: &Canvas,
        values: &ValueView<'_>,
        values_key: &PropertyValues,
        opts: &ResolveOptions,
        view: &Affine,
        ctx: &PaintCtx,
        rebuild_list: bool,
    ) -> Result<(), SceneCacheError> {
        let rebuilt = if rebuild_list {
            let product = resolve_and_build_view(values, opts, ctx)?;
            let (_, list, environment) = product.into_parts();
            Some((list, environment))
        } else {
            None
        };
        let environment_key = rebuilt
            .as_ref()
            .map(|(_, environment)| *environment)
            .unwrap_or_else(|| ctx.environment_key());
        let list = rebuilt
            .as_ref()
            .map(|(list, _)| list)
            .or(self.list.as_ref())
            .expect("a clean cache re-raster retains its drawlist");

        let mut shifted = *view;
        shifted.e += MARGIN;
        shifted.f += MARGIN;
        crate::paint::preflight_images(list, &shifted, ctx).map_err(FrameExecutionError::from)?;

        let m = MARGIN as i32;
        let info = ImageInfo::new_n32_premul((self.vw + 2 * m, self.vh + 2 * m), None);
        let mut off = canvas
            .new_surface(&info, None)
            .expect("backend-matched offscreen surface");
        let oc = off.canvas();
        oc.clear(Color::WHITE);
        assert_eq!(
            environment_key,
            ctx.environment_key(),
            "retained drawlist paint environment changed before cache replay"
        );
        execute_unchecked(oc, list, &shifted, ctx);

        let image = off.image_snapshot();

        // Commit every cache field only after build, preflight, and offscreen
        // replay have all succeeded. A fallible rebuild therefore leaves the
        // prior retained frame usable and the destination canvas untouched.
        if let Some((list, _)) = rebuilt {
            self.list = Some(list);
        }
        self.image = Some(image);
        self.ref_view = *view;
        self.environment_key = Some(environment_key);
        self.opts_key = Some(opts.into());
        let document = values.document();
        self.scene_key = document.key_of(document.root);
        self.values_key = values_key.clone();
        Ok(())
    }
}

/// Render one composited frame to a fresh raster surface and return its bytes —
/// the optimized side of the gate_diff L2 row. Pairs with
/// [`crate::paint::raster_to_bytes_unchecked`] (the low-level reference). A
/// fresh cache is passed so
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
) -> Result<Vec<u8>, SceneCacheError> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    cache.frame(canvas, doc, opts, view, ctx, doc_dirty)?;
    Ok(crate::paint::read_pixels(&mut surface, w, h))
}

/// Value-aware counterpart to [`composited_to_bytes`].
pub fn composited_to_bytes_with_values(
    cache: &mut SceneCache,
    doc: &Document,
    values: &PropertyValues,
    opts: &ResolveOptions,
    view: &Affine,
    ctx: &PaintCtx,
    doc_dirty: bool,
    w: i32,
    h: i32,
) -> Result<Vec<u8>, SceneCacheError> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    cache.frame_with_values(canvas, doc, values, opts, view, ctx, doc_dirty)?;
    Ok(crate::paint::read_pixels(&mut surface, w, h))
}
