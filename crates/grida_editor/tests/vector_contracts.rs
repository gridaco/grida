//! `VEC-*` conformance tests for `docs/wg/feat-vector-network/vector-edit.md`.
//!
//! The machine is driven headlessly with synthetic pointer events in
//! canvas space under an identity camera (zoom 1) — the harness
//! doctrine's plane 1: assertions on document, editor, and history
//! state.

use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, WorkingCopy, polyline_network};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::tool::vector_fragment;
use grida_editor::vector::hit::Control;
use grida_editor::vector::mode::{EscapeStep, VecMods, VectorMode, VectorTool};
use math2::transform::AffineTransform;

const VEC: &str = "v0";

fn editor_with_vector(anchor: [f32; 2], points: &[(f32, f32)]) -> Editor {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(vector_fragment(
                    VEC.to_string(),
                    "Vector",
                    anchor,
                    polyline_network(points),
                )),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    editor
}

fn enter(editor: &Editor) -> VectorMode {
    VectorMode::enter(editor, VEC.to_string()).expect("vector node enters")
}

fn mods() -> VecMods {
    VecMods::default()
}

/// One pen placement: press + release at a canvas point.
fn pen_click(mode: &mut VectorMode, editor: &mut Editor, at: [f32; 2]) {
    mode.pointer_down(editor, at, at, 1.0, 0, mods());
    mode.pointer_up(editor, at);
}

fn pen_click_keep(mode: &mut VectorMode, editor: &mut Editor, at: [f32; 2]) {
    mode.pointer_down(
        editor,
        at,
        at,
        1.0,
        0,
        VecMods {
            keep_projecting: true,
            ..Default::default()
        },
    );
    mode.pointer_up(editor, at);
}

/// Click-select a control at a canvas point with the cursor tool.
fn click(mode: &mut VectorMode, editor: &mut Editor, at: [f32; 2]) {
    mode.pointer_down(editor, at, at, 1.0, 0, mods());
    mode.pointer_up(editor, at);
}

/// Drag from `from` to `to` with the cursor tool.
fn drag(mode: &mut VectorMode, editor: &mut Editor, from: [f32; 2], to: [f32; 2]) {
    mode.pointer_down(editor, from, from, 1.0, 0, mods());
    let mid = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
    mode.pointer_move(editor, mid, mid, 1.0, mods());
    mode.pointer_move(editor, to, to, 1.0, mods());
    mode.pointer_up(editor, to);
}

// -- VEC-1 ---------------------------------------------------------------------

#[test]
fn vec_1_enter_exit_untouched_is_identity() {
    let mut editor = editor_with_vector([10.0, 10.0], &[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]);
    let baseline = editor.document().clone();
    let history_before = editor.history_len();

    let mode = enter(&editor);
    let out = mode.exit(&mut editor);

    assert!(!out.deleted);
    assert!(editor.document().structure_eq(&baseline));
    assert_eq!(editor.history_len(), history_before);
}

#[test]
fn vec_1_edit_then_undo_all_exits_as_identity() {
    let mut editor = editor_with_vector([10.0, 10.0], &[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]);
    let baseline = editor.document().clone();
    let history_before = editor.history_len();

    let mut mode = enter(&editor);
    // One committed edit, then undo it inside the mode.
    click(&mut mode, &mut editor, [10.0, 10.0]); // select vertex 0
    assert!(mode.nudge(&mut editor, 5.0, 0.0));
    assert!(editor.undo());
    assert!(
        mode.reconcile(&editor),
        "undo to the entry floor keeps the mode"
    );

    let out = mode.exit(&mut editor);
    assert!(!out.deleted);
    assert!(editor.document().structure_eq(&baseline));
    assert_eq!(editor.history_len(), history_before);
}

// -- VEC-2 ---------------------------------------------------------------------

#[test]
fn vec_2_fresh_degenerate_leaves_no_trace() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    let depth_before = editor.history_len();
    // The pen-from-scratch creation: a one-vertex vector, recorded.
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(vector_fragment(
                    VEC.to_string(),
                    "Vector",
                    [100.0, 100.0],
                    polyline_network(&[(0.0, 0.0)]),
                )),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    let mode = VectorMode::enter_created(&editor, VEC.to_string(), depth_before, 0).expect("enter");
    let out = mode.exit(&mut editor);

    assert!(out.deleted);
    assert!(!editor.document().contains(&VEC.to_string()));
    // No entry survives — not even the creation (VEC-2).
    assert_eq!(editor.history_len(), depth_before);
    assert_eq!(editor.history().future_len(), 0);
    assert!(!editor.redo());
}

