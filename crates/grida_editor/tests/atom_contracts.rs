//! Atom conformance for the widget primitives added on top of the
//! shipped set — toggle and segmented (`widgets.md`; the value-shape
//! atoms of [widgets-inventory.md](../../../crates/grida_editor/docs/widgets-inventory.md)).
//!
//! Headless throughout (`UI-7` / `WID-7`): each atom is mounted on a
//! real [`UiLayer`] and driven with the normalized surface-event
//! vocabulary; assertions read the emitted [`BindingValue`]s. No
//! window, no pixels (the raster plane is `tests/widget_render.rs`).

use grida::node::schema::Size;
use grida::overlay::{Modifiers, PointerButton, SurfaceEvent};
use grida::text_edit::session::KeyName;

use grida_editor::ui::UiLayer;
use grida_editor::ui::bind::{Binding, BindingPhase, BindingProperty, BindingValue};
use grida_editor::ui::field::Field;
use grida_editor::ui::widget::WidgetState;
use grida_editor::ui::widgets::select::{ROW_H, SelectState};
use grida_editor::ui::widgets::{Segment, Segmented, Select, Toggle, ToggleLook};

const VIEWPORT: Size = Size {
    width: 400.0,
    height: 300.0,
};

fn ui() -> UiLayer {
    UiLayer::new(VIEWPORT)
}

fn binding() -> Binding {
    Binding {
        property: BindingProperty::Name, // stand-in target; atoms are property-agnostic
        targets: vec!["A".to_string()],
        label: "ui.test".to_string(),
        entry: None,
    }
}

