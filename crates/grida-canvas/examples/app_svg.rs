use cg::cg::prelude::*;
use cg::node::schema::Scene;
use cg::svg::pack;
use cg::window;
use clap::Parser;
use std::fs;
use std::path::PathBuf;

/// Load an SVG file, convert it into a Grida scene graph, and render it.
#[derive(Parser, Debug)]
#[command(author, version, about = "Render an SVG using the Grida canvas engine", long_about = None)]
struct Cli {
    /// Path to the SVG file to render
    path: PathBuf,

    /// Optional scene name shown in the demo window title
    #[arg(long = "title")]
    title: Option<String>,

    /// Optional background color in hex notation (e.g. #FFFFFF or #FFFFFFFF)
    #[arg(long = "background")]
    background: Option<String>,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let svg_source = fs::read_to_string(&cli.path)
        .unwrap_or_else(|err| panic!("Failed to read SVG file {}: {err}", cli.path.display()));

    let graph = pack::from_svg_str(&svg_source)
        .unwrap_or_else(|err| panic!("Failed to convert SVG: {err}"));

    let scene_name = cli.title.unwrap_or_else(|| {
        cli.path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "SVG Scene".to_string())
    });

    let background_color = cli
        .background
        .as_deref()
        .and_then(parse_hex_color)
        .or(Some(CGColor(0xF8, 0xF8, 0xF8, 0xFF)));

    let scene = Scene {
        name: scene_name,
        graph,
        background_color,
    };

    window::run_demo_window(scene).await;
}

fn parse_hex_color(input: &str) -> Option<CGColor> {
    let s = input.trim().strip_prefix('#').unwrap_or(input.trim());
    match s.len() {
        6 => {
            let r = u8::from_str_radix(&s[0..2], 16).ok()?;
            let g = u8::from_str_radix(&s[2..4], 16).ok()?;
            let b = u8::from_str_radix(&s[4..6], 16).ok()?;
            Some(CGColor(r, g, b, 0xFF))
        }
        8 => {
            let r = u8::from_str_radix(&s[0..2], 16).ok()?;
            let g = u8::from_str_radix(&s[2..4], 16).ok()?;
            let b = u8::from_str_radix(&s[4..6], 16).ok()?;
            let a = u8::from_str_radix(&s[6..8], 16).ok()?;
            Some(CGColor(r, g, b, a))
        }
        _ => None,
    }
}
