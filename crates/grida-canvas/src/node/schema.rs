use crate::cg;
use crate::cg::prelude::*;
pub use crate::cg::types::{FontFeature, FontVariation};
use crate::node::scene_graph::SceneGraph;
use crate::shape::*;
use crate::vectornetwork::*;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;
// Re-export the ID types from the id module
pub use crate::node::id::{NodeId, NodeIdGenerator, UserNodeId};

#[derive(Debug, Clone)]
pub struct LayerEffects {
    /// single layer blur is supported per layer
    /// layer blur is applied after all other effects
    pub blur: Option<FeLayerBlur>,
    /// single backdrop blur is supported per layer
    pub backdrop_blur: Option<FeBackdropBlur>,
    /// multiple shadows are supported per layer (drop shadow, inner shadow)
    pub shadows: Vec<FilterShadowEffect>,
    /// single liquid glass effect is supported per layer (only fully supported with rectangular shapes)
    pub glass: Option<FeLiquidGlass>,
    /// multiple noise effects are supported per layer
    pub noises: Vec<FeNoiseEffect>,
}

impl LayerEffects {
    /// Create a new LayerEffects (alias for default)
    pub fn new() -> Self {
        Self::default()
    }

    /// Set layer blur effect
    pub fn blur(mut self, blur: impl Into<FeBlur>) -> Self {
        self.blur = Some(FeLayerBlur::from(blur.into()));
        self
    }

    /// Set backdrop blur effect
    pub fn backdrop_blur(mut self, blur: impl Into<FeBlur>) -> Self {
        self.backdrop_blur = Some(FeBackdropBlur::from(blur.into()));
        self
    }

    /// Add a drop shadow effect
    pub fn drop_shadow(mut self, shadow: impl Into<FeShadow>) -> Self {
        self.shadows
            .push(FilterShadowEffect::DropShadow(shadow.into()));
        self
    }

    /// Add multiple drop shadow effects
    pub fn drop_shadows(mut self, shadows: Vec<FeShadow>) -> Self {
        for shadow in shadows {
            self.shadows.push(FilterShadowEffect::DropShadow(shadow));
        }
        self
    }

    /// Add an inner shadow effect
    pub fn inner_shadow(mut self, shadow: impl Into<FeShadow>) -> Self {
        self.shadows
            .push(FilterShadowEffect::InnerShadow(shadow.into()));
        self
    }

    /// Add multiple inner shadow effects
    pub fn inner_shadows(mut self, shadows: Vec<FeShadow>) -> Self {
        for shadow in shadows {
            self.shadows.push(FilterShadowEffect::InnerShadow(shadow));
        }
        self
    }

    /// Add a noise effect
    pub fn noise(mut self, noise: impl Into<FeNoiseEffect>) -> Self {
        self.noises.push(noise.into());
        self
    }

    /// Add multiple noise effects
    pub fn noises(mut self, noises: Vec<FeNoiseEffect>) -> Self {
        self.noises.extend(noises);
        self
    }

    /// Set liquid glass effect
    pub fn glass(mut self, glass: impl Into<FeLiquidGlass>) -> Self {
        self.glass = Some(glass.into());
        self
    }

    /// Convert a list of filter effects into a layer effects object.
    /// if multiple effects that is not supported, the last effect will be used.
    pub fn from_array(effects: Vec<FilterEffect>) -> Self {
        let mut layer_effects = Self::default();
        for effect in effects {
            match effect {
                FilterEffect::LayerBlur(blur) => layer_effects.blur = Some(blur),
                FilterEffect::BackdropBlur(blur) => layer_effects.backdrop_blur = Some(blur),
                FilterEffect::LiquidGlass(glass) => layer_effects.glass = Some(glass),
                FilterEffect::DropShadow(shadow) => layer_effects
                    .shadows
                    .push(FilterShadowEffect::DropShadow(shadow)),
                FilterEffect::InnerShadow(shadow) => layer_effects
                    .shadows
                    .push(FilterShadowEffect::InnerShadow(shadow)),
                FilterEffect::Noise(noise) => layer_effects.noises.push(noise),
            }
        }
        layer_effects
    }

    #[deprecated(note = "will be removed")]
    pub fn fallback_first_any_effect(&self) -> Option<FilterEffect> {
        if let Some(blur) = &self.blur {
            return Some(FilterEffect::LayerBlur(blur.clone()));
        }
        if let Some(backdrop_blur) = &self.backdrop_blur {
            return Some(FilterEffect::BackdropBlur(backdrop_blur.clone()));
        }
        if !self.shadows.is_empty() {
            return Some(self.shadows.last().unwrap().clone().into());
        }
        None
    }
}

impl Default for LayerEffects {
    fn default() -> Self {
        Self {
            blur: None,
            backdrop_blur: None,
            shadows: vec![],
            glass: None,
            noises: vec![],
        }
    }
}

/// common stroke style
/// not used for special node types,
/// - line
/// - vector
/// - text
#[derive(Debug, Clone)]
pub struct StrokeStyle {
    pub stroke_align: StrokeAlign,
    pub stroke_cap: StrokeCap,
    pub stroke_join: StrokeJoin,
    pub stroke_miter_limit: StrokeMiterLimit,
    pub stroke_dash_array: Option<StrokeDashArray>,
}

impl Default for StrokeStyle {
    fn default() -> Self {
        Self {
            stroke_align: StrokeAlign::default(),
            stroke_cap: StrokeCap::default(),
            stroke_join: StrokeJoin::default(),
            stroke_miter_limit: StrokeMiterLimit::default(),
            stroke_dash_array: None,
        }
    }
}

impl StrokeStyle {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_align(&mut self, align: StrokeAlign) {
        self.stroke_align = align;
    }

    pub fn set_cap(&mut self, cap: StrokeCap) {
        self.stroke_cap = cap;
    }

    pub fn set_join(&mut self, join: StrokeJoin) {
        self.stroke_join = join;
    }

    pub fn set_miter_limit(&mut self, limit: impl Into<StrokeMiterLimit>) {
        self.stroke_miter_limit = limit.into();
    }

