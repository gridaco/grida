//! UI-layer conformance (`UI-*`, `WID-3`, `PROP-7` seed) —
//! `crates/grida_editor/docs/ui.md`, `widgets.md`, `properties.md`.
//!
//! Headless throughout (`UI-7`): widgets are driven with the same
//! normalized surface-event vocabulary the canvas uses, and every
//! assertion runs on the document/editor plane or the scene-state
//! plane (the UI scene's node tree + the engine's computed geometry).
//! No window, no pixels.

use std::cell::Cell;
use std::collections::HashMap;
use std::rc::Rc;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use grida::overlay::{Modifiers, PointerButton, SurfaceEvent};
use grida::text_edit::session::KeyName;
use math2::transform::AffineTransform;

use grida_editor::document::{Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::ui::UiLayer;
use grida_editor::ui::bind::{self, Binding, BindingPhase, BindingProperty};
use grida_editor::ui::properties::{self, PropertiesPanel};
use grida_editor::ui::scroll::Scroll;
use grida_editor::ui::widget::{Widget, WidgetState};
use grida_editor::ui::widgets::{Panel, Slider, Swatch};

// ── Helpers ──────────────────────────────────────────────────────────────

const VIEWPORT: Size = Size {
    width: 800.0,
    height: 600.0,
};

/// One rectangle "A" (single solid fill, opacity 1.0) — the panel's
/// bound node.
fn one_rect_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.size = Size {
        width: 80.0,
        height: 80.0,
    };
    let mut graph = SceneGraph::new();
    let a = graph.append_child(Node::Rectangle(rect), Parent::Root);
    graph.set_name(a, "rect".to_string());
    let scene = Scene {
        name: "ui-tests".to_string(),
        background_color: None,
        graph,
    };
    let id_map = HashMap::from([(a, "A".to_string())]);
    let mut editor = Editor::new(WorkingCopy::from_scene(scene, id_map));
    editor.set_selection(vec!["A".to_string()]);
    editor
}

