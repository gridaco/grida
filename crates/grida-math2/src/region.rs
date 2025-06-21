//! Region utilities built on rectangles.
//!
//! This module provides simple boolean operations for working with rectangular
//! regions. Regions are represented as collections of [`Rectangle`], allowing
//! composition of multiple rectangles.
//!
//! These helpers are useful for computing complex spatial queries such as
//! subtracting holes from a base region or checking spatial relationships.

use crate::rect::{self, Rectangle};

/// A collection of non-overlapping rectangles treated as a single region.
#[derive(Debug, Clone, PartialEq)]
pub struct Region {
    /// Rectangles composing the region.
    pub rectangles: Vec<Rectangle>,
}

impl Region {
    /// Creates a region from potentially overlapping rectangles.
    ///
    /// The resulting region will contain non-overlapping rectangles.
    pub fn from_rectangles(rectangles: Vec<Rectangle>) -> Self {
        let mut region = Region {
            rectangles: Vec::new(),
        };
        for rect in rectangles {
            region.add_rectangle(rect);
        }
        region
    }

    /// Adds a rectangle to the region while maintaining non-overlap.
    fn add_rectangle(&mut self, rect: Rectangle) {
        // Remove parts already covered by the existing region.
        let mut parts = vec![rect];
        for exist in &self.rectangles {
            let mut next = Vec::new();
            for p in parts {
                next.extend(rect::boolean::subtract(p, *exist));
            }
            parts = next;
            if parts.is_empty() {
                break;
            }
        }

        // Any remaining parts are guaranteed to not overlap with existing
        // rectangles. Append them to the region.
        self.rectangles.extend(parts);
    }
}

/// Subtracts region `b` from region `a`, returning the remaining region.
pub fn subtract(a: Region, b: Region) -> Region {
    let mut current = a.rectangles;
    for hole in b.rectangles {
        let mut next = Vec::new();
        for rect in current.into_iter() {
            next.extend(rect::boolean::subtract(rect, hole));
        }
        current = next;
        if current.is_empty() {
            break;
        }
    }
    Region::from_rectangles(current)
}

/// Computes the difference of `base` with one or more hole rectangles.
///
/// Each hole is subtracted sequentially from the remaining regions. Holes that
/// lie completely outside the base rectangle are ignored before performing the
/// subtraction, avoiding unnecessary work and keeping the function side-effect
/// free.
pub fn difference(base: Rectangle, holes: &[Rectangle]) -> Vec<Rectangle> {
    let filtered: Vec<Rectangle> = holes
        .iter()
        .copied()
        .filter(|h| rect::intersects(&base, h))
        .collect();

    if filtered.is_empty() {
        return vec![base];
    }

    subtract(
        Region::from_rectangles(vec![base]),
        Region::from_rectangles(filtered),
    )
    .rectangles
}
