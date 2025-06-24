use super::rect::{CardinalDirection, RectangleSide};

/// Returns the inverted cardinal direction.
pub fn invert_direction(dir: CardinalDirection) -> CardinalDirection {
    match dir {
        CardinalDirection::N => CardinalDirection::S,
        CardinalDirection::E => CardinalDirection::W,
        CardinalDirection::S => CardinalDirection::N,
        CardinalDirection::W => CardinalDirection::E,
        CardinalDirection::NE => CardinalDirection::SW,
        CardinalDirection::SE => CardinalDirection::NW,
        CardinalDirection::SW => CardinalDirection::NE,
        CardinalDirection::NW => CardinalDirection::SE,
    }
}

/// Converts an orthogonal cardinal direction to a rectangle side.
/// Diagonal directions return `None`.
pub fn to_rectangle_side(dir: CardinalDirection) -> Option<RectangleSide> {
    match dir {
        CardinalDirection::N => Some(RectangleSide::Top),
        CardinalDirection::E => Some(RectangleSide::Right),
        CardinalDirection::S => Some(RectangleSide::Bottom),
        CardinalDirection::W => Some(RectangleSide::Left),
        _ => None,
    }
}
