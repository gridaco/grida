//! Gradient paint session conformance — the session driven headlessly
//! (no renderer, `ARCH-1`) through synthetic pointer events. Pins the
//! contracts of `docs/wg/canvas/paint-session/gradient.md` (`GRAD-*`)
//! and the shared surface doctrine (`PSES-*`) at the editor level; the
//! pure math is unit-tested in the module itself.

use grida::cg::prelude::{
    CGColor, GradientStop, LinearGradientPaint, Paint, Paints, RadialGradientPaint, SolidPaint,
};
use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::hud::HudPrim;
use grida_editor::paint_session::gradient::frame::{self, GradientType};
use grida_editor::paint_session::gradient::mode::{self as gradient, GradientSession, PaintTarget};
use grida_editor::paint_session::gradient::ops as gops;

/// The control-point frame of `r`'s gradient fill 0, as a `GradientType`.
fn frame_of(editor: &Editor, ty: GradientType) -> frame::Frame {
    let t = match &editor.node_fills(&"r".to_string()).unwrap().as_slice()[0] {
        Paint::LinearGradient(g) => g.transform,
        Paint::RadialGradient(g) => g.transform,
        Paint::SweepGradient(g) => g.transform,
        Paint::DiamondGradient(g) => g.transform,
        other => panic!("expected a gradient, got {other:?}"),
    };
    frame::frame_from_transform(ty, &t)
}

fn close(a: [f32; 2], b: [f32; 2]) -> bool {
    (a[0] - b[0]).abs() < 1e-3 && (a[1] - b[1]).abs() < 1e-3
}

/// A 100×100 rectangle `r` at the origin, with fill stack `fills`.
fn editor_with_fills(fills: Vec<Paint>) -> Editor {
    let mut wc = WorkingCopy::new_empty("grad");
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
                set: Box::new(PropPatch {
                    position: Some((0.0, 0.0)),
                    size: Some((Some(100.0), Some(100.0))),
                    fills: Some(Paints::new(fills)),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Silent,
        )
        .unwrap();
    editor
}

fn linear_two() -> Paint {
    Paint::LinearGradient(LinearGradientPaint::from_colors(vec![
        CGColor::BLACK,
        CGColor::WHITE,
    ]))
}

/// A linear gradient with stops at the given offsets (all black), so a
/// stop can sit clear of the end handles for hit-testing.
fn linear_at(offsets: &[f32]) -> Paint {
    Paint::LinearGradient(LinearGradientPaint::from_stops(
        offsets
            .iter()
            .map(|&offset| GradientStop {
                offset,
                color: CGColor::BLACK,
            })
            .collect(),
    ))
}

fn solid() -> Paint {
    Paint::Solid(SolidPaint::new_color(CGColor::RED))
}

/// The linear gradient's transform matrix + stop count of `r`'s fill 0.
fn linear_of(editor: &Editor) -> ([[f32; 3]; 2], usize) {
    match &editor.node_fills(&"r".to_string()).unwrap().as_slice()[0] {
        Paint::LinearGradient(g) => (g.transform.matrix, g.stops.len()),
        other => panic!("expected a linear gradient, got {other:?}"),
    }
}

fn enter(editor: &Editor) -> GradientSession {
    GradientSession::enter(editor, "r".to_string(), PaintTarget::Fill, 0).expect("gradient fill")
}

/// The linear gradient's stop list on `r`'s fill 0.
fn gradient_stops(editor: &Editor) -> Vec<GradientStop> {
    match &editor.node_fills(&"r".to_string()).unwrap().as_slice()[0] {
        Paint::LinearGradient(g) => g.stops.clone(),
        other => panic!("expected a linear gradient, got {other:?}"),
    }
}

// -- MODE-2 / PSES-4: entry resolves only a gradient ------------------------

#[test]
fn enter_resolves_only_a_gradient() {
    let editor = editor_with_fills(vec![linear_two()]);
    assert!(GradientSession::enter(&editor, "r".to_string(), PaintTarget::Fill, 0).is_some());

    let editor = editor_with_fills(vec![solid()]);
    assert!(
        GradientSession::enter(&editor, "r".to_string(), PaintTarget::Fill, 0).is_none(),
        "a solid paint has no gradient session"
    );
}

// -- PSES-3: a handle drag is one history entry that moves the transform ----

#[test]
fn handle_drag_is_one_entry_and_moves_the_transform() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let mut session = enter(&editor);
    let (before, _) = linear_of(&editor);
    let len_before = editor.history_len();

    // The primary handle of an identity linear gradient sits at unit
    // (1, 0.5) → node-local (100, 50) → canvas (100, 50).
    session.pointer_down(&mut editor, [100.0, 50.0], [100.0, 50.0], 1.0, 0);
    session.pointer_move(&mut editor, [130.0, 30.0], 1.0);
    session.pointer_up(&mut editor, [130.0, 30.0], 1.0);

    let (after, _) = linear_of(&editor);
    assert_ne!(before, after, "the drag moved the transform");
    assert_eq!(
        editor.history_len(),
        len_before + 1,
        "the whole drag is exactly one undoable entry (PSES-3)"
    );

    // Undo restores the entry transform.
    editor.undo();
    let (undone, _) = linear_of(&editor);
    assert_eq!(undone, before);
}

