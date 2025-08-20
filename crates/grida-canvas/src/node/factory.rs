use std::f32;

use super::schema::*;
use crate::cg::types::*;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use uuid::Uuid;

/// Factory for creating nodes with default values
pub struct NodeFactory;

impl NodeFactory {
    pub fn new() -> Self {
        Self {}
    }

    fn id(&self) -> String {
        // random id
        let id = Uuid::new_v4();
        id.to_string()
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
            opacity: 1.0,
        })
    }

    fn default_image_paint() -> ImagePaint {
        ImagePaint {
            // TODO: use the built in image hash
            hash: String::new(),
            opacity: 1.0,
            transform: AffineTransform::identity(),
            fit: BoxFit::Cover,
        }
    }

    /// Creates a new rectangle node with default values
    pub fn create_rectangle_node(&self) -> RectangleNodeRec {
        RectangleNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fills: vec![Self::default_solid_paint(Self::DEFAULT_COLOR)],
            strokes: vec![],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    /// Creates a new ellipse node with default values
    pub fn create_ellipse_node(&self) -> EllipseNodeRec {
        EllipseNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            inner_radius: None,
            start_angle: 0.0,
            angle: None,
            fills: vec![Self::default_solid_paint(Self::DEFAULT_COLOR)],
            strokes: vec![],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
            corner_radius: None,
        }
    }

    /// Creates a new line node with default values
    pub fn create_line_node(&self) -> LineNodeRec {
        LineNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Size {
                width: Self::DEFAULT_SIZE.width,
                height: 0.0,
            },
            strokes: vec![Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR)],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            _data_stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    /// Creates a new text span node with default values
    pub fn create_text_span_node(&self) -> TextSpanNodeRec {
        TextSpanNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            width: None,
            max_lines: None,
            ellipsis: None,
            text: String::new(),
            text_style: TextStyle {
                text_decoration: TextDecoration::None,
                font_family: String::from("Geist"),
                font_size: 16.0,
                font_weight: FontWeight::default(),
                italic: false,
                letter_spacing: None,
                line_height: None,
                text_transform: TextTransform::None,
            },
            text_align: TextAlign::Left,
            text_align_vertical: TextAlignVertical::Top,
            fill: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke: None,
            stroke_width: None,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    /// Creates a new group node with default values
    pub fn create_group_node(&self) -> GroupNodeRec {
        GroupNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: None,
            children: Vec::new(),
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Creates a new container node with default values
    pub fn create_container_node(&self) -> ContainerNodeRec {
        ContainerNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            children: Vec::new(),
            fills: vec![Self::default_solid_paint(Self::DEFAULT_COLOR)],
            strokes: vec![],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
            clip: true,
        }
    }

    /// Creates a new path node with default values
    pub fn create_path_node(&self) -> SVGPathNodeRec {
        SVGPathNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            data: String::new(),
            stroke: None,
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    /// Creates a new regular polygon node with default values
    pub fn create_regular_polygon_node(&self) -> RegularPolygonNodeRec {
        RegularPolygonNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            point_count: 3, // Triangle by default
            corner_radius: 0.0,
            fills: vec![Self::default_solid_paint(Self::DEFAULT_COLOR)],
            strokes: vec![],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    pub fn create_regular_star_polygon_node(&self) -> RegularStarPolygonNodeRec {
        RegularStarPolygonNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            point_count: 5,    // 5-pointed star by default
            inner_radius: 0.4, // Default inner radius
            corner_radius: 0.0,
            fills: vec![Self::default_solid_paint(Self::DEFAULT_COLOR)],
            strokes: vec![],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    pub fn create_polygon_node(&self) -> PolygonNodeRec {
        PolygonNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            points: Vec::new(),
            corner_radius: 0.0,
            fills: vec![Self::default_solid_paint(Self::DEFAULT_COLOR)],
            strokes: vec![],
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        }
    }

    /// Creates a new image node with default values
    pub fn create_image_node(&self) -> ImageNodeRec {
        ImageNodeRec {
            id: self.id(),
            name: None,
            active: true,
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fill: Self::default_image_paint(),
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            stroke_align: Self::DEFAULT_STROKE_ALIGN,
            stroke_dash_array: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
            hash: String::new(),
        }
    }
}