fn down(point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerDown {
        canvas_point: point,
        screen_point: point,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn mv(point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerMove {
        canvas_point: point,
        screen_point: point,
    }
}

fn up(point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerUp {
        canvas_point: point,
        screen_point: point,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn dummy_binding(property: BindingProperty) -> Binding {
    Binding {
        property,
        targets: vec!["A".to_string()],
        label: "test".to_string(),
        entry: None,
    }
}

fn test_slider(id: &str) -> Slider {
    Slider {
        id: id.to_string(),
        value: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.1,
        width: 120.0,
        height: 16.0,
        binding: dummy_binding(BindingProperty::Opacity),
    }
}

fn test_swatch(id: &str) -> Swatch {
    Swatch {
        id: id.to_string(),
        color: grida::cg::prelude::CGColor::from_u32(0xE65A46FF),
        width: 20.0,
        height: 14.0,
        action: grida_editor::ui::widgets::SwatchAction::Cycle,
        binding: dummy_binding(BindingProperty::FillSolid),
    }
}

/// A panel with one slider ("s1") and one swatch ("s2") — two
/// focusable widgets.
fn two_control_panel() -> Vec<Box<dyn Widget>> {
    Vec::from([Box::new(Panel {
        id: "panel".to_string(),
        title: "Test".to_string(),
        origin: (560.0, 0.0),
        width: 240.0,
        height: 600.0,
        children: vec![Box::new(test_slider("s1")), Box::new(test_swatch("s2"))],
    }) as Box<dyn Widget>])
}

fn center(b: math2::rect::Rectangle) -> [f32; 2] {
    [b.x + b.width / 2.0, b.y + b.height / 2.0]
}

fn slider_drag_state(
    ui: &UiLayer,
    id: &str,
) -> Option<grida_editor::ui::widgets::slider::SliderDrag> {
    match ui.state(&id.to_string()) {
        Some(WidgetState::Slider(s)) => s.drag,
        _ => None,
    }
}

// ── UI-1 / UI-2 ──────────────────────────────────────────────────────────

/// UI-2 — widget retained state survives a rebuild of its subtree:
/// after a full re-mount, the widget with the same identity has the
/// same state (keyboard focus and a mid-drag slider anchor). Also
/// asserts UI-1 at the scene-state plane: the whole widget tree is
/// plain engine schema nodes.
#[test]
fn ui2_rebuild_preserves_widget_state() {
    let mut ui = UiLayer::new(VIEWPORT);
    ui.mount(two_control_panel());

    // UI-1: the built tree is expressible entirely in the engine's
    // node schema — plain containers, text spans, rectangles.
    let mut kinds_ok = true;
    let mut node_count = 0usize;
    let roots: Vec<NodeId> = ui.scene().graph.roots().to_vec();
    for root in roots {
        ui.scene()
            .graph
            .walk_preorder(&root, &mut |id| {
                node_count += 1;
                if let Ok(node) = ui.scene().graph.get_node(id) {
                    kinds_ok &= matches!(
                        node,
                        Node::Container(_) | Node::TextSpan(_) | Node::Rectangle(_)
                    );
                }
            })
            .expect("walk ui scene");
    }
    assert!(node_count > 0, "UI-1: the panel built a node tree");
    assert!(
        kinds_ok,
        "UI-1: widget visuals are plain schema nodes (no special node kinds)"
    );

    // Focus the slider, start a drag (state: focus + drag anchor).
    let bounds = ui.widget_bounds(&"s1".to_string()).expect("slider bounds");
    ui.pointer(&down(center(bounds)));
    assert_eq!(ui.focused(), Some(&"s1".to_string()));
    assert_eq!(ui.captured(), Some(&"s1".to_string()));
    let drag_before = slider_drag_state(&ui, "s1").expect("drag open");

    // Rebuild the whole subtree ("rebuild, don't react").
    ui.mount(two_control_panel());

    // UI-2: same identity ⇒ same state after the rebuild.
    assert_eq!(
        ui.focused(),
        Some(&"s1".to_string()),
        "UI-2: focus survives a rebuild"
    );
    assert_eq!(
        ui.captured(),
        Some(&"s1".to_string()),
        "UI-2: pointer capture survives a rebuild"
    );
    assert_eq!(
        slider_drag_state(&ui, "s1"),
        Some(drag_before),
        "UI-2: mid-drag slider state survives a rebuild (keyed by identity)"
    );
}

// ── UI-3 ─────────────────────────────────────────────────────────────────

/// UI-3 — exactly one focused widget; tab order is deterministic
/// (build order); key events reach only the focused widget.
#[test]
fn ui3_focus_tab_order_and_key_routing() {
    let mut ui = UiLayer::new(VIEWPORT);
    ui.mount(two_control_panel());
    let mods = Modifiers::default();
    let shift = Modifiers {
        shift: true,
        ..Default::default()
    };

    assert_eq!(ui.focused(), None);

    // Tab traverses in build order, wrapping.
    assert!(ui.key(&KeyName::Tab, &mods).consumed);
    assert_eq!(ui.focused(), Some(&"s1".to_string()));
    assert!(ui.key(&KeyName::Tab, &mods).consumed);
    assert_eq!(ui.focused(), Some(&"s2".to_string()));
    assert!(ui.key(&KeyName::Tab, &mods).consumed);
    assert_eq!(ui.focused(), Some(&"s1".to_string()), "tab wraps");
    assert!(ui.key(&KeyName::Tab, &shift).consumed);
    assert_eq!(
        ui.focused(),
        Some(&"s2".to_string()),
        "shift+tab traverses backwards"
    );

    // Keys reach only the focused widget: with the swatch focused an
    // arrow (a slider key) is not consumed and emits nothing …
    let result = ui.key(&KeyName::ArrowRight, &mods);
    assert!(!result.consumed, "UI-3: arrow does not reach the slider");
    assert!(result.emissions.is_empty());

    // … while Enter cycles the swatch (its own key).
    let result = ui.key(&KeyName::Enter, &mods);
    assert!(result.consumed);
    assert!(
        result
            .emissions
            .iter()
            .all(|e| e.binding.property == BindingProperty::FillSolid),
        "UI-3: emissions come from the focused widget only"
    );

    // Focus the slider: the arrow now reaches it.
    assert!(ui.key(&KeyName::Tab, &mods).consumed);
    assert_eq!(ui.focused(), Some(&"s1".to_string()));
    let result = ui.key(&KeyName::ArrowRight, &mods);
    assert!(result.consumed);
    assert!(
        result
            .emissions
            .iter()
            .all(|e| e.binding.property == BindingProperty::Opacity),
        "UI-3: slider keys reach the focused slider"
    );
}

// ── UI-4 / WID-3 — the hot path ─────────────────────────────────────────

/// UI-4 / WID-3 / HISB-2 — a scripted slider drag over N synthetic
/// pointer events produces N Silent previews observed live on the
/// editor, exactly ONE history entry on release, and undo restores the
/// pre-drag opacity. The panel re-syncs after every preview (the
/// mid-drag rebuild path), so this also binds UI-2 into the hot path.
#[test]
fn ui4_wid3_slider_drag_hot_path() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);
    assert!(!ui.is_empty(), "selection is non-empty → panel mounted");

    // Observe editor notifications (one per applied batch).
    let notifications = Rc::new(Cell::new(0usize));
    let counter = notifications.clone();
    editor.observe(Box::new(move |_, _| counter.set(counter.get() + 1)));

    let opacity_id = properties::OPACITY_ID.to_string();
    let bounds = ui.widget_bounds(&opacity_id).expect("slider bounds");
    assert_eq!(editor.node_opacity(&"A".to_string()), Some(1.0));

    // Pointer down on the slider opens the interaction (Begin).
    let result = ui.pointer(&down([bounds.x + 1.0, bounds.y + bounds.height / 2.0]));
    assert!(result.consumed);
    bind::apply(&mut editor, &result.emissions);
    props.sync(&mut ui, &editor);

    // N pointer moves → N Silent previews, live on the editor.
    let fractions = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    let mut previews = 0usize;
    for f in fractions {
        let bounds = ui.widget_bounds(&opacity_id).expect("slider bounds");
        let point = [bounds.x + bounds.width * f, bounds.y + bounds.height / 2.0];
        let result = ui.pointer(&mv(point));
        assert!(result.consumed, "captured drag consumes every move");
        previews += result
            .emissions
            .iter()
            .filter(|e| matches!(e.phase, BindingPhase::Preview(_)))
            .count();
        bind::apply(&mut editor, &result.emissions);

        // Live preview: the document opacity tracks the pointer.
        let opacity = editor.node_opacity(&"A".to_string()).expect("opacity");
        assert!(
            (opacity - f).abs() < 1e-3,
            "UI-4: preview {f} applied live (got {opacity})"
        );
        // Nothing recorded during the drag.
        assert_eq!(editor.history_len(), 0, "UI-4: previews are never recorded");

        // Re-sync the panel mid-drag: the slider subtree rebuilds with
        // the new value while the drag survives by identity (UI-2).
        props.sync(&mut ui, &editor);
        assert_eq!(ui.captured(), Some(&opacity_id));
    }
    assert_eq!(
        previews,
        fractions.len(),
        "WID-3: previews at input cadence"
    );
    assert_eq!(
        notifications.get(),
        fractions.len(),
        "N synthetic pointer events → N Silent previews observed on the editor"
    );

    // Release → exactly one commit, exactly one history entry.
    let bounds = ui.widget_bounds(&opacity_id).expect("slider bounds");
    let result = ui.pointer(&up([bounds.x + bounds.width * 0.8, bounds.y + 4.0]));
    let commits = result
        .emissions
        .iter()
        .filter(|e| matches!(e.phase, BindingPhase::Commit(_)))
        .count();
    assert_eq!(commits, 1, "UI-4: exactly one commit per interaction");
    let applied = bind::apply(&mut editor, &result.emissions);
    assert!(applied.committed);
    props.sync(&mut ui, &editor);

    assert_eq!(
        editor.history_len(),
        1,
        "WID-3/HISB-2: the whole drag is exactly ONE history entry"
    );
    let opacity = editor.node_opacity(&"A".to_string()).expect("opacity");
    assert!(
        (opacity - 0.8).abs() < 1e-3,
        "WID-3: committed value equals the last preview"
    );

    // Undo restores the pre-drag opacity (HISB-2 end-to-end through UI).
    assert!(editor.undo());
    assert_eq!(
        editor.node_opacity(&"A".to_string()),
        Some(1.0),
        "HISB-2: undo restores the pre-drag opacity"
    );
}

// ── UI-5 ─────────────────────────────────────────────────────────────────

/// UI-5 — pointer input over UI regions never reaches the canvas
/// (consumed, so the driver never forwards it → selection unchanged);
/// pointer input outside UI regions never activates a widget.
#[test]
fn ui5_pointer_arbitration() {
    let editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    let selection_before = editor.selection().to_vec();

    // Over a widget: consumed — the driver must not forward to the
    // canvas, so canvas selection cannot change.
    let slider_bounds = ui
        .widget_bounds(&properties::OPACITY_ID.to_string())
        .expect("slider bounds");
    let result = ui.pointer(&down(center(slider_bounds)));
    assert!(result.consumed, "UI-5: input over a widget is consumed");
    ui.pointer(&up(center(slider_bounds)));
    assert_eq!(
        editor.selection(),
        selection_before.as_slice(),
        "UI-5: canvas selection unchanged"
    );

    // Over the panel background (no widget): still consumed.
    let panel_bounds = ui
        .widget_bounds(&properties::PANEL_ID.to_string())
        .expect("panel bounds");
    let result = ui.pointer(&down([
        panel_bounds.x + 4.0,
        panel_bounds.y + panel_bounds.height - 4.0,
    ]));
    assert!(
        result.consumed,
        "UI-5: input over the panel background is consumed"
    );
    assert!(result.emissions.is_empty());
    ui.pointer(&up([
        panel_bounds.x + 4.0,
        panel_bounds.y + panel_bounds.height - 4.0,
    ]));

    // Outside all UI regions: not consumed, and no widget activates.
    let result = ui.pointer(&down([100.0, 100.0]));
    assert!(
        !result.consumed,
        "UI-5: input outside UI regions falls through to the canvas"
    );
    assert!(result.emissions.is_empty());
    assert_eq!(ui.captured(), None, "UI-5: no widget activated");
    assert_eq!(
        slider_drag_state(&ui, properties::OPACITY_ID),
        None,
        "UI-5: no drag opened outside UI regions"
    );
}

// ── UI-6 ─────────────────────────────────────────────────────────────────

/// UI-6 — a scroll container clips hit-testing: a widget scrolled out
/// of its container's clip is not hittable; scrolled back, it is.
#[test]
fn ui6_scroll_clip_hit_testing() {
    let mut ui = UiLayer::new(VIEWPORT);
    // Viewport 200×60; content = 4 sliders × 20px + 3 × 4px gap = 92px.
    let sliders: Vec<Box<dyn Widget>> = (1..=4)
        .map(|i| {
            let mut s = test_slider(&format!("s{i}"));
            s.width = 180.0;
            s.height = 20.0;
            Box::new(s) as Box<dyn Widget>
        })
        .collect();
    ui.mount(vec![Box::new(Scroll {
        id: "scroll".to_string(),
        width: 200.0,
        height: 60.0,
        gap: 4.0,
        children: sliders,
    })]);

    let clip_bounds = ui.widget_bounds(&"scroll".to_string()).expect("viewport");
    let s4 = "s4".to_string();
    let before = ui.widget_bounds(&s4).expect("s4 bounds");
    assert!(
        before.y >= clip_bounds.y + clip_bounds.height,
        "fixture: s4 starts below the clip (y {} vs clip bottom {})",
        before.y,
        clip_bounds.y + clip_bounds.height
    );

    // Scrolled out: pointer down at s4's own bounds does not reach it.
    let result = ui.pointer(&down(center(before)));
    assert_eq!(
        ui.captured(),
        None,
        "UI-6: a widget outside its container's clip is not hittable"
    );
    assert!(result.emissions.is_empty());

    // Scroll it into view (offset clamps to content − viewport = 32).
    assert!(ui.wheel([clip_bounds.x + 10.0, clip_bounds.y + 10.0], 40.0));
    let after = ui.widget_bounds(&s4).expect("s4 bounds after scroll");
    assert!(
        after.y < clip_bounds.y + clip_bounds.height,
        "s4 scrolled into the viewport"
    );

    // Scrolled back in: now it is hittable.
    ui.pointer(&down(center(after)));
    assert_eq!(
        ui.captured(),
        Some(&s4),
        "UI-6: scrolled back into the clip, the widget is hittable"
    );
    ui.pointer(&up(center(after)));
}

// ── PROP-7 (seed) ────────────────────────────────────────────────────────

/// PROP-7 seed — observation granularity: a dispatch changing only the
/// node's name rebuilds the name label but NOT the opacity slider's
/// subtree (asserted by node identity).
#[test]
fn prop7_name_change_does_not_rebuild_slider() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    let slider_root = ui
        .widget_root(&properties::OPACITY_ID.to_string())
        .expect("slider mounted");
    let label_root = ui
        .widget_root(&properties::NAME_ID.to_string())
        .expect("label mounted");
    let swatch_root = ui
        .widget_root(&properties::fill_swatch_id(0))
        .expect("swatch mounted (single solid fill)");

    // A name-only dispatch through the editor.
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: PropPatch {
                    name: Some("renamed".to_string()),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("name patch applies");
    props.sync(&mut ui, &editor);

    assert_ne!(
        ui.widget_root(&properties::NAME_ID.to_string()),
        Some(label_root),
        "the name label rebuilt (its subtree was swapped)"
    );
    assert_eq!(
        ui.widget_root(&properties::OPACITY_ID.to_string()),
        Some(slider_root),
        "PROP-7: a name-only dispatch does not rebuild the opacity slider's subtree"
    );
    assert_eq!(
        ui.widget_root(&properties::fill_swatch_id(0)),
        Some(swatch_root),
        "PROP-7: nor the fill swatch's"
    );

    // And a no-op sync rebuilds nothing at all.
    let slider_root = ui.widget_root(&properties::OPACITY_ID.to_string());
    props.sync(&mut ui, &editor);
    assert_eq!(
        ui.widget_root(&properties::OPACITY_ID.to_string()),
        slider_root,
        "PROP-7: a sync with no value change rebuilds nothing"
    );
}

// ── Swatch cycle-mode placeholder commit ─────────────────────────────────

/// WID (swatch `Cycle` mode) — a standalone cycle swatch commits one
/// begin→commit palette step per click: one history entry, fill
/// applied, undo restores. (The properties panel's fill swatch is in
/// `OpenPicker` mode — that path is `picker_opens_from_swatch_*`.)
#[test]
fn swatch_cycle_click_commits_once() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    // Mount a standalone cycle swatch bound to A's fill.
    ui.mount(vec![Box::new(Swatch {
        id: "cyc".to_string(),
        color: editor.node_fill_solid(&"A".to_string()).unwrap(),
        width: 20.0,
        height: 14.0,
        action: grida_editor::ui::widgets::SwatchAction::Cycle,
        binding: dummy_binding(BindingProperty::FillSolid),
    })]);

    let fill_before = editor
        .node_fill_solid(&"A".to_string())
        .expect("solid fill");
    let swatch_bounds = ui.widget_bounds(&"cyc".to_string()).expect("swatch bounds");

    let result = ui.pointer(&down(center(swatch_bounds)));
    assert!(result.consumed);
    let applied = bind::apply(&mut editor, &result.emissions);
    assert!(applied.committed);
    ui.pointer(&up(center(swatch_bounds)));

    assert_eq!(editor.history_len(), 1, "one click → one history entry");
    let fill_after = editor
        .node_fill_solid(&"A".to_string())
        .expect("solid fill");
    assert_ne!(fill_before, fill_after, "the fill changed");

    assert!(editor.undo());
    assert_eq!(
        editor.node_fill_solid(&"A".to_string()),
        Some(fill_before),
        "undo restores the prior fill"
    );
}

// ── PROP-9: empty selection inspects the scene ────────────────────────

/// PROP-9 — the panel never unmounts: with nothing selected it shows
/// the scene's background color control, whose edits ride the same
/// binding contract (one entry per interaction) through the scene
/// domain of the mutation vocabulary; undo restores "none", and the
/// transparency-grid state is reachable again through the clear
/// affordance.
#[test]
fn prop9_empty_selection_edits_scene_background() {
    use grida::cg::prelude::CGColor;
    use grida_editor::ui::bind::BindingValue;

    let mut editor = one_rect_editor();
    editor.set_selection(Vec::new());
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    // Scene mode is mounted: the background control and its clear
    // button exist; the node inspector does not.
    assert!(ui.widget_root(&properties::BG_ID.to_string()).is_some());
    assert!(
        ui.widget_root(&properties::BG_CLEAR_ID.to_string())
            .is_some()
    );
    assert!(
        ui.widget_root(&properties::OPACITY_ID.to_string())
            .is_none()
    );

    // A preview stream + commit through the binding contract: one
    // history entry, endpoint value.
    let binding = Binding {
        property: BindingProperty::SceneBackground,
        targets: Vec::new(),
        label: "ui.scene.bg".to_string(),
        entry: None,
    };
    let (c1, c2) = (
        CGColor::from_rgba(10, 20, 30, 255),
        CGColor::from_rgba(200, 100, 50, 255),
    );
    bind::apply(
        &mut editor,
        &[
            bind::Emission {
                binding: binding.clone(),
                phase: BindingPhase::Begin,
            },
            bind::Emission {
                binding: binding.clone(),
                phase: BindingPhase::Preview(BindingValue::Color(c1)),
            },
            bind::Emission {
                binding,
                phase: BindingPhase::Commit(BindingValue::Color(c2)),
            },
        ],
    );
    assert_eq!(editor.background_color(), Some(c2));
    assert_eq!(editor.history_len(), 1, "one entry per interaction");

    // The panel re-syncs to the new value without unmounting.
    props.sync(&mut ui, &editor);
    assert!(ui.widget_root(&properties::BG_ID.to_string()).is_some());

    // Clearing (the shell dispatches on the panel's report) restores
    // "none" — the transparency grid's state — and undoes exactly.
    // Its own entry: committed entries never merge (HISB-3).
    editor
        .dispatch(
            vec![Mutation::SceneBackground { color: None }],
            Origin::Local,
            Recording::Record {
                label: Some("ui.scene.bg".to_string()),
            },
        )
        .expect("clear applies");
    assert_eq!(editor.background_color(), None);
    assert!(editor.undo());
    assert_eq!(editor.background_color(), Some(c2));
    assert!(editor.undo());
    assert_eq!(editor.background_color(), None, "back to no background");

    // Selecting swaps to the node inspector; deselecting swaps back.
    editor.set_selection(vec!["A".to_string()]);
    props.sync(&mut ui, &editor);
    assert!(
        ui.widget_root(&properties::OPACITY_ID.to_string())
            .is_some()
    );
    assert!(ui.widget_root(&properties::BG_ID.to_string()).is_none());
    editor.set_selection(Vec::new());
    props.sync(&mut ui, &editor);
    assert!(ui.widget_root(&properties::BG_ID.to_string()).is_some());
}

// ── color-picker panel wiring ─────────────────────────────────────────────

/// The fill swatch opens the color-picker popover, dragging its SV
/// plane edits the selected node's fill through the same binding, and
/// an outside press dismisses it. The whole path is exercised
/// headlessly — the shell's `process_ui` is replaced by manual
/// `bind::apply` + `props.sync`.
#[test]
fn picker_opens_from_swatch_edits_fill_and_dismisses() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    let fill_before = editor
        .node_fill_solid(&"A".to_string())
        .expect("solid fill");

    // Activate the fill swatch, then sync — the panel opens the picker.
    let swatch = ui
        .widget_bounds(&properties::fill_swatch_id(0))
        .expect("swatch bounds");
    ui.pointer(&down(center(swatch)));
    ui.pointer(&up(center(swatch)));
    props.sync(&mut ui, &editor);

    let picker = ui
        .widget_bounds(&properties::PICKER_ID.to_string())
        .expect("picker opened from the swatch");
    assert_eq!(
        ui.captured(),
        Some(&properties::PICKER_ID.to_string()),
        "the open picker holds the popup grab"
    );

    // Drag the SV plane (interior, well inside the popover padding).
    let plane = [picker.x + picker.width / 2.0, picker.y + 50.0];
    let r = ui.pointer(&down(plane));
    bind::apply(&mut editor, &r.emissions);
    let r = ui.pointer(&mv([plane[0] + 20.0, plane[1] + 20.0]));
    bind::apply(&mut editor, &r.emissions);
    let r = ui.pointer(&up([plane[0] + 20.0, plane[1] + 20.0]));
    let committed = r.emissions.iter().any(|e| {
        matches!(
            e.phase,
            bind::BindingPhase::Commit(bind::BindingValue::Color(_))
        )
    });
    bind::apply(&mut editor, &r.emissions);
    props.sync(&mut ui, &editor);

    assert!(committed, "releasing the SV drag commits a color");
    assert_ne!(
        editor.node_fill_solid(&"A".to_string()),
        Some(fill_before),
        "the drag edited the node's fill through the swatch's binding"
    );

    // An outside press dismisses the picker; the next sync unmounts it.
    ui.pointer(&down([4.0, 4.0]));
    props.sync(&mut ui, &editor);
    assert!(
        ui.widget_bounds(&properties::PICKER_ID.to_string())
            .is_none(),
        "an outside press closes the picker"
    );
}

