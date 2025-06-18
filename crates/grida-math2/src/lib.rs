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
pub mod transform;
pub mod ui;
pub mod utils;
pub mod vector2;
pub mod vector4;

pub use align::{scalar as align_scalar, vector2 as align_vector2};
pub use bezier::{
    CubicBezier, CubicBezierWithTangents, a2c as bezier_a2c, get_bbox as bezier_get_bbox,
};
pub use color::{
    RGBA8888, RGBAf, TRGBA, hex_to_rgba8888, rgba_to_unit8_chunk, rgba8888_to_hex,
    rgbaf_multiply_alpha, rgbaf_to_rgba8888,
};
pub use compass::{invert_direction, to_rectangle_side};
pub use delta::transform as delta_transform;
pub use layout::flex::{
    AxisDirection as FlexAxisDirection, CrossAxisAlignment as FlexCrossAxisAlignment,
    Guessed as FlexGuessed, MainAxisAlignment as FlexMainAxisAlignment, guess as layout_flex_guess,
};
pub use measurement::{Measurement, auxiliary_line_xylr, guide_line_xylr, measure};
pub use packing::{ext::walk_to_fit as packing_walk_to_fit, fit as packing_fit};
pub use range::{
    Range, UniformGapGroup, from_rectangle, group_ranges_by_uniform_gap, length as range_length,
    mean as range_mean, to_3points_chunk,
};
pub use raster::{
    Bitmap, bresenham as raster_bresenham, circle as raster_circle, ellipse as raster_ellipse,
    floodfill as raster_floodfill, fract, gaussian as raster_gaussian, noise, pad as raster_pad,
    pascaltriangle as raster_pascaltriangle, rectangle as raster_rectangle,
    resize as raster_resize, scale as raster_scale, smoothstep as raster_smoothstep,
    tile as raster_tile,
};
pub use rect::boolean::subtract as rect_boolean_subtract;
pub use rect::{
    AlignKind, Alignment, CardinalDirection, Rect9Points, Rectangle, RectangleSide, Sides,
    align as rect_align, align_a as rect_align_a, aspect_ratio, axis_projection_intersection,
    contains, contains_point, distribute_evenly as rect_distribute_evenly, from_points,
    get_cardinal_point, get_center, get_gaps as rect_get_gaps, get_relative_transform,
    get_scale_factors, get_uniform_gap as rect_get_uniform_gap, inset as rect_inset, intersection,
    intersects, is_identical as rect_identical, is_uniform as rect_uniform, offset,
    pad as rect_pad, positive as rect_positive, quantize as rect_quantize, rotate as rect_rotate,
    tile as rect_tile, to_9points, to_9points_chunk, transform as rect_transform, union,
};
pub use region::{Region, difference as region_difference, subtract as region_subtract};
pub use snap::axis::{
    AxisAlignedPoint, Movement, Snap1DResult, Snap2DAxisAlignedResult, Snap2DAxisConfig,
    axis_locked_by_dominance, normalize as movement_normalize, snap1d, snap2d_axis_aligned,
};
pub use snap::canvas::{Guide as SnapGuide, SnapToCanvasResult, snap_to_canvas_geometry};
pub use snap::spacing::{
    DistributionGeometry1D, ProjectionPoint as SnapProjectionPoint, plot_distribution_geometry,
};
pub use snap::viewport::{
    Margins as ViewportMargins, transform_to_fit as viewport_transform_to_fit,
};
pub use ui::{
    Line as UiLine, Point as UiPoint, Rule as UiRule, format_number, normalize_line,
    transform_line, transform_point,
};
pub use utils::{
    angle_to_axis, clamp, combinations, is_uniform, mean, nearest, permutations, powerset,
    principal_angle, quantize,
};
pub use vector4::{Vector4, identical as vector4_identical};
