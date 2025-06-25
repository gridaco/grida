use crate::utils::mean;
use crate::vector2::Axis;
use crate::{rect, Rectangle};

pub mod flex {
    use super::*;

    /// Inferred main axis direction of a flex-like layout.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum AxisDirection {
        Horizontal,
        Vertical,
    }

    /// Alignment of items along the main axis.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum MainAxisAlignment {
        Start,
        End,
        Center,
    }

    /// Alignment of items along the cross axis.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum CrossAxisAlignment {
        Start,
        End,
        Center,
    }

    /// Result returned by [`guess`].
    #[derive(Debug, Clone, PartialEq)]
    pub struct Guessed {
        pub orders: Vec<usize>,
        pub direction: AxisDirection,
        pub main_axis_alignment: MainAxisAlignment,
        pub cross_axis_alignment: CrossAxisAlignment,
        pub spacing: f32,
        pub union: Rectangle,
    }

    fn guess_cross_alignment(rects: &[Rectangle], cross: Axis) -> CrossAxisAlignment {
        let starts: Vec<f32> = rects
            .iter()
            .map(|r| if cross == Axis::X { r.x } else { r.y })
            .collect();
        let centers: Vec<f32> = rects
            .iter()
            .map(|r| {
                if cross == Axis::X {
                    r.x + r.width / 2.0
                } else {
                    r.y + r.height / 2.0
                }
            })
            .collect();
        let ends: Vec<f32> = rects
            .iter()
            .map(|r| {
                if cross == Axis::X {
                    r.x + r.width
                } else {
                    r.y + r.height
                }
            })
            .collect();

        let stdev = |vals: &[f32]| -> f32 {
            if vals.len() < 2 {
                return 0.0;
            }
            let m = mean(vals);
            let var: f32 = vals.iter().map(|&v| (v - m).powi(2)).sum::<f32>() / vals.len() as f32;
            var.sqrt()
        };

        let sd_start = stdev(&starts);
        let sd_center = stdev(&centers);
        let sd_end = stdev(&ends);

        let min = sd_start.min(sd_center.min(sd_end));
        if (min - sd_start).abs() <= f32::EPSILON {
            CrossAxisAlignment::Start
        } else if (min - sd_center).abs() <= f32::EPSILON {
            CrossAxisAlignment::Center
        } else {
            CrossAxisAlignment::End
        }
    }

    /// Guesses layout properties (direction, spacing and alignment) from a list
    /// of bounding boxes.
    ///
    /// The algorithm roughly follows these steps:
    /// 1. Sum gaps along both axes and pick the axis with the larger gap spread
    ///    as the main axis.
    /// 2. Compute average spacing along the chosen axis.
    /// 3. Sort rectangles on that axis to derive their order.
    /// 4. Estimate cross axis alignment by comparing the variance of starts,
    ///    centers and ends.
    pub fn guess(boundingboxes: &[Rectangle]) -> Guessed {
        assert!(
            !boundingboxes.is_empty(),
            "At least one bounding box is required."
        );

        let unioned = rect::union(boundingboxes);
        let width = unioned.width;
        let height = unioned.height;

        let x_gaps = rect::get_gaps(boundingboxes, Axis::X);
        let y_gaps = rect::get_gaps(boundingboxes, Axis::Y);
        let total_x_gap: f32 = x_gaps.iter().sum();
        let total_y_gap: f32 = y_gaps.iter().sum();

        let axis = if (total_x_gap - total_y_gap).abs() > 1.0 {
            if total_x_gap > total_y_gap {
                Axis::X
            } else {
                Axis::Y
            }
        } else {
            if width >= height {
                Axis::X
            } else {
                Axis::Y
            }
        };

        let gaps = rect::get_gaps(boundingboxes, axis);
        let spacing = if gaps.is_empty() {
            0.0
        } else {
            mean(&gaps).max(0.0)
        };

        let mut orders: Vec<(usize, f32)> = boundingboxes
            .iter()
            .enumerate()
            .map(|(i, r)| (i, if axis == Axis::X { r.x } else { r.y }))
            .collect();
        orders.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let orders: Vec<usize> = orders.into_iter().map(|(i, _)| i).collect();

        let cross = axis.counter();
        let cross_align = guess_cross_alignment(boundingboxes, cross);

        Guessed {
            union: unioned,
            direction: if axis == Axis::X {
                AxisDirection::Horizontal
            } else {
                AxisDirection::Vertical
            },
            spacing,
            main_axis_alignment: MainAxisAlignment::Start,
            cross_axis_alignment: cross_align,
            orders,
        }
    }
}
