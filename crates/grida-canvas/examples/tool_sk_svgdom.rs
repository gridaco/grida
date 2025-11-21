//! Purpose: To use Skia's builtin svgdom, and its rendering accuracy (this is for testing only).
//!
//! Usage:
//! cargo run --example tool_sk_svgdom -- <input_svg_path> [-o <output_png_path>]

use clap::Parser;
use skia_safe::{surfaces, svg, Data, EncodedImageFormat};
use std::fs;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(author, version, about = "Render SVG using Skia's native SVG module")]
struct Cli {
    /// Input SVG file path
    input: PathBuf,

    /// Output PNG file path
    #[arg(short, long)]
    output: Option<PathBuf>,
}

fn main() {
    let cli = Cli::parse();

    if !cli.input.exists() {
        eprintln!(
            "Error: Input file '{}' does not exist.",
            cli.input.display()
        );
        std::process::exit(1);
    }

    // 1. Load SVG data
    let svg_data = fs::read(&cli.input).expect("Failed to read input file");
    let data = Data::new_copy(&svg_data);

    // 2. Load SVG into DOM
    let dom =
        svg::Dom::from_bytes(&data, skia_safe::FontMgr::default()).expect("Failed to parse SVG");

    // 3. Determine output size (default to 400x400 if not specified in SVG, or use a reasonable default)
    // Note: svg::Dom doesn't easily expose intrinsic size in all versions without container size.
    // We'll try to get a container size or default to 800x600.
    // 3. Determine output size
    let root = dom.root();
    let width = root.width().value.ceil() as i32;
    let height = root.height().value.ceil() as i32;

    // Ensure positive dimensions
    let width = width.max(1);
    let height = height.max(1);

    // 4. Create a Surface to render into
    let mut surface =
        surfaces::raster_n32_premul((width, height)).expect("Failed to create surface");
    let canvas = surface.canvas();

    // Optional: Clear with white background? Or transparent?
    // canvas.clear(skia_safe::Color::WHITE);

    // 5. Render
    dom.render(canvas);

    // 6. Save
    let output_path = if let Some(path) = cli.output {
        path
    } else {
        let file_stem = cli.input.file_stem().expect("Invalid input filename");
        std::env::temp_dir().join(file_stem).with_extension("png")
    };

    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, 100)
        .expect("Failed to encode image");

    fs::write(&output_path, data.as_bytes()).expect("Failed to write PNG data");

    println!(
        "Successfully rendered '{}' to '{}'",
        cli.input.display(),
        output_path.display()
    );
}
