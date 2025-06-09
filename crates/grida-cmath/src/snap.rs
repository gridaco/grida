pub mod spacing {
    use crate::range::{self, Range};
    use crate::utils::mean;

    #[derive(Debug, Clone, Copy, PartialEq)]
    pub struct ProjectionPoint {
        pub p: f32,
        pub o: f32,
        pub fwd: i32,
    }

    #[derive(Debug, Clone, PartialEq)]
    pub struct DistributionGeometry1D {
        pub ranges: Vec<Range>,
        pub loops: Vec<[usize; 2]>,
        pub gaps: Vec<f32>,
        pub a: Vec<Vec<ProjectionPoint>>, 
        pub b: Vec<Vec<ProjectionPoint>>, 
    }

    pub fn plot_distribution_geometry(ranges: &[Range], agent_length: Option<f32>) -> DistributionGeometry1D {
        let grouped = range::group_ranges_by_uniform_gap(ranges, Some(2), 0.0);

        let mut loops = Vec::new();
        let mut gaps = Vec::new();
        let mut a_points = Vec::new();
        let mut b_points = Vec::new();

        for (i, group) in grouped.iter().enumerate() {
            if group.loop_indices.len() != 2 { continue; }
            let loop_idx = [group.loop_indices[0], group.loop_indices[1]];
            let gap = group.gap;
            let min = group.min;
            let max = group.max;

            let mut a: Vec<ProjectionPoint> = Vec::new();
            let mut b: Vec<ProjectionPoint> = Vec::new();

            if gap > 0.0 {
                a.push(ProjectionPoint { p: max + gap, o: max, fwd: i as i32 });
                b.push(ProjectionPoint { p: min - gap, o: min, fwd: i as i32 });

                if let Some(agent_len) = agent_length {
                    if loop_idx.len() == 2 && agent_len < gap {
                        let center_range = [ranges[loop_idx[0]][1], ranges[loop_idx[1]][0]];
                        let center = mean(&center_range);
                        let egap = (gap - agent_len) / 2.0;
                        let cpa = center - agent_len / 2.0;
                        let cpb = center + agent_len / 2.0;
                        a.push(ProjectionPoint { p: cpa, o: cpa - egap, fwd: -1 });
                        b.push(ProjectionPoint { p: cpb, o: cpb + egap, fwd: -1 });
                    }
                }
            }

            for (j, test) in grouped.iter().enumerate() {
                if i == j || test.gap <= 0.0 { continue; }

                if test.max < group.max {
                    a.push(ProjectionPoint { p: group.max + test.gap, o: group.max, fwd: j as i32 });
                }

                if test.min > group.min {
                    b.push(ProjectionPoint { p: group.min - test.gap, o: group.min, fwd: j as i32 });
                }
            }

            loops.push(loop_idx);
            gaps.push(gap);
            a_points.push(a);
            b_points.push(b);
        }

        DistributionGeometry1D {
            ranges: ranges.to_vec(),
            loops,
            gaps,
            a: a_points,
            b: b_points,
        }
    }
}
pub mod viewport {
    use crate::{rect::Rectangle, transform::AffineTransform};

    /// Margin values for top, right, bottom and left.
    #[derive(Debug, Clone, Copy)]
    pub struct Margins {
        pub top: f32,
        pub right: f32,
        pub bottom: f32,
        pub left: f32,
    }

    impl From<f32> for Margins {
        fn from(all: f32) -> Self {
            Self { top: all, right: all, bottom: all, left: all }
        }
    }

    impl From<[f32; 4]> for Margins {
        fn from(arr: [f32; 4]) -> Self {
            Self { top: arr[0], right: arr[1], bottom: arr[2], left: arr[3] }
        }
    }

    /// Returns an affine transform that fits `target` inside `viewport` with optional margin.
    ///
    /// The smaller scale between width and height is used so the entire target
    /// remains visible within the viewport.
    ///
    /// # Parameters
    /// - `viewport`: The viewport rectangle.
    /// - `target`:   The bounding box of the contents.
    /// - `margin`:   Either a uniform margin or per-side margins `[top, right, bottom, left]`.
    ///
    /// # Example
    /// ```
    /// # use grida_cmath::{Rectangle, viewport_transform_to_fit};
    /// let viewport = Rectangle { x: 0.0, y: 0.0, width: 800.0, height: 600.0 };
    /// let target = Rectangle { x: 100.0, y: 50.0, width: 400.0, height: 400.0 };
    /// let t = viewport_transform_to_fit(viewport, target, [50.0, 20.0, 50.0, 20.0]);
    /// assert!((t.matrix[0][0] - 1.25).abs() < 0.01);
    /// ```
    pub fn transform_to_fit(
        viewport: Rectangle,
        target: Rectangle,
        margin: impl Into<Margins>,
    ) -> AffineTransform {
        let m: Margins = margin.into();

        let v_w = viewport.width - m.left - m.right;
        let v_h = viewport.height - m.top - m.bottom;

        if v_w <= 0.0 || v_h <= 0.0 || target.width == 0.0 || target.height == 0.0 {
            return AffineTransform { matrix: [[1.0, 0.0, viewport.x], [0.0, 1.0, viewport.y]] };
        }

        let scale = f32::min(v_w / target.width, v_h / target.height);

        let vx = viewport.x + m.left + v_w / 2.0;
        let vy = viewport.y + m.top + v_h / 2.0;

        let tx = target.x + target.width / 2.0;
        let ty = target.y + target.height / 2.0;

        let translate_x = vx - tx * scale;
        let translate_y = vy - ty * scale;

        AffineTransform { matrix: [[scale, 0.0, translate_x], [0.0, scale, translate_y]] }
    }
}

