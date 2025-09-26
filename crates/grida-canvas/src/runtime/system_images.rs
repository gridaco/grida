use crate::resources::{self, Resources};
use crate::runtime::image_repository::ImageRepository;

pub const CHECKER_16_STRIP_L98L92_PATH: &str = "system://images/checker-16-strip-L98L92.png";

pub const CHECKER_16_STRIP_L98L92_BYTES: &[u8] =
    include_bytes!("../../assets/images/checker-16-strip-L98L92.png");

/// Register all built-in system images with the resource and image repositories.
pub fn register(resources: &mut Resources, images: &mut ImageRepository) {
    register_checker_image(resources, images);
}

fn register_checker_image(resources: &mut Resources, images: &mut ImageRepository) {
    let bytes = CHECKER_16_STRIP_L98L92_BYTES;
    let hash = resources::hash_bytes(bytes);
    resources.insert(CHECKER_16_STRIP_L98L92_PATH, bytes.to_vec());
    let _ = images.insert(CHECKER_16_STRIP_L98L92_PATH.to_string(), hash);
}
