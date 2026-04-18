//! # fill_mask PoC — explicit face enumeration for VectorNetworkRegion
//!
//! This file demonstrates a `fill_mask: u64` model that replaces `fill_rule: FillRule`
//! at the topological layer. Each loop in a region "owns" one face (the area inside
//! that loop minus the areas inside its direct children). A bitmask marks which
//! faces are filled.
//!
//! Fill rules become a codec at the import/export boundary:
//!   - decode: (loops, fill_rule, winding_dirs) → fill_mask
//!   - encode: (loops, fill_mask)               → (fill_rule, winding_dirs)
//!
//! The test renders five concentric-ring scenarios side by side into a single
//! Skia surface and compares sampled pixel alpha values to verify correctness.

use cg::cg::prelude::*;
use cg::vectornetwork::*;
use skia_safe::{
    surfaces, Color, EncodedImageFormat, Font, FontMgr, FontStyle, Paint as SkPaint, PaintStyle,
    PathBuilder, PathFillType, Point,
};

// ---------------------------------------------------------------------------
// 1. The proposed model
// ---------------------------------------------------------------------------

/// Replacement for `VectorNetworkRegion` — fill_rule removed, fill_mask added.
#[derive(Debug, Clone)]
struct FillMaskRegion {
    loops: Vec<VectorNetworkLoop>,
    /// Bit `i` = 1 ⟹ face owned by `loops[i]` is filled.
    fill_mask: u64,
    fills: Option<Paints>,
}

// ---------------------------------------------------------------------------
// 2. Nesting tree (computed from geometry, not stored)
// ---------------------------------------------------------------------------

struct LoopNesting {
    /// parent[i] = Some(j) means loop j is the smallest loop containing loop i.
    /// None means the loop's parent is the exterior (unbounded face).
    parent: Vec<Option<usize>>,
    /// Depth from exterior. Root loops have depth 0.
    depth: Vec<u32>,
}

/// Compute the nesting tree for a set of loops.
///
/// Uses a sample point from each loop and winding-number containment against
/// every other loop. O(n² · m) where n = loops, m = avg segments per loop.
fn compute_nesting(
    loops: &[VectorNetworkLoop],
    vertices: &[(f32, f32)],
    segments: &[VectorNetworkSegment],
) -> LoopNesting {
    let n = loops.len();
    let mut parent: Vec<Option<usize>> = vec![None; n];
    let mut depth: Vec<u32> = vec![0; n];

    // For each loop, collect its polygon vertices (flattening curves to endpoints).
    let loop_polys: Vec<Vec<(f32, f32)>> = loops
        .iter()
        .map(|VectorNetworkLoop(seg_indices)| {
            seg_indices
                .iter()
                .map(|&si| {
                    let seg = &segments[si];
                    vertices[seg.a]
                })
                .collect()
        })
        .collect();

    // Sample point: first vertex of the loop.
    // For containment tests between non-intersecting loops, any vertex works:
    // if one vertex of loop i is inside loop j, then loop i is entirely inside loop j.
    let sample_points: Vec<(f32, f32)> = loop_polys.iter().map(|poly| poly[0]).collect();

    // Point-in-polygon (ray casting, even-odd).
    fn point_in_polygon(px: f32, py: f32, poly: &[(f32, f32)]) -> bool {
        let mut inside = false;
        let n = poly.len();
        let mut j = n - 1;
        for i in 0..n {
            let (xi, yi) = poly[i];
            let (xj, yj) = poly[j];
            if ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
            j = i;
        }
        inside
    }

    // For each loop i, find the smallest containing loop.
    for i in 0..n {
        let (px, py) = sample_points[i];
        let mut best: Option<usize> = None;
        let mut best_area = f64::MAX;
        for j in 0..n {
            if i == j {
                continue;
            }
            if point_in_polygon(px, py, &loop_polys[j]) {
                // Approximate area via shoelace (smaller area = tighter container).
                let area = shoelace_area(&loop_polys[j]).abs();
                if area < best_area {
                    best_area = area;
                    best = Some(j);
                }
            }
        }
        parent[i] = best;
    }

    // Compute depths.
    for i in 0..n {
        let mut d = 0u32;
        let mut cur = parent[i];
        while let Some(p) = cur {
            d += 1;
            cur = parent[p];
        }
        depth[i] = d;
    }

    LoopNesting { parent, depth }
}

fn shoelace_area(poly: &[(f32, f32)]) -> f64 {
    let n = poly.len();
    let mut area = 0.0f64;
    for i in 0..n {
        let (x0, y0) = poly[i];
        let (x1, y1) = poly[(i + 1) % n];
        area += (x0 as f64) * (y1 as f64) - (x1 as f64) * (y0 as f64);
    }
    area * 0.5
}

// ---------------------------------------------------------------------------
// 3. Fill-rule codec (decode & encode)
// ---------------------------------------------------------------------------

/// Decode: (fill_rule, loop winding directions) → fill_mask.
///
/// This is what runs at Figma/SVG import time.
fn decode_fill_rule(nesting: &LoopNesting, fill_rule: FillRule) -> u64 {
    let mut mask = 0u64;
    for (i, &d) in nesting.depth.iter().enumerate() {
        let filled = match fill_rule {
            // EvenOdd: a point in face i crosses (depth + 1) loop boundaries.
            // Filled when that count is odd, i.e., depth is even.
            FillRule::EvenOdd => d % 2 == 0,
            // NonZero with all-same-winding: winding = depth + 1, always ≠ 0.
            // (For a full codec we'd track per-loop directions; this PoC
            // assumes all loops wind the same way for NonZero.)
            FillRule::NonZero => true,
        };
        if filled {
            mask |= 1u64 << i;
        }
    }
    mask
}

/// Encode: fill_mask → best-fit (FillRule, per-loop direction).
///
/// Returns None if no single fill rule can represent the mask (requires
/// splitting into multiple SVG paths).
fn encode_fill_rule(nesting: &LoopNesting, fill_mask: u64) -> Option<FillRule> {
    let n = nesting.depth.len();

    // Check if EvenOdd matches.
    let mut evenodd_mask = 0u64;
    for i in 0..n {
        if nesting.depth[i] % 2 == 0 {
            evenodd_mask |= 1u64 << i;
        }
    }
    if evenodd_mask == fill_mask {
        return Some(FillRule::EvenOdd);
    }

    // Check if NonZero (all same winding) matches.
    let all_filled = (1u64 << n) - 1;
    if fill_mask == all_filled {
        return Some(FillRule::NonZero);
    }

    // Check NonZero with mixed winding: try to assign directions.
    // For each loop, decide CW (+1) or CCW (-1).
    // winding(root) = sign(root).  Filled iff winding ≠ 0.
    // winding(child) = winding(parent) + sign(child).
    let mut signs = vec![1i32; n];
    let mut windings = vec![0i32; n];

    // Process in depth order (parents before children).
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by_key(|&i| nesting.depth[i]);

    for &i in &order {
        let parent_winding = match nesting.parent[i] {
            Some(p) => windings[p],
            None => 0,
        };
        let want_filled = (fill_mask >> i) & 1 == 1;
        if want_filled {
            // Need parent_winding + sign ≠ 0.
            // Same direction as parent (or +1 for roots).
            signs[i] = if parent_winding >= 0 { 1 } else { -1 };
        } else {
            // Need parent_winding + sign = 0.
            // sign must be ±1, so this only works when |parent_winding| = 1.
            if parent_winding == 1 {
                signs[i] = -1;
            } else if parent_winding == -1 {
                signs[i] = 1;
            } else {
                // Can't cancel to 0 with a single ±1 contribution.
                return None;
            }
        }
        windings[i] = parent_winding + signs[i];
    }

    // Verify.
    let mut ok = true;
    for i in 0..n {
        let want_filled = (fill_mask >> i) & 1 == 1;
        let is_filled = windings[i] != 0;
        if want_filled != is_filled {
            ok = false;
            break;
        }
    }
    if ok {
        return Some(FillRule::NonZero);
    }

    None // Needs multi-path split.
}

// ---------------------------------------------------------------------------
// 4. Rendering: fill_mask → Skia paths
// ---------------------------------------------------------------------------

/// Build one Skia path per filled face, using the fill_mask model.
///
/// Each filled face is rendered as its own path:  the owning loop as the outer
/// contour, with direct child loops subtracted (added as inner contours with
/// EvenOdd fill type).
fn render_fill_mask_region(
    region: &FillMaskRegion,
    vertices: &[(f32, f32)],
    segments: &[VectorNetworkSegment],
    nesting: &LoopNesting,
    canvas: &skia_safe::Canvas,
) {
    let n = region.loops.len();
    let fills = region.fills.as_ref().map(|p| p.as_slice()).unwrap_or(&[]);
    if fills.is_empty() {
        return;
    }

    // Collect children for each loop.
    let mut children: Vec<Vec<usize>> = vec![vec![]; n];
    for i in 0..n {
        if let Some(p) = nesting.parent[i] {
            children[p].push(i);
        }
    }

    for i in 0..n {
        if (region.fill_mask >> i) & 1 == 0 {
            continue; // face not filled
        }

        // Build path: outer loop + hole loops (direct children that are NOT filled,
        // which punch holes; filled children render themselves).
        let mut builder = PathBuilder::new();

        // Add the owning loop as the outer contour.
        add_loop_to_builder(&mut builder, &region.loops[i], vertices, segments);

        // Add direct child loops as hole contours.
        for &child in &children[i] {
            add_loop_to_builder(&mut builder, &region.loops[child], vertices, segments);
        }

        builder.set_fill_type(PathFillType::EvenOdd);
        let path = builder.detach();

        // Paint with the first solid fill.
        for paint_item in fills {
            if let Paint::Solid(solid) = paint_item {
                if !solid.active {
                    continue;
                }
                let mut sk_paint = SkPaint::default();
                sk_paint.set_anti_alias(true);
                sk_paint.set_style(PaintStyle::Fill);
                sk_paint.set_color(skia_safe::Color::from_argb(
                    solid.color.a,
                    solid.color.r,
                    solid.color.g,
                    solid.color.b,
                ));
                canvas.draw_path(&path, &sk_paint);
            }
        }
    }
}

