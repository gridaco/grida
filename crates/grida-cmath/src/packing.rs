//! Rectangle packing utilities for layout optimization.
//!
//! This module implements a simple variation of the MaxRects algorithm to
//! compute valid placements for rectangular agents within a bounded domain.
//! It also provides a helper that "walks" outward when no placement can be
//! found inside the original view.

use crate::rect::{self, Rectangle};

/// Calculates the next viable placement for a rectangular agent within the
/// given `view` rectangle, avoiding `anchors` that represent occupied regions.
///
/// The algorithm iteratively subtracts each anchor from the free-space set and
/// selects the smallest lexicographical free region that can contain the agent.
/// Returns `None` if no placement is found.
pub fn fit(
    view: Rectangle,
    agent: (f32, f32),
    anchors: &[Rectangle],
) -> Option<Rectangle> {
    let mut free_regions = vec![view];
    for &anchor in anchors {
        let mut updated = Vec::new();
        for region in &free_regions {
            updated.extend(rect::boolean::subtract(*region, anchor));
        }
        free_regions = updated;
    }

    free_regions.retain(|r| r.width >= agent.0 && r.height >= agent.1);
    if free_regions.is_empty() {
        return None;
    }

    free_regions.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap().then(a.x.partial_cmp(&b.x).unwrap()));
    let chosen = free_regions[0];
    Some(Rectangle { x: chosen.x, y: chosen.y, width: agent.0, height: agent.1 })
}

pub mod ext {
    use super::*;

    /// Attempts to find a placement by gradually expanding the search region
    /// outward from the view's top-left corner.
    ///
    /// This function is useful when `fit` fails to locate a spot inside the
    /// initial view. It walks in the positive right/down directions on a grid
    /// until a non-overlapping position is found.
    pub fn walk_to_fit(view: Rectangle, agent: (f32, f32), anchors: &[Rectangle]) -> Rectangle {
        if let Some(r) = super::fit(view, agent, anchors) {
            return r;
        }

        let step = (agent.0.min(agent.1) / 2.0).max(1.0);
        let mut radius = step;
        loop {
            let max = radius as i32;
            for dy in (0..=max).map(|v| v as f32).step_by(step as usize) {
                for dx in (0..=max).map(|v| v as f32).step_by(step as usize) {
                    let candidate = Rectangle {
                        x: view.x + dx,
                        y: view.y + dy,
                        width: agent.0,
                        height: agent.1,
                    };
                    if !anchors.iter().any(|a| rect::intersects(&candidate, a)) {
                        return candidate;
                    }
                }
            }
            radius += step;
        }
    }
}

