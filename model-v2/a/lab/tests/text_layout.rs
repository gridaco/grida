use anchor_lab::math::RectF;
use anchor_lab::model::{
    AxisBinding, Color, DocBuilder, Header, Paints, Payload, SizeIntent, Stroke, StrokeAlign,
    StrokeWidth, TextPayloadRef,
};
use anchor_lab::resolve::{resolve, resolve_with_text_layout, ResolveOptions};
use anchor_lab::text_layout::{
    StubTextLayoutOracle, TextLayout, TextLayoutOracle, TextLine, TextLineBreak,
};
use std::cell::RefCell;
use std::sync::Arc;

#[test]
fn stub_layout_owns_visual_lines_source_ranges_and_metrics() {
    let payload = Payload::Text {
        content: "aa bb cc\nx\n".into(),
        font_size: 10.0,
    };
    let layout = StubTextLayoutOracle.layout(payload.as_text().unwrap(), Some(30.0));

    assert_eq!((layout.width, layout.height), (30.0, 48.0));
    assert_eq!(
        layout
            .lines
            .iter()
            .map(|line| (line.text.as_str(), line.byte_range.clone(), line.end))
            .collect::<Vec<_>>(),
        [
            ("aa bb", 0..5, TextLineBreak::Soft),
            ("cc", 6..8, TextLineBreak::Explicit),
            ("x", 9..10, TextLineBreak::Explicit),
            ("", 11..11, TextLineBreak::Terminal),
        ]
    );
    assert_eq!(
        layout
            .lines
            .iter()
            .map(|line| line.baseline)
            .collect::<Vec<_>>(),
        [8.5, 20.5, 32.5, 44.5]
    );
    assert!(layout.glyph_runs.is_empty(), "the stub is not a shaper");
    assert_eq!(
        layout.logical_bounds,
        Some(RectF {
            x: 0.0,
            y: 0.0,
            w: 30.0,
            h: 48.0,
        })
    );
    assert_eq!(layout.ink_bounds, None);
    assert_eq!(layout.unresolved_glyphs, 0);
    assert_eq!(layout.width_constraint, Some(30.0));
    assert_eq!(
        layout.assigned_box,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 30.0,
            h: 48.0
        }
    );
    assert_eq!(
        layout
            .lines
            .iter()
            .map(|line| line.source_range.clone())
            .collect::<Vec<_>>(),
        [0..6, 6..9, 9..11, 11..11]
    );
}

#[derive(Default)]
struct RecordingOracle {
    constraints: RefCell<Vec<Option<f32>>>,
}

impl TextLayoutOracle for RecordingOracle {
    fn layout(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout> {
        self.constraints.borrow_mut().push(max_width);
        let width = max_width.unwrap_or(54.0);
        let height = if max_width.is_some() { 24.0 } else { 12.0 };
        Arc::new(TextLayout {
            oracle: "recording@test-1",
            environment: "recording-fonts@test-1".into(),
            width_constraint: max_width,
            assigned_box: RectF {
                x: 0.0,
                y: 0.0,
                w: width,
                h: height,
            },
            width,
            height,
            lines: vec![TextLine {
                text: text.text.to_owned(),
                byte_range: 0..u32::try_from(text.text.len()).unwrap(),
                source_range: 0..u32::try_from(text.text.len()).unwrap(),
                end: TextLineBreak::Terminal,
                left: 0.0,
                width,
                top: 0.0,
                height,
                baseline: 8.0,
                ascent: 8.0,
                descent: height - 8.0,
            }],
            glyph_runs: Vec::new(),
            logical_bounds: Some(RectF {
                x: 0.0,
                y: 0.0,
                w: width,
                h: height,
            }),
            ink_bounds: None,
            unresolved_glyphs: 0,
        })
    }
}

#[test]
fn explicit_oracle_drives_measurement_and_final_width_layout_storage() {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    header.max_width = Some(30.0);
    let text = builder.add(
        0,
        header,
        Payload::Text {
            content: "aa bb cc".into(),
            font_size: 10.0,
        },
    );
    let document = builder.build();
    let oracle = RecordingOracle::default();
    let resolved = resolve_with_text_layout(&document, &ResolveOptions::default(), &oracle);

    assert_eq!(
        (resolved.box_of(text).w, resolved.box_of(text).h),
        (30.0, 24.0)
    );
    let stored = resolved.text_layout_of(text);
    assert_eq!(stored.oracle, "recording@test-1");
    assert_eq!((stored.width, stored.height), (30.0, 24.0));
    assert_eq!(stored.width_constraint, Some(30.0));
    assert_eq!(
        stored.assigned_box,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 30.0,
            h: 24.0
        }
    );
    assert_eq!(oracle.constraints.borrow().last(), Some(&Some(30.0)));
    assert!(resolved.text_layout_opt(0).is_none());
    assert!(resolved.text_layout_opt(u32::MAX).is_none());
}

