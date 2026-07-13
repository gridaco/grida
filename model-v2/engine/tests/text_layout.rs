//! Integration tests for the shaped text-layout artifact produced by the
//! complete frame pipeline. These are semantic data tests: the bundled Inter
//! face fixes the font input, while assertions avoid backend glyph ids and
//! raster pixels except where the face itself declares its `.notdef` id.

use std::collections::BTreeMap;
use std::sync::Arc;

use anchor_engine::drawlist::{DrawList, ItemKind};
use anchor_engine::frame;
use anchor_engine::oracle::TEXT_SKPARAGRAPH;
use anchor_engine::paint::{raster_to_bytes_unchecked, PaintCtx};
use anchor_lab::math::Affine;
use anchor_lab::model::{
    AttributedString, Color, DocBuilder, Document, Header, Paints, Payload, SizeIntent, Stroke,
    StyledTextRun, TextStyleRec,
};
use anchor_lab::resolve::{Report, ResolveOptions, Resolved};
use anchor_lab::text_layout::TextLineBreak;
use skia_safe::{surfaces, FontMgr, Typeface};

const INTER: &[u8] =
    include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");

fn inter_typeface() -> Typeface {
    FontMgr::new()
        .new_from_data(INTER, None)
        .expect("bundled Inter typeface")
}

fn uniform_text_document(text: &str, width: f32, font_size: f32) -> (Document, u32) {
    let mut builder = DocBuilder::new();
    let text_id = builder.add(
        0,
        Header::new(SizeIntent::Fixed(width), SizeIntent::Auto),
        Payload::Text {
            content: text.to_owned(),
            font_size,
        },
    );
    let mut document = builder.build();
    document.get_mut(text_id).fills = Paints::solid(Color::BLACK);
    (document, text_id)
}

fn render(document: &Document) -> (Resolved, DrawList) {
    render_with_typeface(document, inter_typeface())
}

fn render_with_typeface(document: &Document, typeface: Typeface) -> (Resolved, DrawList) {
    let context = PaintCtx::new(Some(typeface));
    render_with_context(document, &context)
}

fn render_with_context(document: &Document, context: &PaintCtx) -> (Resolved, DrawList) {
    let mut surface = surfaces::raster_n32_premul((640, 480)).expect("raster surface");
    let options = ResolveOptions {
        viewport: (640.0, 480.0),
        ..Default::default()
    };
    let (product, _) = frame::render(
        surface.canvas(),
        document,
        &options,
        &Affine::IDENTITY,
        context,
    )
    .expect("valid text-layout frame");
    assert_eq!(
        surface.canvas().save_count(),
        1,
        "glyph replay must leave the canvas scope balanced"
    );
    let (resolved, list, _) = product.into_parts();
    (resolved, list)
}

#[test]
fn frame_materializes_explicit_and_trailing_empty_lines() {
    let source = "first\n\nlast\n";
    let (document, text_id) = uniform_text_document(source, 320.0, 18.0);
    let (resolved, _) = render(&document);
    let layout = resolved.text_layout_of(text_id);

    assert_eq!(layout.oracle, TEXT_SKPARAGRAPH);
    assert_eq!(
        layout
            .lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>(),
        ["first", "", "last", ""],
        "each authored newline establishes the following visual line"
    );
    assert_eq!(
        layout.lines.len(),
        source.bytes().filter(|b| *b == b'\n').count() + 1
    );
    assert_eq!(
        layout
            .lines
            .iter()
            .map(|line| line.byte_range.clone())
            .collect::<Vec<_>>(),
        [0..5, 6..6, 7..11, 12..12]
    );
    assert_eq!(
        layout
            .lines
            .iter()
            .map(|line| line.source_range.clone())
            .collect::<Vec<_>>(),
        [0..6, 6..7, 7..12, 12..12]
    );
    assert_eq!(
        layout.lines.iter().map(|line| line.end).collect::<Vec<_>>(),
        [
            TextLineBreak::Explicit,
            TextLineBreak::Explicit,
            TextLineBreak::Explicit,
            TextLineBreak::Terminal,
        ]
    );
    assert!(layout
        .lines
        .windows(2)
        .all(|pair| pair[0].top < pair[1].top && pair[0].baseline < pair[1].baseline));
    assert!(layout
        .glyph_runs
        .iter()
        .all(|run| matches!(run.line_index, 0 | 2)));
}