    pub fn set_dash_array(&mut self, dash_array: Option<impl Into<StrokeDashArray>>) {
        self.stroke_dash_array = dash_array.map(|d| d.into());
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

// region: Scene
/// Runtime scene representation.
///
/// The scene graph contains both the tree structure (links) and node data (nodes).
/// This provides a centralized, efficient way to manage scene hierarchy.
#[derive(Debug, Clone)]
pub struct Scene {
    pub name: String,
    /// Scene graph containing tree structure and node data
    pub graph: SceneGraph,
    pub background_color: Option<CGColor>,
}

// endregion

// region: Node Definitions

/// flat unknown node properties
/// this is a standard spec for each exposed property names and types.
pub struct UnknownNodeProperties {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub children: Option<Vec<NodeId>>,
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask_type: LayerMaskType,

    pub size: Option<Size>,
    pub point_count: Option<usize>,
    pub inner_radius: f32,

    /// start angle in degrees
    /// default is 0.0
    pub start_angle: f32,
    /// sweep angle in degrees (end_angle = start_angle + angle)
    pub angle: Option<f32>,

    /// The scalar corner radius of the shape.
    pub corner_radius: f32,

    /// The top-left corner [Radius] of the rectangular shape.
    pub corner_radius_top_left: Option<Radius>,
    /// The top-right corner [Radius] of the rectangular shape.
    pub corner_radius_top_right: Option<Radius>,
    /// The bottom-right corner [Radius] of the rectangular shape.
    pub corner_radius_bottom_right: Option<Radius>,
    /// The bottom-left corner [Radius] of the rectangular shape.
    pub corner_radius_bottom_left: Option<Radius>,
    // #endregion
    /// The paint used to fill the interior of the shape.
    pub fills: Paints,

    /// The stroke paint used to outline the shape.
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: UnknownStrokeWidth,
    /// The effects applied to the shape.
    pub effects: LayerEffects,

    /// Text content (plain UTF-8).
    pub text: Option<String>,
    /// Font & fill appearance.
    pub text_style: Option<TextStyleRec>,
    /// Horizontal alignment.
    pub text_align: Option<TextAlign>,
    /// Vertical alignment of text within its container height.
    ///
    /// See [`TextSpanNodeRec::text_align_vertical`] for detailed documentation
    /// on how vertical text alignment works in this system.
    pub text_align_vertical: Option<TextAlignVertical>,
}

/// Universal **Layout Model** — geometry-first, with layout as an optional feature.
///
/// This structure defines a flexible, engine-agnostic layout model designed for
/// 2D scene graphs, editors, and design tools (like Grida).  
/// It treats **geometry** (`x`, `y`, `width`, `height`) as the source of truth,
/// while **layout behavior** (constraints, flexbox, etc.) acts as a secondary feature.
///
///
/// ## Design Philosophy
///
/// - **Geometry-first:**  
///   Direct manipulation (drag, resize) writes to explicit coordinates.
///   Layout only runs when explicitly enabled or attached.
///
/// - **Layout as a feature:**  
///   Layout engines (constraint, flexbox, grid, etc.) are *plugins* rather than the primary model.
///
/// - **Universal 2D:**  
///   Designed to accommodate constraint layout (AutoLayout-style),
///   flow-based layout (CSS/Flexbox), and manual placement (absolute/anchored).
///
///
/// ## Supported Concepts
///
/// - **Relative positioning**
///   - Child elements positioned relative to their parent or constraints.
/// - **Inset / constraint layout**
///   - Anchors and offsets similar to Android’s ConstraintLayout or iOS AutoLayout.
///   - Auto-resizing between opposing constraints (e.g., `left + right`).
/// - **Min/Max size**
///   - Optional bounds to clamp final computed size.
/// - **Flexbox model**
///   - Horizontal or vertical layout direction, wrapping, and alignment.
/// - **Padding and gap**
///   - Internal spacing and inter-item gaps (like CSS `padding` and `gap`).
///
///
/// ## Why not just the CSS Box Model?
///
/// The CSS box model is layout-first — every element participates in flow,
/// and geometry is derived from layout.  
/// This model is **the inverse**: geometry exists independently, and layout
/// is applied *optionally* as a feature.  
///
/// This allows:
/// - Direct manipulation on canvas (like Figma, Sketch, Grida Canvas)
/// - Partial layout (only certain containers auto-layout)
/// - Constraint-based resizing (anchors, aspect ratios)
/// - More intuitive runtime control for graphics tools
///
#[derive(Debug, Clone)]
pub struct UniformNodeLayout {
    // -------------------------------------------------------------------------
    // Position
    // -------------------------------------------------------------------------
    /// Positioning basis for this node within its parent or layout context.
    pub layout_position: LayoutPositioningBasis,

    // -------------------------------------------------------------------------
    // Size targets and constraints
    // -------------------------------------------------------------------------
    /// Preferred layout target width.
    ///
    /// Acts as a sizing *preference* and may be overridden or resolved differently
    /// by layout engines depending on context.
    pub layout_target_width: Option<f32>,

    /// Preferred layout target height.
    ///
    /// Acts as a sizing *preference* and may be overridden or resolved differently
    /// by layout engines depending on context.
    pub layout_target_height: Option<f32>,

    /// Minimum allowed width (hard constraint).
    pub layout_min_width: Option<f32>,

    /// Maximum allowed width (hard constraint).
    pub layout_max_width: Option<f32>,

    /// Minimum allowed height (hard constraint).
    pub layout_min_height: Option<f32>,

    /// Maximum allowed height (hard constraint).
    pub layout_max_height: Option<f32>,

    /// Preferred layout aspect ratio expressed as `(width, height)`.
    ///
    /// Stored as a normalized ratio pair and interpreted by layout engines as
    /// `width / height`.
    ///
    /// This value is advisory:
    /// - It may be used to resolve an under-specified dimension
    ///   (e.g. width known, height `auto`).
    /// - It must not override explicit width/height targets.
    /// - It must not violate min/max size constraints.
    ///
    /// Layout engines that do not support aspect-ratio-aware sizing may ignore
    /// this value entirely.
    pub layout_target_aspect_ratio: Option<(f32, f32)>,

    // -------------------------------------------------------------------------
    // Layout container properties
    // -------------------------------------------------------------------------
    /// Layout mode applied to this node when acting as a container.
    pub layout_mode: LayoutMode,

    /// Primary layout axis (horizontal or vertical).
    pub layout_direction: Axis,

    /// Wrapping behavior for child elements.
    pub layout_wrap: Option<LayoutWrap>,

    /// Alignment of children along the main axis.
    pub layout_main_axis_alignment: Option<MainAxisAlignment>,

    /// Alignment of children along the cross axis.
    pub layout_cross_axis_alignment: Option<CrossAxisAlignment>,

    /// Padding applied inside the container.
    pub layout_padding: Option<EdgeInsets>,

    /// Gap between child elements.
    pub layout_gap: Option<LayoutGap>,

    // -------------------------------------------------------------------------
    // Layout child properties
    // -------------------------------------------------------------------------
    /// Positioning mode when this node participates as a child in a layout.
    pub layout_positioning: LayoutPositioning,

    /// Growth factor used by flexible layout engines (e.g. flexbox).
    pub layout_grow: Option<f32>,
}

impl UniformNodeLayout {
    /// Creates a new `LayoutStyle` with default values.
    pub fn new() -> Self {
        Self {
            layout_mode: LayoutMode::Normal,
            layout_positioning: LayoutPositioning::Auto,
            layout_position: LayoutPositioningBasis::Cartesian(CGPoint::default()),
            layout_target_width: None,
            layout_target_height: None,
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
            layout_direction: Axis::Horizontal,
            layout_wrap: None,
            layout_main_axis_alignment: None,
            layout_cross_axis_alignment: None,
            layout_padding: None,
            layout_gap: None,
            layout_grow: None,
        }
    }

    pub fn merge_from_container_style(mut self, container_style: LayoutContainerStyle) -> Self {
        self.layout_mode = container_style.layout_mode;
        self.layout_direction = container_style.layout_direction;
        self.layout_wrap = container_style.layout_wrap;
        self.layout_main_axis_alignment = container_style.layout_main_axis_alignment;
        self.layout_cross_axis_alignment = container_style.layout_cross_axis_alignment;
        self.layout_padding = container_style.layout_padding;
        self.layout_gap = container_style.layout_gap;
        self
    }

    pub fn merge_from_child_style(mut self, child_style: Option<LayoutChildStyle>) -> Self {
        if let Some(child_style) = child_style {
            self.layout_grow = Some(child_style.layout_grow);
            self.layout_positioning = child_style.layout_positioning;
        }
        self
    }

    pub fn merge_from_dimensions(mut self, dimensions: LayoutDimensionStyle) -> Self {
        self.layout_target_width = dimensions.layout_target_width;
        self.layout_target_height = dimensions.layout_target_height;
        self.layout_min_width = dimensions.layout_min_width;
        self.layout_max_width = dimensions.layout_max_width;
        self.layout_min_height = dimensions.layout_min_height;
        self.layout_max_height = dimensions.layout_max_height;
        self.layout_target_aspect_ratio = dimensions.layout_target_aspect_ratio;
        self
    }

    /// Sets the layout mode.
    pub fn with_layout_mode(mut self, mode: LayoutMode) -> Self {
        self.layout_mode = mode;
        self
    }

    /// Sets the layout positioning.
    pub fn with_layout_position(mut self, position: LayoutPositioning) -> Self {
        self.layout_positioning = position;
        self
    }

    /// Sets both x and y position.
    pub fn with_position(mut self, position: LayoutPositioningBasis) -> Self {
        self.layout_position = position;
        self
    }

    pub fn with_position_cartesian(mut self, x: f32, y: f32) -> Self {
        self.layout_position = LayoutPositioningBasis::Cartesian(CGPoint::new(x, y));
        self
    }

    pub fn with_position_inset(mut self, inset: EdgeInsets) -> Self {
        self.layout_position = LayoutPositioningBasis::Inset(inset);
        self
    }

    /// Sets both width and height.
    pub fn with_size(mut self, width: f32, height: f32) -> Self {
        self.layout_target_width = Some(width);
        self.layout_target_height = Some(height);
        self
    }

    /// Sets the layout direction.
    pub fn with_layout_direction(mut self, direction: Axis) -> Self {
        self.layout_direction = direction;
        self
    }

    /// Sets the layout wrap behavior.
    pub fn with_layout_wrap(mut self, wrap: LayoutWrap) -> Self {
        self.layout_wrap = Some(wrap);
        self
    }

    /// Sets the main axis alignment.
    pub fn with_layout_main_axis_alignment(mut self, alignment: MainAxisAlignment) -> Self {
        self.layout_main_axis_alignment = Some(alignment);
        self
    }

    /// Sets the cross axis alignment.
    pub fn with_layout_cross_axis_alignment(mut self, alignment: CrossAxisAlignment) -> Self {
        self.layout_cross_axis_alignment = Some(alignment);
        self
    }

    /// Sets the layout padding.
    pub fn with_padding(mut self, padding: EdgeInsets) -> Self {
        self.layout_padding = Some(padding);
        self
    }

    /// Sets the layout gap.
    pub fn with_gap(mut self, gap: LayoutGap) -> Self {
        self.layout_gap = Some(gap);
        self
    }

    /// Sets the layout grow factor.
    pub fn with_layout_grow(mut self, grow: f32) -> Self {
        self.layout_grow = Some(grow);
        self
    }
}

impl Default for UniformNodeLayout {
    fn default() -> Self {
        Self::new()
    }
}

/// Layout properties that define how a **container** arranges its **children**.
///
/// This struct represents the "parent-side" layout behavior — how a container organizes
/// and positions its child elements. It is conceptually separate from how a node behaves
/// **as a child** within its parent's layout (see [`LayoutChildStyle`]).
///
/// ## Purpose
///
/// `LayoutContainerStyle` defines the layout algorithm and spacing rules that a container
/// applies to its children. This includes:
/// - The layout mode (flex, grid, flow, etc.)
/// - Flexbox properties (direction, wrap, alignment)
/// - Spacing between children (gap, padding)
///
/// ## When to Use
///
/// Apply this style to nodes that **contain** other nodes and need to control their layout.
/// Examples:
/// - A flex container arranging buttons horizontally
/// - A vertical list of cards with gaps
/// - A grid of images with padding
///
/// ## Relationship with LayoutChildStyle
///
/// - **`LayoutContainerStyle`**: "How should I lay out my children?"
/// - **[`LayoutChildStyle`]**: "How should I behave as a child in my parent's layout?"
///
/// A single node can have both:
/// - As a **parent**: Uses its `LayoutContainerStyle` to arrange children
/// - As a **child**: Uses its `LayoutChildStyle` to participate in parent's layout
///
/// ## Example
///
/// ```rust,ignore
/// // A horizontal flex container with gaps
/// LayoutContainerStyle {
///     layout_mode: LayoutMode::Flex,
///     layout_direction: Axis::Horizontal,
///     layout_wrap: Some(LayoutWrap::Wrap),
///     layout_main_axis_alignment: Some(MainAxisAlignment::Center),
///     layout_cross_axis_alignment: Some(CrossAxisAlignment::Start),
///     layout_padding: Some(EdgeInsets::all(16.0)),
///     layout_gap: Some(LayoutGap::all(8.0)),
/// }
/// ```
#[derive(Debug, Clone)]
pub struct LayoutContainerStyle {
    /// The layout algorithm to use for arranging children.
    ///
    /// - `LayoutMode::Flex`: Children are arranged using flexbox rules
    /// - `LayoutMode::Normal`: Children use default positioning (no layout engine)
    pub layout_mode: LayoutMode,

    /// The primary axis direction for flex layout (horizontal or vertical).
    ///
    /// - `Axis::Horizontal`: Children flow left-to-right (or right-to-left in RTL)
    /// - `Axis::Vertical`: Children flow top-to-bottom
    ///
    /// Only applies when `layout_mode` is `Flex`.
    pub layout_direction: Axis,

    /// Whether flex children should wrap to a new line when they exceed the container width/height.
    ///
    /// - `Some(LayoutWrap::Wrap)`: Children wrap to next line/column
    /// - `Some(LayoutWrap::NoWrap)`: All children stay on same line (may overflow)
    /// - `None`: Uses default (NoWrap)
    ///
    /// Only applies when `layout_mode` is `Flex`.
    pub layout_wrap: Option<LayoutWrap>,

    /// How children should be aligned along the **main axis** (primary direction).
    ///
    /// Examples:
    /// - `Start`: Pack children at the start
    /// - `Center`: Center children along the main axis
    /// - `SpaceBetween`: Distribute children with space between them
    ///
    /// Only applies when `layout_mode` is `Flex`.
    pub layout_main_axis_alignment: Option<MainAxisAlignment>,

    /// How children should be aligned along the **cross axis** (perpendicular direction).
    ///
    /// Examples:
    /// - `Start`: Align children at the start of cross axis
    /// - `Center`: Center children along the cross axis
    /// - `Stretch`: Stretch children to fill cross axis
    ///
    /// Only applies when `layout_mode` is `Flex`.
    pub layout_cross_axis_alignment: Option<CrossAxisAlignment>,

    /// Internal spacing (padding) between the container's edges and its children.
    ///
    /// Padding creates space inside the container, pushing children away from the edges.
    /// Uses CSS-style edge insets (top, right, bottom, left).
    ///
    /// Example: `EdgeInsets::all(16.0)` adds 16px padding on all sides.
    pub layout_padding: Option<EdgeInsets>,

    /// Spacing between children (gap between items).
    ///
    /// - `main_axis_gap`: Space between children along the primary direction
    /// - `cross_axis_gap`: Space between rows/columns (when wrapping)
    ///
    /// Unlike margin (which is per-child), gap is a container-level property that
    /// uniformly spaces all children.
    pub layout_gap: Option<LayoutGap>,
}

impl Default for LayoutContainerStyle {
    fn default() -> Self {
        Self {
            layout_mode: LayoutMode::Normal,
            layout_direction: Axis::Horizontal,
            layout_wrap: None,
            layout_main_axis_alignment: None,
            layout_cross_axis_alignment: None,
            layout_padding: None,
            layout_gap: None,
        }
    }
}

/// Layout properties that define how a **child** behaves within its **parent's layout**.
///
/// This struct represents the "child-side" layout behavior — how a node participates
/// and responds to its parent's layout algorithm. It is conceptually separate from
/// how a node arranges its own children (see [`LayoutContainerStyle`]).
///
/// ## Purpose
///
/// `LayoutChildStyle` defines how a child node should behave when placed inside a
/// layout container. This includes:
/// - Growth behavior (flex-grow)
/// - Positioning mode (absolute, relative, constraint-based)
/// - Constraint anchors for advanced positioning
///
/// ## When to Use
///
/// Apply this style to nodes that **are children** of a layout container and need to
/// control their participation in that layout. Examples:
/// - A button that should grow to fill available space
/// - A sidebar with fixed width while content area grows
/// - A child positioned absolutely within a flex container
///
/// ## Relationship with LayoutContainerStyle
///
/// - **[`LayoutContainerStyle`]**: "How should I lay out my children?"
/// - **`LayoutChildStyle`**: "How should I behave as a child in my parent's layout?"
///
/// A single node can have both:
/// - As a **parent**: Uses its [`LayoutContainerStyle`] to arrange children
/// - As a **child**: Uses its `LayoutChildStyle` to participate in parent's layout
///
/// ## Example
///
/// ```rust,ignore
/// // A child that grows to fill available space
/// LayoutChildStyle {
///     layout_grow: 1.0,
///     layout_position: LayoutPositioning::Relative,
///     layout_constraints: LayoutConstraints::default(),
/// }
/// ```
///
/// ## Design Note
///
/// This explicit separation (container vs child styles) aligns with CSS's model where:
/// - Container properties (`display: flex`, `flex-direction`, `gap`) affect children
/// - Child properties (`flex-grow`, `position`, `align-self`) affect the child itself
#[derive(Debug, Clone)]
pub struct LayoutChildStyle {
    /// The flex growth factor — how much this child should grow relative to siblings.
    ///
    /// - `0.0` (default): Child doesn't grow beyond its initial size
    /// - `1.0`: Child grows proportionally with other growing children
    /// - `2.0`: Child grows twice as much as children with `1.0`
    ///
    /// Only applies when parent's `layout_mode` is `Flex` and there is available space.
    ///
    /// ## Example
    ///
    /// In a horizontal flex container with 3 children:
    /// - Child A: `layout_grow: 0.0` → stays at minimum size
    /// - Child B: `layout_grow: 1.0` → gets 1/3 of extra space
    /// - Child C: `layout_grow: 2.0` → gets 2/3 of extra space
    pub layout_grow: f32,

    /// How this child is positioned within its parent's coordinate space.
    ///
    /// - `Absolute`: Positioned at explicit coordinates, removed from layout flow
    /// - `Relative`: Positioned by layout engine, with optional offset adjustments
    ///
    /// This is analogous to CSS's `position` property.
    pub layout_positioning: LayoutPositioning,
    /*
    /// Constraint-based positioning anchors (left, right, top, bottom).
    ///
    /// Defines how this child is anchored to its parent's edges. Used for:
    /// - Auto-sizing: Setting opposite constraints (e.g., `left + right`) makes width auto-computed
    /// - Advanced positioning: Centering, edge alignment, or custom constraint layouts
    ///
    /// Similar to iOS AutoLayout or Android ConstraintLayout.
    ///
    /// ## Example
    ///
    /// ```rust,ignore
    /// // Center child horizontally, anchor to top with 20px offset
    /// LayoutConstraints {
    ///     horizontal: LayoutConstraintAnchor::Center,
    ///     vertical: LayoutConstraintAnchor::Start(20.0),
    /// }
    /// ```
    pub layout_constraints: LayoutConstraints,
     */
}

#[derive(Debug, Clone)]
pub enum LayoutPositioningBasis {
    /// Cartesian position mode is the default mode.
    /// In this mode, the position is specified using x and y coordinates.
    Cartesian(CGPoint),
    /// Inset position mode is used when the position is specified using left, right, top, and bottom insets.
    Inset(EdgeInsets),
    /// Anchored position mode is used when the position is specified using left, right, top, and bottom insets.
    /// In this mode, the position is specified using left, right, top, and bottom insets.
    #[deprecated(note = "will be implemented later")]
    Anchored,
}

impl LayoutPositioningBasis {
    pub fn zero() -> Self {
        Self::Cartesian(CGPoint::zero())
    }

    pub fn x(&self) -> Option<f32> {
        match self {
            Self::Cartesian(point) => Some(point.x),
            Self::Inset(inset) => Some(inset.left),
            Self::Anchored => unreachable!("Anchored positioning is not supported"),
        }
    }

    pub fn y(&self) -> Option<f32> {
        match self {
            Self::Cartesian(point) => Some(point.y),
            Self::Inset(inset) => Some(inset.top),
            Self::Anchored => unreachable!("Anchored positioning is not supported"),
        }
    }
}

impl From<CGPoint> for LayoutPositioningBasis {
    fn from(point: CGPoint) -> Self {
        Self::Cartesian(point)
    }
}

impl Default for LayoutPositioningBasis {
    fn default() -> Self {
        Self::zero()
    }
}

#[derive(Debug, Clone)]
pub struct LayoutDimensionStyle {
    pub layout_target_width: Option<f32>,
    pub layout_target_height: Option<f32>,
    pub layout_min_width: Option<f32>,
    pub layout_max_width: Option<f32>,
    pub layout_min_height: Option<f32>,
    pub layout_max_height: Option<f32>,
    pub layout_target_aspect_ratio: Option<(f32, f32)>,
}

impl Default for LayoutDimensionStyle {
    fn default() -> Self {
        Self {
            layout_target_width: None,
            layout_target_height: None,
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        }
    }
}

#[derive(Debug, Clone)]
pub enum Node {
    InitialContainer(InitialContainerNodeRec),
    Container(ContainerNodeRec),
    Error(ErrorNodeRec),
    Group(GroupNodeRec),
    Rectangle(RectangleNodeRec),
    Ellipse(EllipseNodeRec),
    Polygon(PolygonNodeRec),
    RegularPolygon(RegularPolygonNodeRec),
    RegularStarPolygon(RegularStarPolygonNodeRec),
    Line(LineNodeRec),
    TextSpan(TextSpanNodeRec),
    Path(PathNodeRec),
    Vector(VectorNodeRec),
    BooleanOperation(BooleanPathOperationNodeRec),
    Image(ImageNodeRec),
}

// node trait
pub trait NodeTrait {
    fn active(&self) -> bool;
}

impl NodeTrait for Node {
    fn active(&self) -> bool {
        match self {
            Node::Error(n) => n.active,
            Node::Group(n) => n.active,
            Node::Container(n) => n.active,
            Node::InitialContainer(n) => n.active,
            Node::Rectangle(n) => n.active,
            Node::Ellipse(n) => n.active,
            Node::Polygon(n) => n.active,
            Node::RegularPolygon(n) => n.active,
            Node::RegularStarPolygon(n) => n.active,
            Node::Line(n) => n.active,
            Node::TextSpan(n) => n.active,
            Node::Path(n) => n.active,
            Node::Vector(n) => n.active,
            Node::BooleanOperation(n) => n.active,
            Node::Image(n) => n.active,
        }
    }
}

impl Node {
    pub fn mask(&self) -> Option<LayerMaskType> {
        match self {
            Node::Group(n) => n.mask,
            Node::Container(n) => n.mask,
            Node::InitialContainer(_) => None,
            Node::Rectangle(n) => n.mask,
            Node::Ellipse(n) => n.mask,
            Node::Polygon(n) => n.mask,
            Node::RegularPolygon(n) => n.mask,
            Node::RegularStarPolygon(n) => n.mask,
            Node::Line(n) => n.mask,
            Node::TextSpan(n) => n.mask,
            Node::Path(n) => n.mask,
            Node::Vector(n) => n.mask,
            Node::BooleanOperation(n) => n.mask,
            Node::Image(n) => n.mask,
            Node::Error(_) => None,
        }
    }
}

pub trait NodeFillsMixin {
    fn set_fill(&mut self, fill: Paint);
    fn set_fills(&mut self, fills: Paints);
}

pub trait NodeStrokesMixin {
    fn set_stroke(&mut self, stroke: Paint);
    fn set_strokes(&mut self, strokes: Paints);
}

pub trait NodeTransformMixin {
    fn x(&self) -> f32;
    fn y(&self) -> f32;
}

pub trait NodeLayoutChildMixin {
    fn layout_child_style(&self) -> LayoutChildStyle;
}

pub trait NodeGeometryMixin {
    /// if there is any valud stroke that should be taken into account for rendering, return true.
    /// stroke_width > 0.0 and at least one stroke with opacity > 0.0.
    fn has_stroke_geometry(&self) -> bool;

    fn render_bounds_stroke_width(&self) -> f32;

    /// Returns the rectangular stroke width if this node supports per-side strokes.
    ///
    /// For nodes that support per-side stroke widths (Rectangle, Container), this returns
    /// `Some(RectangularStrokeWidth)` if the stroke is rectangular (non-uniform sides).
    /// For uniform strokes or nodes that don't support per-side widths, returns `None`.
    ///
    /// This is used by the painter to determine whether to render a per-side stroke
    /// or fall back to uniform stroke rendering.
    fn rectangular_stroke_width(&self) -> Option<RectangularStrokeWidth> {
        None // Default implementation for nodes that don't support per-side strokes
    }
}

pub trait NodeRectMixin {
    fn rect(&self) -> Rectangle;
}

pub trait NodeShapeMixin {
    fn to_shape(&self) -> Shape;
    fn to_path(&self) -> skia_safe::Path;
    fn to_vector_network(&self) -> VectorNetwork;
}

#[derive(Debug, Clone)]
pub enum LeafNode {
    Error(ErrorNodeRec),
    Rectangle(RectangleNodeRec),
    Ellipse(EllipseNodeRec),
    Polygon(PolygonNodeRec),
    RegularPolygon(RegularPolygonNodeRec),
    RegularStarPolygon(RegularStarPolygonNodeRec),
    Line(LineNodeRec),
    TextSpan(TextSpanNodeRec),
    SVGPath(PathNodeRec),
    Vector(VectorNodeRec),
    Image(ImageNodeRec),
}

impl NodeTrait for LeafNode {
    fn active(&self) -> bool {
        match self {
            LeafNode::Error(n) => n.active,
            LeafNode::Rectangle(n) => n.active,
            LeafNode::Ellipse(n) => n.active,
            LeafNode::Polygon(n) => n.active,
            LeafNode::RegularPolygon(n) => n.active,
            LeafNode::RegularStarPolygon(n) => n.active,
            LeafNode::Line(n) => n.active,
            LeafNode::TextSpan(n) => n.active,
            LeafNode::SVGPath(n) => n.active,
            LeafNode::Vector(n) => n.active,
            LeafNode::Image(n) => n.active,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ErrorNodeRec {
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub error: String,
    pub opacity: f32,
}

impl NodeTransformMixin for ErrorNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl ErrorNodeRec {
    pub fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GroupNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,

    pub transform: Option<AffineTransform>,
}

#[derive(Debug, Clone)]
pub struct ContainerNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,

    pub rotation: f32,

    /// positioning
    pub position: LayoutPositioningBasis,

    /// layout style for the container.
    pub layout_container: LayoutContainerStyle,

    /// Defines the width, height and its constraints
    pub layout_dimensions: LayoutDimensionStyle,

    /// Layout style for this node when it is a child of a layout.
    pub layout_child: Option<LayoutChildStyle>,

    pub corner_radius: RectangularCornerRadius,
    pub corner_smoothing: CornerSmoothing,
    pub fills: Paints,
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: StrokeWidth,
    pub effects: LayerEffects,
    /// Content-only clipping switch.
    ///
    /// When `true`, a clip region equal to this container's own rounded-rect shape is pushed
    /// **before painting descendants**, constraining all child rendering. The container's **own**
    /// stroke/border and outer effects are **not clipped** by this flag and are painted after
    /// the clip is popped.
    ///
    /// - Clips: children/descendants.
    /// - Does **not** clip: this node’s stroke/border (including outside-aligned strokes),
    ///   outlines, drop shadows. (Inner shadows remain bounded to the shape by definition.)
    ///
    /// This flag is intentionally equivalent to an **overflow/content** clip.
    /// If a future “shape clip (self + children)” is added, it will be modeled as a separate attribute.
    /// TODO: rename to clips_content
    pub clip: ContainerClipFlag,
}

impl ContainerNodeRec {
    /// Returns the effective layout style combining all layout-related fields.
    pub fn layout(&self) -> UniformNodeLayout {
        UniformNodeLayout::new()
            .merge_from_container_style(self.layout_container.clone())
            .merge_from_child_style(self.layout_child.clone())
            .merge_from_dimensions(self.layout_dimensions.clone())
            .with_position(self.position.clone())
    }

    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.layout_dimensions.layout_target_width.unwrap_or(0.0),
            height: self.layout_dimensions.layout_target_height.unwrap_or(0.0),
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeFillsMixin for ContainerNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeGeometryMixin for ContainerNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width.max()
        } else {
            0.0
        }
    }

    fn rectangular_stroke_width(&self) -> Option<RectangularStrokeWidth> {
        match &self.stroke_width {
            StrokeWidth::Rectangular(rect_stroke) => Some(rect_stroke.clone()),
            _ => None,
        }
    }
}

/// Initial Container Block - Viewport-filling flex container
///
/// Similar to `<html>` in DOM. Fills viewport and positions direct children
/// using flex layout. Has no visual properties - purely structural.
///
/// Direct children are positioned by layout engine (their transforms ignored).
/// Deeper descendants use schema geometry normally.
#[derive(Debug, Clone)]
pub struct InitialContainerNodeRec {
    pub active: bool,

    // Flex layout properties for children
    pub layout_mode: LayoutMode,
    pub layout_direction: Axis,
    pub layout_wrap: LayoutWrap,
    pub layout_main_axis_alignment: MainAxisAlignment,
    pub layout_cross_axis_alignment: CrossAxisAlignment,
    pub padding: EdgeInsets,
    pub layout_gap: LayoutGap,
}

#[derive(Debug, Clone)]
pub struct RectangleNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,

    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub corner_smoothing: CornerSmoothing,
    pub fills: Paints,
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: StrokeWidth,
    pub effects: LayerEffects,

    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for RectangleNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for RectangleNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeRectMixin for RectangleNodeRec {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

impl NodeGeometryMixin for RectangleNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width.max()
        } else {
            0.0
        }
    }

