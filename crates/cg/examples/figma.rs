mod window;
use cg::{io_figma::FigmaConverter, schema::Scene};
use clap::Parser;
use figma_api::apis::{
    configuration::{ApiKey, Configuration},
    files_api::get_file,
};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[arg(long = "file-key")]
    file_key: String,
    #[arg(long = "api-key")]
    api_key: String,
    #[arg(long = "scene-index")]
    scene_index: usize,
}

async fn load_scene_from_url(
    file_key: &str,
    api_key: &str,
    scene_index: usize,
) -> Result<Scene, String> {
    let file = get_file(
        &Configuration {
            base_path: "https://api.figma.com".to_string(),
            user_agent: None,
            client: reqwest::Client::new(),
            basic_auth: None,
            oauth_access_token: None,
            bearer_access_token: None,
            api_key: Some(ApiKey {
                key: api_key.to_string(),
                prefix: None,
            }),
        },
        file_key,
        None,
        None,
        None,
        Some("paths"),
        None,
        None,
    )
    .await
    .expect("Failed to load file");

    let document = FigmaConverter::new()
        .convert_document(&file.document)
        .expect("Failed to convert document");

    Ok(document[scene_index].clone())
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let scene = load_scene_from_url(&cli.file_key, &cli.api_key, cli.scene_index)
        .await
        .expect("Failed to load scene");

    println!("Rendering scene: {}", scene.name);
    println!("Scene ID: {}", scene.id);
    println!("Number of children: {}", scene.children.len());
    println!("Total nodes in repository: {}", scene.nodes.len());
    println!("\nNode details:");
    for (i, child_id) in scene.children.iter().enumerate() {
        if let Some(node) = scene.nodes.get(child_id) {
            println!("Node {}:", i + 1);
            println!("  Type: {:?}", node);
            println!();
        }
    }

    window::run_demo_window(scene).await;
}
