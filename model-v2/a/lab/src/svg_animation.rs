//! Retained SVG animation frontend for the model-v2 proving stack.
//!
//! General SVG import is deliberately not invented here. The static shell is
//! the smallest identity-preserving materializer shared by Profiles 0 and 1:
//! one SVG viewport with direct rectangle children, solid fills, and no
//! transform or viewBox baking. Animation source stays retained and compiles
//! once into the format-neutral [`crate::animation::AnimationProgram`].

use crate::animation::{
    AnimationProgram, CubicBezier, Easing, FillMode, KeyframeOffset, ScalarCurve, ScalarKeyframe,
    ScalarSegment, Timing, Track,
};
use crate::model::{
    AxisBinding, Color, DocBuilder, Document, Flow, Header, NodeId, Paints, Payload, Radius,
    RectangularCornerRadius, ShapeDesc, SizeIntent,
};
use crate::properties::{PropertyKey, PropertyTarget};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, ToPrimitive, Zero};
use quick_xml::events::{BytesStart, Event};
use quick_xml::name::ResolveResult;
use quick_xml::NsReader;
use std::collections::BTreeMap;
use std::sync::Arc;

pub const SVG_NAMESPACE: &str = "http://www.w3.org/2000/svg";
pub const PROFILE0_COMPILER_ID: &str = "svg-animation-profile0@0/rect-static@0";
pub const PROFILE1_COMPILER_ID: &str = "svg-animation-profile1@0/rect-static@0";

const ACCEPTED_PROFILE0_DYNAMIC_FORM: &str = "accepted Profile 0 dynamic form is a whitespace-only <animate> targeting a <rect>, with attributeName x, y, width, height, or opacity; required from, to, and dur; and optional begin, repeatCount, fill, calcMode=\"linear\", additive=\"replace\", and accumulate=\"none\"";
const ACCEPTED_PROFILE1_DYNAMIC_FORM: &str = "accepted Profile 1 dynamic form is a whitespace-only <animate> targeting a <rect>, with attributeName x, y, width, height, or opacity; either values or from plus to; required dur; optional keyTimes; calcMode absent, linear, or spline; spline requires keySplines; and optional begin, repeatCount, fill, additive=\"replace\", and accumulate=\"none\"";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AnimationProfile {
    Profile0,
    Profile1,
}

impl AnimationProfile {
    const fn compiler_id(self) -> &'static str {
        match self {
            Self::Profile0 => PROFILE0_COMPILER_ID,
            Self::Profile1 => PROFILE1_COMPILER_ID,
        }
    }

    const fn accepted_dynamic_form(self) -> &'static str {
        match self {
            Self::Profile0 => ACCEPTED_PROFILE0_DYNAMIC_FORM,
            Self::Profile1 => ACCEPTED_PROFILE1_DYNAMIC_FORM,
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
    Animate,
}

impl ElementKind {
    fn name(self) -> &'static str {
        match self {
            ElementKind::Svg => "svg",
            ElementKind::Rect => "rect",
            ElementKind::Animate => "animate",
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
    attributes: BTreeMap<String, String>,
    parent: Option<NodeId>,
    location: SourceLocation,
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
    Animate,
}

impl OpenElement {
    fn name(self) -> &'static str {
        match self {
            OpenElement::Svg => "svg",
            OpenElement::Rect(_) => "rect",
            OpenElement::Animate => "animate",
        }
    }
}

/// Retained SVG animation source plus the proving rectangle-only static shell.
/// The strict name prevents this type from masquerading as general SVG import.
#[derive(Debug)]
pub struct RectSvgAnimationSource {
    snapshot: SourceSnapshot,
    document: Document,
    viewport: (f32, f32),
    elements: Vec<ElementSite>,
    animations: Vec<AnimationSite>,
    forbidden: Vec<ForbiddenSite>,
}

impl RectSvgAnimationSource {
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

