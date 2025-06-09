use skia_safe::Image;

pub trait ImageHandler {
    fn create_image(&self, bytes: &[u8]) -> Option<Image>;
    fn register_image(&mut self, src: String, image: Image);
}

impl ImageHandler for crate::draw::Renderer {
    fn create_image(&self, bytes: &[u8]) -> Option<Image> {
        let data = skia_safe::Data::new_copy(bytes);
        Image::from_encoded(data)
    }

    fn register_image(&mut self, src: String, image: Image) {
        self.register_image(src, image);
    }
}