#[test]
fn vec_2_pre_existing_degenerate_deletes_with_one_restorable_entry() {
    let mut editor = editor_with_vector([10.0, 10.0], &[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]);
    let baseline = editor.document().clone();
    let original = editor.node_vector_network(&VEC.to_string()).unwrap();
    let history_before = editor.history_len();

    let mut mode = enter(&editor);
    // Marquee everything, delete: degenerate content, two mode-era
    // entries would be the naive record.
    drag(&mut mode, &mut editor, [-20.0, -20.0], [100.0, 100.0]);
    assert!(mode.delete(&mut editor));

    let out = mode.exit(&mut editor);
    assert!(out.deleted);
    assert!(!editor.document().contains(&VEC.to_string()));
    // Exactly one surviving entry: the Remove.
    assert_eq!(editor.history_len(), history_before + 1);

    // Its undo restores the full original node.
    assert!(editor.undo());
    assert!(editor.document().structure_eq(&baseline));
    let restored = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert!(grida_editor::vector::ops::network_eq(&restored, &original));
}

// -- VEC-3 ---------------------------------------------------------------------

fn world_of(editor: &Editor, local: (f32, f32)) -> (f32, f32) {
    let (px, py) = editor.node_position(&VEC.to_string()).unwrap();
    let rot = editor.node_rotation(&VEC.to_string()).unwrap_or(0.0);
    let (sin, cos) = rot.sin_cos();
    (
        px + local.0 * cos - local.1 * sin,
        py + local.0 * sin + local.1 * cos,
    )
}

#[test]
fn vec_3_refit_holds_world_positions_on_rotated_node() {
    let mut editor = editor_with_vector([10.0, 20.0], &[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]);
    let angle = std::f32::consts::FRAC_PI_6;
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: VEC.to_string(),
                set: Box::new(grida_editor::document::PropPatch {
                    rotation: Some(angle),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    let mut mode = enter(&editor);
    // World position of the *unmoved* vertex 2 (local (50, 50)) must
    // survive the refit exactly.
    let w2_before = world_of(&editor, (50.0, 50.0));

    // Drag vertex 0 outward (its canvas position is the node anchor).
    let v0_canvas = {
        let w = world_of(&editor, (0.0, 0.0));
        [w.0, w.1]
    };
    let target = {
        let w = world_of(&editor, (-20.0, -10.0));
        [w.0, w.1]
    };
    drag(&mut mode, &mut editor, v0_canvas, target);

    // Tight bounds: the refit re-anchored the network at the origin.
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    let bounds = net.bounds();
    assert!(bounds.x.abs() < 1e-3 && bounds.y.abs() < 1e-3, "{bounds:?}");

    // The unmoved vertex's world position did not shift (VEC-3).
    let v2_local = net.vertices[2];
    let w2_after = world_of(&editor, v2_local);
    assert!(
        (w2_after.0 - w2_before.0).abs() < 1e-2 && (w2_after.1 - w2_before.1).abs() < 1e-2,
        "{w2_before:?} vs {w2_after:?}"
    );
}

// -- Nesting (world transform) -------------------------------------------------

/// End-to-end nesting fix: a vector node under a translated ancestor.
/// Its world transform composes the ancestor (the chrome's forward
/// projection), and a pointer-down at the vertex's *world* position
/// selects it (the mode's inverse projection). The two stay each
/// other's inverse, so a click lands on the vertex the chrome draws —
/// projecting through the node's own local transform alone (the bug)
/// would place both at the parent-relative offset from the origin.
#[test]
fn nested_vector_world_transform_and_pointer_round_trip() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    // A group parent translated to (300, 200)…
    let mut group = NodeFactory::new().create_group_node();
    group.transform = Some(AffineTransform::new(300.0, 200.0, 0.0));
    // …containing a vector at node-local anchor (50, 10) with a
    // horizontal segment (0,0)–(100,0).
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(Fragment {
                    id: "g".to_string(),
                    name: Some("Group".to_string()),
                    node: Node::Group(group),
                    children: vec![vector_fragment(
                        VEC.to_string(),
                        "Vector",
                        [50.0, 10.0],
                        polyline_network(&[(0.0, 0.0), (100.0, 0.0)]),
                    )],
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    // Forward: vertex 0 (node-local origin) → world (350, 210) =
    // group(300,200) ∘ vector(50,10).
    let m = editor.node_world_transform(&VEC.to_string()).matrix;
    let v0 = [m[0][2], m[1][2]];
    assert!(
        (v0[0] - 350.0).abs() < 1e-3 && (v0[1] - 210.0).abs() < 1e-3,
        "nested world position: {v0:?}"
    );

    // Inverse: a click at that world point selects vertex 0.
    let mut mode = enter(&editor);
    click(&mut mode, &mut editor, v0);
    assert!(
        mode.selection().vertices.contains(&0),
        "click at the vertex's world position selects it"
    );
}

// -- VEC-4 ---------------------------------------------------------------------

#[test]
fn vec_4_escape_disconnects_mode_and_tool_survive() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    // Adopt the open end and project.
    pen_click(&mut mode, &mut editor, [100.0, 0.0]);
    assert!(mode.projecting());

    assert_eq!(mode.escape(&mut editor), EscapeStep::Disconnected);
    assert!(!mode.projecting());
    assert_eq!(mode.tool(), VectorTool::Pen, "tool survives");

    // The next placements start a disconnected subpath in the same node.
    pen_click(&mut mode, &mut editor, [200.0, 50.0]);
    pen_click(&mut mode, &mut editor, [250.0, 50.0]);
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.vertices.len(), 4);
    assert_eq!(net.segments.len(), 2, "no segment bridges the subpaths");
}

// -- VEC-5 ---------------------------------------------------------------------

#[test]
fn vec_5_closing_click_concludes() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    pen_click(&mut mode, &mut editor, [0.0, 0.0]); // adopt the lone vertex
    pen_click(&mut mode, &mut editor, [100.0, 0.0]);
    pen_click(&mut mode, &mut editor, [100.0, 100.0]);
    assert!(mode.projecting());

    // Click the subpath's start: the loop closes and the pen concludes.
    pen_click(&mut mode, &mut editor, [0.0, 0.0]);
    assert!(!mode.projecting(), "concluded (VEC-5)");
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.vertices.len(), 3);
    assert_eq!(net.segments.len(), 3, "the closing segment exists");
}