fn down(point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerDown {
        canvas_point: point,
        screen_point: point,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn key(k: KeyName) -> (KeyName, Modifiers) {
    (k, Modifiers::default())
}

/// The commit value from a Begin→Commit emission pair.
fn commit_value(emissions: &[grida_editor::ui::bind::Emission]) -> Option<&BindingValue> {
    // Must be exactly one interaction: one Begin, then one Commit (UI-4).
    let begins = emissions
        .iter()
        .filter(|e| matches!(e.phase, BindingPhase::Begin))
        .count();
    let commits: Vec<&BindingValue> = emissions
        .iter()
        .filter_map(|e| match &e.phase {
            BindingPhase::Commit(v) => Some(v),
            _ => None,
        })
        .collect();
    assert_eq!(begins, 1, "exactly one Begin per interaction (UI-4)");
    assert_eq!(
        commits.len(),
        1,
        "exactly one Commit per interaction (UI-4)"
    );
    commits.into_iter().next()
}

fn center(ui: &UiLayer, id: &str) -> [f32; 2] {
    let b = ui.widget_bounds(&id.to_string()).expect("laid out");
    [b.x + b.width / 2.0, b.y + b.height / 2.0]
}

// ── toggle ──────────────────────────────────────────────────────────────

fn mount_toggle(ui: &mut UiLayer, value: Field<bool>) -> String {
    let id = "t".to_string();
    ui.mount(vec![Box::new(Toggle {
        id: id.clone(),
        value,
        look: ToggleLook::Check,
        size: 16.0,
        binding: binding(),
    })]);
    id
}

/// A click on an off toggle commits `true`; on an on toggle commits
/// `false` — one begin→commit each (WID-6/UI-4).
#[test]
fn toggle_click_commits_flipped_value() {
    for (value, expect) in [(Field::Value(false), true), (Field::Value(true), false)] {
        let mut ui = ui();
        let id = mount_toggle(&mut ui, value);
        let res = ui.pointer(&down(center(&ui, &id)));
        assert_eq!(
            commit_value(&res.emissions),
            Some(&BindingValue::Bool(expect))
        );
    }
}

/// A mixed toggle's first edit broadcasts `true` (WID-6).
#[test]
fn toggle_mixed_first_edit_broadcasts_true() {
    let mut ui = ui();
    let id = mount_toggle(&mut ui, Field::Mixed);
    let res = ui.pointer(&down(center(&ui, &id)));
    assert_eq!(
        commit_value(&res.emissions),
        Some(&BindingValue::Bool(true))
    );
}

/// Enter activates a focused toggle exactly like a click (WID / UI-3).
#[test]
fn toggle_enter_activates() {
    let mut ui = ui();
    let id = mount_toggle(&mut ui, Field::Value(false));
    // Focus via a press, then key the toggle.
    ui.pointer(&down(center(&ui, &id)));
    let (k, m) = key(KeyName::Enter);
    let res = ui.key(&k, &m);
    assert_eq!(
        commit_value(&res.emissions),
        Some(&BindingValue::Bool(true))
    );
}

// ── segmented ─────────────────────────────────────────────────────────────

fn mount_segmented(ui: &mut UiLayer, n: usize, columns: usize, selected: Field<usize>) -> String {
    let id = "s".to_string();
    let options = (0..n).map(|i| Segment::new(format!("{i}"))).collect();
    ui.mount(vec![Box::new(Segmented {
        id: id.clone(),
        options,
        selected,
        columns,
        width: 120.0,
        height: if columns == 0 { 24.0 } else { 72.0 },
        binding: binding(),
    })]);
    id
}

/// Clicking segment `i` commits `Index(i)` (single row).
#[test]
fn segmented_click_selects_index() {
    let mut ui = ui();
    let id = mount_segmented(&mut ui, 3, 0, Field::Value(0));
    let b = ui.widget_bounds(&id.to_string()).unwrap();
    // Cell width = 120/3 = 40; click the middle of cell 2 (index 2).
    let x = b.x + 40.0 * 2.0 + 20.0;
    let y = b.y + b.height / 2.0;
    let res = ui.pointer(&down([x, y]));
    assert_eq!(commit_value(&res.emissions), Some(&BindingValue::Index(2)));
}

/// A 3×3 grid resolves the clicked cell by row and column: the
/// bottom-right cell is index 8 (the nine-position alignment shape).
#[test]
fn segmented_grid_hit_bottom_right() {
    let mut ui = ui();
    let id = mount_segmented(&mut ui, 9, 3, Field::Mixed);
    let b = ui.widget_bounds(&id.to_string()).unwrap();
    let (cw, ch) = (b.width / 3.0, b.height / 3.0);
    // Center of row 2, col 2 → idx 8.
    let x = b.x + cw * 2.0 + cw / 2.0;
    let y = b.y + ch * 2.0 + ch / 2.0;
    let res = ui.pointer(&down([x, y]));
    assert_eq!(commit_value(&res.emissions), Some(&BindingValue::Index(8)));
}

/// Arrow keys move the selection and commit per press (radio
/// semantics).
#[test]
fn segmented_arrow_commits_next() {
    let mut ui = ui();
    let id = mount_segmented(&mut ui, 3, 0, Field::Value(1));
    ui.pointer(&down(center(&ui, &id))); // focus (its own commit, discarded)
    let (k, m) = key(KeyName::ArrowRight);
    let res = ui.key(&k, &m);
    assert_eq!(
        commit_value(&res.emissions),
        Some(&BindingValue::Index(2)),
        "ArrowRight from index 1 commits index 2"
    );
}

/// A clamped arrow at the edge commits nothing (no wrap).
#[test]
fn segmented_arrow_clamps_at_edge() {
    let mut ui = ui();
    let id = mount_segmented(&mut ui, 3, 0, Field::Value(2));
    ui.pointer(&down(center(&ui, &id)));
    let (k, m) = key(KeyName::ArrowRight);
    let res = ui.key(&k, &m);
    assert!(
        !res.emissions
            .iter()
            .any(|e| matches!(e.phase, BindingPhase::Commit(_))),
        "a clamped arrow at the last index commits nothing"
    );
}

// ── select ────────────────────────────────────────────────────────────────

fn up(point: [f32; 2]) -> SurfaceEvent {
    SurfaceEvent::PointerUp {
        canvas_point: point,
        screen_point: point,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn mount_select(ui: &mut UiLayer, n: usize, selected: Field<usize>) -> String {
    let id = "sel".to_string();
    ui.mount(vec![Box::new(Select {
        id: id.clone(),
        options: (0..n).map(|i| format!("opt{i}")).collect(),
        selected,
        width: 120.0,
        height: 22.0,
        binding: binding(),
    })]);
    id
}

fn select_state(ui: &UiLayer, id: &str) -> SelectState {
    match ui.state(&id.to_string()) {
        Some(WidgetState::Select(s)) => *s,
        _ => panic!("no select state"),
    }
}

/// A press on a closed select opens it (no commit) and takes the
/// popup grab (WID-8): the layer captures the widget.
#[test]
fn select_opens_on_press() {
    let mut ui = ui();
    let id = mount_select(&mut ui, 3, Field::Value(0));
    let res = ui.pointer(&down(center(&ui, &id)));
    assert!(select_state(&ui, &id).open, "the list opens on press");
    assert_eq!(ui.captured(), Some(&id), "the select holds the popup grab");
    assert!(
        !res.emissions
            .iter()
            .any(|e| matches!(e.phase, BindingPhase::Commit(_))),
        "opening commits nothing"
    );
}

/// Clicking a list row commits its index and closes the list.
#[test]
fn select_commits_chosen_row() {
    let mut ui = ui();
    let id = mount_select(&mut ui, 3, Field::Value(0));
    let b = ui.widget_bounds(&id.to_string()).unwrap();
    // Open (press + release over the button keeps it open).
    ui.pointer(&down(center(&ui, &id)));
    ui.pointer(&up(center(&ui, &id)));
    assert!(select_state(&ui, &id).open);
    // Row 2 sits below the button anchor: anchor.y = b.bottom; row y =
    // anchor.y + PAD + 2*ROW_H + ROW_H/2.
    let anchor = [b.x, b.y + b.height];
    let row2 = [
        anchor[0] + b.width / 2.0,
        anchor[1] + 4.0 + 2.0 * ROW_H + ROW_H / 2.0,
    ];
    ui.pointer(&down(row2));
    let res = ui.pointer(&up(row2));
    assert_eq!(commit_value(&res.emissions), Some(&BindingValue::Index(2)));
    assert!(!select_state(&ui, &id).open, "choosing closes the list");
}

/// A press outside the list dismisses without a commit (WID-8).
#[test]
fn select_dismiss_outside_no_commit() {
    let mut ui = ui();
    let id = mount_select(&mut ui, 3, Field::Value(0));
    ui.pointer(&down(center(&ui, &id)));
    ui.pointer(&up(center(&ui, &id)));
    assert!(select_state(&ui, &id).open);
    let res = ui.pointer(&down([350.0, 280.0])); // far from button + list
    assert!(!select_state(&ui, &id).open, "outside press dismisses");
    assert!(
        !res.emissions
            .iter()
            .any(|e| matches!(e.phase, BindingPhase::Commit(_))),
        "dismissal commits nothing"
    );
}

/// Escape closes an open select without committing.
#[test]
fn select_escape_dismisses() {
    let mut ui = ui();
    let id = mount_select(&mut ui, 3, Field::Value(0));
    ui.pointer(&down(center(&ui, &id)));
    let (k, m) = key(KeyName::Escape);
    let res = ui.key(&k, &m);
    assert!(!select_state(&ui, &id).open, "Escape dismisses");
    assert!(
        !res.emissions
            .iter()
            .any(|e| matches!(e.phase, BindingPhase::Commit(_))),
        "Escape commits nothing"
    );
}

// ── text ──────────────────────────────────────────────────────────────────

fn ch(c: &str) -> KeyName {
    KeyName::Character(c.to_string())
}

fn mount_text(ui: &mut UiLayer, value: Field<String>) -> String {
    let id = "txt".to_string();
    ui.mount(vec![Box::new(grida_editor::ui::widgets::Text {
        id: id.clone(),
        value,
        placeholder: "name".to_string(),
        width: 140.0,
        height: 20.0,
        binding: binding(),
    })]);
    id
}

/// Focus seeds the buffer from the value; typing then Enter commits
/// the edited string (WID-1 generalized to text).
#[test]
fn text_typed_entry_commits() {
    let mut ui = ui();
    let id = mount_text(&mut ui, Field::Value("ab".to_string()));
    ui.pointer(&down(center(&ui, &id))); // focus, buffer = "ab"
    ui.key(&ch("c"), &Modifiers::default());
    let (enter, m) = key(KeyName::Enter);
    let res = ui.key(&enter, &m);
    assert_eq!(
        commit_value(&res.emissions),
        Some(&BindingValue::Text("abc".to_string()))
    );
}

/// Escape during an edit discards the buffer and commits nothing
/// (UI-4 revert).
#[test]
fn text_escape_discards() {
    let mut ui = ui();
    let id = mount_text(&mut ui, Field::Value("keep".to_string()));
    ui.pointer(&down(center(&ui, &id)));
    ui.key(&ch("x"), &Modifiers::default());
    let (esc, m) = key(KeyName::Escape);
    let res = ui.key(&esc, &m);
    assert!(
        !res.emissions
            .iter()
            .any(|e| matches!(e.phase, BindingPhase::Commit(_))),
        "Escape commits nothing"
    );
}

/// A mixed field seeds an empty buffer; the first typed value is what
/// the commit broadcasts (WID-6).
#[test]
fn text_mixed_seeds_empty_buffer() {
    let mut ui = ui();
    let id = mount_text(&mut ui, Field::Mixed);
    ui.pointer(&down(center(&ui, &id))); // focus, buffer = ""
    ui.key(&ch("h"), &Modifiers::default());
    ui.key(&ch("i"), &Modifiers::default());
    let (enter, m) = key(KeyName::Enter);
    let res = ui.key(&enter, &m);
    assert_eq!(
        commit_value(&res.emissions),
        Some(&BindingValue::Text("hi".to_string()))
    );
}

// ── quad (composite) ───────────────────────────────────────────────────────

fn mount_quad(ui: &mut UiLayer, value: [f32; 4]) -> String {
    let id = "q".to_string();
    ui.mount(vec![Box::new(grida_editor::ui::widgets::Quad {
        id: id.clone(),
        value: Field::Value(value),
        min: Some(0.0),
        width: 120.0,
        height: 20.0,
        binding: binding(),
    })]);
    id
}

fn quad_commit(emissions: &[grida_editor::ui::bind::Emission]) -> Option<[f32; 4]> {
    emissions.iter().find_map(|e| match &e.phase {
        BindingPhase::Commit(BindingValue::Quad(q)) => Some(*q),
        _ => None,
    })
}

/// In uniform mode, typing one value commits it to all four sides in
/// one compound commit (WID-9).
#[test]
fn quad_uniform_commits_all_sides() {
    let mut ui = ui();
    let id = mount_quad(&mut ui, [4.0; 4]);
    // The single uniform field sits right of the 20px mode button.
    ui.pointer(&down([70.0, 10.0]));
    ui.key(&ch("8"), &Modifiers::default());
    let (enter, m) = key(KeyName::Enter);
    let res = ui.key(&enter, &m);
    assert_eq!(quad_commit(&res.emissions), Some([8.0; 4]));
    let _ = id;
}

/// Split mode edits exactly one side, leaving the others intact.
#[test]
fn quad_split_edits_one_side() {
    let mut ui = ui();
    let id = mount_quad(&mut ui, [4.0; 4]);
    // Toggle split via the mode button (x in [0,20]).
    ui.pointer(&down([10.0, 10.0]));
    assert!(
        matches!(ui.state(&id.to_string()), Some(WidgetState::Quad(s)) if s.split),
        "mode button flips to split"
    );
    // Field 1 (right) spans x [45,70] of the 4 split fields.
    ui.pointer(&down([57.0, 10.0]));
    ui.key(&ch("1"), &Modifiers::default());
    ui.key(&ch("0"), &Modifiers::default());
    let (enter, m) = key(KeyName::Enter);
    let res = ui.key(&enter, &m);
    assert_eq!(quad_commit(&res.emissions), Some([4.0, 10.0, 4.0, 4.0]));
}

/// Toggling the mode commits nothing — it is widget state (WID-9).
#[test]
fn quad_mode_toggle_no_commit() {
    let mut ui = ui();
    let _ = mount_quad(&mut ui, [4.0; 4]);
    let res = ui.pointer(&down([10.0, 10.0]));
    assert!(
        !res.emissions
            .iter()
            .any(|e| matches!(e.phase, BindingPhase::Commit(_))),
        "the mode toggle does not commit"
    );
}

/// An arrow press steps the focused side and commits (WID-2 per side).
#[test]
fn quad_arrow_steps_uniform() {
    let mut ui = ui();
    let _ = mount_quad(&mut ui, [4.0; 4]);
    ui.pointer(&down([70.0, 10.0])); // focus uniform field
    let (up, m) = key(KeyName::ArrowUp);
    let res = ui.key(&up, &m);
    assert_eq!(quad_commit(&res.emissions), Some([5.0; 4]));
}

// ── color picker (composite, WID-4) ─────────────────────────────────────────

fn mount_picker(ui: &mut UiLayer, color: (u8, u8, u8, u8)) -> String {
    use grida::cg::prelude::CGColor;
    let id = "cp".to_string();
    ui.mount(vec![Box::new(grida_editor::ui::widgets::ColorPicker {
        id: id.clone(),
        value: Field::Value(CGColor::from_rgba(color.0, color.1, color.2, color.3)),
        width: 180.0,
        origin: None,
        trigger: None,
        binding: binding(),
    })]);
    id
}

fn colors(
    emissions: &[grida_editor::ui::bind::Emission],
) -> (Vec<BindingValue>, Vec<BindingValue>) {
    let previews = emissions
        .iter()
        .filter_map(|e| match &e.phase {
            BindingPhase::Preview(v) => Some(v.clone()),
            _ => None,
        })
        .collect();
    let commits = emissions
        .iter()
        .filter_map(|e| match &e.phase {
            BindingPhase::Commit(v) => Some(v.clone()),
            _ => None,
        })
        .collect();
    (previews, commits)
}

/// WID-4: dragging the SV plane across N events yields N previews and
/// exactly one commit on release; the committed color equals the last
/// preview.
#[test]
fn picker_sv_drag_previews_then_one_commit() {
    let mut ui = ui();
    let id = mount_picker(&mut ui, (255, 0, 0, 255)); // red
    let mut all = Vec::new();
    all.extend(ui.pointer(&down([90.0, 60.0])).emissions); // Begin + Preview
    for p in [[100.0, 50.0], [120.0, 40.0], [140.0, 30.0]] {
        all.extend(
            ui.pointer(&SurfaceEvent::PointerMove {
                canvas_point: p,
                screen_point: p,
            })
            .emissions,
        );
    }
    all.extend(ui.pointer(&up([140.0, 30.0])).emissions);

    let (previews, commits) = colors(&all);
    assert_eq!(commits.len(), 1, "exactly one commit on release (UI-4)");
    assert!(
        previews.len() >= 4,
        "one preview per drag event: {}",
        previews.len()
    );
    assert_eq!(
        previews.last(),
        commits.first(),
        "the committed color equals the last preview (WID-4)"
    );
    let _ = id;
}

/// Dragging the hue bar changes the hue, producing a different color
/// than the starting red.
#[test]
fn picker_hue_drag_changes_color() {
    use grida::cg::prelude::CGColor;
    let mut ui = ui();
    let _ = mount_picker(&mut ui, (255, 0, 0, 255));
    // Hue bar spans y [126,138]; drag to ~2/3 across (green→cyan band).
    ui.pointer(&down([120.0, 132.0]));
    let res = ui.pointer(&up([120.0, 132.0]));
    let (_, commits) = colors(&res.emissions);
    assert_eq!(commits.len(), 1);
    let BindingValue::Color(c) = commits[0] else {
        panic!("expected a color commit")
    };
    assert_ne!(
        (c.r, c.g, c.b),
        (255, 0, 0),
        "moving the hue changes the color away from pure red"
    );
    let _ = CGColor::from_rgba(0, 0, 0, 0);
}

/// Typing a hex value and pressing Enter commits that color.
#[test]
fn picker_hex_commits_typed_color() {
    let mut ui = ui();
    let _ = mount_picker(&mut ui, (0, 0, 0, 255));
    ui.pointer(&down([90.0, 170.0])); // focus hex field
    for c in ["0", "0", "F", "F", "0", "0"] {
        ui.key(&ch(c), &Modifiers::default());
    }
    let (enter, m) = key(KeyName::Enter);
    let res = ui.key(&enter, &m);
    let (_, commits) = colors(&res.emissions);
    assert_eq!(commits.len(), 1);
    let BindingValue::Color(c) = commits[0] else {
        panic!("expected a color commit")
    };
    assert_eq!((c.r, c.g, c.b), (0, 255, 0), "#00FF00 → green");
}

// ── list section (SHEET-3) ──────────────────────────────────────────────────

fn mount_list(ui: &mut UiLayer, n: usize) -> String {
    use grida_editor::ui::widgets::ListEntry;
    let id = "ls".to_string();
    ui.mount(vec![Box::new(grida_editor::ui::widgets::ListSection {
        id: id.clone(),
        title: "Fills".to_string(),
        entries: (0..n)
            .map(|i| ListEntry {
                label: format!("fill{i}"),
                active: true,
            })
            .collect(),
        width: 200.0,
        binding: binding(),
    })]);
    id
}

fn list_op(
    emissions: &[grida_editor::ui::bind::Emission],
) -> Option<grida_editor::ui::bind::ListOp> {
    emissions.iter().find_map(|e| match &e.phase {
        BindingPhase::Commit(BindingValue::ListOp(op)) => Some(*op),
        _ => None,
    })
}

/// The header add button commits `Add` (SHEET-3).
#[test]
fn list_add_from_header() {
    use grida_editor::ui::bind::ListOp;
    let mut ui = ui();
    let _ = mount_list(&mut ui, 3);
    // Add button is the right 28px of the 22px header.
    let res = ui.pointer(&down([186.0, 11.0]));
    assert_eq!(list_op(&res.emissions), Some(ListOp::Add));
}

/// The per-entry remove region commits `Remove(i)`.
#[test]
fn list_remove_entry() {
    use grida_editor::ui::bind::ListOp;
    let mut ui = ui();
    let _ = mount_list(&mut ui, 3);
    // Entry 1 spans y [46,70]; remove region is the right 24px.
    let res = ui.pointer(&down([188.0, 58.0]));
    assert_eq!(list_op(&res.emissions), Some(ListOp::Remove(1)));
}

/// The per-entry active box commits `ToggleEntry(i)`.
#[test]
fn list_toggle_active() {
    use grida_editor::ui::bind::ListOp;
    let mut ui = ui();
    let _ = mount_list(&mut ui, 3);
    // Entry 0 spans y [22,46]; active box is the left 24px.
    let res = ui.pointer(&down([12.0, 34.0]));
    assert_eq!(list_op(&res.emissions), Some(ListOp::ToggleEntry(0)));
}

/// Dragging an entry's body to another row commits `Move` (SHEET-3
/// reorder).
#[test]
fn list_reorder_by_drag() {
    use grida_editor::ui::bind::ListOp;
    let mut ui = ui();
    let _ = mount_list(&mut ui, 3);
    // Grab entry 0's body (middle x, away from the ctrl boxes), drag
    // down into entry 2's band, release.
    ui.pointer(&down([100.0, 34.0]));
    ui.pointer(&SurfaceEvent::PointerMove {
        canvas_point: [100.0, 82.0],
        screen_point: [100.0, 82.0],
    });
    let res = ui.pointer(&up([100.0, 82.0]));
    assert_eq!(
        list_op(&res.emissions),
        Some(ListOp::Move { from: 0, to: 2 })
    );
}