    fn rectangular_stroke_width(&self) -> Option<RectangularStrokeWidth> {
        match &self.stroke_width {
            StrokeWidth::Rectangular(rect_stroke) => Some(rect_stroke.clone()),
            _ => None,
        }
    }
}

impl NodeShapeMixin for RectangleNodeRec {
    fn to_shape(&self) -> Shape {
        if self.corner_radius.is_zero() {
            return Shape::Rect(RectShape {
                width: self.size.width,
                height: self.size.height,
            });
        }
        if self.corner_smoothing.is_zero() {
            return Shape::RRect(RRectShape {
                width: self.size.width,
                height: self.size.height,
                corner_radius: self.corner_radius,
            });
        }
        return Shape::OrthogonalSmoothRRect(OrthogonalSmoothRRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
            corner_smoothing: self.corner_smoothing,
        });
    }

    fn to_path(&self) -> skia_safe::Path {
        (&self.to_shape()).into()
    }

    fn to_vector_network(&self) -> VectorNetwork {
        (&self.to_shape()).into()
    }
}

#[derive(Debug, Clone)]
pub struct LineNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    pub transform: AffineTransform,
    pub size: Size, // height is always 0 (ignored)
    pub strokes: Paints,
    pub stroke_width: f32,
    pub stroke_cap: StrokeCap,
    pub stroke_miter_limit: StrokeMiterLimit,
    pub stroke_dash_array: Option<StrokeDashArray>,
    pub _data_stroke_align: StrokeAlign,

    /// Marker shape at the start endpoint of the line.
    pub marker_start_shape: StrokeMarkerPreset,
    /// Marker shape at the end endpoint of the line.
    pub marker_end_shape: StrokeMarkerPreset,

    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl LineNodeRec {
    /// line's stoke align is no-op, it's always center. this value is ignored, but will be affected when line transforms to a path.
    pub fn get_stroke_align(&self) -> StrokeAlign {
        StrokeAlign::Center
    }
}

