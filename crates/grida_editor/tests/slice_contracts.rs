//! Vertical-slice conformance: HUD machine + intent interpreter +
//! editor core + renderer, headless (no window, raster surface).
//!
//! One real [`grida_editor::editor::Editor`] owns document truth; one
//! real headless [`UnknownTargetApplication`] owns the renderer that
//! answers the HUD's scene queries through
//! [`grida_editor::bridge::EngineScene`]. Synthetic [`HudEvent`]s
//! drive the HUD machine exactly like the shell does; the returned
//! intents flow through [`grida_editor::interpret::Interpreter`]
//! (`HUD-7`), damage reflects at the event tail (`FRAME-2`), and the
//! selection mirror pushes down (`HUD-3`) — the full hosting loop of
//! `crates/grida_editor/docs/hud.md`, minus the window.

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use grida::runtime::scene::RendererOptions;
use grida::window::application::UnknownTargetApplication;
use math2::transform::AffineTransform;

use grida_editor::bridge::{self, EngineScene};
use grida_editor::document::{Id, WorkingCopy};
use grida_editor::editor::Editor;
use grida_editor::hud::{Hud, HudEvent, Modifiers, PointerButton};
use grida_editor::interpret::{self, Interpreter};

// ── Helpers ──────────────────────────────────────────────────────────────

/// Build a scene with two non-overlapping rectangles (same fixture
/// geometry as `grida`'s own `surface_interaction` tests):
///
/// ```text
///   rect A: (10,10) 80×80        rect B: (200,10) 80×80
/// ```
fn two_rect_scene() -> (Scene, HashMap<NodeId, Id>) {
    let nf = NodeFactory::new();

    let mut rect_a = nf.create_rectangle_node();
    rect_a.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect_a.size = Size {
        width: 80.0,
        height: 80.0,
    };

    let mut rect_b = nf.create_rectangle_node();
    rect_b.transform = AffineTransform::new(200.0, 10.0, 0.0);
    rect_b.size = Size {
        width: 80.0,
        height: 80.0,
    };

    let mut graph = SceneGraph::new();
    let a = graph.append_child(Node::Rectangle(rect_a), Parent::Root);
    let b = graph.append_child(Node::Rectangle(rect_b), Parent::Root);

    let scene = Scene {
        name: "slice".to_string(),
        background_color: None,
        graph,
    };
    let id_map = HashMap::from([(a, "A".to_string()), (b, "B".to_string())]);
    (scene, id_map)
}

/// The slice harness: the shell's hosting loop, headless. The HUD's
/// view stays identity, so synthetic "screen" points are canvas
/// points.
struct Slice {
    editor: Editor,
    app: Box<UnknownTargetApplication>,
    hud: Hud,
    interp: Interpreter,
    clock: u64,
}

impl Slice {
    fn new() -> Self {
        let (scene, id_map) = two_rect_scene();
        let doc = WorkingCopy::from_scene(scene, id_map);
        let mut editor = Editor::new(doc);
        let mut app = UnknownTargetApplication::new_raster(800, 600, RendererOptions::default());
        bridge::flush(editor.document(), app.renderer_mut());
        let _ = editor.take_damage();
        Self {
            editor,
            app,
            hud: Hud::new(),
            interp: Interpreter::new(),
            clock: 0,
        }
    }

