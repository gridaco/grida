//! SVG → `usvg::Tree` parsing.
//!
//! Wraps `usvg::Tree::from_str` with Grida's standard parser configuration:
//! the embedded Geist font is registered as the universal fallback and every
//! generic CSS family (`serif`, `sans-serif`, …) is mapped to it.
//!
//! Output is a neutral `usvg::Tree` — no Grida types are produced here, which
//! is why this lives under `formats/` rather than `import/`.

use crate::embedded_fonts::geist;

/// Parse an SVG source string into a [`usvg::Tree`] using Grida's standard
/// parser options (embedded Geist as universal fallback, system fonts loaded).
pub fn into_tree(svg_source: &str) -> Result<usvg::Tree, usvg::Error> {
    let mut options = usvg::Options {
        font_family: geist::FAMILY.to_string(), // our builtin font
        font_size: 16.0, // font-size default is 'medium' (16px) - based on browser spec
        ..Default::default()
    };

    // Register embedded font so usvg can layout <text> (it silently drops
    // text nodes when no font is available).
    options.fontdb_mut().load_font_data(geist::BYTES.to_vec());

    // Load system fonts first — on Linux, `load_system_fonts()` parses
    // fontconfig and *overwrites* the generic-family mappings with names
    // like "DejaVu Sans" that may not be installed. By loading system fonts
    // before setting the generic families, our embedded Geist font always
    // serves as the final fallback.
    #[cfg(not(target_os = "emscripten"))]
    options.fontdb_mut().load_system_fonts();

    // Map every generic CSS family to our embedded font *after*
    // load_system_fonts so fontconfig cannot overwrite these mappings.
    let fontdb = options.fontdb_mut();
    fontdb.set_serif_family(geist::FAMILY);
    fontdb.set_sans_serif_family(geist::FAMILY);
    fontdb.set_cursive_family(geist::FAMILY);
    fontdb.set_fantasy_family(geist::FAMILY);
    fontdb.set_monospace_family(geist::FAMILY);

    usvg::Tree::from_str(svg_source, &options)
}
