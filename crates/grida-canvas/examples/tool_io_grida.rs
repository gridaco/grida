//! Grida File Validation Tool
//!
//! This tool validates .grida files by parsing them and reporting success or failure.
//! It's useful for debugging file format issues and verifying that legacy files can be parsed correctly.
//!
//! ## Usage
//!
//! ```bash
//! cargo run --example tool_io_grida <path-to-grida-file>
//! ```
//!
//! ## Output
//!
//! On success, the tool prints:
//! - Total number of nodes parsed
//! - Scene references
//! - Entry scene ID
//! - Breakdown of node types (group, container, text, etc.)
//!
//! On failure, the tool prints:
//! - Error message describing what failed to parse
//!
//! ## Exit Codes
//!
//! - `0` - Success
//! - `1` - Parse error or file read error

use cg::io::io_grida::parse;
use std::env;
use std::fs;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: cargo run --example tool_io_grida <path-to-grida-file>");
        std::process::exit(1);
    }

    let file_path = &args[1];

    println!("Parsing file: {}", file_path);

    match fs::read_to_string(file_path) {
        Ok(content) => match parse(&content) {
            Ok(file) => {
                println!("✓ Successfully parsed {} nodes", file.document.nodes.len());
                println!("  Scenes: {:?}", file.document.scenes_ref);
                println!("  Entry scene: {:?}", file.document.entry_scene_id);

                // Count node types
                let mut node_types: std::collections::HashMap<String, usize> =
                    std::collections::HashMap::new();
                for node in file.document.nodes.values() {
                    let type_name = match node {
                        cg::io::io_grida::JSONNode::Group(_) => "group",
                        cg::io::io_grida::JSONNode::Container(_) => "container",
                        cg::io::io_grida::JSONNode::Vector(_) => "vector",
                        cg::io::io_grida::JSONNode::Ellipse(_) => "ellipse",
                        cg::io::io_grida::JSONNode::Rectangle(_) => "rectangle",
                        cg::io::io_grida::JSONNode::RegularPolygon(_) => "polygon",
                        cg::io::io_grida::JSONNode::RegularStarPolygon(_) => "star",
                        cg::io::io_grida::JSONNode::Line(_) => "line",
                        cg::io::io_grida::JSONNode::Text(_) => "text",
                        cg::io::io_grida::JSONNode::BooleanOperation(_) => "boolean",
                        cg::io::io_grida::JSONNode::Image(_) => "image",
                        cg::io::io_grida::JSONNode::Scene(_) => "scene",
                        cg::io::io_grida::JSONNode::Unknown(_) => "unknown",
                    };
                    *node_types.entry(type_name.to_string()).or_insert(0) += 1;
                }
                if !node_types.is_empty() {
                    println!("  Node types:");
                    for (name, count) in node_types.iter() {
                        println!("    {}: {}", name, count);
                    }
                }
            }
            Err(e) => {
                eprintln!("✗ Failed to parse: {}", e);
                std::process::exit(1);
            }
        },
        Err(e) => {
            eprintln!("✗ Failed to read file: {}", e);
            std::process::exit(1);
        }
    }
}
