//! `TOOL-*` conformance tests for `docs/wg/canvas/tool.md`.
//!
//! Headless: the machine is driven with synthetic canvas/screen points
//! (identity camera, so canvas == screen) and asserted against editor
//! queries and history — no renderer anywhere.

use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::tool::{CLICK_INSERT_SIZE, DRAG_THRESHOLD_PX, ShapeKind, Tool, ToolMachine};

/// An empty document under a fresh editor.
fn empty_editor() -> Editor {
    Editor::new(WorkingCopy::new_empty("tool-fixture"))
}

/// An editor seeded with rectangles at explicit rects.
fn editor_with_rects(rects: &[(&str, f32, f32, f32, f32)]) -> Editor {
    let factory = NodeFactory::new();
    let mut wc = WorkingCopy::new_empty("tool-fixture");
    let batch: Vec<Mutation> = rects
        .iter()
        .enumerate()
        .map(|(i, (id, x, y, w, h))| {
            let mut rect = factory.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(*x, *y, 0.0);
            rect.size = grida::node::schema::Size {
                width: *w,
                height: *h,
            };
            Mutation::Insert {
                parent: None,
                index: i,
                fragment: Box::new(Fragment {
                    id: id.to_string(),
                    name: None,
                    node: Node::Rectangle(rect),
                    children: vec![],
                }),
            }
        })
        .collect();
    wc.apply(&batch).unwrap();
    Editor::new(wc)
}

/// Drive a full drag from `from` to `to` (down, threshold-crossing
/// moves, up), collecting whether anything structural happened.
fn drag(machine: &mut ToolMachine, editor: &mut Editor, from: [f32; 2], to: [f32; 2]) {
    machine.pointer_down(editor, from, from);
    // One mid-point move plus the endpoint, so previews run.
    let mid = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
    machine.pointer_move(editor, mid, mid);
    machine.pointer_move(editor, to, to);
    machine.pointer_up(editor, to);
}

fn click(machine: &mut ToolMachine, editor: &mut Editor, at: [f32; 2]) {
    machine.pointer_down(editor, at, at);
    machine.pointer_up(editor, at);
}

// -- TOOL-1 / TOOL-2 ---------------------------------------------------------

#[test]
fn tool_1_default_cursor_and_closed_activation() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    assert_eq!(machine.tool(), Tool::Cursor);
    assert!(!machine.wants_pointer());

    machine.set_tool(Tool::Shape(ShapeKind::Rectangle));
    assert_eq!(machine.tool(), Tool::Shape(ShapeKind::Rectangle));
    assert!(machine.wants_pointer());
    // Activation had no document effect.
    assert!(editor.children(None).is_empty());
    assert_eq!(editor.history_len(), 0);
    let _ = &mut editor;
}

#[test]
fn tool_2_tool_state_never_records() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    for tool in [
        Tool::Shape(ShapeKind::Ellipse),
        Tool::Container { tray: true },
        Tool::Pencil,
        Tool::Cursor,
    ] {
        machine.set_tool(tool);
    }
    assert_eq!(editor.history_len(), 0);
    assert!(editor.children(None).is_empty());
    let _ = &mut editor;
}

// -- TOOL-3 -------------------------------------------------------------------

#[test]
fn tool_3_click_insert_default_size_centered_one_entry() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Shape(ShapeKind::Rectangle));

    let out = {
        machine.pointer_down(&mut editor, [200.0, 300.0], [200.0, 300.0]);
        machine.pointer_up(&mut editor, [200.0, 300.0])
    };
    assert!(out.committed);
    let ids = editor.children(None);
    assert_eq!(ids.len(), 1);
    let id = &ids[0];
    assert_eq!(out.select.as_deref(), Some(std::slice::from_ref(id)));
    assert_eq!(
        editor.node_position(id),
        Some((
            200.0 - CLICK_INSERT_SIZE / 2.0,
            300.0 - CLICK_INSERT_SIZE / 2.0
        ))
    );
    assert_eq!(
        editor.node_size(id),
        Some((CLICK_INSERT_SIZE, CLICK_INSERT_SIZE))
    );
    assert_eq!(editor.history_len(), 1);

    // A single undo removes the node entirely.
    assert!(editor.undo());
    assert!(editor.children(None).is_empty());
}

#[test]
fn tool_3_drag_insert_anchor_rect_one_entry() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Shape(ShapeKind::Ellipse));

    // Drag up-left too: rect must normalize.
    drag(&mut machine, &mut editor, [400.0, 400.0], [250.0, 320.0]);

    let ids = editor.children(None);
    assert_eq!(ids.len(), 1);
    assert_eq!(editor.node_position(&ids[0]), Some((250.0, 320.0)));
    assert_eq!(editor.node_size(&ids[0]), Some((150.0, 80.0)));
    assert_eq!(editor.history_len(), 1, "TOOL-3: exactly one entry");

    assert!(editor.undo());
    assert!(editor.children(None).is_empty());
    assert!(editor.redo());
    assert_eq!(editor.children(None).len(), 1);
}

