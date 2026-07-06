//! Text typography **binding-layer** conformance (Slice A) — the Text
//! section's controls driven through the widget binding contract,
//! headless (no renderer, `ARCH-1`). The bind layer (not the panel —
//! `ARCH-3`) reads the target's current node-level style and computes
//! the patch. Font color/stroke are the Fills/Strokes domains and are
//! covered by `paint_contracts`; per-run rich text is a later slice.

use grida::cg::prelude::TextAlignVertical;
use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, WorkingCopy};
use grida_editor::editor::Editor;
use grida_editor::ui::bind::{
    self, Binding, BindingPhase, BindingProperty, BindingValue, Emission,
};

/// An editor holding one text node `t` (factory defaults: Geist 16,
/// weight 400, upright, line-height Normal, letter-spacing 0, valign Top).
fn editor_with_text() -> Editor {
    let mut wc = WorkingCopy::new_empty("text");
    let nf = NodeFactory::new();
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(Fragment {
            id: "t".to_string(),
            name: Some("t".to_string()),
            node: Node::TextSpan(nf.create_text_span_node()),
            children: vec![],
        }),
    }])
    .unwrap();
    Editor::new(wc)
}

/// An editor holding one rectangle `t` — a non-text kind (the capability
/// gate: typography bindings must skip it, recording nothing).
fn editor_with_rect() -> Editor {
    let mut wc = WorkingCopy::new_empty("text");
    let nf = NodeFactory::new();
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(Fragment {
            id: "t".to_string(),
            name: Some("t".to_string()),
            node: Node::Rectangle(nf.create_rectangle_node()),
            children: vec![],
        }),
    }])
    .unwrap();
    Editor::new(wc)
}

/// A one-interaction emission stream (Begin + Commit) for a typography
/// binding on `t`.
fn commit(property: BindingProperty, value: BindingValue) -> Vec<Emission> {
    let binding = Binding {
        property,
        targets: vec!["t".to_string()],
        label: "ui.test".to_string(),
        entry: None,
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

fn id() -> String {
    "t".to_string()
}

#[test]
fn font_size_commits_absolute() {
    let mut editor = editor_with_text();
    let applied = bind::apply(
        &mut editor,
        &commit(BindingProperty::FontSize, BindingValue::Number(48.0)),
    );
    assert!(applied.committed);
    assert_eq!(editor.node_font_size(&id()), Some(48.0));
}

#[test]
fn font_size_delta_is_relative_to_current() {
    let mut editor = editor_with_text();
    // Default is 16; a +4 delta lands on 20.
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FontSize, BindingValue::NumberDelta(4.0)),
    );
    assert_eq!(editor.node_font_size(&id()), Some(20.0));
}

#[test]
fn font_size_clamps_to_a_minimum() {
    let mut editor = editor_with_text();
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FontSize, BindingValue::Number(-5.0)),
    );
    assert_eq!(
        editor.node_font_size(&id()),
        Some(1.0),
        "min font size is 1"
    );
}

#[test]
fn font_weight_index_maps_to_the_named_weight() {
    let mut editor = editor_with_text();
    // FONT_WEIGHTS index 4 = Bold (700).
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FontWeight, BindingValue::Index(4)),
    );
    assert_eq!(editor.node_font_weight(&id()), Some(700));
}

#[test]
fn font_italic_toggles() {
    let mut editor = editor_with_text();
    assert_eq!(editor.node_font_italic(&id()), Some(false));
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FontItalic, BindingValue::Bool(true)),
    );
    assert_eq!(editor.node_font_italic(&id()), Some(true));
}

#[test]
fn line_height_authors_the_factor_multiplier() {
    let mut editor = editor_with_text();
    bind::apply(
        &mut editor,
        &commit(BindingProperty::LineHeight, BindingValue::Number(1.5)),
    );
    // The display query surfaces the multiplier; the stored `Factor`
    // variant (and its exact-inverse) is asserted in doc_contracts.
    assert_eq!(editor.node_line_height(&id()), Some(1.5));
}

#[test]
fn letter_spacing_authors_px_and_may_go_negative() {
    let mut editor = editor_with_text();
    bind::apply(
        &mut editor,
        &commit(BindingProperty::LetterSpacing, BindingValue::Number(-1.5)),
    );
    assert_eq!(editor.node_letter_spacing(&id()), Some(-1.5));
}

#[test]
fn vertical_align_index_maps_to_the_variant() {
    let mut editor = editor_with_text();
    // TEXT_ALIGN_VERTICALS index 2 = Bottom.
    bind::apply(
        &mut editor,
        &commit(BindingProperty::TextAlignVertical, BindingValue::Index(2)),
    );
    assert_eq!(
        editor.node_text_align_vertical(&id()),
        Some(TextAlignVertical::Bottom)
    );
}

#[test]
fn typography_on_a_non_text_kind_records_nothing() {
    let mut editor = editor_with_rect();
    let before = editor.history_len();
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FontSize, BindingValue::Number(24.0)),
    );
    assert_eq!(
        editor.history_len(),
        before,
        "the capability gate skipped the rect — no history entry"
    );
    assert_eq!(editor.node_font_size(&id()), None);
}

/// The typography values participate in undo as one entry each.
#[test]
fn a_typography_commit_is_one_undoable_entry() {
    let mut editor = editor_with_text();
    let before = editor.history_len();
    bind::apply(
        &mut editor,
        &commit(BindingProperty::FontSize, BindingValue::Number(72.0)),
    );
    assert_eq!(editor.history_len(), before + 1);
    assert!(editor.undo());
    assert_eq!(editor.node_font_size(&id()), Some(16.0), "undo restores 16");
}
