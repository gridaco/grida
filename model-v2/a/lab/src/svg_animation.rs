//! Retained SVG animation frontend for the model-v2 proving stack.
//!
//! General SVG import is deliberately not invented here. The static shell is
//! the smallest identity-preserving materializer shared by Profiles 0–6:
//! one SVG viewport with direct rectangle and path children and solid fills. Profile 4
//! additionally preserves a bounded static transform list through synthetic
//! lens owners; no profile bakes transforms or viewBox geometry. Animation
//! source stays retained and compiles once into the format-neutral
//! [`crate::animation::AnimationProgram`].

use crate::animation::{
    AnimationProgram, ColorCurve, ColorKeyframe, ColorSegment, CompositeOperation, CubicBezier,
    DiscreteCurve, DiscreteKeyframe, Easing, FillMode, IterationCompositeOperation, KeyframeOffset,
    PathCurve, PathKeyframe, PathSegment, ScalarCurve, ScalarKeyframe, ScalarSegment, Timing,
    Track, TransformCurve, TransformKeyframe, TransformKind, TransformSegment, TransformValue,
};
use crate::math::Affine;
use crate::model::{
    AxisBinding, Color, DocBuilder, Document, Flow, Header, LensOp, NodeId, Paints, Payload,
    Radius, RectangularCornerRadius, ShapeDesc, SizeIntent,
};
use crate::path::{self, FillRule, PathArtifact, PathGeometry};
use crate::properties::{PropertyKey, PropertyTarget};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, ToPrimitive, Zero};
use quick_xml::events::{BytesStart, Event};
use quick_xml::name::ResolveResult;
use quick_xml::NsReader;
use std::collections::BTreeMap;
use std::sync::Arc;
use svgtypes::{
    PathParser, PathSegment as SvgPathSegment, TransformListParser, TransformListToken,
};

pub const SVG_NAMESPACE: &str = "http://www.w3.org/2000/svg";
pub const PROFILE0_COMPILER_ID: &str = "svg-animation-profile0@0/rect-static@0";
pub const PROFILE1_COMPILER_ID: &str = "svg-animation-profile1@0/rect-static@0";
pub const PROFILE2_COMPILER_ID: &str = "svg-animation-profile2@0/rect-static@0";
pub const PROFILE3_COMPILER_ID: &str = "svg-animation-profile3@0/rect-static@0";
pub const PROFILE4_COMPILER_ID: &str = "svg-animation-profile4@0/rect-transform-static@0";
pub const PROFILE5_COMPILER_ID: &str = "svg-animation-profile5@0/rect-transform-static@0";
pub const PROFILE6_COMPILER_ID: &str = "svg-animation-profile6@0/shape-transform-static@0";
pub const LATEST_COMPILER_ID: &str = AnimationProfile::LATEST.compiler_id();

const ACCEPTED_PROFILE0_DYNAMIC_FORM: &str = "accepted Profile 0 dynamic form is a whitespace-only <animate> targeting a <rect>, with attributeName x, y, width, height, or opacity; required from, to, and dur; and optional begin, repeatCount, fill, calcMode=\"linear\", additive=\"replace\", and accumulate=\"none\"";
const ACCEPTED_PROFILE1_DYNAMIC_FORM: &str = "accepted Profile 1 dynamic form is a whitespace-only <animate> targeting a <rect>, with attributeName x, y, width, height, or opacity; either values or from plus to; required dur; optional keyTimes; calcMode absent, linear, or spline; spline requires keySplines; and optional begin, repeatCount, fill, additive=\"replace\", and accumulate=\"none\"";
const ACCEPTED_PROFILE2_DYNAMIC_FORM: &str = "accepted Profile 2 dynamic form is the cumulative Profile 1 <animate> grammar; several replacement effects may target one rectangle property and are ordered by interval begin then document order";
const ACCEPTED_PROFILE3_DYNAMIC_FORM: &str = "accepted Profile 3 dynamic form is the cumulative Profile 2 <animate> grammar with additive absent, replace, or sum and accumulate absent, none, or sum";
const ACCEPTED_PROFILE4_DYNAMIC_FORM: &str = "accepted Profile 4 dynamic form is the cumulative Profile 3 <animate> grammar, additionally allowing scalar lone-to effects and whitespace-only <animateTransform> effects of type translate, scale, or rotate with from plus to or values";
const ACCEPTED_PROFILE5_DYNAMIC_FORM: &str = "accepted Profile 5 dynamic form is the cumulative Profile 4 grammar, additionally allowing <animate attributeName=\"fill\"> with solid legacy-sRGB values written as #RGB, #RGBA, #RRGGBB, or #RRGGBBAA";
const ACCEPTED_PROFILE6_DYNAMIC_FORM: &str = "accepted Profile 6 dynamic form is the cumulative Profile 5 grammar, additionally allowing <animate attributeName=\"d\"> on <path> with compatible non-arc smooth values or explicit calcMode=\"discrete\" path replacement";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AnimationProfile {
    Profile0,
    Profile1,
    Profile2,
    Profile3,
    Profile4,
    Profile5,
    Profile6,
}

impl AnimationProfile {
    const LATEST: Self = Self::Profile6;

    /// Cumulative source-profile level. Adding a profile must update this one
    /// exhaustive match; inherited capabilities then advance automatically.
    const fn level(self) -> u8 {
        match self {
            Self::Profile0 => 0,
            Self::Profile1 => 1,
            Self::Profile2 => 2,
            Self::Profile3 => 3,
            Self::Profile4 => 4,
            Self::Profile5 => 5,
            Self::Profile6 => 6,
        }
    }

    const fn compiler_id(self) -> &'static str {
        match self {
            Self::Profile0 => PROFILE0_COMPILER_ID,
            Self::Profile1 => PROFILE1_COMPILER_ID,
            Self::Profile2 => PROFILE2_COMPILER_ID,
            Self::Profile3 => PROFILE3_COMPILER_ID,
            Self::Profile4 => PROFILE4_COMPILER_ID,
            Self::Profile5 => PROFILE5_COMPILER_ID,
            Self::Profile6 => PROFILE6_COMPILER_ID,
        }
    }

    const fn accepted_dynamic_form(self) -> &'static str {
        match self {
            Self::Profile0 => ACCEPTED_PROFILE0_DYNAMIC_FORM,
            Self::Profile1 => ACCEPTED_PROFILE1_DYNAMIC_FORM,
            Self::Profile2 => ACCEPTED_PROFILE2_DYNAMIC_FORM,
            Self::Profile3 => ACCEPTED_PROFILE3_DYNAMIC_FORM,
            Self::Profile4 => ACCEPTED_PROFILE4_DYNAMIC_FORM,
            Self::Profile5 => ACCEPTED_PROFILE5_DYNAMIC_FORM,
            Self::Profile6 => ACCEPTED_PROFILE6_DYNAMIC_FORM,
        }
    }

    const fn supports_keyframes(self) -> bool {
        self.level() >= 1
    }

    const fn supports_sandwiches(self) -> bool {
        self.level() >= 2
    }

    const fn supports_composition(self) -> bool {
        self.level() >= 3
    }

    const fn supports_typed_effects(self) -> bool {
        self.level() >= 4
    }

    const fn supports_solid_fill(self) -> bool {
        self.level() >= 5
    }

    const fn supports_path_geometry(self) -> bool {
        self.level() >= 6
    }

    const fn name(self) -> &'static str {
        match self {
            Self::Profile0 => "Profile 0",
            Self::Profile1 => "Profile 1",
            Self::Profile2 => "Profile 2",
            Self::Profile3 => "Profile 3",
            Self::Profile4 => "Profile 4",
            Self::Profile5 => "Profile 5",
            Self::Profile6 => "Profile 6",
        }
    }
}

/// One immutable, host-named SVG source snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceSnapshot {
    identity: Arc<str>,
    source: Arc<str>,
}

impl SourceSnapshot {
    pub fn new(identity: impl Into<Arc<str>>, source: impl Into<Arc<str>>) -> Self {
        Self {
            identity: identity.into(),
            source: source.into(),
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn source(&self) -> &str {
        &self.source
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceLocation {
    pub byte: usize,
    pub line: usize,
    pub column: usize,
}

impl SourceLocation {
    fn at(source: &str, byte: usize) -> Self {
        let mut byte = byte.min(source.len());
        while !source.is_char_boundary(byte) {
            byte -= 1;
        }
        let before = &source[..byte];
        let line = before.bytes().filter(|byte| *byte == b'\n').count() + 1;
        let line_start = before.rfind('\n').map_or(0, |index| index + 1);
        let column = source[line_start..byte].chars().count() + 1;
        Self { byte, line, column }
    }
}

/// One source-located failure. Compilation is whole-document strict, so this
/// value is returned before an animation program or sampled frame exists.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvgAnimationError {
    source: Arc<str>,
    pub location: SourceLocation,
    pub message: String,
}

impl SvgAnimationError {
    fn new(
        snapshot: &SourceSnapshot,
        location: SourceLocation,
        message: impl Into<String>,
    ) -> Self {
        Self {
            source: Arc::from(snapshot.identity()),
            location,
            message: message.into(),
        }
    }

    pub fn source_identity(&self) -> &str {
        &self.source
    }
}

impl std::fmt::Display for SvgAnimationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{}:{}: SVG animation: {}",
            self.source, self.location.line, self.location.column, self.message
        )
    }
}

impl std::error::Error for SvgAnimationError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ElementKind {
    Svg,
    Rect,
    Path,
    Animate,
    AnimateTransform,
}

impl ElementKind {
    fn name(self) -> &'static str {
        match self {
            ElementKind::Svg => "svg",
            ElementKind::Rect => "rect",
            ElementKind::Path => "path",
            ElementKind::Animate => "animate",
            ElementKind::AnimateTransform => "animateTransform",
        }
    }
}

#[derive(Debug, Clone)]
struct ElementSite {
    id: String,
    kind: ElementKind,
    node: Option<NodeId>,
    location: SourceLocation,
}

#[derive(Debug, Clone)]
struct AnimationSite {
    kind: AnimationElementKind,
    attributes: BTreeMap<String, String>,
    parent: Option<NodeId>,
    location: SourceLocation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AnimationElementKind {
    Animate,
    AnimateTransform,
}

impl AnimationElementKind {
    const fn name(self) -> &'static str {
        match self {
            Self::Animate => "animate",
            Self::AnimateTransform => "animateTransform",
        }
    }
}

type AttributeView<'a> = BTreeMap<&'a str, &'a str>;

#[derive(Debug, Clone)]
struct ForbiddenSite {
    location: SourceLocation,
    message: String,
}

#[derive(Debug, Clone, Copy)]
enum OpenElement {
    Svg,
    Rect(NodeId),
    Path(NodeId),
    Animate,
    AnimateTransform,
}

impl OpenElement {
    fn name(self) -> &'static str {
        match self {
            OpenElement::Svg => "svg",
            OpenElement::Rect(_) => "rect",
            OpenElement::Path(_) => "path",
            OpenElement::Animate => "animate",
            OpenElement::AnimateTransform => "animateTransform",
        }
    }
}

/// Retained SVG animation source plus the proving direct-shape static shell.
/// This is the cumulative profile frontend, not a general SVG importer.
#[derive(Debug)]
pub struct SvgAnimationSource {
    snapshot: SourceSnapshot,
    document: Document,
    viewport: (f32, f32),
    elements: Vec<ElementSite>,
    animations: Vec<AnimationSite>,
    transform_owners: BTreeMap<NodeId, NodeId>,
    static_transform_locations: Vec<SourceLocation>,
    forbidden: Vec<ForbiddenSite>,
}

impl SvgAnimationSource {
    pub fn parse(snapshot: SourceSnapshot) -> Result<Self, SvgAnimationError> {
        Parser::new(snapshot).parse()
    }

    pub fn snapshot(&self) -> &SourceSnapshot {
        &self.snapshot
    }

    pub fn document(&self) -> &Document {
        &self.document
    }

    pub fn viewport(&self) -> (f32, f32) {
        self.viewport
    }

    /// Includes admitted and unsupported animation markup. Base rendering can
    /// therefore report that behavior was intentionally ignored.
    pub fn has_animation_markup(&self) -> bool {
        !self.animations.is_empty() || !self.forbidden.is_empty()
    }

