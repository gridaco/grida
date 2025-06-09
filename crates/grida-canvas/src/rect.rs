#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

impl Rect {
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            min_x: x,
            min_y: y,
            max_x: x + width,
            max_y: y + height,
        }
    }

    pub fn width(&self) -> f32 {
        self.max_x - self.min_x
    }

    pub fn height(&self) -> f32 {
        self.max_y - self.min_y
    }

    pub fn union(&self, other: &Rect) -> Rect {
        Rect {
            min_x: self.min_x.min(other.min_x),
            min_y: self.min_y.min(other.min_y),
            max_x: self.max_x.max(other.max_x),
            max_y: self.max_y.max(other.max_y),
        }
    }

    pub fn intersects(&self, other: &Rect) -> bool {
        self.min_x < other.max_x
            && self.max_x > other.min_x
            && self.min_y < other.max_y
            && self.max_y > other.min_y
    }

    /// Expands the rect by the given margin on each side
    pub fn margin(&self, margin: f32) -> Rect {
        Rect {
            min_x: self.min_x + margin,
            min_y: self.min_y + margin,
            max_x: self.max_x - margin,
            max_y: self.max_y - margin,
        }
    }
}
