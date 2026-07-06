//! `DOC-*` conformance tests for `crates/grida_editor/docs/document.md`.

use grida::cg::prelude::CGColor;
use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, MutationErrorReason, PropPatch, WorkingCopy};

fn rect_fragment(id: &str) -> Fragment {
    let factory = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: Some(id.to_string()),
        node: Node::Rectangle(factory.create_rectangle_node()),
        children: vec![],
    }
}

fn group_fragment(id: &str, children: Vec<Fragment>) -> Fragment {
    let factory = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: Some(id.to_string()),
        node: Node::Group(factory.create_group_node()),
        children,
    }
}

/// A working copy with `n` root-level rectangles `r0..r{n-1}`.
fn wc_with_rects(n: usize) -> WorkingCopy {
    let mut wc = WorkingCopy::new_empty("test");
    let batch: Vec<Mutation> = (0..n)
        .map(|i| Mutation::Insert {
            parent: None,
            index: i,
            fragment: Box::new(rect_fragment(&format!("r{i}"))),
        })
        .collect();
    wc.apply(&batch).unwrap();
    wc
}

fn ids(v: &[Id]) -> Vec<&str> {
    v.iter().map(|s| s.as_str()).collect()
}
use grida_editor::document::Id;

// ---------------------------------------------------------------------------
// DOC-2 — inverse round-trips
// ---------------------------------------------------------------------------

#[test]
fn doc_2_patch_roundtrip() {
    let mut wc = wc_with_rects(1);
    let baseline = wc.clone();

    let batch = vec![Mutation::Patch {
        id: "r0".to_string(),
        set: Box::new(PropPatch {
            name: Some("renamed".to_string()),
            active: Some(false),
            opacity: Some(0.5),
            fill_solid: Some(CGColor::from_rgba(10, 20, 30, 255)),
            position: Some((42.0, -7.0)),
            size: Some((Some(50.0), None)),
            rotation: Some(0.3),
            ..Default::default()
        }),
    }];
    let applied = wc.apply(&batch).unwrap();
    assert!(
        !wc.structure_eq(&baseline),
        "patch must change the document"
    );

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: inverse restores the pre-state"
    );
}

#[test]
fn doc_2_remove_roundtrip() {
    let mut wc = wc_with_rects(2);
    // A nested subtree so the round-trip covers identity of descendants.
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 1,
        fragment: Box::new(group_fragment(
            "g0",
            vec![rect_fragment("c0"), rect_fragment("c1")],
        )),
    }])
    .unwrap();
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Remove {
            id: "g0".to_string(),
        }])
        .unwrap();
    assert!(!wc.contains(&"g0".to_string()));
    assert!(!wc.contains(&"c1".to_string()));

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: remove inverse restores the subtree with its stable ids"
    );
    assert_eq!(wc.children(Some(&"g0".to_string())), vec!["c0", "c1"]);
}

#[test]
fn doc_2_move_roundtrip() {
    let mut wc = wc_with_rects(5);
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Move {
            ids: vec!["r0".to_string(), "r4".to_string()],
            parent: None,
            index: 2,
        }])
        .unwrap();
    assert!(!wc.structure_eq(&baseline));

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: move inverse restores order"
    );
}

#[test]
fn doc_2_move_same_parent_block_roundtrip() {
    // Regression: a contiguous same-parent block moved to a new index.
    // The inverse must restore per-parent highest-original-index-first;
    // ascending single-id moves would leave the block scrambled
    // (e.g. `[r0,r1,r2,r3]` undone to `[r1,r0,r2,r3]`).
    let mut wc = wc_with_rects(4);
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Move {
            ids: vec!["r1".to_string(), "r2".to_string()],
            parent: None,
            index: 0,
        }])
        .unwrap();
    assert_eq!(ids(&wc.children(None)), ["r1", "r2", "r0", "r3"]);

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: same-parent block move inverse restores the original order"
    );
}

#[test]
fn doc_2_move_reparent_roundtrip() {
    let mut wc = wc_with_rects(2);
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 2,
        fragment: Box::new(group_fragment("g0", vec![])),
    }])
    .unwrap();
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Move {
            ids: vec!["r1".to_string()],
            parent: Some("g0".to_string()),
            index: 0,
        }])
        .unwrap();
    assert_eq!(wc.children(Some(&"g0".to_string())), vec!["r1"]);

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: reparent inverse restores"
    );
}