fn add_loop_to_builder(
    builder: &mut PathBuilder,
    lp: &VectorNetworkLoop,
    vertices: &[(f32, f32)],
    segments: &[VectorNetworkSegment],
) {
    let VectorNetworkLoop(seg_indices) = lp;
    if seg_indices.is_empty() {
        return;
    }
    let mut first = true;
    for &si in seg_indices {
        let seg = &segments[si];
        let a = vertices[seg.a];
        let b = vertices[seg.b];
        if first {
            builder.move_to((a.0, a.1));
            first = false;
        }
        let ta = seg.ta;
        let tb = seg.tb;
        if ta.0 == 0.0 && ta.1 == 0.0 && tb.0 == 0.0 && tb.1 == 0.0 {
            builder.line_to((b.0, b.1));
        } else {
            builder.cubic_to(
                (a.0 + ta.0, a.1 + ta.1),
                (b.0 + tb.0, b.1 + tb.1),
                (b.0, b.1),
            );
        }
    }
    builder.close();
}

// ---------------------------------------------------------------------------
// 5. Helpers to build concentric circle geometry
// ---------------------------------------------------------------------------

/// Build N concentric circular loops as a VectorNetwork + loop list.
/// Returns (vertices, segments, loops) for circles centered at (cx, cy).
fn make_concentric_circles(
    cx: f32,
    cy: f32,
    radii: &[f32],
) -> (Vec<(f32, f32)>, Vec<VectorNetworkSegment>, Vec<VectorNetworkLoop>) {
    let mut vertices = Vec::new();
    let mut segments = Vec::new();
    let mut loops = Vec::new();

    // Each circle approximated by 4 cubic Bézier arcs (standard quarter-circle).
    // Control point factor for a quarter circle: κ ≈ 0.5522847498
    let k: f32 = 0.5522847498;

    for &r in radii {
        let base_v = vertices.len();
        let base_s = segments.len();

        // 4 vertices: right, top, left, bottom
        vertices.push((cx + r, cy)); // 0: right
        vertices.push((cx, cy - r)); // 1: top
        vertices.push((cx - r, cy)); // 2: left
        vertices.push((cx, cy + r)); // 3: bottom

        // 4 cubic segments forming the circle
        let kr = k * r;
        segments.push(VectorNetworkSegment {
            a: base_v,
            b: base_v + 1,
            ta: (0.0, -kr),
            tb: (kr, 0.0),
        }); // right → top
        segments.push(VectorNetworkSegment {
            a: base_v + 1,
            b: base_v + 2,
            ta: (-kr, 0.0),
            tb: (0.0, -kr),
        }); // top → left
        segments.push(VectorNetworkSegment {
            a: base_v + 2,
            b: base_v + 3,
            ta: (0.0, kr),
            tb: (-kr, 0.0),
        }); // left → bottom
        segments.push(VectorNetworkSegment {
            a: base_v + 3,
            b: base_v,
            ta: (kr, 0.0),
            tb: (0.0, kr),
        }); // bottom → right

        loops.push(VectorNetworkLoop(vec![
            base_s,
            base_s + 1,
            base_s + 2,
            base_s + 3,
        ]));
    }

    (vertices, segments, loops)
}

// ---------------------------------------------------------------------------
// 6. Tests
// ---------------------------------------------------------------------------

fn solid_black() -> Paints {
    Paints::new([Paint::Solid(SolidPaint {
        active: true,
        color: CGColor::from_rgba(0, 0, 0, 255),
        blend_mode: BlendMode::Normal,
    })])
}

