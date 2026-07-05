//! IO conformance (`docs/wg/canvas/io.md`, `IO-*`) plus the DOC-3
//! wire round-trip — headless, no renderer (`ARCH-1`).

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::schema::{Node, Size};
use math2::transform::AffineTransform;

use grida_editor::document::{Fragment, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::{io, wire};

// ── Helpers ──────────────────────────────────────────────────────────────

fn rect_fragment(id: &str, name: Option<&str>, x: f32, y: f32, w: f32, h: f32) -> Fragment {
    let nf = NodeFactory::new();
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(x, y, 0.0);
    rect.size = Size {
        width: w,
        height: h,
    };
    rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
        200, 40, 30, 255,
    )))]);
    Fragment {
        id: id.to_string(),
        name: name.map(str::to_string),
        node: Node::Rectangle(rect),
        children: Vec::new(),
    }
}

fn group_fragment(id: &str, name: Option<&str>, children: Vec<Fragment>) -> Fragment {
    let nf = NodeFactory::new();
    Fragment {
        id: id.to_string(),
        name: name.map(str::to_string),
        node: Node::Group(nf.create_group_node()),
        children,
    }
}

/// An editor over `A` (rect), `B` (rect), and `G` (group holding `C`).
fn base_editor() -> Editor {
    let mut editor = Editor::new(WorkingCopy::new_empty("io"));
    editor
        .dispatch(
            vec![
                Mutation::Insert {
                    parent: None,
                    index: 0,
                    fragment: Box::new(rect_fragment("A", None, 10.0, 10.0, 80.0, 80.0)),
                },
                Mutation::Insert {
                    parent: None,
                    index: 1,
                    fragment: Box::new(rect_fragment("B", None, 200.0, 10.0, 80.0, 80.0)),
                },
                Mutation::Insert {
                    parent: None,
                    index: 2,
                    fragment: Box::new(group_fragment(
                        "G",
                        None,
                        vec![rect_fragment("C", None, 300.0, 300.0, 40.0, 40.0)],
                    )),
                },
            ],
            Origin::Local,
            Recording::Silent,
        )
        .expect("base scene applies");
    editor
}

/// All stable ids of a subtree, pre-order.
fn subtree_ids(editor: &Editor, id: &str) -> Vec<String> {
    let mut out = vec![id.to_string()];
    for child in editor.children(Some(&id.to_string())) {
        out.extend(subtree_ids(editor, &child));
    }
    out
}

/// A wire snapshot of a subtree with ids blanked — property/structure
/// comparison for IO-4 (ids excepted by contract).
fn anonymized(editor: &Editor, id: &str) -> wire::WireNode {
    let fragment = editor
        .document()
        .capture(&id.to_string())
        .expect("subtree exists");
    let mut node = wire::encode_fragment(&fragment).expect("wire subset");
    blank_ids(&mut node);
    node
}

fn blank_ids(node: &mut wire::WireNode) {
    node.id = String::new();
    for child in &mut node.children {
        blank_ids(child);
    }
}

// ── DOC-3: the mutation vocabulary is serializable data ─────────────────

/// DOC-3 — encode → JSON → decode → apply ≡ apply. Every mutation kind
/// crosses the wire.
#[test]
fn doc3_wire_round_trip() {
    let batch = vec![
        Mutation::Insert {
            parent: Some("G".to_string()),
            index: 1,
            fragment: Box::new(group_fragment(
                "N",
                Some("new"),
                vec![rect_fragment("N1", None, 5.0, 6.0, 20.0, 20.0)],
            )),
        },
        Mutation::Patch {
            id: "A".to_string(),
            set: PropPatch {
                opacity: Some(0.5),
                position: Some((42.0, 43.0)),
                fill_solid: Some(CGColor::from_rgba(1, 2, 3, 255)),
                ..Default::default()
            },
        },
        // The general `fills` domain crosses the wire (a mixed multi-
        // paint stack) — distinct patch, since `fills` and `fill_solid`
        // are mutually exclusive in one patch.
        Mutation::Patch {
            id: "B".to_string(),
            set: PropPatch {
                fills: Some(grida::cg::prelude::Paints::new([
                    grida::cg::prelude::Paint::Solid(grida::cg::prelude::SolidPaint::new_color(
                        CGColor::from_rgba(9, 8, 7, 200),
                    )),
                    grida::cg::prelude::Paint::LinearGradient(
                        grida::cg::prelude::LinearGradientPaint::default(),
                    ),
                ])),
                ..Default::default()
            },
        },
        Mutation::Move {
            ids: vec!["B".to_string()],
            parent: Some("G".to_string()),
            index: 0,
        },
        Mutation::Remove {
            id: "C".to_string(),
        },
    ];

    let json =
        serde_json::to_string(&wire::encode_batch(&batch).expect("wire subset")).expect("json");
    let decoded: Vec<wire::WireMutation> = serde_json::from_str(&json).expect("json");
    let round_tripped = wire::decode_batch(&decoded);

    let mut direct = base_editor();
    let mut via_wire = base_editor();
    direct
        .dispatch(batch, Origin::Local, Recording::Silent)
        .expect("direct apply");
    via_wire
        .dispatch(round_tripped, Origin::Local, Recording::Silent)
        .expect("wire apply");

    assert!(
        direct.document().structure_eq(via_wire.document()),
        "wire round-trip must be apply-equivalent (DOC-3)"
    );
}