#[test]
fn doc_2_insert_roundtrip() {
    let mut wc = wc_with_rects(2);
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Insert {
            parent: None,
            index: 1,
            fragment: Box::new(group_fragment("g0", vec![rect_fragment("c0")])),
        }])
        .unwrap();
    assert_eq!(ids(&wc.children(None)), ["r0", "g0", "r1"]);

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: insert inverse removes the subtree"
    );
}

// ---------------------------------------------------------------------------
// DOC-4 — batch atomicity
// ---------------------------------------------------------------------------

#[test]
fn doc_4_invalid_mutation_rejects_whole_batch() {
    let mut wc = wc_with_rects(2);
    let baseline = wc.clone();

    let err = wc
        .apply(&[
            Mutation::Patch {
                id: "r0".to_string(),
                set: Box::new(PropPatch {
                    opacity: Some(0.25),
                    ..Default::default()
                }),
            },
            Mutation::Patch {
                id: "missing".to_string(),
                set: Box::new(PropPatch {
                    opacity: Some(0.5),
                    ..Default::default()
                }),
            },
        ])
        .unwrap_err();

    assert_eq!(
        err.index, 1,
        "DOC-4: the error identifies the offending mutation"
    );
    assert_eq!(
        err.reason,
        MutationErrorReason::UnknownId("missing".to_string())
    );
    assert!(
        wc.structure_eq(&baseline),
        "DOC-4: the document is unchanged after a rejected batch"
    );
    assert_eq!(wc.node_opacity(&"r0".to_string()), Some(1.0));
}

// ---------------------------------------------------------------------------
// DOC-5 — post-removal move indices
// ---------------------------------------------------------------------------

#[test]
fn doc_5_move_uses_post_removal_indices() {
    let mut wc = wc_with_rects(5);

    let mv = Mutation::Move {
        ids: vec!["r0".to_string()],
        parent: None,
        index: 2,
    };
    wc.apply(std::slice::from_ref(&mv)).unwrap();
    assert_eq!(
        ids(&wc.children(None)),
        ["r1", "r2", "r0", "r3", "r4"],
        "DOC-5: moving index 0 to post-removal index 2 lands third"
    );

    // Idempotent when re-applied to the resulting state.
    wc.apply(std::slice::from_ref(&mv)).unwrap();
    assert_eq!(ids(&wc.children(None)), ["r1", "r2", "r0", "r3", "r4"]);
}

#[test]
fn doc_5_move_into_own_subtree_is_a_cycle() {
    let mut wc = wc_with_rects(0);
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(group_fragment("g0", vec![group_fragment("g1", vec![])])),
    }])
    .unwrap();

    let err = wc
        .apply(&[Mutation::Move {
            ids: vec!["g0".to_string()],
            parent: Some("g1".to_string()),
            index: 0,
        }])
        .unwrap_err();
    assert_eq!(err.reason, MutationErrorReason::Cycle("g0".to_string()));
}

// ---------------------------------------------------------------------------
// DOC-7 — change summary
// ---------------------------------------------------------------------------

#[test]
fn doc_7_summary_node_set_equals_touched_set() {
    let mut wc = wc_with_rects(3);

    let applied = wc
        .apply(&[
            Mutation::Patch {
                id: "r0".to_string(),
                set: Box::new(PropPatch {
                    opacity: Some(0.5),
                    ..Default::default()
                }),
            },
            Mutation::Patch {
                id: "r2".to_string(),
                set: Box::new(PropPatch {
                    position: Some((5.0, 5.0)),
                    ..Default::default()
                }),
            },
        ])
        .unwrap();

    let mut touched: Vec<&str> = applied
        .summary
        .nodes
        .iter()
        .map(|(id, _)| id.as_str())
        .collect();
    touched.sort_unstable();
    assert_eq!(
        touched,
        ["r0", "r2"],
        "DOC-7: summary node set == touched set"
    );
}

#[test]
fn doc_7_insert_summary_covers_the_inserted_subtree() {
    let mut wc = wc_with_rects(0);
    let applied = wc
        .apply(&[Mutation::Insert {
            parent: None,
            index: 0,
            fragment: Box::new(group_fragment(
                "g0",
                vec![rect_fragment("c0"), rect_fragment("c1")],
            )),
        }])
        .unwrap();

    let mut touched: Vec<&str> = applied
        .summary
        .nodes
        .iter()
        .map(|(id, _)| id.as_str())
        .collect();
    touched.sort_unstable();
    assert_eq!(touched, ["c0", "c1", "g0"]);
}

