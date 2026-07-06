//! HUD machine conformance — `crates/grida_editor/docs/hud.md` (`HUD-*`) and
//! the golden selection-intent router's scenario catalog
//! (`docs/wg/canvas/ux-surface/selection-intent.md`, discharged
//! per `HUD-4`).
//!
//! Pure and headless: a mock scene answers the HUD's two queries;
//! every assertion is on the emitted intent stream, the hit registry,
//! or the draw list. Test names carry the golden scenario names so
//! cross-implementation drift is greppable.

use grida_editor::hud::{
    Hud, HudAction, HudCursor, HudEvent, HudPrim, HudScene, Id, Intent, KNOB_VISUAL_PX, Modifiers,
    Phase, PointerButton, ResizeDirection, SelectMode, SelectionShape,
};
use math2::rect::Rectangle;

// ── Fixture ──────────────────────────────────────────────────────────
//
//   rect A: (10,10) 80×80    rect C: (100,30) 40×40    rect B: (200,10) 80×80
//
// C sits inside the A∪B union but between the two — the body-overlay
// scenarios need a pickable, unselected node under the union.

struct MockScene {
    nodes: Vec<(Id, Rectangle)>,
}

impl MockScene {
    fn abc() -> Self {
        Self {
            nodes: vec![
                ("A".into(), Rectangle::from_xywh(10.0, 10.0, 80.0, 80.0)),
                ("C".into(), Rectangle::from_xywh(100.0, 30.0, 40.0, 40.0)),
                ("B".into(), Rectangle::from_xywh(200.0, 10.0, 80.0, 80.0)),
            ],
        }
    }
}

impl HudScene for MockScene {
    fn pick(&self, p: [f32; 2]) -> Option<Id> {
        self.nodes
            .iter()
            .rev()
            .find(|(_, r)| r.contains_point(p))
            .map(|(id, _)| id.clone())
    }
    fn shape_of(&self, id: &Id) -> Option<SelectionShape> {
        self.nodes
            .iter()
            .find(|(n, _)| n == id)
            .map(|(_, r)| SelectionShape::Rect(*r))
    }
}

// ── Event helpers (identity view: canvas == screen) ──────────────────

fn down(p: [f32; 2]) -> HudEvent {
    HudEvent::PointerDown {
        screen: p,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn down_mods(p: [f32; 2], modifiers: Modifiers) -> HudEvent {
    HudEvent::PointerDown {
        screen: p,
        button: PointerButton::Primary,
        modifiers,
    }
}

fn mv(p: [f32; 2]) -> HudEvent {
    HudEvent::PointerMove { screen: p }
}

fn up(p: [f32; 2]) -> HudEvent {
    HudEvent::PointerUp {
        screen: p,
        button: PointerButton::Primary,
        modifiers: Modifiers::default(),
    }
}

fn shift() -> Modifiers {
    Modifiers {
        shift: true,
        ..Default::default()
    }
}

/// A HUD with the selection mirror pushed and chrome built (so tier-1
/// regions exist, as they would after the first painted frame).
fn hud_with(selection: &[&str], scene: &MockScene) -> Hud {
    let mut hud = Hud::new();
    hud.set_selection(&selection.iter().map(|s| s.to_string()).collect::<Vec<_>>());
    let _ = hud.chrome(scene);
    hud
}

// ── Tier-1 handle scenarios ──────────────────────────────────────────

// UX spec (HandleResize): pointer-down on a resize handle commits the
// gesture on-down — a singleton; there is no other plausible intent.
// The first intent flows on the first move; a full drag streams
// previews and exactly one commit (HUD-2).
#[test]
fn scenario_handle_resize_commits_on_down() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A"], &scene);

    // SE corner of A is (90,90); the knob hit region is 16×16.
    let r = hud.dispatch(down([93.0, 93.0]), &scene, 0);
    assert!(r.intents.is_empty(), "no intent on the down itself");
    assert!(hud.gesture_active(), "the resize gesture starts on-down");

    let r = hud.dispatch(mv([113.0, 103.0]), &scene, 10);
    assert_eq!(
        r.intents,
        vec![Intent::Resize {
            ids: vec!["A".into()],
            anchor: ResizeDirection::SE,
            shape: SelectionShape::Rect(Rectangle::from_xywh(10.0, 10.0, 100.0, 90.0)),
            phase: Phase::Preview,
        }],
        "dragging SE by (20,10) grows the union by (20,10), NW-anchored"
    );

    let r = hud.dispatch(up([113.0, 103.0]), &scene, 20);
    assert_eq!(r.intents.len(), 1, "exactly one commit (HUD-2)");
    assert!(matches!(
        &r.intents[0],
        Intent::Resize {
            phase: Phase::Commit,
            ..
        }
    ));
    assert!(!hud.gesture_active());
}

// UX spec: a click (no drag) on a resize handle emits nothing at all —
// an eagerly started handle gesture with zero previews has no commit
// to make (the empty-history-entry guard, sibling of the golden
// router's absolute-gesture invariant).
#[test]
fn handle_click_without_drag_emits_nothing() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A"], &scene);
    let r1 = hud.dispatch(down([93.0, 93.0]), &scene, 0);
    let r2 = hud.dispatch(up([93.0, 93.0]), &scene, 20);
    assert!(r1.intents.is_empty() && r2.intents.is_empty());
}

