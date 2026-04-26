use skia_safe::{FontMgr, Typeface};

pub mod geist;
pub mod geistmono;

thread_local! {
  pub static TYPEFACE_GEIST: Typeface = typeface(geist::BYTES);
  pub static TYPEFACE_GEISTMONO: Typeface = typeface(geistmono::BYTES);
}

// #[deprecated(note = "will be removed")]
pub fn typeface(bytes: &[u8]) -> Typeface {
    // FIXME: should not make fntmgr each time
    let font_mgr = FontMgr::new();
    let tf = font_mgr.new_from_data(bytes, None);
    tf.unwrap()
}
