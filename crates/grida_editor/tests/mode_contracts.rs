//! `MODE-*` conformance tests for `docs/wg/canvas/edit-mode.md`.
//!
//! The slot ([`grida_editor::mode`]) and the dispatch table are
//! library-side; the deferred rows (paint sessions, flatten) resolve
//! here even though their shell handling is a named no-op — the
//! resolution *order* is the contract (MODE-2).

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use grida_editor::document::{Fragment, Mutation, WorkingCopy, polyline_network};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::mode::{EditMode, EnterDispatch, dispatch_enter};
use grida_editor::tool::vector_fragment;
use grida_editor::vector::mode::{VecMods, VectorMode, VectorTool};

fn insert(editor: &mut Editor, index: usize, fragment: Fragment) {
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index,
                fragment: Box::new(fragment),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();
}

fn rect_fragment(id: &str) -> Fragment {
    let factory = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: Some(id.to_string()),
        node: Node::Rectangle(factory.create_rectangle_node()),
        children: vec![],
    }
}

fn text_fragment(id: &str) -> Fragment {
    let factory = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: Some(id.to_string()),
        node: Node::TextSpan(factory.create_text_span_node()),
        children: vec![],
    }
}

fn container_fragment(id: &str) -> Fragment {
    let factory = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: Some(id.to_string()),
        node: Node::Container(factory.create_container_node()),
        children: vec![],
    }
}

fn image_paint() -> Paint {
    Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::RID("res://image".to_string()),
        quarter_turns: 0,
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(math2::box_fit::BoxFit::Cover),
        opacity: 1.0,
        blend_mode: BlendMode::default(),
        filters: ImageFilters::default(),
    })
}

fn with_image_fill(mut fragment: Fragment) -> Fragment {
    match &mut fragment.node {
        Node::Rectangle(n) => n.fills = Paints::new([image_paint()]),
        Node::Vector(n) => n.fills = Paints::new([image_paint()]),
        _ => panic!("fixture supports rectangle/vector"),
    }
    fragment
}

fn vector(id: &str) -> Fragment {
    vector_fragment(
        id.to_string(),
        "Vector",
        [0.0, 0.0],
        polyline_network(&[(0.0, 0.0), (50.0, 0.0), (50.0, 50.0)]),
    )
}

// -- MODE-2 ---------------------------------------------------------------------

#[test]
fn mode_2_dispatch_table_rows_and_order() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, text_fragment("t"));
    insert(&mut editor, 1, vector("v"));
    insert(&mut editor, 2, rect_fragment("r"));
    insert(&mut editor, 3, container_fragment("c"));
    insert(&mut editor, 4, with_image_fill(rect_fragment("r_img")));
    insert(&mut editor, 5, with_image_fill(vector("v_img")));

    assert_eq!(
        dispatch_enter(&editor, &"t".to_string()),
        EnterDispatch::Text("t".to_string())
    );
    assert_eq!(
        dispatch_enter(&editor, &"v".to_string()),
        EnterDispatch::Vector("v".to_string())
    );
    assert_eq!(
        dispatch_enter(&editor, &"r".to_string()),
        EnterDispatch::FlattenThenVector("r".to_string())
    );
    // Containers are not enterable — Enter falls through (TRAV-1).
    assert_eq!(
        dispatch_enter(&editor, &"c".to_string()),
        EnterDispatch::NotEnterable
    );
    // The image-fill row outranks both the primitive and the vector
    // rows: "edit the image".
    assert_eq!(
        dispatch_enter(&editor, &"r_img".to_string()),
        EnterDispatch::ImagePaintSession("r_img".to_string())
    );
    assert_eq!(
        dispatch_enter(&editor, &"v_img".to_string()),
        EnterDispatch::ImagePaintSession("v_img".to_string())
    );
    // Unknown ids resolve to not-enterable.
    assert_eq!(
        dispatch_enter(&editor, &"missing".to_string()),
        EnterDispatch::NotEnterable
    );
}