#[test]
fn vec_5_keep_projecting_moves_the_origin_instead() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    pen_click(&mut mode, &mut editor, [0.0, 0.0]);
    pen_click(&mut mode, &mut editor, [100.0, 0.0]);
    pen_click(&mut mode, &mut editor, [100.0, 100.0]);
    pen_click_keep(&mut mode, &mut editor, [0.0, 0.0]);

    assert!(mode.projecting(), "keep-projecting: drawing continues");
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments.len(), 3);
    // The origin moved to the landing vertex (index 0).
    assert_eq!(mode.pen_preview().map(|(v, _)| v), Some(0));
}

// -- VEC-8 ---------------------------------------------------------------------

#[test]
fn vec_8_pen_lands_on_vertex_within_threshold_not_its_segment() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    // Start a fresh subpath above, then land 3 px from vertex 1 — on
    // the segment's body, inside both thresholds: the vertex wins.
    pen_click(&mut mode, &mut editor, [50.0, 80.0]);
    pen_click(&mut mode, &mut editor, [97.0, 0.0]);

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.vertices.len(), 3, "no split vertex was created");
    assert_eq!(net.segments.len(), 2);
    let connecting = &net.segments[1];
    assert_eq!(
        (connecting.a, connecting.b),
        (2, 1),
        "connected to vertex 1"
    );
}

// -- VEC-9 ---------------------------------------------------------------------

#[test]
fn vec_9_delete_selected_vertex_removes_incident_segments() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]);
    let mut mode = enter(&editor);
    let history_before = editor.history_len();

    // Select the middle vertex (degree 2) and delete.
    click(&mut mode, &mut editor, [50.0, 0.0]);
    assert!(mode.selection().vertices.contains(&1));
    assert!(mode.delete(&mut editor));

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.vertices.len(), 2);
    assert_eq!(
        net.segments.len(),
        0,
        "both incident segments removed, none bridged"
    );
    assert_eq!(
        editor.history_len(),
        history_before + 1,
        "one entry (VEC-11)"
    );
}

// -- VEC-11 --------------------------------------------------------------------

#[test]
fn vec_11_one_entry_per_placement() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    let history_before = editor.history_len();
    pen_click(&mut mode, &mut editor, [0.0, 0.0]); // adopt: no mutation, no entry
    assert_eq!(editor.history_len(), history_before);
    pen_click(&mut mode, &mut editor, [100.0, 0.0]);
    assert_eq!(editor.history_len(), history_before + 1);
    pen_click(&mut mode, &mut editor, [100.0, 100.0]);
    assert_eq!(editor.history_len(), history_before + 2);
}

#[test]
fn vec_11_mid_gesture_abort_restores_exactly() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);
    pen_click(&mut mode, &mut editor, [0.0, 0.0]); // adopt the end

    let baseline = editor.document().clone();
    let history_before = editor.history_len();

    // Press places topology (down), Escape aborts before release.
    mode.pointer_down(&mut editor, [200.0, 0.0], [200.0, 0.0], 1.0, 0, mods());
    assert_eq!(mode.escape(&mut editor), EscapeStep::AbortedGesture);

    assert!(editor.document().structure_eq(&baseline));
    assert_eq!(editor.history_len(), history_before);
}