#[test]
fn compatibility_resolve_stores_the_stub_layout() {
    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Fixed(30.0), SizeIntent::Auto),
        Payload::Text {
            content: "aa bb cc".into(),
            font_size: 10.0,
        },
    );
    let resolved = resolve(&builder.build(), &ResolveOptions::default());
    assert_eq!(resolved.text_layout_of(text).oracle, "stub@lab-0");
    assert_eq!(resolved.text_layout_of(text).lines.len(), 2);
}

#[test]
fn empty_text_is_one_terminal_line_with_no_ink() {
    let payload = Payload::Text {
        content: String::new(),
        font_size: 10.0,
    };
    let layout = StubTextLayoutOracle.layout(payload.as_text().unwrap(), Some(20.0));

    assert_eq!(layout.lines.len(), 1);
    assert_eq!(layout.lines[0].byte_range, 0..0);
    assert_eq!(layout.lines[0].source_range, 0..0);
    assert_eq!(layout.lines[0].end, TextLineBreak::Terminal);
    assert_eq!(layout.width_constraint, Some(20.0));
    assert_eq!(layout.width, 0.0);
    assert_eq!(layout.ink_bounds, None);
    assert_eq!(
        layout.assigned_box,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 0.0,
            h: 12.0,
        }
    );
}

struct InkOracle;

impl TextLayoutOracle for InkOracle {
    fn layout(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout> {
        let ink = RectF {
            x: 2.0,
            y: 3.0,
            w: 4.0,
            h: 5.0,
        };
        Arc::new(TextLayout {
            oracle: "ink@test-1",
            environment: "ink-font@test-1".into(),
            width_constraint: max_width,
            assigned_box: ink,
            width: ink.w,
            height: ink.h,
            lines: vec![TextLine {
                text: text.text.to_owned(),
                byte_range: 0..text.text.len() as u32,
                source_range: 0..text.text.len() as u32,
                end: TextLineBreak::Terminal,
                left: 0.0,
                width: ink.w,
                top: 0.0,
                height: ink.h,
                baseline: ink.h,
                ascent: ink.h,
                descent: 0.0,
            }],
            glyph_runs: Vec::new(),
            logical_bounds: Some(ink),
            ink_bounds: Some(ink),
            unresolved_glyphs: 0,
        })
    }
}

#[test]
fn text_world_bounds_transform_ink_and_then_apply_stroke_coverage() {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(40.0));
    header.x = AxisBinding::start(10.0);
    header.y = AxisBinding::start(20.0);
    header.rotation = 90.0;
    let payload = Payload::Text {
        content: "A".into(),
        font_size: 10.0,
    };
    let text = builder.add(0, header, payload.clone());
    let mut stroke = Stroke::default_for(&payload).unwrap();
    stroke.paints = Paints::solid(Color::BLACK);
    stroke.width = StrokeWidth::Uniform(2.0);
    stroke.align = StrokeAlign::Center;
    builder.node_mut(text).strokes.push(stroke);

    let resolved =
        resolve_with_text_layout(&builder.build(), &ResolveOptions::default(), &InkOracle);
    let layout = resolved.text_layout_of(text);
    assert_eq!(
        layout.assigned_box,
        RectF {
            x: 0.0,
            y: 0.0,
            w: 100.0,
            h: 40.0,
        }
    );

    // Centered width 2 with the existing conservative text miter factor 4
    // reaches 4 logical units beyond each side of base glyph ink.
    let expanded_ink = RectF {
        x: -2.0,
        y: -1.0,
        w: 12.0,
        h: 13.0,
    };
    assert_eq!(
        resolved.aabb_of(text),
        expanded_ink.transformed_aabb(&resolved.world_of(text))
    );
    assert_ne!(
        resolved.aabb_of(text),
        layout
            .assigned_box
            .transformed_aabb(&resolved.world_of(text)),
        "assigned text box must not replace glyph ink in visual bounds"
    );
}
