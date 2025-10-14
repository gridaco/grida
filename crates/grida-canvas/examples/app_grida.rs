use cg::cg::types::*;
use cg::io::io_grida::parse;
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

    // Convert nodes to repository, filtering out scene nodes and populating children from links
    let mut node_repo = cg::node::repository::NodeRepository::new();
    for (node_id, json_node) in canvas_file.document.nodes {
        // Skip scene nodes - they're handled separately
        if matches!(json_node, cg::io::io_grida::JSONNode::Scene(_)) {
            continue;
        }

        let mut node: cg::node::schema::Node = json_node.into();

        // Populate children from links
        if let Some(children_opt) = links.get(&node_id) {
            if let Some(children) = children_opt {
                match &mut node {
                    cg::node::schema::Node::Container(n) => n.children = children.clone(),
                    cg::node::schema::Node::Group(n) => n.children = children.clone(),
                    cg::node::schema::Node::BooleanOperation(n) => n.children = children.clone(),
                    _ => {} // Other nodes don't have children
                }
            }
        }

        node_repo.insert(node);
    }

    Scene {
        nodes: node_repo,
        id: scene_id,
        name: scene_name,
        children: scene_children,
        background_color: Some(CGColor(230, 230, 230, 255)),
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let scene = load_scene_from_file(&cli.path).await;

    window::run_demo_window(scene).await;
}
