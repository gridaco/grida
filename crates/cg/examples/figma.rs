mod window;
use cg::{io_figma::FigmaConverter, schema::Scene};
use clap::Parser;
use figma_api::{
    apis::{
        configuration::{ApiKey, Configuration},
        files_api::get_file,
    },
    models::InlineObject,
};
use serde::Deserialize;
use serde_json::from_str;
use std::fs;

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
    // let file = get_file(
    //     &Configuration {
    //         base_path: "https://api.figma.com".to_string(),
    //         user_agent: None,
    //         client: reqwest::Client::new(),
    //         basic_auth: None,
    //         oauth_access_token: None,
    //         bearer_access_token: None,
    //         api_key: Some(ApiKey {
    //             key: api_key.to_string(),
    //             prefix: None,
    //         }),
    //     },
    //     file_key,
    //     None,
    //     None,
    //     None,
    //     None,
    //     None,
    //     None,
    // )
    // .await
    // .expect("Failed to load file");

    // figma_api::models::DocumentNode::
    // load from local test.json
    let file: InlineObject =
        from_str(&fs::read_to_string("test.json").expect("Failed to read test.json"))
            .expect("Failed to parse test.json");

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

    window::run_demo_window(scene).await;
}