    pub fn compile_profile0(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile0)
    }

    pub fn compile_profile1(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile1)
    }

    pub fn compile_profile2(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile2)
    }

    pub fn compile_profile3(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile3)
    }

    pub fn compile_profile4(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile4)
    }

    pub fn compile_profile5(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile5)
    }

    pub fn compile_profile6(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::Profile6)
    }

    /// Compile the newest cumulative proving profile.
    ///
    /// Versioned methods remain the stable conformance entry points; live and
    /// offline diagnostic hosts use this moving pointer deliberately.
    pub fn compile_latest(&self) -> Result<AnimationProgram, SvgAnimationError> {
        self.compile(AnimationProfile::LATEST)
    }

    fn compile(&self, profile: AnimationProfile) -> Result<AnimationProgram, SvgAnimationError> {
        let accepted_dynamic_form = profile.accepted_dynamic_form();
        if !profile.supports_path_geometry() {
            if let Some(site) = self
                .elements
                .iter()
                .find(|site| site.kind == ElementKind::Path)
            {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    site.location,
                    format!(
                        "unsupported static <path> in {}; {accepted_dynamic_form}",
                        profile.name()
                    ),
                ));
            }
        }
        if !profile.supports_typed_effects() {
            if let Some(location) = self.static_transform_locations.first() {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    *location,
                    format!(
                        "unknown attribute `transform` on the static shape materializer; {accepted_dynamic_form}"
                    ),
                ));
            }
        }
        if let Some(forbidden) = self.forbidden.first() {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                forbidden.location,
                format!("{}; {accepted_dynamic_form}", forbidden.message),
            ));
        }

        let mut ids: BTreeMap<&str, Vec<&ElementSite>> = BTreeMap::new();
        for site in &self.elements {
            ids.entry(&site.id).or_default().push(site);
        }
        if let Some((id, sites)) = ids.iter().find(|(_, sites)| sites.len() > 1) {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                sites[1].location,
                format!(
                    "duplicate id `{id}` makes same-document animation targeting ambiguous; first declared at {}:{}",
                    sites[0].location.line, sites[0].location.column
                ),
            ));
        }

        let mut tracks = Vec::with_capacity(self.animations.len());
        let mut targets = BTreeMap::<PropertyTarget, SourceLocation>::new();

        for animation in &self.animations {
            if animation.kind == AnimationElementKind::AnimateTransform
                && !profile.supports_typed_effects()
            {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!(
                        "unsupported SVG animation element <animateTransform> in {}; the selected profile admits only <animate>; {accepted_dynamic_form}",
                        profile.name()
                    ),
                ));
            }
            let mut attributes = animation
                .attributes
                .iter()
                .map(|(name, value)| (name.as_str(), value.as_str()))
                .collect::<AttributeView<'_>>();
            let authored_id = attributes.remove("id");
            let element_name = animation.kind.name();
            let label = authored_id
                .map(|id| format!("<{element_name} id=\"{id}\">"))
                .unwrap_or_else(|| {
                    format!(
                        "<{element_name}> at {}:{}",
                        animation.location.line, animation.location.column
                    )
                });

            const PROFILE0_ATTRIBUTES: &[&str] = &[
                "href",
                "attributeName",
                "from",
                "to",
                "begin",
                "dur",
                "repeatCount",
                "fill",
                "calcMode",
                "additive",
                "accumulate",
            ];
            const PROFILE1_ATTRIBUTES: &[&str] = &[
                "href",
                "attributeName",
                "from",
                "to",
                "values",
                "keyTimes",
                "keySplines",
                "begin",
                "dur",
                "repeatCount",
                "fill",
                "calcMode",
                "additive",
                "accumulate",
            ];
            const TRANSFORM_ATTRIBUTES: &[&str] = &[
                "href",
                "attributeName",
                "type",
                "from",
                "to",
                "values",
                "keyTimes",
                "keySplines",
                "begin",
                "dur",
                "repeatCount",
                "fill",
                "calcMode",
                "additive",
                "accumulate",
            ];
            let profile_attributes = match (animation.kind, profile) {
                (AnimationElementKind::AnimateTransform, profile)
                    if profile.supports_typed_effects() =>
                {
                    TRANSFORM_ATTRIBUTES
                }
                (AnimationElementKind::Animate, AnimationProfile::Profile0) => PROFILE0_ATTRIBUTES,
                (AnimationElementKind::Animate, _) => PROFILE1_ATTRIBUTES,
                (AnimationElementKind::AnimateTransform, _) => {
                    unreachable!("older profiles reject animateTransform above")
                }
            };
            if let Some(name) = attributes
                .keys()
                .find(|name| !profile_attributes.contains(name))
            {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("unsupported attribute `{name}` on {label}; {accepted_dynamic_form}"),
                ));
            }

            let target_node = match attributes.remove("href") {
                Some(href) => {
                    let fragment = parse_fragment(href).map_err(|message| {
                        SvgAnimationError::new(&self.snapshot, animation.location, message)
                    })?;
                    let Some(sites) = ids.get(fragment) else {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            animation.location,
                            format!("{label} href `#{fragment}` does not resolve in this document"),
                        ));
                    };
                    let site = sites[0];
                    if !matches!(site.kind, ElementKind::Rect | ElementKind::Path) {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            animation.location,
                            format!(
                                "{label} targets <{} id=\"{fragment}\">; the selected animation profile requires a materialized <rect> or <path>",
                                site.kind.name()
                            ),
                        ));
                    }
                    site.node.expect("shape element sites own a node")
                }
                None => animation.parent.ok_or_else(|| {
                    SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!("{label} has no href and its immediate parent is not a materialized shape"),
                    )
                })?,
            };
            let geometry_node = self.document.key_of(target_node).ok_or_else(|| {
                SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("{label} target became stale before compilation"),
                )
            })?;
            let target_path = match &self.document.get(target_node).payload {
                Payload::Shape {
                    desc: ShapeDesc::Path(path),
                } => Some(Arc::clone(path)),
                _ => None,
            };

            let attribute_name =
                required(&mut attributes, "attributeName", &label).map_err(|message| {
                    SvgAnimationError::new(&self.snapshot, animation.location, message)
                })?;
            let (target, compiled_effect) = match animation.kind {
                AnimationElementKind::Animate => {
                    if attribute_name == "d" {
                        if !profile.supports_path_geometry() {
                            return Err(SvgAnimationError::new(
                                &self.snapshot,
                                animation.location,
                                format!(
                                    "{label} attributeName `d` is unsupported by {}",
                                    profile.name()
                                ),
                            ));
                        }
                        target_path.as_ref().ok_or_else(|| {
                            SvgAnimationError::new(
                                &self.snapshot,
                                animation.location,
                                format!("{label} attributeName `d` requires a <path> target"),
                            )
                        })?;
                        let target = PropertyTarget::new(geometry_node, PropertyKey::PathGeometry);
                        let effect = compile_path_effect(&mut attributes, &label, self.viewport)
                            .map_err(|message| {
                                SvgAnimationError::new(
                                    &self.snapshot,
                                    animation.location,
                                    format!(
                                    "{label} resolved to target {target:?} property `d`: {message}"
                                ),
                                )
                            })?;
                        (target, CompiledEffect::Path(effect))
                    } else if attribute_name == "fill" {
                        if !profile.supports_solid_fill() {
                            return Err(SvgAnimationError::new(
                                &self.snapshot,
                                animation.location,
                                format!(
                                    "{label} attributeName must be x, y, width, height, or opacity in {}; found `fill`",
                                    profile.name()
                                ),
                            ));
                        }
                        let target = PropertyTarget::new(geometry_node, PropertyKey::Fills);
                        let effect = compile_color_effect(profile, &mut attributes, &label)
                            .map_err(|message| {
                                SvgAnimationError::new(
                                    &self.snapshot,
                                    animation.location,
                                    format!(
                                        "{label} resolved to target {target:?} property `fill`: {message}"
                                    ),
                                )
                            })?;
                        (target, CompiledEffect::Color(effect))
                    } else {
                        let property = match attribute_name {
                            "x" if target_path.is_none() => PropertyKey::X,
                            "y" if target_path.is_none() => PropertyKey::Y,
                            "width" if target_path.is_none() => PropertyKey::Width,
                            "height" if target_path.is_none() => PropertyKey::Height,
                            "opacity" => PropertyKey::Opacity,
                            "stroke" if profile.supports_solid_fill() => {
                                return Err(SvgAnimationError::new(
                                    &self.snapshot,
                                    animation.location,
                                    format!(
                                        "{label} attributeName `stroke` is valid SVG color animation but deferred by Profile 5: stroke color needs a static stroke-geometry and effective `Strokes` target seam"
                                    ),
                                ));
                            }
                            "stop-color" if profile.supports_solid_fill() => {
                                return Err(SvgAnimationError::new(
                                    &self.snapshot,
                                    animation.location,
                                    format!(
                                        "{label} attributeName `stop-color` is valid SVG color animation but deferred by Profile 5: a gradient stop needs durable resource and stop target identity"
                                    ),
                                ));
                            }
                            _ => {
                                return Err(SvgAnimationError::new(
                                &self.snapshot,
                                animation.location,
                                format!(
                                    "{label} attributeName must be {}opacity{}{}; found `{attribute_name}`",
                                    if target_path.is_none() { "x, y, width, height, or " } else { "" },
                                    if profile.supports_solid_fill() { ", or fill" } else { "" },
                                    if target_path.is_some() && profile.supports_path_geometry() { ", or d" } else { "" }
                                ),
                            ));
                            }
                        };
                        let effect =
                            compile_scalar_effect(profile, &mut attributes, property, &label)
                                .map_err(|message| {
                                    SvgAnimationError::new(
                                        &self.snapshot,
                                        animation.location,
                                        message,
                                    )
                                })?;
                        (
                            PropertyTarget::new(geometry_node, property),
                            CompiledEffect::Scalar { property, effect },
                        )
                    }
                }
                AnimationElementKind::AnimateTransform => {
                    if attribute_name != "transform" {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            animation.location,
                            format!(
                                "{label} attributeName must be `transform`; found `{attribute_name}`"
                            ),
                        ));
                    }
                    let owner_id = *self.transform_owners.get(&target_node).ok_or_else(|| {
                        SvgAnimationError::new(
                            &self.snapshot,
                            animation.location,
                            format!("{label} target has no identity-preserving transform owner"),
                        )
                    })?;
                    let owner = self.document.key_of(owner_id).ok_or_else(|| {
                        SvgAnimationError::new(
                            &self.snapshot,
                            animation.location,
                            format!("{label} transform owner became stale before compilation"),
                        )
                    })?;
                    let curve = compile_transform_curve(profile, &mut attributes, &label).map_err(
                        |message| {
                            SvgAnimationError::new(&self.snapshot, animation.location, message)
                        },
                    )?;
                    (
                        PropertyTarget::new(owner, PropertyKey::LensOps),
                        CompiledEffect::Transform(curve),
                    )
                }
            };

            // Profiles 0–6 deliberately narrow the engine's signed timeline:
            // authored SVG clock values in this frontend must be non-negative.
            let begin = match attributes.remove("begin") {
                Some(value) => parse_clock(value, &format!("begin on {label}")),
                None => Ok(0),
            }
            .map_err(|message| {
                SvgAnimationError::new(&self.snapshot, animation.location, message)
            })?;
            let duration_source = required(&mut attributes, "dur", &label).map_err(|message| {
                SvgAnimationError::new(&self.snapshot, animation.location, message)
            })?;
            let duration =
                parse_clock(duration_source, &format!("dur on {label}")).map_err(|message| {
                    SvgAnimationError::new(&self.snapshot, animation.location, message)
                })?;
            if duration == 0 {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("dur on {label} must be greater than zero"),
                ));
            }
            let repeat_count = match attributes.remove("repeatCount") {
                Some(value) => parse_repeat_count(value, &label),
                None => Ok(1),
            }
            .map_err(|message| {
                SvgAnimationError::new(&self.snapshot, animation.location, message)
            })?;
            let timing = Timing::new(begin, duration as u64, repeat_count).map_err(|error| {
                SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("invalid timing on {label}: {error}"),
                )
            })?;

            let fill = match attributes.remove("fill") {
                None | Some("remove") => FillMode::Remove,
                Some("freeze") => FillMode::Freeze,
                Some(value) => {
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!("fill on {label} must be `remove` or `freeze`; found `{value}`"),
                    ));
                }
            };
            let composite = match attributes.remove("additive") {
                None | Some("replace") => CompositeOperation::Replace,
                Some("sum") if profile.supports_composition() => CompositeOperation::Add,
                Some(value) => {
                    let expected = if profile.supports_composition() {
                        "`replace` or `sum`"
                    } else {
                        "`replace`"
                    };
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!("additive on {label} must be {expected}; found `{value}`"),
                    ));
                }
            };
            let iteration_composite = match attributes.remove("accumulate") {
                None | Some("none") => IterationCompositeOperation::Replace,
                Some("sum") if profile.supports_composition() => {
                    IterationCompositeOperation::Accumulate
                }
                Some(value) => {
                    let expected = if profile.supports_composition() {
                        "`none` or `sum`"
                    } else {
                        "`none`"
                    };
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!("accumulate on {label} must be {expected}; found `{value}`"),
                    ));
                }
            };
            if let Some(name) = attributes.keys().next() {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("unsupported attribute `{name}` on {label}; {accepted_dynamic_form}"),
                ));
            }

            if !profile.supports_sandwiches() {
                if let Some(first) = targets.insert(target, animation.location) {
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!(
                            "{label} duplicates the same node/property target first animated at {}:{}",
                            first.line, first.column
                        ),
                    ));
                }
            }

            let source = format!(
                "{}:{}:{} {label}",
                self.snapshot.identity(),
                animation.location.line,
                animation.location.column
            );
            let track = match compiled_effect {
                CompiledEffect::Scalar {
                    property,
                    effect: CompiledScalarEffect::Curve(curve),
                } => (match property {
                    PropertyKey::X | PropertyKey::Y => {
                        Track::axis_start_curve(source, target, curve, timing, fill)
                    }
                    PropertyKey::Width | PropertyKey::Height => {
                        Track::fixed_size_curve(source, target, curve, timing, fill)
                    }
                    PropertyKey::Opacity => {
                        Track::opacity_curve(source, target, curve, timing, fill)
                    }
                    _ => unreachable!("closed SVG scalar animation property set"),
                })
                .and_then(|track| track.with_composition(composite, iteration_composite)),
                CompiledEffect::Scalar {
                    property,
                    effect: CompiledScalarEffect::To { target: to, easing },
                } => match property {
                    // SVG requires the authored additive and accumulate values
                    // to be parsed, but a lone-to effect is always the kernel's
                    // live-underlying composition class. Do not project those
                    // source attributes into the format-neutral track.
                    PropertyKey::X | PropertyKey::Y => Track::axis_start_from_live_underlying(
                        source, target, to, easing, timing, fill,
                    ),
                    PropertyKey::Width | PropertyKey::Height => {
                        Track::fixed_size_from_live_underlying(
                            source, target, to, easing, timing, fill,
                        )
                    }
                    PropertyKey::Opacity => Track::opacity_from_live_underlying(
                        source, target, to, easing, timing, fill,
                    ),
                    _ => unreachable!("closed SVG scalar animation property set"),
                },
                CompiledEffect::Color(CompiledColorEffect::Curve(curve)) => {
                    Track::solid_fill_curve(source, target, curve, timing, fill)
                        .and_then(|track| track.with_composition(composite, iteration_composite))
                }
                CompiledEffect::Color(CompiledColorEffect::To { target: to, easing }) => {
                    // As with scalar lone-to, SVG's authored additive and
                    // accumulate attributes do not replace the kernel's live
                    // lower-sandwich interpolation class.
                    Track::solid_fill_from_live_underlying(source, target, to, easing, timing, fill)
                }
                CompiledEffect::Transform(curve) => {
                    Track::lens_transform_curve(source, target, curve, timing, fill)
                        .and_then(|track| track.with_composition(composite, iteration_composite))
                }
                CompiledEffect::Path(CompiledPathEffect::Smooth(curve)) => {
                    Track::path_curve(source, target, curve, timing, fill)
                        .and_then(|track| track.with_composition(composite, iteration_composite))
                }
                CompiledEffect::Path(CompiledPathEffect::Discrete(curve)) => {
                    Track::path_discrete_curve(source, target, curve, timing, fill)
                        .and_then(|track| track.with_composition(composite, iteration_composite))
                }
                CompiledEffect::Path(CompiledPathEffect::Fallback { from, to, easing }) => {
                    Track::path_discrete_fallback(source, target, from, to, easing, timing, fill)
                        .and_then(|track| track.with_composition(composite, iteration_composite))
                }
            }
            .map_err(|error| {
                SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("could not compile {label}: {error}"),
                )
            })?;
            tracks.push(track);
        }

        if profile.supports_sandwiches() {
            // Profiles 2–6 have one resolved begin per effect and no restart or
            // timing dependency. Stable sorting therefore yields the complete
            // low-to-high SMIL priority: later begin, then later document
            // order. Repeats retain their interval's original priority.
            tracks.sort_by_key(|track| track.timing().begin());
        }

        AnimationProgram::new(&self.document, profile.compiler_id(), tracks).map_err(|error| {
            let location = self
                .animations
                .first()
                .map_or(SourceLocation::at(self.snapshot.source(), 0), |site| {
                    site.location
                });
            SvgAnimationError::new(
                &self.snapshot,
                location,
                format!("could not construct animation program: {error}"),
            )
        })
    }

    pub fn into_compiled_profile0(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile0)
    }

    pub fn into_compiled_profile1(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile1)
    }

    pub fn into_compiled_profile2(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile2)
    }

    pub fn into_compiled_profile3(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile3)
    }

    pub fn into_compiled_profile4(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile4)
    }

    pub fn into_compiled_profile5(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile5)
    }

    pub fn into_compiled_profile6(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile6)
    }

    pub fn into_compiled_latest(self) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::LATEST)
    }

    fn into_compiled(
        self,
        profile: AnimationProfile,
    ) -> Result<CompiledSvgAnimation, SvgAnimationError> {
        let animation = self.compile(profile)?;
        Ok(CompiledSvgAnimation {
            snapshot: self.snapshot,
            document: self.document,
            animation,
            viewport: self.viewport,
        })
    }
}