    /// One host event: HUD dispatch → intents through the interpreter
    /// → event-tail reflect → selection mirror-down. Exactly the
    /// shell's loop.
    fn dispatch(&mut self, event: HudEvent) {
        self.clock += 1000;
        let response = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            self.hud.dispatch(event, &scene, self.clock)
        };
        for intent in &response.intents {
            let facts = {
                let scene = EngineScene {
                    app: &self.app,
                    doc: self.editor.document(),
                };
                interpret::facts_for(intent, &scene)
            };
            let _ = self.interp.apply(&mut self.editor, intent, &facts);
        }
        self.reflect();
    }

    /// The event-tail reflect (`FRAME-2`) + mirror-down (`HUD-3`).
    fn reflect(&mut self) {
        let damage = self.editor.take_damage();
        bridge::reflect(self.editor.document(), self.app.renderer_mut(), &damage);
        if self.hud.selection() != self.editor.selection() {
            let selection = self.editor.selection().to_vec();
            self.hud.set_selection(&selection);
        }
    }

    fn down(&mut self, p: [f32; 2]) {
        self.dispatch(HudEvent::PointerDown {
            screen: p,
            button: PointerButton::Primary,
            modifiers: Modifiers::default(),
        });
    }

    fn mv(&mut self, p: [f32; 2]) {
        self.dispatch(HudEvent::PointerMove { screen: p });
    }

    fn up(&mut self, p: [f32; 2]) {
        self.dispatch(HudEvent::PointerUp {
            screen: p,
            button: PointerButton::Primary,
            modifiers: Modifiers::default(),
        });
    }
}

/// The position of a node in the *renderer's* scene (the mirror), read
/// by the renderer's internal id.
fn renderer_position(app: &UnknownTargetApplication, iid: NodeId) -> Option<(f32, f32)> {
    let scene = app.renderer().scene.as_ref()?;
    match scene.graph.get_node(&iid).ok()? {
        Node::Rectangle(n) => Some((n.transform.x(), n.transform.y())),
        _ => None,
    }
}

// ── The slices ───────────────────────────────────────────────────────────

/// SURF-2 / HISB-2 / HUD-2 — a click-select + translate drag driven
/// end-to-end through the HUD produces exactly one history entry,
/// moves the node in both the editor working copy and the renderer
/// mirror, and undo restores both.
#[test]
fn slice_translate_undo() {
    let mut slice = Slice::new();
    let a = "A".to_string();
    let iid_a = slice
        .editor
        .document()
        .internal_id(&a)
        .expect("A exists in the working copy");

    // 1. Pointer-down on rect A: the HUD's tier-2 pick emits the
    //    replace-select (ContentReplace, commit on-down); the
    //    interpreter lands it and the mirror-down echoes it back.
    slice.down([50.0, 50.0]);
    assert_eq!(slice.editor.selection(), std::slice::from_ref(&a));
    assert_eq!(slice.hud.selection(), std::slice::from_ref(&a));

    // 2. Drag: every move emits a translate preview (cumulative from
    //    the down anchor); the interpreter applies silent patches in
    //    one gesture frame; the reflect pushes them to the renderer
    //    (FRAME-1).
    for p in [[60.0, 60.0], [90.0, 80.0], [100.0, 90.0]] {
        slice.mv(p);
    }
    assert_eq!(
        slice.editor.node_position(&a),
        Some((60.0, 50.0)),
        "cumulative delta (50,40) from the down anchor lands in the working copy"
    );
    assert_eq!(
        renderer_position(&slice.app, iid_a),
        Some((60.0, 50.0)),
        "previews reach the renderer mirror through the reflect loop"
    );

    // 3. Pointer-up commits: exactly ONE history entry.
    slice.up([100.0, 90.0]);
    assert_eq!(
        slice.editor.history_len(),
        1,
        "SURF-2/HISB-2: a committed translate gesture is exactly one history entry"
    );

    // 4. Undo restores both stores through the same reflect loop.
    assert!(slice.editor.undo());
    slice.reflect();
    assert_eq!(slice.editor.node_position(&a), Some((10.0, 10.0)));
    assert_eq!(renderer_position(&slice.app, iid_a), Some((10.0, 10.0)));

    // Redo round-trips the same entry.
    assert!(slice.editor.redo());
    slice.reflect();
    assert_eq!(slice.editor.node_position(&a), Some((60.0, 50.0)));
    assert_eq!(renderer_position(&slice.app, iid_a), Some((60.0, 50.0)));
}