/// The envelope is versioned and self-describing: foreign formats and
/// newer versions are rejected, not misread.
#[test]
fn wire_envelope_rejects_foreign_and_newer() {
    assert!(matches!(
        wire::Envelope::from_json(
            r#"{"format":"not-grida","version":1,"payload":{"type":"fragments","fragments":[]}}"#
        ),
        Err(wire::WireError::Format(_))
    ));
    assert!(matches!(
        wire::Envelope::from_json(
            r#"{"format":"grida-editor/x","version":99,"payload":{"type":"fragments","fragments":[]}}"#
        ),
        Err(wire::WireError::Version(99))
    ));
}

/// ChangeSummary has a wire representation too (DOC-3 vocabulary).
#[test]
fn wire_change_summary_round_trip() {
    use grida::runtime::invalidation::ChangeKind;
    use grida_editor::document::ChangeSummary;

    let mut summary = ChangeSummary::default();
    summary.push("A".to_string(), ChangeKind::Layout);
    summary.push("B".to_string(), ChangeKind::Paint);

    let wire_summary: wire::WireChangeSummary = (&summary).into();
    let json = serde_json::to_string(&wire_summary).expect("json");
    let parsed: wire::WireChangeSummary = serde_json::from_str(&json).expect("json");
    let back: ChangeSummary = (&parsed).into();
    assert_eq!(summary.nodes, back.nodes);
}

// ── IO-1: document round-trip through the .grida encoder ────────────────

