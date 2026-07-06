//! Frame conformance — `crates/grida_editor/docs/frame.md` (`FRAME-1..4`)
//! against a real headless raster application, asserted at the pixel
//! level: the suite paints through the application's real native
//! redraw entry (`redraw()`), whose flush is gated on the renderer's
//! frame queue, and reads the surface back.
//!
//! The negative control in the first test is the reported regression
//! this concept exists to prevent: a document edit followed by a
//! redraw request — *without* the reflect point — presents the stale
//! mirror (the renderer's caches were never invalidated and no frame
//! was ever queued). The reflect point makes the same edit paint.

use std::collections::HashMap;

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};
use grida::runtime::scene::RendererOptions;
use grida::window::application::UnknownTargetApplication;
use math2::transform::AffineTransform;

use grida_editor::bridge;
use grida_editor::document::{Id, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::tool::{ShapeKind, Tool, ToolMachine};

const W: i32 = 300;
const H: i32 = 200;

fn red() -> CGColor {
    CGColor::from_rgba(200, 30, 30, 255)
}

fn blue() -> CGColor {
    CGColor::from_rgba(30, 30, 200, 255)
}

fn white() -> CGColor {
    CGColor::from_rgba(255, 255, 255, 255)
}

/// One 80×80 red rectangle at canvas (10, 10) on a white background.
/// With the default identity camera, canvas (0, 0) sits at the screen
/// center, so the rect is fully inside the 300×200 viewport.
fn one_rect_scene() -> (Scene, HashMap<NodeId, Id>) {
    let nf = NodeFactory::new();
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.size = Size {
        width: 80.0,
        height: 80.0,
    };
    rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(red()))]);

    let mut graph = SceneGraph::new();
    let a = graph.append_child(Node::Rectangle(rect), Parent::Root);
    let scene = Scene {
        name: "frame".to_string(),
        background_color: Some(white()),
        graph,
    };
    (scene, HashMap::from([(a, "A".to_string())]))
}

/// One 80×80 red container ("frame") at canvas (10, 10) on a white
/// background — the layout-positioned kind whose placement flows
/// through the renderer's `layout_result`, unlike the transform-
/// positioned rectangle above.
fn one_container_scene() -> (Scene, HashMap<NodeId, Id>) {
    let nf = NodeFactory::new();
    let mut container = nf.create_container_node();
    container.position =
        grida::node::schema::LayoutPositioningBasis::Cartesian(grida::cg::types::CGPoint {
            x: 10.0,
            y: 10.0,
        });
    container.layout_dimensions.layout_target_width = Some(80.0);
    container.layout_dimensions.layout_target_height = Some(80.0);
    container.fills = Paints::new([Paint::Solid(SolidPaint::new_color(red()))]);

    let mut graph = SceneGraph::new();
    let k = graph.append_child(Node::Container(container), Parent::Root);
    let scene = Scene {
        name: "frame".to_string(),
        background_color: Some(white()),
        graph,
    };
    (scene, HashMap::from([(k, "K".to_string())]))
}

/// Editor + headless raster app, renderer loaded from the working copy.
fn raster_editor() -> (Editor, Box<UnknownTargetApplication>) {
    let (scene, id_map) = one_rect_scene();
    raster_with(scene, id_map)
}

fn raster_with(
    scene: Scene,
    id_map: HashMap<NodeId, Id>,
) -> (Editor, Box<UnknownTargetApplication>) {
    let doc = WorkingCopy::from_scene(scene, id_map);
    let editor = Editor::new(doc);
    let mut app = UnknownTargetApplication::new_raster(W, H, RendererOptions::default());
    // `new_raster` derives the backend pointer before the app reaches
    // its final (boxed) address — re-derive it here or the paint path
    // writes through a dangling interior pointer (the same trap the
    // shell works around for its GL backend).
    let surface_ptr = app.surface_mut_ptr();
    app.set_renderer_backend(grida::runtime::scene::Backend::Raster(surface_ptr));
    bridge::flush(editor.document(), app.renderer_mut());
    (editor, app)
}

