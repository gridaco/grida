//! SVG → `.grida` (FlatBuffers) import entry point.
//!
//! Drives the full SVG import pipeline: sanitize → pack into a `SceneGraph`
//! → encode as `.grida` FBS bytes.

use crate::formats::svg::sanitize::sanitize_svg;
use crate::import::svg::pack;
use crate::io::io_grida_fbs;
use crate::node::schema::*;
use std::collections::HashMap;

type ErrorMessageString = String;

/// Parse SVG and return a `.grida` FlatBuffers binary.
///
/// Produces the final `.grida` document directly, using the same FBS codec
/// the editor already understands.
pub fn svg_to_grida_bytes(svg_source: &str) -> Result<Vec<u8>, ErrorMessageString> {
    let sanitized = sanitize_svg(svg_source);
    let graph = pack::from_svg_str(&sanitized)?;

    let scene = Scene {
        name: "svg".to_string(),
        graph,
        background_color: None,
    };

    // Build string ID map (NodeId u64 → string) and position map.
    // Position strings must follow the tree's depth-first order so the
    // FBS decoder reconstructs correct sibling z-order. Iterating
    // `nodes_iter()` would give HashMap order which is arbitrary.
    let mut id_map: HashMap<NodeId, String> = HashMap::new();
    let mut position_map: HashMap<NodeId, String> = HashMap::new();
    let mut counter: u64 = 0;

    fn walk_tree_order(
        graph: &crate::node::scene_graph::SceneGraph,
        node_id: &NodeId,
        id_map: &mut HashMap<NodeId, String>,
        position_map: &mut HashMap<NodeId, String>,
        counter: &mut u64,
    ) {
        id_map.insert(*node_id, format!("svg_{}", node_id));
        position_map.insert(*node_id, format!("a{:06}", counter));
        *counter += 1;

        if let Some(children) = graph.get_children(node_id) {
            for child_id in children {
                walk_tree_order(graph, child_id, id_map, position_map, counter);
            }
        }
    }

    for root_id in scene.graph.roots() {
        walk_tree_order(
            &scene.graph,
            root_id,
            &mut id_map,
            &mut position_map,
            &mut counter,
        );
    }

    let bytes = io_grida_fbs::encode(&scene, "svg_scene", &id_map, &position_map);
    Ok(bytes)
}
