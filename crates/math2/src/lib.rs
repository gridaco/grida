pub mod align;
pub mod bezier;
pub mod box_fit;
pub mod color;
pub mod compass;
pub mod delta;
pub mod layout;
pub mod measurement;
pub mod packing;
pub mod range;
pub mod raster;
pub mod rect;
pub mod region;
pub mod snap;
pub mod tile;
pub mod transform;
pub mod ui;
pub mod utils;
pub mod vector2;
pub mod vector4;

pub use align::{scalar as align_scalar, vector2 as align_vector2};
pub use bezier::{
    a2c as bezier_a2c, get_bbox as bezier_get_bbox, CubicBezier, CubicBezierWithTangents,
};
pub use color::{
    hex_to_rgba8888, rgba8888_to_hex, rgba_to_unit8_chunk, rgbaf_multiply_alpha, rgbaf_to_rgba8888,
    RGBAf, RGBA8888, TRGBA,
};
pub use compass::{invert_direction, to_rectangle_side};
pub use delta::transform as delta_transform;
pub use layout::flex::{
    guess as layout_flex_guess, AxisDirection as FlexAxisDirection,
    CrossAxisAlignment as FlexCrossAxisAlignment, Guessed as FlexGuessed,
    MainAxisAlignment as FlexMainAxisAlignment,
};
pub use measurement::{auxiliary_line_xylr, guide_line_xylr, measure, Measurement};
pub use packing::{ext::walk_to_fit as packing_walk_to_fit, fit as packing_fit};
pub use range::{
    from_rectangle, group_ranges_by_uniform_gap, length as range_length, mean as range_mean,
    to_3points_chunk, Range, UniformGapGroup,
};
pub use raster::{
    bresenham as raster_bresenham, circle as raster_circle, ellipse as raster_ellipse,
    floodfill as raster_floodfill, fract, gaussian as raster_gaussian, noise, pad as raster_pad,
    pascaltriangle as raster_pascaltriangle, rectangle as raster_rectangle,
    resize as raster_resize, scale as raster_scale, smoothstep as raster_smoothstep,
    tile as raster_tile, Bitmap,
};
pub use rect::boolean::subtract as rect_boolean_subtract;
pub use rect::{
    align as rect_align, align_a as rect_align_a, aspect_ratio, axis_projection_intersection,
    contains, contains_point, distribute_evenly as rect_distribute_evenly, get_cardinal_point,
    get_center, get_gaps as rect_get_gaps, get_relative_transform, get_scale_factors,
    get_uniform_gap as rect_get_uniform_gap, inset as rect_inset, intersection, intersects,
    is_identical as rect_identical, is_uniform as rect_uniform, offset, pad as rect_pad,
    positive as rect_positive, quantize as rect_quantize, rotate as rect_rotate, tile as rect_tile,
    to_9points, to_9points_chunk, transform as rect_transform, union, AlignKind, Alignment,
    CardinalDirection, Rect9Points, Rectangle, RectangleSide, Sides,
};
pub use region::{difference as region_difference, subtract as region_subtract, Region};
pub use snap::axis::{
    axis_locked_by_dominance, normalize as movement_normalize, snap1d, snap2d_axis_aligned,
    AxisAlignedPoint, Movement, Snap1DResult, Snap2DAxisAlignedResult, Snap2DAxisConfig,
};
pub use snap::canvas::{snap_to_canvas_geometry, Guide as SnapGuide, SnapToCanvasResult};
pub use snap::spacing::{
    plot_distribution_geometry, DistributionGeometry1D, ProjectionPoint as SnapProjectionPoint,
};
pub use snap::viewport::{
    transform_to_fit as viewport_transform_to_fit, Margins as ViewportMargins,
};
pub use ui::{
    format_number, normalize_line, transform_line, transform_point, Line as UiLine,
    Point as UiPoint, Rule as UiRule,
};
pub use utils::{
    angle_to_axis, clamp, combinations, is_uniform, mean, nearest, permutations, powerset,
    principal_angle, quantize,
};
pub use vector4::{identical as vector4_identical, Vector4};
