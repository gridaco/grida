use skia_safe;

pub fn build_corner_radius_path(path: &skia_safe::Path, r: f32) -> skia_safe::Path {
    let mut paint = skia_safe::Paint::default();
    paint.set_path_effect(skia_safe::PathEffect::corner_path(r));
    let mut dst = skia_safe::Path::new();
    skia_safe::path_utils::fill_path_with_paint(path, &paint, &mut dst, None, None);

    dst
}
