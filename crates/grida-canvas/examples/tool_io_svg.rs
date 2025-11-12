//! Minimal SVG import inspector with PNG export support.
//! Usage: `cargo run --example tool_io_svg <svg> [--png out.png] [--scale 1.0]`

use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use clap::Parser;
use math2::{rect, rect::Rectangle};

use cg::{
    cache::geometry::GeometryCache,
    export::{
        export_as_image::export_node_as_image, ExportAsImage, ExportAsPNG, ExportSize, Exported,
    },
    node::{
        scene_graph::SceneGraph,
        schema::{Node, NodeId, Scene},
    },
    resources::ByteStore,
    runtime::{font_repository::FontRepository, image_repository::ImageRepository},
    svg::pack,
};

#[derive(Parser, Debug)]
#[command(author, version, about = "Inspect an SVG and optionally export a PNG.")]
struct Cli {
    path: PathBuf,
    #[arg(long = "png")]
    png: Option<PathBuf>,
    #[arg(long = "scale", default_value_t = 1.0)]
    scale: f32,
    #[arg(long = "log-usvg")]
    log_usvg: bool,
    #[arg(long = "log-scene")]
    log_scene: bool,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    println!("→ Loading SVG: {}", cli.path.display());

    let svg_source =
        fs::read_to_string(&cli.path).map_err(|err| format!("Failed to read file: {err}"))?;

    let tree = parse_usvg(&svg_source)?;
    let graph =
        pack::from_svg_str(&svg_source).map_err(|err| format!("Grida importer error: {err}"))?;
    let scene = Scene {
        name: cli
            .path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Unnamed SVG".to_string()),
        graph,
        background_color: None,
    };

    println!(
        "• SVG viewport: {:.2} × {:.2}",
        tree.size().width(),
        tree.size().height()
    );

    let usvg_stats = UsvgStats::from_tree(tree.root(), cli.log_usvg);
    println!(
        "• usvg node counts: groups={}, paths={}, images={}, text={}, total={}",
        usvg_stats.groups, usvg_stats.paths, usvg_stats.images, usvg_stats.texts, usvg_stats.total
    );

    let scene_stats = SceneStats::from_scene(&scene, cli.log_scene);
    println!("• importer node counts:");
    for (label, count) in scene_stats.counts {
        println!("  - {:<12} {}", label, count);
    }
    for (id, msg) in scene_stats.placeholders {
        println!("! placeholder {:?}: {}", id, msg);
    }

    if let Some(out_path) = cli.png {
        export_png(&scene, &tree, out_path, cli.scale)?;
    }

    Ok(())
}

fn parse_usvg(svg: &str) -> Result<usvg::Tree, String> {
    let mut options = usvg::Options::default();
    options.fontdb_mut().load_system_fonts();
    usvg::Tree::from_str(svg, &options).map_err(|err| format!("usvg parse error: {err}"))
}

#[derive(Default)]
struct UsvgStats {
    groups: usize,
    paths: usize,
    images: usize,
    texts: usize,
    total: usize,
}

impl UsvgStats {
    fn from_tree(root: &usvg::Group, verbose: bool) -> Self {
        let mut stats = Self::default();
        stats.visit_group(root, 0, verbose);
        stats
    }

    fn visit_group(&mut self, group: &usvg::Group, depth: usize, verbose: bool) {
        self.groups += 1;
        self.total += 1;
        if verbose {
            println!(
                "{indent}group id=\"{}\" children={} opacity={:.2}",
                group.id(),
                group.children().len(),
                group.opacity().get(),
                indent = "  ".repeat(depth)
            );
        }

        for child in group.children() {
            match child {
                usvg::Node::Group(g) => self.visit_group(g, depth + 1, verbose),
                usvg::Node::Path(p) => {
                    self.paths += 1;
                    self.total += 1;
                    if verbose {
                        println!(
                            "{indent}path id=\"{}\" segments={} fill={} stroke={}",
                            p.id(),
                            p.data().verbs().len(),
                            p.fill().is_some(),
                            p.stroke().is_some(),
                            indent = "  ".repeat(depth + 1)
                        );
                    }
                }
                usvg::Node::Image(i) => {
                    self.images += 1;
                    self.total += 1;
                    if verbose {
                        let size = i.size();
                        println!(
                            "{indent}image id=\"{}\" size={:.1}×{:.1}",
                            i.id(),
                            size.width(),
                            size.height(),
                            indent = "  ".repeat(depth + 1)
                        );
                    }
                }
                usvg::Node::Text(t) => {
                    self.texts += 1;
                    self.total += 1;
                    if verbose {
                        let sample = t.chunks().first().map(|c| c.text().trim()).unwrap_or("");
                        println!(
                            "{indent}text id=\"{}\" chunks={} sample=\"{}\"",
                            t.id(),
                            t.chunks().len(),
                            sample,
                            indent = "  ".repeat(depth + 1)
                        );
                    }
                }
            }
        }
    }
}