/// One direct-shape source, ordinary document, and format-neutral program
/// ready for repeated explicit-time frames.
#[derive(Debug)]
pub struct CompiledSvgAnimation {
    snapshot: SourceSnapshot,
    document: Document,
    animation: AnimationProgram,
    viewport: (f32, f32),
}

impl CompiledSvgAnimation {
    pub fn snapshot(&self) -> &SourceSnapshot {
        &self.snapshot
    }

    pub fn document(&self) -> &Document {
        &self.document
    }

    pub fn animation(&self) -> &AnimationProgram {
        &self.animation
    }

    pub fn viewport(&self) -> (f32, f32) {
        self.viewport
    }

    pub fn into_parts(self) -> (SourceSnapshot, Document, AnimationProgram, (f32, f32)) {
        (self.snapshot, self.document, self.animation, self.viewport)
    }
}

struct Parser {
    snapshot: SourceSnapshot,
    builder: DocBuilder,
    viewport: Option<(f32, f32)>,
    elements: Vec<ElementSite>,
    animations: Vec<AnimationSite>,
    static_transforms: BTreeMap<NodeId, Vec<LensOp>>,
    static_transform_locations: Vec<SourceLocation>,
    forbidden: Vec<ForbiddenSite>,
    stack: Vec<OpenElement>,
    skip_depth: usize,
    root_seen: bool,
    root_closed: bool,
    declaration_seen: bool,
}

impl Parser {
    fn new(snapshot: SourceSnapshot) -> Self {
        Self {
            snapshot,
            builder: DocBuilder::new(),
            viewport: None,
            elements: vec![],
            animations: vec![],
            static_transforms: BTreeMap::new(),
            static_transform_locations: vec![],
            forbidden: vec![],
            stack: vec![],
            skip_depth: 0,
            root_seen: false,
            root_closed: false,
            declaration_seen: false,
        }
    }

    fn parse(mut self) -> Result<SvgAnimationSource, SvgAnimationError> {
        let source = Arc::clone(&self.snapshot.source);
        let mut reader = NsReader::from_str(&source);
        reader.config_mut().trim_text(false);

        loop {
            let start = reader.buffer_position() as usize;
            let (namespace, event) = match reader.read_resolved_event() {
                Ok(result) => result,
                Err(error) => {
                    let location = SourceLocation::at(&source, reader.error_position() as usize);
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        location,
                        format!("malformed XML: {error}"),
                    ));
                }
            };
            let location = SourceLocation::at(&source, start);