#[test]
fn empty_source_uses_default_font_metrics_without_inventing_source_or_ink() {
    let (document, text_id) = uniform_text_document("", 320.0, 18.0);
    let (resolved, _) = render(&document);
    let layout = resolved.text_layout_of(text_id);

    assert_eq!(layout.lines.len(), 1);
    let line = &layout.lines[0];
    assert_eq!(line.text, "");
    assert_eq!(line.byte_range, 0..0);
    assert_eq!(line.source_range, 0..0);
    assert_eq!(line.end, TextLineBreak::Terminal);
    assert!(line.height > 0.0);
    assert!(line.baseline > 0.0);
    assert_eq!(layout.width, 0.0);
    assert_eq!(layout.height, line.height);
    assert_eq!(layout.assigned_box.w, 320.0);
    assert_eq!(layout.assigned_box.h, layout.height);
    assert!(layout.glyph_runs.is_empty());
    assert_eq!(layout.ink_bounds, None);
}

#[test]
fn auto_sized_empty_source_keeps_one_terminal_line_at_zero_inline_extent() {
    let mut builder = DocBuilder::new();
    let text_id = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: String::new(),
            font_size: 18.0,
        },
    );
    let (resolved, _) = render(&builder.build());
    let layout = resolved.text_layout_of(text_id);

    assert_eq!(resolved.box_of(text_id).w, 0.0);
    assert!(resolved.box_of(text_id).h > 0.0);
    assert_eq!(layout.width_constraint, Some(0.0));
    assert_eq!(layout.lines.len(), 1);
    assert_eq!(layout.lines[0].end, TextLineBreak::Terminal);
    assert_eq!(layout.lines[0].source_range, 0..0);
    assert!(layout.glyph_runs.is_empty());
}

#[test]
fn glyph_clusters_are_utf8_byte_offsets() {
    let source = "AéΩB";
    let (document, text_id) = uniform_text_document(source, 320.0, 24.0);
    let (resolved, _) = render(&document);
    let layout = resolved.text_layout_of(text_id);
    let clusters = layout
        .glyph_runs
        .iter()
        .flat_map(|run| run.glyphs.iter().map(|glyph| glyph.cluster))
        .collect::<Vec<_>>();
    let expected = source
        .char_indices()
        .map(|(byte, _)| byte as u32)
        .collect::<Vec<_>>();

    assert_eq!(clusters, expected);
    assert!(clusters
        .iter()
        .all(|byte| source.is_char_boundary(*byte as usize)));
    assert_eq!(layout.lines[0].byte_range, 0..source.len() as u32);
}

#[test]
fn non_ascii_line_ranges_remain_utf8_after_wrap_and_explicit_break() {
    let source = "éé éé\nΩΩ";
    let (document, text_id) = uniform_text_document(source, 32.0, 20.0);
    let (resolved, _) = render(&document);
    let lines = &resolved.text_layout_of(text_id).lines;

    assert!(lines.len() >= 2);
    assert_eq!(lines.first().unwrap().source_range.start, 0);
    assert_eq!(lines.last().unwrap().source_range.end, source.len() as u32);
    assert!(lines.iter().any(|line| line.end == TextLineBreak::Explicit));
    assert_eq!(lines.last().unwrap().end, TextLineBreak::Terminal);

    for line in lines {
        let byte_start = line.byte_range.start as usize;
        let byte_end = line.byte_range.end as usize;
        let source_start = line.source_range.start as usize;
        let source_end = line.source_range.end as usize;
        assert!(source.is_char_boundary(byte_start));
        assert!(source.is_char_boundary(byte_end));
        assert!(source.is_char_boundary(source_start));
        assert!(source.is_char_boundary(source_end));
        assert_eq!(line.text, source[byte_start..byte_end]);
        assert!(source_start <= byte_start && byte_end <= source_end);
    }
    assert!(lines
        .windows(2)
        .all(|pair| pair[0].source_range.end == pair[1].source_range.start));
}

