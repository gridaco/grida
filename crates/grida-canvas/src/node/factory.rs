use std::f32;

use super::schema::*;
use crate::cg::prelude::*;
use math2::{box_fit::BoxFit, transform::AffineTransform};

/// Factory for creating nodes with default values.
///
/// Note: The factory creates nodes with a placeholder ID of 0.
/// Actual IDs should be assigned by SceneRuntime or another ID management system.
pub struct NodeFactory;

impl NodeFactory {
    pub fn new() -> Self {
        Self {}
    }

    // Internal factory defaults
    const DEFAULT_SIZE: Size = Size {
        width: 100.0,
        height: 100.0,
    };

    const DEFAULT_COLOR: CGColor = CGColor::from_rgba(255, 255, 255, 255);
    const DEFAULT_STROKE_COLOR: CGColor = CGColor::from_rgba(0, 0, 0, 255);
    const DEFAULT_STROKE_WIDTH: f32 = 1.0;
    const DEFAULT_STROKE_ALIGN: StrokeAlign = StrokeAlign::Inside;
    const DEFAULT_OPACITY: f32 = 1.0;

    fn default_solid_paint(color: CGColor) -> Paint {
        Paint::Solid(SolidPaint {
            color,
            blend_mode: BlendMode::default(),
            active: true,
        })
    }

    fn default_image_paint() -> ImagePaint {
        ImagePaint {
            // TODO: use the built in image ref
            image: ResourceRef::RID(String::new()),
            quarter_turns: 0,
            alignement: Alignment::CENTER,
            fit: ImagePaintFit::Fit(BoxFit::Cover),
            opacity: 1.0,
            blend_mode: BlendMode::default(),
            filters: ImageFilters::default(),
            active: true,
        }
    }

    /// Creates a new rectangle node with default values
    pub fn create_rectangle_node(&self) -> RectangleNodeRec {
        RectangleNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            corner_smoothing: Default::default(),
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: StrokeWidth::Uniform(Self::DEFAULT_STROKE_WIDTH),
            effects: LayerEffects::default(),
            layout_child: None,
        }
    }

    /// Creates a new ellipse node with default values
    pub fn create_ellipse_node(&self) -> EllipseNodeRec {
        EllipseNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            inner_radius: None,
            start_angle: 0.0,
            angle: None,
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: SingularStrokeWidth(Some(Self::DEFAULT_STROKE_WIDTH)),
            corner_radius: None,
            layout_child: None,
        }
    }

    /// Creates a new line node with default values
    pub fn create_line_node(&self) -> LineNodeRec {
        LineNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            size: Size {
                width: Self::DEFAULT_SIZE.width,
                height: 0.0,
            },
            strokes: Paints::new([Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR)]),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_cap: StrokeCap::default(),
            stroke_miter_limit: StrokeMiterLimit::default(),
            _data_stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            marker_start_shape: StrokeMarkerPreset::default(),
            marker_end_shape: StrokeMarkerPreset::default(),
            layout_child: None,
        }
    }

    /// Creates a new text span node with default values
    pub fn create_text_span_node(&self) -> TextSpanNodeRec {
        TextSpanNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            width: None,
            layout_child: None,
            height: None,
            max_lines: None,
            ellipsis: None,
            text: String::new(),
            text_style: TextStyleRec::from_font("Geist", 16.0),
            text_align: TextAlign::Left,
            text_align_vertical: TextAlignVertical::Top,
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR)]),
            strokes: Paints::default(),
            stroke_width: 0.0,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
        }
    }

    /// Creates a new group node with default values
    pub fn create_group_node(&self) -> GroupNodeRec {
        GroupNodeRec {
            active: true,
            transform: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
        }
    }

    /// Creates a new container node with default values
    pub fn create_container_node(&self) -> ContainerNodeRec {
        ContainerNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: Default::default(),
            mask: None,
            rotation: 0.0,
            position: Default::default(),
            corner_radius: Default::default(),
            corner_smoothing: Default::default(),
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Default::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: StrokeWidth::Uniform(Self::DEFAULT_STROKE_WIDTH),
            effects: Default::default(),
            clip: true,
            layout_container: LayoutContainerStyle {
                layout_mode: LayoutMode::Normal,
                layout_direction: Axis::Horizontal,
                layout_wrap: None,
                layout_main_axis_alignment: None,
                layout_cross_axis_alignment: None,
                layout_padding: None,
                layout_gap: None,
            },
            layout_dimensions: LayoutDimensionStyle {
                layout_target_width: Some(Self::DEFAULT_SIZE.width),
                layout_target_height: Some(Self::DEFAULT_SIZE.height),
                ..Default::default()
            },
            layout_child: None,
        }
    }

    /// Creates a new initial container block (ICB) node
    ///
    /// ICB fills viewport. By default has Normal layout (no flex).
    /// Set layout_mode to Flex to enable flex layout for children.
    /// No visual properties - purely structural.
    pub fn create_initial_container_node(&self) -> InitialContainerNodeRec {
        InitialContainerNodeRec {
            active: true,
            layout_mode: LayoutMode::Normal,
            layout_direction: Axis::Horizontal,
            layout_wrap: LayoutWrap::NoWrap,
            layout_main_axis_alignment: MainAxisAlignment::Start,
            layout_cross_axis_alignment: CrossAxisAlignment::Start,
            padding: EdgeInsets::default(),
            layout_gap: LayoutGap::default(),
        }
    }

    /// Creates a new path node with default values
    pub fn create_path_node(&self) -> PathNodeRec {
        PathNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            data: String::new(),
            strokes: Paints::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: SingularStrokeWidth(Some(Self::DEFAULT_STROKE_WIDTH)),
            layout_child: None,
        }
    }

    /// Creates a new regular polygon node with default values
    pub fn create_regular_polygon_node(&self) -> RegularPolygonNodeRec {
        RegularPolygonNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            point_count: 3, // Triangle by default
            corner_radius: 0.0,
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: SingularStrokeWidth(Some(Self::DEFAULT_STROKE_WIDTH)),
            layout_child: None,
        }
    }

    pub fn create_regular_star_polygon_node(&self) -> RegularStarPolygonNodeRec {
        RegularStarPolygonNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            point_count: 5,    // 5-pointed star by default
            inner_radius: 0.4, // Default inner radius
            corner_radius: 0.0,
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: SingularStrokeWidth(Some(Self::DEFAULT_STROKE_WIDTH)),
            layout_child: None,
        }
    }

    pub fn create_polygon_node(&self) -> PolygonNodeRec {
        PolygonNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            points: Vec::new(),
            corner_radius: 0.0,
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: SingularStrokeWidth(Some(Self::DEFAULT_STROKE_WIDTH)),
            layout_child: None,
        }
    }

    /// Creates a new image node with default values
    pub fn create_image_node(&self) -> ImageNodeRec {
        ImageNodeRec {
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            effects: LayerEffects::default(),
            mask: None,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            corner_smoothing: Default::default(),
            fill: Self::default_image_paint(),
            strokes: Paints::new([Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR)]),
            stroke_style: StrokeStyle {
                stroke_align: Self::DEFAULT_STROKE_ALIGN,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                stroke_miter_limit: StrokeMiterLimit::default(),
                stroke_dash_array: None,
            },
            stroke_width: StrokeWidth::Uniform(Self::DEFAULT_STROKE_WIDTH),
            image: ResourceRef::RID(String::new()),
            layout_child: None,
        }
    }
}
