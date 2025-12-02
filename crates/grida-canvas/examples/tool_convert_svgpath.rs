//! Grida SVGPath to Vector Conversion Tool
//!
//! Converts all `svgpath` nodes to `vector` nodes in a .grida file.
//!
//! ## Usage
//!
//! ```bash
//! cargo run --example tool_convert_svgpath <path-to-grida-file> [output-path] [--preserve-order]
//! ```
//!
//! If `output-path` is not provided, the file will be modified in place.
//! Use `--preserve-order` to preserve JSON key order for minimal git diffs.

use cg::io::io_grida::{
    parse, JSONCanvasFile, JSONNode, JSONPathNode, JSONUnknownNodeProperties, JSONVectorNetwork,
    JSONVectorNode,
};
use cg::vectornetwork::vn::{
    VectorNetwork, VectorNetworkLoop, VectorNetworkRegion, VectorNetworkSegment,
};
use json_patch::{Patch, PatchOperation};
use serde_json::{self, Value};
use skia_safe::Path;
use std::{env, fs, process::exit};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: cargo run --example tool_convert_svgpath <path-to-grida-file> [output-path] [--preserve-order]");
        exit(1);
    }

    let (file_path, output_path, preserve_order) = parse_args(&args[1..]);
    let content = read_file(&file_path);
    let json_value: Value = parse_json(&content);
    let mut file: JSONCanvasFile = parse_file(&content);

    let svgpath_count = count_nodes(&file, |n| matches!(n, JSONNode::Path(_)));
    println!(
        "✓ Parsed {} nodes ({} svgpath)",
        file.document.nodes.len(),
        svgpath_count
    );

    if svgpath_count == 0 {
        println!("✓ No svgpath nodes to convert");
        return;
    }

    let (patch_operations, converted_count, failed_count) = convert_nodes(&mut file);
    println!(
        "✓ Converted {} svgpath nodes to vector nodes",
        converted_count
    );
    if failed_count > 0 {
        eprintln!("⚠ {} nodes failed to convert", failed_count);
    }

    let updated_content = if preserve_order && !patch_operations.is_empty() {
        apply_patches(json_value, patch_operations)
    } else {
        serde_json::to_string_pretty(&json_value).unwrap_or_else(|e| fatal("serialize", e))
    };

    write_file(&output_path, updated_content);
    println!("✓ Successfully updated file: {}", output_path);
}

fn parse_args(args: &[String]) -> (String, String, bool) {
    let mut file_path = None;
    let mut output_path = None;
    let mut preserve_order = false;

    for arg in args {
        match arg.as_str() {
            "--preserve-order" => preserve_order = true,
            path if file_path.is_none() => file_path = Some(path.to_string()),
            path if output_path.is_none() => output_path = Some(path.to_string()),
            _ => {
                eprintln!("Unknown argument: {}", arg);
                exit(1);
            }
        }
    }

    let file_path = file_path.expect("File path is required");
    let output_path = output_path.unwrap_or_else(|| file_path.clone());
    (file_path, output_path, preserve_order)
}

fn read_file(path: &str) -> String {
    fs::read_to_string(path).unwrap_or_else(|e| fatal("read file", e))
}

fn parse_json(content: &str) -> Value {
    serde_json::from_str(content).unwrap_or_else(|e| fatal("parse JSON", e))
}

fn parse_file(content: &str) -> JSONCanvasFile {
    parse(content).unwrap_or_else(|e| fatal("parse file", e))
}

fn count_nodes<F>(file: &JSONCanvasFile, pred: F) -> usize
where
    F: Fn(&JSONNode) -> bool,
{
    file.document.nodes.values().filter(|n| pred(n)).count()
}

fn convert_nodes(file: &mut JSONCanvasFile) -> (Vec<PatchOperation>, usize, usize) {
    let mut patch_operations = Vec::new();
    let mut converted_count = 0;
    let mut failed_count = 0;
    let node_ids: Vec<String> = file.document.nodes.keys().cloned().collect();

    for node_id in node_ids {
        let node = file.document.nodes.remove(&node_id).unwrap();
        if let JSONNode::Path(path_node) = node {
            match convert_svgpath_to_vector(&path_node) {
                Some(vector_node) => {
                    converted_count += 1;
                    patch_operations.extend(create_patch_ops(&node_id, &vector_node));
                    file.document
                        .nodes
                        .insert(node_id, JSONNode::Vector(vector_node));
                }
                None => {
                    eprintln!("⚠ Warning: Failed to convert svgpath node {}", node_id);
                    failed_count += 1;
                    file.document
                        .nodes
                        .insert(node_id, JSONNode::Path(path_node));
                }
            }
        } else {
            file.document.nodes.insert(node_id, node);
        }
    }

    (patch_operations, converted_count, failed_count)
}