    fn compile(&self, profile: AnimationProfile) -> Result<AnimationProgram, SvgAnimationError> {
        let accepted_dynamic_form = profile.accepted_dynamic_form();
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
            let mut attributes = animation
                .attributes
                .iter()
                .map(|(name, value)| (name.as_str(), value.as_str()))
                .collect::<AttributeView<'_>>();
            let authored_id = attributes.remove("id");
            let label = authored_id
                .map(|id| format!("<animate id=\"{id}\">"))
                .unwrap_or_else(|| {
                    format!(
                        "<animate> at {}:{}",
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
            let profile_attributes = match profile {
                AnimationProfile::Profile0 => PROFILE0_ATTRIBUTES,
                AnimationProfile::Profile1 => PROFILE1_ATTRIBUTES,
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
                    if site.kind != ElementKind::Rect {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            animation.location,
                            format!(
                                "{label} targets <{} id=\"{fragment}\">; the selected animation profile requires <rect>",
                                site.kind.name()
                            ),
                        ));
                    }
                    site.node.expect("rectangle element sites own a node")
                }
                None => animation.parent.ok_or_else(|| {
                    SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!("{label} has no href and its immediate parent is not a <rect>"),
                    )
                })?,
            };
            let node = self.document.key_of(target_node).ok_or_else(|| {
                SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("{label} target became stale before compilation"),
                )
            })?;

            let attribute_name =
                required(&mut attributes, "attributeName", &label).map_err(|message| {
                    SvgAnimationError::new(&self.snapshot, animation.location, message)
                })?;
            let property = match attribute_name {
                "x" => PropertyKey::X,
                "y" => PropertyKey::Y,
                "width" => PropertyKey::Width,
                "height" => PropertyKey::Height,
                "opacity" => PropertyKey::Opacity,
                _ => {
                    return Err(SvgAnimationError::new(
                        &self.snapshot,
                        animation.location,
                        format!(
                            "{label} attributeName must be x, y, width, height, or opacity; found `{attribute_name}`"
                        ),
                    ));
                }
            };
            let target = PropertyTarget::new(node, property);

            let curve = compile_scalar_curve(profile, &mut attributes, property, &label).map_err(
                |message| SvgAnimationError::new(&self.snapshot, animation.location, message),
            )?;

            // Profiles 0 and 1 deliberately narrow the engine's signed timeline:
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
            accept_exact(&mut attributes, "additive", "replace", &label).map_err(|message| {
                SvgAnimationError::new(&self.snapshot, animation.location, message)
            })?;
            accept_exact(&mut attributes, "accumulate", "none", &label).map_err(|message| {
                SvgAnimationError::new(&self.snapshot, animation.location, message)
            })?;
            if let Some(name) = attributes.keys().next() {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!("unsupported attribute `{name}` on {label}; {accepted_dynamic_form}"),
                ));
            }

            if let Some(first) = targets.insert(target, animation.location) {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    animation.location,
                    format!(
                        "{label} duplicates the same rectangle/property target first animated at {}:{}",
                        first.line, first.column
                    ),
                ));
            }

            let source = format!(
                "{}:{}:{} {label}",
                self.snapshot.identity(),
                animation.location.line,
                animation.location.column
            );
            let track = match property {
                PropertyKey::X | PropertyKey::Y => {
                    Track::axis_start_curve(source, target, curve, timing, fill)
                }
                PropertyKey::Width | PropertyKey::Height => {
                    Track::fixed_size_curve(source, target, curve, timing, fill)
                }
                PropertyKey::Opacity => Track::opacity_curve(source, target, curve, timing, fill),
                _ => unreachable!("closed SVG animation property set"),
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

    pub fn into_compiled_profile0(self) -> Result<CompiledRectSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile0)
    }

    pub fn into_compiled_profile1(self) -> Result<CompiledRectSvgAnimation, SvgAnimationError> {
        self.into_compiled(AnimationProfile::Profile1)
    }

    fn into_compiled(
        self,
        profile: AnimationProfile,
    ) -> Result<CompiledRectSvgAnimation, SvgAnimationError> {
        let animation = self.compile(profile)?;
        Ok(CompiledRectSvgAnimation {
            snapshot: self.snapshot,
            document: self.document,
            animation,
            viewport: self.viewport,
        })
    }
}

