//! ENG-2.4 socket · the one frame entry point. `render(...)` (step 6)
//! runs `resolve -> build -> execute` and returns one immutable
//! [`FrameProduct`] plus timings — the host clears the canvas and paints its
//! own chrome around this, never the other way round (the compositor owns
//! pacing; the host adapts). Kept a single seam so the fragmented tick/redraw
//! rot the legacy `FrameLoop` unified never regrows.

use anchor_lab::math::Affine;
use anchor_lab::model::Document;
use anchor_lab::properties::ValueView;
use anchor_lab::resolve::{
    resolve_view_with_text_layout, resolve_with_text_layout, ResolveOptions, Resolved,
};
use std::time::Instant;

use crate::drawlist::{build_with_text_fonts, build_with_text_fonts_view, DrawList};
use crate::paint::{raster_to_bytes_unchecked, PaintCtx, PaintEnvironmentKey};
use crate::query::Query;
use crate::text_layout::SkiaTextLayoutOracle;

/// A retained frame was asked to raster under a host resource environment
/// other than the one used to resolve and build it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PaintEnvironmentMismatch {
    pub expected: PaintEnvironmentKey,
    pub actual: PaintEnvironmentKey,
}

impl std::fmt::Display for PaintEnvironmentMismatch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "frame paint environment mismatch: expected {:?}, found {:?}",
            self.expected, self.actual
        )
    }
}

impl std::error::Error for PaintEnvironmentMismatch {}

/// Frame construction failed after resolution and exact drawlist projection,
/// before the complete product was minted or any canvas command was issued.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameBuildError {
    Gradient(crate::paint::GradientPreflightError),
}

