//! Shared helpers for fixture generators.

pub use std::collections::HashMap;

pub use cg::cg::alignment::Alignment;
pub use cg::cg::color::CGColor;
pub use cg::cg::stroke_width::{SingularStrokeWidth, StrokeWidth};
pub use cg::cg::tilemode::TileMode;
pub use cg::cg::types::*;
pub use math2::box_fit::BoxFit;
use cg::io::io_grida_fbs;
pub use cg::node::scene_graph::SceneGraph;
pub use cg::node::schema::*;
pub use math2::transform::AffineTransform;

// ═════════════════════════════════════════════════════════════════════════════
// Scene building
// ═════════════════════════════════════════════════════════════════════════════

/// Build a `Scene` from `(id, node)` pairs, parent→children links, and root ids.
pub fn build_scene(
    name: &str,
    bg: Option<CGColor>,
    nodes: Vec<(NodeId, Node)>,
    links: HashMap<NodeId, Vec<NodeId>>,
    roots: Vec<NodeId>,
) -> Scene {
    let graph = SceneGraph::new_from_snapshot(nodes, links, roots);
    Scene {
        name: name.to_owned(),
        graph,
        background_color: bg,
    }
}

/// Build id_map and position_map with a prefix to avoid collisions in multi-scene files. every node ID to avoid collisions in multi-scene files.
pub fn build_maps_prefixed(
    scene: &Scene,
    id_map: &mut HashMap<NodeId, String>,
    position_map: &mut HashMap<NodeId, String>,
    prefix: &str,
) {
    fn walk(
        graph: &SceneGraph,
        nid: &NodeId,
        counter: &mut usize,
        id_map: &mut HashMap<NodeId, String>,
        position_map: &mut HashMap<NodeId, String>,
        prefix: &str,
    ) {
        id_map.entry(*nid).or_insert_with(|| format!("{prefix}n{nid}"));
        if let Some(children) = graph.get_children(nid) {
            for (i, child) in children.clone().iter().enumerate() {
                let pos = format!("a{i:04}");
                position_map.insert(*child, pos);
                walk(graph, child, counter, id_map, position_map, prefix);
            }
        }
        *counter += 1;
    }
    let mut counter = 0usize;
    for root in scene.graph.roots() {
        walk(&scene.graph, &root, &mut counter, id_map, position_map, prefix);
    }
}

fn fixtures_dir() -> std::path::PathBuf {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest.join("../../fixtures/test-grida")
}

/// Encode scenes into raw FlatBuffers bytes.
fn encode_scenes(scenes: &[(&str, Scene)]) -> Vec<u8> {
    let mut entries_data: Vec<(
        String,
        HashMap<NodeId, String>,
        HashMap<NodeId, String>,
    )> = Vec::new();

    for (i, (key, scene)) in scenes.iter().enumerate() {
        let scene_id = key.to_string();
        let mut id_map = HashMap::new();
        let mut position_map = HashMap::new();
        build_maps_prefixed(scene, &mut id_map, &mut position_map, &format!("s{}_", i));
        entries_data.push((scene_id, id_map, position_map));
    }

    let entries: Vec<(
        &str,
        &Scene,
        &HashMap<NodeId, String>,
        &HashMap<NodeId, String>,
    )> = scenes
        .iter()
        .zip(entries_data.iter())
        .map(|((_, scene), (scene_id, id_map, position_map))| {
            (scene_id.as_str(), scene, id_map, position_map)
        })
        .collect();

    io_grida_fbs::encode_multi(&entries)
}

/// Wrap raw FlatBuffers bytes in a `.grida` ZIP archive (production format).
fn wrap_zip(fbs_bytes: &[u8]) -> Vec<u8> {
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let manifest = r#"{"document_file":"document.grida"}"#;
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("manifest.json", opts).unwrap();
    zip.write_all(manifest.as_bytes()).unwrap();

    zip.start_file("document.grida", opts).unwrap();
    zip.write_all(fbs_bytes).unwrap();

    zip.finish().unwrap().into_inner()
}

