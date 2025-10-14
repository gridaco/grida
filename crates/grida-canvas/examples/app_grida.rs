use cg::cg::types::*;
use cg::io::io_grida::parse;
use cg::node::scene_graph::SceneGraph;
use cg::node::schema::*;
use cg::window;
use clap::Parser;
use std::fs;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    // take path to json file
    path: String,
}

async fn load_scene_from_file(file_path: &str) -> Scene {
    let file: String = fs::read_to_string(file_path).expect("failed to read file");
    let canvas_file = parse(&file).expect("failed to parse file");

    let links = canvas_file.document.links;

    // Determine scene_id
    let scene_id = canvas_file
        .document
        .entry_scene_id
        .or_else(|| canvas_file.document.scenes_ref.first().cloned())
        .expect("no scene found");

    // Extract scene metadata from SceneNode
    let (scene_name, _bg_color) = if let Some(cg::io::io_grida::JSONNode::Scene(scene_node)) =
        canvas_file.document.nodes.get(&scene_id)
    {
        (scene_node.name.clone(), scene_node.background_color.clone())
    } else {
        (scene_id.clone(), None)
    };

    // Get scene children from links
    let scene_children = links
        .get(&scene_id)
        .and_then(|c| c.clone())
        .unwrap_or_default();

    // Build scene graph from nodes and links using snapshot
    let scene_node_ids: std::collections::HashSet<String> = canvas_file
        .document
        .nodes
        .iter()
        .filter(|(_, json_node)| matches!(json_node, cg::io::io_grida::JSONNode::Scene(_)))
        .map(|(id, _)| id.clone())
        .collect();

    // Convert all nodes (skip scene nodes)
    let nodes: Vec<cg::node::schema::Node> = canvas_file
        .document
        .nodes
        .into_iter()
        .filter(|(_, json_node)| !matches!(json_node, cg::io::io_grida::JSONNode::Scene(_)))
        .map(|(_, json_node)| json_node.into())
        .collect();

    // Filter links (skip scene nodes as parents)
    let filtered_links: std::collections::HashMap<String, Vec<String>> = links
        .into_iter()
        .filter(|(parent_id, _)| !scene_node_ids.contains(parent_id))
        .filter_map(|(parent_id, children_opt)| children_opt.map(|children| (parent_id, children)))
        .collect();

    let graph = SceneGraph::new_from_snapshot(nodes, filtered_links, scene_children);

    Scene {
        name: scene_name,
        background_color: Some(CGColor(230, 230, 230, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let scene = load_scene_from_file(&cli.path).await;

    window::run_demo_window(scene).await;
}