/// Render a FillMaskRegion to a surface and return sampled alphas at each face.
///
/// `sample_radii` should be mid-ring distances from center where we probe.
fn render_and_sample(
    region: &FillMaskRegion,
    vertices: &[(f32, f32)],
    segments: &[VectorNetworkSegment],
    nesting: &LoopNesting,
    cx: f32,
    cy: f32,
    sample_radii: &[f32],
    size: i32,
) -> Vec<bool> {
    let mut surface = surfaces::raster_n32_premul((size, size)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    render_fill_mask_region(region, vertices, segments, nesting, canvas);

    // Sample at each radius along the positive-x axis from center.
    sample_radii
        .iter()
        .map(|&r| {
            let x = (cx + r) as i32;
            let y = cy as i32;
            // Black paint on white canvas → R channel < 255.
            let img = surface.image_snapshot();
            let info = img.image_info();
            let row_bytes = info.min_row_bytes();
            let mut raw = vec![0u8; row_bytes * size as usize];
            img.read_pixels(
                &info,
                &mut raw,
                row_bytes,
                skia_safe::IPoint::new(0, 0),
                skia_safe::image::CachingHint::Allow,
            );
            let off = (y as usize) * row_bytes + (x as usize) * 4;
            // BGRA: B=off, G=off+1, R=off+2, A=off+3
            let r_val = raw[off + 2];
            // If filled with black, r_val ≈ 0. If white background, r_val = 255.
            r_val < 128
        })
        .collect()
}

// ── Test 1: solid disc (all faces filled) ─────────────────────────────────

#[test]
fn fill_mask_solid_disc() {
    //  ┌──────────┐
    //  │ ┌──────┐ │
    //  │ │ ┌──┐ │ │
    //  │ │ │■■│ │ │  fill_mask = 0b111  → all three faces filled
    //  │ │ └──┘ │ │
    //  │ └──────┘ │
    //  └──────────┘
    let cx = 100.0;
    let cy = 100.0;
    let (v, s, loops) = make_concentric_circles(cx, cy, &[90.0, 60.0, 30.0]);
    let nesting = compute_nesting(&loops, &v, &s);

    assert_eq!(nesting.depth, vec![0, 1, 2]);
    assert_eq!(nesting.parent, vec![None, Some(0), Some(1)]);

    let region = FillMaskRegion {
        loops,
        fill_mask: 0b111,
        fills: Some(solid_black()),
    };

    let filled = render_and_sample(&region, &v, &s, &nesting, cx, cy, &[75.0, 45.0, 10.0], 200);

    assert_eq!(filled, vec![true, true, true], "all three faces filled");

    // Verify: NonZero with all-same-winding encodes this mask.
    assert_eq!(decode_fill_rule(&nesting, FillRule::NonZero), 0b111);
    assert_eq!(encode_fill_rule(&nesting, 0b111), Some(FillRule::NonZero));
}

// ── Test 2: bullseye (EvenOdd pattern) ────────────────────────────────────

#[test]
fn fill_mask_bullseye() {
    //  ┌──────────┐
    //  │■┌──────┐■│
    //  │■│ ┌──┐ │■│  fill_mask = 0b101  → face₀ ■, face₁ □, face₂ ■
    //  │■│ │■■│ │■│
    //  │■│ └──┘ │■│  classic EvenOdd pattern
    //  │■└──────┘■│
    //  └──────────┘
    let cx = 100.0;
    let cy = 100.0;
    let (v, s, loops) = make_concentric_circles(cx, cy, &[90.0, 60.0, 30.0]);
    let nesting = compute_nesting(&loops, &v, &s);

    let region = FillMaskRegion {
        loops,
        fill_mask: 0b101,
        fills: Some(solid_black()),
    };

    let filled = render_and_sample(&region, &v, &s, &nesting, cx, cy, &[75.0, 45.0, 10.0], 200);

    assert_eq!(
        filled,
        vec![true, false, true],
        "bullseye: outer ■, middle □, center ■"
    );

    // EvenOdd produces exactly this mask.
    assert_eq!(decode_fill_rule(&nesting, FillRule::EvenOdd), 0b101);
    assert_eq!(encode_fill_rule(&nesting, 0b101), Some(FillRule::EvenOdd));
}

// ── Test 3: donut (outer ring only) ───────────────────────────────────────

#[test]
fn fill_mask_donut() {
    //  ┌──────────┐
    //  │■┌──────┐■│
    //  │■│ ┌──┐ │■│  fill_mask = 0b100  → face₀ ■, face₁ □, face₂ □
    //  │■│ │  │ │■│
    //  │■│ └──┘ │■│  donut with empty center
    //  │■└──────┘■│
    //  └──────────┘
    let cx = 100.0;
    let cy = 100.0;
    let (v, s, loops) = make_concentric_circles(cx, cy, &[90.0, 60.0, 30.0]);
    let nesting = compute_nesting(&loops, &v, &s);

    let region = FillMaskRegion {
        loops,
        fill_mask: 0b001, // only face₀ (outermost ring)
        fills: Some(solid_black()),
    };

    let filled = render_and_sample(&region, &v, &s, &nesting, cx, cy, &[75.0, 45.0, 10.0], 200);

    assert_eq!(
        filled,
        vec![true, false, false],
        "donut: outer ring ■, rest □"
    );

    // With 3 nested loops, "only outer ring" is NOT representable by any
    // single fill rule — once loop₁ cancels the winding to 0, loop₂
    // inevitably adds ±1 making the center filled again.
    // This proves the fill_mask model is strictly more expressive.
    assert_eq!(encode_fill_rule(&nesting, 0b001), None);
}

// ── Test 4: only the middle ring (impossible in single SVG fill-rule) ─────

#[test]
fn fill_mask_middle_ring_only() {
    //  ┌──────────┐
    //  │ ┌──────┐ │
    //  │ │■┌──┐■│ │  fill_mask = 0b010  → face₀ □, face₁ ■, face₂ □
    //  │ │■│  │■│ │
    //  │ │■└──┘■│ │  NOT representable by any single SVG fill-rule!
    //  │ └──────┘ │
    //  └──────────┘
    let cx = 100.0;
    let cy = 100.0;
    let (v, s, loops) = make_concentric_circles(cx, cy, &[90.0, 60.0, 30.0]);
    let nesting = compute_nesting(&loops, &v, &s);

    let region = FillMaskRegion {
        loops,
        fill_mask: 0b010, // only face₁ (middle ring)
        fills: Some(solid_black()),
    };

    let filled = render_and_sample(&region, &v, &s, &nesting, cx, cy, &[75.0, 45.0, 10.0], 200);

    assert_eq!(
        filled,
        vec![false, true, false],
        "middle ring only: face₁ ■, rest □"
    );

    // No single fill rule can express this — encode returns None.
    assert_eq!(encode_fill_rule(&nesting, 0b010), None);
}

// ── Test 5: center dot only (also impossible in single SVG fill-rule) ─────

#[test]
fn fill_mask_center_dot_only() {
    //  ┌──────────┐
    //  │ ┌──────┐ │
    //  │ │ ┌──┐ │ │  fill_mask = 0b100  → face₀ □, face₁ □, face₂ ■
    //  │ │ │■■│ │ │
    //  │ │ └──┘ │ │  NOT representable by any single SVG fill-rule!
    //  │ └──────┘ │
    //  └──────────┘
    let cx = 100.0;
    let cy = 100.0;
    let (v, s, loops) = make_concentric_circles(cx, cy, &[90.0, 60.0, 30.0]);
    let nesting = compute_nesting(&loops, &v, &s);

    let region = FillMaskRegion {
        loops,
        fill_mask: 0b100, // only face₂ (innermost)
        fills: Some(solid_black()),
    };

    let filled = render_and_sample(&region, &v, &s, &nesting, cx, cy, &[75.0, 45.0, 10.0], 200);

    assert_eq!(
        filled,
        vec![false, false, true],
        "center dot only: face₂ ■, rest □"
    );

    assert_eq!(encode_fill_rule(&nesting, 0b100), None);
}

// ── Test 6: roundtrip — decode a fill_rule, then encode back ──────────────

#[test]
fn fill_rule_roundtrip() {
    let cx = 100.0;
    let cy = 100.0;
    let (v, s, loops) = make_concentric_circles(cx, cy, &[90.0, 60.0, 30.0]);
    let nesting = compute_nesting(&loops, &v, &s);

    // EvenOdd → mask → EvenOdd
    let mask = decode_fill_rule(&nesting, FillRule::EvenOdd);
    assert_eq!(mask, 0b101);
    assert_eq!(encode_fill_rule(&nesting, mask), Some(FillRule::EvenOdd));

    // NonZero (same winding) → mask → NonZero
    let mask = decode_fill_rule(&nesting, FillRule::NonZero);
    assert_eq!(mask, 0b111);
    assert_eq!(encode_fill_rule(&nesting, mask), Some(FillRule::NonZero));
}

// ── Test 7: two sibling loops (disjoint circles) ─────────────────────────

#[test]
fn fill_mask_sibling_loops() {
    // Two separate circles, not nested.
    //   ┌──┐  ┌──┐
    //   │■■│  │  │   fill_mask = 0b01 → only left filled
    //   └──┘  └──┘
    let (v1, s1, l1) = make_concentric_circles(60.0, 100.0, &[40.0]);
    let (v2, mut s2, l2) = make_concentric_circles(160.0, 100.0, &[40.0]);

    // Merge the two geometries.
    let v_offset = v1.len();
    let s_offset = s1.len();
    for seg in &mut s2 {
        seg.a += v_offset;
        seg.b += v_offset;
    }
    let mut vertices = v1;
    vertices.extend(v2);
    let mut segments = s1;
    segments.extend(s2);

    let loop_right = VectorNetworkLoop(
        l2[0]
            .0
            .iter()
            .map(|&i| i + s_offset)
            .collect::<Vec<_>>(),
    );
    let loops = vec![l1.into_iter().next().unwrap(), loop_right];

    let nesting = compute_nesting(&loops, &vertices, &segments);

    // Both should be roots (depth 0, no parent).
    assert_eq!(nesting.depth, vec![0, 0]);
    assert_eq!(nesting.parent, vec![None, None]);

    let region = FillMaskRegion {
        loops,
        fill_mask: 0b01, // only left circle filled
        fills: Some(solid_black()),
    };

    let filled_left = {
        let mut surface = surfaces::raster_n32_premul((220, 200)).unwrap();
        let canvas = surface.canvas();
        canvas.clear(Color::WHITE);
        render_fill_mask_region(&region, &vertices, &segments, &nesting, canvas);
        let img = surface.image_snapshot();
        let info = img.image_info();
        let row_bytes = info.min_row_bytes();
        let mut raw = vec![0u8; row_bytes * 200];
        img.read_pixels(
            &info,
            &mut raw,
            row_bytes,
            skia_safe::IPoint::new(0, 0),
            skia_safe::image::CachingHint::Allow,
        );
        // Sample left center (60, 100) and right center (160, 100).
        let left_r = raw[100 * row_bytes + 60 * 4 + 2];
        let right_r = raw[100 * row_bytes + 160 * 4 + 2];
        (left_r < 128, right_r < 128)
    };

    assert_eq!(filled_left, (true, false), "left ■, right □");
}

// ── Visual output: all scenarios rendered to a single PNG ─────────────────

#[test]
fn fill_mask_render_all_to_png() {
    let cell_w = 200;
    let cell_h = 240;
    let cols = 6;
    let total_w = cell_w * cols;
    let total_h = cell_h;

    let mut surface = surfaces::raster_n32_premul((total_w as i32, total_h as i32)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::from_argb(255, 245, 245, 245)); // light gray bg

    // Text paint for labels.
    let mut text_paint = SkPaint::default();
    text_paint.set_color(Color::from_argb(255, 40, 40, 40));
    text_paint.set_anti_alias(true);

    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .match_family_style("Arial", FontStyle::normal())
        .or_else(|| font_mgr.match_family_style("Helvetica", FontStyle::normal()))
        .unwrap_or_else(|| font_mgr.legacy_make_typeface(None, FontStyle::normal()).unwrap());
    let label_font = Font::from_typeface(&typeface, 13.0);
    let title_font = Font::from_typeface(&typeface, 11.0);

    // Grid outline paint.
    let mut grid_paint = SkPaint::default();
    grid_paint.set_color(Color::from_argb(255, 200, 200, 200));
    grid_paint.set_style(PaintStyle::Stroke);
    grid_paint.set_stroke_width(1.0);

    struct Scenario {
        label: &'static str,
        mask_str: &'static str,
        fill_mask: u64,
        encode_result: &'static str,
    }

    let scenarios = [
        Scenario {
            label: "Solid Disc",
            mask_str: "0b111",
            fill_mask: 0b111,
            encode_result: "NonZero",
        },
        Scenario {
            label: "Bullseye",
            mask_str: "0b101",
            fill_mask: 0b101,
            encode_result: "EvenOdd",
        },
        Scenario {
            label: "Donut (3 loops)",
            mask_str: "0b001",
            fill_mask: 0b001,
            encode_result: "None!",
        },
        Scenario {
            label: "Middle Ring",
            mask_str: "0b010",
            fill_mask: 0b010,
            encode_result: "None!",
        },
        Scenario {
            label: "Center Dot",
            mask_str: "0b100",
            fill_mask: 0b100,
            encode_result: "None!",
        },
        Scenario {
            label: "Sibling (L only)",
            mask_str: "0b01",
            fill_mask: 0, // handled specially
            encode_result: "NonZero",
        },
    ];

    // Colors for the three concentric faces.
    let face_colors: [(u8, u8, u8); 3] = [
        (66, 133, 244),  // blue  — face₀ (outer ring)
        (234, 67, 53),   // red   — face₁ (middle ring)
        (52, 168, 83),   // green — face₂ (center)
    ];

    for (col, scenario) in scenarios.iter().enumerate() {
        let ox = (col * cell_w) as f32;
        let oy = 0.0f32;

        // Draw cell border.
        canvas.draw_rect(
            skia_safe::Rect::from_xywh(ox, oy, cell_w as f32, cell_h as f32),
            &grid_paint,
        );

        // Draw label.
        canvas.draw_str(scenario.label, (ox + 8.0, oy + 18.0), &label_font, &text_paint);

        // Draw mask and encode info.
        let mut sub_paint = SkPaint::default();
        sub_paint.set_color(Color::from_argb(255, 120, 120, 120));
        sub_paint.set_anti_alias(true);
        canvas.draw_str(
            &format!("mask={}", scenario.mask_str),
            (ox + 8.0, oy + 32.0),
            &title_font,
            &sub_paint,
        );
        canvas.draw_str(
            &format!("encode → {}", scenario.encode_result),
            (ox + 8.0, oy + 44.0),
            &title_font,
            &sub_paint,
        );

        let cx = ox + (cell_w as f32) / 2.0;
        let cy = oy + 145.0;

        if col < 5 {
            // Concentric circles scenarios.
            let (v, s, loops) = make_concentric_circles(cx, cy, &[80.0, 53.0, 26.0]);
            let nesting = compute_nesting(&loops, &v, &s);

            // Render each filled face with its own color.
            for face_i in 0..3 {
                if (scenario.fill_mask >> face_i) & 1 == 0 {
                    continue;
                }
                let (cr, cg, cb) = face_colors[face_i];
                let colored_fills = Paints::new([Paint::Solid(SolidPaint {
                    active: true,
                    color: CGColor::from_rgba(cr, cg, cb, 255),
                    blend_mode: BlendMode::Normal,
                })]);

                // Render just this single face.
                let single_face_region = FillMaskRegion {
                    loops: loops.clone(),
                    fill_mask: 1u64 << face_i,
                    fills: Some(colored_fills),
                };
                render_fill_mask_region(&single_face_region, &v, &s, &nesting, canvas);
            }

            // Draw loop outlines.
            let mut stroke_paint = SkPaint::default();
            stroke_paint.set_color(Color::from_argb(255, 60, 60, 60));
            stroke_paint.set_style(PaintStyle::Stroke);
            stroke_paint.set_stroke_width(1.5);
            stroke_paint.set_anti_alias(true);
            for lp in &loops {
                let mut builder = PathBuilder::new();
                add_loop_to_builder(&mut builder, lp, &v, &s);
                let path = builder.detach();
                canvas.draw_path(&path, &stroke_paint);
            }
        } else {
            // Sibling circles scenario.
            let lcx = cx - 45.0;
            let rcx = cx + 45.0;
            let (v1, s1, l1) = make_concentric_circles(lcx, cy, &[35.0]);
            let (v2, mut s2, l2) = make_concentric_circles(rcx, cy, &[35.0]);
            let v_offset = v1.len();
            let s_offset = s1.len();
            for seg in &mut s2 {
                seg.a += v_offset;
                seg.b += v_offset;
            }
            let mut vertices = v1;
            vertices.extend(v2);
            let mut segments = s1;
            segments.extend(s2);
            let loop_right = VectorNetworkLoop(
                l2[0].0.iter().map(|&i| i + s_offset).collect::<Vec<_>>(),
            );
            let loops = vec![l1.into_iter().next().unwrap(), loop_right];
            let nesting = compute_nesting(&loops, &vertices, &segments);

            // Fill only left circle.
            let (cr, cg, cb) = face_colors[0];
            let region = FillMaskRegion {
                loops: loops.clone(),
                fill_mask: 0b01,
                fills: Some(Paints::new([Paint::Solid(SolidPaint {
                    active: true,
                    color: CGColor::from_rgba(cr, cg, cb, 255),
                    blend_mode: BlendMode::Normal,
                })])),
            };
            render_fill_mask_region(&region, &vertices, &segments, &nesting, canvas);

            // Outlines.
            let mut stroke_paint = SkPaint::default();
            stroke_paint.set_color(Color::from_argb(255, 60, 60, 60));
            stroke_paint.set_style(PaintStyle::Stroke);
            stroke_paint.set_stroke_width(1.5);
            stroke_paint.set_anti_alias(true);
            for lp in &loops {
                let mut builder = PathBuilder::new();
                add_loop_to_builder(&mut builder, lp, &vertices, &segments);
                let path = builder.detach();
                canvas.draw_path(&path, &stroke_paint);
            }
        }

        // Draw legend at bottom.
        let legend_y = oy + cell_h as f32 - 12.0;
        let face_labels = if col < 5 {
            vec!["outer", "mid", "inner"]
        } else {
            vec!["left", "right"]
        };
        let face_cols: Vec<(u8, u8, u8)> = if col < 5 {
            face_colors.to_vec()
        } else {
            vec![face_colors[0], (180, 180, 180)]
        };
        let mask = if col < 5 { scenario.fill_mask } else { 0b01u64 };
        for (fi, (label, &(cr, cg, cb))) in face_labels.iter().zip(face_cols.iter()).enumerate() {
            let lx = ox + 8.0 + (fi as f32) * 65.0;
            let filled = (mask >> fi) & 1 == 1;
            // Color swatch.
            let mut swatch = SkPaint::default();
            if filled {
                swatch.set_color(Color::from_argb(255, cr, cg, cb));
            } else {
                swatch.set_color(Color::from_argb(255, 220, 220, 220));
            }
            swatch.set_style(PaintStyle::Fill);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(lx, legend_y - 8.0, 10.0, 10.0),
                &swatch,
            );
            let mut swatch_border = SkPaint::default();
            swatch_border.set_color(Color::from_argb(255, 100, 100, 100));
            swatch_border.set_style(PaintStyle::Stroke);
            swatch_border.set_stroke_width(0.5);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(lx, legend_y - 8.0, 10.0, 10.0),
                &swatch_border,
            );
            canvas.draw_str(
                *label,
                (lx + 14.0, legend_y),
                &title_font,
                &text_paint,
            );
        }
    }

    // Save to PNG.
    let img = surface.image_snapshot();
    let data = img.encode(None, EncodedImageFormat::PNG, None).unwrap();
    let out_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fill_mask_poc_output.png");
    std::fs::write(&out_path, data.as_bytes()).unwrap();
    eprintln!("Rendered to: {}", out_path.display());
}

