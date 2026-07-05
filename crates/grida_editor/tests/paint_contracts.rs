//! Paint (fills) **binding-layer** conformance — the `fills` list
//! domain driven through the widget binding contract, headless (no
//! renderer, `ARCH-1`). These pin the seam the properties panel builds
//! on: a generic atom emits a value carrying its paint `entry`, and the
//! bind layer (not the panel — `ARCH-3`) reads the target's current
//! stack and computes the next one. Structural ops are `SHEET-3`
//! (add / remove / toggle-active), one history entry each.

use grida::cg::prelude::{CGColor, Paint, Paints, SolidPaint};
use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::ui::bind::{
    self, Binding, BindingPhase, BindingProperty, BindingValue, Emission, ListOp,
};

fn solid(r: u8, g: u8, b: u8, a: u8) -> Paint {
    Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(r, g, b, a)))
}

/// An editor holding one rectangle `r` whose fill stack is exactly
/// `fills`.
fn editor_with_fills(fills: Vec<Paint>) -> Editor {
    let mut wc = WorkingCopy::new_empty("paint");
    let nf = NodeFactory::new();
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(Fragment {
            id: "r".to_string(),
            name: Some("r".to_string()),
            node: Node::Rectangle(nf.create_rectangle_node()),
            children: vec![],
        }),
    }])
    .unwrap();
    let mut editor = Editor::new(wc);
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "r".to_string(),
                set: PropPatch {
                    fills: Some(Paints::new(fills)),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();
    editor
}

/// A one-interaction emission stream (Begin + Commit) for a fills
/// binding at `entry`.
fn commit(property: BindingProperty, entry: Option<usize>, value: BindingValue) -> Vec<Emission> {
    let binding = Binding {
        property,
        targets: vec!["r".to_string()],
        label: "ui.test".to_string(),
        entry,
    };
    vec![
        Emission {
            binding: binding.clone(),
            phase: BindingPhase::Begin,
        },
        Emission {
            binding,
            phase: BindingPhase::Commit(value),
        },
    ]
}

fn fills(editor: &Editor) -> Vec<Paint> {
    editor
        .node_fills(&"r".to_string())
        .map(|p| p.as_slice().to_vec())
        .unwrap_or_default()
}

// ── Structure: add / remove / toggle-active (SHEET-3) ────────────────────

#[test]
fn fills_add_appends_one_paint_in_one_entry() {
    let mut editor = editor_with_fills(vec![solid(0, 0, 0, 255)]);
    let before = editor.history_len();

    let applied = bind::apply(
        &mut editor,
        &commit(
            BindingProperty::Fills,
            None,
            BindingValue::ListOp(ListOp::Add),
        ),
    );
    assert!(applied.committed);
    assert_eq!(fills(&editor).len(), 2, "add appends one paint");
    assert_eq!(
        editor.history_len(),
        before + 1,
        "SHEET-3: one add is one history entry"
    );

    assert!(editor.undo());
    assert_eq!(fills(&editor).len(), 1, "undo restores the prior stack");
}

#[test]
fn fills_remove_drops_the_indexed_paint() {
    let mut editor = editor_with_fills(vec![solid(1, 0, 0, 255), solid(0, 2, 0, 255)]);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::Fills,
            None,
            BindingValue::ListOp(ListOp::Remove(0)),
        ),
    );
    let remaining = fills(&editor);
    assert_eq!(remaining.len(), 1);
    assert_eq!(
        remaining[0],
        solid(0, 2, 0, 255),
        "the entry at the removed index is gone, the other survives"
    );
}

#[test]
fn fills_toggle_active_disables_without_removing() {
    let mut editor = editor_with_fills(vec![solid(0, 0, 0, 255)]);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::Fills,
            None,
            BindingValue::ListOp(ListOp::ToggleEntry(0)),
        ),
    );
    let f = fills(&editor);
    assert_eq!(f.len(), 1, "toggle does not remove");
    assert!(!f[0].active(), "toggle disabled the paint");
}

// ── Per-entry sub-values: color / kind / opacity / active ────────────────

#[test]
fn fill_color_recolors_the_indexed_paint_only() {
    let mut editor = editor_with_fills(vec![solid(10, 10, 10, 255), solid(20, 20, 20, 255)]);
    let new = CGColor::from_rgba(200, 100, 50, 255);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::FillColor,
            Some(1),
            BindingValue::Color(new),
        ),
    );
    let f = fills(&editor);
    assert_eq!(f[0], solid(10, 10, 10, 255), "entry 0 untouched");
    assert_eq!(
        f[1],
        Paint::Solid(SolidPaint::new_color(new)),
        "entry 1 recolored"
    );
}

#[test]
fn fill_kind_converts_carrying_the_color() {
    let mut editor = editor_with_fills(vec![solid(30, 60, 90, 255)]);
    // Index 1 in PAINT_KINDS is "Linear".
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FillKind, Some(0), BindingValue::Index(1)),
    );
    let f = fills(&editor);
    match &f[0] {
        Paint::LinearGradient(g) => {
            assert_eq!(
                g.stops.first().map(|s| s.color),
                Some(CGColor::from_rgba(30, 60, 90, 255)),
                "the solid color seeds the gradient's first stop"
            );
        }
        other => panic!("expected a linear gradient, got {other:?}"),
    }
}

#[test]
fn fill_active_sets_the_flag() {
    let mut editor = editor_with_fills(vec![solid(0, 0, 0, 255)]);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::FillActive,
            Some(0),
            BindingValue::Bool(false),
        ),
    );
    assert!(!fills(&editor)[0].active());
}

#[test]
fn fill_opacity_sets_solid_alpha() {
    let mut editor = editor_with_fills(vec![solid(0, 0, 0, 255)]);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::FillOpacity,
            Some(0),
            BindingValue::Number(0.5),
        ),
    );
    let a = match &fills(&editor)[0] {
        Paint::Solid(p) => p.color.a,
        other => panic!("expected solid, got {other:?}"),
    };
    assert!((120..=132).contains(&a), "0.5 opacity ≈ alpha 128, got {a}");
}

// ── A commit whose target lacks fills is skipped, not a failure ──────────

#[test]
fn fills_binding_skips_a_target_without_fills() {
    // A Group carries no fills; a Fills/Add over it commits nothing (the
    // batch is empty → no history entry), rather than erroring.
    let mut wc = WorkingCopy::new_empty("paint");
    let nf = NodeFactory::new();
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(Fragment {
            id: "g".to_string(),
            name: Some("g".to_string()),
            node: Node::Group(nf.create_group_node()),
            children: vec![],
        }),
    }])
    .unwrap();
    let mut editor = Editor::new(wc);
    let before = editor.history_len();
    let binding = Binding {
        property: BindingProperty::Fills,
        targets: vec!["g".to_string()],
        label: "ui.test".to_string(),
        entry: None,
    };
    bind::apply(
        &mut editor,
        &[
            Emission {
                binding: binding.clone(),
                phase: BindingPhase::Begin,
            },
            Emission {
                binding,
                phase: BindingPhase::Commit(BindingValue::ListOp(ListOp::Add)),
            },
        ],
    );
    assert_eq!(
        editor.history_len(),
        before,
        "a no-op commit over an unsupported target records nothing"
    );
}
