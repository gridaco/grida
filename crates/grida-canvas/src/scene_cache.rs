use skia_safe::Picture;

#[derive(Default)]
pub struct SceneCache {
    picture: Option<Picture>,
}

impl SceneCache {
    pub fn new() -> Self {
        Self { picture: None }
    }

    pub fn is_valid(&self) -> bool {
        self.picture.is_some()
    }

    pub fn get_picture(&self) -> Option<&Picture> {
        self.picture.as_ref()
    }

    pub fn set_picture(&mut self, picture: Picture) {
        self.picture = Some(picture);
    }

    pub fn invalidate(&mut self) {
        self.picture = None;
    }
}