// UX spec (HandleRotate): the rotate halo is a virtual overlay outside
// each corner; pointer-down commits the gesture, the angle is measured
// around the selection center from the gesture start.
#[test]
fn scenario_handle_rotate_measures_angle_from_center() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A"], &scene);

    // A's SE corner (90,90); halo sits ~14 px radially outward.
    let r = hud.dispatch(down([100.0, 100.0]), &scene, 0);
    assert!(r.intents.is_empty());
    assert!(hud.gesture_active(), "rotate starts on-down (singleton)");

    // Center is (50,50): down was at 45°; (50,150) is at 90° → δ=45°.
    let r = hud.dispatch(mv([50.0, 150.0]), &scene, 10);
    let Intent::Rotate { ids, angle, phase } = &r.intents[0] else {
        panic!("expected a rotate preview, got {:?}", r.intents);
    };
    assert_eq!(ids, &vec![Id::from("A")]);
    assert!((angle - std::f32::consts::FRAC_PI_4).abs() < 1e-3);
    assert_eq!(*phase, Phase::Preview);

    let r = hud.dispatch(up([50.0, 150.0]), &scene, 20);
    assert!(matches!(
        &r.intents[0],
        Intent::Rotate {
            phase: Phase::Commit,
            ..
        }
    ));
}

// UX spec: shift snaps rotation to the 15° grid — a constraint the
// HUD applies to the *measured* angle; what the angle means to the
// document stays the host's concern (HUD-7).
#[test]
fn rotate_shift_snaps_to_15_degrees() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A"], &scene);
    hud.dispatch(down([100.0, 100.0]), &scene, 0);
    hud.dispatch(HudEvent::ModifiersChanged { modifiers: shift() }, &scene, 5);
    // ~40.6° raw from the anchor; the grid pulls it to 45°.
    let r = hud.dispatch(mv([54.0, 148.0]), &scene, 10);
    let Some(Intent::Rotate { angle, .. }) = r.intents.last() else {
        panic!("expected rotate preview");
    };
    let deg = angle.to_degrees();
    assert!(
        (deg / 15.0 - (deg / 15.0).round()).abs() < 1e-3,
        "snapped to the 15° grid, got {deg}°"
    );
}

// UX spec (EnterEdit): a double-click on content commits
// enter_content_edit immediately on the second down; the host decides
// what "edit" means for the node kind.
#[test]
fn scenario_enter_edit_on_double_click() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    let r1 = hud.dispatch(down([50.0, 50.0]), &scene, 0);
    assert!(matches!(&r1.intents[0], Intent::Select { .. }));
    hud.dispatch(up([50.0, 50.0]), &scene, 30);
    let r2 = hud.dispatch(down([50.0, 50.0]), &scene, 100);
    assert_eq!(
        r2.intents,
        vec![Intent::EnterContentEdit { id: "A".into() }],
        "second down within the click window commits enter-content-edit"
    );
}