#[test]
fn drag_entry_is_endpoint_minimal() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Shape(ShapeKind::Rectangle));

    machine.pointer_down(&mut editor, [0.0, 0.0], [0.0, 0.0]);
    for i in 1..40 {
        let p = [i as f32 * 10.0, i as f32 * 5.0];
        machine.pointer_move(&mut editor, p, p);
    }
    machine.pointer_up(&mut editor, [390.0, 195.0]);

    let entry = editor.history().peek().expect("one entry");
    assert!(
        entry.redo.len() <= 2,
        "endpoint-minimal redo (insert + one patch), got {}",
        entry.redo.len()
    );
    assert!(
        entry.undo.len() <= 2,
        "endpoint-minimal undo, got {}",
        entry.undo.len()
    );
}

// -- TOOL-4 -------------------------------------------------------------------

#[test]
fn tool_4_escape_aborts_drag_without_trace() {
    let mut editor = editor_with_rects(&[("a", 10.0, 10.0, 50.0, 50.0)]);
    let before = editor.document().clone();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Shape(ShapeKind::Rectangle));

    machine.pointer_down(&mut editor, [100.0, 100.0], [100.0, 100.0]);
    machine.pointer_move(&mut editor, [220.0, 180.0], [220.0, 180.0]);
    let out = machine.escape(&mut editor).expect("escape handled");
    assert!(out.reverted);

    assert!(editor.document().structure_eq(&before), "TOOL-4: no trace");
    assert_eq!(editor.history_len(), 0);
    // The tool survives the abort (armed for another try).
    assert_eq!(machine.tool(), Tool::Shape(ShapeKind::Rectangle));
}

// -- TOOL-5 -------------------------------------------------------------------

#[test]
fn tool_5_container_drag_adopts_contained_siblings() {
    // `inside` is fully within the drawn rect; `outside` is not.
    let mut editor = editor_with_rects(&[
        ("inside", 120.0, 120.0, 40.0, 40.0),
        ("outside", 400.0, 400.0, 50.0, 50.0),
    ]);
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Container { tray: false });

    drag(&mut machine, &mut editor, [100.0, 100.0], [300.0, 300.0]);

    let roots = editor.children(None);
    assert_eq!(roots.len(), 2, "outside + container at root");
    let container = roots
        .iter()
        .find(|id| editor.document().node_is_container(id) == Some(true))
        .expect("container inserted")
        .clone();
    assert_eq!(
        editor.children(Some(&container)),
        vec!["inside".to_string()]
    );
    // World position preserved: container at (100,100), child local
    // (20,20) == world (120,120).
    assert_eq!(editor.node_position(&container), Some((100.0, 100.0)));
    assert_eq!(
        editor.node_position(&"inside".to_string()),
        Some((20.0, 20.0))
    );
    assert_eq!(
        editor.node_position(&"outside".to_string()),
        Some((400.0, 400.0))
    );
    assert_eq!(editor.history_len(), 1, "insert + adoption are one entry");

    // One undo restores parent, order, and positions.
    assert!(editor.undo());
    assert_eq!(
        editor.children(None),
        vec!["inside".to_string(), "outside".to_string()]
    );
    assert_eq!(
        editor.node_position(&"inside".to_string()),
        Some((120.0, 120.0))
    );
}

#[test]
fn tool_5_click_container_adopts_nothing() {
    let mut editor = editor_with_rects(&[("a", 10.0, 10.0, 20.0, 20.0)]);
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Container { tray: false });

    // Click centered on `a`, so `a` is inside the would-be rect — but
    // click inserts adopt nothing.
    click(&mut machine, &mut editor, [20.0, 20.0]);
    let roots = editor.children(None);
    assert_eq!(roots.len(), 2);
    let container = roots
        .iter()
        .find(|id| editor.document().node_is_container(id) == Some(true))
        .unwrap()
        .clone();
    assert!(editor.children(Some(&container)).is_empty());
}

#[test]
fn tool_5_tray_adopts_too() {
    let mut editor = editor_with_rects(&[("inside", 50.0, 50.0, 10.0, 10.0)]);
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Container { tray: true });
    drag(&mut machine, &mut editor, [0.0, 0.0], [200.0, 200.0]);
    let roots = editor.children(None);
    assert_eq!(roots.len(), 1);
    assert_eq!(editor.children(Some(&roots[0])), vec!["inside".to_string()]);
}

// -- TOOL-6 -------------------------------------------------------------------