/// A node representing an image element, similar to HTML `<img>`.
///
/// Unlike other shape nodes, ImageNodeRec intentionally supports only a single image fill
/// to align with web development patterns where `<img>` elements have a single image source,
/// rather than using images as backgrounds for `<div>` elements (which would support multiple fills).
///
/// This design choice reflects the common distinction in web development:
/// - `<img>` = single image content (what this node represents)
/// - `<div style="background-image: ...">` = multiple background layers (use other shape nodes)
#[derive(Debug, Clone)]
pub struct ImageNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub effects: LayerEffects,
    pub mask: Option<LayerMaskType>,

    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub corner_smoothing: CornerSmoothing,
    /// Single image fill - intentionally not supporting multiple fills to align with
    /// web development patterns where `<img>` elements have one image source.
    pub fill: ImagePaint,
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: StrokeWidth,
    pub image: ResourceRef,

    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeStrokesMixin for ImageNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = Paints::new([stroke]);
    }

    fn set_strokes(&mut self, strokes: Paints) {
        self.strokes = strokes;
    }
}

impl ImageNodeRec {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeTransformMixin for ImageNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeRectMixin for ImageNodeRec {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

impl NodeGeometryMixin for ImageNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width.max()
        } else {
            0.0
        }
    }
}

/// A node representing an ellipse shape.
///
/// Like RectangleNode, uses a top-left based coordinate system (x,y,width,height).
/// The ellipse is drawn within the bounding box defined by these coordinates.
///
/// ## Arc & Ring support
///
/// **3RD PARTY IMPLEMENTATIONS:**
/// - https://konvajs.org/api/Konva.Arc.html
/// - https://www.figma.com/plugin-docs/api/ArcData/
///
/// For details on arc mathematics, see: <https://mathworld.wolfram.com/Arc.html> (implementation varies)
#[derive(Debug, Clone)]
pub struct EllipseNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub effects: LayerEffects,
    pub mask: Option<LayerMaskType>,

    pub transform: AffineTransform,
    pub size: Size,
    pub fills: Paints,
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: SingularStrokeWidth,
    /// inner radius - 0 ~ 1
    pub inner_radius: Option<f32>,

    /// start angle in degrees
    /// default is 0.0
    pub start_angle: f32,

    /// sweep angle in degrees (end_angle = start_angle + angle)
    pub angle: Option<f32>,

    pub corner_radius: Option<f32>,

    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for EllipseNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeShapeMixin for EllipseNodeRec {
    fn to_shape(&self) -> Shape {
        let w = self.size.width;
        let h = self.size.height;
        let angle = self.angle.unwrap_or(360.0);
        let inner_ratio = self.inner_radius.unwrap_or(0.0);

        // Check if arc/ring data needs to be handled.
        // Only treat as ring or arc when the inner radius is greater than zero
        // or when the sweep angle is less than a full circle.
        if inner_ratio > 0.0 || angle != 360.0 {
            if inner_ratio > 0.0 && angle == 360.0 {
                return Shape::EllipticalRing(EllipticalRingShape {
                    width: w,
                    height: h,
                    inner_radius_ratio: inner_ratio,
                });
            } else {
                return Shape::EllipticalRingSector(EllipticalRingSectorShape {
                    width: w,
                    height: h,
                    inner_radius_ratio: inner_ratio,
                    start_angle: self.start_angle,
                    angle: angle,
                    corner_radius: self.corner_radius.unwrap_or(0.0),
                });
            }
        }

        Shape::Ellipse(EllipseShape {
            width: w,
            height: h,
        })
    }

    fn to_path(&self) -> skia_safe::Path {
        (&self.to_shape()).into()
    }

    fn to_vector_network(&self) -> VectorNetwork {
        (&self.to_shape()).into()
    }
}