// ── Tier-2 scene-pick scenarios ──────────────────────────────────────

// UX spec (ContentReplace): clicking unselected content commits the
// replace on-down — a singleton — and a drag translates the *new*
// selection without waiting for the mirror to echo.
#[test]
fn scenario_content_replace_commits_on_down_and_drags_new_selection() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    let r = hud.dispatch(down([50.0, 50.0]), &scene, 0);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["A".into()],
            mode: SelectMode::Replace,
        }]
    );
    let r = hud.dispatch(mv([60.0, 55.0]), &scene, 10);
    assert_eq!(
        r.intents,
        vec![Intent::Translate {
            ids: vec!["A".into()],
            dx: 10.0,
            dy: 5.0,
            axis_lock: None,
            pointer: [60.0, 55.0],
            clone: false,
            phase: Phase::Preview,
        }]
    );
    let r = hud.dispatch(up([60.0, 55.0]), &scene, 20);
    assert!(matches!(
        &r.intents[0],
        Intent::Translate {
            phase: Phase::Commit,
            ..
        }
    ));
}

// UX spec (ContentAdd): shift-click on unselected content commits the
// toggle-add on-down; a drag translates the combined set.
#[test]
fn scenario_content_add_drags_combined_set() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string()]);
    let r = hud.dispatch(down_mods([220.0, 50.0], shift()), &scene, 0);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["B".into()],
            mode: SelectMode::Toggle,
        }]
    );
    let r = hud.dispatch(mv([230.0, 50.0]), &scene, 10);
    let Intent::Translate { ids, .. } = &r.intents[0] else {
        panic!("expected translate preview");
    };
    assert_eq!(ids, &vec![Id::from("A"), Id::from("B")]);
}

// UX spec (ContentNarrowOrDrag): clicking an already-selected node is
// ambiguous — narrow on up-without-drag, translate the existing
// selection on drag. The deferred select is cancelled by promotion,
// never by anything else.
#[test]
fn scenario_content_narrow_or_drag() {
    let scene = MockScene::abc();

    // Up without drag: narrow.
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string(), "B".to_string()]);
    let r = hud.dispatch(down([50.0, 50.0]), &scene, 0);
    assert!(r.intents.is_empty(), "ambiguous: nothing commits on-down");
    let r = hud.dispatch(up([50.0, 50.0]), &scene, 20);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["A".into()],
            mode: SelectMode::Replace,
        }]
    );

    // Drag: translate the existing selection; the deferred select
    // never fires.
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string(), "B".to_string()]);
    hud.dispatch(down([50.0, 50.0]), &scene, 0);
    let r = hud.dispatch(mv([60.0, 50.0]), &scene, 10);
    let Intent::Translate { ids, .. } = &r.intents[0] else {
        panic!("expected translate preview");
    };
    assert_eq!(ids, &vec![Id::from("A"), Id::from("B")]);
    let r = hud.dispatch(up([60.0, 50.0]), &scene, 20);
    assert_eq!(r.intents.len(), 1, "commit only — no select");
    assert!(matches!(&r.intents[0], Intent::Translate { .. }));
}

// UX spec (ContentToggleOrDrag): the shift variant defers too — shift
// may be a toggle-off OR the axis-lock modifier of an imminent drag.
#[test]
fn scenario_content_toggle_or_drag() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string(), "B".to_string()]);
    let r = hud.dispatch(down_mods([50.0, 50.0], shift()), &scene, 0);
    assert!(r.intents.is_empty());
    let r = hud.dispatch(up([50.0, 50.0]), &scene, 20);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["A".into()],
            mode: SelectMode::Toggle,
        }]
    );
}

// ── Tier-1 translate-body scenarios ──────────────────────────────────

