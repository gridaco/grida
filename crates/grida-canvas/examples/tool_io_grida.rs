//! Grida File Inspector
//!
//! Validates and inspects `.grida` / `.grida1` files in any format
//! (FlatBuffers, ZIP archive, or legacy JSON).
//!
//! ## Usage
//!
//! ```bash
//! # Basic inspection (decode + node stats)
//! cargo run --example tool_io_grida -- path/to/file.grida
//!
//! # Also accepts .grida1 extension
//! cargo run --example tool_io_grida -- path/to/file.grida1
//!
//! # List scenes (FBS/ZIP multi-scene files)
//! cargo run --example tool_io_grida -- path/to/file.grida --list-scenes
//!
//! # Inspect a specific scene (0-based index)
//! cargo run --example tool_io_grida -- path/to/file.grida --scene 1
//!
//! # Run layout check (detect containers missing layout results)
//! cargo run --example tool_io_grida -- path/to/file.grida --layout-check
//!
//! # Verbose: print full node tree with IDs
//! cargo run --example tool_io_grida -- path/to/file.grida --verbose
//! ```
//!
//! ## Diagnostics
//!
//! The `--layout-check` flag runs the layout engine on the selected scene(s)
//! and reports every `Container` node that is missing from the layout result.
//! This is the direct cause of:
//!
//! ```text
//! Container must have layout result when layout engine is used
//! ```
//!
//! Use the reported string IDs / ancestor paths to correlate with the source
//! document (e.g. fig2grida converter output).
//!
//! ## Exit Codes
//!
//! - `0` — Success (all checks pass)
//! - `1` — Decode error, file read error, or layout-check failures found

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use clap::Parser;

use cg::io::io_grida;
use cg::io::io_grida_file::{self, Format};
use cg::layout::engine::LayoutEngine;
use cg::node::id::NodeId;
use cg::node::scene_graph::SceneGraph;
use cg::node::schema::{Node, Scene, Size};

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Inspect and validate .grida / .grida1 files (FBS, ZIP, or JSON)."
)]
struct Cli {
    /// Path to a `.grida` or `.grida1` file.
    path: PathBuf,

    /// List available scenes and exit (FBS/ZIP multi-scene files).
    #[arg(long = "list-scenes")]
    list_scenes: bool,

    /// Scene index to inspect (0-based). Defaults to all scenes.
    #[arg(long = "scene")]
    scene_index: Option<usize>,

    /// Run layout-engine check: report containers missing layout results.
    #[arg(long = "layout-check")]
    layout_check: bool,

    /// Print the full node tree with string IDs (FBS/ZIP) or node details (JSON).
    #[arg(long = "verbose")]
    verbose: bool,
}

fn main() {
    let cli = Cli::parse();

    // ── Read & detect format ────────────────────────────────────────────
    let bytes = match fs::read(&cli.path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("error: failed to read {}: {e}", cli.path.display());
            std::process::exit(1);
        }
    };

    let format = io_grida_file::detect(&bytes);
    println!("File:   {}", cli.path.display());
    println!("Size:   {} bytes", bytes.len());
    println!("Format: {}", format);
    println!();

    match format {
        Format::Json => inspect_json(&bytes, &cli),
        Format::RawFbs | Format::Zip => inspect_fbs(&bytes, &cli),
        Format::Unknown => {
            eprintln!("error: unrecognized format. Expected .grida FlatBuffers, ZIP, or JSON.");
            std::process::exit(1);
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// JSON inspection path
// ═════════════════════════════════════════════════════════════════════════════

fn inspect_json(bytes: &[u8], cli: &Cli) {
    // --list-scenes and --scene are FBS/ZIP-only features; reject them for
    // legacy JSON input to avoid silent misuse.
    if cli.list_scenes {
        eprintln!(
            "error: --list-scenes is not supported for legacy JSON files (single scene only)."
        );
        std::process::exit(1);
    }
    if cli.scene_index.is_some() {
        eprintln!("error: --scene is not supported for legacy JSON files (single scene only).");
        std::process::exit(1);
    }

    let content = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: invalid UTF-8: {e}");
            std::process::exit(1);
        }
    };

    let file = match io_grida::parse(content) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("error: failed to parse JSON: {e}");
            std::process::exit(1);
        }
    };

    println!("Nodes:       {}", file.document.nodes.len());
    println!("Scenes:      {:?}", file.document.scenes_ref);
    println!("Entry scene: {:?}", file.document.entry_scene_id);

    // Node type breakdown
    let mut type_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for node in file.document.nodes.values() {
        let type_name = classify_json_node(node);
        *type_counts.entry(type_name).or_default() += 1;
    }

    if !type_counts.is_empty() {
        println!("Node types:");
        for (name, count) in &type_counts {
            println!("  {:<22} {}", name, count);
        }
    }

    if cli.verbose {
        println!("\nNode details:");
        for (id, node) in &file.document.nodes {
            println!("  {} -> {}", id, classify_json_node(node));
        }
    }

    if cli.layout_check {
        // For JSON, we need to convert to Scene first and then run layout check.
        let scenes = match io_grida_file::decode_all(bytes) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("error: failed to convert JSON to scene: {e}");
                std::process::exit(1);
            }
        };

        let empty_id_map = HashMap::new();
        let mut has_failures = false;
        for (i, scene) in scenes.iter().enumerate() {
            println!("\n━━━ Scene [{}] \"{}\" ━━━", i, scene.name);
            if !run_layout_check(scene, &empty_id_map) {
                has_failures = true;
            }
        }
        if has_failures {
            std::process::exit(1);
        }
    }
}