/// IO-1 — save → open yields a structure-equal working copy: node
/// identity (stable ids), order, and the M1 property set all survive
/// the native `.grida` encode/decode.
#[test]
fn io1_document_round_trip() {
    let mut editor = base_editor();
    // Make the properties non-default so survival is observable.
    editor
        .dispatch(
            vec![Mutation::Patch {
                id: "A".to_string(),
                set: PropPatch {
                    opacity: Some(0.25),
                    position: Some((17.0, 23.0)),
                    size: Some((Some(120.0), Some(60.0))),
                    fill_solid: Some(CGColor::from_rgba(9, 8, 7, 255)),
                    active: Some(false),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        )
        .expect("patch applies");

    let bytes = io::encode_document(editor.document());
    let (scene, id_map) = io::decode_document(&bytes).expect("decode saved document");
    let reloaded = WorkingCopy::from_scene(scene, id_map);

    assert!(
        editor.document().structure_eq(&reloaded),
        "open(save(doc)) must equal doc (IO-1)"
    );
    // Identity and order, explicitly.
    let reloaded_editor = Editor::new(reloaded);
    assert_eq!(reloaded_editor.children(None), vec!["A", "B", "G"]);
    assert_eq!(
        reloaded_editor.children(Some(&"G".to_string())),
        vec!["C".to_string()]
    );
}

// ── IO-3..6: clipboard ───────────────────────────────────────────────────

/// IO-3 — pasting the same envelope twice yields disjoint id sets, and
/// neither collides with pre-existing ids.
#[test]
fn io3_paste_mints_ids() {
    let mut editor = base_editor();
    let before: Vec<String> = subtree_ids(&editor, "G")
        .into_iter()
        .chain(["A".to_string(), "B".to_string()])
        .collect();

    let envelope = io::copy(&editor, &["G".to_string()]).expect("copy");
    let first = io::paste(&mut editor, &envelope, None).expect("paste 1");
    let second = io::paste(&mut editor, &envelope, None).expect("paste 2");

    let first_ids: Vec<String> = first
        .iter()
        .flat_map(|id| subtree_ids(&editor, id))
        .collect();
    let second_ids: Vec<String> = second
        .iter()
        .flat_map(|id| subtree_ids(&editor, id))
        .collect();

    assert_eq!(first_ids.len(), 2, "group + child");
    assert_eq!(second_ids.len(), 2);
    for id in &first_ids {
        assert!(!second_ids.contains(id), "id sets must be disjoint (IO-3)");
        assert!(!before.contains(id), "no collision with existing ids");
    }
    for id in &second_ids {
        assert!(!before.contains(id), "no collision with existing ids");
    }
}

/// IO-4 — copy → paste yields subtrees property- and structure-equal
/// to the originals (ids excepted; position offset by the paste's
/// +10,+10 nudge).
#[test]
fn io4_copy_paste_round_trip() {
    let mut editor = base_editor();
    let envelope = io::copy(&editor, &["G".to_string()]).expect("copy");
    let pasted = io::paste(&mut editor, &envelope, None).expect("paste");
    assert_eq!(pasted.len(), 1);

    let original = anonymized(&editor, "G");
    let mut copy = anonymized(&editor, &pasted[0]);
    // Undo the paste nudge on the top-level node for comparison.
    copy.position = copy.position.map(|(x, y)| (x - 10.0, y - 10.0));

    assert_eq!(
        original, copy,
        "pasted subtree must be property-equal (IO-4)"
    );
}

/// IO-5 — a fragment copied in instance A pastes in instance B: the
/// envelope is a plain self-describing string, no shared process
/// state; IO-3/IO-4 hold at the destination.
#[test]
fn io5_cross_instance_paste() {
    let editor_a = base_editor();
    let envelope = io::copy(&editor_a, &["G".to_string()]).expect("copy in A");

    // Instance B: a different document with its own ids (including a
    // clashing "n1"-style space once pasted twice).
    let mut editor_b = Editor::new(WorkingCopy::new_empty("other"));
    editor_b
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(rect_fragment("X", None, 0.0, 0.0, 10.0, 10.0)),
            }],
            Origin::Local,
            Recording::Silent,
        )
        .expect("b scene");

    let pasted = io::paste(&mut editor_b, &envelope, None).expect("paste in B");
    assert_eq!(pasted.len(), 1);
    let original = anonymized(&editor_a, "G");
    let mut copy = anonymized(&editor_b, &pasted[0]);
    copy.position = copy.position.map(|(x, y)| (x - 10.0, y - 10.0));
    assert_eq!(original, copy, "IO-4 holds across instances (IO-5)");

    // And IO-3 at the destination.
    let again = io::paste(&mut editor_b, &envelope, None).expect("paste again");
    assert_ne!(pasted, again);
}

/// IO-6 — a multi-node paste is one history entry: one undo removes
/// everything pasted and restores the prior selection.
#[test]
fn io6_paste_is_one_entry() {
    let mut editor = base_editor();
    editor.set_selection(vec!["A".to_string()]);
    let envelope = io::copy(
        &editor,
        &["A".to_string(), "B".to_string(), "G".to_string()],
    )
    .expect("copy");

    let entries_before = editor.history_len();
    let children_before = editor.children(None);

    let pasted = io::paste(&mut editor, &envelope, None).expect("paste");
    editor.set_selection(pasted.clone());
    assert_eq!(pasted.len(), 3);
    assert_eq!(editor.history_len(), entries_before + 1, "one entry (IO-6)");

    assert!(editor.undo(), "undo the paste");
    assert_eq!(
        editor.children(None),
        children_before,
        "one undo removes the whole paste"
    );
    for id in &pasted {
        assert!(!editor.document().contains(id));
    }
    assert_eq!(
        editor.selection(),
        &["A".to_string()],
        "prior selection restored (IO-6)"
    );
}

