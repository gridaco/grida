//! Tag-kind dispatch and attribute helpers over `DemoNode`.
//!
//! No typed-element hierarchy yet — that lands incrementally as features
//! arrive. For now we expose:
//! - [`ElementKind`]: discriminates SVG tags relevant to layout/paint.
//! - [`get_attr`]: case-sensitive attribute lookup by local name (SVG is
//!   namespace-aware but local-name addressed for the attrs we care about).
//!
//! Blink anchor: `core/svg/svg_*_element.{h,cc}`. Blink's typed hierarchy
//! emerges from one DOM `Element` class plus per-tag factories; we'll
//! reach that shape over time.

use csscascade::dom::{DemoNode, DemoNodeData};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElementKind {
    Svg,
    G,
    Defs,
    Symbol,
    Use,
    Switch,
    Title,
    Desc,
    Metadata,
    Rect,
    Circle,
    Ellipse,
    Line,
    Polyline,
    Polygon,
    Path,
    Image,
    ForeignObject,
    Text,
    TSpan,
    TextPath,
    LinearGradient,
    RadialGradient,
    Pattern,
    Stop,
    ClipPath,
    Mask,
    Filter,
    Marker,
    /// `<a>` is a render-transparent grouping element in SVG (it just adds
    /// hyperlink semantics on top of a `<g>`-equivalent). We treat it like
    /// `<g>` for paint purposes.
    Anchor,
    Style,
    Unknown,
}

impl ElementKind {
    pub fn from_local_name(name: &str) -> Self {
        match name {
            "svg" => Self::Svg,
            "g" => Self::G,
            "defs" => Self::Defs,
            "symbol" => Self::Symbol,
            "use" => Self::Use,
            "switch" => Self::Switch,
            "title" => Self::Title,
            "desc" => Self::Desc,
            "metadata" => Self::Metadata,
            "rect" => Self::Rect,
            "circle" => Self::Circle,
            "ellipse" => Self::Ellipse,
            "line" => Self::Line,
            "polyline" => Self::Polyline,
            "polygon" => Self::Polygon,
            "path" => Self::Path,
            "image" => Self::Image,
            "foreignObject" => Self::ForeignObject,
            "text" => Self::Text,
            "tspan" => Self::TSpan,
            "textPath" => Self::TextPath,
            "linearGradient" => Self::LinearGradient,
            "radialGradient" => Self::RadialGradient,
            "pattern" => Self::Pattern,
            "stop" => Self::Stop,
            "clipPath" => Self::ClipPath,
            "mask" => Self::Mask,
            "filter" => Self::Filter,
            "marker" => Self::Marker,
            "a" => Self::Anchor,
            "style" => Self::Style,
            _ => Self::Unknown,
        }
    }

    /// True for elements that are skipped during the paint walk because
    /// they only contribute resources or descriptive metadata.
    pub fn is_hidden_container(self) -> bool {
        matches!(
            self,
            Self::Defs
                | Self::Symbol
                | Self::Title
                | Self::Desc
                | Self::Metadata
                | Self::Style
                | Self::ClipPath
                | Self::Mask
                | Self::Filter
                | Self::Marker
                | Self::LinearGradient
                | Self::RadialGradient
                | Self::Pattern
        )
    }
}

/// Local-name attribute lookup. Returns `None` for non-elements or
/// missing attributes. SVG-namespaced and unprefixed attrs both match.
pub fn get_attr<'a>(node: &'a DemoNode, name: &str) -> Option<&'a str> {
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    for attr in &data.attrs {
        if attr.name.local.as_ref() == name {
            return Some(attr.value.as_ref());
        }
    }
    None
}

/// Element kind of `node`, or `None` if `node` is not an SVG element.
pub fn element_kind(node: &DemoNode) -> Option<ElementKind> {
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    Some(ElementKind::from_local_name(data.name.local.as_ref()))
}
