//! Typeface acquisition for the spike. The SCENE is painted by the engine
//! (`frame::resolve_and_build` followed by `anchor_engine::paint::execute`) —
//! the spike no longer owns a scene painter. This module only supplies the
//! resolved typeface that the engine executor and the HUD text share, as an
//! engine [`PaintCtx`].

use anchor_engine::paint::PaintCtx;

/// The default paint context: the platform's legacy default typeface (the
/// same face the pre-engine painter used), or `None` — in which case text is
/// skipped, exactly as before.
pub fn paint_ctx() -> PaintCtx {
    PaintCtx::new(
        skia_safe::FontMgr::new().legacy_make_typeface(None, skia_safe::FontStyle::default()),
    )
}