/// Copy encodes whole subtrees in document order: selecting a child
/// alongside its ancestor folds into the ancestor, and selection order
/// does not leak into the envelope.
#[test]
fn copy_is_whole_subtrees_in_document_order() {
    let editor = base_editor();
    // Selection lists C (inside G), G, and A — out of document order.
    let envelope = io::copy(
        &editor,
        &["C".to_string(), "G".to_string(), "A".to_string()],
    )
    .expect("copy");
    let parsed = wire::Envelope::from_json(&envelope).expect("own envelope parses");
    let wire::Payload::Fragments { fragments } = parsed.payload else {
        panic!("clipboard envelope carries fragments");
    };
    let ids: Vec<&str> = fragments.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, ["A", "G"], "document order, C folded into G");
    assert_eq!(fragments[1].children.len(), 1, "G carries its subtree");
}

/// Copying a node kind outside the wire subset is a reported error,
/// not a silent lossy encode (wire fidelity doctrine).
#[test]
fn copy_unsupported_kind_is_an_error() {
    let nf = NodeFactory::new();
    let mut editor = Editor::new(WorkingCopy::new_empty("t"));
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(Fragment {
                    id: "T".to_string(),
                    name: None,
                    node: Node::Path(nf.create_path_node()),
                    children: Vec::new(),
                }),
            }],
            Origin::Local,
            Recording::Silent,
        )
        .expect("insert text");

    match io::copy(&editor, &["T".to_string()]) {
        Err(io::IoError::Wire(wire::WireError::UnsupportedKind(kind))) => {
            assert_eq!(kind, "Path");
        }
        other => panic!("expected UnsupportedKind, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Vector networks on the wire (vector-edit.md; module-doc fidelity)
// ---------------------------------------------------------------------------

fn curved_network() -> grida::vectornetwork::VectorNetwork {
    use grida::vectornetwork::*;
    VectorNetwork {
        vertices: vec![(0.0, 0.0), (100.0, 0.0), (50.0, 80.0)],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment {
                a: 1,
                b: 2,
                ta: (10.0, 20.0),
                tb: (-10.0, 20.0),
            },
            VectorNetworkSegment::ab(2, 0),
        ],
        regions: vec![VectorNetworkRegion {
            loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
            fill_rule: FillRule::NonZero,
            fills: None,
        }],
    }
}

#[test]
fn vector_network_round_trips_in_full() {
    let mut editor = base_editor();
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index: 0,
                fragment: Box::new(grida_editor::tool::vector_fragment(
                    "curve".to_string(),
                    "Curve",
                    [10.0, 20.0],
                    curved_network(),
                )),
            }],
            Origin::Local,
            Recording::Record { label: None },
        )
        .unwrap();

    let json = io::copy(&editor, &["curve".to_string()]).expect("rich vectors ride the wire");
    let pasted = io::paste(&mut editor, &json, None).expect("paste");
    assert_eq!(pasted.len(), 1);

    let network = editor.node_vector_network(&pasted[0]).expect("network");
    let original = curved_network();
    assert_eq!(network.vertices, original.vertices);
    assert_eq!(network.segments, original.segments);
    assert_eq!(network.regions.len(), 1);
    assert_eq!(network.regions[0].loops[0].0, vec![0, 1, 2]);
    assert!(matches!(network.regions[0].fill_rule, FillRule::NonZero));
    assert!(network.regions[0].fills.is_none(), "paints do not ride");
}

#[test]
fn legacy_polyline_payload_still_decodes() {
    // A wire node written before the `network` field existed: Vector
    // kind carrying only `polyline`.
    let legacy = wire::WireNode {
        id: "old".to_string(),
        kind: wire::WireNodeKind::Vector,
        name: Some("Old".to_string()),
        active: true,
        opacity: 1.0,
        fill: None,
        blend_mode: None,
        corner_radius: None,
        point_count: None,
        clips_content: None,
        text_align: None,
        position: Some((5.0, 5.0)),
        size: None,
        rotation: None,
        text: None,
        polyline: Some(vec![(0.0, 0.0), (30.0, 0.0), (30.0, 30.0)]),
        network: None,
        marker_end: None,
        children: vec![],
    };
    let json = wire::Envelope::new(wire::Payload::Fragments {
        fragments: vec![legacy],
    })
    .to_json();

    let mut editor = base_editor();
    let pasted = io::paste(&mut editor, &json, None).expect("legacy payload decodes");
    let points = editor.node_vector_polyline(&pasted[0]).expect("polyline");
    assert_eq!(points, vec![(0.0, 0.0), (30.0, 0.0), (30.0, 30.0)]);
}