// -- VEC-12 --------------------------------------------------------------------

#[test]
fn vec_12_hover_is_exclusive() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);

    mode.pointer_move(&mut editor, [2.0, 1.0], [2.0, 1.0], 1.0, mods());
    assert_eq!(mode.hovered(), Some(Control::Vertex(0)));

    mode.pointer_move(&mut editor, [50.0, 4.0], [50.0, 4.0], 1.0, mods());
    assert_eq!(mode.hovered(), Some(Control::Segment(0)));

    mode.pointer_move(&mut editor, [50.0, 60.0], [50.0, 60.0], 1.0, mods());
    assert_eq!(mode.hovered(), None);
}

// -- escape ladder shape (the machine's rungs; MODE-10's total ladder is
//    asserted in mode_contracts) ------------------------------------------------

#[test]
fn escape_steps_one_rung_per_press() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);
    pen_click(&mut mode, &mut editor, [0.0, 0.0]); // projecting

    assert_eq!(mode.escape(&mut editor), EscapeStep::Disconnected);
    assert_eq!(mode.escape(&mut editor), EscapeStep::ToolReverted);
    assert_eq!(mode.escape(&mut editor), EscapeStep::ExitRequested);
}

// -- the pen's drag half (VEC-7 and friends) --------------------------------------

/// Drag with the pen from `from` to `to` (down mutates, drag shapes,
/// up commits).
fn pen_drag(mode: &mut VectorMode, editor: &mut Editor, from: [f32; 2], to: [f32; 2]) {
    mode.pointer_down(editor, from, from, 1.0, 0, mods());
    mode.pointer_move(editor, to, to, 1.0, mods());
    mode.pointer_up(editor, to);
}

fn drag_with(mode: &mut VectorMode, editor: &mut Editor, from: [f32; 2], to: [f32; 2], m: VecMods) {
    mode.pointer_down(editor, from, from, 1.0, 0, m);
    mode.pointer_move(editor, to, to, 1.0, m);
    mode.pointer_up(editor, to);
}

#[test]
fn vec_7_placement_drag_mirrors_into_pending_tangent() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    pen_click(&mut mode, &mut editor, [0.0, 0.0]); // adopt
    // Placement with a drag: the completed segment's end tangent is
    // shaped and mirrored into the pending tangent.
    pen_drag(&mut mode, &mut editor, [100.0, 0.0], [120.0, 30.0]);

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments[0].tb, (-20.0, -30.0));
    assert_eq!(mode.pen_preview().map(|(_, t)| t), Some((20.0, 30.0)));

    // The next placed segment departs collinearly (VEC-7): its origin
    // tangent is exactly the mirrored pending tangent.
    pen_click(&mut mode, &mut editor, [200.0, 0.0]);
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments[1].ta, (20.0, 30.0));
}

#[test]
fn pen_can_start_with_a_drag_pre_tangent() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    // Adopt-and-drag: the pending tangent accumulates before any
    // segment exists; the document is untouched by the drag itself.
    let history_before = editor.history_len();
    pen_drag(&mut mode, &mut editor, [0.0, 0.0], [30.0, 20.0]);
    assert_eq!(
        editor.history_len(),
        history_before,
        "pre-tangent is machine state"
    );
    assert_eq!(mode.pen_preview().map(|(_, t)| t), Some((30.0, 20.0)));

    // The first segment leaves the first vertex already curved.
    pen_click(&mut mode, &mut editor, [100.0, 0.0]);
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments[0].ta, (30.0, 20.0));
}

#[test]
fn close_with_drag_shapes_the_closing_segment() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);

    pen_click(&mut mode, &mut editor, [0.0, 0.0]);
    pen_click(&mut mode, &mut editor, [100.0, 0.0]);
    pen_click(&mut mode, &mut editor, [100.0, 100.0]);
    // Close with a drag: the pen concludes, but the drag still shapes
    // the closing segment's end tangent.
    pen_drag(&mut mode, &mut editor, [0.0, 0.0], [-30.0, 20.0]);

    assert!(!mode.projecting(), "concluded");
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments.len(), 3);
    assert_eq!(net.segments[2].tb, (30.0, -20.0));
}

#[test]
fn vec_11_drag_placement_is_one_entry() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0)]);
    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);
    pen_click(&mut mode, &mut editor, [0.0, 0.0]);

    let history_before = editor.history_len();
    pen_drag(&mut mode, &mut editor, [100.0, 0.0], [130.0, 40.0]);
    assert_eq!(editor.history_len(), history_before + 1);
}

// -- VEC-6 end-to-end: the pen's split case ---------------------------------------