fn classify_json_node(node: &io_grida::JSONNode) -> &'static str {
    match node {
        io_grida::JSONNode::Group(_) => "group",
        io_grida::JSONNode::Container(_) => "container",
        io_grida::JSONNode::Vector(_) => "vector",
        io_grida::JSONNode::Path(_) => "path",
        io_grida::JSONNode::Ellipse(_) => "ellipse",
        io_grida::JSONNode::Rectangle(_) => "rectangle",
        io_grida::JSONNode::RegularPolygon(_) => "polygon",
        io_grida::JSONNode::RegularStarPolygon(_) => "star",
        io_grida::JSONNode::Line(_) => "line",
        io_grida::JSONNode::TextSpan(_) => "tspan",
        io_grida::JSONNode::BooleanOperation(_) => "boolean",
        io_grida::JSONNode::Image(_) => "image",
        io_grida::JSONNode::Scene(_) => "scene",
        io_grida::JSONNode::Unknown(_) => "unknown",
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// FBS / ZIP inspection path
// ═════════════════════════════════════════════════════════════════════════════

fn inspect_fbs(bytes: &[u8], cli: &Cli) {
    let decoded = match io_grida_file::decode_with_id_map(bytes) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("error: failed to decode: {e}");
            std::process::exit(1);
        }
    };

    let scenes = &decoded.scenes;
    let id_map = &decoded.id_map;
    let position_map = &decoded.position_map;

    println!("Scenes:             {}", scenes.len());
    println!("ID map entries:     {}", id_map.len());
    println!("Position map entries: {}", position_map.len());
    println!();

    // ── List scenes ─────────────────────────────────────────────────────
    if cli.list_scenes {
        print_scene_list(scenes);
        return;
    }

    // ── Determine which scenes to inspect ───────────────────────────────
    let scene_indices: Vec<usize> = if let Some(idx) = cli.scene_index {
        if idx >= scenes.len() {
            eprintln!(
                "error: scene index {} out of range (0..{}). Use --list-scenes.",
                idx,
                scenes.len()
            );
            std::process::exit(1);
        }
        vec![idx]
    } else {
        (0..scenes.len()).collect()
    };

    let mut has_failures = false;

    for &idx in &scene_indices {
        let scene = &scenes[idx];
        println!("━━━ Scene [{}] \"{}\" ━━━", idx, scene.name);
        print_scene_stats(scene, id_map, cli.verbose);

        if cli.layout_check && !run_layout_check(scene, id_map) {
            has_failures = true;
        }

        println!();
    }

    if has_failures {
        std::process::exit(1);
    }
}

fn print_scene_list(scenes: &[Scene]) {
    println!("Available scenes:");
    for (i, s) in scenes.iter().enumerate() {
        println!("  [{}] \"{}\" ({} nodes)", i, s.name, s.graph.node_count());
    }
}

fn print_scene_stats(scene: &Scene, id_map: &HashMap<NodeId, String>, verbose: bool) {
    let graph = &scene.graph;
    let reachable = collect_reachable(graph);

    println!(
        "  Total nodes in graph: {} (reachable from roots: {})",
        graph.node_count(),
        reachable.len()
    );
    println!("  Roots: {}", graph.roots().len());

    // Node type breakdown
    let mut type_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for (node_id, node) in graph.nodes_iter() {
        if !reachable.contains(&node_id) {
            continue;
        }
        let label = classify_node(node);
        *type_counts.entry(label).or_default() += 1;
    }

    if !type_counts.is_empty() {
        println!("  Node types:");
        for (name, count) in &type_counts {
            println!("    {:<22} {}", name, count);
        }
    }

    // Verbose: print full tree
    if verbose {
        println!("  Node tree:");
        for root in graph.roots() {
            print_node_tree(graph, id_map, root, 2);
        }
    }
}