/// SURF-7 / HUD-3 — a marquee driven through the HUD lands in the
/// *editor's* selection on every pointer-move, without any subsequent
/// click: the HUD emits the rect, the interpreter resolves it against
/// the engine's own marquee semantics, and everything downstream of
/// the editor's selection — the inspector, a selection-driven delete —
/// works off the mid-marquee result directly.
///
/// This is the split-brain regression made impossible by polarity:
/// the machine never owns a selection to adopt from — intents up,
/// mirror down, same event.
#[test]
fn slice_marquee_selection() {
    let mut slice = Slice::new();

    // Pointer-down on empty canvas arms the marquee (empty selection:
    // no deselect emitted, nothing to clear).
    slice.down([0.0, 0.0]);
    assert!(slice.editor.selection().is_empty());

    // First move sweeps across rect A only. SURF-7: the *editor's*
    // selection reflects it before pointer-up.
    slice.mv([150.0, 100.0]);
    assert_eq!(
        slice.editor.selection(),
        &["A".to_string()],
        "SURF-7: the marquee's live selection lands in the editor on every move"
    );

    // Second move sweeps across both rects.
    slice.mv([300.0, 100.0]);
    let mut selected: Vec<Id> = slice.editor.selection().to_vec();
    selected.sort();
    assert_eq!(selected, vec!["A".to_string(), "B".to_string()]);

    // Pointer-up commits; the selection stands.
    slice.up([300.0, 100.0]);
    let mut selected: Vec<Id> = slice.editor.selection().to_vec();
    selected.sort();
    assert_eq!(selected, vec!["A".to_string(), "B".to_string()]);

    // The inspector works off the editor's selection: it mounts.
    let mut ui = grida_editor::ui::UiLayer::new(Size {
        width: 800.0,
        height: 600.0,
    });
    let mut props = grida_editor::ui::properties::PropertiesPanel::new(240.0);
    props.sync(&mut ui, &slice.editor);
    assert!(
        !ui.is_empty(),
        "the properties panel mounts from a marquee selection"
    );

    // Delete works off the editor's selection: one recorded batch
    // removes everything the marquee selected.
    let batch: Vec<grida_editor::document::Mutation> = slice
        .editor
        .selection()
        .iter()
        .map(|id| grida_editor::document::Mutation::Remove { id: id.clone() })
        .collect();
    slice
        .editor
        .dispatch(
            batch,
            grida_editor::history::Origin::Local,
            grida_editor::editor::Recording::Record { label: None },
        )
        .expect("delete of a marquee selection applies");
    assert!(slice.editor.children(None).is_empty());
    // Selection is not history: the whole marquee recorded nothing;
    // the delete is the first entry.
    assert_eq!(slice.editor.history_len(), 1);
    // ED-7: the applied removal pruned the selection in the same
    // dispatch; the mirror-down would push the prune to the HUD.
    assert!(slice.editor.selection().is_empty());
    slice.reflect();
    assert!(slice.hud.selection().is_empty());
}

/// HUD-5 slice — the chrome built against the real engine-backed
/// scene registers resize handles the machine routes: a handle drag
/// through the full loop resizes the document node.
#[test]
fn slice_resize_via_handle() {
    let mut slice = Slice::new();
    let a = "A".to_string();

    // Select A, then build chrome (the shell does this every painted
    // frame) so the tier-1 handle regions exist.
    slice.down([50.0, 50.0]);
    slice.up([50.0, 50.0]);
    let _ = {
        let scene = EngineScene {
            app: &slice.app,
            doc: slice.editor.document(),
        };
        slice.hud.chrome(&scene)
    };

    // Drag the SE corner (90,90) by (30, 20).
    slice.down([90.0, 90.0]);
    slice.mv([120.0, 110.0]);
    slice.up([120.0, 110.0]);

    assert_eq!(
        slice.editor.node_size(&a),
        Some((110.0, 100.0)),
        "the SE handle drag resizes through intent + interpretation"
    );
    assert_eq!(
        slice.editor.node_position(&a),
        Some((10.0, 10.0)),
        "NW-anchored: the position holds"
    );
    assert_eq!(
        slice.editor.history_len(),
        1,
        "one gesture, one entry (SURF-2)"
    );
}