#[test]
fn tool_6_text_click_insert_session_commit_is_one_entry() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Text);

    let out = {
        machine.pointer_down(&mut editor, [50.0, 60.0], [50.0, 60.0]);
        machine.pointer_up(&mut editor, [50.0, 60.0])
    };
    let id = out.enter_text_edit.expect("edit session entered");
    assert!(machine.in_text_session());
    assert_eq!(editor.history_len(), 0, "nothing recorded during session");

    let out = machine.finish_text(&mut editor, Some("hello".to_string()));
    assert!(out.committed);
    assert_eq!(editor.node_text(&id).as_deref(), Some("hello"));
    assert_eq!(editor.history_len(), 1, "TOOL-6: one entry");
    assert_eq!(machine.tool(), Tool::Cursor, "TOOL-8 revert");

    assert!(editor.undo());
    assert!(editor.children(None).is_empty(), "undo removes node + text");
}

#[test]
fn tool_6_empty_fresh_text_leaves_no_trace() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Text);

    click(&mut machine, &mut editor, [50.0, 60.0]);
    let out = machine.finish_text(&mut editor, None);
    assert!(out.reverted);
    assert!(editor.children(None).is_empty(), "no node");
    assert_eq!(editor.history_len(), 0, "no entry");
}

#[test]
fn tool_6_existing_text_edit_commits_one_entry() {
    let mut editor = empty_editor();
    // Seed a text node through the tool itself.
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Text);
    click(&mut machine, &mut editor, [0.0, 0.0]);
    let id = editor.children(None)[0].clone();
    machine.finish_text(&mut editor, Some("first".to_string()));
    assert_eq!(editor.history_len(), 1);

    machine.begin_text_edit_existing(&mut editor, id.clone());
    let out = machine.finish_text(&mut editor, Some("second".to_string()));
    assert!(out.committed);
    assert_eq!(editor.node_text(&id).as_deref(), Some("second"));
    assert_eq!(editor.history_len(), 2);
    assert!(editor.undo());
    assert_eq!(editor.node_text(&id).as_deref(), Some("first"));
}

#[test]
fn tool_6_unmodified_existing_edit_records_nothing() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Text);
    click(&mut machine, &mut editor, [0.0, 0.0]);
    let id = editor.children(None)[0].clone();
    machine.finish_text(&mut editor, Some("kept".to_string()));

    machine.begin_text_edit_existing(&mut editor, id.clone());
    machine.finish_text(&mut editor, None);
    assert_eq!(editor.history_len(), 1, "no-op edit records nothing");
    assert_eq!(editor.node_text(&id).as_deref(), Some("kept"));
}

// -- TOOL-7 -------------------------------------------------------------------

#[test]
fn tool_7_draw_tools_click_inserts_nothing() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    for tool in [
        Tool::Pencil,
        Tool::Line { arrow: false },
        Tool::Line { arrow: true },
    ] {
        machine.set_tool(tool);
        click(&mut machine, &mut editor, [100.0, 100.0]);
    }
    assert!(editor.children(None).is_empty());
    assert_eq!(editor.history_len(), 0);
}

#[test]
fn pencil_stroke_is_polyline_one_entry() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Pencil);

    machine.pointer_down(&mut editor, [100.0, 100.0], [100.0, 100.0]);
    for p in [[110.0, 100.0], [120.0, 110.0], [130.0, 105.0]] {
        machine.pointer_move(&mut editor, p, p);
    }
    let out = machine.pointer_up(&mut editor, [130.0, 105.0]);
    assert!(out.committed);

    let ids = editor.children(None);
    assert_eq!(ids.len(), 1);
    let points = editor.node_vector_polyline(&ids[0]).expect("polyline");
    assert_eq!(points.first(), Some(&(0.0, 0.0)));
    assert_eq!(points.last(), Some(&(30.0, 5.0)));
    assert!(points.len() >= 3);
    assert_eq!(editor.node_position(&ids[0]), Some((100.0, 100.0)));
    assert_eq!(editor.history_len(), 1);

    // Endpoint-minimal: the entry is insert + one polyline patch.
    let entry = editor.history().peek().unwrap();
    assert!(entry.redo.len() <= 2);

    assert!(editor.undo());
    assert!(editor.children(None).is_empty());
}

// -- TOOL-8 -------------------------------------------------------------------

#[test]
fn tool_8_insert_reverts_to_cursor_pencil_stays() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();

    machine.set_tool(Tool::Shape(ShapeKind::Rectangle));
    click(&mut machine, &mut editor, [10.0, 10.0]);
    assert_eq!(machine.tool(), Tool::Cursor);

    machine.set_tool(Tool::Pencil);
    drag(&mut machine, &mut editor, [0.0, 0.0], [50.0, 50.0]);
    assert_eq!(machine.tool(), Tool::Pencil, "pencil stays active");
}

