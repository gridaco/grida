use cg::resource::font_loader::FontLoader;
use cg::resource::image_loader::ImageLoader;
use cg::resource::ResourceLoader;

use std::path::PathBuf;

mod fonts;

fn fixture_path(name: &str) -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
        .to_string_lossy()
        .to_string()
}

fn write_temp_font(name: &str, data: &[u8]) -> PathBuf {
    let path = std::env::temp_dir().join(format!("{}_fixture.ttf", name));
    std::fs::write(&path, data).expect("write temp font");
    path
}

#[test]
fn font_loader_simple_load_unload() {
    futures::executor::block_on(async {
        let mut loader = FontLoader::new_simple();
        let path = write_temp_font("Caveat", fonts::CAVEAT_VF);
        let path_str = path.to_string_lossy().to_string();
        let data = loader.load("Caveat", &path_str).await;
        assert!(data.is_some());
        loader.unload("Caveat").await;
        std::fs::remove_file(path).ok();
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