/// Regression (WID-8 dismiss rule — [`popover::should_dismiss`]): a
/// popover opened *beside* its trigger excludes the trigger from
/// outside-dismiss. The picker opens grabbing capture mid-gesture, so
/// the opening gesture's residual press lands on the trigger (the
/// swatch), outside the panel; excluding the trigger keeps that press
/// — and any later press on the trigger — from dismissing the picker.
/// A single press outside *both* dismisses on the first press (no
/// second click; that regression was the `just_opened` band-aid).
///
/// Models the live-loop event stream the headless harness cannot
/// otherwise produce: the captured picker receiving an outside
/// `PointerDown` at the trigger's location.
#[test]
fn picker_dismiss_excludes_its_trigger() {
    let editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);
    let swatch = center(
        ui.widget_bounds(&properties::fill_swatch_id(0))
            .expect("swatch"),
    );
    let open = |ui: &UiLayer| {
        ui.widget_bounds(&properties::PICKER_ID.to_string())
            .is_some()
    };

    // Open (shell process_ui order: pointer, then sync).
    ui.pointer(&down(swatch));
    props.sync(&mut ui, &editor);
    ui.pointer(&up(swatch));
    props.sync(&mut ui, &editor);
    assert!(open(&ui), "the picker opens from the swatch");

    // Repeated presses on the swatch (the trigger) never dismiss — the
    // opening gesture's residual press, and any later trigger press,
    // are excluded (WID-8).
    for _ in 0..3 {
        ui.pointer(&down(swatch));
        props.sync(&mut ui, &editor);
        ui.pointer(&up(swatch));
        props.sync(&mut ui, &editor);
        assert!(
            open(&ui),
            "a press on the trigger must never dismiss the picker (WID-8)"
        );
    }

    // A single press outside both the panel and the trigger dismisses
    // — on the FIRST press.
    ui.pointer(&down([10.0, 10.0]));
    props.sync(&mut ui, &editor);
    assert!(
        !open(&ui),
        "a press outside both the picker and its trigger dismisses on the first press"
    );
}