// -- TOOL-9 -------------------------------------------------------------------

#[test]
fn tool_9_arrow_is_line_with_end_marker() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();

    machine.set_tool(Tool::Line { arrow: false });
    drag(&mut machine, &mut editor, [0.0, 0.0], [100.0, 0.0]);
    machine.set_tool(Tool::Line { arrow: true });
    drag(&mut machine, &mut editor, [0.0, 50.0], [100.0, 150.0]);

    let ids = editor.children(None);
    assert_eq!(ids.len(), 2);
    let line = editor.document().capture(&ids[0]).unwrap();
    let arrow = editor.document().capture(&ids[1]).unwrap();
    let (Node::Line(line), Node::Line(arrow)) = (&line.node, &arrow.node) else {
        panic!("both draw a Line node (TOOL-9)");
    };
    assert!(matches!(
        line.marker_end_shape,
        grida::cg::prelude::StrokeMarkerPreset::None
    ));
    assert!(matches!(
        arrow.marker_end_shape,
        grida::cg::prelude::StrokeMarkerPreset::RightTriangleOpen
    ));

    // Geometry: length ≈ hypot(100, 100), rotation ≈ 45°.
    let len = (100.0_f32 * 100.0 + 100.0 * 100.0).sqrt();
    let (w, _h) = editor.node_size(&ids[1]).unwrap();
    assert!((w - len).abs() < 0.01);
    let rot = editor.node_rotation(&ids[1]).unwrap();
    assert!((rot - std::f32::consts::FRAC_PI_4).abs() < 1e-3);
}

// -- wire round-trip for the new authoring vocabulary --------------------------

#[test]
fn wire_round_trips_text_vector_and_arrow() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();

    machine.set_tool(Tool::Text);
    click(&mut machine, &mut editor, [10.0, 10.0]);
    machine.finish_text(&mut editor, Some("wired".to_string()));

    machine.set_tool(Tool::Pencil);
    drag(&mut machine, &mut editor, [0.0, 0.0], [40.0, 40.0]);

    machine.set_tool(Tool::Line { arrow: true });
    drag(&mut machine, &mut editor, [0.0, 100.0], [50.0, 100.0]);

    let ids = editor.children(None);
    assert_eq!(ids.len(), 3);
    let json = grida_editor::io::copy(&editor, &ids).expect("copy covers authoring kinds");

    let pasted = grida_editor::io::paste(&mut editor, &json, None).expect("paste");
    assert_eq!(pasted.len(), 3);
    assert_eq!(editor.node_text(&pasted[0]).as_deref(), Some("wired"));
    let polyline = editor.node_vector_polyline(&pasted[1]).expect("polyline");
    assert_eq!(polyline.last(), Some(&(40.0, 40.0)));
    let arrow = editor.document().capture(&pasted[2]).unwrap();
    let Node::Line(arrow) = &arrow.node else {
        panic!("line kind survives");
    };
    assert!(matches!(
        arrow.marker_end_shape,
        grida::cg::prelude::StrokeMarkerPreset::RightTriangleOpen
    ));
}

// -- delete (the shell's Backspace path is this dispatch shape) ----------------

#[test]
fn delete_selection_is_one_entry() {
    let mut editor =
        editor_with_rects(&[("a", 0.0, 0.0, 10.0, 10.0), ("b", 20.0, 0.0, 10.0, 10.0)]);
    let batch = vec![
        Mutation::Remove {
            id: "a".to_string(),
        },
        Mutation::Remove {
            id: "b".to_string(),
        },
    ];
    editor
        .dispatch(
            batch,
            Origin::Local,
            Recording::Record {
                label: Some("delete".to_string()),
            },
        )
        .unwrap();
    assert!(editor.children(None).is_empty());
    assert_eq!(editor.history_len(), 1);
    assert!(editor.undo());
    assert_eq!(editor.children(None).len(), 2);
}

// -- threshold ------------------------------------------------------------------

#[test]
fn below_threshold_move_is_still_a_click() {
    let mut editor = empty_editor();
    let mut machine = ToolMachine::new();
    machine.set_tool(Tool::Shape(ShapeKind::Rectangle));

    machine.pointer_down(&mut editor, [100.0, 100.0], [100.0, 100.0]);
    let sub = DRAG_THRESHOLD_PX - 1.0;
    machine.pointer_move(&mut editor, [100.0 + sub, 100.0], [100.0 + sub, 100.0]);
    machine.pointer_up(&mut editor, [100.0 + sub, 100.0]);

    let ids = editor.children(None);
    assert_eq!(ids.len(), 1);
    assert_eq!(
        editor.node_size(&ids[0]),
        Some((CLICK_INSERT_SIZE, CLICK_INSERT_SIZE)),
        "below threshold = click insert at default size"
    );
}
