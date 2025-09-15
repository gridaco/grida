use std::fs;
use std::path::PathBuf;

use fonts::Parser;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

#[test]
fn parses_stat_axis_values() {
    let path = font_path(
        "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
    );
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let stat = parser.stat();
    let opsz = stat.axes.iter().find(|a| a.tag == "opsz").unwrap();
    let values: Vec<i32> = opsz.values.iter().map(|v| v.value.round() as i32).collect();
    assert!(values.contains(&8));
    assert!(values.contains(&9));
    assert!(values.contains(&10));
    let wght = stat.axes.iter().find(|a| a.tag == "wght").unwrap();
    let bold = wght
        .values
        .iter()
        .find(|v| v.linked_value.map(|lv| lv.round() as i32) == Some(700))
        .unwrap();
    assert_eq!(bold.value.round() as i32, 400);
}
