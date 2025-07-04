use math2::{layout_flex_guess, FlexAxisDirection, Rectangle};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn single_rectangle_defaults() {
    let input = [rect(0.0, 0.0, 100.0, 100.0)];
    let result = layout_flex_guess(&input);
    assert_eq!(result.direction, FlexAxisDirection::Horizontal);
    assert_eq!(result.spacing, 0.0);
}

#[test]
fn horizontal_when_width_spread_greater() {
    let input = [
        rect(0.0, 0.0, 50.0, 50.0),
        rect(60.0, 0.0, 50.0, 50.0),
        rect(120.0, 0.0, 50.0, 50.0),
    ];
    let result = layout_flex_guess(&input);
    assert_eq!(result.direction, FlexAxisDirection::Horizontal);
    assert!((result.spacing - 10.0).abs() < 1e-6);
}

#[test]
fn vertical_when_height_spread_greater() {
    let input = [
        rect(0.0, 0.0, 20.0, 50.0),
        rect(0.0, 60.0, 20.0, 50.0),
        rect(0.0, 120.0, 20.0, 50.0),
    ];
    let result = layout_flex_guess(&input);
    assert_eq!(result.direction, FlexAxisDirection::Vertical);
    assert!((result.spacing - 10.0).abs() < 1e-6);
}

#[test]
fn overlapping_rectangles_still_returns() {
    let input = [
        rect(0.0, 0.0, 80.0, 100.0),
        rect(50.0, 30.0, 70.0, 60.0),
        rect(140.0, 20.0, 50.0, 40.0),
        rect(90.0, 10.0, 40.0, 80.0),
    ];
    let result = layout_flex_guess(&input);
    assert!(matches!(
        result.direction,
        FlexAxisDirection::Horizontal | FlexAxisDirection::Vertical
    ));
    assert!(result.spacing >= 0.0);
}