/// Canvas → screen for the app's camera (rotation-free), derived from
/// the public inverse so the tests don't hardcode the view convention.
fn canvas_to_screen(app: &UnknownTargetApplication, canvas: [f32; 2]) -> (i32, i32) {
    let cam = &app.renderer().camera;
    let o = cam.screen_to_canvas_point([0.0, 0.0]);
    let ex = cam.screen_to_canvas_point([1.0, 0.0]);
    let ey = cam.screen_to_canvas_point([0.0, 1.0]);
    let (ax, bx) = (ex[0] - o[0], ey[0] - o[0]);
    let (ay, by) = (ex[1] - o[1], ey[1] - o[1]);
    let (dx, dy) = (canvas[0] - o[0], canvas[1] - o[1]);
    let det = ax * by - bx * ay;
    let sx = (dx * by - bx * dy) / det;
    let sy = (ax * dy - dx * ay) / det;
    (sx.round() as i32, sy.round() as i32)
}

/// The presented RGBA pixel at a canvas point.
fn pixel(app: &mut UnknownTargetApplication, canvas: [f32; 2]) -> [u8; 4] {
    let (x, y) = canvas_to_screen(app, canvas);
    assert!(
        (0..W).contains(&x) && (0..H).contains(&y),
        "probe ({x}, {y}) inside the {W}×{H} surface"
    );
    let surface = unsafe { &mut *app.surface_mut_ptr() };
    let img = surface.image_snapshot();
    let info = skia_safe::ImageInfo::new(
        (1, 1),
        skia_safe::ColorType::RGBA8888,
        skia_safe::AlphaType::Unpremul,
        None,
    );
    let mut buf = [0u8; 4];
    assert!(
        img.read_pixels(
            &info,
            &mut buf,
            4,
            skia_safe::IPoint::new(x, y),
            skia_safe::image::CachingHint::Disallow,
        ),
        "surface pixel readback"
    );
    buf
}

/// The full presented RGBA buffer (for whole-frame equality).
fn frame_rgba(app: &mut UnknownTargetApplication) -> Vec<u8> {
    let surface = unsafe { &mut *app.surface_mut_ptr() };
    let img = surface.image_snapshot();
    let info = skia_safe::ImageInfo::new(
        (W, H),
        skia_safe::ColorType::RGBA8888,
        skia_safe::AlphaType::Unpremul,
        None,
    );
    let mut buf = vec![0u8; (W * H * 4) as usize];
    assert!(
        img.read_pixels(
            &info,
            &mut buf,
            (W * 4) as usize,
            skia_safe::IPoint::new(0, 0),
            skia_safe::image::CachingHint::Disallow,
        ),
        "surface frame readback"
    );
    buf
}

#[track_caller]
fn assert_color(actual: [u8; 4], expected: CGColor, what: &str) {
    let expected = [expected.r, expected.g, expected.b, expected.a];
    let close = actual
        .iter()
        .zip(expected.iter())
        .all(|(a, e): (&u8, &u8)| a.abs_diff(*e) <= 2);
    assert!(close, "{what}: expected {expected:?}, painted {actual:?}");
}

// ── FRAME-1: no lost frames ─────────────────────────────────────────────