impl NodeTransformMixin for EllipseNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeRectMixin for EllipseNodeRec {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

impl NodeGeometryMixin for EllipseNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        self.stroke_width.value_or_zero()
    }
}

#[derive(Debug, Clone)]
pub struct BooleanPathOperationNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    pub transform: Option<AffineTransform>,
    pub op: BooleanPathOperation,
    pub corner_radius: Option<f32>,
    pub fills: Paints,
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: SingularStrokeWidth,
}

impl NodeFillsMixin for BooleanPathOperationNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for BooleanPathOperationNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = Paints::new([stroke]);
    }

    fn set_strokes(&mut self, strokes: Paints) {
        self.strokes = strokes;
    }
}

///
/// Vector Network Node.
///
#[derive(Debug, Clone)]
pub struct VectorNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    pub transform: AffineTransform,
    pub network: VectorNetwork,
    /// The corner radius of the vector node.
    pub corner_radius: f32,
    /// The fill paints of the vector node.
    pub fills: Paints,
    pub strokes: Paints,
    pub stroke_width: f32,
    pub stroke_width_profile: Option<cg::varwidth::VarWidthProfile>,
    /// Requested stroke alignment. For open paths, `Inside` and `Outside`
    /// alignments are treated as `Center`.
    pub stroke_align: StrokeAlign,
    pub stroke_cap: StrokeCap,
    pub stroke_join: StrokeJoin,
    pub stroke_miter_limit: StrokeMiterLimit,
    pub stroke_dash_array: Option<StrokeDashArray>,

    /// Marker shape at the start endpoint (first vertex).
    pub marker_start_shape: StrokeMarkerPreset,
    /// Marker shape at the end endpoint (last vertex).
    pub marker_end_shape: StrokeMarkerPreset,

    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for VectorNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for VectorNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = Paints::new([stroke]);
    }

    fn set_strokes(&mut self, strokes: Paints) {
        self.strokes = strokes;
    }
}

