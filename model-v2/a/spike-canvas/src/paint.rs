//! Typeface acquisition for the spike. The SCENE is painted by the engine
//! (`frame::resolve_and_build` followed by checked `FrameProduct::execute`) —
//! the spike no longer owns a scene painter. This module only supplies the
//! resolved typeface that the engine executor and the HUD text share, as an
//! engine [`PaintCtx`].

use anchor_engine::paint::PaintCtx;

/// The deterministic spike and shot-gate paint context. The bundled face
/// keeps text measurement, shaping, and antialiasing independent of the host
/// machine's default-font configuration.
pub fn paint_ctx() -> PaintCtx {
    const INTER: &[u8] =
        include_bytes!("../../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
    let typeface = skia_safe::FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface");
    PaintCtx::new(Some(typeface))
}