#[test]
fn vec_6_pen_split_preserves_world_shape() {
    use grida::vectornetwork::{VectorNetwork, VectorNetworkSegment};
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    let network = VectorNetwork {
        vertices: vec![(0.0, 0.0), (100.0, 0.0)],
        segments: vec![VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: (25.0, 60.0),
            tb: (-25.0, 60.0),
        }],
        regions: Vec::new(),
    };
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(vector_fragment(
                    VEC.to_string(),
                    "Curve",
                    [0.0, 0.0],
                    network,
                )),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    // Dense world-space samples before the split.
    let world = |editor: &Editor, seg: usize, t: f32| -> (f32, f32) {
        let net = editor.node_vector_network(&VEC.to_string()).unwrap();
        let cubic = grida_editor::vector::ops::segment_cubic(&net, seg).unwrap();
        let p = math2::bezier::evaluate(&cubic, t);
        let (px, py) = editor.node_position(&VEC.to_string()).unwrap();
        (px + p[0], py + p[1])
    };
    let before: Vec<(f32, f32)> = (0..=16)
        .map(|i| world(&editor, 0, i as f32 / 16.0))
        .collect();

    let mut mode = enter(&editor);
    mode.set_tool(VectorTool::Pen);
    // Click on the curve's body (apex region, > 5 px from both
    // vertices, < 10 px from the curve): the pen splits it.
    pen_click(&mut mode, &mut editor, [50.0, 44.0]);
    mode.escape(&mut editor); // disconnect: we only wanted the split

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments.len(), 2, "split into two");
    assert_eq!(net.vertices.len(), 3);

    // Shape identity in world space (the refit may have re-anchored
    // the locals; the geometry itself must be pixel-identical).
    let split_t = {
        // Recover the split parameter from the split vertex's position.
        let mut best = (0.0f32, f32::INFINITY);
        let v = net.vertices[2];
        let (px, py) = editor.node_position(&VEC.to_string()).unwrap();
        let world_v = (px + v.0, py + v.1);
        for i in 0..=200 {
            let t = i as f32 / 200.0;
            // Linear interpolation over the dense pre-split samples.
            let ft = t * 16.0;
            let lo = ft.floor() as usize;
            let hi = (lo + 1).min(16);
            let frac = ft - lo as f32;
            let on_curve = (
                before[lo].0 + (before[hi].0 - before[lo].0) * frac,
                before[lo].1 + (before[hi].1 - before[lo].1) * frac,
            );
            let d = (on_curve.0 - world_v.0).powi(2) + (on_curve.1 - world_v.1).powi(2);
            if d < best.1 {
                best = (t, d);
            }
        }
        best.0
    };
    for (i, expected) in before.iter().enumerate() {
        let u = i as f32 / 16.0;
        let actual = if u <= split_t {
            world(&editor, 0, u / split_t)
        } else {
            world(&editor, 1, (u - split_t) / (1.0 - split_t))
        };
        assert!(
            (actual.0 - expected.0).abs() < 0.5 && (actual.1 - expected.1).abs() < 0.5,
            "u={u}: {expected:?} vs {actual:?}"
        );
    }
}

// -- VEC-10 end-to-end: tangent-knob drags ----------------------------------------

use grida_editor::vector::ops::Mirroring;

fn editor_with_smooth_join() -> Editor {
    use grida::vectornetwork::{VectorNetwork, VectorNetworkSegment};
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    let network = VectorNetwork {
        vertices: vec![(0.0, 0.0), (100.0, 0.0), (200.0, 0.0)],
        segments: vec![
            VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: (0.0, 0.0),
                tb: (-10.0, -10.0),
            },
            VectorNetworkSegment {
                a: 1,
                b: 2,
                ta: (10.0, 10.0),
                tb: (0.0, 0.0),
            },
        ],
        regions: Vec::new(),
    };
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(vector_fragment(
                    VEC.to_string(),
                    "Join",
                    [0.0, 0.0],
                    network,
                )),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
    editor
}

#[test]
fn vec_10_knob_drag_all_mirrors_exact_negation() {
    let mut editor = editor_with_smooth_join();
    let mut mode = enter(&editor);

    // Select the joint vertex: its knobs become visible (and hittable).
    click(&mut mode, &mut editor, [100.0, 0.0]);
    // The seg1.ta knob sits at vertex + tangent = (110, 10). Drag it.
    drag_with(
        &mut mode,
        &mut editor,
        [110.0, 10.0],
        [140.0, 40.0],
        VecMods {
            mirroring: Mirroring::All,
            ..Default::default()
        },
    );

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments[1].ta, (40.0, 40.0));
    assert_eq!(
        net.segments[0].tb,
        (-40.0, -40.0),
        "exact negation (VEC-10 all)"
    );
}

