use cg::io::io_json::parse;
use cg::node::schema::*;
use cg::window;
use clap::Parser;
use math2::transform::AffineTransform;
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
    let nodes = canvas_file.document.nodes;
    // entry_scene_id or scenes[0]
    let scene_id = canvas_file.document.entry_scene_id.unwrap_or(
        canvas_file
            .document
            .scenes
            .keys()
            .next()
            .unwrap()
            .to_string(),
    );
    let scene = canvas_file.document.scenes.get(&scene_id).unwrap();
    Scene {
        nodes: nodes.into_iter().map(|(k, v)| (k, v.into())).collect(),
        id: scene_id,
        name: scene.name.clone(),
        transform: AffineTransform::identity(),
        children: scene.children.clone(),
        background_color: Some(Color(230, 230, 230, 255)),
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let scene = load_scene_from_file(&cli.path).await;

    window::run_demo_window(scene).await;
}