// ---------------------------------------------------------------------------
// vector_network patch domain (vector-edit.md)
// ---------------------------------------------------------------------------

fn curved_network() -> grida::vectornetwork::VectorNetwork {
    use grida::vectornetwork::*;
    VectorNetwork {
        vertices: vec![(0.0, 0.0), (100.0, 0.0), (50.0, 80.0)],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment {
                a: 1,
                b: 2,
                ta: (10.0, 20.0),
                tb: (-10.0, 20.0),
            },
            VectorNetworkSegment::ab(2, 0),
        ],
        regions: vec![VectorNetworkRegion {
            loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
            fill_rule: grida::cg::prelude::FillRule::EvenOdd,
            fills: None,
        }],
    }
}

fn wc_with_vector(id: &str) -> WorkingCopy {
    let mut wc = WorkingCopy::new_empty("test");
    let fragment = grida_editor::tool::vector_fragment(
        id.to_string(),
        "Vector",
        [10.0, 10.0],
        grida_editor::document::polyline_network(&[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]),
    );
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(fragment),
    }])
    .unwrap();
    wc
}

#[test]
fn doc_2_vector_network_patch_roundtrip() {
    let mut wc = wc_with_vector("v0");
    let baseline = wc.clone();

    let batch = vec![Mutation::Patch {
        id: "v0".to_string(),
        set: Box::new(PropPatch {
            vector_network: Some(curved_network()),
            ..Default::default()
        }),
    }];
    let applied = wc.apply(&batch).unwrap();
    assert!(!wc.structure_eq(&baseline), "tangent change is visible");

    let network = wc.node_vector_network(&"v0".to_string()).unwrap();
    assert_eq!(network.vertices.len(), 3);
    assert_eq!(network.segments[1].ta, (10.0, 20.0));
    assert_eq!(network.regions.len(), 1);

    // The inverse carries the prior (polyline) network and restores
    // it exactly.
    wc.apply(&applied.inverse).unwrap();
    assert!(wc.structure_eq(&baseline));
}

#[test]
fn vector_network_patch_requires_vector_node() {
    let mut wc = wc_with_rects(1);
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "r0".to_string(),
            set: Box::new(PropPatch {
                vector_network: Some(curved_network()),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline), "rejected batch leaves no trace");
}

#[test]
fn vector_network_and_polyline_are_mutually_exclusive() {
    let mut wc = wc_with_vector("v0");
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "v0".to_string(),
            set: Box::new(PropPatch {
                vector_polyline: Some(vec![(0.0, 0.0), (1.0, 1.0)]),
                vector_network: Some(curved_network()),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline));
}

/// DOC-2 — a single `Move` drawing ids from *different* source parents
/// must invert exactly: each id returns to its own parent and original
/// index. The single-source move tests don't exercise the inverse's
/// `(source_parent, original_index)` restore across parents.
#[test]
fn doc_2_move_mixed_source_parents_roundtrip() {
    let mut wc = wc_with_rects(3); // r0, r1, r2 at root
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 3,
        fragment: Box::new(group_fragment("g0", vec![rect_fragment("c0")])),
    }])
    .unwrap();
    let baseline = wc.clone();

    // r1 (from root) and c0 (from g0) moved together into g0.
    let applied = wc
        .apply(&[Mutation::Move {
            ids: vec!["r1".to_string(), "c0".to_string()],
            parent: Some("g0".to_string()),
            index: 0,
        }])
        .unwrap();
    assert!(!wc.structure_eq(&baseline), "the move changed the tree");

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: mixed-source move inverse restores each id to its own parent and index"
    );
}

