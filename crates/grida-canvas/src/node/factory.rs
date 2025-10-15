use std::f32;

use super::schema::*;
use crate::cg::{types::*, Alignment};
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

    const DEFAULT_COLOR: CGColor = CGColor(255, 255, 255, 255);
    const DEFAULT_STROKE_COLOR: CGColor = CGColor(0, 0, 0, 255);
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
            name: None,
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            effects: LayerEffects::default(),
        }
    }

    /// Creates a new ellipse node with default values
    pub fn create_ellipse_node(&self) -> EllipseNodeRec {
        EllipseNodeRec {
            name: None,
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
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            corner_radius: None,
        }
    }

    /// Creates a new line node with default values
    pub fn create_line_node(&self) -> LineNodeRec {
        LineNodeRec {
            name: None,
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
            _data_stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
        }
    }

    /// Creates a new text span node with default values
    pub fn create_text_span_node(&self) -> TextSpanNodeRec {
        TextSpanNodeRec {
            name: None,
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            width: None,
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
            name: None,
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
            name: None,
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            strokes: Paints::default(),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            effects: LayerEffects::default(),
            clip: true,
            layout_mode: LayoutMode::default(),
            layout_direction: Axis::default(),
            layout_wrap: LayoutWrap::default(),
            layout_main_axis_alignment: MainAxisAlignment::default(),
            layout_cross_axis_alignment: CrossAxisAlignment::default(),
            padding: EdgeInsets::default(),
            layout_gap: LayoutGap::default(),
        }
    }

    /// Creates a new path node with default values
    pub fn create_path_node(&self) -> SVGPathNodeRec {
        SVGPathNodeRec {
            name: None,
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::identity(),
            fills: Paints::new([Self::default_solid_paint(Self::DEFAULT_COLOR)]),
            data: String::new(),
            strokes: Paints::default(),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
        }
    }

    /// Creates a new regular polygon node with default values
    pub fn create_regular_polygon_node(&self) -> RegularPolygonNodeRec {
        RegularPolygonNodeRec {
            name: None,
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
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
        }
    }

    pub fn create_regular_star_polygon_node(&self) -> RegularStarPolygonNodeRec {
        RegularStarPolygonNodeRec {
            name: None,
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
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
        }
    }

    pub fn create_polygon_node(&self) -> PolygonNodeRec {
        PolygonNodeRec {
            name: None,
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
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
        }
    }

    /// Creates a new image node with default values
    pub fn create_image_node(&self) -> ImageNodeRec {
        ImageNodeRec {
            name: None,
            active: true,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: LayerBlendMode::default(),
            effects: LayerEffects::default(),
            mask: None,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fill: Self::default_image_paint(),
            strokes: Paints::new([Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR)]),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            image: ResourceRef::RID(String::new()),
        }
    }
}