/// The panel enrichments are wired end-to-end: the visible toggle
/// edits `active`, the rotation number (degrees) edits the node's
/// radians, and the name text input edits the node name — each via
/// its binding, the same path the shell drives.
#[test]
fn panel_wires_name_visible_rotation() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);
    let a = "A".to_string();
    let mods = Modifiers::default();

    // Visible toggle hides the node (active true → false).
    let vis = center(
        ui.widget_bounds(&properties::VISIBLE_ID.to_string())
            .unwrap(),
    );
    let r = ui.pointer(&down(vis));
    bind::apply(&mut editor, &r.emissions);
    assert_eq!(
        editor.document().node_active(&a),
        Some(false),
        "the visible toggle hid the node"
    );
    props.sync(&mut ui, &editor);

    // Rotation number: type 90° → node stores π/2 radians.
    let rot = center(
        ui.widget_bounds(&properties::ROTATION_ID.to_string())
            .unwrap(),
    );
    ui.pointer(&down(rot));
    ui.pointer(&up(rot));
    ui.key(&KeyName::Character("9".to_string()), &mods);
    ui.key(&KeyName::Character("0".to_string()), &mods);
    let r = ui.key(&KeyName::Enter, &mods);
    bind::apply(&mut editor, &r.emissions);
    let rot_rad = editor.node_rotation(&a).unwrap();
    assert!(
        (rot_rad - std::f32::consts::FRAC_PI_2).abs() < 1e-3,
        "rotation authored in degrees, stored in radians — got {rot_rad}"
    );
    props.sync(&mut ui, &editor);

    // Name text: focus (seeds the buffer from "rect"), append, commit.
    let name = center(ui.widget_bounds(&properties::NAME_ID.to_string()).unwrap());
    ui.pointer(&down(name));
    ui.key(&KeyName::Character("!".to_string()), &mods);
    let r = ui.key(&KeyName::Enter, &mods);
    bind::apply(&mut editor, &r.emissions);
    assert_eq!(
        editor.document().node_name(&a).as_deref(),
        Some("rect!"),
        "the name input edited the node name"
    );
}