// ── IOX-7 — image paste (docs/wg/canvas/io-external.md) ─────────────────

/// IOX-7 (the paste half, headless): `io::insert_image` inserts an
/// image node at the raster's natural size, centered on the given
/// point, referencing the host image store's rid — one recorded
/// entry with a fresh id; undo removes it entirely. (The copy half —
/// rendering the selection and the system-clipboard flavors — is
/// shell wiring over the engine's subtree export.)
#[test]
fn iox_7_image_paste_inserts_natural_size_one_entry() {
    let mut editor = base_editor();
    let before = editor.history_len();
    let rid = "res://images/0123456789abcdef";

    let id = io::insert_image(&mut editor, rid, (64.0, 32.0), (100.0, 50.0)).expect("inserts");

    // Fresh id, appended at scene-root level.
    assert!(!["A", "B", "G", "C"].contains(&id.as_str()));
    assert_eq!(editor.children(None).last(), Some(&id));

    // An image node at natural size, centered on the paste point,
    // carrying the resource reference (the document holds the ref,
    // never the bytes).
    let fragment = editor.document().capture(&id).expect("captures");
    let Node::Image(rec) = &fragment.node else {
        panic!("expected an image node, got {:?}", fragment.node);
    };
    assert_eq!((rec.size.width, rec.size.height), (64.0, 32.0));
    assert_eq!((rec.transform.x(), rec.transform.y()), (68.0, 34.0));
    assert!(matches!(&rec.fill.image, ResourceRef::RID(r) if r == rid));
    assert!(matches!(&rec.image, ResourceRef::RID(r) if r == rid));

    // One recorded entry; undo removes the node entirely.
    assert_eq!(editor.history_len(), before + 1);
    assert!(editor.undo());
    assert!(!editor.document().contains(&id));

    // Repeat pastes mint disjoint ids (IO-3 discipline).
    assert!(editor.redo());
    let second = io::insert_image(&mut editor, rid, (64.0, 32.0), (100.0, 50.0)).expect("inserts");
    assert_ne!(second, id);
}

/// The wire must carry the *full* `PropPatch` M1 domain it claims to
/// mirror (`DOC-3`). Regression guard for the appearance fields
/// (`blend_mode`, `corner_radius`, `point_count`, `clips_content`,
/// `text_align`) that were previously silently dropped at encode and
/// zeroed at decode — a copy/paste + sync data-loss hole.
#[test]
fn wire_patch_carries_full_prop_patch_domain() {
    let patch = PropPatch {
        blend_mode: Some(LayerBlendMode::Blend(BlendMode::Multiply)),
        corner_radius: Some(8.0),
        point_count: Some(6),
        clips_content: Some(true),
        text_align: Some(TextAlign::Center),
        ..Default::default()
    };
    let wire_patch = wire::WirePatch::from(&patch);
    let json = serde_json::to_string(&wire_patch).expect("json");
    let decoded: wire::WirePatch = serde_json::from_str(&json).expect("json");
    let back = PropPatch::from(&decoded);

    assert_eq!(
        back.blend_mode,
        Some(LayerBlendMode::Blend(BlendMode::Multiply))
    );
    assert_eq!(back.corner_radius, Some(8.0));
    assert_eq!(back.point_count, Some(6));
    assert_eq!(back.clips_content, Some(true));
    assert_eq!(back.text_align, Some(TextAlign::Center));
}

// ── DOC-3: exhaustive wire node fidelity ─────────────────────────────────

/// A `WireNode` of the given kind with all optional fields empty.
fn wire_node(kind: wire::WireNodeKind) -> wire::WireNode {
    wire::WireNode {
        id: "w".to_string(),
        kind,
        name: None,
        active: true,
        opacity: 1.0,
        fill: None,
        blend_mode: None,
        corner_radius: None,
        point_count: None,
        clips_content: None,
        text_align: None,
        position: None,
        size: None,
        rotation: None,
        text: None,
        polyline: None,
        network: None,
        marker_end: None,
        children: vec![],
    }
}

