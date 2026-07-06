//! Layer-effects **binding-layer** conformance (Slice 1) — the Effects
//! sections' controls driven through the widget binding contract,
//! headless (no renderer, `ARCH-1`). The bind layer (not the panel —
//! `ARCH-3`) reads the target's current effect bag and computes the
//! patch. Slice 1 covers the single layer-blur slot and the multi-valued
//! drop/inner shadow list; backdrop blur, glass, noise, and progressive
//! blur are later slices.

use grida::cg::fe::{FeShadow, FilterShadowEffect};
use grida::cg::prelude::CGColor;
use grida::node::factory::NodeFactory;
use grida::node::schema::{LayerEffects, Node};
use grida_editor::document::{Fragment, Mutation, WorkingCopy};
use grida_editor::editor::Editor;
use grida_editor::ui::bind::{
    self, Binding, BindingPhase, BindingProperty, BindingValue, Emission, ListOp,
};

/// An editor holding one rectangle `r` — an effect-capable kind whose
/// effect bag starts empty (the factory default).
fn editor_with_rect() -> Editor {
    let mut wc = WorkingCopy::new_empty("fx");
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
    Editor::new(wc)
}

/// An editor holding one group `r` — a kind that carries no effects (the
/// capability gate: effect bindings must skip it, recording nothing).
fn editor_with_group() -> Editor {
    let mut wc = WorkingCopy::new_empty("fx");
    let nf = NodeFactory::new();
    wc.apply(&[Mutation::Insert {
        parent: None,
        index: 0,
        fragment: Box::new(Fragment {
            id: "r".to_string(),
            name: Some("r".to_string()),
            node: Node::Group(nf.create_group_node()),
            children: vec![],
        }),
    }])
    .unwrap();
    Editor::new(wc)
}

/// A one-interaction emission stream (Begin + Commit) for an effect
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

fn id() -> String {
    "r".to_string()
}

fn effects(editor: &Editor) -> LayerEffects {
    editor.node_effects(&id()).unwrap_or_default()
}

fn shadow_params(s: &FilterShadowEffect) -> &FeShadow {
    match s {
        FilterShadowEffect::DropShadow(p) | FilterShadowEffect::InnerShadow(p) => p,
    }
}

/// Enable the blur (helper for shadow-independent blur tests).
fn enable_blur(editor: &mut Editor) {
    bind::apply(
        editor,
        &commit(
            BindingProperty::LayerBlurEnabled,
            None,
            BindingValue::Bool(true),
        ),
    );
}

/// Add one default shadow (helper).
fn add_shadow(editor: &mut Editor) {
    bind::apply(
        editor,
        &commit(
            BindingProperty::Shadows,
            None,
            BindingValue::ListOp(ListOp::Add),
        ),
    );
}

// ── Layer blur (single slot) ─────────────────────────────────────────────

#[test]
fn enabling_layer_blur_adds_a_default_gaussian() {
    let mut editor = editor_with_rect();
    assert!(effects(&editor).blur.is_none());
    enable_blur(&mut editor);
    let blur = effects(&editor).blur.expect("blur slot filled");
    assert!(blur.active);
    assert_eq!(bind::blur_radius(&blur.blur), 4.0, "default radius");
}

#[test]
fn disabling_layer_blur_clears_the_slot() {
    let mut editor = editor_with_rect();
    enable_blur(&mut editor);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::LayerBlurEnabled,
            None,
            BindingValue::Bool(false),
        ),
    );
    assert!(effects(&editor).blur.is_none());
}

#[test]
fn blur_radius_commits_absolute() {
    let mut editor = editor_with_rect();
    enable_blur(&mut editor);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::LayerBlurRadius,
            None,
            BindingValue::Number(12.0),
        ),
    );
    let blur = effects(&editor).blur.unwrap();
    assert_eq!(bind::blur_radius(&blur.blur), 12.0);
}

#[test]
fn blur_active_toggles() {
    let mut editor = editor_with_rect();
    enable_blur(&mut editor);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::LayerBlurActive,
            None,
            BindingValue::Bool(false),
        ),
    );
    assert!(!effects(&editor).blur.unwrap().active);
}