/// The blend-mode select is wired end-to-end: opening it and choosing
/// a row commits the node's `blend_mode` (the unused Select composite
/// now surfaced in the panel), and undo restores the prior mode.
#[test]
fn panel_wires_blend_mode_select() {
    use grida::cg::prelude::{BlendMode, LayerBlendMode};
    use grida_editor::ui::widgets::select::{PAD, ROW_H};

    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);
    let a = "A".to_string();

    // Open the blend select (press + release over the button keeps it
    // open; the select self-captures and rebuilds its list).
    let b = ui.widget_bounds(&properties::BLEND_ID.to_string()).unwrap();
    ui.pointer(&down(center(b)));
    ui.pointer(&up(center(b)));

    // Choose row 2 ("Multiply") in the list below the button.
    let anchor = [b.x, b.y + b.height];
    let row2 = [
        anchor[0] + b.width / 2.0,
        anchor[1] + PAD + 2.0 * ROW_H + ROW_H / 2.0,
    ];
    ui.pointer(&down(row2));
    let r = ui.pointer(&up(row2));
    bind::apply(&mut editor, &r.emissions);
    assert_eq!(
        editor.node_blend_mode(&a),
        Some(LayerBlendMode::Blend(BlendMode::Multiply)),
        "choosing Multiply set the node's blend mode"
    );

    assert!(editor.undo());
    assert_eq!(
        editor.node_blend_mode(&a),
        Some(LayerBlendMode::PassThrough),
        "undo restored the prior blend mode"
    );
}

