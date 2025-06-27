use math2::{tile, Rectangle};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn non_overlapping_keeps_regions() {
    let rects = [rect(0.0, 0.0, 10.0, 10.0), rect(20.0, 0.0, 10.0, 10.0)];
    let regions = tile::z_punch_tiles(&rects);
    assert_eq!(regions[0], vec![rects[0]]);
    assert_eq!(regions[1], vec![rects[1]]);
}

#[test]
fn lower_tile_punched_by_higher() {
    let rects = [rect(0.0, 0.0, 10.0, 10.0), rect(0.0, 0.0, 20.0, 20.0)];
    let regions = tile::z_punch_tiles(&rects);
    assert_eq!(regions[0], vec![rects[0]]);
    assert!(regions[1].iter().all(|r| r != &rects[1]));
    assert!(!regions[1].is_empty());
}

#[test]
fn fully_covered_tile_results_empty() {
    let rects = [rect(0.0, 0.0, 10.0, 10.0), rect(0.0, 0.0, 10.0, 10.0)];
    let regions = tile::z_punch_tiles(&rects);
    assert_eq!(regions[1].len(), 0);
}

#[test]
fn partial_overlap_creates_fragments() {
    let rects = [
        rect(0.0, 0.0, 10.0, 10.0), // Base rectangle
        rect(5.0, 5.0, 10.0, 10.0), // Overlaps bottom-right
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should be split into fragments (top-left, top-right, bottom-left)
    assert!(regions[1].len() > 1);

    // Verify total area is preserved (approximately)
    let original_area = rects[1].width * rects[1].height;
    let fragment_area: f32 = regions[1].iter().map(|r| r.width * r.height).sum();
    let overlap_area = 5.0 * 5.0; // 5x5 overlap
    let expected_visible_area = original_area - overlap_area;
    assert!((fragment_area - expected_visible_area).abs() < 0.001);
}

#[test]
fn multiple_overlapping_rectangles() {
    let rects = [
        rect(0.0, 0.0, 20.0, 20.0),   // Large base
        rect(5.0, 5.0, 10.0, 10.0),   // Hole in center
        rect(15.0, 15.0, 10.0, 10.0), // Bottom-right corner
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should be completely occluded by first
    assert_eq!(regions[1].len(), 0);

    // Third rectangle should be partially occluded by first
    assert!(regions[2].len() > 0);
}

#[test]
fn corner_overlap_scenario() {
    let rects = [
        rect(0.0, 0.0, 10.0, 10.0), // Top-left
        rect(5.0, 5.0, 10.0, 10.0), // Bottom-right overlap
        rect(8.0, 8.0, 5.0, 5.0),   // Small rectangle in overlap area
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should have corner punched
    assert!(regions[1].len() > 0);

    // Third rectangle should be completely occluded by both previous rectangles
    assert_eq!(regions[2].len(), 0);
}

#[test]
fn edge_touching_rectangles() {
    let rects = [
        rect(0.0, 0.0, 10.0, 10.0),  // Base
        rect(10.0, 0.0, 10.0, 10.0), // Touches right edge
        rect(0.0, 10.0, 10.0, 10.0), // Touches bottom edge
    ];
    let regions = tile::z_punch_tiles(&rects);

    // All rectangles should remain unchanged since they don't overlap
    assert_eq!(regions[0], vec![rects[0]]);
    assert_eq!(regions[1], vec![rects[1]]);
    assert_eq!(regions[2], vec![rects[2]]);
}

#[test]
fn nested_rectangles() {
    let rects = [
        rect(0.0, 0.0, 20.0, 20.0), // Outer rectangle
        rect(5.0, 5.0, 10.0, 10.0), // Inner rectangle
        rect(7.0, 7.0, 6.0, 6.0),   // Innermost rectangle
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should be completely occluded by first
    assert_eq!(regions[1].len(), 0);

    // Third rectangle should be completely occluded by first
    assert_eq!(regions[2].len(), 0);
}

#[test]
fn cross_pattern_overlap() {
    let rects = [
        rect(5.0, 0.0, 10.0, 20.0), // Vertical strip
        rect(0.0, 5.0, 20.0, 10.0), // Horizontal strip
        rect(8.0, 8.0, 4.0, 4.0),   // Small square in center
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should be punched by first (cross pattern)
    assert!(regions[1].len() > 1);

    // Third rectangle should be completely occluded by both previous rectangles
    assert_eq!(regions[2].len(), 0);
}

#[test]
fn staircase_pattern() {
    let rects = [
        rect(0.0, 0.0, 10.0, 10.0),   // Bottom step
        rect(5.0, 5.0, 10.0, 10.0),   // Middle step
        rect(10.0, 10.0, 10.0, 10.0), // Top step
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should be partially punched by first
    assert!(regions[1].len() > 0);

    // Third rectangle should be partially punched by first
    assert!(regions[2].len() > 0);
}

#[test]
fn empty_input_returns_empty() {
    let rects: [Rectangle; 0] = [];
    let regions = tile::z_punch_tiles(&rects);
    assert_eq!(regions.len(), 0);
}

#[test]
fn single_rectangle_returns_unchanged() {
    let rects = [rect(5.0, 5.0, 10.0, 10.0)];
    let regions = tile::z_punch_tiles(&rects);
    assert_eq!(regions.len(), 1);
    assert_eq!(regions[0], vec![rects[0]]);
}

#[test]
fn zero_sized_rectangles() {
    let rects = [
        rect(0.0, 0.0, 0.0, 10.0),  // Zero width
        rect(0.0, 0.0, 10.0, 0.0),  // Zero height
        rect(5.0, 5.0, 10.0, 10.0), // Normal rectangle
    ];
    let regions = tile::z_punch_tiles(&rects);

    // Zero-sized rectangles should be handled gracefully
    assert_eq!(regions.len(), 3);
    assert_eq!(regions[0], vec![rects[0]]);
    assert_eq!(regions[1], vec![rects[1]]);
    assert_eq!(regions[2], vec![rects[2]]);
}

#[test]
fn negative_coordinates() {
    let rects = [
        rect(-10.0, -10.0, 20.0, 20.0), // Negative origin
        rect(0.0, 0.0, 10.0, 10.0),     // Positive origin
    ];
    let regions = tile::z_punch_tiles(&rects);

    // Should handle negative coordinates correctly
    assert_eq!(regions[0], vec![rects[0]]);
    // Second rectangle should be fully occluded by the first
    assert_eq!(regions[1].len(), 0);
}

#[test]
fn complex_multi_layer_scenario() {
    let rects = [
        rect(0.0, 0.0, 30.0, 30.0),   // Large background
        rect(5.0, 5.0, 20.0, 20.0),   // Medium layer
        rect(10.0, 10.0, 10.0, 10.0), // Small center
        rect(15.0, 15.0, 5.0, 5.0),   // Tiny corner
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Each subsequent rectangle should be completely occluded by the first
    assert_eq!(regions[1].len(), 0);
    assert_eq!(regions[2].len(), 0);
    assert_eq!(regions[3].len(), 0);
}

#[test]
fn area_preservation() {
    let rects = [
        rect(0.0, 0.0, 20.0, 20.0), // Base
        rect(5.0, 5.0, 10.0, 10.0), // Overlapping
    ];
    let regions = tile::z_punch_tiles(&rects);

    // Calculate total visible area
    let total_visible_area: f32 = regions
        .iter()
        .map(|fragments| fragments.iter().map(|r| r.width * r.height).sum::<f32>())
        .sum();

    // Should equal the area of the first rectangle plus the non-overlapping part of the second
    let expected_area =
        rects[0].width * rects[0].height + (rects[1].width * rects[1].height - 10.0 * 10.0);

    assert!((total_visible_area - expected_area).abs() < 0.001);
}

#[test]
fn three_rectangle_cascade() {
    let rects = [
        rect(0.0, 0.0, 15.0, 15.0), // Large base
        rect(5.0, 5.0, 10.0, 10.0), // Medium overlap
        rect(7.0, 7.0, 6.0, 6.0),   // Small center
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should be completely occluded by first
    assert_eq!(regions[1].len(), 0);

    // Third rectangle should be completely occluded by first
    assert_eq!(regions[2].len(), 0);
}

#[test]
fn partial_visibility_preserved() {
    let rects = [
        rect(0.0, 0.0, 10.0, 10.0), // Base
        rect(5.0, 0.0, 10.0, 10.0), // Right half visible
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Second rectangle should have left half occluded
    assert!(regions[1].len() > 0);

    // Verify the visible part is the right half
    let visible_area: f32 = regions[1].iter().map(|r| r.width * r.height).sum();
    let expected_visible_area = 5.0 * 10.0; // Right half
    assert!((visible_area - expected_visible_area).abs() < 0.001);
}

#[test]
fn multiple_small_holes() {
    let rects = [
        rect(0.0, 0.0, 20.0, 20.0), // Large base
        rect(5.0, 5.0, 5.0, 5.0),   // Small hole 1
        rect(10.0, 10.0, 5.0, 5.0), // Small hole 2
    ];
    let regions = tile::z_punch_tiles(&rects);

    // First rectangle should be unchanged
    assert_eq!(regions[0], vec![rects[0]]);

    // Both small rectangles should be completely occluded by the large base
    assert_eq!(regions[1].len(), 0);
    assert_eq!(regions[2].len(), 0);
}

#[test]
fn large_rectangle_at_bottom() {
    let rects = [
        rect(5.0, 5.0, 10.0, 10.0), // Small, topmost
        rect(0.0, 0.0, 20.0, 20.0), // Large, bottommost
    ];
    let regions = tile::z_punch_tiles(&rects);

    // The small rectangle should be fully visible
    assert_eq!(regions[0], vec![rects[0]]);
    // The large rectangle should have a hole where the small rectangle was
    assert!(regions[1].len() > 0);
    // The total area of the large rectangle's visible fragments should be its area minus the small rectangle's area
    let visible_area: f32 = regions[1].iter().map(|r| r.width * r.height).sum();
    let expected_area = rects[1].width * rects[1].height - rects[0].width * rects[0].height;
    assert!((visible_area - expected_area).abs() < 0.001);
}