struct SceneStats {
    counts: BTreeMap<&'static str, usize>,
    placeholders: Vec<(NodeId, String)>,
}

impl SceneStats {
    fn from_scene(scene: &Scene, verbose: bool) -> Self {
        let mut stats = SceneStats {
            counts: BTreeMap::new(),
            placeholders: Vec::new(),
        };

        for root in scene.graph.roots() {
            stats.visit(&scene.graph, root, 0, verbose);
        }

        stats
    }

    fn visit(&mut self, graph: &SceneGraph, id: &NodeId, depth: usize, verbose: bool) {
        let Ok(node) = graph.get_node(id) else {
            return;
        };

        let label = classify_node(node);
        *self.counts.entry(label).or_default() += 1;

        if verbose {
            println!("{indent}{:?} ⇒ {}", id, label, indent = "  ".repeat(depth));
        }

        if let Node::Error(err) = node {
            self.placeholders.push((id.clone(), err.error.clone()));
        }

        if let Some(children) = graph.get_children(id) {
            for child in children {
                self.visit(graph, child, depth + 1, verbose);
            }
        }
    }
}

fn classify_node(node: &Node) -> &'static str {
    match node {
        Node::InitialContainer(_) => "initial_container",
        Node::Container(_) => "container",
        Node::Group(_) => "group",
        Node::Vector(_) => "vector",
        Node::SVGPath(_) => "svg_path",
        Node::BooleanOperation(_) => "boolean",
        Node::Rectangle(_) => "rectangle",
        Node::Ellipse(_) => "ellipse",
        Node::Polygon(_) => "polygon",
        Node::RegularPolygon(_) => "regular_polygon",
        Node::RegularStarPolygon(_) => "star_polygon",
        Node::Line(_) => "line",
        Node::Image(_) => "image",
        Node::TextSpan(_) => "text",
        Node::Error(_) => "error",
    }
}

fn export_png(
    scene: &Scene,
    tree: &usvg::Tree,
    output: PathBuf,
    scale: f32,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("→ Exporting raster preview to {}", output.display());

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();
    let images = ImageRepository::new(store);

    let geometry = GeometryCache::from_scene(scene, &fonts);
    let bounds = scene
        .graph
        .roots()
        .iter()
        .filter_map(|id| geometry.get_render_bounds(id))
        .reduce(|acc, rect| rect::union(&[acc, rect]))
        .unwrap_or_else(|| Rectangle {
            x: 0.0,
            y: 0.0,
            width: tree.size().width().max(1.0),
            height: tree.size().height().max(1.0),
        });

    let export_size = ExportSize {
        width: (bounds.width * scale).max(1.0),
        height: (bounds.height * scale).max(1.0),
    };

    match export_node_as_image(
        scene,
        &fonts,
        &images,
        export_size,
        bounds,
        ExportAsImage::PNG(ExportAsPNG::default()),
    ) {
        Some(Exported::PNG(bytes)) => {
            fs::write(&output, bytes)?;
            println!("✓ PNG written to {}", output.display());
        }
        Some(other) => {
            fs::write(&output, other.data())?;
            println!(
                "⚠ PNG request returned different format; raw bytes written to {}",
                output.display()
            );
        }
        None => return Err("Failed to render PNG snapshot".into()),
    }

    Ok(())
}
