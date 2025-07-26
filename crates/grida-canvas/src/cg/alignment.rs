#[derive(Debug, Clone)]
/// A point within a rectangle.
/// [Alignment](0.0, 0.0) represents the center of the rectangle. The distance from -1.0 to +1.0 is the distance from one side of the rectangle to the other side of the rectangle. Therefore, 2.0 units horizontally (or vertically) is equivalent to the width (or height) of the rectangle.
///
/// [Alignment](-1.0, -1.0) represents the top left of the rectangle.
///
/// [Alignment](1.0, 1.0) represents the bottom right of the rectangle.
///
/// [Alignment](0.0, 3.0) represents a point that is horizontally centered with respect to the rectangle and vertically below the bottom of the rectangle by the height of the rectangle.
///
/// [Alignment](0.0, -0.5) represents a point that is horizontally centered with respect to the rectangle and vertically half way between the top edge and the center.
///
/// [Alignment](x, y) in a rectangle with height h and width w describes the point (x * w/2 + w/2, y * h/2 + h/2) in the coordinate system of the rectangle.
///
/// See Also:
/// - https://docs.flutter.dev/ui/layout/constraints#alignment
/// - https://developer.mozilla.org/en-US/docs/Web/CSS/percentage
pub struct Alignment(pub f32, pub f32);

impl Alignment {
    pub const BOTTOM_CENTER: Alignment = Alignment(0.0, 1.0);
    pub const BOTTOM_LEFT: Alignment = Alignment(-1.0, 1.0);
    pub const BOTTOM_RIGHT: Alignment = Alignment(1.0, 1.0);
    pub const CENTER: Alignment = Alignment(0.0, 0.0);
    pub const CENTER_LEFT: Alignment = Alignment(-1.0, 0.0);
    pub const CENTER_RIGHT: Alignment = Alignment(1.0, 0.0);
    pub const TOP_CENTER: Alignment = Alignment(0.0, -1.0);
    pub const TOP_LEFT: Alignment = Alignment(-1.0, -1.0);
    pub const TOP_RIGHT: Alignment = Alignment(1.0, -1.0);

    pub fn x(&self) -> f32 {
        self.0
    }

    pub fn y(&self) -> f32 {
        self.1
    }
}