// UX spec (BodyDragOnly): pressing the union body over empty content
// mutates nothing on up; a drag translates the selection. Hover keeps
// reflecting the pick underneath the body (HUD-8).
#[test]
fn scenario_body_drag_only() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A", "B"], &scene);

    // (150,50) is inside the A∪B union but over empty canvas — to
    // the right of C, clear of the virtual edge strips.
    let hit = hud.hit_test([150.0, 50.0]);
    assert_eq!(
        hit,
        Some(HudAction::Body),
        "the union body claims the point"
    );
    hud.dispatch(down([150.0, 50.0]), &scene, 0);
    let r = hud.dispatch(up([150.0, 50.0]), &scene, 20);
    assert!(r.intents.is_empty(), "no selection mutation on up");

    let mut hud = hud_with(&["A", "B"], &scene);
    hud.dispatch(down([150.0, 50.0]), &scene, 0);
    let r = hud.dispatch(mv([160.0, 50.0]), &scene, 10);
    let Intent::Translate { ids, .. } = &r.intents[0] else {
        panic!("expected translate preview");
    };
    assert_eq!(ids, &vec![Id::from("A"), Id::from("B")]);
}

// UX spec (BodyNarrowOrDrag / BodyToggleOrDrag): pressing a selected
// member through the body defers; up narrows (or toggles under
// shift), drag translates the existing selection.
#[test]
fn scenario_body_narrow_or_drag_and_toggle() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A", "B"], &scene);
    hud.dispatch(down([50.0, 50.0]), &scene, 0);
    let r = hud.dispatch(up([50.0, 50.0]), &scene, 20);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["A".into()],
            mode: SelectMode::Replace,
        }]
    );

    let mut hud = hud_with(&["A", "B"], &scene);
    hud.dispatch(down_mods([50.0, 50.0], shift()), &scene, 0);
    let r = hud.dispatch(up([50.0, 50.0]), &scene, 20);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["A".into()],
            mode: SelectMode::Toggle,
        }]
    );
}

// UX spec (BodySwapOrDrag / BodyAddOrDrag): pressing an UNSELECTED
// node under the body defers — the body's drag claim is a live
// candidate, so even shift+would-select (which commits on-down in
// tier 2) waits. This asymmetry was the multi-select-on-shift-hover
// bug.
#[test]
fn scenario_body_swap_or_add_defers() {
    let scene = MockScene::abc();

    // Swap: up commits replace-to-C.
    let mut hud = hud_with(&["A", "B"], &scene);
    let r = hud.dispatch(down([120.0, 50.0]), &scene, 0);
    assert!(r.intents.is_empty(), "BodySwapOrDrag defers");
    let r = hud.dispatch(up([120.0, 50.0]), &scene, 20);
    assert_eq!(
        r.intents,
        vec![Intent::Select {
            ids: vec!["C".into()],
            mode: SelectMode::Replace,
        }]
    );

    // Add: shift defers too; drag translates the EXISTING selection.
    let mut hud = hud_with(&["A", "B"], &scene);
    let r = hud.dispatch(down_mods([120.0, 50.0], shift()), &scene, 0);
    assert!(r.intents.is_empty(), "BodyAddOrDrag defers (the bug class)");
    let r = hud.dispatch(mv([130.0, 50.0]), &scene, 10);
    let Intent::Translate { ids, .. } = &r.intents[0] else {
        panic!("expected translate preview");
    };
    assert_eq!(
        ids,
        &vec![Id::from("A"), Id::from("B")],
        "drag translates the existing selection, not C"
    );
}

// ── Empty-space scenarios ────────────────────────────────────────────

// UX spec (EmptyMarquee): empty selection, empty space — nothing
// commits; a drag streams marquee previews carrying the RECT, not
// ids (resolution is the host's).
#[test]
fn scenario_empty_marquee() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    let r = hud.dispatch(down([300.0, 200.0]), &scene, 0);
    assert!(r.intents.is_empty());
    let r = hud.dispatch(mv([340.0, 260.0]), &scene, 10);
    assert_eq!(
        r.intents,
        vec![Intent::Marquee {
            rect: Rectangle::from_xywh(300.0, 200.0, 40.0, 60.0),
            additive: false,
            phase: Phase::Preview,
        }]
    );
    let r = hud.dispatch(up([340.0, 260.0]), &scene, 20);
    assert!(matches!(
        &r.intents[0],
        Intent::Marquee {
            phase: Phase::Commit,
            ..
        }
    ));
}