/// Round-trip a single node through encode → JSON → decode → re-encode.
/// Equality of the two encodings proves every encoded field survives the
/// node (decode applied it, encode read it back).
fn node_round_trip(source: &wire::WireNode) -> wire::WireNode {
    let frag = wire::decode_fragment(source);
    let encoded = wire::encode_fragment(&frag).expect("wire subset");
    let json = serde_json::to_string(&encoded).expect("json");
    let decoded: wire::WireNode = serde_json::from_str(&json).expect("json");
    let refrag = wire::decode_fragment(&decoded);
    wire::encode_fragment(&refrag).expect("wire subset")
}

/// A Line's end marker must round-trip as the *actual* preset, not be
/// coerced to `RightTriangleOpen` (the `arrow_end` lossy-bool bug).
#[test]
fn wire_line_marker_round_trips_faithfully() {
    let mut src = wire_node(wire::WireNodeKind::Line);
    src.marker_end = Some(StrokeMarkerPreset::Diamond);
    let out = node_round_trip(&src);
    assert_eq!(
        out.marker_end,
        Some(StrokeMarkerPreset::Diamond),
        "the diamond marker must survive — not become a triangle"
    );
}

/// The appearance fields the wire claims to mirror must survive a node
/// round-trip (`blend_mode`, `corner_radius`, `point_count`,
/// `clips_content`, `text_align`) — previously dropped by `WireNode`.
#[test]
fn wire_node_carries_appearance_fields() {
    let mut rect = wire_node(wire::WireNodeKind::Rectangle);
    rect.corner_radius = Some(8.0);
    rect.blend_mode = Some(wire::WireBlendMode::Blend(BlendMode::Multiply));
    let out = node_round_trip(&rect);
    assert_eq!(out.corner_radius, Some(8.0));
    assert_eq!(
        out.blend_mode,
        Some(wire::WireBlendMode::Blend(BlendMode::Multiply))
    );

    let mut container = wire_node(wire::WireNodeKind::Container);
    container.clips_content = Some(true);
    assert_eq!(node_round_trip(&container).clips_content, Some(true));

    let mut poly = wire_node(wire::WireNodeKind::RegularPolygon);
    poly.point_count = Some(7);
    assert_eq!(node_round_trip(&poly).point_count, Some(7));

    let mut text = wire_node(wire::WireNodeKind::Text);
    text.text_align = Some(TextAlign::Center);
    assert_eq!(node_round_trip(&text).text_align, Some(TextAlign::Center));
}

/// Every `WireNodeKind` encodes and round-trips without error (coverage
/// against a kind silently falling out of the wire subset).
#[test]
fn wire_every_node_kind_round_trips() {
    use wire::WireNodeKind::*;
    for kind in [
        Rectangle,
        Ellipse,
        RegularPolygon,
        RegularStarPolygon,
        Line,
        Group,
        Container,
        Tray,
        Text,
        Vector,
    ] {
        let out = node_round_trip(&wire_node(kind));
        assert_eq!(out.kind, kind, "kind {kind:?} must round-trip");
    }
}

/// A foreign/corrupt fragment with out-of-range vector indices must
/// decode to a consistent network (bad references dropped), never panic
/// (`IO-5` cross-instance paste of untrusted bytes).
#[test]
fn wire_vector_network_drops_out_of_range_indices() {
    let wire_vn = wire::WireVectorNetwork {
        vertices: vec![(0.0, 0.0), (10.0, 0.0)],
        segments: vec![
            wire::WireVectorSegment {
                a: 0,
                b: 1,
                ta: (0.0, 0.0),
                tb: (0.0, 0.0),
            },
            // Dangling: vertex 999 does not exist.
            wire::WireVectorSegment {
                a: 0,
                b: 999,
                ta: (0.0, 0.0),
                tb: (0.0, 0.0),
            },
        ],
        regions: vec![wire::WireVectorRegion {
            // References the dropped segment (index 1) — the whole loop
            // must be dropped, not left dangling.
            loops: vec![vec![0, 1]],
            fill_rule: FillRule::NonZero,
        }],
    };
    let net = grida::vectornetwork::VectorNetwork::from(&wire_vn);
    assert_eq!(net.vertices.len(), 2, "vertices are preserved");
    assert_eq!(net.segments.len(), 1, "the dangling segment is dropped");
    assert_eq!(net.segments[0].b, 1, "the valid segment survives intact");
    assert!(
        net.regions.is_empty(),
        "a region whose only loop referenced a dropped segment is dropped"
    );
}