// -- GRAD-5 drag model: linear endpoints move independently -----------------

#[test]
fn linear_endpoints_move_independently() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let mut session = enter(&editor);
    let before = frame_of(&editor, GradientType::Linear);
    // The origin handle sits at unit (0, 0.5) → canvas (0, 50). Drag it
    // up-left; the primary (the other endpoint) must stay put.
    session.pointer_down(&mut editor, [0.0, 50.0], [0.0, 50.0], 1.0, 0);
    session.pointer_move(&mut editor, [10.0, 10.0], 1.0);
    session.pointer_up(&mut editor, [10.0, 10.0], 1.0);
    let after = frame_of(&editor, GradientType::Linear);
    assert!(
        close(after.primary, before.primary),
        "the other endpoint stays put"
    );
    assert!(
        !close(after.origin, before.origin),
        "the dragged endpoint moved"
    );
}

// -- GRAD-5 drag model: the radial centre holds the major endpoint ----------

#[test]
fn radial_center_holds_the_major_endpoint() {
    let radial = Paint::RadialGradient(RadialGradientPaint::from_colors(vec![
        CGColor::BLACK,
        CGColor::WHITE,
    ]));
    let mut editor = editor_with_fills(vec![radial]);
    let mut session = enter(&editor);
    let before = frame_of(&editor, GradientType::Radial);
    // The centre handle sits at unit (0.5, 0.5) → canvas (50, 50). Drag
    // it; the major endpoint (primary) holds, per the production model.
    session.pointer_down(&mut editor, [50.0, 50.0], [50.0, 50.0], 1.0, 0);
    session.pointer_move(&mut editor, [65.0, 65.0], 1.0);
    session.pointer_up(&mut editor, [65.0, 65.0], 1.0);
    let after = frame_of(&editor, GradientType::Radial);
    assert!(
        close(after.primary, before.primary),
        "the major endpoint is held"
    );
    assert!(!close(after.origin, before.origin), "the centre moved");
}

// -- GRAD-7: a track click inserts one stop ---------------------------------

#[test]
fn track_click_inserts_one_stop() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let mut session = enter(&editor);
    let (_, before) = linear_of(&editor);
    let len_before = editor.history_len();

    // Midpoint of the axis: unit (0.5, 0.5) → canvas (50, 50), off both
    // stops and handles — a track hit.
    session.pointer_down(&mut editor, [50.0, 50.0], [50.0, 50.0], 1.0, 0);

    let (_, after) = linear_of(&editor);
    assert_eq!(after, before + 1, "the track click added one stop");
    assert_eq!(editor.history_len(), len_before + 1);
}

// -- GRAD-7: a dragged stop keeps its identity across a reorder -------------

#[test]
fn dragging_a_stop_across_a_neighbor_keeps_its_identity() {
    // Distinct colors so we can tell which stop actually moved.
    const A: u32 = 0x000000FF; // black
    const B: u32 = 0x808080FF; // gray
    const C: u32 = 0xFFFFFFFF; // white
    let paint = Paint::LinearGradient(LinearGradientPaint::from_stops(vec![
        GradientStop {
            offset: 0.0,
            color: CGColor::from_u32(A),
        },
        GradientStop {
            offset: 0.3,
            color: CGColor::from_u32(B),
        },
        GradientStop {
            offset: 1.0,
            color: CGColor::from_u32(C),
        },
    ]));
    let mut editor = editor_with_fills(vec![paint]);
    let mut session = enter(&editor);

    // Grab B: its ramp point is (30,50); its chip floats to (30,25).
    session.pointer_down(&mut editor, [30.0, 25.0], [30.0, 25.0], 1.0, 0);
    // Drag it past C (to the far end) — a reorder — then back to the middle.
    session.pointer_move(&mut editor, [120.0, 25.0], 1.0);
    session.pointer_move(&mut editor, [50.0, 25.0], 1.0);
    session.pointer_up(&mut editor, [50.0, 25.0], 1.0);

    // The list stays sorted; **B** (gray) is the stop that ended at the
    // middle — not C. Before the fix, the drag would have grabbed C after
    // the cross and left B at 0.3.
    let stops = gradient_stops(&editor);
    assert_eq!(stops[0].color, CGColor::from_u32(A));
    assert!(
        (stops[1].offset - 0.5).abs() < 1e-3,
        "the grabbed stop is at 0.5"
    );
    assert_eq!(
        stops[1].color,
        CGColor::from_u32(B),
        "the grabbed (gray) stop is the one that moved, keeping its identity"
    );
    assert_eq!(stops[2].color, CGColor::from_u32(C));
    // The selection follows the grabbed stop to its live position.
    assert_eq!(
        session.selected().iter().copied().collect::<Vec<_>>(),
        vec![1]
    );
}