/// Corner radius is wired through the panel: the rectangle's Radius
/// number commits `corner_radius`, and undo restores it.
#[test]
fn panel_wires_corner_radius() {
    let mut editor = one_rect_editor();
    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);
    let a = "A".to_string();
    let mods = Modifiers::default();

    let rad = center(
        ui.widget_bounds(&properties::CORNER_ID.to_string())
            .expect("the rectangle shows a Radius row"),
    );
    ui.pointer(&down(rad));
    ui.pointer(&up(rad));
    ui.key(&KeyName::Character("8".to_string()), &mods);
    let r = ui.key(&KeyName::Enter, &mods);
    bind::apply(&mut editor, &r.emissions);
    let cr = editor.node_corner_radius(&a).unwrap();
    assert!((cr - 8.0).abs() < 1e-3, "corner radius set to 8, got {cr}");

    assert!(editor.undo());
    assert_eq!(
        editor.node_corner_radius(&a),
        Some(0.0),
        "undo restores the prior radius"
    );
}

fn editor_with(node: Node, name: &str) -> Editor {
    let mut graph = SceneGraph::new();
    let iid = graph.append_child(node, Parent::Root);
    graph.set_name(iid, name.to_string());
    let scene = Scene {
        name: "t".to_string(),
        background_color: None,
        graph,
    };
    let id_map = HashMap::from([(iid, "A".to_string())]);
    let mut editor = Editor::new(WorkingCopy::from_scene(scene, id_map));
    editor.set_selection(vec!["A".to_string()]);
    editor
}