/// DOC-2 — the appearance fields round-trip through apply/inverse, which
/// requires the getter domain (inverse capture) and setter domain to
/// agree. A getter that reports `Some` for a kind whose setter silently
/// no-ops (`_ => {}`) would corrupt the inverse with no compiler
/// warning; this pins the pairing for `corner_radius` + `blend_mode` on
/// a Rectangle (both in-domain).
#[test]
fn doc_2_appearance_patch_roundtrips() {
    use grida::cg::prelude::{BlendMode, LayerBlendMode};
    let mut wc = wc_with_rects(1);
    let id = "r0".to_string();
    let before_cr = wc.node_corner_radius(&id);
    let before_bm = wc.node_blend_mode(&id);

    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                corner_radius: Some(6.0),
                blend_mode: Some(LayerBlendMode::Blend(BlendMode::Multiply)),
                ..Default::default()
            }),
        }])
        .unwrap();
    assert_eq!(
        wc.node_corner_radius(&id),
        Some(6.0),
        "setter applied radius"
    );
    assert_eq!(
        wc.node_blend_mode(&id),
        Some(LayerBlendMode::Blend(BlendMode::Multiply)),
        "setter applied blend mode"
    );

    wc.apply(&applied.inverse).unwrap();
    assert_eq!(
        wc.node_corner_radius(&id),
        before_cr,
        "inverse restored radius"
    );
    assert_eq!(
        wc.node_blend_mode(&id),
        before_bm,
        "inverse restored blend mode"
    );
}

// ---------------------------------------------------------------------------
// Fills — the general paint-list patch domain (`properties-sheet.md`)
// ---------------------------------------------------------------------------

fn solid(r: u8, g: u8, b: u8, a: u8) -> grida::cg::prelude::Paint {
    use grida::cg::prelude::{Paint, SolidPaint};
    Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(r, g, b, a)))
}

/// DOC-2 — a whole-stack `fills` patch (multi-paint, mixed kinds)
/// round-trips: the inverse carries the prior `Paints` and restores it
/// exactly. Also asserts the `node_fills` query reflects the write.
#[test]
fn doc_2_fills_patch_roundtrip() {
    use grida::cg::prelude::{LinearGradientPaint, Paint, Paints};
    let mut wc = wc_with_rects(1);
    let id = "r0".to_string();
    let baseline = wc.clone();
    let before = wc.node_fills(&id);

    let stack = Paints::new([
        solid(10, 20, 30, 255),
        Paint::LinearGradient(LinearGradientPaint::default()),
        solid(200, 100, 50, 128),
    ]);
    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                fills: Some(stack.clone()),
                ..Default::default()
            }),
        }])
        .unwrap();
    assert_eq!(
        wc.node_fills(&id).as_ref(),
        Some(&stack),
        "the fills write is observable through node_fills"
    );
    assert!(
        !wc.structure_eq(&baseline),
        "a fills change alters the node signature (PROP-7 observation)"
    );

    wc.apply(&applied.inverse).unwrap();
    assert_eq!(
        wc.node_fills(&id),
        before,
        "DOC-2: the fills inverse restores the prior stack exactly"
    );
    assert!(wc.structure_eq(&baseline), "DOC-2: full round-trip");
}

/// DOC-4 — `fills` on a kind that carries no fills (a Group) is
/// rejected as `Unsupported`, leaving the document untouched.
#[test]
fn fills_patch_requires_a_fill_bearing_node() {
    use grida::cg::prelude::Paints;
    let mut wc = WorkingCopy::new_empty("test");
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(group_fragment("g0", vec![rect_fragment("r0")])),
    }])
    .unwrap();
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "g0".to_string(),
            set: Box::new(PropPatch {
                fills: Some(Paints::new([solid(1, 2, 3, 255)])),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline), "rejected batch leaves no trace");
}

/// A single patch that sets both `fill_solid` and `fills` is rejected —
/// they write the same property, so their order-dependence would make
/// the inverse ambiguous.
#[test]
fn fill_solid_and_fills_are_mutually_exclusive() {
    use grida::cg::prelude::Paints;
    let mut wc = wc_with_rects(1);
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "r0".to_string(),
            set: Box::new(PropPatch {
                fill_solid: Some(CGColor::from_rgba(1, 2, 3, 255)),
                fills: Some(Paints::new([solid(4, 5, 6, 255)])),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline));
}

// ---------------------------------------------------------------------------
// Stroke geometry (weight / align / cap / join / miter / dash)
// ---------------------------------------------------------------------------

