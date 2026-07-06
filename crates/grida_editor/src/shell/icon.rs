//! Lucide icon glyphs for the egui chrome.
//!
//! egui renders icons as font glyphs (it has no native SVG path). We embed
//! the official **Lucide** icon font — the same set the web editor uses —
//! and expose the icons the chrome actually draws as semantic `char`
//! constants, so call sites never carry raw codepoints.
//!
//! ## Source of truth
//!
//! [`BYTES`] is the pinned **Lucide v1.23.0** TrueType font (ISC, see
//! `assets/lucide/NOTICE.md`). It is registered with egui as its own font
//! family [`FAMILY`] in [`super::install_egui_fonts`] — deliberately *not*
//! a Proportional/Monospace fallback, so egui's bundled fonts can't shadow
//! its Private-Use-Area codepoints.
//!
//! The font embeds its glyph names, so it is *also* the complete
//! name→codepoint authority — there is no separate map file. To add an
//! icon, look up its codepoint in the vendored font (its cmap keys glyphs
//! by the Lucide slug, e.g. `chevron-right` → `U+E06F`) and add a `const`
//! below named with the same slug. The `every_icon_has_a_glyph` unit test
//! asserts every constant resolves to a real glyph, so a wrong codepoint
//! fails the suite rather than shipping tofu.
//!
//! This module is a faithful, agnostic mirror of Lucide: editor-semantic
//! choices (which icon a *tool* uses) live at the call site, never here.

/// The embedded Lucide icon font (pinned v1.23.0, ISC).
pub(crate) static BYTES: &[u8] = include_bytes!("../../assets/lucide/lucide.ttf");

/// The egui font-family name the icons are registered under.
pub(crate) static FAMILY: &str = "lucide";

// ── Icon codepoints (Lucide slugs, U+Exxx Private Use Area) ───────────
// Add here as the chrome adopts more icons; keep names = Lucide slugs.

/// `mouse-pointer-2` — the cursor / select tool.
pub(crate) const MOUSE_POINTER_2: char = '\u{E1C3}';
/// `square` — the rectangle tool.
pub(crate) const SQUARE: char = '\u{E167}';
/// `circle` — the ellipse tool.
pub(crate) const CIRCLE: char = '\u{E076}';
/// `triangle` — the polygon tool.
pub(crate) const TRIANGLE: char = '\u{E192}';
/// `frame` — the container / frame tool.
pub(crate) const FRAME: char = '\u{E291}';
/// `type` — the text tool.
pub(crate) const TYPE: char = '\u{E198}';
/// `minus` — the line tool.
pub(crate) const MINUS: char = '\u{E11C}';
/// `move-up-right` — the arrow (line with head) tool.
pub(crate) const MOVE_UP_RIGHT: char = '\u{E493}';
/// `pencil` — the pencil tool.
pub(crate) const PENCIL: char = '\u{E1F9}';
/// `pen-tool` — the vector pen (bezier) tool.
pub(crate) const PEN_TOOL: char = '\u{E131}';
/// `chevron-right` — a collapsed disclosure.
pub(crate) const CHEVRON_RIGHT: char = '\u{E06F}';
/// `chevron-down` — an expanded disclosure.
pub(crate) const CHEVRON_DOWN: char = '\u{E06D}';
/// `plus` — a list-section add control.
pub(crate) const PLUS: char = '\u{E13D}';
/// `x` — a list-row remove control.
pub(crate) const X: char = '\u{E1B2}';

// Node-type icons (hierarchy row faces). Rectangle/Ellipse/Polygon/
// Line/Text/Vector reuse the tool glyphs above.
/// `group` — a group node.
pub(crate) const GROUP: char = '\u{E464}';
/// `combine` — a boolean-operation node.
pub(crate) const COMBINE: char = '\u{E44C}';
/// `star` — a star polygon node.
pub(crate) const STAR: char = '\u{E176}';
/// `image` — an image node.
pub(crate) const IMAGE: char = '\u{E0F6}';
/// `box` — the generic fallback (embeds, error, unknown).
pub(crate) const BOX: char = '\u{E061}';

/// Every icon constant, for the `icon_font` guard test.
#[cfg(test)]
pub(crate) const ALL: &[char] = &[
    MOUSE_POINTER_2,
    SQUARE,
    CIRCLE,
    TRIANGLE,
    FRAME,
    TYPE,
    MINUS,
    MOVE_UP_RIGHT,
    PENCIL,
    PEN_TOOL,
    CHEVRON_RIGHT,
    CHEVRON_DOWN,
    PLUS,
    X,
    GROUP,
    COMBINE,
    STAR,
    IMAGE,
    BOX,
];

/// The Lucide font family, for the low-level painter path
/// (`Painter::text`, which takes a `FontId` rather than styled text).
pub(crate) fn font_id(size: f32) -> egui::FontId {
    egui::FontId::new(size, egui::FontFamily::Name(FAMILY.into()))
}

/// An icon glyph as styled text — the single owner of "icon → text in the
/// Lucide family". Used at widget call sites (`Button`, `selectable_label`);
/// sizing stays with the caller.
pub(crate) fn icon(c: char) -> egui::RichText {
    egui::RichText::new(c).family(egui::FontFamily::Name(FAMILY.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every icon constant must resolve to a real glyph in the vendored
    /// font — the honesty check for the "named const, never a raw
    /// codepoint" rule: a mistyped codepoint fails here instead of
    /// shipping tofu (□). Headless — a font-data parse, no renderer.
    /// Reuses the engine's typeface path (`FontMgr::new_from_data`).
    #[test]
    fn every_icon_has_a_glyph() {
        let tf = skia_safe::FontMgr::new()
            .new_from_data(BYTES, None)
            .expect("lucide.ttf parses");
        for &c in ALL {
            assert_ne!(
                tf.unichar_to_glyph(c as i32),
                0,
                "no glyph for U+{:04X} in the vendored Lucide font",
                c as u32,
            );
        }
    }
}
