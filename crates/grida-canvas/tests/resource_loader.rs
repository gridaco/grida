use cg::font_loader::FontLoader;
use cg::image_loader::ImageLoader;
use cg::resource_loader::ResourceLoader;

use std::path::PathBuf;

fn resource_path(name: &str) -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(name)
        .to_string_lossy()
        .to_string()
}

#[tokio::test]
async fn font_loader_simple_load_unload() {
    let mut loader = FontLoader::new_simple();
    let path = resource_path("Caveat-VariableFont_wght.ttf");
    let data = loader.load("Caveat", &path).await;
    assert!(data.is_some());
    loader.unload("Caveat").await;
}

#[tokio::test]
async fn image_loader_simple_load_unload() {
    let mut loader = ImageLoader::new_simple();
    let path = resource_path("4k.jpg");
    let data = loader.load(&path, &path).await;
    assert!(data.is_some());
    loader.unload(&path).await;
}