impl std::fmt::Display for FrameBuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FrameBuildError::Gradient(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for FrameBuildError {}

impl From<crate::paint::GradientPreflightError> for FrameBuildError {
    fn from(error: crate::paint::GradientPreflightError) -> Self {
        FrameBuildError::Gradient(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameExecutionError {
    Environment(PaintEnvironmentMismatch),
    Image(crate::paint::ImagePreflightError),
}

impl std::fmt::Display for FrameExecutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FrameExecutionError::Environment(error) => error.fmt(f),
            FrameExecutionError::Image(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for FrameExecutionError {}

impl From<PaintEnvironmentMismatch> for FrameExecutionError {
    fn from(error: PaintEnvironmentMismatch) -> Self {
        FrameExecutionError::Environment(error)
    }
}

impl From<crate::paint::ImagePreflightError> for FrameExecutionError {
    fn from(error: crate::paint::ImagePreflightError) -> Self {
        FrameExecutionError::Image(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameError {
    Build(FrameBuildError),
    Execution(FrameExecutionError),
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FrameError::Build(error) => error.fmt(f),
            FrameError::Execution(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for FrameError {}

impl From<FrameBuildError> for FrameError {
    fn from(error: FrameBuildError) -> Self {
        FrameError::Build(error)
    }
}

impl From<FrameExecutionError> for FrameError {
    fn from(error: FrameExecutionError) -> Self {
        FrameError::Execution(error)
    }
}

/// One immutable semantic frame result.
///
/// The paint-environment snapshot belongs beside the resolved tier and
/// drawlist: decoded image bytes can change pixels without changing either
/// structural product. Keeping all three together makes complete damage
/// comparison impossible to call with a key captured from the wrong frame.
#[derive(Debug, Clone)]
pub struct FrameProduct {
    resolved: Resolved,
    drawlist: DrawList,
    environment: PaintEnvironmentKey,
}

impl FrameProduct {
    pub fn resolved(&self) -> &Resolved {
        &self.resolved
    }

    pub fn drawlist(&self) -> &DrawList {
        &self.drawlist
    }

    pub fn environment(&self) -> PaintEnvironmentKey {
        self.environment
    }

    /// Spatial reads consume the traversal and effective clip state captured
    /// in this product's resolved tier. No document or value view can be paired
    /// with the wrong frame.
    pub fn query(&self) -> Query<'_> {
        Query::new(&self.resolved)
    }

    fn check_environment(&self, ctx: &PaintCtx) -> Result<(), PaintEnvironmentMismatch> {
        let actual = ctx.environment_key();
        if actual == self.environment {
            Ok(())
        } else {
            Err(PaintEnvironmentMismatch {
                expected: self.environment,
                actual,
            })
        }
    }

    /// Replay this product only under the exact paint environment captured
    /// while it was built. Environment mismatch or a view-dependent image
    /// sampling capability failure occurs before any draw command reaches the
    /// canvas.
    pub fn execute(
        &self,
        canvas: &skia_safe::Canvas,
        view: &Affine,
        ctx: &PaintCtx,
    ) -> Result<(), FrameExecutionError> {
        self.check_environment(ctx)?;
        crate::paint::preflight_images(&self.drawlist, view, ctx)?;
        crate::paint::execute_unchecked(canvas, &self.drawlist, view, ctx);
        Ok(())
    }

    /// Checked raster-byte reference for a complete product. Execution
    /// preflight completes before the temporary surface is allocated or
    /// cleared.
    pub fn raster_to_bytes(
        &self,
        view: &Affine,
        w: i32,
        h: i32,
        ctx: &PaintCtx,
    ) -> Result<Vec<u8>, FrameExecutionError> {
        self.check_environment(ctx)?;
        crate::paint::preflight_images(&self.drawlist, view, ctx)?;
        Ok(raster_to_bytes_unchecked(&self.drawlist, view, w, h, ctx))
    }

    /// Explicitly dismantle a complete product when a host needs to retain
    /// its independently owned parts. This forfeits checked execution: the
    /// caller must keep the returned environment key coupled to the drawlist.
    /// There is deliberately no public inverse constructor; only the frame
    /// seam can mint a complete product.
    pub fn into_parts(self) -> (Resolved, DrawList, PaintEnvironmentKey) {
        (self.resolved, self.drawlist, self.environment)
    }
}

/// Per-frame timings for the three pipeline seams (nanoseconds). Populated
/// by the same spans [`crate::trace`] reads when the `trace` feature is on;
/// always cheap enough to compute unconditionally here.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct FrameStats {
    pub resolve_ns: u128,
    pub build_ns: u128,
    pub execute_ns: u128,
}

/// Resolve a document with the host text environment and build a replayable
/// drawlist that owns every exact font selected during shaping.
///
/// This is the public non-rasterizing stage boundary. Callers that need stage
/// retained lists or custom surfaces use it instead of combining the glyphless
/// compatibility resolver with [`crate::drawlist::build_glyphless_unchecked`].
pub fn resolve_and_build(
    doc: &Document,
    opts: &ResolveOptions,
    ctx: &PaintCtx,
) -> Result<FrameProduct, FrameBuildError> {
    resolve_and_build_profiled(doc, opts, ctx).map(|(product, _)| product)
}

/// Resolve and build from one validated authored-plus-effective-value view.
/// The same immutable view feeds both stages, so paint intent cannot drift
/// from the geometry that was resolved for it.
pub fn resolve_and_build_view(
    view: &ValueView<'_>,
    opts: &ResolveOptions,
    ctx: &PaintCtx,
) -> Result<FrameProduct, FrameBuildError> {
    resolve_and_build_view_profiled(view, opts, ctx).map(|(product, _)| product)
}

fn resolve_and_build_profiled(
    doc: &Document,
    opts: &ResolveOptions,
    ctx: &PaintCtx,
) -> Result<(FrameProduct, FrameStats), FrameBuildError> {
    let t0 = Instant::now();
    let text_layout = SkiaTextLayoutOracle::new(ctx);
    let resolved = resolve_with_text_layout(doc, opts, &text_layout);
    let t1 = Instant::now();
    let list = build_with_text_fonts(doc, &resolved, text_layout.font_registry());
    crate::paint::preflight_gradients(&list)?;
    let t2 = Instant::now();
    Ok((
        FrameProduct {
            resolved,
            drawlist: list,
            environment: ctx.environment_key(),
        },
        FrameStats {
            resolve_ns: (t1 - t0).as_nanos(),
            build_ns: (t2 - t1).as_nanos(),
            execute_ns: 0,
        },
    ))
}

fn resolve_and_build_view_profiled(
    view: &ValueView<'_>,
    opts: &ResolveOptions,
    ctx: &PaintCtx,
) -> Result<(FrameProduct, FrameStats), FrameBuildError> {
    let t0 = Instant::now();
    let text_layout = SkiaTextLayoutOracle::new(ctx);
    let resolved = resolve_view_with_text_layout(view, opts, &text_layout);
    let t1 = Instant::now();
    let list = build_with_text_fonts_view(view, &resolved, text_layout.font_registry());
    crate::paint::preflight_gradients(&list)?;
    let t2 = Instant::now();
    Ok((
        FrameProduct {
            resolved,
            drawlist: list,
            environment: ctx.environment_key(),
        },
        FrameStats {
            resolve_ns: (t1 - t0).as_nanos(),
            build_ns: (t2 - t1).as_nanos(),
            execute_ns: 0,
        },
    ))
}

/// The one frame entry: `resolve -> build -> execute`, immediate, no caches
/// (the spike's proven thesis). The host clears the canvas and paints its own
/// chrome around this; it never reaches into the stages. Returns the complete
/// immutable product (the host reuses it for HUD/pick/damage) plus timings.
/// The only skia this module names is the `Canvas` it hands to the executor —
/// all raster work stays in [`crate::paint`] (S-1).
pub fn render(
    canvas: &skia_safe::Canvas,
    doc: &Document,
    opts: &ResolveOptions,
    view: &Affine,
    ctx: &PaintCtx,
) -> Result<(FrameProduct, FrameStats), FrameError> {
    let (product, mut stats) = resolve_and_build_profiled(doc, opts, ctx)?;
    let t0 = Instant::now();
    product.execute(canvas, view, ctx)?;
    stats.execute_ns = t0.elapsed().as_nanos();
    Ok((product, stats))
}

/// Render one frame from one validated authored-plus-effective-value view.
/// This is still the full reference pipeline: values do not select an
/// incremental or compositor-only semantic path.
pub fn render_view(
    canvas: &skia_safe::Canvas,
    values: &ValueView<'_>,
    opts: &ResolveOptions,
    view: &Affine,
    ctx: &PaintCtx,
) -> Result<(FrameProduct, FrameStats), FrameError> {
    let (product, mut stats) = resolve_and_build_view_profiled(values, opts, ctx)?;
    let t0 = Instant::now();
    product.execute(canvas, view, ctx)?;
    stats.execute_ns = t0.elapsed().as_nanos();
    Ok((product, stats))
}
