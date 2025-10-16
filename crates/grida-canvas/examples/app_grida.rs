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

    // Use IdConverter to handle string ID to u64 ID conversion
    let mut converter = cg::io::id_converter::IdConverter::new();

    match converter.convert_json_canvas_file(canvas_file) {
        Ok(mut scene) => {
            // Override background color
            scene.background_color = Some(CGColor(230, 230, 230, 255));
            scene
        }
        Err(err) => {
            panic!("Failed to convert canvas file: {}", err);
        }
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let scene = load_scene_from_file(&cli.path).await;

    window::run_demo_window(scene).await;
}