// UX spec (EmptyDeselectThenMarquee): with a selection, empty-space
// pointer-down commits deselect_all ON DOWN — an aborted click must
// not silently preserve the old selection.
#[test]
fn scenario_empty_deselect_then_marquee() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string()]);
    let r = hud.dispatch(down([300.0, 200.0]), &scene, 0);
    assert_eq!(r.intents, vec![Intent::DeselectAll]);
}

// UX spec (EmptyAdditiveMarquee): shift preserves the selection; the
// drag marquees additively.
#[test]
fn scenario_empty_additive_marquee() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string()]);
    let r = hud.dispatch(down_mods([300.0, 200.0], shift()), &scene, 0);
    assert!(r.intents.is_empty(), "no deselect under shift");
    let r = hud.dispatch(mv([340.0, 260.0]), &scene, 10);
    assert!(matches!(
        &r.intents[0],
        Intent::Marquee { additive: true, .. }
    ));
}

// UX spec (MetaMarquee): meta turns a drag into a marquee from
// anywhere except a real handle — no on-down emit, so it neither
// selects nor moves.
#[test]
fn scenario_meta_marquee_overrides_body() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A"], &scene);
    let meta = Modifiers {
        meta: true,
        ..Default::default()
    };
    let r = hud.dispatch(down_mods([50.0, 50.0], meta), &scene, 0);
    assert!(r.intents.is_empty(), "meta-press emits nothing on down");
    let r = hud.dispatch(mv([120.0, 120.0]), &scene, 10);
    assert!(
        matches!(&r.intents[0], Intent::Marquee { .. }),
        "the drag region-selects instead of moving A"
    );
}

// UX spec (Noop): non-primary buttons route nothing — the host owns
// pan and context menus.
#[test]
fn scenario_noop_secondary_button() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    let r = hud.dispatch(
        HudEvent::PointerDown {
            screen: [50.0, 50.0],
            button: PointerButton::Secondary,
            modifiers: Modifiers::default(),
        },
        &scene,
        0,
    );
    assert!(r.intents.is_empty());
    assert!(!hud.gesture_active());
}

// UX spec (Noop, readonly): selection still works; mutating drags do
// not.
#[test]
fn readonly_selects_but_never_translates() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_readonly(true);
    let r = hud.dispatch(down([50.0, 50.0]), &scene, 0);
    assert!(matches!(&r.intents[0], Intent::Select { .. }));
    let r = hud.dispatch(mv([80.0, 50.0]), &scene, 10);
    assert!(r.intents.is_empty(), "readonly: the drag claims nothing");
}

// ── Phase discipline, cancel, live modifiers ─────────────────────────

// HUD-2: a full drag is previews then exactly one commit; Esc mid-
// gesture is previews then exactly one cancel — never both, never
// more.
#[test]
fn hud_2_phase_discipline_and_cancel() {
    let scene = MockScene::abc();

    let mut hud = Hud::new();
    hud.dispatch(down([50.0, 50.0]), &scene, 0);
    let mut stream = Vec::new();
    for (i, p) in [[60.0, 50.0], [70.0, 55.0], [80.0, 60.0]]
        .iter()
        .enumerate()
    {
        stream.extend(hud.dispatch(mv(*p), &scene, 10 + i as u64).intents);
    }
    stream.extend(hud.dispatch(up([80.0, 60.0]), &scene, 20).intents);
    let previews = stream
        .iter()
        .filter(|i| {
            matches!(
                i,
                Intent::Translate {
                    phase: Phase::Preview,
                    ..
                }
            )
        })
        .count();
    let commits = stream
        .iter()
        .filter(|i| {
            matches!(
                i,
                Intent::Translate {
                    phase: Phase::Commit,
                    ..
                }
            )
        })
        .count();
    assert_eq!((previews, commits), (3, 1));

    let mut hud = Hud::new();
    hud.dispatch(down([50.0, 50.0]), &scene, 0);
    hud.dispatch(mv([70.0, 50.0]), &scene, 10);
    let r = hud.dispatch(HudEvent::Cancel, &scene, 15);
    assert_eq!(r.intents, vec![Intent::Cancel]);
    let r = hud.dispatch(up([70.0, 50.0]), &scene, 20);
    assert!(r.intents.is_empty(), "no commit after a cancel");
}