            if self.skip_depth > 0 {
                match event {
                    Event::Start(_) => self.skip_depth += 1,
                    Event::End(_) => self.skip_depth -= 1,
                    Event::Eof => {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            "unexpected end of source inside unsupported animation markup",
                        ));
                    }
                    _ => {}
                }
                continue;
            }

            match event {
                event @ (Event::Start(_) | Event::Empty(_)) => {
                    let empty = matches!(event, Event::Empty(_));
                    let element = match event {
                        Event::Start(element) | Event::Empty(element) => element,
                        _ => unreachable!(),
                    };
                    self.start_element(&namespace, &element, empty, location)?;
                }
                Event::End(element) => {
                    let local = local_name(element.name().as_ref());
                    let Some(open) = self.stack.pop() else {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            format!("unexpected closing element </{local}>"),
                        ));
                    };
                    if open.name() != local {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            format!(
                                "closing element </{local}> does not match <{}>",
                                open.name()
                            ),
                        ));
                    }
                    if matches!(open, OpenElement::Svg) {
                        self.root_closed = true;
                    }
                }
                Event::Text(text) => {
                    let text = text.unescape().map_err(|error| {
                        SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            format!("invalid character data: {error}"),
                        )
                    })?;
                    self.character_data(&text, location)?;
                }
                Event::CData(text) => {
                    let text = String::from_utf8_lossy(text.as_ref());
                    self.character_data(&text, location)?;
                }
                Event::Comment(_) => {
                    if matches!(
                        self.stack.last(),
                        Some(OpenElement::Animate | OpenElement::AnimateTransform)
                    ) {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            "SVG animation elements may contain whitespace only, found an XML comment",
                        ));
                    }
                }
                Event::Decl(_) => {
                    if self.root_seen || self.declaration_seen {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            "XML declaration must occur at most once before <svg>",
                        ));
                    }
                    self.declaration_seen = true;
                }
                Event::PI(_) => {
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        location,
                        "processing instructions are not supported",
                    ));
                }
                Event::DocType(_) => {
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        location,
                        "document type declarations are not supported",
                    ));
                }
                Event::Eof => break,
            }
        }

        if !self.root_seen {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                SourceLocation::at(&source, 0),
                "source requires one SVG-namespace <svg> root",
            ));
        }
        if !self.root_closed || !self.stack.is_empty() {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                SourceLocation::at(&source, source.len()),
                "unclosed <svg> document",
            ));
        }

        let transform_owners = self.materialize_transform_owners();
        Ok(SvgAnimationSource {
            snapshot: self.snapshot,
            document: self.builder.build(),
            viewport: self.viewport.expect("root parsing sets viewport"),
            elements: self.elements,
            animations: self.animations,
            transform_owners,
            static_transform_locations: self.static_transform_locations,
            forbidden: self.forbidden,
        })
    }

    fn start_element(
        &mut self,
        namespace: &ResolveResult<'_>,
        element: &BytesStart<'_>,
        empty: bool,
        location: SourceLocation,
    ) -> Result<(), SvgAnimationError> {
        let local = local_name(element.name().as_ref());
        if !is_svg_namespace(namespace) {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                format!("element <{local}> is not in the SVG namespace"),
            ));
        }
        if self.root_closed {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                format!("element <{local}> appears after the root </svg>"),
            ));
        }

        let mut attributes = collect_attributes(element).map_err(|message| {
            SvgAnimationError::new(&self.snapshot, location, format!("<{local}>: {message}"))
        })?;

        if !self.root_seen {
            if local != "svg" {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!("document root must be <svg>, found <{local}>"),
                ));
            }
            self.root_seen = true;
            self.parse_root(&mut attributes, location)?;
            if let Some(id) = attributes.remove("id") {
                self.elements.push(ElementSite {
                    id,
                    kind: ElementKind::Svg,
                    node: None,
                    location,
                });
            }
            reject_unknown(&attributes, "svg")
                .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
            if empty {
                self.root_closed = true;
            } else {
                self.stack.push(OpenElement::Svg);
            }
            return Ok(());
        }

        let parent = self.stack.last().copied();
        match local.as_str() {
            "rect" if matches!(parent, Some(OpenElement::Svg)) => {
                self.extract_forbidden_attributes(&mut attributes, location);
                let id = attributes.get("id").cloned();
                let node = self.parse_rect(&mut attributes, location)?;
                if let Some(id) = id {
                    self.elements.push(ElementSite {
                        id,
                        kind: ElementKind::Rect,
                        node: Some(node),
                        location,
                    });
                }
                if !empty {
                    self.stack.push(OpenElement::Rect(node));
                }
            }
            "path" if matches!(parent, Some(OpenElement::Svg)) => {
                self.extract_forbidden_attributes(&mut attributes, location);
                let id = attributes.get("id").cloned();
                let node = self.parse_path(&mut attributes, location)?;
                if let Some(id) = id {
                    self.elements.push(ElementSite {
                        id,
                        kind: ElementKind::Path,
                        node: Some(node),
                        location,
                    });
                }
                if !empty {
                    self.stack.push(OpenElement::Path(node));
                }
            }
            "animate" | "animateTransform"
                if matches!(
                    parent,
                    Some(OpenElement::Svg | OpenElement::Rect(_) | OpenElement::Path(_))
                ) =>
            {
                let kind = if local == "animate" {
                    AnimationElementKind::Animate
                } else {
                    AnimationElementKind::AnimateTransform
                };
                let parent = match parent {
                    Some(OpenElement::Rect(node) | OpenElement::Path(node)) => Some(node),
                    _ => None,
                };
                if let Some(id) = attributes.get("id").cloned() {
                    self.elements.push(ElementSite {
                        id,
                        kind: match kind {
                            AnimationElementKind::Animate => ElementKind::Animate,
                            AnimationElementKind::AnimateTransform => ElementKind::AnimateTransform,
                        },
                        node: None,
                        location,
                    });
                }
                self.animations.push(AnimationSite {
                    kind,
                    attributes,
                    parent,
                    location,
                });
                if !empty {
                    self.stack.push(match kind {
                        AnimationElementKind::Animate => OpenElement::Animate,
                        AnimationElementKind::AnimateTransform => OpenElement::AnimateTransform,
                    });
                }
            }
            "set" | "animateMotion" => {
                self.forbidden.push(ForbiddenSite {
                    location,
                    message: format!(
                        "unsupported SVG animation element <{local}>; the proving materializer recognizes only <animate> and <animateTransform>"
                    ),
                });
                if !empty {
                    self.skip_depth = 1;
                }
            }
            "script" => {
                self.forbidden.push(ForbiddenSite {
                    location,
                    message: "<script> is forbidden while sampling SVG animation".into(),
                });
                if !empty {
                    self.skip_depth = 1;
                }
            }
            "style" => {
                self.forbidden.push(ForbiddenSite {
                    location,
                    message: "CSS <style> content is outside the SVG animation sampling boundary"
                        .into(),
                });
                if !empty {
                    self.skip_depth = 1;
                }
            }
            _ if matches!(
                parent,
                Some(OpenElement::Animate | OpenElement::AnimateTransform)
            ) =>
            {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!("SVG animation elements may contain whitespace only, found <{local}>"),
                ));
            }
            _ => {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!(
                        "the SVG animation proving materializer supports only direct <rect> or <path> children, <animate>, and <animateTransform>; found <{local}>"
                    ),
                ));
            }
        }
        Ok(())
    }

    fn materialize_transform_owners(&mut self) -> BTreeMap<NodeId, NodeId> {
        let mut targets = self.static_transforms.keys().copied().collect::<Vec<_>>();
        for animation in &self.animations {
            if animation.kind != AnimationElementKind::AnimateTransform {
                continue;
            }
            // SVG href targeting overrides the animation element's parent.
            // Mirror compilation here so the transform owner is materialized
            // around the node that will actually receive the effect. Invalid
            // or ambiguous references remain unwrapped and are diagnosed by
            // the compiler with their original source location.
            let target = match animation.attributes.get("href") {
                Some(href) => {
                    let fragment = parse_fragment(href).ok();
                    fragment.and_then(|fragment| {
                        let mut matching = self.elements.iter().filter(|site| {
                            site.id == fragment
                                && matches!(site.kind, ElementKind::Rect | ElementKind::Path)
                        });
                        let node = matching.next()?.node?;
                        matching.next().is_none().then_some(node)
                    })
                }
                None => animation.parent,
            };
            if let Some(target) = target {
                targets.push(target);
            }
        }
        targets.sort_unstable();
        targets.dedup();

        targets
            .into_iter()
            .map(|shape| {
                let ops = self.static_transforms.remove(&shape).unwrap_or_default();
                let mut header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
                header.flow = Flow::Absolute;
                let lens = self
                    .builder
                    .add(self.builder_root(), header, Payload::Lens { ops });
                self.builder
                    .node_mut(lens)
                    .preserve_descendant_hit_identity();

                let root = self.builder.node_mut(self.builder_root());
                assert_eq!(root.children.pop(), Some(lens));
                let position = root
                    .children
                    .iter()
                    .position(|child| *child == shape)
                    .expect("transform targets are direct shape children");
                root.children[position] = lens;
                self.builder.node_mut(lens).children.push(shape);
                (shape, lens)
            })
            .collect()
    }

    fn parse_root(
        &mut self,
        attributes: &mut BTreeMap<String, String>,
        location: SourceLocation,
    ) -> Result<(), SvgAnimationError> {
        self.extract_forbidden_attributes(attributes, location);
        let width = take_number(attributes, "width", "<svg> width")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        let height = take_number(attributes, "height", "<svg> height")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        if width <= 0.0 || height <= 0.0 {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                "<svg> width and height must be positive unitless numbers",
            ));
        }
        if attributes.contains_key("viewBox") {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                "viewBox is not accepted by the identity-preserving SVG animation proving materializer",
            ));
        }
        self.viewport = Some((width, height));
        Ok(())
    }

    fn parse_rect(
        &mut self,
        attributes: &mut BTreeMap<String, String>,
        location: SourceLocation,
    ) -> Result<NodeId, SvgAnimationError> {
        let id = attributes.remove("id");
        let x = take_optional_number(attributes, "x", 0.0, "x on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        let y = take_optional_number(attributes, "y", 0.0, "y on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        let width = take_number(attributes, "width", "width on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        let height = take_number(attributes, "height", "height on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        if width < 0.0 || height < 0.0 {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                "rectangle width and height must be non-negative",
            ));
        }
        let opacity = take_optional_number(attributes, "opacity", 1.0, "opacity on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        if !(0.0..=1.0).contains(&opacity) {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                "rectangle opacity must be between 0 and 1 inclusive",
            ));
        }
        let rx = take_optional_number_option(attributes, "rx", "rx on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        let ry = take_optional_number_option(attributes, "ry", "ry on <rect>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        let (rx, ry) = match (rx, ry) {
            (None, None) => (0.0, 0.0),
            (Some(rx), None) => (rx, rx),
            (None, Some(ry)) => (ry, ry),
            (Some(rx), Some(ry)) => (rx, ry),
        };
        if rx < 0.0 || ry < 0.0 {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                "rectangle rx and ry must be non-negative",
            ));
        }
        let fills = match attributes.remove("fill").as_deref() {
            None => Paints::solid(Color::BLACK),
            Some("none") => Paints::default(),
            Some(value) => Paints::solid(Color::from_grida_hex(value).ok_or_else(|| {
                SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!("fill on <rect> must be `none`, #RGB, or #RRGGBB; found `{value}`"),
                )
            })?),
        };
        let transform = attributes
            .remove("transform")
            .map(|source| parse_static_transform_list(&source, "rect"))
            .transpose()
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        reject_unknown(attributes, "rect")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;

        let mut header = Header::new(SizeIntent::Fixed(width), SizeIntent::Fixed(height));
        header.name = id;
        header.x = AxisBinding::start(x);
        header.y = AxisBinding::start(y);
        header.flow = Flow::Absolute;
        header.opacity = opacity;
        let node = self.builder.add(
            self.builder_root(),
            header,
            Payload::Shape {
                desc: ShapeDesc::Rect,
            },
        );
        let record = self.builder.node_mut(node);
        record.fills = fills;
        record.corner_radius = RectangularCornerRadius::all(Radius { rx, ry });
        if let Some(transform) = transform {
            self.static_transforms.insert(node, transform);
            self.static_transform_locations.push(location);
        }
        Ok(node)
    }

    fn parse_path(
        &mut self,
        attributes: &mut BTreeMap<String, String>,
        location: SourceLocation,
    ) -> Result<NodeId, SvgAnimationError> {
        let id = attributes.remove("id");
        let d = attributes.remove("d").ok_or_else(|| {
            SvgAnimationError::new(&self.snapshot, location, "<path> requires non-empty `d`")
        })?;
        let opacity = take_optional_number(attributes, "opacity", 1.0, "opacity on <path>")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        if !(0.0..=1.0).contains(&opacity) {
            return Err(SvgAnimationError::new(
                &self.snapshot,
                location,
                "path opacity must be between 0 and 1 inclusive",
            ));
        }
        let fill_rule = match attributes.remove("fill-rule").as_deref() {
            None | Some("nonzero") => FillRule::NonZero,
            Some("evenodd") => FillRule::EvenOdd,
            Some(value) => {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!("fill-rule on <path> must be `nonzero` or `evenodd`; found `{value}`"),
                ));
            }
        };
        let fills = match attributes.remove("fill").as_deref() {
            None => Paints::solid(Color::BLACK),
            Some("none") => Paints::default(),
            Some(value) => Paints::solid(Color::from_grida_hex(value).ok_or_else(|| {
                SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!("fill on <path> must be `none`, #RGB, or #RRGGBB; found `{value}`"),
                )
            })?),
        };
        let transform = attributes
            .remove("transform")
            .map(|source| parse_static_transform_list(&source, "path"))
            .transpose()
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;
        reject_unknown(attributes, "path")
            .map_err(|message| SvgAnimationError::new(&self.snapshot, location, message))?;

        let viewport = self.viewport.expect("root parsing sets viewport");
        let artifact = normalize_path_artifact(&d, fill_rule, viewport).map_err(|message| {
            SvgAnimationError::new(
                &self.snapshot,
                location,
                format!("invalid d on <path>: {message}"),
            )
        })?;
        let mut header = Header::new(SizeIntent::Fixed(viewport.0), SizeIntent::Fixed(viewport.1));
        header.name = id;
        header.x = AxisBinding::start(0.0);
        header.y = AxisBinding::start(0.0);
        header.flow = Flow::Absolute;
        header.opacity = opacity;
        let node = self.builder.add(
            self.builder_root(),
            header,
            Payload::Shape {
                desc: ShapeDesc::Path(artifact),
            },
        );
        self.builder.node_mut(node).fills = fills;
        if let Some(transform) = transform {
            self.static_transforms.insert(node, transform);
            self.static_transform_locations.push(location);
        }
        Ok(node)
    }

    fn builder_root(&self) -> NodeId {
        // DocBuilder's canonical viewport root is always slot zero.
        0
    }

    fn extract_forbidden_attributes(
        &mut self,
        attributes: &mut BTreeMap<String, String>,
        location: SourceLocation,
    ) {
        let event_attributes = attributes
            .keys()
            .filter(|name| name.starts_with("on"))
            .cloned()
            .collect::<Vec<_>>();
        for name in event_attributes {
            attributes.remove(&name);
            self.forbidden.push(ForbiddenSite {
                location,
                message: format!("event-handler attribute `{name}` is forbidden while sampling"),
            });
        }
        if let Some(style) = attributes.get("style") {
            let lower = style.to_ascii_lowercase();
            if lower.contains("animation") || lower.contains("transition") {
                attributes.remove("style");
                self.forbidden.push(ForbiddenSite {
                    location,
                    message: "CSS animation or transition declarations are outside the SVG animation profile"
                        .into(),
                });
            }
        }
    }

    fn character_data(
        &self,
        text: &str,
        location: SourceLocation,
    ) -> Result<(), SvgAnimationError> {
        if text.chars().all(is_xml_space) {
            return Ok(());
        }
        let context = self
            .stack
            .last()
            .map(|element| format!("<{}>", element.name()))
            .unwrap_or_else(|| "the document".into());
        Err(SvgAnimationError::new(
            &self.snapshot,
            location,
            format!("character content is not supported in {context}"),
        ))
    }
}

fn is_svg_namespace(namespace: &ResolveResult<'_>) -> bool {
    matches!(namespace, ResolveResult::Bound(namespace) if namespace.as_ref() == SVG_NAMESPACE.as_bytes())
}

fn local_name(name: &[u8]) -> String {
    let local = name
        .iter()
        .rposition(|byte| *byte == b':')
        .map_or(name, |index| &name[index + 1..]);
    String::from_utf8_lossy(local).into_owned()
}

fn collect_attributes(element: &BytesStart<'_>) -> Result<BTreeMap<String, String>, String> {
    let mut attributes = BTreeMap::new();
    for attribute in element.attributes() {
        let attribute = attribute.map_err(|error| format!("invalid attribute: {error}"))?;
        let name = String::from_utf8_lossy(attribute.key.as_ref()).into_owned();
        if name == "xmlns" || name.starts_with("xmlns:") {
            continue;
        }
        let value = attribute
            .unescape_value()
            .map_err(|error| format!("invalid value for `{name}`: {error}"))?
            .into_owned();
        if attributes.insert(name.clone(), value).is_some() {
            return Err(format!("duplicate attribute `{name}`"));
        }
    }
    Ok(attributes)
}

fn required<'a>(
    attributes: &mut AttributeView<'a>,
    name: &str,
    label: &str,
) -> Result<&'a str, String> {
    attributes
        .remove(name)
        .ok_or_else(|| format!("{label} requires `{name}`"))
}

fn reject_unknown(attributes: &BTreeMap<String, String>, element: &str) -> Result<(), String> {
    if let Some(name) = attributes.keys().next() {
        return Err(format!(
            "unknown attribute `{name}` on the identity-preserving <{element}> materializer"
        ));
    }
    Ok(())
}

fn take_number(
    attributes: &mut BTreeMap<String, String>,
    name: &str,
    label: &str,
) -> Result<f32, String> {
    let value = attributes
        .remove(name)
        .ok_or_else(|| format!("{label} is required"))?;
    parse_svg_number(&value, label)
}

