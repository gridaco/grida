use skia_safe::{Font, FontMgr};

pub fn make_debugger_font(size: f32) -> Font {
    if cfg!(target_arch = "wasm32") {
        let mut f = Font::default();
        f.set_size(size);
        f
    } else {
        let font_mgr = FontMgr::new();
        let typeface = font_mgr
            .match_family_style("Arial", skia_safe::FontStyle::default())
            .or_else(|| font_mgr.match_family_style("", skia_safe::FontStyle::default()));
        match typeface {
            Some(tf) => Font::new(tf, size),
            None => {
                let mut f = Font::default();
                f.set_size(size);
                f
            }
        }
    }
}