impl VectorNodeRec {
    /// Build a [`skia_safe::Path`] representing this vector node,
    /// applying the node's `corner_radius` when greater than zero.
    pub fn to_path(&self) -> skia_safe::Path {
        let path: skia_safe::Path = self.network.clone().into();
        if self.corner_radius <= 0.0 {
            path
        } else {
            build_corner_radius_path(&path, self.corner_radius)
        }
    }

    /// Returns the effective stroke alignment for rendering. Open paths do not
    /// support `Inside` or `Outside` stroke alignments, so those cases fall back
    /// to `Center` to ensure the stroke remains visible.
    pub fn get_stroke_align(&self) -> StrokeAlign {
        let path: skia_safe::Path = self.network.clone().into();
        if path.is_empty() || !path.is_last_contour_closed() {
            StrokeAlign::Center
        } else {
            self.stroke_align
        }
    }
}

// /// Foreign <svg> node.
// /// this renders given svg string as-is, without any further controls over the data.
// /// similar to <img> with svg as src.
// #[derive(Debug, Clone)]
// pub struct SVGImageNodeRec {
//     pub active: bool,
//     pub opacity: f32,
//     pub blend_mode: LayerBlendMode,
//     pub transform: AffineTransform,
//     pub svg: String,
//     /// Layout style for this node when it is a child of a layout container.
//     pub layout_child: Option<LayoutChildStyle>,
// }