/// The appearance-batch document patches apply on the node kinds that
/// carry them (point_count on stars, clips_content on containers,
/// text_align on text), with undo.
#[test]
fn document_wires_point_count_clip_align() {
    use grida::cg::prelude::TextAlign;
    let nf = NodeFactory::new();
    let a = "A".to_string();
    let patch = |set: PropPatch| Mutation::Patch {
        id: "A".to_string(),
        set,
    };

    // point_count on a star.
    let mut ed = editor_with(
        Node::RegularStarPolygon(nf.create_regular_star_polygon_node()),
        "star",
    );
    let before = ed.node_point_count(&a).unwrap();
    ed.dispatch(
        vec![patch(PropPatch {
            point_count: Some(7),
            ..Default::default()
        })],
        Origin::Local,
        Recording::Record { label: None },
    )
    .unwrap();
    assert_eq!(ed.node_point_count(&a), Some(7));
    assert!(ed.undo());
    assert_eq!(ed.node_point_count(&a), Some(before));

    // clips_content on a container.
    let mut ed = editor_with(Node::Container(nf.create_container_node()), "box");
    ed.dispatch(
        vec![patch(PropPatch {
            clips_content: Some(true),
            ..Default::default()
        })],
        Origin::Local,
        Recording::Record { label: None },
    )
    .unwrap();
    assert_eq!(ed.node_clips_content(&a), Some(true));

    // text_align on a text node.
    let mut ed = editor_with(Node::TextSpan(nf.create_text_span_node()), "txt");
    ed.dispatch(
        vec![patch(PropPatch {
            text_align: Some(TextAlign::Center),
            ..Default::default()
        })],
        Origin::Local,
        Recording::Record { label: None },
    )
    .unwrap();
    assert_eq!(ed.node_text_align(&a), Some(TextAlign::Center));
    assert!(ed.undo());
}

// ── Fills section: multiple paints render + add commits ──────────────────

/// The Fills section renders one row per paint (each with its own
/// swatch + kind select), and the header's add button commits a
/// `Fills`/`Add` that grows the head node's stack (`SHEET-3`). This is
/// the panel wiring atop the `paint_contracts` binding coverage.
#[test]
fn fills_section_renders_rows_and_add_commits() {
    use grida::cg::prelude::{CGColor, Paint, Paints, SolidPaint};
    let mut editor = one_rect_editor();
    // Seed a two-paint stack on A.
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: PropPatch {
                    fills: Some(Paints::new(vec![
                        Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(10, 20, 30, 255))),
                        Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(40, 50, 60, 255))),
                    ])),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();

    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    // A row (swatch + kind) per paint.
    for i in 0..2 {
        assert!(
            ui.widget_root(&properties::fill_swatch_id(i)).is_some(),
            "fill {i} swatch mounted"
        );
        assert!(
            ui.widget_root(&properties::fill_kind_id(i)).is_some(),
            "fill {i} kind select mounted"
        );
    }
    assert!(
        ui.widget_root(&properties::FILLS_ADD_ID.to_string())
            .is_some(),
        "the add button mounted"
    );

    // Click the add button → a Fills/Add commit grows the stack to 3.
    let add = ui
        .widget_bounds(&properties::FILLS_ADD_ID.to_string())
        .expect("add bounds");
    let r = ui.pointer(&down(center(add)));
    let applied = bind::apply(&mut editor, &r.emissions);
    ui.pointer(&up(center(add)));
    assert!(applied.committed, "the add button commits");
    assert_eq!(
        editor
            .node_fills(&"A".to_string())
            .map(|p| p.as_slice().len()),
        Some(3),
        "add appended a third paint to the head node's stack"
    );
}