/// A property edit paints on the next presented frame after the
/// reflect point — no hover, pan, or any further input required. The
/// negative control documents the trap: without reflect, a redraw
/// request alone presents the stale mirror.
#[test]
fn frame_1_property_edit_paints_without_further_input() {
    let (mut editor, mut app) = raster_editor();
    app.redraw();
    assert_color(pixel(&mut app, [50.0, 50.0]), red(), "initial fill");

    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: Box::new(PropPatch {
                    fill_solid: Some(blue()),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("fill patch applies");

    // Negative control — the pre-frame-concept behavior: a redraw
    // request without the reflect point presents the stale mirror.
    app.redraw();
    assert_color(
        pixel(&mut app, [50.0, 50.0]),
        red(),
        "control: without reflect the presented frame is stale",
    );

    // The reflect point (FRAME-1): the same edit paints.
    let damage = editor.take_damage();
    assert!(!damage.structural, "a fill patch is property damage");
    assert!(bridge::reflect(
        editor.document(),
        app.renderer_mut(),
        &damage
    ));
    app.redraw();
    assert_color(
        pixel(&mut app, [50.0, 50.0]),
        blue(),
        "after reflect the edit is on screen",
    );
}

/// A *container's* position edit paints — and moves its reported
/// bounds (which shape the HUD's chrome) — on the next presented
/// frame, exactly like any other node's.
///
/// The regression this pins: a container's placement is a Taffy
/// input, routed through the renderer's `layout_result`; the
/// `ChangeKind::Layout` fast path skips Taffy, so a ledger that
/// classifies container motion as `Layout` leaves the frame painting
/// (and hit-testing) at its old place forever while the document —
/// and the properties panel reading it — says it moved. The ledger
/// must promote container motion to `Full`, mirroring the engine
/// differ (grida `runtime/invalidation/differ.rs`, `diff_node`).
#[test]
fn frame_1_container_position_edit_paints() {
    let (scene, id_map) = one_container_scene();
    let (mut editor, mut app) = raster_with(scene, id_map);
    app.redraw();
    assert_color(pixel(&mut app, [30.0, 50.0]), red(), "initial fill");
    assert_color(pixel(&mut app, [120.0, 50.0]), white(), "initially empty");

    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "K".to_string(),
                set: Box::new(PropPatch {
                    position: Some((60.0, 10.0)),
                    ..Default::default()
                }),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("position patch applies");
    assert_eq!(
        editor.node_position(&"K".to_string()),
        Some((60.0, 10.0)),
        "document truth moved"
    );

    let damage = editor.take_damage();
    assert!(!damage.structural, "a position patch is property damage");
    assert_eq!(
        damage.nodes,
        vec![(
            "K".to_string(),
            grida::runtime::invalidation::ChangeKind::Full
        )],
        "container motion is promoted past the Layout fast path"
    );
    assert!(bridge::reflect(
        editor.document(),
        app.renderer_mut(),
        &damage
    ));
    app.redraw();
    assert_color(
        pixel(&mut app, [120.0, 50.0]),
        red(),
        "after reflect the container paints at its new place",
    );
    assert_color(
        pixel(&mut app, [30.0, 50.0]),
        white(),
        "after reflect the old place is vacated",
    );
    let iid = editor
        .document()
        .internal_id(&"K".to_string())
        .expect("K resolves");
    let bounds = app.get_node_bounds(&iid).expect("K has bounds");
    assert_eq!(
        (bounds.x, bounds.y),
        (60.0, 10.0),
        "reported bounds (the HUD's chrome shape) moved with it"
    );
}

/// A drag-insert's silent previews paint *mid-drag*: after each
/// pointer-move's reflect, the growing node is on screen — not only
/// at pointer-up.
#[test]
fn frame_1_drag_insert_previews_paint_mid_drag() {
    let (mut editor, mut app) = raster_editor();
    app.redraw();
    assert_color(
        pixel(&mut app, [-90.0, -50.0]),
        white(),
        "insert area starts as background",
    );

    let mut tools = ToolMachine::new();
    tools.set_tool(Tool::Shape(ShapeKind::Rectangle));
    tools.pointer_down(&mut editor, [-120.0, -80.0], [-120.0, -80.0]);
    // Crosses the drag threshold: insert + first preview, silently,
    // inside the tool's gesture frame.
    tools.pointer_move(&mut editor, [-60.0, -20.0], [-60.0, -20.0]);

    let inserted = editor
        .children(None)
        .last()
        .cloned()
        .expect("the drag inserted a node");
    let fill = editor
        .node_fill_solid(&inserted)
        .expect("inserted rectangle has a solid fill");

    let damage = editor.take_damage();
    assert!(
        bridge::reflect(editor.document(), app.renderer_mut(), &damage),
        "mid-drag damage reflects"
    );
    app.redraw();
    assert_color(
        pixel(&mut app, [-90.0, -50.0]),
        fill,
        "mid-drag: the preview is on screen before pointer-up",
    );

    // Keep dragging: the preview keeps tracking, frame by frame.
    tools.pointer_move(&mut editor, [-30.0, 0.0], [-30.0, 0.0]);
    let damage = editor.take_damage();
    assert!(bridge::reflect(
        editor.document(),
        app.renderer_mut(),
        &damage
    ));
    app.redraw();
    assert_color(
        pixel(&mut app, [-45.0, -10.0]),
        fill,
        "the grown preview region is on screen",
    );

    // Pointer-up commits exactly one entry (TOOL-2 unchanged).
    tools.pointer_up(&mut editor, [-30.0, 0.0]);
    assert_eq!(editor.history_len(), 1);
}

// ── FRAME-3: narrow fidelity ────────────────────────────────────────────

/// Reflecting property damage narrowly presents the same pixels as a
/// wholesale reload of the same working copy.
#[test]
fn frame_3_narrow_reflect_equals_wholesale_flush() {
    let (mut editor_a, mut app_a) = raster_editor();
    let (mut editor_b, mut app_b) = raster_editor();
    app_a.redraw();
    app_b.redraw();

    let batch = vec![Mutation::Patch {
        id: "A".to_string(),
        set: Box::new(PropPatch {
            position: Some((40.0, 30.0)),
            fill_solid: Some(blue()),
            ..Default::default()
        }),
    }];
    for editor in [&mut editor_a, &mut editor_b] {
        editor
            .dispatch(
                batch.clone(),
                Origin::Local,
                Recording::Record { label: None },
            )
            .expect("patch applies");
    }

    // A reflects narrowly; B reloads wholesale.
    let damage = editor_a.take_damage();
    assert!(!damage.structural);
    assert!(bridge::reflect(
        editor_a.document(),
        app_a.renderer_mut(),
        &damage
    ));
    bridge::flush(editor_b.document(), app_b.renderer_mut());
    editor_b.take_damage();

    app_a.redraw();
    app_b.redraw();
    assert_eq!(
        frame_rgba(&mut app_a),
        frame_rgba(&mut app_b),
        "FRAME-3: narrow reflect and wholesale flush present identical frames"
    );
}

// ── FRAME-4: quiescence ─────────────────────────────────────────────────

/// Reflecting an empty ledger does nothing: it reports nothing to
/// reflect, and the presented frame is untouched.
#[test]
fn frame_4_empty_damage_reflects_nothing() {
    let (mut editor, mut app) = raster_editor();
    app.redraw();
    let before = frame_rgba(&mut app);

    let damage = editor.take_damage();
    assert!(damage.is_empty(), "no applies since load");
    assert!(!bridge::reflect(
        editor.document(),
        app.renderer_mut(),
        &damage
    ));
    app.redraw();
    assert_eq!(
        frame_rgba(&mut app),
        before,
        "FRAME-4: an idle reflect leaves the presented frame untouched"
    );
}

// ── FRAME-1 over structural damage ──────────────────────────────────────

/// Structural damage (a delete) escalates to a wholesale reload and
/// paints on the next presented frame like any other change.
#[test]
fn frame_1_structural_damage_paints() {
    let (mut editor, mut app) = raster_editor();
    app.redraw();
    assert_color(pixel(&mut app, [50.0, 50.0]), red(), "initial fill");

    editor
        .dispatch(
            vec![Mutation::Remove {
                id: "A".to_string(),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .expect("remove applies");
    let damage = editor.take_damage();
    assert!(damage.structural, "a remove is structural damage");
    assert!(bridge::reflect(
        editor.document(),
        app.renderer_mut(),
        &damage
    ));
    app.redraw();
    assert_color(
        pixel(&mut app, [50.0, 50.0]),
        white(),
        "the removed node is gone from the presented frame",
    );
}
