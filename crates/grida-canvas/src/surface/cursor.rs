/// Cardinal and inter-cardinal resize directions.
///
/// Used both for resize handle anchors and for directional resize cursors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResizeDirection {
    N,
    NE,
    E,
    SE,
    S,
    SW,
    W,
    NW,
}

impl ResizeDirection {
    /// All eight directions in clockwise order starting from north.
    pub const ALL: [Self; 8] = [
        Self::N,
        Self::NE,
        Self::E,
        Self::SE,
        Self::S,
        Self::SW,
        Self::W,
        Self::NW,
    ];

    /// The four corner directions (diagonal resize handles, visible knobs).
    pub const CORNERS: [Self; 4] = [Self::NW, Self::NE, Self::SE, Self::SW];

    /// The four side (cardinal) directions (invisible edge handles).
    pub const SIDES: [Self; 4] = [Self::N, Self::E, Self::S, Self::W];

    /// Whether this direction is a corner (diagonal).
    pub fn is_corner(self) -> bool {
        matches!(self, Self::NW | Self::NE | Self::SE | Self::SW)
    }
}

/// Corner positions for rotation handles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RotationCorner {
    NW,
    NE,
    SE,
    SW,
}

impl RotationCorner {
    pub const ALL: [Self; 4] = [Self::NW, Self::NE, Self::SE, Self::SW];
}

/// Cursor icon for the surface.
///
/// Maps to platform cursor types (e.g. winit `CursorIcon`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CursorIcon {
    #[default]
    Default,
    Pointer,
    Grab,
    Grabbing,
    Crosshair,
    Move,
    /// Directional resize cursor (maps to nwse-resize, nesw-resize, ns-resize, ew-resize).
    Resize(ResizeDirection),
    /// Rotation cursor. The corner identifies which rotation handle is active,
    /// allowing the host to choose the appropriate cursor orientation.
    Rotate(RotationCorner),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resize_direction_constants() {
        assert_eq!(ResizeDirection::ALL.len(), 8);
        assert_eq!(ResizeDirection::CORNERS.len(), 4);
        assert_eq!(ResizeDirection::SIDES.len(), 4);
        // CORNERS + SIDES = ALL
        for d in ResizeDirection::CORNERS {
            assert!(ResizeDirection::ALL.contains(&d));
        }
        for d in ResizeDirection::SIDES {
            assert!(ResizeDirection::ALL.contains(&d));
        }
    }

    #[test]
    fn cursor_default_is_default() {
        let c = CursorIcon::default();
        assert_eq!(c, CursorIcon::Default);
    }

    #[test]
    fn resize_cursors_are_distinct() {
        // Opposite directions should map to the same visual cursor
        // (ns, ew, nwse, nesw) — 4 groups of 2.
        // But the enum values themselves should be distinct.
        assert_ne!(
            CursorIcon::Resize(ResizeDirection::N),
            CursorIcon::Resize(ResizeDirection::S)
        );
        assert_ne!(
            CursorIcon::Resize(ResizeDirection::E),
            CursorIcon::Resize(ResizeDirection::W)
        );
    }

    #[test]
    fn cursor_variants_not_equal() {
        assert_ne!(CursorIcon::Default, CursorIcon::Pointer);
        assert_ne!(
            CursorIcon::Resize(ResizeDirection::N),
            CursorIcon::Rotate(RotationCorner::NW)
        );
    }
}