// ── Comparison: same scenarios rendered with the CURRENT VectorNetwork model ──

/// Helper: draw a VectorNetwork using its own to_paths() + region fill logic,
/// matching VNPainter behavior but with per-face coloring.
fn draw_vn_region_with_color(
    vn: &VectorNetwork,
    canvas: &skia_safe::Canvas,
    color: (u8, u8, u8),
) {
    let paths = vn.to_paths();
    for path in &paths {
        let mut paint = SkPaint::default();
        paint.set_anti_alias(true);
        paint.set_style(PaintStyle::Fill);
        paint.set_color(Color::from_argb(255, color.0, color.1, color.2));
        canvas.draw_path(path, &paint);
    }
}

#[test]
fn current_model_render_all_to_png() {
    let cell_w = 200;
    let cell_h = 240;
    let cols = 6;
    let total_w = cell_w * cols;
    let total_h = cell_h;

    let mut surface = surfaces::raster_n32_premul((total_w as i32, total_h as i32)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::from_argb(255, 245, 245, 245));

    let mut text_paint = SkPaint::default();
    text_paint.set_color(Color::from_argb(255, 40, 40, 40));
    text_paint.set_anti_alias(true);

    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .match_family_style("Arial", FontStyle::normal())
        .or_else(|| font_mgr.match_family_style("Helvetica", FontStyle::normal()))
        .unwrap_or_else(|| font_mgr.legacy_make_typeface(None, FontStyle::normal()).unwrap());
    let label_font = Font::from_typeface(&typeface, 13.0);
    let title_font = Font::from_typeface(&typeface, 11.0);

    let mut grid_paint = SkPaint::default();
    grid_paint.set_color(Color::from_argb(255, 200, 200, 200));
    grid_paint.set_style(PaintStyle::Stroke);
    grid_paint.set_stroke_width(1.0);

    // For each scenario, we define:
    //   - the DESIRED fill_mask (what we want)
    //   - the BEST fill_rule we can use (or "CANNOT" if impossible)
    //   - what the current model actually renders
    struct CurrentScenario {
        label: &'static str,
        desired_mask: &'static str,
        approach: &'static str,
        fill_rule: FillRule,
        /// true = this fill_rule produces the correct result
        correct: bool,
    }

    let scenarios = [
        CurrentScenario {
            label: "Solid Disc",
            desired_mask: "0b111",
            approach: "NonZero (all same)",
            fill_rule: FillRule::NonZero,
            correct: true,
        },
        CurrentScenario {
            label: "Bullseye",
            desired_mask: "0b101",
            approach: "EvenOdd",
            fill_rule: FillRule::EvenOdd,
            correct: true,
        },
        CurrentScenario {
            label: "Donut (3 loops)",
            desired_mask: "0b001",
            approach: "EvenOdd (closest)",
            fill_rule: FillRule::EvenOdd,
            correct: false, // EvenOdd gives 0b101, not 0b001
        },
        CurrentScenario {
            label: "Middle Ring",
            desired_mask: "0b010",
            approach: "NonZero (closest)",
            fill_rule: FillRule::NonZero,
            correct: false, // NonZero gives 0b111, not 0b010
        },
        CurrentScenario {
            label: "Center Dot",
            desired_mask: "0b100",
            approach: "EvenOdd (closest)",
            fill_rule: FillRule::EvenOdd,
            correct: false, // EvenOdd gives 0b101, not 0b100
        },
        CurrentScenario {
            label: "Sibling (L only)",
            desired_mask: "0b01",
            approach: "separate regions",
            fill_rule: FillRule::NonZero, // placeholder
            correct: true,
        },
    ];

    let fill_color: (u8, u8, u8) = (66, 133, 244); // blue for all

    for (col, scenario) in scenarios.iter().enumerate() {
        let ox = (col * cell_w) as f32;
        let oy = 0.0f32;

        // Cell border.
        canvas.draw_rect(
            skia_safe::Rect::from_xywh(ox, oy, cell_w as f32, cell_h as f32),
            &grid_paint,
        );

        // Labels.
        canvas.draw_str(scenario.label, (ox + 8.0, oy + 18.0), &label_font, &text_paint);

        let mut sub_paint = SkPaint::default();
        sub_paint.set_color(Color::from_argb(255, 120, 120, 120));
        sub_paint.set_anti_alias(true);
        canvas.draw_str(
            &format!("want: {}", scenario.desired_mask),
            (ox + 8.0, oy + 32.0),
            &title_font,
            &sub_paint,
        );
        canvas.draw_str(
            &format!("via: {}", scenario.approach),
            (ox + 8.0, oy + 44.0),
            &title_font,
            &sub_paint,
        );

        // Result badge.
        let badge_text = if scenario.correct { "MATCH" } else { "WRONG" };
        let mut badge_paint = SkPaint::default();
        badge_paint.set_anti_alias(true);
        if scenario.correct {
            badge_paint.set_color(Color::from_argb(255, 52, 168, 83));
        } else {
            badge_paint.set_color(Color::from_argb(255, 234, 67, 53));
        }
        canvas.draw_str(badge_text, (ox + 140.0, oy + 18.0), &label_font, &badge_paint);

        let cx = ox + (cell_w as f32) / 2.0;
        let cy = oy + 145.0;

        if col < 5 {
            // Build a VectorNetwork with 3 concentric circle loops and one region.
            let (v, s, loops) = make_concentric_circles(cx, cy, &[80.0, 53.0, 26.0]);

            let region_fills = Paints::new([Paint::Solid(SolidPaint {
                active: true,
                color: CGColor::from_rgba(fill_color.0, fill_color.1, fill_color.2, 255),
                blend_mode: BlendMode::Normal,
            })]);

            let vn = VectorNetwork {
                vertices: v.clone(),
                segments: s.clone(),
                regions: vec![VectorNetworkRegion {
                    loops,
                    fill_rule: scenario.fill_rule.clone(),
                    fills: Some(region_fills),
                }],
            };

            draw_vn_region_with_color(&vn, canvas, fill_color);

            // Outlines.
            let all_loops_data = &vn.regions[0].loops;
            let mut stroke_paint = SkPaint::default();
            stroke_paint.set_color(Color::from_argb(255, 60, 60, 60));
            stroke_paint.set_style(PaintStyle::Stroke);
            stroke_paint.set_stroke_width(1.5);
            stroke_paint.set_anti_alias(true);
            for lp in all_loops_data {
                let mut builder = PathBuilder::new();
                add_loop_to_builder(&mut builder, lp, &v, &s);
                let path = builder.detach();
                canvas.draw_path(&path, &stroke_paint);
            }
        } else {
            // Sibling: use two separate regions (one per circle) — the only way
            // to fill one and not the other with the current model.
            let lcx = cx - 45.0;
            let rcx = cx + 45.0;
            let (v1, s1, l1) = make_concentric_circles(lcx, cy, &[35.0]);
            let (v2, mut s2, l2) = make_concentric_circles(rcx, cy, &[35.0]);
            let v_offset = v1.len();
            let s_offset = s1.len();
            for seg in &mut s2 {
                seg.a += v_offset;
                seg.b += v_offset;
            }
            let mut vertices = v1;
            vertices.extend(v2);
            let mut segments = s1;
            segments.extend(s2);
            let loop_right = VectorNetworkLoop(
                l2[0].0.iter().map(|&i| i + s_offset).collect::<Vec<_>>(),
            );
            let left_loop = l1.into_iter().next().unwrap();

            // Only the left circle gets a filled region.
            let vn = VectorNetwork {
                vertices: vertices.clone(),
                segments: segments.clone(),
                regions: vec![VectorNetworkRegion {
                    loops: vec![left_loop],
                    fill_rule: FillRule::NonZero,
                    fills: Some(Paints::new([Paint::Solid(SolidPaint {
                        active: true,
                        color: CGColor::from_rgba(
                            fill_color.0,
                            fill_color.1,
                            fill_color.2,
                            255,
                        ),
                        blend_mode: BlendMode::Normal,
                    })])),
                }],
            };

            draw_vn_region_with_color(&vn, canvas, fill_color);

            // Outlines for both circles.
            let mut stroke_paint = SkPaint::default();
            stroke_paint.set_color(Color::from_argb(255, 60, 60, 60));
            stroke_paint.set_style(PaintStyle::Stroke);
            stroke_paint.set_stroke_width(1.5);
            stroke_paint.set_anti_alias(true);
            for lp in [
                &vn.regions[0].loops[0],
                &loop_right,
            ] {
                let mut builder = PathBuilder::new();
                add_loop_to_builder(&mut builder, lp, &vertices, &segments);
                let path = builder.detach();
                canvas.draw_path(&path, &stroke_paint);
            }
        }
    }

    // Save.
    let img = surface.image_snapshot();
    let data = img.encode(None, EncodedImageFormat::PNG, None).unwrap();
    let out_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("current_model_output.png");
    std::fs::write(&out_path, data.as_bytes()).unwrap();
    eprintln!("Rendered to: {}", out_path.display());
}