/// One rectangle-shell source, ordinary document, and format-neutral program
/// ready for repeated explicit-time frames.
#[derive(Debug)]
pub struct CompiledRectSvgAnimation {
    snapshot: SourceSnapshot,
    document: Document,
    animation: AnimationProgram,
    viewport: (f32, f32),
}

impl CompiledRectSvgAnimation {
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
            forbidden: vec![],
            stack: vec![],
            skip_depth: 0,
            root_seen: false,
            root_closed: false,
            declaration_seen: false,
        }
    }

    fn parse(mut self) -> Result<RectSvgAnimationSource, SvgAnimationError> {
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
                    if matches!(self.stack.last(), Some(OpenElement::Animate)) {
                        return Err(SvgAnimationError::new(
                            &self.snapshot,
                            location,
                            "<animate> may contain whitespace only, found an XML comment",
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

        Ok(RectSvgAnimationSource {
            snapshot: self.snapshot,
            document: self.builder.build(),
            viewport: self.viewport.expect("root parsing sets viewport"),
            elements: self.elements,
            animations: self.animations,
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
            "animate" if matches!(parent, Some(OpenElement::Svg | OpenElement::Rect(_))) => {
                let parent = match parent {
                    Some(OpenElement::Rect(node)) => Some(node),
                    _ => None,
                };
                if let Some(id) = attributes.get("id").cloned() {
                    self.elements.push(ElementSite {
                        id,
                        kind: ElementKind::Animate,
                        node: None,
                        location,
                    });
                }
                self.animations.push(AnimationSite {
                    attributes,
                    parent,
                    location,
                });
                if !empty {
                    self.stack.push(OpenElement::Animate);
                }
            }
            "set" | "animateTransform" | "animateMotion" => {
                self.forbidden.push(ForbiddenSite {
                    location,
                    message: format!(
                        "unsupported SVG animation element <{local}>; the selected profile admits only <animate>"
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
            _ if matches!(parent, Some(OpenElement::Animate)) => {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!("<animate> may contain whitespace only, found <{local}>"),
                ));
            }
            _ => {
                return Err(SvgAnimationError::new(
                    &self.snapshot,
                    location,
                    format!(
                        "the SVG animation proving materializer supports only direct <rect> children and <animate>; found <{local}>"
                    ),
                ));
            }
        }
        Ok(())
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

fn accept_exact(
    attributes: &mut AttributeView<'_>,
    name: &str,
    accepted: &str,
    label: &str,
) -> Result<(), String> {
    match attributes.remove(name) {
        None => Ok(()),
        Some(value) if value == accepted => Ok(()),
        Some(value) => Err(format!(
            "{name} on {label} must be `{accepted}` when present; found `{value}`"
        )),
    }
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

fn compile_scalar_curve(
    profile: AnimationProfile,
    attributes: &mut AttributeView<'_>,
    property: PropertyKey,
    label: &str,
) -> Result<ScalarCurve, String> {
    let calc_mode = match attributes.remove("calcMode") {
        None | Some("linear") => CalcMode::Linear,
        Some("spline") if profile == AnimationProfile::Profile1 => CalcMode::Spline,
        Some("discrete" | "paced") if profile == AnimationProfile::Profile1 => {
            return Err(format!(
                "calcMode on {label} is valid SVG but unsupported by Profile 1; expected `linear` or `spline`"
            ));
        }
        Some(value) => {
            return Err(format!(
                "calcMode on {label} must be `linear`{}; found `{value}`",
                if profile == AnimationProfile::Profile1 {
                    " or `spline`"
                } else {
                    ""
                }
            ));
        }
    };

    let values_source = attributes.remove("values");
    let values = if let Some(values_source) = values_source {
        if profile == AnimationProfile::Profile0 {
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

    let offsets = match attributes.remove("keyTimes") {
        Some(source) => parse_key_times(source, values.len(), label)?,
        None => evenly_spaced_offsets(values.len())?,
    };
    let easings = match calc_mode {
        CalcMode::Linear => {
            if let Some(source) = attributes.remove("keySplines") {
                // SVG ignores keySplines outside spline mode, but the strict
                // source profile still refuses malformed attribute syntax.
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
