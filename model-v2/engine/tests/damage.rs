//! ENG-2.2 · damage is a data diff of two resolved tiers. Identical tiers
//! produce no damage; a single independent move damages exactly that node
//! (the locality the incremental resolver will exploit — OS-1a).

use std::sync::Arc;

use anchor_engine::damage::diff;
use anchor_lab::math::RectF;
use anchor_lab::model::*;
use anchor_lab::ops::{apply, Op};
use anchor_lab::resolve::{resolve, resolve_with_text_layout, ResolveOptions, RotationInFlow};
use anchor_lab::text_layout::{
    TextFontKey, TextGlyph, TextGlyphRun, TextLayout, TextLayoutOracle, TextLine, TextLineBreak,
};

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

fn free_shape(x: f32, y: f32) -> (Header, Payload) {
    let mut h = Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0));
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    (
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

/// root + two independent free shapes.
fn scene() -> (Document, NodeId, NodeId) {
    let mut b = DocBuilder::new();
    let (s1h, s1p) = free_shape(50.0, 50.0);
    let s1 = b.add(0, s1h, s1p);
    let (s2h, s2p) = free_shape(300.0, 300.0);
    let s2 = b.add(0, s2h, s2p);
    (b.build(), s1, s2)
}

#[test]
fn diff_of_identical_is_empty() {
    let (doc, ..) = scene();
    let r = resolve(&doc, &opts());
    let d = diff(&r, &r);
    assert!(d.is_empty());
    assert!(d.union_world.is_none());
}

#[test]
fn moving_one_node_damages_only_that_node() {
    let (mut doc, s1, s2) = scene();
    let prev = resolve(&doc, &opts());

    let r = resolve(&doc, &opts());
    apply(
        &mut doc,
        &r,
        &Op::SetX {
            id: s1,
            value: 800.0,
        },
    )
    .unwrap();
    let next = resolve(&doc, &opts());

    let d = diff(&prev, &next);
    assert_eq!(d.changed, vec![s1], "only the moved leaf is damaged");
    assert!(
        !d.changed.contains(&s2),
        "the independent sibling is untouched"
    );
    assert!(
        !d.changed.contains(&doc.root),
        "the fixed root is untouched"
    );
    // The damage rect covers the node's before and after ink.
    let dr = d.union_world.expect("moved node has ink");
    assert!(dr.w >= 40.0 && dr.h >= 40.0, "covers at least the node box");
}

#[derive(Clone, Copy)]
enum ArtifactVariant {
    Base,
    Environment,
    Glyph,
    Font,
    Layout,
}

struct ArtifactOracle(ArtifactVariant);

impl TextLayoutOracle for ArtifactOracle {
    fn layout(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout> {
        let glyph_id = match self.0 {
            ArtifactVariant::Glyph => 2,
            _ => 1,
        };
        let font = TextFontKey::new(1);
        let font_identity = match self.0 {
            ArtifactVariant::Font => "font@test-2",
            _ => "font@test-1",
        };
        let baseline = match self.0 {
            ArtifactVariant::Layout => 9.0,
            _ => 8.0,
        };
        let ink = RectF {
            x: 1.0,
            y: 2.0,
            w: 8.0,
            h: 10.0,
        };
        Arc::new(TextLayout {
            oracle: "damage@test-1",
            environment: match self.0 {
                ArtifactVariant::Environment => "damage-fonts@test-2",
                _ => "damage-fonts@test-1",
            }
            .into(),
            width_constraint: max_width,
            assigned_box: RectF {
                x: 0.0,
                y: 0.0,
                w: 10.0,
                h: 12.0,
            },
            width: 10.0,
            height: 12.0,
            lines: vec![TextLine {
                text: text.text.to_owned(),
                byte_range: 0..text.text.len() as u32,
                source_range: 0..text.text.len() as u32,
                end: TextLineBreak::Terminal,
                left: 0.0,
                width: 10.0,
                top: 0.0,
                height: 12.0,
                baseline,
                ascent: baseline,
                descent: 12.0 - baseline,
            }],
            glyph_runs: vec![TextGlyphRun {
                line_index: 0,
                source_run: None,
                font_identity: font_identity.into(),
                font,
                glyphs: vec![TextGlyph {
                    id: glyph_id,
                    cluster: 0,
                    x: 1.0,
                    y: baseline,
                    bounds: Some(ink),
                }],
            }],
            logical_bounds: Some(RectF {
                x: 0.0,
                y: 0.0,
                w: 10.0,
                h: 12.0,
            }),
            ink_bounds: Some(ink),
            unresolved_glyphs: 0,
        })
    }
}

#[test]
fn material_text_artifact_changes_damage_even_when_geometry_is_identical() {
    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(20.0)),
        Payload::Text {
            content: "A".into(),
            font_size: 12.0,
        },
    );
    let document = builder.build();
    let base = resolve_with_text_layout(&document, &opts(), &ArtifactOracle(ArtifactVariant::Base));

    for variant in [
        ArtifactVariant::Environment,
        ArtifactVariant::Glyph,
        ArtifactVariant::Font,
        ArtifactVariant::Layout,
    ] {
        let changed = resolve_with_text_layout(&document, &opts(), &ArtifactOracle(variant));
        assert_eq!(base.box_of(text), changed.box_of(text));
        assert_eq!(base.world_of(text), changed.world_of(text));
        assert_eq!(base.aabb_of(text), changed.aabb_of(text));

        let damage = diff(&base, &changed);
        assert_eq!(damage.changed, vec![text]);
        assert!(damage.union_world.is_some());
    }
}
