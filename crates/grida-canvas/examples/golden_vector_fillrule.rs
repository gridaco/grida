use cg::shape::*;
use skia_safe::{surfaces, Color, Paint, PaintStyle, PathFillType};

fn main() {
    // Helper to create a segment without tangents
    fn segment(a: usize, b: usize) -> VectorNetworkSegment {
        VectorNetworkSegment {
            a,
            b,
            ta: None,
            tb: None,
        }
    }

    // VectorNetwork representing a square with a square hole (donut shape)
    // Outer square is clockwise, inner square is counter-clockwise
    let network = VectorNetwork {
        vertices: vec![
            // outer square
            (50.0, 50.0),   // 0
            (150.0, 50.0),  // 1
            (150.0, 150.0), // 2
            (50.0, 150.0),  // 3
            // inner square (hole)
            (80.0, 80.0),   // 4
            (80.0, 120.0),  // 5
            (120.0, 120.0), // 6
            (120.0, 80.0),  // 7
        ],
        segments: vec![
            // outer loop (clockwise)
            segment(0, 1),
            segment(1, 2),
            segment(2, 3),
            segment(3, 0),
            // this will result both fill rule to have hollow square
            // // inner loop (counter-clockwise)
            // segment(4, 5),
            // segment(5, 6),
            // segment(6, 7),
            // segment(7, 4),
            // inner loop (clockwise)
            // this is what we want to demonstrate
            segment(4, 7),
            segment(7, 6),
            segment(6, 5),
            segment(5, 4),
        ],
        regions: vec![VectorNetworkRegion {
            loops: vec![
                VectorNetworkLoop(vec![0, 1, 2, 3]), // outer
                VectorNetworkLoop(vec![4, 5, 6, 7]), // inner hole
            ],
        }],
    };

    // Build paths for each region (currently one)
    let paths = build_paths(&network);

    let mut surface = surfaces::raster_n32_premul((400, 200)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLACK);
    fill_paint.set_style(PaintStyle::Fill);

    // Draw with winding fill rule on the left
    for path in &paths {
        let mut p = path.clone();
        p.set_fill_type(PathFillType::Winding);
        canvas.draw_path(&p, &fill_paint);
    }

    // Draw with even-odd fill rule on the right
    canvas.translate((200.0, 0.0));
    for path in &paths {
        let mut p = path.clone();
        p.set_fill_type(PathFillType::EvenOdd);
        canvas.draw_path(&p, &fill_paint);
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/vector_fillrule.png", data.as_bytes()).unwrap();
}

// Convert a VectorNetwork with regions into individual Skia paths
fn build_paths(vn: &VectorNetwork) -> Vec<skia_safe::Path> {
    fn is_zero(t: (f32, f32)) -> bool {
        t.0 == 0.0 && t.1 == 0.0
    }

    let mut paths = Vec::new();
    for region in &vn.regions {
        let mut path = skia_safe::Path::new();
        for VectorNetworkLoop(seg_indices) in &region.loops {
            if seg_indices.is_empty() {
                continue;
            }

            let first = &vn.segments[seg_indices[0]];
            let mut current_start = first.a;
            let mut previous_end = None;

            for &idx in seg_indices {
                let seg = &vn.segments[idx];
                let a_idx = seg.a;
                let b_idx = seg.b;
                let a = vn.vertices[a_idx];
                let b = vn.vertices[b_idx];
                let ta = seg.ta.unwrap_or((0.0, 0.0));
                let tb = seg.tb.unwrap_or((0.0, 0.0));

                if previous_end != Some(a_idx) {
                    path.move_to((a.0, a.1));
                    current_start = a_idx;
                }

                if is_zero(ta) && is_zero(tb) {
                    path.line_to((b.0, b.1));
                } else {
                    let c1 = (a.0 + ta.0, a.1 + ta.1);
                    let c2 = (b.0 + tb.0, b.1 + tb.1);
                    path.cubic_to(c1, c2, (b.0, b.1));
                }

                previous_end = Some(b_idx);
                if Some(b_idx) == Some(current_start) {
                    path.close();
                    previous_end = None;
                }
            }
        }
        paths.push(path);
    }
    paths
}
