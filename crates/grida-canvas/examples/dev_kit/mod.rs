//! Shared scaffolding for `golden_*` example binaries.
//!
//! Eliminates the recurring boilerplate around surface allocation,
//! embedded typefaces, font collections, and PNG snapshotting so that
//! each golden focuses on the scene under test, and renames in the
//! `cg` crate stay invisible to example call sites.
//!
//! Intentionally narrow — only the patterns observed across the
//! existing golden examples. Extend with care.
#![allow(dead_code)]

use skia_safe::textlayout::{FontCollection, TypefaceFontProvider};
use skia_safe::{surfaces, Color, EncodedImageFormat, FontMgr, Surface, Typeface};
use std::path::PathBuf;

/// Allocate an `n32_premul` raster surface of `(width, height)` and
/// clear the canvas to `clear_color`.
pub(crate) fn raster_surface(width: i32, height: i32, clear_color: Color) -> Surface {
    let mut surface =
        surfaces::raster_n32_premul((width, height)).expect("raster_n32_premul surface");
    surface.canvas().clear(clear_color);
    surface
}

/// `Typeface` for the embedded Geist font.
pub(crate) fn geist_typeface() -> Typeface {
    cg::embedded_fonts::typeface(cg::embedded_fonts::geist::BYTES)
}

/// `Typeface` for the embedded GeistMono font.
pub(crate) fn geistmono_typeface() -> Typeface {
    cg::embedded_fonts::typeface(cg::embedded_fonts::geistmono::BYTES)
}

pub(crate) use cg::embedded_fonts::geist::FAMILY as GEIST_FAMILY;
pub(crate) use cg::embedded_fonts::geistmono::FAMILY as GEISTMONO_FAMILY;

/// `FontCollection` pre-loaded with `Geist` and `Geist Mono`, suitable
/// for paragraph layout in golden examples.
pub(crate) fn default_font_collection() -> FontCollection {
    let font_mgr = FontMgr::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(geist_typeface(), Some(GEIST_FAMILY));
    provider.register_typeface(geistmono_typeface(), Some(GEISTMONO_FAMILY));
    let mut fc = FontCollection::new();
    fc.set_asset_font_manager(Some(provider.into()));
    fc.set_default_font_manager(font_mgr, None);
    fc
}

/// Snapshot `surface` and write the PNG to
/// `<CARGO_MANIFEST_DIR>/goldens/<name>.png`.
pub(crate) fn save_golden(surface: &mut Surface, name: &str) {
    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode png");
    let path: PathBuf = [
        env!("CARGO_MANIFEST_DIR"),
        "goldens",
        &format!("{name}.png"),
    ]
    .iter()
    .collect();
    std::fs::write(&path, data.as_bytes())
        .unwrap_or_else(|e| panic!("write {}: {e}", path.display()));
}