///
/// SVG Path compatible path node.
///
#[derive(Debug, Clone)]
pub struct PathNodeRec {
    pub active: bool,

    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    pub transform: AffineTransform,
    pub fills: Paints,
    pub data: String,
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: SingularStrokeWidth,
    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for PathNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for PathNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = Paints::new([stroke]);
    }

    fn set_strokes(&mut self, strokes: Paints) {
        self.strokes = strokes;
    }
}

impl NodeTransformMixin for PathNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeRectMixin for PathNodeRec {
    /// Compute bounding rectangle from SVG path data
    ///
    /// **Performance Note**: This is NOT cached and involves parsing the SVG path string
    /// and computing tight bounds via Skia. Avoid calling this in tight loops.
    /// The result should be cached by the caller if needed repeatedly.
    fn rect(&self) -> Rectangle {
        if let Some(path) = skia_safe::path::Path::from_svg(&self.data) {
            let bounds = path.compute_tight_bounds();
            Rectangle {
                x: bounds.left(),
                y: bounds.top(),
                width: bounds.width(),
                height: bounds.height(),
            }
        } else {
            Rectangle {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            }
        }
    }
}

/// A polygon shape defined by a list of absolute 2D points, following the SVG `<polygon>` model.
///
/// ## Characteristics
/// - Always **closed**: The shape is implicitly closed by connecting the last point back to the first.
/// - For **open shapes**, use a different type such as [`PathNode`] or a potential `PolylineNode`.
///
/// ## Reference
/// Mirrors the behavior of the SVG `<polygon>` element:  
/// https://developer.mozilla.org/en-US/docs/Web/SVG/Element/polygon
#[derive(Debug, Clone)]
pub struct PolygonNodeRec {
    pub active: bool,

    /// Opacity applied to the polygon shape (`0.0` - transparent, `1.0` - opaque).
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    /// 2D affine transform matrix applied to the shape.
    pub transform: AffineTransform,

    /// The list of points defining the polygon vertices.
    pub points: Vec<CGPoint>,

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// The paint used to fill the interior of the polygon.
    pub fills: Paints,

    /// The stroke paint used to outline the polygon.
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: SingularStrokeWidth,
    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for PolygonNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for PolygonNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = Paints::new([stroke]);
    }

    fn set_strokes(&mut self, strokes: Paints) {
        self.strokes = strokes;
    }
}

impl NodeRectMixin for PolygonNodeRec {
    fn rect(&self) -> Rectangle {
        polygon_bounds(&self.points)
    }
}

impl NodeGeometryMixin for PolygonNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        self.stroke_width.value_or_zero()
    }
}

impl PolygonNodeRec {
    pub fn to_own_shape(&self) -> SimplePolygonShape {
        SimplePolygonShape {
            points: self.points.clone(),
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeTransformMixin for PolygonNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeShapeMixin for PolygonNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::SimplePolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        let shape = self.to_own_shape();
        build_simple_polygon_path(&shape)
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_simple_polygon_vector_network(&self.to_own_shape())
    }
}

/// A node representing a regular polygon (triangle, square, pentagon, etc.)
/// that fits inside a bounding box defined by `size`, optionally transformed.
///
/// The polygon is defined by `point_count` (number of sides), and is centered
/// within the box, with even and odd point counts having slightly different
/// initial orientations:
/// - Odd `point_count` (e.g. triangle) aligns the top point to the vertical center top.
/// - Even `point_count` aligns the top edge flat.
///
/// The actual rendering is derived, not stored. Rotation should be applied via `transform`.
///
/// For details on regular polygon mathematics, see: <https://mathworld.wolfram.com/RegularPolygon.html> (implementation varies)
#[derive(Debug, Clone)]
pub struct RegularPolygonNodeRec {
    pub active: bool,
    /// Overall node opacity (0.0–1.0)
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    /// Affine transform applied to this node
    pub transform: AffineTransform,

    /// Bounding box size the polygon is fit into
    pub size: Size,

    /// Number of equally spaced points (>= 3)
    pub point_count: usize,

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// Fill paint (solid or gradient)
    pub fills: Paints,

    /// The stroke paint used to outline the polygon.
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: SingularStrokeWidth,
    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for RegularPolygonNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for RegularPolygonNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeRectMixin for RegularPolygonNodeRec {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

impl NodeGeometryMixin for RegularPolygonNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        self.stroke_width.value_or_zero()
    }
}

impl RegularPolygonNodeRec {
    pub fn to_own_shape(&self) -> RegularPolygonShape {
        RegularPolygonShape {
            width: self.size.width,
            height: self.size.height,
            point_count: self.point_count,
            corner_radius: self.corner_radius,
        }
    }

    pub fn to_points(&self) -> Vec<CGPoint> {
        build_regular_polygon_points(&self.to_own_shape())
    }
}

impl NodeShapeMixin for RegularPolygonNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::RegularPolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_simple_polygon_path(&SimplePolygonShape {
            points: self.to_points(),
            corner_radius: self.corner_radius,
        })
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_regular_polygon_vector_network(&self.to_own_shape())
    }
}

/// A regular star polygon node rendered within a bounding box.
///
/// This node represents a geometric star shape composed of alternating outer and inner vertices evenly spaced around a center,
/// forming a symmetric star with `point_count` spikes. Each spike is constructed by alternating between an outer point
/// (determined by the bounding box) and an inner point (scaled by `inner_radius`).
///
/// For details on star polygon mathematics, see: <https://mathworld.wolfram.com/StarPolygon.html>
#[derive(Debug, Clone)]
pub struct RegularStarPolygonNodeRec {
    pub active: bool,

    /// Overall node opacity (0.0–1.0)
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,

    /// Affine transform applied to this node
    pub transform: AffineTransform,

    /// Bounding box size the polygon is fit into
    pub size: Size,

    /// Number of equally spaced points (>= 3)
    pub point_count: usize,

    /// The `inner_radius` defines the radius of the inner vertices of the star, relative to the center.
    ///
    /// It controls the sharpness of the star's angles:
    /// - A smaller value (closer to 0) results in sharper, spikier points.
    /// - A larger value (closer to or greater than the outer radius) makes the shape closer to a regular polygon with 2 × point_count edges.
    ///
    /// The outer radius is defined by the bounding box (`size`), while the `inner_radius` places the inner points on a second concentric circle.
    /// Unlike `corner_radius`, which affects the rounding of outer corners, `inner_radius` controls the depth of the inner angles between the points.
    pub inner_radius: f32,

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// Fill paint (solid or gradient)
    pub fills: Paints,

    /// The stroke paint used to outline the polygon.
    pub strokes: Paints,
    pub stroke_style: StrokeStyle,
    pub stroke_width: SingularStrokeWidth,
    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,
}