// ── Current model: correct output via multi-region workaround ────────────

/// Shows that the current model CAN produce every pattern — but only by
/// decomposing into multiple regions with carefully chosen loop subsets.
///
/// This is the "best effort" golden: same visual output as the fill_mask
/// version, achieved entirely through `VectorNetworkRegion` + `fill_rule`.
#[test]
fn current_model_workaround_to_png() {
    let cell_w = 200;
    let cell_h = 280;
    let cols = 6;
    let total_w = cell_w * cols;
    let total_h = cell_h;

    let mut surface = surfaces::raster_n32_premul((total_w as i32, total_h as i32)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::from_argb(255, 245, 245, 245));

    let mut text_paint = SkPaint::default();
    text_paint.set_color(Color::from_argb(255, 40, 40, 40));
    text_paint.set_anti_alias(true);

    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .match_family_style("Arial", FontStyle::normal())
        .or_else(|| font_mgr.match_family_style("Helvetica", FontStyle::normal()))
        .unwrap_or_else(|| font_mgr.legacy_make_typeface(None, FontStyle::normal()).unwrap());
    let label_font = Font::from_typeface(&typeface, 13.0);
    let title_font = Font::from_typeface(&typeface, 11.0);

    let mut grid_paint = SkPaint::default();
    grid_paint.set_color(Color::from_argb(255, 200, 200, 200));
    grid_paint.set_style(PaintStyle::Stroke);
    grid_paint.set_stroke_width(1.0);

    let face_colors: [(u8, u8, u8); 3] = [
        (66, 133, 244),  // blue
        (234, 67, 53),   // red
        (52, 168, 83),   // green
    ];

    fn make_fill(c: (u8, u8, u8)) -> Paints {
        Paints::new([Paint::Solid(SolidPaint {
            active: true,
            color: CGColor::from_rgba(c.0, c.1, c.2, 255),
            blend_mode: BlendMode::Normal,
        })])
    }

    // For each scenario, we construct the VectorNetwork regions needed.
    struct WorkaroundScenario {
        label: &'static str,
        desired: &'static str,
        /// How we decompose it.
        recipe: &'static str,
        /// Number of VectorNetworkRegion objects required.
        region_count: usize,
    }

    let scenarios = [
        WorkaroundScenario {
            label: "Solid Disc",
            desired: "0b111",
            recipe: "1 region, NonZero, 3 loops",
            region_count: 1,
        },
        WorkaroundScenario {
            label: "Bullseye",
            desired: "0b101",
            recipe: "1 region, EvenOdd, 3 loops",
            region_count: 1,
        },
        WorkaroundScenario {
            label: "Donut (3 loops)",
            desired: "0b001",
            recipe: "1 region, EvenOdd, 2 loops\n(drop loop₂)",
            region_count: 1,
        },
        WorkaroundScenario {
            label: "Middle Ring",
            desired: "0b010",
            recipe: "1 region, EvenOdd\n{loop₁, loop₂}",
            region_count: 1,
        },
        WorkaroundScenario {
            label: "Center Dot",
            desired: "0b100",
            recipe: "1 region, NonZero\n{loop₂} only",
            region_count: 1,
        },
        WorkaroundScenario {
            label: "Sibling (L only)",
            desired: "0b01",
            recipe: "1 region, {left loop}",
            region_count: 1,
        },
    ];

    for (col, scenario) in scenarios.iter().enumerate() {
        let ox = (col * cell_w) as f32;
        let oy = 0.0f32;

        canvas.draw_rect(
            skia_safe::Rect::from_xywh(ox, oy, cell_w as f32, cell_h as f32),
            &grid_paint,
        );

        canvas.draw_str(scenario.label, (ox + 8.0, oy + 18.0), &label_font, &text_paint);

        let mut sub_paint = SkPaint::default();
        sub_paint.set_color(Color::from_argb(255, 120, 120, 120));
        sub_paint.set_anti_alias(true);
        canvas.draw_str(
            &format!("want: {}", scenario.desired),
            (ox + 8.0, oy + 32.0),
            &title_font,
            &sub_paint,
        );

        // Draw recipe (multi-line).
        for (li, line) in scenario.recipe.split('\n').enumerate() {
            canvas.draw_str(
                line,
                (ox + 8.0, oy + 44.0 + li as f32 * 12.0),
                &title_font,
                &sub_paint,
            );
        }

        let cx = ox + (cell_w as f32) / 2.0;
        let cy = oy + 170.0;

        if col < 5 {
            let (v, s, all_loops) = make_concentric_circles(cx, cy, &[80.0, 53.0, 26.0]);

            // Build the VectorNetwork with the correct region decomposition.
            let regions: Vec<VectorNetworkRegion> = match col {
                0 => {
                    // Solid disc: 1 region, NonZero, all 3 loops
                    vec![VectorNetworkRegion {
                        loops: all_loops.clone(),
                        fill_rule: FillRule::NonZero,
                        fills: Some(make_fill(face_colors[0])),
                    }]
                }
                1 => {
                    // Bullseye: 1 region, EvenOdd, all 3 loops
                    // face₀ ■ (blue), face₁ □, face₂ ■
                    // But EvenOdd with single color only gives one color.
                    // To get per-face colors we need separate regions:
                    vec![
                        VectorNetworkRegion {
                            loops: vec![all_loops[0].clone(), all_loops[1].clone()],
                            fill_rule: FillRule::EvenOdd,
                            fills: Some(make_fill(face_colors[0])), // blue outer
                        },
                        VectorNetworkRegion {
                            loops: vec![all_loops[2].clone()],
                            fill_rule: FillRule::NonZero,
                            fills: Some(make_fill(face_colors[2])), // green center
                        },
                    ]
                }
                2 => {
                    // Donut (outer ring only): use loops[0] + loops[1] with EvenOdd.
                    // This gives: outer ring = filled, inside loop₁ = empty.
                    // loop₂ is simply not included in any region.
                    vec![VectorNetworkRegion {
                        loops: vec![all_loops[0].clone(), all_loops[1].clone()],
                        fill_rule: FillRule::EvenOdd,
                        fills: Some(make_fill(face_colors[0])),
                    }]
                }
                3 => {
                    // Middle ring only: use loops[1] + loops[2] with EvenOdd.
                    // loop₀ excluded entirely.
                    vec![VectorNetworkRegion {
                        loops: vec![all_loops[1].clone(), all_loops[2].clone()],
                        fill_rule: FillRule::EvenOdd,
                        fills: Some(make_fill(face_colors[1])),
                    }]
                }
                4 => {
                    // Center dot only: just loop₂, NonZero.
                    vec![VectorNetworkRegion {
                        loops: vec![all_loops[2].clone()],
                        fill_rule: FillRule::NonZero,
                        fills: Some(make_fill(face_colors[2])),
                    }]
                }
                _ => unreachable!(),
            };

            let vn = VectorNetwork {
                vertices: v.clone(),
                segments: s.clone(),
                regions,
            };

            draw_vn_region_with_color(&vn, canvas, face_colors[0]);

            // But wait — draw_vn_region_with_color uses a single color.
            // For multi-region with per-region colors, use to_paths + region fills.
            // Re-render properly:
            // First clear what we just drew by re-filling the circle area.
            // Actually, let's just render properly via to_paths + each region's fill.

            // Redraw: clear area and render properly per-region.
            let mut bg = SkPaint::default();
            bg.set_color(Color::from_argb(255, 245, 245, 245));
            bg.set_style(PaintStyle::Fill);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(ox + 1.0, oy + 70.0, cell_w as f32 - 2.0, cell_h as f32 - 85.0),
                &bg,
            );

            let paths = vn.to_paths();
            for (region, path) in vn.regions.iter().zip(paths.iter()) {
                if let Some(fills) = &region.fills {
                    for paint_item in fills.as_slice() {
                        if let Paint::Solid(solid) = paint_item {
                            let mut sk = SkPaint::default();
                            sk.set_anti_alias(true);
                            sk.set_style(PaintStyle::Fill);
                            sk.set_color(Color::from_argb(
                                solid.color.a,
                                solid.color.r,
                                solid.color.g,
                                solid.color.b,
                            ));
                            canvas.draw_path(path, &sk);
                        }
                    }
                }
            }

            // Outlines for all 3 loops (even ones not in regions).
            let mut stroke_paint = SkPaint::default();
            stroke_paint.set_color(Color::from_argb(255, 60, 60, 60));
            stroke_paint.set_style(PaintStyle::Stroke);
            stroke_paint.set_stroke_width(1.5);
            stroke_paint.set_anti_alias(true);
            for lp in &all_loops {
                let mut builder = PathBuilder::new();
                add_loop_to_builder(&mut builder, lp, &v, &s);
                let path = builder.detach();
                canvas.draw_path(&path, &stroke_paint);
            }
        } else {
            // Sibling — same as before.
            let lcx = cx - 45.0;
            let rcx = cx + 45.0;
            let (v1, s1, l1) = make_concentric_circles(lcx, cy, &[35.0]);
            let (v2, mut s2, l2) = make_concentric_circles(rcx, cy, &[35.0]);
            let v_offset = v1.len();
            let s_offset = s1.len();
            for seg in &mut s2 {
                seg.a += v_offset;
                seg.b += v_offset;
            }
            let mut vertices = v1;
            vertices.extend(v2);
            let mut segments = s1;
            segments.extend(s2);
            let loop_right = VectorNetworkLoop(
                l2[0].0.iter().map(|&i| i + s_offset).collect::<Vec<_>>(),
            );
            let left_loop = l1.into_iter().next().unwrap();

            let vn = VectorNetwork {
                vertices: vertices.clone(),
                segments: segments.clone(),
                regions: vec![VectorNetworkRegion {
                    loops: vec![left_loop],
                    fill_rule: FillRule::NonZero,
                    fills: Some(make_fill(face_colors[0])),
                }],
            };

            let paths = vn.to_paths();
            for (region, path) in vn.regions.iter().zip(paths.iter()) {
                if let Some(fills) = &region.fills {
                    for paint_item in fills.as_slice() {
                        if let Paint::Solid(solid) = paint_item {
                            let mut sk = SkPaint::default();
                            sk.set_anti_alias(true);
                            sk.set_style(PaintStyle::Fill);
                            sk.set_color(Color::from_argb(
                                solid.color.a,
                                solid.color.r,
                                solid.color.g,
                                solid.color.b,
                            ));
                            canvas.draw_path(path, &sk);
                        }
                    }
                }
            }

            let mut stroke_paint = SkPaint::default();
            stroke_paint.set_color(Color::from_argb(255, 60, 60, 60));
            stroke_paint.set_style(PaintStyle::Stroke);
            stroke_paint.set_stroke_width(1.5);
            stroke_paint.set_anti_alias(true);
            for lp in [&vn.regions[0].loops[0], &loop_right] {
                let mut builder = PathBuilder::new();
                add_loop_to_builder(&mut builder, lp, &vertices, &segments);
                let path = builder.detach();
                canvas.draw_path(&path, &stroke_paint);
            }
        }

        // Legend.
        let legend_y = oy + cell_h as f32 - 12.0;
        let face_labels: Vec<&str> = if col < 5 {
            vec!["outer", "mid", "inner"]
        } else {
            vec!["left", "right"]
        };
        let desired_mask: u64 = match col {
            0 => 0b111,
            1 => 0b101,
            2 => 0b001,
            3 => 0b010,
            4 => 0b100,
            5 => 0b01,
            _ => 0,
        };
        let face_cols: Vec<(u8, u8, u8)> = if col < 5 {
            face_colors.to_vec()
        } else {
            vec![face_colors[0], (180, 180, 180)]
        };
        for (fi, (label, &(cr, cg, cb))) in face_labels.iter().zip(face_cols.iter()).enumerate() {
            let lx = ox + 8.0 + (fi as f32) * 65.0;
            let filled = (desired_mask >> fi) & 1 == 1;
            let mut swatch = SkPaint::default();
            if filled {
                swatch.set_color(Color::from_argb(255, cr, cg, cb));
            } else {
                swatch.set_color(Color::from_argb(255, 220, 220, 220));
            }
            swatch.set_style(PaintStyle::Fill);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(lx, legend_y - 8.0, 10.0, 10.0),
                &swatch,
            );
            let mut sb = SkPaint::default();
            sb.set_color(Color::from_argb(255, 100, 100, 100));
            sb.set_style(PaintStyle::Stroke);
            sb.set_stroke_width(0.5);
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(lx, legend_y - 8.0, 10.0, 10.0),
                &sb,
            );
            canvas.draw_str(*label, (lx + 14.0, legend_y), &title_font, &text_paint);
        }
    }

    let img = surface.image_snapshot();
    let data = img.encode(None, EncodedImageFormat::PNG, None).unwrap();
    let out_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("current_model_workaround_output.png");
    std::fs::write(&out_path, data.as_bytes()).unwrap();
    eprintln!("Rendered to: {}", out_path.display());
}