#[test]
fn width_constraint_changes_line_topology_without_changing_source_order() {
    let source = "alpha beta gamma delta";
    let (wide_document, wide_id) = uniform_text_document(source, 400.0, 20.0);
    let (narrow_document, narrow_id) = uniform_text_document(source, 76.0, 20.0);
    let (wide_resolved, _) = render(&wide_document);
    let (narrow_resolved, _) = render(&narrow_document);
    let wide = wide_resolved.text_layout_of(wide_id);
    let narrow = narrow_resolved.text_layout_of(narrow_id);

    assert_eq!(wide.lines.len(), 1);
    assert!(narrow.lines.len() > wide.lines.len());
    assert!(narrow.height > wide.height);
    assert_eq!(wide.lines[0].end, TextLineBreak::Terminal);
    assert!(narrow.lines[..narrow.lines.len() - 1]
        .iter()
        .all(|line| line.end == TextLineBreak::Soft));
    assert_eq!(narrow.lines.last().unwrap().end, TextLineBreak::Terminal);
    assert!(narrow.lines.iter().all(|line| line.width <= 76.0));
    assert_eq!(narrow.lines.first().unwrap().byte_range.start, 0);
    assert_eq!(
        narrow.lines.last().unwrap().byte_range.end,
        source.len() as u32
    );
    assert!(narrow
        .lines
        .windows(2)
        .all(|pair| pair[0].byte_range.end <= pair[1].byte_range.start));
}

