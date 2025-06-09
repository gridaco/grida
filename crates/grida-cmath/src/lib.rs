pub mod transform;
pub mod vector2;
pub mod vector4;
pub mod bezier;
pub mod rect;
pub mod compass;
pub mod delta;
pub mod range;
pub mod raster;
pub mod align;
pub mod utils;
pub mod snap;
pub mod packing;
pub mod layout;
pub mod measurement;
pub mod ui;

pub use rect::{
    Rectangle, Rect9Points, RectangleSide, CardinalDirection, Sides, AlignKind, Alignment,
    from_points, to_9points, to_9points_chunk, contains, contains_point, offset, intersects,
    intersection, union, quantize as rect_quantize, positive as rect_positive, aspect_ratio,
    get_scale_factors, get_relative_transform, transform as rect_transform, rotate as rect_rotate,
    get_cardinal_point, get_center, axis_projection_intersection, is_identical as rect_identical,
    is_uniform as rect_uniform, pad as rect_pad, inset as rect_inset, align as rect_align,
    align_a as rect_align_a, get_gaps as rect_get_gaps, get_uniform_gap as rect_get_uniform_gap,
    distribute_evenly as rect_distribute_evenly
};
pub use rect::boolean::subtract as rect_boolean_subtract;
pub use range::{Range, UniformGapGroup, mean as range_mean, from_rectangle, length as range_length, to_3points_chunk, group_ranges_by_uniform_gap};
pub use vector4::{Vector4, identical as vector4_identical};
pub use delta::transform as delta_transform;
pub use compass::{invert_direction, to_rectangle_side};
pub use raster::{fract, noise, bresenham as raster_bresenham, rectangle as raster_rectangle, Bitmap, tile as raster_tile, scale as raster_scale, resize as raster_resize, pad as raster_pad, circle as raster_circle, ellipse as raster_ellipse, floodfill as raster_floodfill, gaussian as raster_gaussian, smoothstep as raster_smoothstep, pascaltriangle as raster_pascaltriangle};
pub use align::{scalar as align_scalar, vector2 as align_vector2};
pub use bezier::{CubicBezier, CubicBezierWithTangents, get_bbox as bezier_get_bbox, a2c as bezier_a2c};
pub use utils::{quantize, clamp, nearest, principal_angle, angle_to_axis, is_uniform, mean, combinations, permutations, powerset};
pub use snap::spacing::{ProjectionPoint as SnapProjectionPoint, DistributionGeometry1D, plot_distribution_geometry};
pub use snap::viewport::{transform_to_fit as viewport_transform_to_fit, Margins as ViewportMargins};
pub use snap::axis::{AxisAlignedPoint, Snap1DResult, Snap2DAxisConfig, Snap2DAxisAlignedResult, snap1d, snap2d_axis_aligned, Movement, normalize as movement_normalize, axis_locked_by_dominance};
pub use packing::{fit as packing_fit, ext::walk_to_fit as packing_walk_to_fit};
pub use layout::flex::{guess as layout_flex_guess, AxisDirection as FlexAxisDirection, MainAxisAlignment as FlexMainAxisAlignment, CrossAxisAlignment as FlexCrossAxisAlignment, Guessed as FlexGuessed};
pub use measurement::{measure, guide_line_xylr, auxiliary_line_xylr, Measurement};
pub use ui::{Rule as UiRule, Point as UiPoint, Line as UiLine, transform_point, transform_line, normalize_line, format_number};
