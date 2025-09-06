use std::fs;
use std::path::PathBuf;

use grida_canvas_fonts::Parser;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

#[test]
fn parses_variation_axes_and_instances() {
    let path = font_path(
        "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
    );
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();
    let wght = fvar.axes.get("wght").unwrap();
    assert_eq!(wght.min.round() as i32, 100);
    assert_eq!(wght.max.round() as i32, 1000);
    assert_eq!(wght.def.round() as i32, 400);
    assert_eq!(wght.name, "Weight");
    assert!(!fvar.instances.is_empty());
    let inst = &fvar.instances[0];
    assert!(inst.coordinates.contains_key("wght"));
}

#[test]
fn supports_geist_variable_font() {
    let path = font_path("Geist/Geist-VariableFont_wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let fvar = parser.fvar();
    let wght = fvar.axes.get("wght").unwrap();
    assert_eq!(wght.min.round() as i32, 100);
    assert_eq!(wght.max.round() as i32, 900);
    assert_eq!(wght.def.round() as i32, 400);
    assert!(!fvar.instances.is_empty());
}