#[test]
fn resolved_artifact_replays_exact_font_instances_and_positioned_glyphs() {
    let source = "aBb";
    let small = TextStyleRec::from_font_size(16.0);
    let large = TextStyleRec {
        font_size: 30.0,
        font_weight: 700,
        font_style_italic: false,
    };
    let runs = vec![
        StyledTextRun {
            start: 0,
            end: 1,
            style: small,
            fills: None,
        },
        StyledTextRun {
            start: 1,
            end: 2,
            style: large,
            fills: None,
        },
        StyledTextRun {
            start: 2,
            end: 3,
            style: small,
            fills: None,
        },
    ];
    let attributed = AttributedString::from_runs(source, runs).unwrap();
    let mut builder = DocBuilder::new();
    let text_id = builder.add(
        0,
        Header::new(SizeIntent::Fixed(200.0), SizeIntent::Auto),
        Payload::AttributedText {
            attributed_string: attributed,
            default_style: small,
        },
    );
    let mut document = builder.build();
    let node = document.get_mut(text_id);
    node.fills = Paints::solid(Color::BLACK);
    let mut stroke = Stroke::default_for(&node.payload).expect("text supports an outline");
    stroke.paints = Paints::solid("#FF0000".into());
    node.strokes.push(stroke);

    let (resolved, list) = render(&document);
    let layout = resolved.text_layout_of(text_id);
    let fonts_by_source = layout
        .glyph_runs
        .iter()
        .map(|run| {
            assert!(!run.glyphs.is_empty());
            assert!(run.line_index < layout.lines.len());
            assert!(run.glyphs.iter().all(|glyph| {
                source.is_char_boundary(glyph.cluster as usize)
                    && glyph.x.is_finite()
                    && glyph.y.is_finite()
            }));
            (run.source_run.expect("attributed source run"), run.font)
        })
        .collect::<BTreeMap<_, _>>();

    assert_eq!(fonts_by_source.len(), 3);
    assert_eq!(fonts_by_source[&0], fonts_by_source[&2]);
    assert_ne!(fonts_by_source[&0], fonts_by_source[&1]);
    assert!(layout.ink_bounds.is_some());

    let replay_layouts = list
        .items
        .iter()
        .filter_map(|item| match &item.kind {
            ItemKind::TextFill { layout, .. } | ItemKind::TextStroke { layout, .. } => Some(layout),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(replay_layouts.len(), 2);
    assert!(replay_layouts
        .iter()
        .all(|replay| Arc::ptr_eq(layout, replay)));
}

#[test]
fn missing_scalar_is_reported_as_unresolved_instead_of_silent_fallback() {
    let missing = '\u{10ffff}';
    let typeface = inter_typeface();
    let notdef = typeface.unichar_to_glyph(missing as i32);
    assert_eq!(
        notdef, 0,
        "fixture scalar must be absent from bundled Inter"
    );

    let source = format!("A{missing}B");
    let (document, text_id) = uniform_text_document(&source, 320.0, 24.0);
    let (resolved, _) = render_with_typeface(&document, typeface);
    let layout = resolved.text_layout_of(text_id);

    assert!(layout.unresolved_glyphs > 0);
    assert!(resolved.reports.iter().any(|report| matches!(
        report,
        Report::ErrorByRule { node, field, rule }
            if *node == text_id
                && *field == "text"
                && *rule == "text layout contains unresolved glyphs"
    )));
    assert_eq!(layout.lines[0].byte_range, 0..source.len() as u32);
}

#[test]
fn shaped_drawlist_retains_exact_fonts_after_its_shaping_context_is_gone() {
    let (document, _) = uniform_text_document("office AV", 320.0, 28.0);
    // `render` drops the PaintCtx that hosted shaping before returning.
    let (_, list) = render(&document);

    let fontless_context = PaintCtx::new(None);
    let first = raster_to_bytes_unchecked(&list, &Affine::IDENTITY, 640, 480, &fontless_context);
    let unrelated_context = PaintCtx::new(Some(inter_typeface()));
    let second = raster_to_bytes_unchecked(&list, &Affine::IDENTITY, 640, 480, &unrelated_context);

    assert_eq!(first, second, "paint contexts cannot reinterpret font keys");
    assert!(first.chunks_exact(4).any(|pixel| pixel[0] < 100));
}

#[test]
fn public_non_rasterizing_stage_returns_replayable_shaped_text() {
    let (document, text_id) = uniform_text_document("office AV", 180.0, 24.0);
    let shaping_context = PaintCtx::new(Some(inter_typeface()));
    let options = ResolveOptions {
        viewport: (640.0, 480.0),
        ..Default::default()
    };

    let product = frame::resolve_and_build(&document, &options, &shaping_context)
        .expect("valid text-layout frame");
    let (resolved, list, _) = product.into_parts();
    let layout = resolved.text_layout_of(text_id);
    assert_eq!(layout.oracle, TEXT_SKPARAGRAPH);
    assert!(!layout.glyph_runs.is_empty());

    let fontless_replay_context = PaintCtx::new(None);
    let pixels =
        raster_to_bytes_unchecked(&list, &Affine::IDENTITY, 640, 480, &fontless_replay_context);
    assert!(
        pixels.chunks_exact(4).any(|pixel| pixel[0] < 100),
        "the returned drawlist must own every font needed for later replay"
    );
}

#[test]
fn font_identity_and_drawlist_are_stable_across_fresh_resolves_in_one_environment() {
    let (document, text_id) = uniform_text_document("office AV", 320.0, 28.0);
    let context = PaintCtx::new(Some(inter_typeface()));
    let (first_resolved, first_list) = render_with_context(&document, &context);
    let (second_resolved, second_list) = render_with_context(&document, &context);

    let identities = |resolved: &Resolved| {
        resolved
            .text_layout_of(text_id)
            .glyph_runs
            .iter()
            .map(|run| run.font_identity.clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(identities(&first_resolved), identities(&second_resolved));
    assert_eq!(
        first_list, second_list,
        "fresh resolution must not mint false display-list changes"
    );
}