// -- MODE-1 ---------------------------------------------------------------------

#[test]
fn mode_1_replace_runs_previous_exit_cleanup() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, vector("a"));
    insert(&mut editor, 1, vector("b"));

    // Mode on `a`, made degenerate: its exit cleanup must delete it.
    let mut mode_a = VectorMode::enter(&editor, "a".to_string()).unwrap();
    // Marquee-select everything in `a` and delete its content.
    mode_a.pointer_down(
        &mut editor,
        [-20.0, -20.0],
        [-20.0, -20.0],
        1.0,
        0,
        VecMods::default(),
    );
    mode_a.pointer_move(
        &mut editor,
        [80.0, 80.0],
        [80.0, 80.0],
        1.0,
        VecMods::default(),
    );
    mode_a.pointer_up(&mut editor, [80.0, 80.0]);
    assert!(mode_a.delete(&mut editor));
    let mut slot = EditMode::Vector(Box::new(mode_a));

    // Entering `b` while `a`'s mode is active: the previous exit runs
    // in full — `a` is degenerate, so its cleanup deletes it.
    let mode_b = VectorMode::enter(&editor, "b".to_string()).unwrap();
    let out = slot.replace(&mut editor, EditMode::Vector(Box::new(mode_b)));

    assert_eq!(out.map(|o| o.deleted), Some(true));
    assert!(!editor.document().contains(&"a".to_string()));
    assert_eq!(slot.subject(), Some(&"b".to_string()));
}

// -- MODE-6 ---------------------------------------------------------------------

#[test]
fn mode_6_subject_deleted_ends_the_mode() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, vector("v"));
    let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();

    // The subject vanishes underneath the mode (e.g. a remote change).
    editor
        .dispatch(
            vec![Mutation::Remove {
                id: "v".to_string(),
            }],
            Origin::Remote,
            Recording::Silent,
        )
        .unwrap();

    assert!(
        !mode.reconcile(&editor),
        "no residue: the caller drops the mode"
    );
}

#[test]
fn mode_6_undo_past_entry_ends_the_mode() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, vector("v"));
    let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();

    // A mode-era edit: undoing it keeps the mode…
    mode.pointer_down(
        &mut editor,
        [0.0, 0.0],
        [0.0, 0.0],
        1.0,
        0,
        VecMods::default(),
    );
    mode.pointer_up(&mut editor, [0.0, 0.0]);
    assert!(mode.nudge(&mut editor, 3.0, 0.0));
    assert!(editor.undo());
    assert!(mode.reconcile(&editor));

    // …undoing across the entry (the insert itself) ends it.
    assert!(editor.undo());
    assert!(!mode.reconcile(&editor));
}

// -- MODE-8 ---------------------------------------------------------------------

#[test]
fn mode_8_tool_legality_and_gesture_guard() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, vector("v"));
    let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();

    // Legal arm.
    mode.set_tool(VectorTool::Pen);
    assert_eq!(mode.tool(), VectorTool::Pen);

    // Mid-sequence, tool switches are refused (the machine's phase
    // guard — same discipline as the tool machine's).
    mode.pointer_down(
        &mut editor,
        [200.0, 200.0],
        [200.0, 200.0],
        1.0,
        0,
        VecMods::default(),
    );
    mode.set_tool(VectorTool::Cursor);
    assert_eq!(mode.tool(), VectorTool::Pen);
    mode.pointer_up(&mut editor, [200.0, 200.0]);
    mode.set_tool(VectorTool::Cursor);
    assert_eq!(mode.tool(), VectorTool::Cursor);
}

// -- MODE-10 --------------------------------------------------------------------