// -- GRAD-6: deleting refuses below two -------------------------------------

#[test]
fn delete_selected_refuses_below_two() {
    let mut editor = editor_with_fills(vec![linear_at(&[0.3, 0.7])]);
    let mut session = enter(&editor);
    // Stop 0 at unit (0.3, 0.5) → on-track canvas (30, 50); its chip
    // floats STOP_OFFSET_PX (25) perpendicular → canvas (30, 25).
    session.pointer_down(&mut editor, [30.0, 25.0], [30.0, 25.0], 1.0, 0);
    session.pointer_up(&mut editor, [30.0, 25.0], 1.0);
    assert_eq!(
        session.selected().len(),
        1,
        "the chip press selected a stop"
    );

    assert!(
        !session.delete_selected(&mut editor),
        "a two-stop gradient refuses the removal (GRAD-6)"
    );
    assert_eq!(linear_of(&editor).1, 2);
}

// -- double-click on empty canvas requests exit (like Escape) ---------------

#[test]
fn double_click_empty_requests_exit() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let mut session = enter(&editor);
    // Empty canvas, clear of the track/handles/chips: unit (0.5, 0.9) →
    // canvas (50, 90).
    let empty = [50.0, 90.0];
    let first = session.pointer_down(&mut editor, empty, empty, 1.0, 0);
    assert!(!first.exit_requested, "a single empty press does not exit");
    // A second press at the same point, inside the double-click window.
    let second = session.pointer_down(&mut editor, empty, empty, 1.0, 120);
    assert!(second.exit_requested, "the double-click requests exit");
}

// -- reconcile adopts a switched gradient kind ------------------------------

#[test]
fn reconcile_adopts_a_switched_gradient_kind() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let mut session = enter(&editor);
    let handles = |s: &GradientSession, e: &Editor| {
        s.chrome(e, 1.0)
            .unwrap()
            .prims
            .iter()
            .filter(|p| matches!(p, HudPrim::GradientHandle { .. }))
            .count()
    };
    // Linear exposes two handles (start + end).
    assert_eq!(handles(&session, &editor), 2, "linear exposes two handles");

    // Switch the fill to a radial gradient — the panel's kind switch,
    // under the live session.
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "r".to_string(),
                set: Box::new(PropPatch {
                    fills: Some(Paints::new(vec![Paint::RadialGradient(
                        RadialGradientPaint::from_colors(vec![CGColor::BLACK, CGColor::WHITE]),
                    )])),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    assert!(session.reconcile(&editor), "still a gradient — continues");

    // The chrome now exposes the elliptical types' third (minor) handle,
    // proving the session adopted the switched kind instead of staying
    // linear.
    assert_eq!(
        handles(&session, &editor),
        3,
        "the third handle appears — the kind updated to radial"
    );
}

// -- PSES-4 / MODE-5: retype ends the session -------------------------------

#[test]
fn reconcile_ends_on_retype() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let mut session = enter(&editor);
    assert!(session.reconcile(&editor), "still a gradient — continues");

    // Retype the fill to a solid (the panel's kind switch).
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "r".to_string(),
                set: Box::new(PropPatch {
                    fills: Some(Paints::new(vec![solid()])),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    assert!(
        !session.reconcile(&editor),
        "retyped away from a gradient — the session ends (MODE-5)"
    );
}

// -- PSES-1: the panel and the session write one state ----------------------

#[test]
fn panel_edit_and_session_read_one_state() {
    let mut editor = editor_with_fills(vec![linear_two()]);
    let session = enter(&editor);
    let len_before = editor.history_len();

    // The panel's write path inserts a stop; one entry.
    gradient::edit_stops(
        &mut editor,
        &"r".to_string(),
        PaintTarget::Fill,
        0,
        "gradient.stop.insert",
        |stops| {
            gops::insert_stop(stops, 0.5, CGColor::RED);
        },
    );
    assert_eq!(editor.history_len(), len_before + 1);
    // The session reads the same live paint the panel wrote.
    assert_eq!(
        linear_of(&editor).1,
        3,
        "the added stop is visible to both views"
    );
    let _ = session; // still valid; both are views of the node's fills
}