// SURF-4: toggling a modifier mid-gesture re-derives the preview
// within that event — here shift's axis lock zeroes the minor axis.
#[test]
fn surf_4_live_modifier_reconfigures_translate() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.dispatch(down([50.0, 50.0]), &scene, 0);
    hud.dispatch(mv([70.0, 58.0]), &scene, 10);
    let r = hud.dispatch(
        HudEvent::ModifiersChanged { modifiers: shift() },
        &scene,
        11,
    );
    assert_eq!(
        r.intents,
        vec![Intent::Translate {
            ids: vec!["A".into()],
            dx: 20.0,
            dy: 0.0,
            axis_lock: Some(math2::vector2::Axis::X),
            pointer: [70.0, 58.0],
            clone: false,
            phase: Phase::Preview,
        }],
        "axis lock applies to the re-emitted preview immediately — and names its axis"
    );
}

// ── Two backends, chrome purity, hover decoupling ────────────────────

// HUD-5: the knob hits fatter than it draws (pad the hit, never the
// visual); the rotate halo hits without drawing at all (virtual).
#[test]
fn hud_5_hit_and_render_disagree_by_design() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string()]);
    let draw = hud.chrome(&scene);

    // Paired: (97,97) is outside the 8 px visual knob at (90,90) but
    // inside its 16 px hit region.
    assert_eq!(
        hud.hit_test([97.0, 97.0]),
        Some(HudAction::Resize(ResizeDirection::SE))
    );
    let knobs: Vec<&HudPrim> = draw
        .prims
        .iter()
        .filter(|p| matches!(p, HudPrim::Knob { .. }))
        .collect();
    assert_eq!(knobs.len(), 4, "four corner knobs render");
    for k in &knobs {
        let HudPrim::Knob { size, .. } = k else {
            unreachable!()
        };
        assert_eq!(*size, KNOB_VISUAL_PX, "visual stays small");
    }

    // Virtual: the rotate halo hits at (100,100) with no primitive
    // rendered there.
    assert!(matches!(
        hud.hit_test([100.0, 100.0]),
        Some(HudAction::Rotate(_))
    ));

    // Virtual: the edge strip hits at the side midpoint with no
    // primitive of its own.
    assert_eq!(
        hud.hit_test([50.0, 90.0]),
        Some(HudAction::Resize(ResizeDirection::S))
    );
}

// HUD-6: chrome is a pure function — equal inputs, identical draw
// list (SURF-5 made mechanical).
#[test]
fn hud_6_chrome_is_pure() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string(), "B".to_string()]);
    let first = hud.chrome(&scene);
    let second = hud.chrome(&scene);
    assert_eq!(first, second);
    assert!(!first.prims.is_empty());
}

// HUD-8: hover reflects the pick even where the body overlay claims
// the pointer; the cursor reflects what pointer-down would do (Move).
#[test]
fn hud_8_hover_decoupled_from_overlays() {
    let scene = MockScene::abc();
    let mut hud = hud_with(&["A", "B"], &scene);
    hud.dispatch(mv([120.0, 50.0]), &scene, 0);
    assert_eq!(
        hud.hover(),
        Some(&Id::from("C")),
        "hover answers 'what am I looking at' — C, under the body"
    );
    assert_eq!(
        hud.cursor(),
        HudCursor::Move,
        "cursor answers 'what would a press do' — claim the body"
    );
}

// The mirror rule (HUD-3): no dispatch writes the selection mirror —
// a marquee's previews leave it untouched until the host pushes.
#[test]
fn hud_3_dispatch_never_writes_the_mirror() {
    let scene = MockScene::abc();
    let mut hud = Hud::new();
    hud.set_selection(&["A".to_string()]);
    hud.dispatch(down([300.0, 200.0]), &scene, 0);
    hud.dispatch(mv([100.0, 100.0]), &scene, 10);
    hud.dispatch(up([100.0, 100.0]), &scene, 20);
    assert_eq!(
        hud.selection(),
        &["A".to_string()],
        "only the host push changes the mirror"
    );
}