fn take_optional_number(
    attributes: &mut BTreeMap<String, String>,
    name: &str,
    default: f32,
    label: &str,
) -> Result<f32, String> {
    match attributes.remove(name) {
        Some(value) => parse_svg_number(&value, label),
        None => Ok(default),
    }
}

fn take_optional_number_option(
    attributes: &mut BTreeMap<String, String>,
    name: &str,
    label: &str,
) -> Result<Option<f32>, String> {
    attributes
        .remove(name)
        .map(|value| parse_svg_number(&value, label))
        .transpose()
}

fn parse_fragment(href: &str) -> Result<&str, String> {
    let Some(fragment) = href.strip_prefix('#') else {
        return Err(format!(
            "href must be a bare same-document fragment such as `#card`; found `{href}`"
        ));
    };
    if fragment.is_empty()
        || fragment.chars().any(char::is_whitespace)
        || fragment
            .chars()
            .any(|character| matches!(character, '#' | '/' | '?'))
    {
        return Err(format!(
            "href must be a bare same-document fragment such as `#card`; found `{href}`"
        ));
    }
    Ok(fragment)
}

fn parse_static_transform_list(source: &str, element: &str) -> Result<Vec<LensOp>, String> {
    TransformListParser::from(source)
        .enumerate()
        .map(|(index, token)| {
            let token = token.map_err(|error| {
                format!("invalid transform item {index} on <{element}>: {error}")
            })?;
            let matrix = match token {
                TransformListToken::Matrix { a, b, c, d, e, f } => Affine {
                    a: transform_number(a, index, element)?,
                    b: transform_number(b, index, element)?,
                    c: transform_number(c, index, element)?,
                    d: transform_number(d, index, element)?,
                    e: transform_number(e, index, element)?,
                    f: transform_number(f, index, element)?,
                },
                TransformListToken::Translate { tx, ty } => Affine::translate(
                    transform_number(tx, index, element)?,
                    transform_number(ty, index, element)?,
                ),
                TransformListToken::Scale { sx, sy } => Affine::scale(
                    transform_number(sx, index, element)?,
                    transform_number(sy, index, element)?,
                ),
                TransformListToken::Rotate { angle } => {
                    Affine::rotate_deg(transform_number(angle, index, element)?)
                }
                TransformListToken::SkewX { angle } => {
                    Affine::skew_deg(transform_number(angle, index, element)?, 0.0)
                }
                TransformListToken::SkewY { angle } => {
                    Affine::skew_deg(0.0, transform_number(angle, index, element)?)
                }
            };
            let m = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
            m.iter()
                .all(|value| value.is_finite())
                .then_some(LensOp::Matrix { m })
                .ok_or_else(|| {
                    format!(
                        "transform item {index} on <{element}> produces a non-finite affine value"
                    )
                })
        })
        .collect()
}

fn transform_number(value: f64, index: usize, element: &str) -> Result<f32, String> {
    let value = value as f32;
    value
        .is_finite()
        .then_some(value)
        .ok_or_else(|| format!("transform item {index} on <{element}> is outside finite binary32"))
}

fn parse_svg_number(source: &str, label: &str) -> Result<f32, String> {
    let source = source.trim_matches(is_xml_space);
    if source.is_empty() || !has_svg_number_syntax(source.as_bytes()) {
        return Err(format!(
            "{label} must be one finite unitless SVG number; found {}",
            observed_token(source)
        ));
    }
    let value = source.parse::<f32>().map_err(|_| {
        format!(
            "{label} is outside the binary32 number domain; found {}",
            observed_token(source)
        )
    })?;
    if !value.is_finite() {
        return Err(format!(
            "{label} must be finite binary32; found {}",
            observed_token(source)
        ));
    }
    Ok(value)
}

fn observed_token(source: &str) -> String {
    const PREFIX_CHARACTERS: usize = 64;
    let prefix = source.chars().take(PREFIX_CHARACTERS).collect::<String>();
    if prefix.len() == source.len() {
        format!("{prefix:?}")
    } else {
        format!("{prefix:?}… ({} bytes)", source.len())
    }
}

fn has_svg_number_syntax(bytes: &[u8]) -> bool {
    svg_number_end(bytes, 0) == Some(bytes.len())
}

fn svg_number_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut index = start;
    if matches!(bytes.get(index), Some(b'+') | Some(b'-')) {
        index += 1;
    }
    let integer_start = index;
    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
        index += 1;
    }
    let integer_digits = index - integer_start;
    let mut fraction_digits = 0;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        let fraction_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        fraction_digits = index - fraction_start;
    }
    if integer_digits == 0 && fraction_digits == 0 {
        return None;
    }
    if matches!(bytes.get(index), Some(b'e') | Some(b'E')) {
        index += 1;
        if matches!(bytes.get(index), Some(b'+') | Some(b'-')) {
            index += 1;
        }
        let exponent_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        if exponent_start == index {
            return None;
        }
    }
    Some(index)
}