fn print_node_tree(
    graph: &SceneGraph,
    id_map: &HashMap<NodeId, String>,
    id: &NodeId,
    depth: usize,
) {
    let Ok(node) = graph.get_node(id) else {
        return;
    };
    let indent = "  ".repeat(depth);
    let string_id = id_map
        .get(id)
        .map(|s| s.as_str())
        .unwrap_or("<no-string-id>");
    println!("{}{} {:?} ({})", indent, classify_node(node), id, string_id,);

    if let Some(children) = graph.get_children(id) {
        for child in children {
            print_node_tree(graph, id_map, child, depth + 1);
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Layout check (shared by both paths)
// ═════════════════════════════════════════════════════════════════════════════

/// Runs the layout engine on the given scene and reports containers that are
/// missing from the layout result. Returns `true` if all containers have
/// layout results, `false` otherwise.
fn run_layout_check(scene: &Scene, id_map: &HashMap<NodeId, String>) -> bool {
    let viewport_size = Size {
        width: 1920.0,
        height: 1080.0,
    };

    let mut engine = LayoutEngine::new();
    engine.compute(scene, viewport_size, None);
    let layout_result = engine.result();

    let graph = &scene.graph;
    let reachable = collect_reachable(graph);

    let mut missing: Vec<(NodeId, String, Vec<String>)> = Vec::new();

    for (node_id, node) in graph.nodes_iter() {
        if !reachable.contains(&node_id) {
            continue;
        }
        if let Node::Container(_) = node {
            if layout_result.get(&node_id).is_none() {
                let string_id = id_map
                    .get(&node_id)
                    .cloned()
                    .unwrap_or_else(|| format!("{:?}", node_id));

                let mut ancestor_ids: Vec<NodeId> = graph.ancestors(&node_id).unwrap_or_default();
                ancestor_ids.reverse();
                ancestor_ids.push(node_id);
                let path: Vec<String> = ancestor_ids
                    .iter()
                    .map(|id| {
                        id_map
                            .get(id)
                            .cloned()
                            .unwrap_or_else(|| format!("{:?}", id))
                    })
                    .collect();

                missing.push((node_id, string_id, path));
            }
        }
    }

    let total_containers = graph
        .nodes_iter()
        .filter(|(id, n)| reachable.contains(id) && matches!(n, Node::Container(_)))
        .count();

    if missing.is_empty() {
        println!(
            "  Layout check: OK ({} container(s) all have layout results)",
            total_containers
        );
        return true;
    }

    eprintln!(
        "  Layout check: FAIL — {}/{} container(s) missing layout result",
        missing.len(),
        total_containers,
    );
    eprintln!("  This causes: \"Container must have layout result when layout engine is used\"");
    eprintln!("  Correlate the string_id / path below with your source document.\n");

    for (internal_id, string_id, path) in &missing {
        let path_str = if path.is_empty() {
            string_id.clone()
        } else {
            path.join(" / ")
        };
        eprintln!("    internal_id: {:?}", internal_id);
        eprintln!("    string_id:   {}", string_id);
        eprintln!("    path:        {}", path_str);
        eprintln!();
    }

    false
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

/// Collects all node IDs reachable from the scene's roots (preorder walk).
fn collect_reachable(graph: &SceneGraph) -> HashSet<NodeId> {
    let mut reachable = HashSet::new();
    for root_id in graph.roots() {
        reachable.insert(*root_id);
        let _ = graph.walk_preorder(root_id, &mut |id| {
            reachable.insert(*id);
        });
    }
    reachable
}

fn classify_node(node: &Node) -> &'static str {
    match node {
        Node::InitialContainer(_) => "initial_container",
        Node::Container(_) => "container",
        Node::Group(_) => "group",
        Node::Vector(_) => "vector",
        Node::Path(_) => "path",
        Node::BooleanOperation(_) => "boolean",
        Node::Rectangle(_) => "rectangle",
        Node::Ellipse(_) => "ellipse",
        Node::Polygon(_) => "polygon",
        Node::RegularPolygon(_) => "regular_polygon",
        Node::RegularStarPolygon(_) => "star_polygon",
        Node::Line(_) => "line",
        Node::Image(_) => "image",
        Node::TextSpan(_) => "tspan",
        Node::AttributedText(_) => "attributed_text",
        Node::Error(_) => "error",
    }
}