/// DOC-2 — the six stroke-geometry scalars round-trip through
/// apply/inverse on a `stroke_style` kind (a Rectangle), and the
/// per-property queries reflect the write.
#[test]
fn doc_2_stroke_geometry_roundtrip() {
    use grida::cg::prelude::{StrokeAlign, StrokeCap, StrokeJoin};
    let mut wc = wc_with_rects(1);
    let id = "r0".to_string();
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                stroke_width: Some(4.0),
                stroke_align: Some(StrokeAlign::Outside),
                stroke_cap: Some(StrokeCap::Round),
                stroke_join: Some(StrokeJoin::Bevel),
                stroke_miter: Some(8.0),
                stroke_dash: Some(vec![3.0]),
                ..Default::default()
            }),
        }])
        .unwrap();
    assert_eq!(wc.node_stroke_width(&id), Some(4.0));
    assert_eq!(wc.node_stroke_align(&id), Some(StrokeAlign::Outside));
    assert_eq!(wc.node_stroke_cap(&id), Some(StrokeCap::Round));
    assert_eq!(wc.node_stroke_join(&id), Some(StrokeJoin::Bevel));
    assert_eq!(wc.node_stroke_miter(&id), Some(8.0));
    assert_eq!(wc.node_stroke_dash(&id), Some(vec![3.0]));
    assert!(
        !wc.structure_eq(&baseline),
        "geometry changed the signature"
    );

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: stroke geometry inverse restores the prior state"
    );
}

/// An empty dash vec clears the pattern (solid) and round-trips.
#[test]
fn stroke_dash_empty_clears_to_solid() {
    let mut wc = wc_with_rects(1);
    let id = "r0".to_string();
    wc.apply(&[Mutation::Patch {
        id: id.clone(),
        set: Box::new(PropPatch {
            stroke_dash: Some(vec![5.0, 2.0]),
            ..Default::default()
        }),
    }])
    .unwrap();
    assert_eq!(wc.node_stroke_dash(&id), Some(vec![5.0, 2.0]));
    wc.apply(&[Mutation::Patch {
        id: id.clone(),
        set: Box::new(PropPatch {
            stroke_dash: Some(Vec::new()),
            ..Default::default()
        }),
    }])
    .unwrap();
    assert_eq!(wc.node_stroke_dash(&id), Some(Vec::new()), "solid");
}

// ---------------------------------------------------------------------------
// Typography (font size / weight / italic / line-height / letter-spacing /
// vertical align) — the Text section's document domain (Slice A)
// ---------------------------------------------------------------------------

fn text_fragment(id: &str) -> Fragment {
    let factory = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: Some(id.to_string()),
        node: Node::TextSpan(factory.create_text_span_node()),
        children: vec![],
    }
}

/// A working copy with one root-level text node `t0`.
fn wc_with_text() -> WorkingCopy {
    let mut wc = WorkingCopy::new_empty("test");
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(text_fragment("t0")),
    }])
    .unwrap();
    wc
}

/// DOC-2 — the typography scalars round-trip through apply/inverse on a
/// text kind, and the per-property queries reflect the write.
#[test]
fn doc_2_typography_roundtrip() {
    use grida::cg::prelude::{TextAlignVertical, TextLetterSpacing, TextLineHeight};
    let mut wc = wc_with_text();
    let id = "t0".to_string();
    let baseline = wc.clone();

    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                font_size: Some(48.0),
                font_weight: Some(700),
                font_italic: Some(true),
                line_height: Some(TextLineHeight::Factor(1.5)),
                letter_spacing: Some(TextLetterSpacing::Fixed(2.0)),
                text_align_vertical: Some(TextAlignVertical::Center),
                ..Default::default()
            }),
        }])
        .unwrap();
    assert_eq!(wc.node_font_size(&id), Some(48.0));
    assert_eq!(wc.node_font_weight(&id), Some(700));
    assert_eq!(wc.node_font_italic(&id), Some(true));
    assert_eq!(wc.node_line_height(&id), Some(1.5));
    assert_eq!(wc.node_letter_spacing(&id), Some(2.0));
    assert_eq!(
        wc.node_text_align_vertical(&id),
        Some(TextAlignVertical::Center)
    );
    assert!(
        !wc.structure_eq(&baseline),
        "typography changed the signature"
    );

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: typography inverse restores the exact prior style"
    );
}

