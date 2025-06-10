mod window;
use clap::Parser;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    // take path to json file
    path: String,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let scene = window::load_scene_from_file(&cli.path).await;

    window::run_demo_window(scene).await;
}