#[test]
fn vec_10_knob_drag_none_leaves_opposite() {
    let mut editor = editor_with_smooth_join();
    let mut mode = enter(&editor);
    click(&mut mode, &mut editor, [100.0, 0.0]);
    drag_with(
        &mut mode,
        &mut editor,
        [110.0, 10.0],
        [140.0, 40.0],
        VecMods {
            mirroring: Mirroring::None,
            ..Default::default()
        },
    );

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments[1].ta, (40.0, 40.0));
    assert_eq!(
        net.segments[0].tb,
        (-10.0, -10.0),
        "untouched (VEC-10 none)"
    );
}

// -- bend ---------------------------------------------------------------------------

#[test]
fn segment_drag_translates_never_bends() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    let history_before = editor.history_len();

    // A plain drag on the segment's body moves the segment — both
    // endpoints ride the translate; the curve never deforms.
    drag(&mut mode, &mut editor, [50.0, 2.0], [50.0, 40.0]);

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments.len(), 1);
    assert_eq!(net.segments[0].ta, (0.0, 0.0), "still straight");
    assert_eq!(net.segments[0].tb, (0.0, 0.0), "still straight");
    // World positions: both endpoints moved by the drag delta
    // (locals re-anchor at the refit; position carries the move).
    let (px, py) = editor.node_position(&VEC.to_string()).unwrap();
    let w0 = (px + net.vertices[0].0, py + net.vertices[0].1);
    let w1 = (px + net.vertices[1].0, py + net.vertices[1].1);
    assert!(
        (w0.0 - 0.0).abs() < 1e-3 && (w0.1 - 38.0).abs() < 1e-3,
        "{w0:?}"
    );
    assert!(
        (w1.0 - 100.0).abs() < 1e-3 && (w1.1 - 38.0).abs() < 1e-3,
        "{w1:?}"
    );
    assert_eq!(editor.history_len(), history_before + 1, "one entry");
}

#[test]
fn bend_segment_drag_deforms_through_grab_point() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    let history_before = editor.history_len();

    // Under the bend hold, grabbing the straight segment's midpoint
    // body and pulling deforms the curve through the grab point.
    let bend = VecMods {
        bend: true,
        ..Default::default()
    };
    drag_with(&mut mode, &mut editor, [50.0, 2.0], [50.0, 40.0], bend);

    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments.len(), 1, "bend, not split/translate");
    let cubic = grida_editor::vector::ops::segment_cubic(&net, 0).unwrap();
    let mid = math2::bezier::evaluate(&cubic, 0.5);
    let (px, py) = editor.node_position(&VEC.to_string()).unwrap();
    let world_mid = (px + mid[0], py + mid[1]);
    assert!(
        (world_mid.0 - 50.0).abs() < 2.0 && (world_mid.1 - 40.0).abs() < 2.0,
        "curve passes through the grab target: {world_mid:?}"
    );
    // A straight segment became curved: tangents left zero.
    assert_ne!(cubic.ta, [0.0, 0.0]);
    assert_eq!(editor.history_len(), history_before + 1, "one entry");
}

#[test]
fn bend_click_toggles_corner_and_smooth() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)]);
    let mut mode = enter(&editor);
    let bend = VecMods {
        bend: true,
        ..Default::default()
    };

    // Corner → smooth.
    mode.pointer_down(&mut editor, [100.0, 0.0], [100.0, 0.0], 1.0, 0, bend);
    mode.pointer_up(&mut editor, [100.0, 0.0]);
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    let (tb, ta) = (net.segments[0].tb, net.segments[1].ta);
    assert_ne!(tb, (0.0, 0.0));
    assert_ne!(ta, (0.0, 0.0));
    // Smooth: collinear and opposite.
    assert!((tb.0 + ta.0).abs() < 1e-4 && (tb.1 + ta.1).abs() < 1e-4);

    // Smooth → corner. The refit may have shifted locals; hit the
    // vertex at its current world position.
    let joint = {
        let net = editor.node_vector_network(&VEC.to_string()).unwrap();
        let (px, py) = editor.node_position(&VEC.to_string()).unwrap();
        [px + net.vertices[1].0, py + net.vertices[1].1]
    };
    mode.pointer_down(&mut editor, joint, joint, 1.0, 0, bend);
    mode.pointer_up(&mut editor, joint);
    let net = editor.node_vector_network(&VEC.to_string()).unwrap();
    assert_eq!(net.segments[0].tb, (0.0, 0.0));
    assert_eq!(net.segments[1].ta, (0.0, 0.0));
}

// -- VEC-13 --------------------------------------------------------------------

