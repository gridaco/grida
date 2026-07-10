//! The `anchor` document model — lab subset of `model-v2/models/a.md`.
//!
//! Kinds implemented: frame, shape (rect/ellipse/line), text, group, lens.
//! Omitted for the lab (noted in the report): tray, image, embed, vector,
//! bool — none of them exercise a geometry mechanism the five above don't.
//!
//! Lab simplifications, all declared:
//! - node ids are `u32`; children are an ordered `Vec` on the parent
//!   (fractional-index ordering is not under test here);
//! - `SurfaceStyle` carries ordered fills and ordered stroke applications;
//!   corners and effects remain outside the lab subset.

use crate::math::Affine;
use std::collections::BTreeMap;

pub type NodeId = u32;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AnchorEdge {
    Start,
    Center,
    End,
}

/// Position as a relation, not a coordinate (a.md §2.1).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AxisBinding {
    Pin { anchor: AnchorEdge, offset: f32 },
    Span { start: f32, end: f32 },
}

impl Default for AxisBinding {
    fn default() -> Self {
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset: 0.0,
        }
    }
}

impl AxisBinding {
    pub fn start(offset: f32) -> Self {
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        }
    }
    pub fn end(offset: f32) -> Self {
        AxisBinding::Pin {
            anchor: AnchorEdge::End,
            offset,
        }
    }
    pub fn center(offset: f32) -> Self {
        AxisBinding::Pin {
            anchor: AnchorEdge::Center,
            offset,
        }
    }
}