// ═══════════════════════════════════════════════════════════════════════════
// Complex scenarios — stress-testing the model boundaries
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 0 (non-self-intersecting — fill_mask / face model works):
//   [Open + Closed]   [Shared Edge]   [T-Junction]
//
// Row 1 (self-intersecting — requires planarization):
//   [Z / Bowtie]      [Pentagram]     [Overlapping Circles]
//
// The top row shows where per-face fill works cleanly.
// The bottom row shows where all non-planarized models (fill_rule AND
// fill_mask) break down, because the loop doesn't map 1:1 to geometric faces.

/// Draw small vertex dots at each vertex position.
fn draw_vertex_dots(canvas: &skia_safe::Canvas, vertices: &[(f32, f32)], color: skia_safe::Color) {
    let mut paint = SkPaint::default();
    paint.set_color(color);
    paint.set_anti_alias(true);
    paint.set_style(PaintStyle::Fill);
    for &(x, y) in vertices {
        canvas.draw_circle((x, y), 3.0, &paint);
    }
}

/// Draw segment outlines.
fn draw_segments_wireframe(
    canvas: &skia_safe::Canvas,
    vertices: &[(f32, f32)],
    segments: &[VectorNetworkSegment],
    color: skia_safe::Color,
    width: f32,
) {
    let mut paint = SkPaint::default();
    paint.set_color(color);
    paint.set_anti_alias(true);
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(width);

    for seg in segments {
        let a = vertices[seg.a];
        let b = vertices[seg.b];
        let mut builder = PathBuilder::new();
        builder.move_to((a.0, a.1));
        if seg.ta == (0.0, 0.0) && seg.tb == (0.0, 0.0) {
            builder.line_to((b.0, b.1));
        } else {
            builder.cubic_to(
                (a.0 + seg.ta.0, a.1 + seg.ta.1),
                (b.0 + seg.tb.0, b.1 + seg.tb.1),
                (b.0, b.1),
            );
        }
        canvas.draw_path(&builder.detach(), &paint);
    }
}

/// Render a VectorNetwork using its to_paths + region fills.
fn draw_vn_filled2(canvas: &skia_safe::Canvas, vn: &VectorNetwork) {
    let paths = vn.to_paths();
    for (region, path) in vn.regions.iter().zip(paths.iter()) {
        if let Some(fills) = &region.fills {
            for paint_item in fills.as_slice() {
                if let Paint::Solid(solid) = paint_item {
                    if !solid.active {
                        continue;
                    }
                    let mut sk = SkPaint::default();
                    sk.set_anti_alias(true);
                    sk.set_style(PaintStyle::Fill);
                    sk.set_color(Color::from_argb(
                        solid.color.a,
                        solid.color.r,
                        solid.color.g,
                        solid.color.b,
                    ));
                    canvas.draw_path(path, &sk);
                }
            }
        }
    }
}

