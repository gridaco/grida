use crate::schema::*;
use crate::transform::AffineTransform;

/// Factory for creating nodes with default values
pub struct NodeFactory;

impl NodeFactory {
    // Internal factory defaults
    const DEFAULT_SIZE: Size = Size {
        width: 100.0,
        height: 100.0,
    };

    const DEFAULT_BASE: BaseNode = BaseNode {
        id: String::new(),
        name: String::new(),
        active: true,
    };

    const DEFAULT_COLOR: Color = Color(255, 255, 255, 255);
    const DEFAULT_STROKE_COLOR: Color = Color(0, 0, 0, 255);
    const DEFAULT_STROKE_WIDTH: f32 = 1.0;
    const DEFAULT_OPACITY: f32 = 1.0;

    fn default_base_node() -> BaseNode {
        Self::DEFAULT_BASE.clone()
    }

    fn default_solid_paint(color: Color) -> Paint {
        Paint::Solid(SolidPaint { color })
    }

    /// Creates a new rectangle node with default values
    pub fn create_rectangle_node() -> RectangleNode {
        RectangleNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effect: None,
        }
    }

    /// Creates a new ellipse node with default values
    pub fn create_ellipse_node() -> EllipseNode {
        EllipseNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Creates a new line node with default values
    pub fn create_line_node() -> LineNode {
        LineNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Size {
                width: Self::DEFAULT_SIZE.width,
                height: 0.0,
            },
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Creates a new text span node with default values
    pub fn create_text_span_node() -> TextSpanNode {
        TextSpanNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Size {
                width: Self::DEFAULT_SIZE.width,
                height: 20.0,
            },
            text: String::new(),
            text_style: TextStyle {
                text_decoration: TextDecoration::None,
                font_family: String::from("Arial"),
                font_size: 16.0,
                font_weight: FontWeight::default(),
                letter_spacing: None,
                line_height: None,
            },
            text_align: TextAlign::Left,
            text_align_vertical: TextAlignVertical::Top,
            fill: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke: None,
            stroke_width: None,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Creates a new group node with default values
    pub fn create_group_node() -> GroupNode {
        GroupNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            children: Vec::new(),
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Creates a new container node with default values
    pub fn create_container_node() -> ContainerNode {
        ContainerNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            children: Vec::new(),
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            stroke: None,
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effect: None,
        }
    }

    /// Creates a new regular polygon node with default values
    pub fn create_regular_polygon_node() -> RegularPolygonNode {
        RegularPolygonNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            point_count: 3, // Triangle by default
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Creates a new path node with default values
    pub fn create_path_node() -> PathNode {
        PathNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            data: String::new(),
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
        }
    }

    /// Creates a new image node with default values
    pub fn create_image_node() -> ImageNode {
        ImageNode {
            base: Self::default_base_node(),
            transform: AffineTransform::identity(),
            size: Self::DEFAULT_SIZE,
            corner_radius: RectangularCornerRadius::zero(),
            fill: Self::default_solid_paint(Self::DEFAULT_COLOR),
            stroke: Self::default_solid_paint(Self::DEFAULT_STROKE_COLOR),
            stroke_width: Self::DEFAULT_STROKE_WIDTH,
            opacity: Self::DEFAULT_OPACITY,
            blend_mode: BlendMode::Normal,
            effect: None,
            _ref: String::new(),
        }
    }
}