/// Two values, not three (a.md §2.2). No Fill — growth via grow/self_align/Span.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SizeIntent {
    Fixed(f32),
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum Flow {
    #[default]
    InFlow,
    Absolute,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum SelfAlign {
    #[default]
    Auto,
    Start,
    Center,
    End,
    Stretch,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Header {
    pub name: Option<String>,
    pub active: bool,
    pub x: AxisBinding,
    pub y: AxisBinding,
    pub width: SizeIntent,
    pub height: SizeIntent,
    pub min_width: Option<f32>,
    pub max_width: Option<f32>,
    pub min_height: Option<f32>,
    pub max_height: Option<f32>,
    pub aspect_ratio: Option<(f32, f32)>,
    /// Degrees, clockwise, y-down. Pivot per a.md §5.
    pub rotation: f32,
    /// Native mirrors (E-A2). Pivot per kind exactly as rotation (B1):
    /// box center for boxed/measured kinds, own origin for derived kinds.
    /// Composition: innermost — local mirror first, then rotation.
    pub flip_x: bool,
    pub flip_y: bool,
    pub flow: Flow,
    pub grow: f32,
    pub self_align: SelfAlign,
    pub opacity: f32,
}

impl Header {
    pub fn new(width: SizeIntent, height: SizeIntent) -> Self {
        Header {
            name: None,
            active: true,
            x: AxisBinding::default(),
            y: AxisBinding::default(),
            width,
            height,
            min_width: None,
            max_width: None,
            min_height: None,
            max_height: None,
            aspect_ratio: None,
            rotation: 0.0,
            flip_x: false,
            flip_y: false,
            flow: Flow::default(),
            grow: 0.0,
            self_align: SelfAlign::default(),
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum LayoutMode {
    #[default]
    None,
    Flex,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum Direction {
    #[default]
    Row,
    Column,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum MainAlign {
    #[default]
    Start,
    Center,
    End,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum CrossAlign {
    #[default]
    Start,
    Center,
    End,
    Stretch,
}

/// EdgeInsets: top, right, bottom, left.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct EdgeInsets {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl EdgeInsets {
    pub fn all(v: f32) -> Self {
        EdgeInsets {
            top: v,
            right: v,
            bottom: v,
            left: v,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct LayoutBehavior {
    pub mode: LayoutMode,
    pub direction: Direction,
    pub wrap: bool,
    pub main_align: MainAlign,
    pub cross_align: CrossAlign,
    pub padding: EdgeInsets,
    pub gap_main: f32,
    pub gap_cross: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ShapeDesc {
    Rect,
    Ellipse,
    /// The box's horizontal midline; height intent must be Fixed(0) (a.md §3.2).
    Line,
}

/// Ordered, applied in sequence, post-resolution (a.md §3.3). 2D subset.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LensOp {
    Translate { x: f32, y: f32 },
    Rotate { deg: f32 },
    Scale { x: f32, y: f32 },
    Skew { x_deg: f32, y_deg: f32 },
    Matrix { m: [f32; 6] },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Payload {
    Frame {
        layout: LayoutBehavior,
        clips_content: bool,
    },
    Shape {
        desc: ShapeDesc,
    },
    Text {
        content: String,
        font_size: f32,
    },
    Group,
    Lens {
        ops: Vec<LensOp>,
    },
}

impl Payload {
    /// Derived-box kinds never store size (a.md §3 box source column).
    pub fn box_is_derived(&self) -> bool {
        matches!(self, Payload::Group | Payload::Lens { .. })
    }
    /// Whether this payload establishes a child coordinate space.
    ///
    /// Frames may additionally lay children out; shapes own free-positioned
    /// children without changing their declared box. Groups/lenses derive
    /// their boxes from children. Text remains a measured leaf.
    pub fn accepts_children(&self) -> bool {
        matches!(
            self,
            Payload::Frame { .. } | Payload::Shape { .. } | Payload::Group | Payload::Lens { .. }
        )
    }
    pub fn kind_name(&self) -> &'static str {
        match self {
            Payload::Frame { .. } => "frame",
            Payload::Shape { .. } => "shape",
            Payload::Text { .. } => "text",
            Payload::Group => "group",
            Payload::Lens { .. } => "lens",
        }
    }
}

/// A packed RGBA8 color, `0xAARRGGBB` — the numeric paint value. Browsers
/// never store a resolved color as a string (a CSS string is a parse *input*
/// and a serialize *output* only — verified across Blink/Stylo/Skia); the text
/// IR and SVG boundaries convert via `from_hex`/`to_hex`, and everything in
/// between is this fixed-size number, read straight by the drawlist with no
/// per-build parse. The wide-gamut canonical form the engines converged on
/// (f32×4 channels + a color-space tag) is the deferred upgrade — see
/// `engine/DATA-MODEL.md` (tied to the color-management day-1 gap).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Color(pub u32);

impl Color {
    pub const BLACK: Color = Color(0xFF00_0000);
    pub const TRANSPARENT: Color = Color(0x0000_0000);

    /// Packed `0xAARRGGBB`.
    pub fn argb(self) -> u32 {
        self.0
    }

    /// Parse the frozen E3/TextIr color spelling: exactly six hexadecimal
    /// digits after removing any leading `#` characters.
    pub fn from_hex(s: &str) -> Option<Color> {
        let h = s.trim_start_matches('#');
        if h.len() != 6 || !h.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let rgb = u32::from_str_radix(h, 16).ok()?;
        Some(Color(0xFF00_0000 | rgb))
    }

    /// Parse the Draft 0 `.grida.xml` color spelling: `#rgb` or `#rrggbb`,
    /// both opaque. Alpha is authored separately and folded into this RGBA8
    /// value by the XML boundary.
    pub fn from_grida_hex(s: &str) -> Option<Color> {
        let h = s.strip_prefix('#')?;
        let rgb = match h.len() {
            3 => {
                let mut expanded = String::with_capacity(6);
                for ch in h.chars() {
                    if !ch.is_ascii_hexdigit() {
                        return None;
                    }
                    expanded.push(ch);
                    expanded.push(ch);
                }
                u32::from_str_radix(&expanded, 16).ok()?
            }
            6 if h.bytes().all(|b| b.is_ascii_hexdigit()) => u32::from_str_radix(h, 16).ok()?,
            _ => return None,
        };
        Some(Color(0xFF00_0000 | rgb))
    }

    /// Serialize RGB as canonical uppercase `#RRGGBB`. Alpha is serialized as
    /// the paint/stop `opacity` property.
    pub fn to_hex(self) -> String {
        format!("#{:06X}", self.0 & 0x00FF_FFFF)
    }

    pub fn alpha(self) -> u8 {
        (self.0 >> 24) as u8
    }

    pub fn opacity(self) -> f32 {
        self.alpha() as f32 / 255.0
    }

    /// Replace alpha with the nearest RGBA8 value for a normalized opacity.
    pub fn with_opacity(self, opacity: f32) -> Color {
        let alpha = (opacity.clamp(0.0, 1.0) * 255.0).round() as u32;
        Color((alpha << 24) | (self.0 & 0x00FF_FFFF))
    }
}

/// Frozen E3/TextIr-compatible ergonomic authoring: `"#4A90D9".into()` or
/// `"4A90D9".into()`. A malformed literal falls back to opaque black. Draft 0
/// `.grida.xml` deliberately parses through [`Color::from_grida_hex`] instead.
impl From<&str> for Color {
    fn from(s: &str) -> Color {
        Color::from_hex(s).unwrap_or(Color::BLACK)
    }
}
impl From<String> for Color {
    fn from(s: String) -> Color {
        Color::from(s.as_str())
    }
}

/// Blend functions available to individual paints. `PassThrough` is a layer
/// mode and deliberately does not appear here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BlendMode {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl BlendMode {
    pub fn as_str(self) -> &'static str {
        match self {
            BlendMode::Normal => "normal",
            BlendMode::Multiply => "multiply",
            BlendMode::Screen => "screen",
            BlendMode::Overlay => "overlay",
            BlendMode::Darken => "darken",
            BlendMode::Lighten => "lighten",
            BlendMode::ColorDodge => "color-dodge",
            BlendMode::ColorBurn => "color-burn",
            BlendMode::HardLight => "hard-light",
            BlendMode::SoftLight => "soft-light",
            BlendMode::Difference => "difference",
            BlendMode::Exclusion => "exclusion",
            BlendMode::Hue => "hue",
            BlendMode::Saturation => "saturation",
            BlendMode::Color => "color",
            BlendMode::Luminosity => "luminosity",
        }
    }
}

/// Centered normalized alignment. `(-1,-1)` is top-left, `(0,0)` center,
/// `(1,1)` bottom-right. XML gradient points use UV and convert at the edge.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Alignment(pub f32, pub f32);

impl Alignment {
    pub const CENTER: Alignment = Alignment(0.0, 0.0);
    pub const CENTER_LEFT: Alignment = Alignment(-1.0, 0.0);
    pub const CENTER_RIGHT: Alignment = Alignment(1.0, 0.0);

    pub fn from_uv(u: f32, v: f32) -> Alignment {
        Alignment(u * 2.0 - 1.0, v * 2.0 - 1.0)
    }

    /// Lower textual UV coordinates without first quantizing them to `f32`.
    /// The model remains `f32`; the extra boundary precision preserves model
    /// values such as `0.1` that an intermediate `f32` UV would skip.
    pub fn from_uv_f64(u: f64, v: f64) -> Alignment {
        Alignment((u * 2.0 - 1.0) as f32, (v * 2.0 - 1.0) as f32)
    }

    /// Return a canonical UV pair only when lowering it through
    /// [`Alignment::from_uv_f64`] reproduces this model value exactly (modulo
    /// signed zero, which model equality does not distinguish).
    ///
    /// Most finite `f32` alignments, including arbitrary ordinary values and
    /// the finite extremes, are representable. The narrow interval between
    /// zero and the f64 values adjacent to UV `0.5` is not: f64 quantization
    /// itself skips those model values. The exhaustive binary search keeps
    /// this boundary honest rather than emitting source that changes state.
    pub fn try_to_uv(self) -> Option<(f64, f64)> {
        fn lower(uv: f64) -> f32 {
            (uv * 2.0 - 1.0) as f32
        }

        fn ordered(value: f64) -> u64 {
            let bits = value.to_bits();
            if bits & 0x8000_0000_0000_0000 == 0 {
                bits ^ 0x8000_0000_0000_0000
            } else {
                !bits
            }
        }

        fn from_ordered(value: u64) -> f64 {
            let bits = if value & 0x8000_0000_0000_0000 == 0 {
                !value
            } else {
                value ^ 0x8000_0000_0000_0000
            };
            f64::from_bits(bits)
        }

        fn component(value: f32) -> Option<f64> {
            if !value.is_finite() {
                return None;
            }

            let ideal = (f64::from(value) + 1.0) * 0.5;
            if lower(ideal) == value {
                return Some(ideal);
            }

            let mut lo = ordered(-f64::MAX);
            let mut hi = ordered(f64::MAX);
            while lo < hi {
                let mid = lo + (hi - lo) / 2;
                if lower(from_ordered(mid)) < value {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            let uv = from_ordered(lo);
            (lower(uv) == value).then_some(uv)
        }

        Some((component(self.0)?, component(self.1)?))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TileMode {
    #[default]
    Clamp,
    Repeated,
    Mirror,
    Decal,
}

impl TileMode {
    pub fn as_str(self) -> &'static str {
        match self {
            TileMode::Clamp => "clamp",
            TileMode::Repeated => "repeated",
            TileMode::Mirror => "mirror",
            TileMode::Decal => "decal",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoxFit {
    Contain,
    Cover,
    Fill,
    None,
}

impl BoxFit {
    pub fn as_str(self) -> &'static str {
        match self {
            BoxFit::Contain => "contain",
            BoxFit::Cover => "cover",
            BoxFit::Fill => "fill",
            BoxFit::None => "none",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SolidPaint {
    pub active: bool,
    pub color: Color,
    pub blend_mode: BlendMode,
}

impl SolidPaint {
    pub fn new(color: Color) -> SolidPaint {
        SolidPaint {
            active: true,
            color,
            blend_mode: BlendMode::Normal,
        }
    }

    /// Solid opacity is the color alpha; it is intentionally not a second
    /// floating-point field.
    pub fn opacity(&self) -> f32 {
        self.color.opacity()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GradientStop {
    pub offset: f32,
    pub color: Color,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LinearGradientPaint {
    pub active: bool,
    pub xy1: Alignment,
    pub xy2: Alignment,
    pub tile_mode: TileMode,
    pub transform: Affine,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl Default for LinearGradientPaint {
    fn default() -> Self {
        LinearGradientPaint {
            active: true,
            xy1: Alignment::CENTER_LEFT,
            xy2: Alignment::CENTER_RIGHT,
            tile_mode: TileMode::Clamp,
            transform: Affine::IDENTITY,
            stops: vec![],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RadialGradientPaint {
    pub active: bool,
    pub transform: Affine,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub tile_mode: TileMode,
}

impl Default for RadialGradientPaint {
    fn default() -> Self {
        RadialGradientPaint {
            active: true,
            transform: Affine::IDENTITY,
            stops: vec![],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            tile_mode: TileMode::Clamp,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SweepGradientPaint {
    pub active: bool,
    pub transform: Affine,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl Default for SweepGradientPaint {
    fn default() -> Self {
        SweepGradientPaint {
            active: true,
            transform: Affine::IDENTITY,
            stops: vec![],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct DiamondGradientPaint {
    pub active: bool,
    pub transform: Affine,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl Default for DiamondGradientPaint {
    fn default() -> Self {
        DiamondGradientPaint {
            active: true,
            transform: Affine::IDENTITY,
            stops: vec![],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResourceRef {
    Hash(String),
    Rid(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ImageRepeat {
    RepeatX,
    RepeatY,
    #[default]
    Repeat,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImageTile {
    pub scale: f32,
    pub repeat: ImageRepeat,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ImagePaintFit {
    Fit(BoxFit),
    Transform(Affine),
    Tile(ImageTile),
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ImageFilters {
    pub exposure: f32,
    pub contrast: f32,
    pub saturation: f32,
    pub temperature: f32,
    pub tint: f32,
    pub highlights: f32,
    pub shadows: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImagePaint {
    pub active: bool,
    pub image: ResourceRef,
    pub quarter_turns: u8,
    pub alignment: Alignment,
    pub fit: ImagePaintFit,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub filters: ImageFilters,
}

impl ImagePaint {
    pub fn from_rid(rid: impl Into<String>) -> ImagePaint {
        ImagePaint {
            active: true,
            image: ResourceRef::Rid(rid.into()),
            quarter_turns: 0,
            alignment: Alignment::CENTER,
            fit: ImagePaintFit::Fit(BoxFit::Cover),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            filters: ImageFilters::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Paint {
    Solid(SolidPaint),
    LinearGradient(LinearGradientPaint),
    RadialGradient(RadialGradientPaint),
    SweepGradient(SweepGradientPaint),
    DiamondGradient(DiamondGradientPaint),
    Image(ImagePaint),
}

impl Paint {
    pub fn active(&self) -> bool {
        match self {
            Paint::Solid(paint) => paint.active,
            Paint::LinearGradient(paint) => paint.active,
            Paint::RadialGradient(paint) => paint.active,
            Paint::SweepGradient(paint) => paint.active,
            Paint::DiamondGradient(paint) => paint.active,
            Paint::Image(paint) => paint.active,
        }
    }

    pub fn opacity(&self) -> f32 {
        match self {
            Paint::Solid(paint) => paint.opacity(),
            Paint::LinearGradient(paint) => paint.opacity,
            Paint::RadialGradient(paint) => paint.opacity,
            Paint::SweepGradient(paint) => paint.opacity,
            Paint::DiamondGradient(paint) => paint.opacity,
            Paint::Image(paint) => paint.opacity,
        }
    }

    pub fn blend_mode(&self) -> BlendMode {
        match self {
            Paint::Solid(paint) => paint.blend_mode,
            Paint::LinearGradient(paint) => paint.blend_mode,
            Paint::RadialGradient(paint) => paint.blend_mode,
            Paint::SweepGradient(paint) => paint.blend_mode,
            Paint::DiamondGradient(paint) => paint.blend_mode,
            Paint::Image(paint) => paint.blend_mode,
        }
    }

    pub fn visible(&self) -> bool {
        self.active() && self.opacity() != 0.0
    }
}

/// Ordered paint stack. Entry 0 is painted first (bottommost); each later
/// entry composites above it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Paints {
    paints: Vec<Paint>,
}

/// Placement of a uniform stroke relative to the source outline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StrokeAlign {
    #[default]
    Inside,
    Center,
    Outside,
}

impl StrokeAlign {
    pub fn as_str(self) -> &'static str {
        match self {
            StrokeAlign::Inside => "inside",
            StrokeAlign::Center => "center",
            StrokeAlign::Outside => "outside",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StrokeCap {
    #[default]
    Butt,
    Round,
    Square,
}

impl StrokeCap {
    pub fn as_str(self) -> &'static str {
        match self {
            StrokeCap::Butt => "butt",
            StrokeCap::Round => "round",
            StrokeCap::Square => "square",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StrokeJoin {
    #[default]
    Miter,
    Round,
    Bevel,
}

impl StrokeJoin {
    pub fn as_str(self) -> &'static str {
        match self {
            StrokeJoin::Miter => "miter",
            StrokeJoin::Round => "round",
            StrokeJoin::Bevel => "bevel",
        }
    }
}

/// One independently covered stroke application. The paint stack remains the
/// existing ordered [`Paints`] model: entry zero is bottommost within this
/// geometry, and repeated `Stroke` values are themselves painted in list
/// order.
#[derive(Debug, Clone, PartialEq)]
pub struct Stroke {
    pub paints: Paints,
    pub width: f32,
    pub align: StrokeAlign,
    pub cap: StrokeCap,
    pub join: StrokeJoin,
    pub miter_limit: f32,
    pub dash_array: Option<Vec<f32>>,
}

impl Stroke {
    /// Language/model defaults depend only on whether the source outline is
    /// open. A line has no meaningful inside/outside and therefore centers
    /// its default stroke; every closed Draft 0 outline defaults inside.
    pub fn default_for(payload: &Payload) -> Option<Stroke> {
        let align = match payload {
            Payload::Shape {
                desc: ShapeDesc::Line,
            } => StrokeAlign::Center,
            Payload::Frame { .. }
            | Payload::Shape {
                desc: ShapeDesc::Rect | ShapeDesc::Ellipse,
            }
            | Payload::Text { .. } => StrokeAlign::Inside,
            Payload::Group | Payload::Lens { .. } => return None,
        };
        Some(Stroke {
            paints: Paints::default(),
            width: 1.0,
            align,
            cap: StrokeCap::Butt,
            join: StrokeJoin::Miter,
            miter_limit: 4.0,
            dash_array: None,
        })
    }

    pub fn geometry_is_default_for(&self, payload: &Payload) -> bool {
        Self::default_for(payload).is_some_and(|default| {
            self.width == default.width
                && self.align == default.align
                && self.cap == default.cap
                && self.join == default.join
                && self.miter_limit == default.miter_limit
                && self.dash_array == default.dash_array
        })
    }

    pub fn visible(&self) -> bool {
        self.width > 0.0 && self.paints.iter().any(Paint::visible)
    }
}

impl Paints {
    pub fn new(paints: impl IntoIterator<Item = Paint>) -> Paints {
        Paints {
            paints: paints.into_iter().collect(),
        }
    }

    pub fn solid(color: Color) -> Paints {
        Paints::new([Paint::Solid(SolidPaint::new(color))])
    }

    pub fn is_empty(&self) -> bool {
        self.paints.is_empty()
    }

    pub fn len(&self) -> usize {
        self.paints.len()
    }

    pub fn as_slice(&self) -> &[Paint] {
        &self.paints
    }

    pub fn as_mut_slice(&mut self) -> &mut [Paint] {
        &mut self.paints
    }

    pub fn iter(&self) -> std::slice::Iter<'_, Paint> {
        self.paints.iter()
    }

    pub fn iter_mut(&mut self) -> std::slice::IterMut<'_, Paint> {
        self.paints.iter_mut()
    }

    /// Appending places the new paint on top of the existing stack.
    pub fn push(&mut self, paint: Paint) {
        self.paints.push(paint);
    }
}

impl std::ops::Deref for Paints {
    type Target = [Paint];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl IntoIterator for Paints {
    type Item = Paint;
    type IntoIter = std::vec::IntoIter<Paint>;

    fn into_iter(self) -> Self::IntoIter {
        self.paints.into_iter()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub id: NodeId,
    pub header: Header,
    pub payload: Payload,
    pub children: Vec<NodeId>,
    pub fills: Paints,
    pub strokes: Vec<Stroke>,
}

/// The document store is a **node arena**: `NodeId` IS the slot index,
/// deleted slots are tombstones, and parent links live in a parallel
/// column (the game-engine hot/cold shape — cold intent stays AoS per
/// node because it is edited field-wise and read whole; the hot resolved
/// tier is SOA in `resolve::Resolved`). This kills the O(n) `parent_of`
/// scan the map-based lab store had — the same defect class as the
/// legacy engine's pointer-chasing lookups.
#[derive(Debug, Clone)]
pub struct Document {
    slots: Vec<Option<Node>>,
    /// Parent link column, index-aligned with `slots`. Maintained by the
    /// structural APIs below — mutate children through them, not by hand.
    parents: Vec<Option<NodeId>>,
    /// Generation per slot (ENG-2.3), index-aligned with `slots`:
    /// incremented when a slot is tombstoned, so a future reused slot
    /// cannot alias a prior node's cache identity (`engine::ident::Key`).
    /// The arena is append-only today (`add_child` asserts a fresh slot),
    /// so every live node sits at generation 0 and the column is the
    /// dormant guard the cache tier will key on. A storage artifact —
    /// ignored by the semantic `PartialEq`, like tombstones.
    generations: Vec<u32>,
    /// Scene root: a frame whose bindings span the viewport (a.md §3 — the
    /// InitialContainer regularized).
    pub root: NodeId,
}

/// Semantic equality: same root, same alive nodes, same parenting.
/// Tombstones and arena capacity are storage artifacts, not document
/// content — MM-7 (add then delete restores) holds by this definition.
impl PartialEq for Document {
    fn eq(&self, other: &Self) -> bool {
        if self.root != other.root || self.len() != other.len() {
            return false;
        }
        self.slots.iter().enumerate().all(|(i, s)| match s {
            None => other.slots.get(i).map(|o| o.is_none()).unwrap_or(true),
            Some(n) => other.get_opt(i as NodeId) == Some(n) && self.parents[i] == other.parents[i],
        })
    }
}

impl Document {
    pub fn get(&self, id: NodeId) -> &Node {
        self.slots[id as usize].as_ref().expect("dead node id")
    }
    pub fn get_mut(&mut self, id: NodeId) -> &mut Node {
        self.slots[id as usize].as_mut().expect("dead node id")
    }
    pub fn get_opt(&self, id: NodeId) -> Option<&Node> {
        self.slots.get(id as usize).and_then(|s| s.as_ref())
    }
    /// O(1) — the parent column, not a scan.
    pub fn parent_of(&self, id: NodeId) -> Option<NodeId> {
        self.parents.get(id as usize).copied().flatten()
    }
    /// Alive node count.
    pub fn len(&self) -> usize {
        self.slots.iter().filter(|s| s.is_some()).count()
    }
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// Arena extent — the sizing bound for index-aligned SOA columns.
    pub fn capacity(&self) -> usize {
        self.slots.len()
    }

    /// The slot's generation (ENG-2.3) — pair with the [`NodeId`] to form
    /// an `engine::ident::Key`. Out-of-range ids read 0.
    pub fn gen_of(&self, id: NodeId) -> u32 {
        self.generations.get(id as usize).copied().unwrap_or(0)
    }

    fn ensure_slot(&mut self, id: NodeId) {
        let need = id as usize + 1;
        if self.slots.len() < need {
            self.slots.resize_with(need, || None);
            self.parents.resize(need, None);
            self.generations.resize(need, 0);
        }
    }

    /// Tombstone slot `id` and bump its generation (ENG-2.3). The single
    /// place a slot dies — both remove paths funnel through it, so the
    /// generation guard can never be bypassed.
    fn vacate(&mut self, id: NodeId) {
        self.slots[id as usize] = None;
        self.parents[id as usize] = None;
        self.generations[id as usize] += 1;
    }

    /// Structural insert: registers the node at `node.id` and attaches it
    /// as the last child of `parent`.
    pub fn add_child(&mut self, parent: NodeId, node: Node) -> NodeId {
        let parent_payload = &self.get(parent).payload;
        assert!(
            parent_payload.accepts_children(),
            "{} does not accept children",
            parent_payload.kind_name()
        );
        let id = node.id;
        self.ensure_slot(id);
        debug_assert!(self.slots[id as usize].is_none(), "slot occupied");
        self.slots[id as usize] = Some(node);
        self.parents[id as usize] = Some(parent);
        self.get_mut(parent).children.push(id);
        id
    }

    /// Structural remove: detaches `id` from its parent and tombstones the
    /// whole subtree. Returns the number of nodes removed.
    pub fn remove_subtree(&mut self, id: NodeId) -> usize {
        if let Some(p) = self.parent_of(id) {
            self.get_mut(p).children.retain(|c| *c != id);
        }
        self.tombstone_rec(id)
    }
    fn tombstone_rec(&mut self, id: NodeId) -> usize {
        let children = match self.get_opt(id) {
            Some(n) => n.children.clone(),
            None => return 0,
        };
        let mut n = 1;
        for c in children {
            n += self.tombstone_rec(c);
        }
        self.vacate(id);
        n
    }

    /// Tombstone a single slot without touching its (already re-homed)
    /// children — the ungroup bake's final step.
    pub fn remove_slot(&mut self, id: NodeId) {
        self.vacate(id);
    }

    /// Replace `remove` children of `parent` at `idx` with `insert`,
    /// re-homing the inserted nodes' parent links.
    pub fn splice_children(
        &mut self,
        parent: NodeId,
        idx: usize,
        remove: usize,
        insert: Vec<NodeId>,
    ) {
        let parent_payload = &self.get(parent).payload;
        assert!(
            parent_payload.accepts_children(),
            "{} does not accept children",
            parent_payload.kind_name()
        );
        for &c in &insert {
            self.parents[c as usize] = Some(parent);
        }
        self.get_mut(parent)
            .children
            .splice(idx..idx + remove, insert);
    }

    /// Build the arena from an id-keyed map (ids become slot indices);
    /// parent links derive from the children lists once, at construction.
    pub fn from_map(nodes: BTreeMap<NodeId, Node>, root: NodeId) -> Document {
        for node in nodes.values() {
            assert!(
                node.children.is_empty() || node.payload.accepts_children(),
                "{} does not accept children",
                node.payload.kind_name()
            );
        }
        let cap = nodes.keys().max().map(|m| *m as usize + 1).unwrap_or(0);
        let mut slots: Vec<Option<Node>> = Vec::with_capacity(cap);
        slots.resize_with(cap, || None);
        let mut parents = vec![None; cap];
        for (id, node) in nodes {
            for &c in &node.children {
                if (c as usize) < cap {
                    parents[c as usize] = Some(id);
                }
            }
            slots[id as usize] = Some(node);
        }
        Document {
            slots,
            parents,
            generations: vec![0; cap],
            root,
        }
    }
}

/// Builder for terse test/document construction.
pub struct DocBuilder {
    nodes: BTreeMap<NodeId, Node>,
    next: NodeId,
    root: NodeId,
}

impl DocBuilder {
    /// Root frame spanning the given viewport (Span{0,0} both axes).
    pub fn new() -> Self {
        let mut nodes = BTreeMap::new();
        let mut header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        header.x = AxisBinding::Span {
            start: 0.0,
            end: 0.0,
        };
        header.y = AxisBinding::Span {
            start: 0.0,
            end: 0.0,
        };
        nodes.insert(
            0,
            Node {
                id: 0,
                header,
                payload: Payload::Frame {
                    layout: LayoutBehavior::default(),
                    clips_content: false,
                },
                children: vec![],
                fills: Paints::default(),
                strokes: vec![],
            },
        );
        DocBuilder {
            nodes,
            next: 1,
            root: 0,
        }
    }

    pub fn add(&mut self, parent: NodeId, header: Header, payload: Payload) -> NodeId {
        let parent_payload = &self.nodes.get(&parent).expect("parent must exist").payload;
        assert!(
            parent_payload.accepts_children(),
            "{} does not accept children",
            parent_payload.kind_name()
        );
        let id = self.next;
        self.next += 1;
        self.nodes.insert(
            id,
            Node {
                id,
                header,
                payload,
                children: vec![],
                fills: Paints::default(),
                strokes: vec![],
            },
        );
        self.nodes.get_mut(&parent).unwrap().children.push(id);
        id
    }

    pub fn header_mut(&mut self, id: NodeId) -> &mut Header {
        &mut self.nodes.get_mut(&id).unwrap().header
    }

    pub fn node_mut(&mut self, id: NodeId) -> &mut Node {
        self.nodes.get_mut(&id).unwrap()
    }

    pub fn build(self) -> Document {
        Document::from_map(self.nodes, self.root)
    }
}

impl Default for DocBuilder {
    fn default() -> Self {
        Self::new()
    }
}
