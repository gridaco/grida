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