#[test]
fn complex_scenarios_to_png() {
    let cell_w = 240i32;
    let cell_h = 340i32;
    let cols = 3i32;
    let rows = 2i32;
    let total_w = cell_w * cols;
    let total_h = cell_h * rows;

    let mut surface = surfaces::raster_n32_premul((total_w, total_h)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::from_argb(255, 252, 252, 252));

    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .match_family_style("Arial", FontStyle::normal())
        .or_else(|| font_mgr.match_family_style("Helvetica", FontStyle::normal()))
        .unwrap_or_else(|| font_mgr.legacy_make_typeface(None, FontStyle::normal()).unwrap());
    let title_font = Font::from_typeface(&typeface, 13.0);
    let small_font = Font::from_typeface(&typeface, 10.0);
    let tiny_font = Font::from_typeface(&typeface, 9.0);

    let mut text_paint = SkPaint::default();
    text_paint.set_color(Color::from_argb(255, 30, 30, 30));
    text_paint.set_anti_alias(true);
    let mut gray_paint = SkPaint::default();
    gray_paint.set_color(Color::from_argb(255, 110, 110, 110));
    gray_paint.set_anti_alias(true);
    let mut ok_paint = SkPaint::default();
    ok_paint.set_color(Color::from_argb(255, 52, 168, 83));
    ok_paint.set_anti_alias(true);
    let mut err_paint = SkPaint::default();
    err_paint.set_color(Color::from_argb(255, 234, 67, 53));
    err_paint.set_anti_alias(true);

    let mut grid_paint = SkPaint::default();
    grid_paint.set_color(Color::from_argb(255, 210, 210, 210));
    grid_paint.set_style(PaintStyle::Stroke);
    grid_paint.set_stroke_width(1.0);

    let blue = (66u8, 133u8, 244u8);
    let red_c = (234u8, 67u8, 53u8);
    let green_c = (52u8, 168u8, 83u8);
    let orange = (255u8, 152u8, 0u8);

    fn mk_paint(c: (u8, u8, u8), alpha: u8) -> Paints {
        Paints::new([Paint::Solid(SolidPaint {
            active: true,
            color: CGColor::from_rgba(c.0, c.1, c.2, alpha),
            blend_mode: BlendMode::Normal,
        })])
    }

    // Draw cell grid.
    for r in 0..rows {
        for c in 0..cols {
            canvas.draw_rect(
                skia_safe::Rect::from_xywh(
                    (c * cell_w) as f32, (r * cell_h) as f32,
                    cell_w as f32, cell_h as f32,
                ),
                &grid_paint,
            );
        }
    }

    // Row tint backgrounds.
    let mut row0_bg = SkPaint::default();
    row0_bg.set_color(Color::from_argb(10, 52, 168, 83));
    row0_bg.set_style(PaintStyle::Fill);
    canvas.draw_rect(skia_safe::Rect::from_xywh(0.0, 0.0, total_w as f32, cell_h as f32), &row0_bg);
    let mut row1_bg = SkPaint::default();
    row1_bg.set_color(Color::from_argb(10, 234, 67, 53));
    row1_bg.set_style(PaintStyle::Fill);
    canvas.draw_rect(skia_safe::Rect::from_xywh(0.0, cell_h as f32, total_w as f32, cell_h as f32), &row1_bg);

    // ─── Cell (0,0): Open + Closed ──────────────────────────────────────
    {
        let ox = 0.0f32;
        let oy = 0.0f32;
        let cx = ox + cell_w as f32 / 2.0;
        let cy = oy + 160.0;

        canvas.draw_str("Open + Closed", (ox + 8.0, oy + 18.0), &title_font, &text_paint);
        canvas.draw_str("stroke-only path + filled loop", (ox + 8.0, oy + 32.0), &small_font, &gray_paint);
        canvas.draw_str("coexist in same network", (ox + 8.0, oy + 44.0), &small_font, &gray_paint);

        // Open zigzag.
        let open_v: Vec<(f32, f32)> = vec![
            (cx - 70.0, cy - 30.0), (cx - 30.0, cy - 70.0),
            (cx + 10.0, cy - 30.0), (cx + 50.0, cy - 70.0),
        ];
        let open_s: Vec<VectorNetworkSegment> = vec![
            VectorNetworkSegment::ab(0, 1), VectorNetworkSegment::ab(1, 2), VectorNetworkSegment::ab(2, 3),
        ];
        // Closed triangle.
        let to = open_v.len();
        let so = open_s.len();
        let mut all_v = open_v.clone();
        all_v.extend(vec![(cx - 50.0, cy + 55.0), (cx + 50.0, cy + 55.0), (cx, cy - 10.0)]);
        let mut all_s = open_s.clone();
        all_s.extend(vec![
            VectorNetworkSegment::ab(to, to + 1), VectorNetworkSegment::ab(to + 1, to + 2),
            VectorNetworkSegment::ab(to + 2, to),
        ]);

        let vn = VectorNetwork {
            vertices: all_v.clone(), segments: all_s.clone(),
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![so, so + 1, so + 2])],
                fill_rule: FillRule::NonZero, fills: Some(mk_paint(blue, 180)),
            }],
        };
        draw_vn_filled2(canvas, &vn);
        draw_segments_wireframe(canvas, &all_v, &all_s, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &all_v, Color::from_argb(255, 234, 67, 53));

        canvas.draw_str("fill_rule:", (ox + 8.0, oy + 270.0), &small_font, &gray_paint);
        canvas.draw_str("✓ works", (ox + 75.0, oy + 270.0), &small_font, &ok_paint);
        canvas.draw_str("fill_mask:", (ox + 8.0, oy + 284.0), &small_font, &gray_paint);
        canvas.draw_str("✓ works", (ox + 75.0, oy + 284.0), &small_font, &ok_paint);
        canvas.draw_str("faces:", (ox + 8.0, oy + 298.0), &small_font, &gray_paint);
        canvas.draw_str("✓ works", (ox + 75.0, oy + 298.0), &small_font, &ok_paint);
        canvas.draw_str("open path → no face, just stroke", (ox + 8.0, oy + 318.0), &tiny_font, &gray_paint);
    }

    // ─── Cell (1,0): Shared Edge ────────────────────────────────────────
    {
        let ox = cell_w as f32;
        let oy = 0.0f32;
        let cx = ox + cell_w as f32 / 2.0;
        let cy = oy + 155.0;

        canvas.draw_str("Shared Edge", (ox + 8.0, oy + 18.0), &title_font, &text_paint);
        canvas.draw_str("two triangles, shared boundary", (ox + 8.0, oy + 32.0), &small_font, &gray_paint);
        canvas.draw_str("independently fillable faces", (ox + 8.0, oy + 44.0), &small_font, &gray_paint);

        let vertices: Vec<(f32, f32)> = vec![
            (cx, cy - 70.0), (cx + 70.0, cy), (cx, cy + 70.0), (cx - 70.0, cy),
        ];
        let segments: Vec<VectorNetworkSegment> = vec![
            VectorNetworkSegment::ab(0, 3), VectorNetworkSegment::ab(3, 2), VectorNetworkSegment::ab(2, 0),
            VectorNetworkSegment::ab(0, 1), VectorNetworkSegment::ab(1, 2), VectorNetworkSegment::ab(2, 0),
        ];
        let vn = VectorNetwork {
            vertices: vertices.clone(), segments: segments.clone(),
            regions: vec![
                VectorNetworkRegion {
                    loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
                    fill_rule: FillRule::NonZero, fills: Some(mk_paint(blue, 200)),
                },
                VectorNetworkRegion {
                    loops: vec![VectorNetworkLoop(vec![3, 4, 5])],
                    fill_rule: FillRule::NonZero, fills: Some(mk_paint(orange, 200)),
                },
            ],
        };
        draw_vn_filled2(canvas, &vn);
        draw_segments_wireframe(canvas, &vertices, &segments, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &vertices, Color::from_argb(255, 234, 67, 53));

        canvas.draw_str("fill_rule:", (ox + 8.0, oy + 270.0), &small_font, &gray_paint);
        canvas.draw_str("✓ 2 regions", (ox + 75.0, oy + 270.0), &small_font, &ok_paint);
        canvas.draw_str("fill_mask:", (ox + 8.0, oy + 284.0), &small_font, &gray_paint);
        canvas.draw_str("✓ mask=0b11", (ox + 75.0, oy + 284.0), &small_font, &ok_paint);
        canvas.draw_str("faces:", (ox + 8.0, oy + 298.0), &small_font, &gray_paint);
        canvas.draw_str("✓ 2 faces, 1 shared edge", (ox + 75.0, oy + 298.0), &small_font, &ok_paint);
        canvas.draw_str("SVG needs 2 separate <path>s", (ox + 8.0, oy + 318.0), &tiny_font, &gray_paint);
    }

    // ─── Cell (2,0): T-Junction ─────────────────────────────────────────
    {
        let ox = (cell_w * 2) as f32;
        let oy = 0.0f32;
        let cx = ox + cell_w as f32 / 2.0;
        let cy = oy + 155.0;

        canvas.draw_str("T-Junction", (ox + 8.0, oy + 18.0), &title_font, &text_paint);
        canvas.draw_str("3 edges meet at one vertex", (ox + 8.0, oy + 32.0), &small_font, &gray_paint);
        canvas.draw_str("impossible in SVG paths", (ox + 8.0, oy + 44.0), &small_font, &gray_paint);

        let vertices: Vec<(f32, f32)> = vec![
            (cx, cy - 65.0),        // 0: top
            (cx - 65.0, cy + 5.0),  // 1: left
            (cx + 65.0, cy + 5.0),  // 2: right
            (cx, cy + 5.0),         // 3: center junction
            (cx, cy + 70.0),        // 4: bottom stem
        ];
        let segments: Vec<VectorNetworkSegment> = vec![
            VectorNetworkSegment::ab(0, 3), // s0: top→center
            VectorNetworkSegment::ab(3, 1), // s1: center→left
            VectorNetworkSegment::ab(1, 0), // s2: left→top
            VectorNetworkSegment::ab(0, 2), // s3: top→right
            VectorNetworkSegment::ab(2, 3), // s4: right→center
            VectorNetworkSegment::ab(3, 0), // s5: center→top
            VectorNetworkSegment::ab(3, 4), // s6: stem (open)
        ];
        let vn = VectorNetwork {
            vertices: vertices.clone(), segments: segments.clone(),
            regions: vec![
                VectorNetworkRegion {
                    loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
                    fill_rule: FillRule::NonZero, fills: Some(mk_paint(blue, 200)),
                },
                VectorNetworkRegion {
                    loops: vec![VectorNetworkLoop(vec![3, 4, 5])],
                    fill_rule: FillRule::NonZero, fills: Some(mk_paint(green_c, 200)),
                },
            ],
        };
        draw_vn_filled2(canvas, &vn);
        draw_segments_wireframe(canvas, &vertices, &segments, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &vertices, Color::from_argb(255, 234, 67, 53));
        canvas.draw_str("3-way", (cx + 6.0, cy + 2.0), &tiny_font, &gray_paint);
        canvas.draw_str("stem", (cx + 6.0, cy + 50.0), &tiny_font, &gray_paint);

        canvas.draw_str("fill_rule:", (ox + 8.0, oy + 270.0), &small_font, &gray_paint);
        canvas.draw_str("✓ 2 regions + open stem", (ox + 75.0, oy + 270.0), &small_font, &ok_paint);
        canvas.draw_str("fill_mask:", (ox + 8.0, oy + 284.0), &small_font, &gray_paint);
        canvas.draw_str("✓ 2 faces + open edge", (ox + 75.0, oy + 284.0), &small_font, &ok_paint);
        canvas.draw_str("faces:", (ox + 8.0, oy + 298.0), &small_font, &gray_paint);
        canvas.draw_str("✓ natural", (ox + 75.0, oy + 298.0), &small_font, &ok_paint);
        canvas.draw_str("SVG impossible: can't branch paths", (ox + 8.0, oy + 318.0), &tiny_font, &gray_paint);
    }

    // ═══════════ Row 1: Self-intersecting ═══════════════════════════════

    // ─── Cell (0,1): Z / Bowtie ─────────────────────────────────────────
    {
        let ox = 0.0f32;
        let oy = cell_h as f32;
        let cx = ox + cell_w as f32 / 2.0;
        let cy = oy + 155.0;
        let hw = 50.0f32;

        canvas.draw_str("Z-Shape (Bowtie)", (ox + 8.0, oy + 18.0), &title_font, &text_paint);
        canvas.draw_str("rect with v1,v2 swapped", (ox + 8.0, oy + 32.0), &small_font, &gray_paint);
        canvas.draw_str("segments cross at center", (ox + 8.0, oy + 44.0), &small_font, &gray_paint);

        let vertices: Vec<(f32, f32)> = vec![
            (cx - hw, cy - hw), // 0: top-left
            (cx + hw, cy + hw), // 1: bottom-right (swapped)
            (cx + hw, cy - hw), // 2: top-right (swapped)
            (cx - hw, cy + hw), // 3: bottom-left
        ];
        let segments: Vec<VectorNetworkSegment> = vec![
            VectorNetworkSegment::ab(0, 1), // diagonal ↘
            VectorNetworkSegment::ab(1, 2), // right side ↑
            VectorNetworkSegment::ab(2, 3), // diagonal ↙ (crosses s0)
            VectorNetworkSegment::ab(3, 0), // left side ↑
        ];

        // LEFT: EvenOdd
        let shift_l = -38.0f32;
        let vl: Vec<(f32, f32)> = vertices.iter().map(|&(x, y)| (x + shift_l, y)).collect();
        let vn_eo = VectorNetwork {
            vertices: vl.clone(), segments: segments.clone(),
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::EvenOdd, fills: Some(mk_paint(blue, 200)),
            }],
        };
        draw_vn_filled2(canvas, &vn_eo);
        draw_segments_wireframe(canvas, &vl, &segments, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &vl, Color::from_argb(255, 234, 67, 53));
        canvas.draw_str("EvenOdd", (cx + shift_l - 20.0, cy + hw + 18.0), &tiny_font, &text_paint);

        // RIGHT: NonZero
        let shift_r = 38.0f32;
        let vr: Vec<(f32, f32)> = vertices.iter().map(|&(x, y)| (x + shift_r, y)).collect();
        let vn_nz = VectorNetwork {
            vertices: vr.clone(), segments: segments.clone(),
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::NonZero, fills: Some(mk_paint(red_c, 200)),
            }],
        };
        draw_vn_filled2(canvas, &vn_nz);
        draw_segments_wireframe(canvas, &vr, &segments, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &vr, Color::from_argb(255, 234, 67, 53));
        canvas.draw_str("NonZero", (cx + shift_r - 20.0, cy + hw + 18.0), &tiny_font, &text_paint);

        canvas.draw_str("fill_rule:", (ox + 8.0, oy + 270.0), &small_font, &gray_paint);
        canvas.draw_str("⚠ ambiguous (2 results)", (ox + 75.0, oy + 270.0), &small_font, &err_paint);
        canvas.draw_str("fill_mask:", (ox + 8.0, oy + 284.0), &small_font, &gray_paint);
        canvas.draw_str("✗ sees 1 face (1 loop)", (ox + 75.0, oy + 284.0), &small_font, &err_paint);
        canvas.draw_str("faces:", (ox + 8.0, oy + 298.0), &small_font, &gray_paint);
        canvas.draw_str("✓ planarize → 3 faces", (ox + 75.0, oy + 298.0), &small_font, &ok_paint);
        canvas.draw_str("crossing creates hidden faces", (ox + 8.0, oy + 318.0), &tiny_font, &gray_paint);
    }

    // ─── Cell (1,1): Pentagram ──────────────────────────────────────────
    {
        let ox = cell_w as f32;
        let oy = cell_h as f32;
        let cx = ox + cell_w as f32 / 2.0;
        let cy = oy + 160.0;
        let r = 60.0f32;

        canvas.draw_str("Pentagram", (ox + 8.0, oy + 18.0), &title_font, &text_paint);
        canvas.draw_str("5 vertices, connect every other", (ox + 8.0, oy + 32.0), &small_font, &gray_paint);
        canvas.draw_str("center pentagon: EO=□  NZ=■", (ox + 8.0, oy + 44.0), &small_font, &gray_paint);

        let mut star_v: Vec<(f32, f32)> = Vec::new();
        for i in 0..5 {
            let angle = -std::f32::consts::FRAC_PI_2 + (i as f32) * 2.0 * std::f32::consts::PI / 5.0;
            star_v.push((r * angle.cos(), r * angle.sin()));
        }
        let star_s: Vec<VectorNetworkSegment> = vec![
            VectorNetworkSegment::ab(0, 2), VectorNetworkSegment::ab(2, 4),
            VectorNetworkSegment::ab(4, 1), VectorNetworkSegment::ab(1, 3),
            VectorNetworkSegment::ab(3, 0),
        ];

        // LEFT: EvenOdd
        let shift_l = -38.0f32;
        let vl: Vec<(f32, f32)> = star_v.iter().map(|&(x, y)| (cx + x + shift_l, cy + y)).collect();
        let vn_eo = VectorNetwork {
            vertices: vl.clone(), segments: star_s.clone(),
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3, 4])],
                fill_rule: FillRule::EvenOdd, fills: Some(mk_paint(blue, 200)),
            }],
        };
        draw_vn_filled2(canvas, &vn_eo);
        draw_segments_wireframe(canvas, &vl, &star_s, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &vl, Color::from_argb(255, 234, 67, 53));
        canvas.draw_str("EvenOdd", (cx + shift_l - 20.0, cy + r + 18.0), &tiny_font, &text_paint);

        // RIGHT: NonZero
        let shift_r = 38.0f32;
        let vr: Vec<(f32, f32)> = star_v.iter().map(|&(x, y)| (cx + x + shift_r, cy + y)).collect();
        let vn_nz = VectorNetwork {
            vertices: vr.clone(), segments: star_s.clone(),
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3, 4])],
                fill_rule: FillRule::NonZero, fills: Some(mk_paint(red_c, 200)),
            }],
        };
        draw_vn_filled2(canvas, &vn_nz);
        draw_segments_wireframe(canvas, &vr, &star_s, Color::from_argb(255, 60, 60, 60), 1.5);
        draw_vertex_dots(canvas, &vr, Color::from_argb(255, 234, 67, 53));
        canvas.draw_str("NonZero", (cx + shift_r - 20.0, cy + r + 18.0), &tiny_font, &text_paint);

        canvas.draw_str("fill_rule:", (ox + 8.0, oy + 270.0), &small_font, &gray_paint);
        canvas.draw_str("⚠ ambiguous (2 results)", (ox + 75.0, oy + 270.0), &small_font, &err_paint);
        canvas.draw_str("fill_mask:", (ox + 8.0, oy + 284.0), &small_font, &gray_paint);
        canvas.draw_str("✗ 1 loop → 1 face only", (ox + 75.0, oy + 284.0), &small_font, &err_paint);
        canvas.draw_str("faces:", (ox + 8.0, oy + 298.0), &small_font, &gray_paint);
        canvas.draw_str("✓ planarize → 6 faces", (ox + 75.0, oy + 298.0), &small_font, &ok_paint);
        canvas.draw_str("5 triangles + 1 center pentagon", (ox + 8.0, oy + 318.0), &tiny_font, &gray_paint);
    }

    // ─── Cell (2,1): Overlapping Circles ────────────────────────────────
    {
        let ox = (cell_w * 2) as f32;
        let oy = cell_h as f32;
        let cx = ox + cell_w as f32 / 2.0;
        let cy = oy + 160.0;

        canvas.draw_str("Overlapping Circles", (ox + 8.0, oy + 18.0), &title_font, &text_paint);
        canvas.draw_str("two loops partially overlap", (ox + 8.0, oy + 32.0), &small_font, &gray_paint);
        canvas.draw_str("intersection is ambiguous", (ox + 8.0, oy + 44.0), &small_font, &gray_paint);

        let (v1, s1, l1) = make_concentric_circles(cx - 28.0, cy, &[55.0]);
        let (v2, mut s2, l2) = make_concentric_circles(cx + 28.0, cy, &[55.0]);
        let v_off = v1.len();
        let s_off = s1.len();
        for seg in &mut s2 { seg.a += v_off; seg.b += v_off; }
        let mut vertices = v1;
        vertices.extend(v2);
        let mut segments = s1;
        segments.extend(s2);
        let right_loop = VectorNetworkLoop(l2[0].0.iter().map(|&i| i + s_off).collect());
        let left_loop = l1.into_iter().next().unwrap();

        let vn = VectorNetwork {
            vertices: vertices.clone(), segments: segments.clone(),
            regions: vec![
                VectorNetworkRegion {
                    loops: vec![left_loop], fill_rule: FillRule::NonZero,
                    fills: Some(mk_paint(blue, 140)),
                },
                VectorNetworkRegion {
                    loops: vec![right_loop], fill_rule: FillRule::NonZero,
                    fills: Some(mk_paint(red_c, 140)),
                },
            ],
        };
        draw_vn_filled2(canvas, &vn);
        draw_segments_wireframe(canvas, &vertices, &segments, Color::from_argb(255, 60, 60, 60), 1.5);

        canvas.draw_str("L", (cx - 55.0, cy + 5.0), &title_font, &text_paint);
        canvas.draw_str("R", (cx + 45.0, cy + 5.0), &title_font, &text_paint);
        canvas.draw_str("L∩R", (cx - 12.0, cy + 5.0), &tiny_font, &text_paint);

        canvas.draw_str("fill_rule:", (ox + 8.0, oy + 270.0), &small_font, &gray_paint);
        canvas.draw_str("✗ double-paints overlap", (ox + 75.0, oy + 270.0), &small_font, &err_paint);
        canvas.draw_str("fill_mask:", (ox + 8.0, oy + 284.0), &small_font, &gray_paint);
        canvas.draw_str("✗ nesting tree wrong", (ox + 75.0, oy + 284.0), &small_font, &err_paint);
        canvas.draw_str("faces:", (ox + 8.0, oy + 298.0), &small_font, &gray_paint);
        canvas.draw_str("✓ planarize → 3 faces", (ox + 75.0, oy + 298.0), &small_font, &ok_paint);
        canvas.draw_str("L-only, L∩R, R-only", (ox + 8.0, oy + 318.0), &tiny_font, &gray_paint);
    }

    // Save.
    let img = surface.image_snapshot();
    let data = img.encode(None, EncodedImageFormat::PNG, None).unwrap();
    let out_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("complex_scenarios_output.png");
    std::fs::write(&out_path, data.as_bytes()).unwrap();
    eprintln!("Rendered to: {}", out_path.display());
}