/// Encode multiple scenes into a raw `.grida` FlatBuffer file with decode verification.
pub fn write_multi_fixture(scenes: &[(&str, Scene)], name: &str) {
    let bytes = encode_scenes(scenes);
    assert!(!bytes.is_empty(), "{name}: encoded bytes empty");

    let decoded = io_grida_fbs::decode_all(&bytes)
        .unwrap_or_else(|e| panic!("{name}: decode failed: {e}"));
    assert_eq!(
        decoded.len(),
        scenes.len(),
        "{name}: expected {} scenes, got {}",
        scenes.len(),
        decoded.len()
    );
    for (i, ((_, original), decoded_scene)) in scenes.iter().zip(decoded.iter()).enumerate() {
        assert_eq!(
            original.name, decoded_scene.name,
            "{name}: scene[{i}] name mismatch"
        );
    }

    let dir = fixtures_dir();
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{name}.grida"));
    std::fs::write(&path, &bytes).unwrap();
    eprintln!(
        "Wrote {} bytes ({} scenes) to {}",
        bytes.len(),
        scenes.len(),
        path.display()
    );
}

/// Encode multiple scenes into a ZIP-wrapped `.grida` archive (production format)
/// with decode round-trip verification.
pub fn write_multi_fixture_zip(scenes: &[(&str, Scene)], name: &str) {
    let fbs_bytes = encode_scenes(scenes);
    assert!(!fbs_bytes.is_empty(), "{name}: encoded bytes empty");

    let decoded = io_grida_fbs::decode_all(&fbs_bytes)
        .unwrap_or_else(|e| panic!("{name}: decode failed: {e}"));
    assert_eq!(
        decoded.len(),
        scenes.len(),
        "{name}: expected {} scenes, got {}",
        scenes.len(),
        decoded.len()
    );
    for (i, ((_, original), decoded_scene)) in scenes.iter().zip(decoded.iter()).enumerate() {
        assert_eq!(
            original.name, decoded_scene.name,
            "{name}: scene[{i}] name mismatch"
        );
    }

    let zip_bytes = wrap_zip(&fbs_bytes);

    let dir = fixtures_dir();
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{name}.grida"));
    std::fs::write(&path, &zip_bytes).unwrap();
    eprintln!(
        "Wrote {} bytes (zip, fbs={} bytes, {} scenes) to {}",
        zip_bytes.len(),
        fbs_bytes.len(),
        scenes.len(),
        path.display()
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Paint builders
// ═════════════════════════════════════════════════════════════════════════════

pub fn solid(r: u8, g: u8, b: u8, a: u8) -> Paint {
    Paint::Solid(SolidPaint {
        active: true,
        color: CGColor { r, g, b, a },
        blend_mode: BlendMode::Normal,
    })
}

pub fn linear_gradient() -> Paint {
    Paint::LinearGradient(LinearGradientPaint {
        active: true,
        xy1: Alignment::CENTER_LEFT,
        xy2: Alignment::CENTER_RIGHT,
        tile_mode: TileMode::default(),
        transform: AffineTransform::default(),
        stops: vec![
            GradientStop { offset: 0.0, color: CGColor { r: 255, g: 0, b: 0, a: 255 } },
            GradientStop { offset: 1.0, color: CGColor { r: 0, g: 0, b: 255, a: 255 } },
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    })
}

pub fn radial_gradient() -> Paint {
    Paint::RadialGradient(RadialGradientPaint {
        active: true,
        transform: AffineTransform::default(),
        stops: vec![
            GradientStop { offset: 0.0, color: CGColor { r: 255, g: 255, b: 0, a: 255 } },
            GradientStop { offset: 1.0, color: CGColor { r: 0, g: 128, b: 0, a: 200 } },
        ],
        opacity: 0.8,
        blend_mode: BlendMode::Normal,
        tile_mode: TileMode::default(),
    })
}

pub fn sweep_gradient() -> Paint {
    Paint::SweepGradient(SweepGradientPaint {
        active: true,
        transform: AffineTransform::default(),
        stops: vec![
            GradientStop { offset: 0.0, color: CGColor { r: 0, g: 255, b: 255, a: 255 } },
            GradientStop { offset: 0.5, color: CGColor { r: 255, g: 0, b: 255, a: 255 } },
            GradientStop { offset: 1.0, color: CGColor { r: 255, g: 255, b: 0, a: 255 } },
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    })
}

/// The system checker image bundled in the renderer. Use this for all fixture
/// image paints so they actually render in the native demo.
pub const SYSTEM_IMAGE: &str = "system://images/checker-16-strip-L98L92.png";

pub fn image_paint() -> Paint {
    image_paint_with(ResourceRef::HASH(SYSTEM_IMAGE.to_owned()), ImagePaintFit::Fit(BoxFit::Cover))
}

pub fn image_paint_with(image: ResourceRef, fit: ImagePaintFit) -> Paint {
    Paint::Image(ImagePaint {
        active: true,
        image,
        fit,
        filters: ImageFilters::default(),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        quarter_turns: 0,
        alignement: Alignment::CENTER,
    })
}

// ═════════════════════════════════════════════════════════════════════════════
// Node builders
// ═════════════════════════════════════════════════════════════════════════════

/// Simple rectangle with one fill.
pub fn rect(x: f32, y: f32, w: f32, h: f32, fill: Paint) -> Node {
    Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, y, w, h, 0.0),
        size: Size { width: w, height: h },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![fill]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        layout_child: None,
    })
}

/// Rectangle with rotation.
pub fn rect_rotated(x: f32, y: f32, w: f32, h: f32, rotation: f32, fill: Paint) -> Node {
    Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, y, w, h, rotation),
        size: Size { width: w, height: h },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![fill]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        layout_child: None,
    })
}