/// The line-height inverse restores the exact prior *variant* (Normal),
/// not a normalized Factor — the patch carries the whole enum.
#[test]
fn line_height_inverse_restores_the_prior_variant() {
    use grida::cg::prelude::TextLineHeight;
    let mut wc = wc_with_text();
    let id = "t0".to_string();
    // The factory default is `Normal`.
    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                line_height: Some(TextLineHeight::Factor(2.0)),
                ..Default::default()
            }),
        }])
        .unwrap();
    // The captured inverse is the prior `Normal`, not a Factor.
    let Mutation::Patch { set, .. } = &applied.inverse[0] else {
        panic!("expected a patch inverse");
    };
    assert_eq!(set.line_height, Some(TextLineHeight::Normal));
}

/// DOC-4 — typography on a non-text kind (a Rectangle) is rejected and
/// leaves the node untouched.
#[test]
fn typography_requires_a_text_kind() {
    let mut wc = wc_with_rects(1);
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "r0".to_string(),
            set: Box::new(PropPatch {
                font_size: Some(24.0),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline));
}

/// DOC-2 — the layer-blur slot and the shadow list round-trip through
/// apply/inverse on an effect-capable kind (a Rectangle), and the whole
/// bag is observable via `node_effects`.
#[test]
fn doc_2_effects_roundtrip() {
    use grida::cg::fe::{FeLayerBlur, FeShadow, FilterShadowEffect};
    let mut wc = wc_with_rects(1);
    let id = "r0".to_string();
    let baseline = wc.clone();
    let shadow = FilterShadowEffect::DropShadow(FeShadow {
        dx: 1.0,
        dy: 2.0,
        blur: 3.0,
        spread: 4.0,
        color: CGColor::from_rgba(0, 0, 0, 128),
        active: true,
    });

    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                layer_blur: Some(Some(FeLayerBlur::from(8.0))),
                shadows: Some(vec![shadow.clone()]),
                ..Default::default()
            }),
        }])
        .unwrap();
    let fx = wc.node_effects(&id).unwrap();
    assert!(fx.blur.is_some(), "the blur slot was filled");
    assert_eq!(fx.shadows, vec![shadow], "the shadow list was written");
    assert!(!wc.structure_eq(&baseline), "effects changed the signature");

    wc.apply(&applied.inverse).unwrap();
    assert!(
        wc.structure_eq(&baseline),
        "DOC-2: the effects inverse restores the exact prior bag"
    );
}

/// The layer-blur inverse carries the whole prior *slot* (the empty
/// `Some(None)`), so undo removes a freshly-added blur exactly.
#[test]
fn layer_blur_inverse_restores_the_prior_slot() {
    use grida::cg::fe::FeLayerBlur;
    let mut wc = wc_with_rects(1);
    let id = "r0".to_string();
    // A fresh Rectangle carries no blur.
    let applied = wc
        .apply(&[Mutation::Patch {
            id: id.clone(),
            set: Box::new(PropPatch {
                layer_blur: Some(Some(FeLayerBlur::from(4.0))),
                ..Default::default()
            }),
        }])
        .unwrap();
    let Mutation::Patch { set, .. } = &applied.inverse[0] else {
        panic!("expected a patch inverse");
    };
    assert_eq!(set.layer_blur, Some(None));
}

/// DOC-4 — effects on a kind that carries none (a Group) are rejected and
/// leave the node untouched.
#[test]
fn effects_require_an_effect_capable_kind() {
    use grida::cg::fe::FeLayerBlur;
    let mut wc = WorkingCopy::new_empty("test");
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(group_fragment("g0", vec![])),
    }])
    .unwrap();
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "g0".to_string(),
            set: Box::new(PropPatch {
                layer_blur: Some(Some(FeLayerBlur::from(4.0))),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline));
}

/// DOC-4 — stroke width on a kind with no stroke (a Group) is rejected.
#[test]
fn stroke_width_requires_a_stroked_kind() {
    let mut wc = WorkingCopy::new_empty("test");
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(group_fragment("g0", vec![])),
    }])
    .unwrap();
    let baseline = wc.clone();
    let err = wc
        .apply(&[Mutation::Patch {
            id: "g0".to_string(),
            set: Box::new(PropPatch {
                stroke_width: Some(2.0),
                ..Default::default()
            }),
        }])
        .unwrap_err();
    assert!(matches!(err.reason, MutationErrorReason::Unsupported(_)));
    assert!(wc.structure_eq(&baseline));
}
