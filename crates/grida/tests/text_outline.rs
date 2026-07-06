//! Text → glyph-outline vector network — the font-backed conversion
//! behind the editor's Create Outlines command (`OUTL-*`) and flatten's
//! text delegation.
//!
//! Verifies the risky half — that a laid-out paragraph shapes into real
//! glyph geometry with the embedded fonts — without a GL backend: build
//! the fonts + paragraph cache directly (the same path
//! `Renderer::outline_text_node` uses) and convert.

use std::sync::{Arc, Mutex};

use grida::cache::paragraph::ParagraphCache;
use grida::node::factory::NodeFactory;
use grida::resources::ByteStore;
use grida::runtime::font_repository::FontRepository;
use grida::runtime::image_repository::ImageRepository;

#[test]
fn text_shapes_to_a_nonempty_glyph_outline_network() {
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();
    fonts.enable_system_fallback();
    let images = ImageRepository::new(store.clone());
    let mut cache = ParagraphCache::new();

    // A default text node (Geist 16pt, embedded) with real content.
    let mut t = NodeFactory::new().create_text_span_node();
    t.text = "Hi".to_string();

    // The same shaping call the render path / `outline_text_node` makes.
    let paragraph = cache.paragraph(
        &t.text,
        t.fills.as_slice(),
        &t.text_align,
        &t.text_style,
        &t.max_lines,
        &t.ellipsis,
        t.width,
        &fonts,
        &images,
        None,
    );
    let mut paragraph = paragraph.borrow_mut();
    let network = grida::text::paragraph_to_vector_network(&mut paragraph);

    // Two glyphs with curves → real vertices and segments.
    assert!(
        !network.vertices.is_empty(),
        "outlined text must carry glyph geometry"
    );
    assert!(!network.segments.is_empty());
}

#[test]
fn empty_text_yields_empty_network() {
    // The `OUTL-3` degrade shape: nothing to shape → empty network, so
    // the command declines rather than replacing text with a void.
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();
    let images = ImageRepository::new(store.clone());
    let mut cache = ParagraphCache::new();

    let t = NodeFactory::new().create_text_span_node(); // text = ""
    let paragraph = cache.paragraph(
        &t.text,
        t.fills.as_slice(),
        &t.text_align,
        &t.text_style,
        &t.max_lines,
        &t.ellipsis,
        t.width,
        &fonts,
        &images,
        None,
    );
    let mut paragraph = paragraph.borrow_mut();
    let network = grida::text::paragraph_to_vector_network(&mut paragraph);
    assert!(network.vertices.is_empty());
}
