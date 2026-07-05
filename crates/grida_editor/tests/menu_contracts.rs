//! Menu conformance (`MENU-*`) — `crates/grida_editor/docs/menu.md`
//! — plus the presenter's popover behavior (`crate::ui::menu`:
//! placement, popup grab, dismissal, activation, submenu, keyboard).
//! Covers the shared model (`MENU-1`/`MENU-2`/`MENU-3`), the
//! context-menu surface's deltas (`MENU-4`/`MENU-5`/`MENU-6`), and the
//! application menu as data — its actionable rows (`MENU-1`) and
//! deferred placeholders (`MENU-7`). Its native *presentation* is
//! deferred with the host; the inventory value is tested here.
//!
//! Headless throughout: the inventory is pure resolution over the
//! working copy ([`grida_editor::menu`]); the presenter is asserted
//! on the UI layer's scene-state plane (harness.md) — no pixels.
//! `MENU-4` (point-targeted paste) is deferred with the paste
//! placement rule; `MENU-6` waits on the scene-row menu (the scene
//! panel has no row menu host yet). Both stay named in TODO.md.

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, Scene, Size};
use grida::overlay::{Modifiers, PointerButton, SurfaceEvent};
use math2::transform::AffineTransform;

use grida_editor::command::Command;
use grida_editor::document::{Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::grouping::{self, WrapKind};
use grida_editor::history::Origin;
use grida_editor::keys;
use grida_editor::menu::{self, Item, Menu};
use grida_editor::ui::UiLayer;
use grida_editor::ui::menu::{ContextMenu, MenuKey, Outcome, WIDGET_ID, item_offsets, place};
use grida_editor::ui::widget::WidgetState;
use math2::rect::Rectangle;

/// Three named top-level rectangles, document order `[A, B, C]`.
fn three_rect_editor() -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map = HashMap::new();
    for (i, id) in ["A", "B", "C"].iter().enumerate() {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(10.0 + i as f32 * 100.0, 10.0, 0.0);
        rect.size = Size {
            width: 80.0,
            height: 80.0,
        };
        let iid = graph.append_child(Node::Rectangle(rect), Parent::Root);
        graph.set_name(iid, id.to_string());
        id_map.insert(iid, id.to_string());
    }
    let scene = Scene {
        name: "ctx-tests".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

fn s(ids: &[&str]) -> Vec<String> {
    ids.iter().map(|i| i.to_string()).collect()
}

fn find(menu: &Menu, cmd: Command) -> menu::Action {
    menu.actions()
        .into_iter()
        .find(|a| a.command == cmd)
        .unwrap_or_else(|| panic!("menu carries {}", cmd.name()))
        .clone()
}

// -- MENU-1 — command-surface equality ------------------------------------------

/// MENU-1 — every menu item dispatches a registry command by name; no
/// menu-only behavior exists. The taxonomy makes behaviorful items
/// unrepresentable; this enumerates the shipped inventory against the
/// registry names across target states.
#[test]
fn menu_1_every_item_is_a_registry_command() {
    let editor = three_rect_editor();
    for selection in [vec![], s(&["B"]), s(&["A", "C"])] {
        let m = menu::canvas_menu(editor.document(), &selection);
        let actions = m.actions();
        assert!(!actions.is_empty());
        for a in &actions {
            let name = a.command.name();
            assert!(!name.is_empty());
            assert!(
                name.chars().all(|c| c.is_ascii_lowercase() || c == '-'),
                "registry name is kebab-case: {name}"
            );
        }
        // One surface never binds one command twice.
        for (i, a) in actions.iter().enumerate() {
            for b in &actions[i + 1..] {
                assert_ne!(a.command, b.command, "duplicate row: {}", a.command.name());
            }
        }
    }
}

// -- MENU-2 — enablement truth ----------------------------------------------------

/// MENU-2 — an enabled item's command succeeds on the current target;
/// a disabled item's would refuse. Empty canvas: paste is the only
/// live clipboard verb.
#[test]
fn menu_2_empty_selection_disables_target_commands() {
    let editor = three_rect_editor();
    let m = menu::canvas_menu(editor.document(), &[]);
    for cmd in [
        Command::Copy,
        Command::CopyAsPng,
        Command::CopyName,
        Command::CopyId,
        Command::BringToFront,
        Command::SendToBack,
        Command::Group,
        Command::Ungroup,
        Command::GroupWithContainer,
        Command::Flatten,
        Command::ZoomSelection,
        Command::ToggleVisible,
        Command::DeleteSelection,
    ] {
        assert!(!find(&m, cmd).enabled, "{} disabled on empty", cmd.name());
    }
    assert!(
        find(&m, Command::Paste).enabled,
        "empty-canvas paste is legal"
    );
}

/// MENU-2 — ungroup enablement is exact capability, dry-run through the
/// same resolver ([`grida_editor::grouping::ungroup`]): a selected group
/// enables Ungroup; a plain node does not. Group / Group-with-container
/// gate on a non-empty selection (covered above), so this pins the
/// discriminating case.
#[test]
fn menu_2_ungroup_enablement_mirrors_the_resolver() {
    let mut editor = three_rect_editor();
    // Wrap {A, B} into a group `g1` so a dissolvable target exists.
    let rect = Rectangle::from_points(&[[0.0, 0.0], [80.0, 0.0], [80.0, 80.0], [0.0, 80.0]]);
    let mut n = 0;
    let batch = grouping::group(
        editor.document(),
        &s(&["A", "B"]),
        |_| Some(rect),
        WrapKind::Group,
        || {
            n += 1;
            format!("g{n}")
        },
    )
    .expect("group resolves");
    editor
        .dispatch(batch, Origin::Local, Recording::Record { label: None })
        .expect("applies");

    // A selected group enables Ungroup; the enabled item's resolver runs.
    let m = menu::canvas_menu(editor.document(), &s(&["g1"]));
    assert!(find(&m, Command::Ungroup).enabled);
    assert!(grouping::ungroup(editor.document(), &"g1".to_string()).is_some());
    // A plain rectangle does not.
    let m = menu::canvas_menu(editor.document(), &s(&["C"]));
    assert!(!find(&m, Command::Ungroup).enabled);
    assert!(grouping::ungroup(editor.document(), &"C".to_string()).is_none());
}

/// MENU-2 — arrange enablement is *exact* capability, dry-run through
/// the same resolver the command dispatches ([`grida_editor::arrange`]):
/// a middle node moves both ways (and the move actually applies); the
/// frontmost node's Bring-to-front is disabled, not a live no-op.
#[test]
fn menu_2_arrange_enablement_mirrors_the_resolver() {
    let mut editor = three_rect_editor();

    let m = menu::canvas_menu(editor.document(), &s(&["B"]));
    assert!(find(&m, Command::BringToFront).enabled);
    assert!(find(&m, Command::SendToBack).enabled);
    // The enabled item's command succeeds: apply the same resolution.
    let (ids, parent, index) = grida_editor::arrange::reorder(
        editor.document(),
        &s(&["B"]),
        grida_editor::arrange::ZOrder::Front,
    )
    .expect("enabled ⇒ resolves");
    editor
        .dispatch(
            vec![Mutation::Move { ids, parent, index }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    assert_eq!(editor.document().children(None), s(&["A", "C", "B"]));

    // B is now frontmost: its Bring-to-front reads disabled, and the
    // resolver indeed refuses.
    let m = menu::canvas_menu(editor.document(), &s(&["B"]));
    assert!(!find(&m, Command::BringToFront).enabled);
    assert!(find(&m, Command::SendToBack).enabled);
    assert!(
        grida_editor::arrange::reorder(
            editor.document(),
            &s(&["B"]),
            grida_editor::arrange::ZOrder::Front
        )
        .is_none()
    );
}

/// MENU-2 — flatten: enabled exactly when the command's own gates pass
/// (single path-reducible selection), and the enabled command
/// succeeds.
#[test]
fn menu_2_flatten_enablement_mirrors_the_command() {
    let mut editor = three_rect_editor();
    let mut counter = 0;
    let mut mint = || {
        counter += 1;
        format!("f{counter}")
    };

    // Single primitive: enabled, and the command bakes it.
    let m = menu::canvas_menu(editor.document(), &s(&["A"]));
    assert!(find(&m, Command::Flatten).enabled);
    assert!(grida_editor::mode::flatten_selection(
        &mut editor,
        &s(&["A"]),
        &mut mint,
        |_| None
    ));

    // Multi-selection now flattens — one baked vector per partition
    // (`FLAT-1`); enabled, and the command succeeds.
    let m = menu::canvas_menu(editor.document(), &s(&["B", "C"]));
    assert!(find(&m, Command::Flatten).enabled);
    assert!(grida_editor::mode::flatten_selection(
        &mut editor,
        &s(&["B", "C"]),
        &mut mint,
        |_| None
    ));

    // Empty selection: disabled, and the command declines (MENU-2).
    let m = menu::canvas_menu(editor.document(), &s(&[]));
    assert!(!find(&m, Command::Flatten).enabled);
    assert!(!grida_editor::mode::flatten_selection(
        &mut editor,
        &s(&[]),
        &mut mint,
        |_| None
    ));
}

/// MENU-2 — the reference additions: Copy name wants exactly one
/// *named* node; Copy ID wants exactly one node.
#[test]
fn menu_2_copy_name_and_id_are_single_target() {
    let editor = three_rect_editor();
    let m = menu::canvas_menu(editor.document(), &s(&["A"]));
    assert!(find(&m, Command::CopyName).enabled);
    assert!(find(&m, Command::CopyId).enabled);
    let m = menu::canvas_menu(editor.document(), &s(&["A", "B"]));
    assert!(!find(&m, Command::CopyName).enabled);
    assert!(!find(&m, Command::CopyId).enabled);
}

/// The paired toggle presents the applicable direction (spec
/// doctrine): a visible selection reads "Hide", an all-hidden one
/// reads "Show" — one row, label-swapped, never a check mark.
#[test]
fn menu_2_toggle_visible_presents_the_applicable_direction() {
    let mut editor = three_rect_editor();
    let m = menu::canvas_menu(editor.document(), &s(&["B"]));
    let toggle = find(&m, Command::ToggleVisible);
    assert_eq!(toggle.label, "Hide");

    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "B".to_string(),
                set: Box::new(PropPatch {
                    active: Some(false),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    let m = menu::canvas_menu(editor.document(), &s(&["B"]));
    let toggle = find(&m, Command::ToggleVisible);
    assert_eq!(toggle.label, "Show");
    assert!(toggle.enabled);
}

/// A submenu's enablement is derived from its contents, never stored:
/// "Copy as" is exactly as enabled as its PNG row.
#[test]
fn menu_2_submenu_enablement_is_derived() {
    let editor = three_rect_editor();
    let submenu = |selection: &[String]| {
        let m = menu::canvas_menu(editor.document(), selection);
        m.items
            .iter()
            .find_map(|item| match item {
                Item::Submenu(sub) => Some(sub.enabled()),
                _ => None,
            })
            .expect("the Copy as submenu ships")
    };
    assert!(submenu(&s(&["A"])));
    assert!(!submenu(&[]));
}

// -- MENU-5 — retarget -------------------------------------------------------------

/// MENU-5 — opening over an unselected node selects it; over a
/// selected node (any member) or empty space the selection is
/// preserved.
#[test]
fn menu_5_retarget() {
    let b = "B".to_string();
    let a = "A".to_string();
    // Unselected hit replaces.
    assert_eq!(menu::retarget(&s(&["A"]), Some(&b)), Some(s(&["B"])));
    // A selected member preserves — including a multi-selection.
    assert_eq!(menu::retarget(&s(&["A", "B"]), Some(&a)), None);
    // Empty space preserves.
    assert_eq!(menu::retarget(&s(&["A"]), None), None);
    // Empty selection + hit selects.
    assert_eq!(menu::retarget(&[], Some(&b)), Some(s(&["B"])));
}

// -- the application menu: MENU-1 (actionable) + MENU-7 (deferred) --------------

/// Build the application menu over a two-node selection with history
/// available and text mode off — the ordinary case.
fn app_menu(editor: &Editor) -> Menu {
    menu::application_menu(&menu::AppMenuContext {
        doc: editor.document(),
        selection: &s(&["A", "B"]),
        text_mode: false,
        can_undo: true,
        can_redo: false,
    })
}

/// Every item under a submenu, recursively (the bar is submenus).
fn all_items(menu: &Menu) -> Vec<&Item> {
    fn walk<'a>(items: &'a [Item], out: &mut Vec<&'a Item>) {
        for item in items {
            out.push(item);
            if let Item::Submenu(sub) = item {
                walk(&sub.items, out);
            }
        }
    }
    let mut out = Vec::new();
    walk(&menu.items, &mut out);
    out
}

/// MENU-1 — every *actionable* application-menu row dispatches a
/// registry command by name; the bar carries no menu-only behavior.
/// Deferred placeholders are exempt (they reference no command) — this
/// is exactly the actionable/deferred split.
#[test]
fn menu_1_application_rows_are_registry_commands() {
    let editor = three_rect_editor();
    let m = app_menu(&editor);
    let actions = m.actions();
    assert!(!actions.is_empty(), "the bar ships live rows");
    for a in &actions {
        let name = a.command.name();
        assert!(
            !name.is_empty()
                && name
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
            "registry name is kebab-case: {name}"
        );
    }
    // The top level is entirely submenus (File, Edit, …) — the bar
    // shape, never a bare action.
    assert!(
        m.items.iter().all(|it| matches!(it, Item::Submenu(_))),
        "the application menu's top level is submenus"
    );
}

/// MENU-1 (native routing) — `command_bindings` is the id→command
/// contract a native host tags its items with: one id per actionable
/// row, all unique, exactly the actions in order, and each id resolving
/// to that row's command. Deferred rows contribute no id.
#[test]
fn menu_1_command_bindings_route_each_row() {
    let editor = three_rect_editor();
    let m = app_menu(&editor);
    let bindings = m.command_bindings();
    let actions = m.actions();

    // One binding per actionable row, in the same order.
    assert_eq!(bindings.len(), actions.len());
    for ((id, cmd), action) in bindings.iter().zip(&actions) {
        assert_eq!(*cmd, action.command, "binding {id} maps to its row");
    }
    // Ids are unique — a native lookup can never be ambiguous.
    let mut ids: Vec<&str> = bindings.iter().map(|(id, _)| id.as_str()).collect();
    let count = ids.len();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), count, "every routing id is unique");

    // Deferred rows are absent from the routing map (nothing to route).
    let deferred_labels: Vec<&str> = all_items(&m)
        .into_iter()
        .filter_map(|it| match it {
            Item::Deferred(d) => Some(d.label),
            _ => None,
        })
        .collect();
    assert!(!deferred_labels.is_empty());
    let action_count_including_deferred = all_items(&m)
        .into_iter()
        .filter(|it| matches!(it, Item::Action(_) | Item::Deferred(_)))
        .count();
    assert!(
        bindings.len() < action_count_including_deferred,
        "deferred rows are not routed"
    );
}

/// MENU-7 — a deferred placeholder references no command, is never an
/// action, and never counts as enabled: the bar carries deferred rows
/// (the enumerated backlog) yet `actions()` — the dispatch surface —
/// omits them entirely.
#[test]
fn menu_7_deferred_rows_are_inert() {
    let editor = three_rect_editor();
    let m = app_menu(&editor);

    let deferred: Vec<&Item> = all_items(&m)
        .into_iter()
        .filter(|it| matches!(it, Item::Deferred(_)))
        .collect();
    assert!(
        !deferred.is_empty(),
        "the bar shows deferred rows, not an omission"
    );
    // Each names the system it waits on (the dev annotation).
    for it in &deferred {
        if let Item::Deferred(d) = it {
            assert!(!d.label.is_empty(), "a deferred row is labelled");
            assert!(!d.awaiting.is_empty(), "a deferred row names its blocker");
        }
    }

    // The dispatch surface (`actions()`) never includes a deferred row:
    // there is no command to dispatch. A submenu of only-deferred rows
    // (e.g. Settings) contributes nothing.
    let action_labels: Vec<&str> = m.actions().iter().map(|a| a.label).collect();
    for it in &deferred {
        if let Item::Deferred(d) = it {
            assert!(
                !action_labels.contains(&d.label),
                "deferred row `{}` must not surface as an action",
                d.label
            );
        }
    }

    // A submenu whose children are all deferred derives as not-enabled
    // (no dispatchable capability of its own) — Settings is the case.
    let settings = m
        .items
        .iter()
        .find_map(|it| match it {
            Item::Submenu(sub) if sub.label == "Settings" => Some(sub),
            _ => None,
        })
        .expect("Settings submenu ships");
    assert!(
        !settings.enabled(),
        "an all-deferred submenu has no enabled row"
    );
}

/// MENU-7 — the Text menu is a mode-gated surface: present only while a
/// text content mode is active.
#[test]
fn menu_7_text_menu_is_mode_gated() {
    let editor = three_rect_editor();
    let has_text = |text_mode| {
        menu::application_menu(&menu::AppMenuContext {
            doc: editor.document(),
            selection: &s(&["A"]),
            text_mode,
            can_undo: false,
            can_redo: false,
        })
        .items
        .iter()
        .any(|it| matches!(it, Item::Submenu(sub) if sub.label == "Text"))
    };
    assert!(!has_text(false), "no Text menu outside a text mode");
    assert!(has_text(true), "Text menu appears in a text mode");
}

/// MENU-2 (application) — history-gated rows mirror the supplied flags:
/// Undo/Redo are enabled exactly when the shell says history offers
/// them, so the bar shows no enabled-but-dead Undo.
#[test]
fn menu_2_application_undo_redo_track_history() {
    let editor = three_rect_editor();
    let bar = |can_undo, can_redo| {
        menu::application_menu(&menu::AppMenuContext {
            doc: editor.document(),
            selection: &[],
            text_mode: false,
            can_undo,
            can_redo,
        })
    };
    let enabled = |m: &Menu, cmd: Command| find(m, cmd).enabled;
    let m = bar(true, false);
    assert!(enabled(&m, Command::Undo));
    assert!(!enabled(&m, Command::Redo));
    let m = bar(false, true);
    assert!(!enabled(&m, Command::Undo));
    assert!(enabled(&m, Command::Redo));
}

// -- displayed bindings are sheet-derived --------------------------------------

/// The menu's shortcut hints derive from the binding table — never
/// authored — so the displayed chord cannot drift from the sheet.
#[test]
fn hints_derive_from_the_sheet() {
    use keys::Platform::{Mac, Other};
    assert_eq!(keys::hint_for(Command::Copy, Mac).as_deref(), Some("⌘C"));
    assert_eq!(
        keys::hint_for(Command::Copy, Other).as_deref(),
        Some("Ctrl+C")
    );
    assert_eq!(
        keys::hint_for(Command::CopyAsPng, Mac).as_deref(),
        Some("⇧⌘C")
    );
    assert_eq!(
        keys::hint_for(Command::ToggleVisible, Other).as_deref(),
        Some("Ctrl+Shift+H")
    );
    // Delete's chord reaches it through the alternative chain row.
    assert_eq!(
        keys::hint_for(Command::DeleteSelection, Mac).as_deref(),
        Some("⌫")
    );
    assert_eq!(
        keys::hint_for(Command::BringToFront, Mac).as_deref(),
        Some("]")
    );
    assert_eq!(
        keys::hint_for(Command::ZoomSelection, Mac).as_deref(),
        Some("⇧2")
    );
    // Menu-only commands have no chord — and no invented hint.
    assert_eq!(keys::hint_for(Command::CopyName, Mac), None);
    assert_eq!(keys::hint_for(Command::CopyId, Mac), None);
}

// -- the presenter: anchored placement -----------------------------------------

/// Placement prefers down-right of the anchor, flips on overflow,
/// clamps when neither side fits.
#[test]
fn placement_flips_then_clamps() {
    let vp = [800.0, 600.0];
    // Fits: the anchor is the top-left corner.
    assert_eq!(place([100.0, 100.0], [180.0, 200.0], vp), [100.0, 100.0]);
    // Right overflow flips left of the anchor.
    assert_eq!(place([700.0, 100.0], [180.0, 200.0], vp), [520.0, 100.0]);
    // Bottom overflow flips above.
    assert_eq!(place([100.0, 500.0], [180.0, 200.0], vp), [100.0, 300.0]);
    // Neither side fits: clamp into the viewport.
    assert_eq!(place([100.0, 100.0], [900.0, 200.0], vp), [0.0, 100.0]);
}

// -- the presenter: modality, dismissal, activation ------------------------------

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

const ANCHOR: [f32; 2] = [100.0, 100.0];

fn open_menu() -> (ContextMenu, UiLayer, Menu) {
    let editor = three_rect_editor();
    let data = menu::canvas_menu(editor.document(), &s(&["B"]));
    let mut ui = UiLayer::new(Size {
        width: 800.0,
        height: 600.0,
    });
    let mut host = ContextMenu::new(keys::Platform::Mac);
    host.open(&mut ui, data.clone(), ANCHOR);
    (host, ui, data)
}

/// The row-center point for a top-level item index (the placement
/// fits at [`ANCHOR`], so the panel origin is the anchor).
fn row_point(data: &Menu, index: usize) -> [f32; 2] {
    let (offsets, _) = item_offsets(&data.items);
    let (y, h) = offsets[index];
    [ANCHOR[0] + 90.0, ANCHOR[1] + y + h * 0.5]
}

fn index_of(data: &Menu, cmd: Command) -> usize {
    data.items
        .iter()
        .position(|item| matches!(item, Item::Action(a) if a.command == cmd))
        .expect("row exists")
}

/// Opening mounts the widget on its layer and takes the popup grab:
/// every subsequent pointer event routes to the menu, wherever it
/// lands (`UI-5`: nothing leaks to the canvas).
#[test]
fn presenter_open_takes_the_popup_grab() {
    let (host, ui, _) = open_menu();
    assert!(host.is_open());
    assert!(!ui.is_empty());
    assert_eq!(ui.captured().map(String::as_str), Some(WIDGET_ID));
}

/// An outside press dismisses — the light-dismissal rule lives in the
/// widget, and the press never reaches anything else.
#[test]
fn presenter_outside_press_dismisses() {
    let (mut host, mut ui, _) = open_menu();
    let result = ui.pointer(&down([700.0, 500.0]));
    assert!(result.consumed, "the dismissing press is swallowed");
    assert_eq!(host.drain(&mut ui), Some(Outcome::Dismissed));
    host.close(&mut ui);
    assert!(!host.is_open());
    assert!(ui.is_empty(), "closing unmounts");
    assert!(ui.captured().is_none(), "the grab dies with the mount");
}

/// Hover then press-release on an enabled row chooses its command;
/// the outcome is the presenter's entire output.
#[test]
fn presenter_activates_on_release_over_an_enabled_row() {
    let (mut host, mut ui, data) = open_menu();
    let paste = row_point(&data, index_of(&data, Command::Paste));
    ui.pointer(&mv(paste));
    assert!(host.drain(&mut ui).is_none(), "hover is not an outcome");
    ui.pointer(&down(paste));
    ui.pointer(&up(paste));
    assert_eq!(host.drain(&mut ui), Some(Outcome::Chosen(Command::Paste)));
}

/// A disabled row consumes and does nothing — the menu stays open
/// (`MENU-2`'s presenter half: no enabled-looking dead rows, no
/// disabled-row activation).
#[test]
fn presenter_disabled_rows_do_not_activate() {
    let editor = three_rect_editor();
    // Empty selection: Delete is disabled.
    let data = menu::canvas_menu(editor.document(), &[]);
    let mut ui = UiLayer::new(Size {
        width: 800.0,
        height: 600.0,
    });
    let mut host = ContextMenu::new(keys::Platform::Mac);
    host.open(&mut ui, data.clone(), ANCHOR);
    let delete = row_point(&data, index_of(&data, Command::DeleteSelection));
    ui.pointer(&mv(delete));
    ui.pointer(&down(delete));
    ui.pointer(&up(delete));
    assert!(host.drain(&mut ui).is_none());
    assert!(host.is_open());
    // The disabled row never even hovers.
    match ui.state(&WIDGET_ID.to_string()) {
        Some(WidgetState::Menu(s)) => assert_eq!(s.hover, None),
        other => panic!("menu state expected, got {other:?}"),
    }
}

/// Hovering the submenu row opens its panel beside the row; releasing
/// over a sub-row chooses its command.
#[test]
fn presenter_submenu_opens_on_hover_and_activates() {
    let (mut host, mut ui, data) = open_menu();
    let sub_index = data
        .items
        .iter()
        .position(|item| matches!(item, Item::Submenu(_)))
        .expect("Copy as ships");
    ui.pointer(&mv(row_point(&data, sub_index)));
    assert!(host.drain(&mut ui).is_none());
    // The rebuild placed the sub panel right of the main one, top-
    // aligned with its row.
    let (offsets, _) = item_offsets(&data.items);
    let sub_origin = [ANCHOR[0] + 180.0, ANCHOR[1] + offsets[sub_index].0 - 4.0];
    let png = [sub_origin[0] + 90.0, sub_origin[1] + 4.0 + 11.0];
    ui.pointer(&mv(png));
    host.drain(&mut ui);
    ui.pointer(&down(png));
    ui.pointer(&up(png));
    assert_eq!(
        host.drain(&mut ui),
        Some(Outcome::Chosen(Command::CopyAsPng))
    );
}

/// The keyboard vocabulary: Down walks enabled rows, Enter activates,
/// Escape dismisses (the menu's one ladder rung).
#[test]
fn presenter_keyboard_navigates_and_activates() {
    let (mut host, mut ui, data) = open_menu();
    assert_eq!(host.key(&mut ui, MenuKey::Escape), Some(Outcome::Dismissed));
    // Still open — the caller closes; walk instead.
    assert_eq!(host.key(&mut ui, MenuKey::Down), None);
    match ui.state(&WIDGET_ID.to_string()) {
        Some(WidgetState::Menu(s)) => {
            assert_eq!(s.hover, Some(index_of(&data, Command::Copy)));
        }
        other => panic!("menu state expected, got {other:?}"),
    }
    assert_eq!(
        host.key(&mut ui, MenuKey::Enter),
        Some(Outcome::Chosen(Command::Copy))
    );
}

/// The rendered menu scene has non-degenerate world geometry: the
/// panel container is laid out at the placement origin with the panel
/// size, and the scene produces a non-empty layer list. This closes
/// the coverage the capture-routed tests miss — they never exercise
/// the built geometry or the paint list.
#[test]
fn menu_scene_has_paintable_geometry() {
    let (_host, ui, data) = open_menu();
    let (_, size) = item_offsets(&data.items);
    let scene = ui.scene();
    // The main panel is the widget's top-level root (each menu panel
    // is its own scene root, not nested), laid out at the placement
    // origin (it fits at ANCHOR) with the panel size.
    let panel = scene.graph.roots()[0];
    let bounds = ui
        .cache()
        .geometry
        .get_world_bounds(&panel)
        .expect("panel has world bounds");
    assert_eq!(
        [bounds.x, bounds.y],
        ANCHOR,
        "panel at the placement origin"
    );
    assert_eq!(bounds.width, size[0], "panel width");
    assert!(bounds.height > 100.0, "panel spans its rows");
    assert!(!ui.cache().layers.is_empty(), "the scene paints");
}

/// The one popover dismissal rule (`popover::should_dismiss`, WID-8):
/// a press dismisses only when it lands outside the panel AND outside
/// the trigger. Excluding the trigger is what unifies a popover opened
/// beside its opener (the color picker) with one opened at the cursor
/// (the context menu, trigger = None).
#[test]
fn popover_dismiss_excludes_panel_and_trigger() {
    use grida_editor::ui::popover::should_dismiss;
    use math2::rect::Rectangle;
    let panel = Rectangle {
        x: 100.0,
        y: 100.0,
        width: 200.0,
        height: 150.0,
    };
    let trigger = Rectangle {
        x: 320.0,
        y: 100.0,
        width: 20.0,
        height: 14.0,
    };
    // Inside the panel → never dismiss.
    assert!(!should_dismiss([150.0, 150.0], panel, Some(trigger)));
    // On the trigger → excluded (the opening gesture's residual press
    // lands here); never dismiss.
    assert!(!should_dismiss([325.0, 105.0], panel, Some(trigger)));
    // Outside both → dismiss.
    assert!(should_dismiss([500.0, 500.0], panel, Some(trigger)));
    // No trigger → "outside" is simply outside the panel (the menu,
    // opened at the cursor, is already inside its own panel).
    assert!(should_dismiss([500.0, 500.0], panel, None));
    assert!(!should_dismiss([150.0, 150.0], panel, None));
}