/// Simple ellipse with one fill.
pub fn ellipse(x: f32, y: f32, w: f32, h: f32, fill: Paint) -> Node {
    Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, y, w, h, 0.0),
        size: Size { width: w, height: h },
        fills: Paints::new(vec![fill]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    })
}

/// Simple line.
pub fn line(x: f32, y: f32, length: f32, rotation: f32, stroke_width: f32) -> Node {
    Node::Line(LineNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::new(x, y, rotation),
        size: Size { width: length, height: 0.0 },
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_width,
        stroke_cap: StrokeCap::Butt,
        stroke_miter_limit: StrokeMiterLimit(4.0),
        stroke_dash_array: None,
        _data_stroke_align: StrokeAlign::Center,
        marker_start_shape: StrokeMarkerPreset::None,
        marker_end_shape: StrokeMarkerPreset::None,
        layout_child: None,
    })
}

/// Simple text span.
pub fn text(x: f32, y: f32, content: &str, font_size: f32, font_weight: u32) -> Node {
    Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(x, y, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: content.to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", font_size);
            ts.font_weight = FontWeight(font_weight);
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    })
}

/// Rectangle with effects (shadows, blur, etc.).
pub fn rect_with_effects(x: f32, y: f32, w: f32, h: f32, fill: Paint, effects: LayerEffects) -> Node {
    Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, y, w, h, 0.0),
        size: Size { width: w, height: h },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![fill]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects,
        layout_child: None,
    })
}

/// Simple flat scene: all nodes at the root level, auto-assigned positions.
pub fn flat_scene(name: &str, nodes: Vec<Node>) -> Scene {
    let mut pairs = Vec::new();
    for (i, node) in nodes.into_iter().enumerate() {
        pairs.push(((i + 1) as u64, node));
    }
    let roots: Vec<u64> = pairs.iter().map(|(id, _)| *id).collect();
    build_scene(name, None, pairs, HashMap::new(), roots)
}