#[test]
fn mode_10_repeated_escape_reaches_exit_one_rung_per_press() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, vector("v"));
    let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
    mode.set_tool(VectorTool::Pen);

    // Deep state: pen armed and projecting.
    mode.pointer_down(
        &mut editor,
        [0.0, 0.0],
        [0.0, 0.0],
        1.0,
        0,
        VecMods::default(),
    );
    mode.pointer_up(&mut editor, [0.0, 0.0]);
    assert!(mode.projecting());

    use grida_editor::vector::mode::EscapeStep::*;
    let mut steps = Vec::new();
    loop {
        let step = mode.escape(&mut editor);
        steps.push(step);
        if step == ExitRequested {
            break;
        }
        assert!(steps.len() < 10, "the ladder must terminate");
    }
    // Finitely many presses, one rung each: disconnect → tool → exit.
    assert_eq!(steps, vec![Disconnected, ToolReverted, ExitRequested]);

    let out = mode.exit(&mut editor);
    assert!(!out.deleted);
    // Above the mode, the document ladder continues (tool → deselect —
    // the shell's rungs, exercised by the shell contracts).
}

// -- MODE-7 ---------------------------------------------------------------------

#[test]
fn mode_7_active_mode_never_reaches_the_persisted_form() {
    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    insert(&mut editor, 0, vector("v"));
    let saved_before = grida_editor::io::encode_document(editor.document());

    // A deep mode state: pen armed, projecting, sub-selection held.
    let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
    mode.set_tool(VectorTool::Pen);
    mode.pointer_down(
        &mut editor,
        [0.0, 0.0],
        [0.0, 0.0],
        1.0,
        0,
        VecMods::default(),
    );
    mode.pointer_up(&mut editor, [0.0, 0.0]);
    assert!(mode.projecting());

    // The persisted form is byte-identical with the mode active: the
    // mode is authoring context, never document state (MODE-7). Its
    // undo/redo round-trip half is the MODE-6 reconcile tests.
    let saved_during = grida_editor::io::encode_document(editor.document());
    assert_eq!(saved_before, saved_during);
    let _ = mode.exit(&mut editor);
}

// -- the flatten row (MODE-2, live) -----------------------------------------------

#[test]
fn flatten_turns_a_primitive_into_its_rendered_outline() {
    use grida_editor::mode::flatten_to_vector;

    let mut editor = Editor::new(WorkingCopy::new_empty("test"));
    // A sized, filled rectangle at a real position.
    let mut fragment = rect_fragment("r");
    if let Node::Rectangle(n) = &mut fragment.node {
        n.transform = math2::transform::AffineTransform::new(30.0, 40.0, 0.0);
        n.size = grida::node::schema::Size {
            width: 120.0,
            height: 80.0,
        };
        n.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            10, 200, 30, 255,
        )))]);
    }
    insert(&mut editor, 0, fragment);
    let history_before = editor.history_len();

    assert_eq!(
        dispatch_enter(&editor, &"r".to_string()),
        EnterDispatch::FlattenThenVector("r".to_string())
    );
    assert!(flatten_to_vector(&mut editor, &"r".to_string()));

    // Same id, now a vector — the dispatch row proceeds to the mode.
    assert_eq!(
        dispatch_enter(&editor, &"r".to_string()),
        EnterDispatch::Vector("r".to_string())
    );
    // The rendered outline: a rectangle's four corners, closed.
    let net = editor
        .node_vector_network(&"r".to_string())
        .expect("vector twin");
    assert_eq!(net.vertices.len(), 4);
    assert_eq!(net.segments.len(), 4);
    // Identity, transform, and paint survive.
    assert_eq!(editor.node_position(&"r".to_string()), Some((30.0, 40.0)));
    assert_eq!(
        editor.node_fill_solid(&"r".to_string()),
        Some(CGColor::from_rgba(10, 200, 30, 255))
    );
    // One recorded entry; undo restores the primitive exactly.
    assert_eq!(editor.history_len(), history_before + 1);
    assert!(editor.undo());
    assert_eq!(
        dispatch_enter(&editor, &"r".to_string()),
        EnterDispatch::FlattenThenVector("r".to_string())
    );
}