pub mod axis {
    use std::collections::HashSet;
    use crate::align;
    use crate::vector2::Vector2;

    /// A 2D point that may ignore one axis when snapping.
    pub type AxisAlignedPoint = (Option<f32>, Option<f32>);

    /// Result of 1D snapping with indices of matched agents and anchors.
    #[derive(Debug, Clone, PartialEq)]
    pub struct Snap1DResult {
        pub distance: f32,
        pub hit_agent_indices: Vec<usize>,
        pub hit_anchor_indices: Vec<usize>,
    }

    /// Snap scalar agents to anchors within `threshold` allowing small tolerance.
    pub fn snap1d(agents: &[f32], anchors: &[f32], threshold: f32, tolerance: f32) -> Snap1DResult {
        if anchors.is_empty() {
            return Snap1DResult { distance: f32::INFINITY, hit_agent_indices: vec![], hit_anchor_indices: vec![] };
        }
        assert!(threshold >= 0.0 && tolerance >= 0.0);
        let mut min_delta = f32::INFINITY;
        let mut signed_delta = 0.0;
        let mut hit_agents = Vec::new();
        let mut hit_anchors: HashSet<usize> = HashSet::new();
        for (i, &a) in agents.iter().enumerate() {
            let (_snap, delta, idxs) = align::scalar(a, anchors, threshold);
            let signed = _snap - a;
            if delta.abs() <= threshold {
                if min_delta.is_infinite() || (signed - signed_delta).abs() <= tolerance {
                    hit_agents.push(i);
                    for idx in idxs { hit_anchors.insert(idx); }
                    if delta.abs() < min_delta.abs() {
                        min_delta = delta;
                        signed_delta = signed;
                    }
                }
            }
        }
        if min_delta.is_infinite() {
            Snap1DResult { distance: f32::INFINITY, hit_agent_indices: vec![], hit_anchor_indices: vec![] }
        } else {
            Snap1DResult { distance: signed_delta, hit_agent_indices: hit_agents, hit_anchor_indices: hit_anchors.into_iter().collect() }
        }
    }

    /// Configuration for per-axis snapping thresholds.
    #[derive(Debug, Clone, Copy)]
    pub struct Snap2DAxisConfig {
        pub x: Option<f32>,
        pub y: Option<f32>,
    }

    /// Result from snapping on each axis independently.
    #[derive(Debug, Clone, PartialEq)]
    pub struct Snap2DAxisAlignedResult {
        pub x: Option<Snap1DResult>,
        pub y: Option<Snap1DResult>,
    }

    /// Snaps 2D points to anchors independently on each axis.
    pub fn snap2d_axis_aligned(agents: &[Vector2], anchors: &[AxisAlignedPoint], config: Snap2DAxisConfig, tolerance: f32) -> Snap2DAxisAlignedResult {
        if anchors.is_empty() {
            return Snap2DAxisAlignedResult { x: None, y: None };
        }
        assert!(!agents.is_empty(), "agents required");

        let x_agents: Vec<f32> = agents.iter().map(|v| v[0]).collect();
        let y_agents: Vec<f32> = agents.iter().map(|v| v[1]).collect();
        let x_anchors: Vec<f32> = anchors.iter().filter_map(|(x, _)| *x).collect();
        let y_anchors: Vec<f32> = anchors.iter().filter_map(|(_, y)| *y).collect();

        let x = config.x.and_then(|t| Some(snap1d(&x_agents, &x_anchors, t, tolerance)));
        let y = config.y.and_then(|t| Some(snap1d(&y_agents, &y_anchors, t, tolerance)));
        Snap2DAxisAlignedResult { x, y }
    }

    /// Movement vector that can ignore an axis using `None`.
    pub type Movement = (Option<f32>, Option<f32>);

    /// Normalizes movement treating `None` as zero.
    pub fn normalize(m: Movement) -> Vector2 {
        [m.0.unwrap_or(0.0), m.1.unwrap_or(0.0)]
    }

    /// Locks movement to the dominant axis returning `None` for the other.
    pub fn axis_locked_by_dominance(m: Movement) -> Movement {
        let abs_x = m.0.unwrap_or(0.0).abs();
        let abs_y = m.1.unwrap_or(0.0).abs();
        if abs_x > abs_y { (m.0, None) } else { (None, m.1) }
    }
}