fn validate_endpoint_domain(
    property: PropertyKey,
    value: f32,
    endpoint: &str,
    label: &str,
) -> Result<(), String> {
    match property {
        PropertyKey::Width | PropertyKey::Height if value < 0.0 => Err(format!(
            "{endpoint} on {label} must be non-negative for size animation; found {value}"
        )),
        PropertyKey::Opacity if !(0.0..=1.0).contains(&value) => Err(format!(
            "{endpoint} on {label} must be between 0 and 1 inclusive; found {value}"
        )),
        _ => Ok(()),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExactDecimalDomain {
    Negative,
    UnitInterval,
    AboveOne,
}

fn exact_decimal_domain(source: &str) -> ExactDecimalDomain {
    debug_assert!(has_svg_number_syntax(source.as_bytes()));
    let exponent_index = source.find(['e', 'E']);
    let (mantissa, exponent_source) = exponent_index
        .map(|index| (&source[..index], Some(&source[index + 1..])))
        .unwrap_or((source, None));
    let negative = mantissa.starts_with('-');
    let mantissa = mantissa.trim_start_matches(['+', '-']);
    let fraction_digits = mantissa
        .split_once('.')
        .map_or(0, |(_, fraction)| fraction.len());

    let mut digit_count = 0_usize;
    let mut first_nonzero = None;
    let mut nonzero_after_first = false;
    for byte in mantissa.bytes().filter(|byte| byte.is_ascii_digit()) {
        if byte != b'0' {
            if first_nonzero.is_some() {
                nonzero_after_first = true;
            } else {
                first_nonzero = Some((digit_count, byte));
            }
        }
        digit_count += 1;
    }
    let Some((first_nonzero_index, first_nonzero_digit)) = first_nonzero else {
        return ExactDecimalDomain::UnitInterval;
    };
    if negative {
        return ExactDecimalDomain::Negative;
    }

    let exponent = exponent_source.map_or(0_i128, |source| {
        source.parse::<i128>().unwrap_or_else(|_| {
            if source.starts_with('-') {
                i128::MIN
            } else {
                i128::MAX
            }
        })
    });
    let significant_digits = digit_count - first_nonzero_index;
    let decimal_order = i128::try_from(significant_digits)
        .unwrap_or(i128::MAX)
        .saturating_add(exponent)
        .saturating_sub(i128::try_from(fraction_digits).unwrap_or(i128::MAX));
    if decimal_order < 1 {
        ExactDecimalDomain::UnitInterval
    } else if decimal_order > 1 || first_nonzero_digit != b'1' || nonzero_after_first {
        ExactDecimalDomain::AboveOne
    } else {
        ExactDecimalDomain::UnitInterval
    }
}

fn validate_authored_endpoint_domain(
    property: PropertyKey,
    source: &str,
    endpoint: &str,
    label: &str,
) -> Result<(), String> {
    let source = source.trim_matches(is_xml_space);
    if !has_svg_number_syntax(source.as_bytes()) {
        return Ok(());
    }
    match (property, exact_decimal_domain(source)) {
        (PropertyKey::Width | PropertyKey::Height, ExactDecimalDomain::Negative) => Err(format!(
            "{endpoint} on {label} must be non-negative for size animation before binary32 rounding; found {}",
            observed_token(source)
        )),
        (PropertyKey::Opacity, ExactDecimalDomain::Negative | ExactDecimalDomain::AboveOne) => {
            Err(format!(
                "{endpoint} on {label} must be between 0 and 1 inclusive before binary32 rounding; found {}",
                observed_token(source)
            ))
        }
        _ => Ok(()),
    }
}

const MAX_KEYFRAMES_PER_TRACK: usize = 4_096;
const MAX_SPLINES_PER_TRACK: usize = MAX_KEYFRAMES_PER_TRACK - 1;
const MAX_EXACT_TOKEN_BYTES: usize = 128;
const MAX_EXACT_DECIMAL_EXPONENT: i32 = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CalcMode {
    Linear,
    Spline,
}

enum CompiledEffect {
    Scalar {
        property: PropertyKey,
        effect: CompiledScalarEffect,
    },
    Color(CompiledColorEffect),
    Transform(TransformCurve),
    Path(CompiledPathEffect),
}

enum CompiledScalarEffect {
    Curve(ScalarCurve),
    To { target: f32, easing: Easing },
}

enum CompiledColorEffect {
    Curve(ColorCurve),
    To { target: Color, easing: Easing },
}

enum CompiledPathEffect {
    Smooth(PathCurve),
    Discrete(DiscreteCurve),
    Fallback {
        from: Arc<PathGeometry>,
        to: Arc<PathGeometry>,
        easing: Easing,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SvgPathCommandKind {
    Move,
    Line,
    Horizontal,
    Vertical,
    Cubic,
    SmoothCubic,
    Quadratic,
    SmoothQuadratic,
    Arc,
    Close,
}

struct ParsedPathValue {
    geometry: Arc<PathGeometry>,
    topology: Vec<SvgPathCommandKind>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PathCalcMode {
    Linear,
    Spline,
    Discrete,
}

fn compile_path_effect(
    attributes: &mut AttributeView<'_>,
    label: &str,
    viewport: (f32, f32),
) -> Result<CompiledPathEffect, String> {
    let calc_mode = match attributes.remove("calcMode") {
        None | Some("linear") => PathCalcMode::Linear,
        Some("spline") => PathCalcMode::Spline,
        Some("discrete") => PathCalcMode::Discrete,
        Some("paced") => {
            return Err(format!(
                "calcMode=`paced` on {label} is valid SVG but deferred for path geometry; use linear, spline, or discrete"
            ));
        }
        Some(value) => {
            return Err(format!(
                "calcMode on {label} must be linear, spline, or discrete; found `{value}`"
            ));
        }
    };

    let values_form = attributes.contains_key("values");
    let values = if let Some(source) = attributes.remove("values") {
        attributes.remove("from");
        attributes.remove("to");
        semicolon_entries(source, "values", label, MAX_KEYFRAMES_PER_TRACK)?
            .into_iter()
            .enumerate()
            .map(|(index, source)| {
                parse_path_value(source, &format!("values[{index}] on {label}"), viewport)
            })
            .collect::<Result<Vec<_>, _>>()?
    } else {
        if !attributes.contains_key("from") && attributes.contains_key("to") {
            return Err(format!(
                "a lone `to` on {label} is deferred for path geometry; provide both from and to"
            ));
        }
        let from = required(attributes, "from", label)?;
        let to = required(attributes, "to", label)?;
        vec![
            parse_path_value(from, &format!("from on {label}"), viewport)?,
            parse_path_value(to, &format!("to on {label}"), viewport)?,
        ]
    };

    if calc_mode == PathCalcMode::Discrete {
        if attributes.remove("keySplines").is_some() {
            return Err(format!(
                "keySplines on discrete path animation {label} is not meaningful and is rejected"
            ));
        }
        let offsets = if values.len() == 1 {
            if attributes.remove("keyTimes").is_some() {
                return Err(format!(
                    "a one-value discrete path constant on {label} does not accept keyTimes"
                ));
            }
            vec![KeyframeOffset::ZERO]
        } else {
            match attributes.remove("keyTimes") {
                Some(source) => parse_key_times(source, values.len(), label)?,
                None => discrete_offsets(values.len())?,
            }
        };
        let keyframes = offsets
            .into_iter()
            .zip(values)
            .map(|(offset, value)| {
                DiscreteKeyframe::new(
                    offset,
                    crate::properties::PropertyValue::PathGeometry(value.geometry),
                )
            })
            .collect();
        return DiscreteCurve::new(keyframes)
            .map(CompiledPathEffect::Discrete)
            .map_err(|error| format!("invalid discrete path keyframes on {label}: {error}"));
    }

    if let Some((value_index, command_index)) =
        values.iter().enumerate().find_map(|(value_index, value)| {
            value
                .topology
                .iter()
                .position(|kind| *kind == SvgPathCommandKind::Arc)
                .map(|command_index| (value_index, command_index))
        })
    {
        return Err(format!(
            "smooth path animation on {label} value {value_index} command {command_index} contains A/a; SVG arc-parameter interpolation is deferred and renderer-lowered conics are never interpolated—use calcMode=`discrete`"
        ));
    }
    if values.len() == 1 {
        if calc_mode == PathCalcMode::Spline {
            return Err(format!(
                "a one-value path constant on {label} does not accept calcMode=`spline`"
            ));
        }
        if attributes.remove("keyTimes").is_some() {
            return Err(format!(
                "a one-value path constant on {label} does not accept keyTimes"
            ));
        }
        if attributes.remove("keySplines").is_some() {
            return Err(format!(
                "a one-value path constant on {label} does not accept keySplines"
            ));
        }
        return PathCurve::constant(Arc::clone(&values[0].geometry))
            .map(CompiledPathEffect::Smooth)
            .map_err(|error| format!("invalid path constant on {label}: {error}"));
    }

    let mismatch = values
        .iter()
        .enumerate()
        .skip(1)
        .find_map(|(value_index, value)| {
            first_topology_mismatch(&values[0].topology, &value.topology).map(
                |(command_index, expected, actual)| (value_index, command_index, expected, actual),
            )
        });
    let curve_mode = match calc_mode {
        PathCalcMode::Linear => CalcMode::Linear,
        PathCalcMode::Spline => CalcMode::Spline,
        PathCalcMode::Discrete => unreachable!(),
    };
    if let Some((value_index, command_index, expected, actual)) = mismatch {
        if values_form {
            return Err(format!(
                "smooth values on {label} have different expanded SVG command-family topology at value {value_index}, command {command_index}: expected {expected}, found {actual}; declare calcMode=`discrete`"
            ));
        }
        let (offsets, easings) = curve_offsets_and_easings(curve_mode, attributes, 2, label)?;
        if offsets != [KeyframeOffset::ZERO, KeyframeOffset::ONE] {
            return Err(format!(
                "automatic incompatible-path fallback on {label} requires keyTimes=`0;1`"
            ));
        }
        let mut values = values.into_iter();
        let from = values.next().expect("from/to has two values").geometry;
        let to = values.next().expect("from/to has two values").geometry;
        return Ok(CompiledPathEffect::Fallback {
            from,
            to,
            easing: easings
                .into_iter()
                .next()
                .expect("one interval has one easing"),
        });
    }

    let (offsets, easings) =
        curve_offsets_and_easings(curve_mode, attributes, values.len(), label)?;
    let mut values = values.into_iter();
    let first_value = values.next().expect("path effect has at least one value");
    let first = PathKeyframe::new(offsets[0], first_value.geometry);
    let segments = easings
        .into_iter()
        .zip(offsets.into_iter().skip(1).zip(values))
        .map(|(easing, (offset, value))| {
            PathSegment::new(easing, PathKeyframe::new(offset, value.geometry))
        })
        .collect();
    PathCurve::new(first, segments)
        .map(CompiledPathEffect::Smooth)
        .map_err(|error| format!("invalid smooth path keyframes on {label}: {error}"))
}

fn first_topology_mismatch(
    expected: &[SvgPathCommandKind],
    actual: &[SvgPathCommandKind],
) -> Option<(usize, String, String)> {
    let shared = expected.len().min(actual.len());
    for index in 0..shared {
        if expected[index] != actual[index] {
            return Some((
                index,
                format!("{:?}", expected[index]),
                format!("{:?}", actual[index]),
            ));
        }
    }
    (expected.len() != actual.len()).then(|| {
        let expected = expected
            .get(shared)
            .map_or("end of path".to_owned(), |kind| format!("{kind:?}"));
        let actual = actual
            .get(shared)
            .map_or("end of path".to_owned(), |kind| format!("{kind:?}"));
        (shared, expected, actual)
    })
}

fn parse_path_value(
    source: &str,
    label: &str,
    viewport: (f32, f32),
) -> Result<ParsedPathValue, String> {
    let source = source.trim_matches(is_xml_space);
    if source.is_empty() || source == "none" {
        return Err(format!("{label} must be non-empty SVG path data"));
    }
    let topology = PathParser::from(source)
        .map(|segment| {
            segment
                .map(|segment| match segment {
                    SvgPathSegment::MoveTo { .. } => SvgPathCommandKind::Move,
                    SvgPathSegment::LineTo { .. } => SvgPathCommandKind::Line,
                    SvgPathSegment::HorizontalLineTo { .. } => SvgPathCommandKind::Horizontal,
                    SvgPathSegment::VerticalLineTo { .. } => SvgPathCommandKind::Vertical,
                    SvgPathSegment::CurveTo { .. } => SvgPathCommandKind::Cubic,
                    SvgPathSegment::SmoothCurveTo { .. } => SvgPathCommandKind::SmoothCubic,
                    SvgPathSegment::Quadratic { .. } => SvgPathCommandKind::Quadratic,
                    SvgPathSegment::SmoothQuadratic { .. } => SvgPathCommandKind::SmoothQuadratic,
                    SvgPathSegment::EllipticalArc { .. } => SvgPathCommandKind::Arc,
                    SvgPathSegment::ClosePath { .. } => SvgPathCommandKind::Close,
                })
                .map_err(|error| format!("invalid SVG path data in {label}: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let geometry = normalize_path_geometry(source, viewport)
        .map_err(|message| format!("{label}: {message}"))?;
    Ok(ParsedPathValue { geometry, topology })
}

fn normalize_path_geometry(
    source: &str,
    viewport: (f32, f32),
) -> Result<Arc<PathGeometry>, String> {
    let (width, height) = viewport;
    path::analyze_geometry_in_reference_box(Arc::<str>::from(source), width, height)
        .map_err(|error| error.to_string())
}

fn normalize_path_artifact(
    source: &str,
    fill_rule: FillRule,
    viewport: (f32, f32),
) -> Result<Arc<PathArtifact>, String> {
    let (width, height) = viewport;
    path::analyze_in_reference_box(Arc::<str>::from(source), fill_rule, width, height)
        .map_err(|error| error.to_string())
}

fn discrete_offsets(value_count: usize) -> Result<Vec<KeyframeOffset>, String> {
    let denominator = u64::try_from(value_count)
        .map_err(|_| "discrete keyframe count exceeds the exact offset domain".to_string())?;
    (0..value_count)
        .map(|index| {
            let numerator = u64::try_from(index).map_err(|_| {
                "discrete keyframe index exceeds the exact offset domain".to_string()
            })?;
            KeyframeOffset::new(numerator, denominator).map_err(|error| error.to_string())
        })
        .collect()
}

fn compile_scalar_effect(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    property: PropertyKey,
    label: &str,
) -> Result<CompiledScalarEffect, String> {
    let is_lone_to = !attributes.contains_key("values")
        && !attributes.contains_key("from")
        && attributes.contains_key("to");
    if !is_lone_to {
        return compile_scalar_curve(profile, attributes, property, label)
            .map(CompiledScalarEffect::Curve);
    }
    if !profile.supports_typed_effects() {
        return Err(format!(
            "a lone `to` on {label} is unsupported by {}; both from and to are required",
            profile.name()
        ));
    }

    let calc_mode = parse_calc_mode(profile, attributes, label)?;
    let to_source = required(attributes, "to", label)?;
    validate_authored_endpoint_domain(property, to_source, "to", label)?;
    let target = parse_svg_number(to_source, &format!("to on {label}"))?;
    validate_endpoint_domain(property, target, "to", label)?;
    if let Some(source) = attributes.remove("keyTimes") {
        let offsets = parse_key_times(source, 2, label)?;
        if offsets != [KeyframeOffset::ZERO, KeyframeOffset::ONE] {
            return Err(format!("keyTimes on lone-to {label} must be exactly `0;1`"));
        }
    }
    let easing = lone_to_easing(calc_mode, attributes, label)?;
    Ok(CompiledScalarEffect::To { target, easing })
}

fn compile_color_effect(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    label: &str,
) -> Result<CompiledColorEffect, String> {
    let is_lone_to = !attributes.contains_key("values")
        && !attributes.contains_key("from")
        && attributes.contains_key("to");
    if !is_lone_to {
        return compile_color_curve(profile, attributes, label).map(CompiledColorEffect::Curve);
    }

    let calc_mode = parse_calc_mode(profile, attributes, label)?;
    let target = parse_animation_color(required(attributes, "to", label)?, "to", label)?;
    if let Some(source) = attributes.remove("keyTimes") {
        let offsets = parse_key_times(source, 2, label)?;
        if offsets != [KeyframeOffset::ZERO, KeyframeOffset::ONE] {
            return Err(format!("keyTimes on lone-to {label} must be exactly `0;1`"));
        }
    }
    let easing = lone_to_easing(calc_mode, attributes, label)?;
    Ok(CompiledColorEffect::To { target, easing })
}

fn lone_to_easing(
    calc_mode: CalcMode,
    attributes: &mut AttributeView<'_>,
    label: &str,
) -> Result<Easing, String> {
    match calc_mode {
        CalcMode::Linear => {
            if let Some(source) = attributes.remove("keySplines") {
                parse_key_splines(source, None, label)?;
            }
            Ok(Easing::Linear)
        }
        CalcMode::Spline => {
            let source = required(attributes, "keySplines", label)?;
            Ok(Easing::CubicBezier(
                parse_key_splines(source, Some(1), label)?
                    .into_iter()
                    .next()
                    .expect("one spline was required"),
            ))
        }
    }
}

fn parse_calc_mode(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    label: &str,
) -> Result<CalcMode, String> {
    match attributes.remove("calcMode") {
        None | Some("linear") => Ok(CalcMode::Linear),
        Some("spline") if profile.supports_keyframes() => Ok(CalcMode::Spline),
        Some("discrete" | "paced") if profile.supports_keyframes() => Err(format!(
            "calcMode on {label} is valid SVG but unsupported by {}; expected `linear` or `spline`",
            profile.name()
        )),
        Some(value) => Err(format!(
            "calcMode on {label} must be `linear`{}; found `{value}`",
            if profile.supports_keyframes() {
                " or `spline`"
            } else {
                ""
            }
        )),
    }
}

fn compile_scalar_curve(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    property: PropertyKey,
    label: &str,
) -> Result<ScalarCurve, String> {
    let calc_mode = parse_calc_mode(profile, attributes, label)?;

    let values_source = attributes.remove("values");
    let values = if let Some(values_source) = values_source {
        if !profile.supports_keyframes() {
            return Err(format!("values is unsupported on {label} in Profile 0"));
        }
        // SVG selects `values` by presence. from/to are ignored even when the
        // selected list later fails validation.
        attributes.remove("from");
        attributes.remove("to");
        parse_animation_values(values_source, property, label)?
    } else {
        let from_source = required(attributes, "from", label)?;
        let to_source = required(attributes, "to", label)?;
        validate_authored_endpoint_domain(property, from_source, "from", label)?;
        validate_authored_endpoint_domain(property, to_source, "to", label)?;
        let from = parse_svg_number(from_source, &format!("from on {label}"))?;
        let to = parse_svg_number(to_source, &format!("to on {label}"))?;
        validate_endpoint_domain(property, from, "from", label)?;
        validate_endpoint_domain(property, to, "to", label)?;
        vec![from, to]
    };

    if values.len() == 1 {
        if calc_mode == CalcMode::Spline {
            return Err(format!(
                "a one-value constant on {label} does not accept calcMode=`spline`"
            ));
        }
        if attributes.remove("keyTimes").is_some() {
            return Err(format!(
                "a one-value constant on {label} does not accept keyTimes"
            ));
        }
        if attributes.remove("keySplines").is_some() {
            return Err(format!(
                "a one-value constant on {label} does not accept keySplines"
            ));
        }
        return Ok(ScalarCurve::constant(values[0]));
    }

    let (offsets, easings) = curve_offsets_and_easings(calc_mode, attributes, values.len(), label)?;

    let first = ScalarKeyframe::new(offsets[0], values[0]);
    let segments = easings
        .into_iter()
        .zip(offsets.into_iter().skip(1).zip(values.into_iter().skip(1)))
        .map(|(easing, (offset, value))| {
            ScalarSegment::new(easing, ScalarKeyframe::new(offset, value))
        })
        .collect();
    ScalarCurve::new(first, segments)
        .map_err(|error| format!("invalid keyframes on {label}: {error}"))
}

fn compile_color_curve(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    label: &str,
) -> Result<ColorCurve, String> {
    let calc_mode = parse_calc_mode(profile, attributes, label)?;
    let values = if let Some(source) = attributes.remove("values") {
        attributes.remove("from");
        attributes.remove("to");
        semicolon_entries(source, "values", label, MAX_KEYFRAMES_PER_TRACK)?
            .into_iter()
            .enumerate()
            .map(|(index, source)| {
                parse_animation_color(source, &format!("values[{index}]"), label)
            })
            .collect::<Result<Vec<_>, _>>()?
    } else {
        vec![
            parse_animation_color(required(attributes, "from", label)?, "from", label)?,
            parse_animation_color(required(attributes, "to", label)?, "to", label)?,
        ]
    };

    if values.len() == 1 {
        if calc_mode == CalcMode::Spline {
            return Err(format!(
                "a one-value constant on {label} does not accept calcMode=`spline`"
            ));
        }
        if attributes.remove("keyTimes").is_some() {
            return Err(format!(
                "a one-value constant on {label} does not accept keyTimes"
            ));
        }
        if attributes.remove("keySplines").is_some() {
            return Err(format!(
                "a one-value constant on {label} does not accept keySplines"
            ));
        }
        return Ok(ColorCurve::constant(values[0]));
    }

    let (offsets, easings) = curve_offsets_and_easings(calc_mode, attributes, values.len(), label)?;
    let first = ColorKeyframe::new(offsets[0], values[0]);
    let segments = easings
        .into_iter()
        .zip(offsets.into_iter().skip(1).zip(values.into_iter().skip(1)))
        .map(|(easing, (offset, color))| {
            ColorSegment::new(easing, ColorKeyframe::new(offset, color))
        })
        .collect();
    ColorCurve::new(first, segments)
        .map_err(|error| format!("invalid color keyframes on {label}: {error}"))
}

fn curve_offsets_and_easings(
    calc_mode: CalcMode,
    attributes: &mut AttributeView<'_>,
    value_count: usize,
    label: &str,
) -> Result<(Vec<KeyframeOffset>, Vec<Easing>), String> {
    let offsets = match attributes.remove("keyTimes") {
        Some(source) => parse_key_times(source, value_count, label)?,
        None => evenly_spaced_offsets(value_count)?,
    };
    let easings = match calc_mode {
        CalcMode::Linear => {
            if let Some(source) = attributes.remove("keySplines") {
                // SVG ignores keySplines outside spline mode, but the strict
                // source profile still refuses malformed attribute syntax.
                parse_key_splines(source, None, label)?;
            }
            vec![Easing::Linear; value_count - 1]
        }
        CalcMode::Spline => {
            let source = required(attributes, "keySplines", label)?;
            parse_key_splines(source, Some(value_count - 1), label)?
                .into_iter()
                .map(Easing::CubicBezier)
                .collect()
        }
    };
    Ok((offsets, easings))
}

fn compile_transform_curve(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    label: &str,
) -> Result<TransformCurve, String> {
    let kind = match attributes.remove("type") {
        None | Some("translate") => TransformKind::Translate,
        Some("scale") => TransformKind::Scale,
        Some("rotate") => TransformKind::Rotate,
        Some("skewX" | "skewY") => {
            return Err(format!(
                "type on {label} is valid SVG but deferred by {}; expected translate, scale, or rotate",
                profile.name()
            ));
        }
        Some(value) => {
            return Err(format!(
                "type on {label} must be translate, scale, or rotate; found `{value}`"
            ));
        }
    };
    let calc_mode = parse_calc_mode(profile, attributes, label)?;
    let values_source = attributes.remove("values");
    let values = if let Some(source) = values_source {
        attributes.remove("from");
        attributes.remove("to");
        semicolon_entries(source, "values", label, MAX_KEYFRAMES_PER_TRACK)?
            .into_iter()
            .enumerate()
            .map(|(index, source)| {
                parse_transform_value(kind, source, &format!("values[{index}] on {label}"))
            })
            .collect::<Result<Vec<_>, _>>()?
    } else {
        if !attributes.contains_key("from") && attributes.contains_key("to") {
            return Err(format!(
                "a lone `to` on {label} is undefined by SVG and rejected by {}; provide both from and to",
                profile.name()
            ));
        }
        let from = required(attributes, "from", label)?;
        let to = required(attributes, "to", label)?;
        vec![
            parse_transform_value(kind, from, &format!("from on {label}"))?,
            parse_transform_value(kind, to, &format!("to on {label}"))?,
        ]
    };

    if values.len() == 1 {
        if calc_mode == CalcMode::Spline {
            return Err(format!(
                "a one-value transform constant on {label} does not accept calcMode=`spline`"
            ));
        }
        if attributes.remove("keyTimes").is_some() {
            return Err(format!(
                "a one-value transform constant on {label} does not accept keyTimes"
            ));
        }
        if attributes.remove("keySplines").is_some() {
            return Err(format!(
                "a one-value transform constant on {label} does not accept keySplines"
            ));
        }
        return TransformCurve::constant(values[0])
            .map_err(|error| format!("invalid transform constant on {label}: {error}"));
    }

    let offsets = match attributes.remove("keyTimes") {
        Some(source) => parse_key_times(source, values.len(), label)?,
        None => evenly_spaced_offsets(values.len())?,
    };
    let easings = match calc_mode {
        CalcMode::Linear => {
            if let Some(source) = attributes.remove("keySplines") {
                parse_key_splines(source, None, label)?;
            }
            vec![Easing::Linear; values.len() - 1]
        }
        CalcMode::Spline => {
            let source = required(attributes, "keySplines", label)?;
            parse_key_splines(source, Some(values.len() - 1), label)?
                .into_iter()
                .map(Easing::CubicBezier)
                .collect()
        }
    };
    let first = TransformKeyframe::new(offsets[0], values[0]);
    let segments = easings
        .into_iter()
        .zip(offsets.into_iter().skip(1).zip(values.into_iter().skip(1)))
        .map(|(easing, (offset, value))| {
            TransformSegment::new(easing, TransformKeyframe::new(offset, value))
        })
        .collect();
    TransformCurve::new(first, segments)
        .map_err(|error| format!("invalid transform keyframes on {label}: {error}"))
}

fn parse_transform_value(
    kind: TransformKind,
    source: &str,
    label: &str,
) -> Result<TransformValue, String> {
    let values = parse_svg_number_sequence(source, label, 3)?;
    match (kind, values.as_slice()) {
        (TransformKind::Translate, [x]) => Ok(TransformValue::Translate { x: *x, y: 0.0 }),
        (TransformKind::Translate, [x, y]) => Ok(TransformValue::Translate { x: *x, y: *y }),
        (TransformKind::Scale, [value]) => Ok(TransformValue::Scale {
            x: *value,
            y: *value,
        }),
        (TransformKind::Scale, [x, y]) => Ok(TransformValue::Scale { x: *x, y: *y }),
        (TransformKind::Rotate, [degrees]) => Ok(TransformValue::Rotate {
            degrees: *degrees,
            center_x: 0.0,
            center_y: 0.0,
        }),
        (TransformKind::Rotate, [degrees, center_x, center_y]) => Ok(TransformValue::Rotate {
            degrees: *degrees,
            center_x: *center_x,
            center_y: *center_y,
        }),
        (TransformKind::Translate, _) => Err(format!(
            "{label} requires one or two translate components, found {}",
            values.len()
        )),
        (TransformKind::Scale, _) => Err(format!(
            "{label} requires one or two scale components, found {}",
            values.len()
        )),
        (TransformKind::Rotate, _) => Err(format!(
            "{label} requires one angle or angle plus two center coordinates, found {} components",
            values.len()
        )),
    }
}

fn parse_animation_values(
    source: &str,
    property: PropertyKey,
    label: &str,
) -> Result<Vec<f32>, String> {
    let entries = semicolon_entries(source, "values", label, MAX_KEYFRAMES_PER_TRACK)?;
    entries
        .into_iter()
        .enumerate()
        .map(|(index, source)| {
            let endpoint = format!("values[{index}]");
            validate_authored_endpoint_domain(property, source, &endpoint, label)?;
            let value = parse_svg_number(source, &format!("{endpoint} on {label}"))?;
            validate_endpoint_domain(property, value, &endpoint, label)?;
            Ok(value)
        })
        .collect()
}

fn parse_animation_color(source: &str, endpoint: &str, label: &str) -> Result<Color, String> {
    let source = source.trim_matches(is_xml_space);
    let Some(hex) = source.strip_prefix('#') else {
        return Err(format!(
            "{endpoint} on {label} must be a solid legacy-sRGB color written as #RGB, #RGBA, #RRGGBB, or #RRGGBBAA; found `{source}`"
        ));
    };
    if !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!(
            "{endpoint} on {label} contains a non-hexadecimal color digit; found `{source}`"
        ));
    }

    let parse_pair = |pair: &str| u8::from_str_radix(pair, 16).expect("validated hexadecimal pair");
    let parse_nibble = |nibble: u8| {
        let value = char::from(nibble)
            .to_digit(16)
            .expect("validated hexadecimal nibble") as u8;
        value * 17
    };
    let (red, green, blue, alpha) = match hex.len() {
        3 => {
            let bytes = hex.as_bytes();
            (
                parse_nibble(bytes[0]),
                parse_nibble(bytes[1]),
                parse_nibble(bytes[2]),
                255,
            )
        }
        4 => {
            let bytes = hex.as_bytes();
            (
                parse_nibble(bytes[0]),
                parse_nibble(bytes[1]),
                parse_nibble(bytes[2]),
                parse_nibble(bytes[3]),
            )
        }
        6 => (
            parse_pair(&hex[0..2]),
            parse_pair(&hex[2..4]),
            parse_pair(&hex[4..6]),
            255,
        ),
        8 => (
            parse_pair(&hex[0..2]),
            parse_pair(&hex[2..4]),
            parse_pair(&hex[4..6]),
            parse_pair(&hex[6..8]),
        ),
        _ => {
            return Err(format!(
                "{endpoint} on {label} must be #RGB, #RGBA, #RRGGBB, or #RRGGBBAA; found `{source}`"
            ));
        }
    };
    Ok(Color(
        (u32::from(alpha) << 24)
            | (u32::from(red) << 16)
            | (u32::from(green) << 8)
            | u32::from(blue),
    ))
}

fn parse_key_times(
    source: &str,
    value_count: usize,
    label: &str,
) -> Result<Vec<KeyframeOffset>, String> {
    let entries = semicolon_entries(source, "keyTimes", label, MAX_KEYFRAMES_PER_TRACK)?;
    if entries.len() != value_count {
        return Err(format!(
            "keyTimes on {label} has {} entries; values has {value_count}",
            entries.len()
        ));
    }
    entries
        .into_iter()
        .enumerate()
        .map(|(index, source)| {
            parse_keyframe_offset(source, &format!("keyTimes[{index}] on {label}"))
        })
        .collect()
}

fn evenly_spaced_offsets(value_count: usize) -> Result<Vec<KeyframeOffset>, String> {
    let denominator = u64::try_from(value_count - 1)
        .map_err(|_| "keyframe count exceeds the exact offset domain".to_string())?;
    (0..value_count)
        .map(|index| {
            let numerator = u64::try_from(index)
                .map_err(|_| "keyframe index exceeds the exact offset domain".to_string())?;
            KeyframeOffset::new(numerator, denominator).map_err(|error| error.to_string())
        })
        .collect()
}

fn parse_key_splines(
    source: &str,
    expected_count: Option<usize>,
    label: &str,
) -> Result<Vec<CubicBezier>, String> {
    let entries = semicolon_entries(source, "keySplines", label, MAX_SPLINES_PER_TRACK)?;
    if let Some(expected_count) = expected_count {
        if entries.len() != expected_count {
            return Err(format!(
                "keySplines on {label} has {} entries; {expected_count} required for the keyframe intervals",
                entries.len()
            ));
        }
    }
    entries
        .into_iter()
        .enumerate()
        .map(|(index, source)| {
            let control_label = format!("keySplines[{index}] on {label}");
            let controls = parse_svg_number_list(source, &control_label)?;
            let [x1, y1, x2, y2] = controls.as_slice() else {
                return Err(format!(
                    "keySplines[{index}] on {label} requires exactly four controls, found {}",
                    controls.len()
                ));
            };
            for (name, value) in [("x1", x1), ("y1", y1), ("x2", x2), ("y2", y2)] {
                if !value.is_finite() || !(0.0..=1.0).contains(value) {
                    return Err(format!(
                        "keySplines[{index}].{name} on {label} must be finite and inside [0, 1]; found {value}"
                    ));
                }
            }
            CubicBezier::new(*x1, *y1, *x2, *y2)
                .map_err(|error| format!("invalid keySplines[{index}] on {label}: {error}"))
        })
        .collect()
}

/// Parse an SVG number list while preserving each authored token's direct
/// decimal-to-binary32 rounding. The local grammar scan establishes token
/// boundaries without an intermediate binary64 value that could double-round.
fn parse_svg_number_list(source: &str, label: &str) -> Result<Vec<f32>, String> {
    let bytes = source.as_bytes();
    let mut position = 0;
    let mut values = Vec::new();

    loop {
        while bytes
            .get(position)
            .is_some_and(|byte| is_xml_space_byte(*byte))
        {
            position += 1;
        }
        if position == bytes.len() {
            break;
        }
        if values.len() == 4 {
            return Err(format!(
                "{label} requires exactly four controls; found at least five"
            ));
        }

        let start = position;
        let control_index = values.len();
        let end = svg_number_end(bytes, start).ok_or_else(|| {
            let observed = source[start..].chars().next().unwrap_or_default();
            format!(
                "{label} control {control_index} must be an SVG number; found `{observed}` at tuple byte {start}"
            )
        })?;
        if end - start > MAX_EXACT_TOKEN_BYTES {
            return Err(format!(
                "{label} control {control_index} is {} bytes; the profile limit is {MAX_EXACT_TOKEN_BYTES}",
                end - start
            ));
        }
        let control_label = format!("{label} control {control_index}");
        let control_source = &source[start..end];
        let exact = parse_exact_svg_number(control_source, &control_label)?;
        if exact < BigRational::zero() || exact > BigRational::one() {
            return Err(format!(
                "{control_label} must be in [0, 1] before binary32 rounding; found `{control_source}`"
            ));
        }
        values.push(parse_svg_number(control_source, &control_label)?);
        position = end;

        let before_separator = position;
        while bytes
            .get(position)
            .is_some_and(|byte| is_xml_space_byte(*byte))
        {
            position += 1;
        }
        let had_whitespace = position != before_separator;
        if position == bytes.len() {
            break;
        }
        if bytes[position] == b',' {
            position += 1;
            while bytes
                .get(position)
                .is_some_and(|byte| is_xml_space_byte(*byte))
            {
                position += 1;
            }
            if position == bytes.len() {
                return Err(format!(
                    "{label} ends with a comma after control {control_index}; another SVG number is required"
                ));
            }
        } else if !had_whitespace {
            return Err(format!(
                "{label} requires a comma or XML whitespace after control {control_index}; found `{}`",
                char::from(bytes[position])
            ));
        }
    }

    Ok(values)
}

fn parse_svg_number_sequence(
    source: &str,
    label: &str,
    maximum: usize,
) -> Result<Vec<f32>, String> {
    let source = source.trim_matches(is_xml_space);
    let bytes = source.as_bytes();
    let mut position = 0;
    let mut values = Vec::new();
    while position < bytes.len() {
        while bytes
            .get(position)
            .is_some_and(|byte| is_xml_space_byte(*byte))
        {
            position += 1;
        }
        if position == bytes.len() {
            break;
        }
        if values.len() == maximum {
            return Err(format!(
                "{label} accepts at most {maximum} components; found more"
            ));
        }
        let start = position;
        let index = values.len();
        let end = svg_number_end(bytes, start).ok_or_else(|| {
            format!("{label} component {index} must be an SVG number at tuple byte {start}")
        })?;
        if end - start > MAX_EXACT_TOKEN_BYTES {
            return Err(format!(
                "{label} component {index} is {} bytes; the profile limit is {MAX_EXACT_TOKEN_BYTES}",
                end - start
            ));
        }
        values.push(parse_svg_number(
            &source[start..end],
            &format!("{label} component {index}"),
        )?);
        position = end;

        let before_separator = position;
        while bytes
            .get(position)
            .is_some_and(|byte| is_xml_space_byte(*byte))
        {
            position += 1;
        }
        let had_whitespace = position != before_separator;
        if position == bytes.len() {
            break;
        }
        if bytes[position] == b',' {
            position += 1;
            while bytes
                .get(position)
                .is_some_and(|byte| is_xml_space_byte(*byte))
            {
                position += 1;
            }
            if position == bytes.len() {
                return Err(format!(
                    "{label} ends with a comma after component {index}; another SVG number is required"
                ));
            }
        } else if !had_whitespace {
            return Err(format!(
                "{label} requires a comma or XML whitespace after component {index}; found `{}`",
                char::from(bytes[position])
            ));
        }
    }
    if values.is_empty() {
        return Err(format!("{label} must contain at least one SVG number"));
    }
    Ok(values)
}

fn semicolon_entries<'a>(
    source: &'a str,
    attribute: &str,
    label: &str,
    limit: usize,
) -> Result<Vec<&'a str>, String> {
    let source = source.trim_matches(is_xml_space);
    if source.is_empty() {
        return Err(format!("{attribute} on {label} must not be empty"));
    }
    let mut entries = Vec::with_capacity(limit.min(16));
    let mut source_entries = source.split(';').peekable();
    while let Some(entry) = source_entries.next() {
        let entry = entry.trim_matches(is_xml_space);
        if entry.is_empty() && source_entries.peek().is_none() {
            break;
        }
        let index = entries.len();
        if entry.is_empty() {
            return Err(format!("{attribute}[{index}] on {label} is empty"));
        }
        if index == limit {
            return Err(format!(
                "{attribute} on {label} has at least {} entries; the profile limit is {limit}",
                limit + 1
            ));
        }
        entries.push(entry);
    }
    if entries.is_empty() {
        return Err(format!("{attribute} on {label} must not be empty"));
    }
    Ok(entries)
}

fn parse_keyframe_offset(source: &str, label: &str) -> Result<KeyframeOffset, String> {
    let source = source.trim_matches(is_xml_space);
    let rational = parse_exact_svg_number(source, label)?;
    if rational < BigRational::zero() || rational > BigRational::one() {
        return Err(format!("{label} must be in [0, 1]; found `{source}`"));
    }
    let exact_ratio = format!("{}/{}", rational.numer(), rational.denom());
    let numerator = rational
        .numer()
        .to_u64()
        .ok_or_else(|| {
            format!(
                "{label} exact reduced ratio {exact_ratio} exceeds the unsigned 64-bit numerator domain"
            )
        })?;
    let denominator = rational
        .denom()
        .to_u64()
        .ok_or_else(|| {
            format!(
                "{label} exact reduced ratio {exact_ratio} exceeds the unsigned 64-bit denominator domain"
            )
        })?;
    KeyframeOffset::new(numerator, denominator).map_err(|error| error.to_string())
}

fn parse_exact_svg_number(source: &str, label: &str) -> Result<BigRational, String> {
    if source.is_empty() {
        return Err(format!(
            "{label} must be one exact SVG number; found an empty token"
        ));
    }
    if source.len() > MAX_EXACT_TOKEN_BYTES {
        return Err(format!(
            "{label} is {} bytes; the profile limit is {MAX_EXACT_TOKEN_BYTES}",
            source.len()
        ));
    }
    if !has_svg_number_syntax(source.as_bytes()) {
        return Err(format!(
            "{label} must be one exact SVG number; found `{source}`"
        ));
    }

    let exponent_index = source.find(['e', 'E']);
    let (mantissa, exponent) = match exponent_index {
        Some(index) => {
            let exponent_source = &source[index + 1..];
            let exponent = exponent_source.parse::<i32>().map_err(|_| {
                format!(
                    "{label} decimal exponent must fit signed 32-bit syntax; found `{exponent_source}`"
                )
            })?;
            (&source[..index], exponent)
        }
        None => (source, 0),
    };
    if !(-MAX_EXACT_DECIMAL_EXPONENT..=MAX_EXACT_DECIMAL_EXPONENT).contains(&exponent) {
        return Err(format!(
            "{label} decimal exponent must be in [-{MAX_EXACT_DECIMAL_EXPONENT}, {MAX_EXACT_DECIMAL_EXPONENT}]; found {exponent}"
        ));
    }
    let (negative, mantissa) = match mantissa.as_bytes().first() {
        Some(b'-') => (true, &mantissa[1..]),
        Some(b'+') => (false, &mantissa[1..]),
        _ => (false, mantissa),
    };
    let (whole, fraction) = mantissa
        .split_once('.')
        .map_or((mantissa, ""), |(whole, fraction)| (whole, fraction));
    let digits = format!("{whole}{fraction}");
    let mut numerator = BigInt::parse_bytes(digits.as_bytes(), 10)
        .ok_or_else(|| format!("{label} is not an exact decimal number"))?;
    if negative {
        numerator = -numerator;
    }
    let decimal_scale = i32::try_from(fraction.len())
        .map_err(|_| format!("{label} has too many decimal places"))?
        - exponent;
    Ok(if decimal_scale >= 0 {
        BigRational::new(numerator, BigInt::from(10).pow(decimal_scale as u32))
    } else {
        BigRational::from_integer(numerator * BigInt::from(10).pow((-decimal_scale) as u32))
    })
}

fn parse_clock(source: &str, label: &str) -> Result<i64, String> {
    let source = source.trim_matches(is_xml_space);
    let (number, scale, maximum_fraction_digits) = if let Some(number) = source.strip_suffix("ms") {
        (number, 1_000_000_u128, 6)
    } else if let Some(number) = source.strip_suffix('s') {
        (number, 1_000_000_000_u128, 9)
    } else {
        return Err(format!(
            "{label} must use the exact `s` or `ms` clock grammar"
        ));
    };
    if number.is_empty()
        || matches!(number.as_bytes().first(), Some(b'+') | Some(b'-'))
        || number.bytes().any(is_xml_space_byte)
    {
        return Err(format!(
            "{label} must use the exact non-negative clock grammar"
        ));
    }
    let (whole, fraction) = match number.split_once('.') {
        Some((whole, fraction)) if !whole.is_empty() && !fraction.is_empty() => {
            if fraction.contains('.') {
                return Err(format!("{label} has more than one decimal point"));
            }
            (whole, Some(fraction))
        }
        Some(_) => return Err(format!("{label} requires digits on both sides of `.`")),
        None => (number, None),
    };
    if !whole.bytes().all(|byte| byte.is_ascii_digit())
        || fraction.is_some_and(|value| !value.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(format!("{label} must contain decimal digits only"));
    }
    let whole = whole
        .parse::<u128>()
        .map_err(|_| format!("{label} overflows nanosecond time"))?;
    let mut nanoseconds = whole
        .checked_mul(scale)
        .ok_or_else(|| format!("{label} overflows nanosecond time"))?;
    if let Some(fraction) = fraction {
        if fraction.len() > maximum_fraction_digits {
            return Err(format!("{label} has more than nanosecond precision"));
        }
        let denominator = 10_u128
            .checked_pow(fraction.len() as u32)
            .ok_or_else(|| format!("{label} has too many decimal places"))?;
        let numerator = fraction
            .parse::<u128>()
            .map_err(|_| format!("{label} has too many decimal places"))?
            .checked_mul(scale)
            .ok_or_else(|| format!("{label} overflows nanosecond time"))?;
        if numerator % denominator != 0 {
            return Err(format!(
                "{label} cannot be represented as exact nanoseconds"
            ));
        }
        nanoseconds = nanoseconds
            .checked_add(numerator / denominator)
            .ok_or_else(|| format!("{label} overflows nanosecond time"))?;
    }
    i64::try_from(nanoseconds).map_err(|_| format!("{label} exceeds signed 64-bit nanoseconds"))
}

fn parse_repeat_count(source: &str, label: &str) -> Result<u64, String> {
    let source = source.trim_matches(is_xml_space);
    if source.is_empty() || !source.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!(
            "repeatCount on {label} must be one positive integer"
        ));
    }
    let repeat = source
        .parse::<u64>()
        .map_err(|_| format!("repeatCount on {label} overflows"))?;
    if repeat == 0 {
        return Err(format!("repeatCount on {label} must be greater than zero"));
    }
    Ok(repeat)
}

fn is_xml_space(character: char) -> bool {
    matches!(character, ' ' | '\t' | '\r' | '\n')
}

fn is_xml_space_byte(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\r' | b'\n')
}

#[cfg(test)]
mod unit_tests {
    use super::{has_svg_number_syntax, parse_clock};

    #[test]
    fn svg_number_grammar_is_closed() {
        for accepted in ["0", "-0", "+.5", "1.", "1e3", "-2.5E-2"] {
            assert!(has_svg_number_syntax(accepted.as_bytes()), "{accepted}");
        }
        for rejected in ["", ".", "e1", "1e", "1 2", "NaN", "inf", "1px"] {
            assert!(!has_svg_number_syntax(rejected.as_bytes()), "{rejected}");
        }
    }

    #[test]
    fn clock_grammar_converts_only_exact_nanoseconds() {
        assert_eq!(parse_clock("1s", "clock"), Ok(1_000_000_000));
        assert_eq!(parse_clock("1.25ms", "clock"), Ok(1_250_000));
        assert_eq!(parse_clock("0.000000008s", "clock"), Ok(8));
        for rejected in ["-1s", "+1s", "1e-3s", "1ns", "00:01s", "1.1ns"] {
            assert!(parse_clock(rejected, "clock").is_err(), "{rejected}");
        }
        for rejected in ["0.0000000001s", "0.0000000010s", "0.0000010ms"] {
            assert!(parse_clock(rejected, "clock").is_err(), "{rejected}");
        }
    }
}