#[test]
fn vec_13_double_click_on_empty_exits() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    let empty = [60.0, 70.0];

    // First empty click: no exit.
    let out = mode.pointer_down(&mut editor, empty, empty, 1.0, 0, mods());
    assert!(!out.exit_requested);
    mode.pointer_up(&mut editor, empty);

    // Second within the click window and distance: the exit request.
    let out = mode.pointer_down(&mut editor, empty, empty, 1.0, 120, mods());
    assert!(out.exit_requested);

    // The exit runs the full lifecycle (untouched → identity, VEC-1).
    let out = mode.exit(&mut editor);
    assert!(!out.deleted);
}

#[test]
fn vec_13_double_click_on_geometry_stays() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    let vertex = [0.0, 0.0];

    // Two rapid clicks on a vertex: selection, never an exit.
    let out = mode.pointer_down(&mut editor, vertex, vertex, 1.0, 0, mods());
    assert!(!out.exit_requested);
    mode.pointer_up(&mut editor, vertex);
    let out = mode.pointer_down(&mut editor, vertex, vertex, 1.0, 120, mods());
    assert!(!out.exit_requested);
    mode.pointer_up(&mut editor, vertex);
    assert!(mode.selection().vertices.contains(&0));

    // Two empty clicks far apart in time: no exit either.
    let empty = [60.0, 70.0];
    let out = mode.pointer_down(&mut editor, empty, empty, 1.0, 1000, mods());
    assert!(!out.exit_requested);
    mode.pointer_up(&mut editor, empty);
    let out = mode.pointer_down(&mut editor, empty, empty, 1.0, 5000, mods());
    assert!(!out.exit_requested);
}

// ── VEC-12: hover is an idle affordance ──────────────────────────────

// The halfpoint projection clears the moment a segment drag promotes,
// stays cleared through the drag, and re-resolves against the landed
// geometry on release — never anchored to pre-gesture geometry.
#[test]
fn vec_12_projection_clears_during_drag_and_rederives_on_release() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);

    // Hover the segment body: the insertion affordance arms.
    mode.pointer_move(&mut editor, [50.0, 4.0], [50.0, 4.0], 1.0, mods());
    assert!(matches!(mode.hovered(), Some(Control::Segment(0))));
    assert!(
        mode.projection().is_some(),
        "hovering the body arms the halfpoint"
    );

    // Press on the body and drag past the threshold: the gesture
    // captures the pointer — the halfpoint hides and stays hidden.
    mode.pointer_down(&mut editor, [50.0, 4.0], [50.0, 4.0], 1.0, 0, mods());
    mode.pointer_move(&mut editor, [50.0, 30.0], [50.0, 30.0], 1.0, mods());
    assert_eq!(
        mode.projection(),
        None,
        "the halfpoint hides when the drag promotes"
    );
    assert_eq!(mode.hovered(), None);
    mode.pointer_move(&mut editor, [60.0, 40.0], [60.0, 40.0], 1.0, mods());
    assert_eq!(mode.projection(), None, "…and stays hidden while dragging");

    // Release on the dragged segment: hover re-resolves against the
    // geometry as it landed (the refit re-anchored the node to
    // (10, 36); the release point projects onto the moved body).
    mode.pointer_up(&mut editor, [60.0, 40.0]);
    assert!(
        matches!(mode.hovered(), Some(Control::Segment(0))),
        "release re-resolves hover on the landed segment"
    );
    let landed = mode
        .projection()
        .expect("release re-arms the halfpoint on the landed geometry");
    assert!(
        (landed.0 - 50.0).abs() < 1.0 && landed.1.abs() < 1e-3,
        "node-local projection sits on the landed body, got {landed:?}"
    );
}

// The bend gesture is a capture too: the halfpoint hides while the
// body deforms under the hold.
#[test]
fn vec_12_projection_clears_during_bend_drag() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);
    let bend = VecMods {
        bend: true,
        ..Default::default()
    };
    mode.pointer_move(&mut editor, [50.0, 4.0], [50.0, 4.0], 1.0, mods());
    assert!(mode.projection().is_some());
    mode.pointer_down(&mut editor, [50.0, 4.0], [50.0, 4.0], 1.0, 0, bend);
    mode.pointer_move(&mut editor, [50.0, 30.0], [50.0, 30.0], 1.0, bend);
    assert_eq!(
        mode.projection(),
        None,
        "the bend gesture hides the halfpoint"
    );
    assert_eq!(mode.hovered(), None);
    mode.pointer_up(&mut editor, [50.0, 30.0]);
}

