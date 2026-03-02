use skia_safe;

/// # Corner Radius: Two Distinct Backends
///
/// Grida has **two different corner rounding mechanisms** that produce
/// visually different curves. This is a known limitation.
///
/// ## Backend 1: `corner_path` PathEffect (this function)
///
/// Used by: **polygons, stars, and vector nodes with `corner_radius`**.
///
/// Skia's `PathEffect::corner_path(r)` walks the path and, at each sharp
/// vertex, cuts the two adjacent edges at distance `r` from the corner and
/// connects the cut points. The resulting corner is **not** a circular arc —
/// it is a simpler geometric cut that depends on the angle between the edges.
///
/// ## Backend 2: Native `SkRRect` (conic arcs)
///
/// Used by: **rectangles with corner radius** (the `RectangleNode` primitive).
///
/// Skia's `RRect` internally uses **conic curves** (rational quadratic Bézier
/// with weight `w = √2/2`) to draw true circular arcs at each corner. This
/// produces a geometrically precise quarter-circle.
///
/// ## Why they differ
///
/// The two approaches use mathematically distinct curve types:
///
/// - **`corner_path`** (`SkCornerPathEffect`): At each corner, cuts the two
///   adjacent edges at distance `r` from the vertex, then connects the cut
///   points with a **quadratic Bézier** (`quadTo`) whose control point is
///   the original corner vertex. This traces a **parabolic arc**.
///
/// - **Native rrect** (`SkRRect`): Uses **conic curves** (rational quadratic
///   Bézier with weight `w = √2/2`) at each corner, which trace a **true
///   circular arc** of radius `r`.
///
/// A parabolic arc and a circular arc through the same two endpoints with
/// the same corner vertex as control point are different curves. At large
/// radii (e.g. `r = 80` on a 400×400 rectangle), the difference is clearly
/// visible — roughly 1–2% of pixels differ, with entire pixels filled in
/// one but empty in the other.
///
/// ## Implications for flatten (shape → vector)
///
/// When flattening a rectangle to a vector node:
/// - **Do NOT** use "simple rect VN + `corner_radius`" for rectangles, because
///   the vector renderer applies `corner_path` (Backend 1), which would produce
///   a different shape than the original rrect (Backend 2).
/// - **Always bake** the rrect Bézier curves into the vector network geometry.
///   This guarantees pixel-identical output.
///
/// Polygons and stars are safe to flatten as "straight VN + `corner_radius`"
/// because their original rendering already uses `corner_path` (Backend 1).
///
/// ## Future work
///
/// `SkCornerPathEffect` is **pure CPU path manipulation** — it walks the path
/// vertices, computes cut points, and emits `quadTo` segments. There is no
/// GPU shader involved. This means we can replace it with a custom
/// implementation that emits **conic arcs** (matching `SkRRect`) instead of
/// quadratic Béziers, without any GPU/shader work and without significant
/// performance loss. The algorithm is ~150 lines of C++ (see
/// `SkCornerPathEffect.cpp`). A Rust port that uses `conicTo` instead of
/// `quadTo` at line 92 would unify both backends.
///
/// See also: `golden_corner_radius_backends` example for a visual comparison.
pub fn build_corner_radius_path(path: &skia_safe::Path, r: f32) -> skia_safe::Path {
    let mut paint = skia_safe::Paint::default();
    paint.set_path_effect(skia_safe::PathEffect::corner_path(r));
    let mut dst = skia_safe::Path::new();
    skia_safe::path_utils::fill_path_with_paint(path, &paint, &mut dst, None, None);

    dst
}