impl NodeFillsMixin for RegularStarPolygonNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = Paints::new([fill]);
    }

    fn set_fills(&mut self, fills: Paints) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for RegularStarPolygonNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeRectMixin for RegularStarPolygonNodeRec {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

impl NodeGeometryMixin for RegularStarPolygonNodeRec {
    fn has_stroke_geometry(&self) -> bool {
        !self.stroke_width.is_none() && self.strokes.is_visible()
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        self.stroke_width.value_or_zero()
    }
}

impl NodeShapeMixin for RegularStarPolygonNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::RegularStarPolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_star_path(&self.to_own_shape())
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_star_vector_network(&self.to_own_shape())
    }
}

impl RegularStarPolygonNodeRec {
    pub fn to_points(&self) -> Vec<CGPoint> {
        build_star_points(&self.to_own_shape())
    }

    pub fn to_own_shape(&self) -> RegularStarShape {
        RegularStarShape {
            width: self.size.width,
            height: self.size.height,
            inner_radius_ratio: self.inner_radius,
            point_count: self.point_count,
            corner_radius: self.corner_radius,
        }
    }
}

/// A node representing a plain text block (non-rich).
/// For multi-style content, see `RichTextNode` (not implemented yet).
#[derive(Debug, Clone)]
pub struct TextSpanNodeRec {
    pub active: bool,

    /// Transform applied to the text container.
    pub transform: AffineTransform,

    /// Layout bounds (used for wrapping and alignment).
    pub width: Option<f32>,

    /// Layout style for this node when it is a child of a layout container.
    pub layout_child: Option<LayoutChildStyle>,

    /// Height of the text container box.
    ///
    /// This property defines the height of the "box" that contains the text paragraph.
    /// Unlike width, which affects text layout and wrapping, height does not influence
    /// the Skia text layout engine itself. Instead, it controls the positioning of the
    /// rendered text within the specified height.
    ///
    /// ## Behavior
    ///
    /// - **When `None` (auto)**: The height is effectively "auto", similar to how width
    ///   works. The text will be rendered at its natural height without any vertical
    ///   positioning adjustments.
    ///
    /// - **When `Some(height)`**: The text is positioned within a container of the
    ///   specified height. The actual text layout height (from Skia's paragraph layout)
    ///   remains unchanged, but the y-position where the text is painted is adjusted
    ///   based on the `text_align_vertical` property.
    ///
    /// ## Y-Offset Calculation
    ///
    /// When a height is specified, the y-offset for painting the text is calculated
    /// using simple math based on the alignment:
    ///
    /// ```text
    /// y_offset = match text_align_vertical {
    ///     TextAlignVertical::Top => 0.0,
    ///     TextAlignVertical::Center => (requested_height - textlayout_height) / 2.0,
    ///     TextAlignVertical::Bottom => requested_height - textlayout_height,
    /// }
    /// ```
    ///
    /// Where:
    /// - `requested_height` is the value of this `height` property
    /// - `textlayout_height` is the natural height of the text as calculated by Skia
    ///
    /// ## Valid Use Cases
    ///
    /// It is perfectly valid to request a height smaller than the post-layouted text
    /// height. This allows for text clipping or creating text that extends beyond its
    /// container bounds, similar to how image positioning works with image boxes.
    ///
    /// ## Relationship to Image Positioning
    ///
    /// This behavior is analogous to how image positioning works:
    /// - The image (actual text content) has its natural dimensions
    /// - The image box (height container) defines the positioning space
    /// - The alignment determines how the image is positioned within the box
    pub height: Option<f32>,

    /// Text content (plain UTF-8).
    pub text: String,

    /// Font & fill appearance.
    pub text_style: TextStyleRec,

    /// Horizontal alignment.
    pub text_align: TextAlign,

    /// Vertical alignment of text within its container height.
    ///
    /// This property controls how text is positioned vertically within the height
    /// defined by the `height` property. Since Skia's text layout engine only
    /// supports width-based layout, vertical alignment is handled by this library
    /// through post-layout positioning adjustments.
    ///
    /// ## How It Works
    ///
    /// 1. **Text Layout**: Skia performs the text layout based on width constraints,
    ///    producing a paragraph with a natural height (`textlayout_height`).
    ///
    /// 2. **Height Container**: If a `height` is specified, it defines the container
    ///    height (`requested_height`) within which the text should be positioned.
    ///
    /// 3. **Y-Offset Calculation**: The vertical alignment determines the y-offset
    ///    (delta) where the text is painted:
    ///
    ///    ```text
    ///    y_offset = match text_align_vertical {
    ///        TextAlignVertical::Top => 0.0,
    ///        TextAlignVertical::Center => (requested_height - textlayout_height) / 2.0,
    ///        TextAlignVertical::Bottom => requested_height - textlayout_height,
    ///    }
    ///    ```
    ///
    /// 4. **Rendering**: The text is painted at the calculated y-offset, effectively
    ///    positioning it within the specified height container.
    ///
    /// ## Interaction with Height
    ///
    /// - **When `height` is `None`**: This property has no effect, as there's no
    ///   container height to align within. Text renders at its natural position.
    ///
    /// - **When `height` is `Some(value)`**: This property determines how the text
    ///   is positioned within that height container.
    ///
    /// ## Use Cases
    ///
    /// - **Top Alignment**: Text starts at the top of the container (default behavior)
    /// - **Center Alignment**: Text is vertically centered within the container
    /// - **Bottom Alignment**: Text is positioned at the bottom of the container
    ///
    /// ## Clipping Behavior
    ///
    /// When the requested height is smaller than the natural text height, the text
    /// may be clipped. The alignment determines which part of the text remains visible:
    /// - `Top`: Bottom portion may be clipped
    /// - `Center`: Top and bottom portions may be clipped equally
    /// - `Bottom`: Top portion may be clipped
    pub text_align_vertical: TextAlignVertical,

    /// Maximum number of lines to render.
    ///
    /// - If `None`, the text will be rendered until the end of the text. Ellipsis will be applied if the text is too long.
    /// - If `Some(0)`, this is treated as "unset" (same as `None`). This handles FlatBuffers defaults where unset `uint` fields default to `0`.
    /// - Valid values start from `1` (similar to CSS `-webkit-line-clamp` where `0` means no limit and valid values start from `1`).
    pub max_lines: Option<usize>,

    /// Ellipsis text to be shown when the text is too long.
    /// If `None`, the text will be truncated with "...".
    /// to change this behaviour, set ellipsis to empty string.
    pub ellipsis: Option<String>,

    /// Fill paints stack (solid, gradient, etc.)
    pub fills: Paints,

    /// Stroke paints stack (solid, gradient, etc.)
    pub strokes: Paints,

    /// Stroke width
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    /// Overall node opacity.
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,
}

impl NodeTransformMixin for TextSpanNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

#[derive(Debug, Clone)]
#[deprecated(note = "Not implemented yet")]
pub struct TextNodeRec {
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub text: String,
    pub font_size: f32,
    pub fill: Paint,
    /// Optional stroke paint for outlining text.
    /// Currently supports only a single stroke paint.
    pub stroke: Option<Paint>,
    /// Stroke width in logical pixels. Set to `0.0` to disable.
    pub stroke_width: f32,
    /// Stroke alignment relative to the text glyph outlines.
    /// Only `Center` alignment is honored for now.
    pub stroke_align: StrokeAlign,
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub mask: Option<LayerMaskType>,
    pub effects: LayerEffects,
}

// endregion