// Keyboard mutations that move geometry out from under the resting
// pointer drop the stale hover pair (the next pointer move
// re-resolves).
#[test]
fn keyboard_mutations_drop_the_stale_hover_pair() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0)]);
    let mut mode = enter(&editor);

    // Click the body: selects the segment, and the release leaves it
    // hovered with the halfpoint armed.
    click(&mut mode, &mut editor, [50.0, 4.0]);
    assert!(mode.projection().is_some());

    // Nudge: the geometry moves; the pair drops rather than point at
    // the old position.
    assert!(mode.nudge(&mut editor, 10.0, 0.0));
    assert_eq!(mode.hovered(), None);
    assert_eq!(mode.projection(), None);

    // Re-hover the moved body, then delete the sub-selection: the
    // hovered geometry is gone — the pair drops with it.
    mode.pointer_move(&mut editor, [60.0, 4.0], [60.0, 4.0], 1.0, mods());
    assert!(mode.projection().is_some());
    assert!(mode.delete(&mut editor));
    assert_eq!(mode.hovered(), None);
    assert_eq!(mode.projection(), None);
}

// -- VEC-14: live marquee ----------------------------------------------------------

#[test]
fn vec_14_marquee_selects_live_and_shrinking_unselects() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)]);
    let mut mode = enter(&editor);

    // Press on empty space and sweep over the corner vertex: the
    // sub-selection tracks the rect before any release.
    mode.pointer_down(&mut editor, [30.0, -40.0], [30.0, -40.0], 1.0, 0, mods());
    mode.pointer_move(&mut editor, [120.0, 10.0], [120.0, 10.0], 1.0, mods());
    assert!(mode.selection().vertices.contains(&1));
    assert!(!mode.selection().vertices.contains(&2));
    assert!(mode.selection().segments.is_empty());

    // Grow the sweep over the second segment and its far vertex.
    mode.pointer_move(&mut editor, [120.0, 120.0], [120.0, 120.0], 1.0, mods());
    assert!(mode.selection().vertices.contains(&2));
    assert!(mode.selection().segments.contains(&1));

    // Shrink back: the swept-out controls un-select again.
    mode.pointer_move(&mut editor, [120.0, 10.0], [120.0, 10.0], 1.0, mods());
    assert!(!mode.selection().vertices.contains(&2));
    assert!(mode.selection().segments.is_empty());

    // Release lands what the sweep shows — nothing more.
    mode.pointer_up(&mut editor, [120.0, 10.0]);
    assert!(mode.selection().vertices.contains(&1));
    assert!(!mode.selection().vertices.contains(&2));
}

#[test]
fn vec_14_marquee_abort_restores_sweep_start_selection() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)]);
    let mut mode = enter(&editor);

    // Establish a selection, then sweep (non-additive) over the rest.
    click(&mut mode, &mut editor, [0.0, 0.0]);
    assert!(mode.selection().vertices.contains(&0));
    mode.pointer_down(&mut editor, [30.0, -40.0], [30.0, -40.0], 1.0, 0, mods());
    mode.pointer_move(&mut editor, [120.0, 120.0], [120.0, 120.0], 1.0, mods());
    assert!(!mode.selection().vertices.contains(&0));
    assert!(mode.selection().vertices.contains(&1));

    // The abort restores the sweep-start selection exactly.
    assert_eq!(mode.escape(&mut editor), EscapeStep::AbortedGesture);
    assert_eq!(
        mode.selection()
            .vertices
            .iter()
            .copied()
            .collect::<Vec<_>>(),
        vec![0]
    );
    assert!(mode.selection().segments.is_empty());
}

#[test]
fn vec_14_additive_marquee_unions_against_sweep_start() {
    let mut editor = editor_with_vector([0.0, 0.0], &[(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)]);
    let mut mode = enter(&editor);
    let shift = VecMods {
        shift: true,
        ..Default::default()
    };

    // Select the near vertex, then shift-sweep over the far corner.
    click(&mut mode, &mut editor, [0.0, 0.0]);
    mode.pointer_down(&mut editor, [30.0, -40.0], [30.0, -40.0], 1.0, 0, shift);
    mode.pointer_move(&mut editor, [120.0, 120.0], [120.0, 120.0], 1.0, shift);
    assert!(mode.selection().vertices.contains(&0), "base survives");
    assert!(mode.selection().vertices.contains(&2));

    // Shrinking removes only what the sweep no longer covers — the
    // union base is the sweep-START selection, not the last frame.
    mode.pointer_move(&mut editor, [120.0, 10.0], [120.0, 10.0], 1.0, shift);
    assert!(mode.selection().vertices.contains(&0));
    assert!(mode.selection().vertices.contains(&1));
    assert!(!mode.selection().vertices.contains(&2));

    mode.pointer_up(&mut editor, [120.0, 10.0]);
    assert_eq!(mode.selection().vertices.len(), 2);
}
