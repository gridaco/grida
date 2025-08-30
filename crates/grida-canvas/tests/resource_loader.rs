use cg::resource::font_loader::FontLoader;
use cg::resource::image_loader::ImageLoader;
use cg::resource::ResourceLoader;

use std::path::PathBuf;

fn fixture_path(name: &str) -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
        .to_string_lossy()
        .to_string()
}

#[test]
fn font_loader_simple_load_unload() {
    futures::executor::block_on(async {
        let mut loader = FontLoader::new_simple();
        let path = fixture_path("fonts/Caveat/Caveat-VariableFont_wght.ttf");
        let data = loader.load("Caveat", &path).await;
        assert!(data.is_some());
        loader.unload("Caveat").await;
    });
}

#[test]
fn image_loader_simple_load_unload() {
    futures::executor::block_on(async {
        let mut loader = ImageLoader::new_simple();
        let path = fixture_path("images/4k.jpg");
        let data = loader.load(&path, &path).await;
        assert!(data.is_some());
        loader.unload(&path).await;
    });
}
