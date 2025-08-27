use super::vn::*;

pub struct RectShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
}

impl Into<skia_safe::Rect> for &RectShape {
    fn into(self) -> skia_safe::Rect {
        skia_safe::Rect::from_wh(self.width, self.height)
    }
}

impl Into<skia_safe::Path> for &RectShape {
    fn into(self) -> skia_safe::Path {
        let rect: skia_safe::Rect = self.into();
        let mut path = skia_safe::Path::new();
        path.add_rect(&rect, None);
        path
    }
}

impl Into<VectorNetworkGeometry> for &RectShape {
    fn into(self) -> VectorNetworkGeometry {
        VectorNetworkGeometry::from_rect(0.0, 0.0, self.width, self.height)
    }
}