fn create_patch_ops(node_id: &str, vector_node: &JSONVectorNode) -> Vec<PatchOperation> {
    let node_path = format!("/document/nodes/{}", escape_json_pointer(node_id));
    let mut ops = Vec::new();

    ops.push(
        serde_json::from_value(serde_json::json!({
            "op": "replace",
            "path": format!("{}/type", node_path),
            "value": "vector"
        }))
        .expect("Failed to create replace operation"),
    );

    ops.push(
        serde_json::from_value(serde_json::json!({
            "op": "remove",
            "path": format!("{}/paths", node_path)
        }))
        .expect("Failed to create remove operation"),
    );

    if let Ok(vn_json) = serde_json::to_value(&vector_node.vector_network) {
        ops.push(
            serde_json::from_value(serde_json::json!({
                "op": "add",
                "path": format!("{}/vectorNetwork", node_path),
                "value": vn_json
            }))
            .expect("Failed to create add operation"),
        );
    }

    ops
}

fn apply_patches(mut json_value: Value, patch_operations: Vec<PatchOperation>) -> String {
    let patch = Patch(patch_operations);
    json_patch::patch(&mut json_value, &patch).unwrap_or_else(|e| fatal("apply JSON patches", e));
    serde_json::to_string_pretty(&json_value).unwrap_or_else(|e| fatal("serialize", e))
}

fn write_file(path: &str, content: String) {
    fs::write(path, content).unwrap_or_else(|e| fatal("write file", e));
}

fn fatal(operation: &str, error: impl std::fmt::Display) -> ! {
    eprintln!("✗ Failed to {}: {}", operation, error);
    exit(1);
}

fn escape_json_pointer(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

fn convert_svgpath_to_vector(path_node: &JSONPathNode) -> Option<JSONVectorNode> {
    let paths = path_node.paths.as_ref()?;
    if paths.is_empty() {
        return None;
    }

    let mut network = VectorNetwork {
        vertices: vec![],
        segments: vec![],
        regions: vec![],
    };
    let mut vertex_offset = 0;
    let mut segment_offset = 0;

    for svg_path in paths {
        let skia_path = Path::from_svg(&svg_path.d)?;
        let path_network: VectorNetwork = (&skia_path).into();
        let is_stroke = svg_path.fill.as_deref() == Some("stroke");

        // Append vertices and segments with offsets
        network
            .vertices
            .extend(path_network.vertices.iter().cloned());
        network.segments.extend(
            path_network
                .segments
                .iter()
                .map(|seg| VectorNetworkSegment {
                    a: seg.a + vertex_offset,
                    b: seg.b + vertex_offset,
                    ta: seg.ta,
                    tb: seg.tb,
                }),
        );

        // Create regions for fill paths
        if !is_stroke {
            if path_network.regions.is_empty() {
                let offset_segments: Vec<usize> = (0..path_network.segments.len())
                    .map(|i| i + segment_offset)
                    .collect();
                if !offset_segments.is_empty() {
                    network.regions.push(VectorNetworkRegion {
                        loops: vec![VectorNetworkLoop(offset_segments)],
                        fill_rule: svg_path.fill_rule,
                        fills: None,
                    });
                }
            } else {
                for region in path_network.regions {
                    let offset_loops: Vec<VectorNetworkLoop> = region
                        .loops
                        .iter()
                        .map(|loop_| {
                            VectorNetworkLoop(
                                loop_.0.iter().map(|&idx| idx + segment_offset).collect(),
                            )
                        })
                        .collect();
                    network.regions.push(VectorNetworkRegion {
                        loops: offset_loops,
                        fill_rule: region.fill_rule,
                        fills: region.fills,
                    });
                }
            }
        }

        vertex_offset = network.vertices.len();
        segment_offset = network.segments.len();
    }

    if network.vertices.is_empty() {
        return None;
    }

    let json_network: JSONVectorNetwork = (&network).into();
    let base: JSONUnknownNodeProperties = serde_json::from_value(serde_json::json!({
        "id": path_node.base.id,
    }))
    .expect("Failed to create base properties");

    Some(JSONVectorNode {
        base,
        vector_network: Some(json_network),
    })
}
