//! Ruler & guides conformance — `docs/wg/canvas/ruler.md`
//! (`RUL-1..10`): the pure strip layout, guides as per-scene document
//! truth on the intent seam, the create/move/delete interaction, and
//! the axis-orientation crosswiring.
//!
//! Headless: the pure layout module directly; the interaction tests
//! drive a real [`Hud`] (ruler mirror on, guides mirror pushed like a
//! host frame loop) into a real [`Interpreter`] over a real editor.
//! The camera is identity, so screen == canvas and the strip zones
//! are the top/left 20 px.

use std::collections::HashMap;

use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;
use math2::vector2::Axis;

use grida_editor::document::{Guide, Id, Mutation, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::hud::{
    Hud, HudEvent, HudPrim, HudScene, Intent, Modifiers, PointerButton, Role, SelectionShape,
};
use grida_editor::interpret::{InterpretScene, Interpreter, facts_for};
use grida_editor::{ruler, wire};

// ── Fixture ──────────────────────────────────────────────────────────

/// Root-level rectangles at the given `(id, x, y, w, h)` frames.
fn fixture(nodes: &[(&str, f32, f32, f32, f32)]) -> Editor {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let mut id_map: HashMap<NodeId, Id> = HashMap::new();
    for (id, x, y, w, h) in nodes {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(*x, *y, 0.0);
        rect.size = Size {
            width: *w,
            height: *h,
        };
        let iid = graph.append_child(Node::Rectangle(rect), Parent::Root);
        id_map.insert(iid, id.to_string());
    }
    let scene = Scene {
        name: "ruler".to_string(),
        background_color: None,
        graph,
    };
    Editor::new(WorkingCopy::from_scene(scene, id_map))
}

/// Document-backed scene: root-level nodes, so world == position.
struct DocScene {
    bounds: Vec<(Id, Rectangle)>,
}

impl DocScene {
    fn of(editor: &Editor) -> Self {
        let mut bounds = Vec::new();
        for id in editor.children(None) {
            if let (Some(pos), Some(size)) = (editor.node_position(&id), editor.node_size(&id)) {
                bounds.push((id, Rectangle::from_xywh(pos.0, pos.1, size.0, size.1)));
            }
        }
        Self { bounds }
    }
}

impl InterpretScene for DocScene {
    fn nodes_in_rect(&self, rect: &Rectangle) -> Vec<Id> {
        self.bounds
            .iter()
            .filter(|(_, b)| b.intersects(rect))
            .map(|(id, _)| id.clone())
            .collect()
    }
    fn world_bounds(&self, id: &Id) -> Option<Rectangle> {
        self.bounds.iter().find(|(i, _)| i == id).map(|(_, b)| *b)
    }
    fn guide_anchors(&self) -> Vec<Rectangle> {
        self.bounds.iter().map(|(_, b)| *b).collect()
    }
}

impl HudScene for DocScene {
    fn pick(&self, p: [f32; 2]) -> Option<Id> {
        self.bounds
            .iter()
            .rev()
            .find(|(_, b)| b.contains_point(p))
            .map(|(id, _)| id.clone())
    }
    fn shape_of(&self, id: &Id) -> Option<SelectionShape> {
        self.world_bounds(id).map(SelectionShape::Rect)
    }
}

/// The host frame loop, miniaturized: mirror the guides down, rebuild
/// the chrome (and with it the hit registry), dispatch, interpret —
/// with the host state (`zoom` 1, disable modifier, ruler-gated
/// snap-guides) layered onto the facts like the shell does.
struct Rig {
    hud: Hud,
    interp: Interpreter,
    editor: Editor,
    clock: u64,
    disabled: bool,
}

impl Rig {
    fn new(editor: Editor) -> Self {
        let mut hud = Hud::new();
        hud.set_ruler(true);
        Self {
            hud,
            interp: Interpreter::new(),
            editor,
            clock: 0,
            disabled: false,
        }
    }

    fn dispatch(&mut self, event: HudEvent) -> Vec<Intent> {
        self.hud.set_guides(self.editor.guides());
        let scene = DocScene::of(&self.editor);
        let _ = self.hud.chrome(&scene);
        self.clock += 100;
        let response = self.hud.dispatch(event, &scene, self.clock);
        for intent in &response.intents {
            let mut facts = facts_for(intent, &scene);
            facts.zoom = 1.0;
            facts.snap_disabled = self.disabled;
            self.interp.apply(&mut self.editor, intent, &facts);
        }
        response.intents
    }

    fn down(&mut self, screen: [f32; 2]) -> Vec<Intent> {
        self.dispatch(HudEvent::PointerDown {
            screen,
            button: PointerButton::Primary,
            modifiers: Modifiers::default(),
        })
    }
    fn drag(&mut self, screen: [f32; 2]) -> Vec<Intent> {
        self.dispatch(HudEvent::PointerMove { screen })
    }
    fn up(&mut self, screen: [f32; 2]) -> Vec<Intent> {
        self.dispatch(HudEvent::PointerUp {
            screen,
            button: PointerButton::Primary,
            modifiers: Modifiers::default(),
        })
    }
}

/// Seed a guide directly through the document (a pre-existing guide,
/// one recorded entry).
fn seed_guide(editor: &mut Editor, axis: Axis, offset: f32) {
    editor
        .dispatch(
            vec![Mutation::GuideInsert {
                index: editor.guides().len(),
                guide: Guide { axis, offset },
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("seed guide");
}

// ── RUL-1/RUL-2/RUL-3: the pure strip layout ─────────────────────────

// RUL-2: at any zoom the chosen step's on-screen spacing is ≥ 50 px,
// unless even the largest step cannot satisfy it.
#[test]
fn rul_2_tick_step_keeps_min_spacing() {
    for zoom in [0.02_f32, 0.05, 0.1, 0.5, 1.0, 2.0, 3.7, 10.0, 64.0] {
        let step = ruler::step(zoom);
        assert!(
            step * zoom >= ruler::TICK_MIN_SPACING_PX,
            "zoom {zoom}: step {step} spaces {} px",
            step * zoom
        );
        // Minimality: the next-smaller series step would violate it.
        if let Some(pos) = ruler::STEPS.iter().position(|s| *s == step)
            && pos > 0
        {
            assert!(ruler::STEPS[pos - 1] * zoom < ruler::TICK_MIN_SPACING_PX);
        }
    }
    // Below the floor even 5000 cannot space 50 px: the largest step
    // is used rather than none.
    assert_eq!(ruler::step(0.005), 5000.0);
}

// Ticks land on step multiples, projected inside the strip.
#[test]
fn rul_2_ticks_are_step_multiples_in_view() {
    let ticks = ruler::ticks(1.0, -25.0, 500.0);
    assert!(!ticks.is_empty());
    for t in &ticks {
        assert_eq!(t.unit % ruler::step(1.0), 0.0, "unit {} off-step", t.unit);
        assert_eq!(t.px, t.unit * 1.0 + -25.0);
        assert!((0.0..=500.0).contains(&t.px));
    }
}

// RUL-3: overlapping ranges merge; shared boundaries never
// double-label; empty selection paints no range.
#[test]
fn rul_3_selection_ranges_merge() {
    assert_eq!(
        ruler::merge_ranges(&[[100.0, 120.0], [10.0, 30.0], [25.0, 60.0]]),
        vec![[10.0, 60.0], [100.0, 120.0]]
    );
    // Inverted pairs normalize before merging.
    assert_eq!(ruler::merge_ranges(&[[30.0, 10.0]]), vec![[10.0, 30.0]]);
    // Touching ranges fuse (a shared boundary is one boundary).
    assert_eq!(
        ruler::merge_ranges(&[[0.0, 10.0], [10.0, 20.0]]),
        vec![[0.0, 20.0]]
    );
    assert!(ruler::merge_ranges(&[]).is_empty());
}

// RUL-1: the layout is a pure function — equal inputs, equal outputs;
// and the fade rule suppresses ticks at priority points.
#[test]
fn rul_1_layout_is_pure_and_fade_yields_to_marks() {
    assert_eq!(
        ruler::ticks(2.0, 13.0, 800.0),
        ruler::ticks(2.0, 13.0, 800.0)
    );
    assert_eq!(ruler::fade(300.0, &[300.0]), 0.0, "at a mark: invisible");
    assert!(ruler::fade(300.0, &[340.0]) < 1.0, "near a mark: faded");
    assert_eq!(ruler::fade(300.0, &[500.0]), 1.0, "far from marks: full");
}

// ── RUL-4: guides are document truth ─────────────────────────────────

// The guide domain mutates through the vocabulary with exact
// inverses: undo/redo round-trips the guide set.
#[test]
fn rul_4_guide_mutations_invert_through_history() {
    let mut editor = fixture(&[]);
    seed_guide(&mut editor, Axis::X, 100.0);
    assert_eq!(
        editor.guides(),
        &[Guide {
            axis: Axis::X,
            offset: 100.0
        }]
    );
    editor
        .dispatch(
            vec![Mutation::GuideSet {
                index: 0,
                offset: 250.0,
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("set");
    editor
        .dispatch(
            vec![Mutation::GuideRemove { index: 0 }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("remove");
    assert!(editor.guides().is_empty());

    assert!(editor.undo(), "undo remove");
    assert_eq!(editor.guides()[0].offset, 250.0);
    assert!(editor.undo(), "undo set");
    assert_eq!(editor.guides()[0].offset, 100.0);
    assert!(editor.undo(), "undo insert");
    assert!(editor.guides().is_empty());
    assert!(editor.redo(), "redo insert");
    assert_eq!(editor.guides()[0].offset, 100.0);
}

// The guide domain rides the wire (DOC-3 for guides): encode → decode
// is identity, and a welcome snapshot carries the guide set into a
// late joiner (the `.grida` bytes cannot — the named persistence
// gap).
#[test]
fn rul_4_guides_ride_the_wire_and_the_welcome() {
    let batch = vec![
        Mutation::GuideInsert {
            index: 0,
            guide: Guide {
                axis: Axis::Y,
                offset: 42.0,
            },
        },
        Mutation::GuideSet {
            index: 0,
            offset: 43.0,
        },
        Mutation::GuideRemove { index: 0 },
    ];
    let encoded = wire::encode_batch(&batch).expect("guide ops encode");
    let json = serde_json::to_string(&encoded).expect("serializes");
    let parsed: Vec<wire::WireMutation> = serde_json::from_str(&json).expect("parses");
    let decoded = wire::decode_batch(&parsed);
    let mut doc = WorkingCopy::new_empty("wire");
    doc.apply(&decoded).expect("decoded batch applies");
    assert!(doc.guides().is_empty(), "insert+set+remove nets to none");

    // Welcome: authority guides reach a late joiner.
    let mut authority = fixture(&[("A", 10.0, 10.0, 80.0, 80.0)]);
    seed_guide(&mut authority, Axis::X, 300.0);
    let mut late = Editor::new(WorkingCopy::new_empty("late"));
    let mut client = grida_editor::sync::SyncClient::new("L");
    let guides: Vec<wire::WireGuide> = authority.guides().iter().map(|g| (*g).into()).collect();
    client
        .on_welcome(
            &mut late,
            &grida_editor::io::encode_document(authority.document()),
            7,
            &guides,
        )
        .expect("welcome");
    assert_eq!(late.guides(), authority.guides());
    assert!(late.document().structure_eq(authority.document()));
}

// ── RUL-5: creation threshold, at the pointer's position ─────────────

#[test]
fn rul_5_create_requires_the_drag_threshold() {
    // Press on the top strip, wiggle 2 px (< 4), release: no guide,
    // nothing recorded.
    let mut rig = Rig::new(fixture(&[]));
    rig.down([300.0, 10.0]);
    rig.drag([300.0, 12.0]);
    rig.up([300.0, 12.0]);
    assert!(rig.editor.guides().is_empty(), "no zombie guide");
    assert_eq!(rig.editor.history_len(), 0);

    // Past the threshold the guide materializes at the pointer, and
    // the commit is one history entry (RUL-4).
    let mut rig = Rig::new(fixture(&[]));
    rig.down([300.0, 10.0]);
    rig.drag([300.0, 200.0]);
    assert_eq!(
        rig.editor.guides(),
        &[Guide {
            axis: Axis::Y,
            offset: 200.0
        }],
        "previews mutate the document silently"
    );
    assert_eq!(rig.editor.history_len(), 0, "no entry mid-gesture");
    rig.up([300.0, 240.0]);
    assert_eq!(
        rig.editor.guides(),
        &[Guide {
            axis: Axis::Y,
            offset: 240.0
        }]
    );
    assert_eq!(rig.editor.history_len(), 1, "one entry per gesture");
    assert!(rig.editor.undo());
    assert!(rig.editor.guides().is_empty(), "undo removes the guide");
}

// ── RUL-10: strips author the counter axis, guides move on their own ─

#[test]
fn rul_10_strips_author_the_counter_axis() {
    // Top strip (reads x) authors a y-axis guide.
    let mut rig = Rig::new(fixture(&[]));
    rig.down([300.0, 10.0]);
    rig.drag([311.0, 170.0]);
    rig.up([311.0, 170.0]);
    assert_eq!(rig.editor.guides()[0].axis, Axis::Y);
    assert_eq!(rig.editor.guides()[0].offset, 170.0, "y follows, x ignored");

    // Left strip (reads y) authors an x-axis guide.
    let mut rig = Rig::new(fixture(&[]));
    rig.down([10.0, 300.0]);
    rig.drag([170.0, 311.0]);
    rig.up([170.0, 311.0]);
    assert_eq!(rig.editor.guides()[0].axis, Axis::X);
    assert_eq!(rig.editor.guides()[0].offset, 170.0, "x follows, y ignored");

    // Moving an existing guide corrects only along its axis.
    let mut rig = Rig::new(fixture(&[]));
    seed_guide(&mut rig.editor, Axis::X, 300.0);
    rig.down([300.0, 400.0]);
    rig.drag([333.0, 500.0]);
    rig.up([333.0, 500.0]);
    assert_eq!(
        rig.editor.guides(),
        &[Guide {
            axis: Axis::X,
            offset: 333.0
        }]
    );
}

// ── RUL-6: guide-drag snapping + unconditional quantize ──────────────

#[test]
fn rul_6_guide_drag_snaps_to_content_and_quantizes() {
    // A at x = 200: dragging a vertical guide to 203 (3 px away,
    // inside the zoom-1 threshold of 4.5) captures the edge.
    let mut rig = Rig::new(fixture(&[("A", 200.0, 50.0, 100.0, 100.0)]));
    rig.down([10.0, 400.0]);
    rig.drag([203.0, 400.0]);
    rig.up([203.0, 400.0]);
    assert_eq!(rig.editor.guides()[0].offset, 200.0, "edge captured");

    // The disable modifier bypasses the geometry part live (SNAP-3),
    // but the lattice quantize is unconditional: 203.4 commits as
    // 203, never 203.4.
    let mut rig = Rig::new(fixture(&[("A", 200.0, 50.0, 100.0, 100.0)]));
    rig.disabled = true;
    rig.interp.snap.pixel_grid = false; // not the gate for guides
    rig.down([10.0, 400.0]);
    rig.drag([203.4, 400.0]);
    rig.up([203.4, 400.0]);
    assert_eq!(
        rig.editor.guides()[0].offset,
        203.0,
        "integer by construction, geometry snap disabled"
    );
}

// ── RUL-7: delete by return, Esc aborts ──────────────────────────────

#[test]
fn rul_7_delete_by_return_records_one_entry() {
    // Moving an existing guide back onto its authoring strip removes
    // it as one entry; undo restores it at its original offset.
    let mut rig = Rig::new(fixture(&[]));
    seed_guide(&mut rig.editor, Axis::X, 300.0);
    assert_eq!(rig.editor.history_len(), 1);
    rig.down([300.0, 400.0]);
    rig.drag([150.0, 400.0]);
    rig.up([10.0, 400.0]); // released on the left strip
    assert!(rig.editor.guides().is_empty(), "deleted by return");
    assert_eq!(rig.editor.history_len(), 2, "the delete is one entry");
    assert!(rig.editor.undo());
    assert_eq!(
        rig.editor.guides(),
        &[Guide {
            axis: Axis::X,
            offset: 300.0
        }],
        "undo restores the original offset, not the drag's last"
    );

    // A create-drag that returns to the strip leaves the document
    // untouched — no guide, no entry.
    let mut rig = Rig::new(fixture(&[]));
    rig.down([10.0, 300.0]);
    rig.drag([150.0, 300.0]);
    assert_eq!(rig.editor.guides().len(), 1, "materialized mid-drag");
    rig.up([10.0, 300.0]);
    assert!(rig.editor.guides().is_empty(), "create nets to nothing");
    assert_eq!(rig.editor.history_len(), 0);

    // Esc mid-gesture aborts: prior state, no entry.
    let mut rig = Rig::new(fixture(&[]));
    seed_guide(&mut rig.editor, Axis::X, 300.0);
    rig.down([300.0, 400.0]);
    rig.drag([350.0, 400.0]);
    assert_eq!(rig.editor.guides()[0].offset, 350.0, "preview applied");
    rig.dispatch(HudEvent::Cancel);
    assert_eq!(rig.editor.guides()[0].offset, 300.0, "abort restores");
    assert_eq!(rig.editor.history_len(), 1, "only the seed entry");
}

// A move gesture's preview stream coalesces to one endpoint entry.
#[test]
fn rul_4_move_coalesces_to_one_entry() {
    let mut rig = Rig::new(fixture(&[]));
    seed_guide(&mut rig.editor, Axis::Y, 100.0);
    rig.down([400.0, 100.0]);
    for y in [120.0, 140.0, 160.0, 180.0] {
        rig.drag([400.0, y]);
    }
    rig.up([400.0, 200.0]);
    assert_eq!(rig.editor.guides()[0].offset, 200.0);
    assert_eq!(rig.editor.history_len(), 2, "seed + one move entry");
    assert!(rig.editor.undo());
    assert_eq!(rig.editor.guides()[0].offset, 100.0, "endpoint inverse");
}

// ── RUL-8: display coupling ──────────────────────────────────────────

#[test]
fn rul_8_ruler_off_hides_and_deactivates_guides() {
    let mut rig = Rig::new(fixture(&[]));
    seed_guide(&mut rig.editor, Axis::X, 300.0);

    // Ruler on: the guide paints and its regions hit.
    rig.hud.set_guides(rig.editor.guides());
    let scene = DocScene::of(&rig.editor);
    let draw = rig.hud.chrome(&scene);
    assert!(
        draw.prims.iter().any(|p| matches!(
            p,
            HudPrim::Rule {
                axis: Axis::X,
                role: Role::Guide,
                ..
            }
        )),
        "guide hairline paints while the ruler is on"
    );
    assert!(rig.hud.hit_test([300.0, 400.0]).is_some(), "guide hits");
    assert!(rig.hud.hit_test([400.0, 10.0]).is_some(), "strip hits");

    // Ruler off: no guide prim, no guide or strip region — while the
    // document is untouched.
    rig.hud.set_ruler(false);
    let draw = rig.hud.chrome(&scene);
    assert!(
        !draw.prims.iter().any(|p| matches!(
            p,
            HudPrim::Rule {
                role: Role::Guide,
                ..
            }
        )),
        "no guide paints with the ruler off"
    );
    assert!(rig.hud.hit_test([300.0, 400.0]).is_none());
    assert!(rig.hud.hit_test([400.0, 10.0]).is_none());
    assert_eq!(rig.editor.guides().len(), 1, "document truth unchanged");

    // And a press where the strip used to be routes to content, not a
    // guide gesture.
    rig.hud.set_ruler(false);
    rig.down([400.0, 10.0]);
    rig.drag([400.0, 200.0]);
    rig.up([400.0, 200.0]);
    assert_eq!(rig.editor.guides().len(), 1, "no guide authored");
}

// ── RUL-9: the intent seam ───────────────────────────────────────────

// The HUD emits `guide` intents and never mutates the guide set; the
// document changes only when the host interprets.
#[test]
fn rul_9_hud_emits_intent_host_commits() {
    let editor = fixture(&[]);
    let scene = DocScene::of(&editor);
    let mut hud = Hud::new();
    hud.set_ruler(true);
    let _ = hud.chrome(&scene);
    let mut intents: Vec<Intent> = Vec::new();
    intents.extend(
        hud.dispatch(
            HudEvent::PointerDown {
                screen: [300.0, 10.0],
                button: PointerButton::Primary,
                modifiers: Modifiers::default(),
            },
            &scene,
            0,
        )
        .intents,
    );
    intents.extend(
        hud.dispatch(
            HudEvent::PointerMove {
                screen: [300.0, 200.0],
            },
            &scene,
            10,
        )
        .intents,
    );
    intents.extend(
        hud.dispatch(
            HudEvent::PointerUp {
                screen: [300.0, 200.0],
                button: PointerButton::Primary,
                modifiers: Modifiers::default(),
            },
            &scene,
            20,
        )
        .intents,
    );
    // The stream is guide intents only — raw offsets, phased.
    assert!(!intents.is_empty());
    assert!(intents.iter().all(|i| matches!(
        i,
        Intent::Guide {
            axis: Axis::Y,
            index: None,
            ..
        }
    )));
    // Nothing applied them: an editor never saw the stream.
    assert!(editor.guides().is_empty(), "the HUD mutated nothing");

    // Applying the same stream through the interpreter commits it.
    let mut editor = fixture(&[]);
    let mut interp = Interpreter::new();
    for intent in &intents {
        let facts = facts_for(intent, &DocScene::of(&editor));
        interp.apply(&mut editor, intent, &facts);
    }
    assert_eq!(
        editor.guides(),
        &[Guide {
            axis: Axis::Y,
            offset: 200.0
        }]
    );
}

// ── Shell containment: the strip zones follow the host origin ───────

// The strips sit at the canvas viewport's edges, not the window's:
// with a pushed origin, the old window-edge zones are dead, the
// offset zones are live, and delete-by-return means returning to the
// *offset* strip band.
#[test]
fn rul_strip_zones_follow_the_host_origin() {
    const ORIGIN: [f32; 2] = [220.0, 0.0];
    let mut rig = Rig::new(fixture(&[]));
    rig.hud.set_ruler_origin(ORIGIN);
    seed_guide(&mut rig.editor, Axis::X, 400.0);

    rig.hud.set_guides(rig.editor.guides());
    let scene = DocScene::of(&rig.editor);
    let _ = rig.hud.chrome(&scene);
    // Window-edge left strip zone (now panel territory): dead.
    assert!(rig.hud.hit_test([10.0, 300.0]).is_none());
    // The offset left strip band is live; the corner square is dead.
    assert!(rig.hud.hit_test([230.0, 300.0]).is_some(), "offset strip");
    assert!(rig.hud.hit_test([230.0, 10.0]).is_none(), "corner is dead");
    // Top strip starts right of the corner.
    assert!(rig.hud.hit_test([500.0, 10.0]).is_some());

    // Create from the offset left strip: an axis-x guide.
    rig.down([230.0, 300.0]);
    rig.drag([600.0, 300.0]);
    rig.up([600.0, 300.0]);
    assert_eq!(rig.editor.guides().len(), 2);
    assert_eq!(
        rig.editor.guides()[1],
        Guide {
            axis: Axis::X,
            offset: 600.0
        }
    );

    // Delete by returning to the offset band (RUL-7 with an origin):
    // 235 is inside [220, 240], so the drop removes the guide.
    rig.down([400.0, 300.0]);
    rig.drag([300.0, 300.0]);
    rig.up([235.0, 300.0]);
    assert_eq!(rig.editor.guides().len(), 1, "returned to the strip");
}

// ── Emphasis: hovered guides thicken, the dragged one reads selected ─

#[test]
fn guide_emphasis_roles_follow_hover_and_drag() {
    let mut rig = Rig::new(fixture(&[]));
    seed_guide(&mut rig.editor, Axis::X, 300.0);

    // Idle, pointer elsewhere: the plain guide role.
    rig.drag([600.0, 400.0]);
    rig.hud.set_guides(rig.editor.guides());
    let scene = DocScene::of(&rig.editor);
    let draw = rig.hud.chrome(&scene);
    assert!(draw.prims.iter().any(|p| matches!(
        p,
        HudPrim::Rule {
            role: Role::Guide,
            ..
        }
    )));

    // Hovering the guide line: the hover role.
    rig.drag([300.0, 400.0]);
    assert_eq!(rig.hud.hover_guide(), Some(0));
    let draw = rig.hud.chrome(&scene);
    assert!(draw.prims.iter().any(|p| matches!(
        p,
        HudPrim::Rule {
            role: Role::GuideHover,
            ..
        }
    )));

    // Dragging it: the active (selected) role.
    rig.down([300.0, 400.0]);
    rig.drag([340.0, 400.0]);
    assert_eq!(rig.hud.active_guide(), Some(0));
    rig.hud.set_guides(rig.editor.guides());
    let draw = rig.hud.chrome(&scene);
    assert!(draw.prims.iter().any(|p| matches!(
        p,
        HudPrim::Rule {
            role: Role::GuideActive,
            ..
        }
    )));
    rig.up([340.0, 400.0]);
    assert_eq!(rig.hud.active_guide(), None, "emphasis dies with the drag");
}