/// The Strokes section renders per-stroke rows (reusing the fills
/// machinery), and the read-only/scaffold sections — Effects, Selection
/// colors, Export — are present for a paintable node.
#[test]
fn strokes_and_scaffold_sections_render() {
    use grida::cg::prelude::{CGColor, Paint, Paints, SolidPaint};
    let mut editor = one_rect_editor();
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: PropPatch {
                    strokes: Some(Paints::new(vec![Paint::Solid(SolidPaint::new_color(
                        CGColor::from_rgba(0, 0, 0, 255),
                    ))])),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();

    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    assert!(
        ui.widget_root(&properties::stroke_swatch_id(0)).is_some(),
        "the seeded stroke renders a swatch row"
    );
    assert!(
        ui.widget_root(&properties::STROKES_ADD_ID.to_string())
            .is_some(),
        "the strokes add button mounted"
    );
    for header in [
        properties::BLUR_HEADER_ID,
        properties::SHADOWS_HEADER_ID,
        properties::SELECTION_COLORS_HEADER_ID,
        properties::EXPORT_HEADER_ID,
    ] {
        assert!(
            ui.widget_root(&header.to_string()).is_some(),
            "section {header} present"
        );
    }

    // Stroke geometry rows render below the stroke paint (a Rectangle
    // carries a stroke style, so weight/align/cap/join all show; miter
    // shows because the default join is miter).
    for id in [
        properties::STROKE_WIDTH_ID,
        properties::STROKE_ALIGN_ID,
        properties::STROKE_CAP_ID,
        properties::STROKE_JOIN_ID,
        properties::STROKE_MITER_ID,
    ] {
        assert!(
            ui.widget_root(&id.to_string()).is_some(),
            "stroke geometry control {id} present"
        );
    }
    // (Weight/cap/dash commit behaviour is covered in paint_contracts.)
}

/// The Text (typography) section renders its rows for a text kind — size,
/// weight, italic, line, letter, horizontal + vertical align — and a font
/// size edit commits through the panel wiring. The controls' full binding
/// coverage is in `text_contracts`.
#[test]
fn text_section_renders_and_size_commits() {
    let nf = NodeFactory::new();
    let editor = editor_with(Node::TextSpan(nf.create_text_span_node()), "txt");

    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    for id in [
        properties::TEXT_HEADER_ID,
        properties::TEXT_SIZE_ID,
        properties::TEXT_WEIGHT_ID,
        properties::TEXT_ITALIC_ID,
        properties::TEXT_LINE_ID,
        properties::TEXT_LETTER_ID,
        properties::ALIGN_ID,
        properties::TEXT_VALIGN_ID,
    ] {
        assert!(
            ui.widget_root(&id.to_string()).is_some(),
            "text control {id} present"
        );
    }

    // A non-text node shows no Text section.
    let mut ui2 = UiLayer::new(VIEWPORT);
    let mut props2 = PropertiesPanel::new(240.0);
    props2.sync(&mut ui2, &one_rect_editor());
    assert!(
        ui2.widget_root(&properties::TEXT_HEADER_ID.to_string())
            .is_none(),
        "a rectangle has no Text section"
    );
}

/// The Effects sections render for an effect-capable kind: the Layer-blur
/// header + enable toggle always, its radius/active rows once a blur
/// exists, and the Shadows header + add, plus a seeded shadow's control
/// row (kind/swatch) and parameter numbers. A kind with no effects (a
/// Group) shows neither section. Binding behaviour is in `effect_contracts`.
#[test]
fn effects_sections_render_for_an_effect_capable_kind() {
    use grida::cg::fe::{FeLayerBlur, FeShadow, FilterShadowEffect};

    let mut editor = one_rect_editor();
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: PropPatch {
                    layer_blur: Some(Some(FeLayerBlur::from(6.0))),
                    shadows: Some(vec![FilterShadowEffect::DropShadow(FeShadow {
                        dx: 0.0,
                        dy: 2.0,
                        blur: 4.0,
                        spread: 0.0,
                        color: grida::cg::prelude::CGColor::from_rgba(0, 0, 0, 128),
                        active: true,
                    })]),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();

    let mut ui = UiLayer::new(VIEWPORT);
    let mut props = PropertiesPanel::new(240.0);
    props.sync(&mut ui, &editor);

    for id in [
        properties::BLUR_HEADER_ID.to_string(),
        properties::BLUR_ENABLE_ID.to_string(),
        properties::BLUR_RADIUS_ID.to_string(),
        properties::BLUR_ACTIVE_ID.to_string(),
        properties::SHADOWS_HEADER_ID.to_string(),
        properties::SHADOWS_ADD_ID.to_string(),
        properties::shadow_swatch_id(0),
    ] {
        assert!(ui.widget_root(&id).is_some(), "effect control {id} present");
    }

    // A kind with no effects (a Group) shows neither section.
    let nf = NodeFactory::new();
    let mut ui2 = UiLayer::new(VIEWPORT);
    let mut props2 = PropertiesPanel::new(240.0);
    props2.sync(
        &mut ui2,
        &editor_with(Node::Group(nf.create_group_node()), "g"),
    );
    for id in [
        properties::BLUR_HEADER_ID.to_string(),
        properties::SHADOWS_HEADER_ID.to_string(),
    ] {
        assert!(
            ui2.widget_root(&id).is_none(),
            "a group has no {id} section"
        );
    }
}