#[test]
fn blur_radius_without_a_blur_records_nothing() {
    let mut editor = editor_with_rect();
    let before = editor.history_len();
    // No blur slot yet: the resolver skips (`fx.blur?`), so nothing lands.
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::LayerBlurRadius,
            None,
            BindingValue::Number(8.0),
        ),
    );
    assert_eq!(editor.history_len(), before);
    assert!(effects(&editor).blur.is_none());
}

// ── Shadows (multi-valued list) ──────────────────────────────────────────

#[test]
fn add_shadow_appends_a_default_drop() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    let shadows = effects(&editor).shadows;
    assert_eq!(shadows.len(), 1);
    assert!(matches!(shadows[0], FilterShadowEffect::DropShadow(_)));
}

#[test]
fn remove_shadow_drops_the_entry() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    add_shadow(&mut editor);
    assert_eq!(effects(&editor).shadows.len(), 2);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::Shadows,
            None,
            BindingValue::ListOp(ListOp::Remove(0)),
        ),
    );
    assert_eq!(effects(&editor).shadows.len(), 1);
}

#[test]
fn shadow_color_edits_the_addressed_entry() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    let red = CGColor::from_rgba(255, 0, 0, 255);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::ShadowColor,
            Some(0),
            BindingValue::Color(red),
        ),
    );
    assert_eq!(shadow_params(&effects(&editor).shadows[0]).color, red);
}

#[test]
fn shadow_kind_converts_drop_to_inner_preserving_params() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    let before = *shadow_params(&effects(&editor).shadows[0]);
    bind::apply(
        &mut editor,
        &commit(BindingProperty::ShadowKind, Some(0), BindingValue::Index(1)),
    );
    let s = &effects(&editor).shadows[0];
    assert!(matches!(s, FilterShadowEffect::InnerShadow(_)));
    assert_eq!(*shadow_params(s), before, "the parameters are carried over");
}

#[test]
fn shadow_offset_blur_and_spread_commit() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    for (prop, value) in [
        (BindingProperty::ShadowDx, 3.0),
        (BindingProperty::ShadowDy, -5.0),
        (BindingProperty::ShadowBlur, 9.0),
        (BindingProperty::ShadowSpread, 2.0),
    ] {
        bind::apply(
            &mut editor,
            &commit(prop, Some(0), BindingValue::Number(value)),
        );
    }
    let p = *shadow_params(&effects(&editor).shadows[0]);
    assert_eq!((p.dx, p.dy, p.blur, p.spread), (3.0, -5.0, 9.0, 2.0));
}

#[test]
fn shadow_blur_clamps_to_a_minimum() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::ShadowBlur,
            Some(0),
            BindingValue::Number(-4.0),
        ),
    );
    assert_eq!(shadow_params(&effects(&editor).shadows[0]).blur, 0.0);
}

#[test]
fn shadow_active_toggles() {
    let mut editor = editor_with_rect();
    add_shadow(&mut editor);
    bind::apply(
        &mut editor,
        &commit(
            BindingProperty::ShadowActive,
            Some(0),
            BindingValue::Bool(false),
        ),
    );
    assert!(!shadow_params(&effects(&editor).shadows[0]).active);
}

// ── Capability gate + history ────────────────────────────────────────────

#[test]
fn effects_on_a_non_effect_kind_record_nothing() {
    let mut editor = editor_with_group();
    let before = editor.history_len();
    add_shadow(&mut editor);
    enable_blur(&mut editor);
    assert_eq!(
        editor.history_len(),
        before,
        "the capability gate skipped the group — no history entry"
    );
    assert!(editor.node_effects(&id()).is_none());
}

#[test]
fn an_effect_commit_is_one_undoable_entry() {
    let mut editor = editor_with_rect();
    let before = editor.history_len();
    add_shadow(&mut editor);
    assert_eq!(editor.history_len(), before + 1);
    assert!(editor.undo());
    assert!(
        effects(&editor).shadows.is_empty(),
        "undo restores the empty shadow list"
    );
}
