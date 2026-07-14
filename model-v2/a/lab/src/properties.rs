//! Closed, typed node-property values and their immutable read view.
//!
//! This is deliberately a node-level contract. Structural facts (payload
//! kind, parent, children, order) are never properties, and nested paint,
//! stroke, stop, text-run, and lens-operation members have no targets until
//! those subobjects earn durable identity of their own.

use crate::model::*;
use crate::path::PathGeometry;
use crate::renderability;
use std::collections::BTreeMap;
use std::sync::Arc;

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PropertyKey {
    X,
    Y,
    Width,
    Height,
    MinWidth,
    MaxWidth,
    MinHeight,
    MaxHeight,
    AspectRatio,
    Active,
    Rotation,
    FlipX,
    FlipY,
    Flow,
    Grow,
    SelfAlign,
    Opacity,
    Layout,
    ClipsContent,
    CornerRadius,
    CornerSmoothing,
    Fills,
    Strokes,
    LensOps,
    PathGeometry,
}

impl PropertyKey {
    pub const ALL: [PropertyKey; 25] = [
        PropertyKey::X,
        PropertyKey::Y,
        PropertyKey::Width,
        PropertyKey::Height,
        PropertyKey::MinWidth,
        PropertyKey::MaxWidth,
        PropertyKey::MinHeight,
        PropertyKey::MaxHeight,
        PropertyKey::AspectRatio,
        PropertyKey::Active,
        PropertyKey::Rotation,
        PropertyKey::FlipX,
        PropertyKey::FlipY,
        PropertyKey::Flow,
        PropertyKey::Grow,
        PropertyKey::SelfAlign,
        PropertyKey::Opacity,
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::Fills,
        PropertyKey::Strokes,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];

    #[inline]
    pub fn spec(self) -> &'static PropertySpec {
        let spec = &PROPERTY_REGISTRY[self as usize];
        debug_assert_eq!(spec.key, self);
        spec
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyValueKind {
    AxisBinding,
    SizeIntent,
    OptionalNumber,
    OptionalAspectRatio,
    Boolean,
    Number,
    Flow,
    SelfAlign,
    Layout,
    CornerRadius,
    Paints,
    Strokes,
    LensOps,
    PathGeometry,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PropertyValue {
    AxisBinding(AxisBinding),
    SizeIntent(SizeIntent),
    /// An explicit `None` clears an authored constraint. This remains
    /// distinct from an absent [`PropertyTarget`], which reads authored base.
    OptionalNumber(Option<f32>),
    OptionalAspectRatio(Option<(f32, f32)>),
    Boolean(bool),
    Number(f32),
    Flow(Flow),
    SelfAlign(SelfAlign),
    Layout(LayoutBehavior),
    CornerRadius(RectangularCornerRadius),
    Paints(Paints),
    Strokes(Vec<Stroke>),
    /// The complete ordered operation list owned by one lens. Individual
    /// operations remain untargetable until they have durable identities.
    LensOps(Vec<LensOp>),
    /// Complete validated path geometry in the node's unit reference box.
    /// The authored shape kind and box remain structural/model facts.
    PathGeometry(Arc<PathGeometry>),
}

impl PropertyValue {
    pub fn kind(&self) -> PropertyValueKind {
        match self {
            PropertyValue::AxisBinding(_) => PropertyValueKind::AxisBinding,
            PropertyValue::SizeIntent(_) => PropertyValueKind::SizeIntent,
            PropertyValue::OptionalNumber(_) => PropertyValueKind::OptionalNumber,
            PropertyValue::OptionalAspectRatio(_) => PropertyValueKind::OptionalAspectRatio,
            PropertyValue::Boolean(_) => PropertyValueKind::Boolean,
            PropertyValue::Number(_) => PropertyValueKind::Number,
            PropertyValue::Flow(_) => PropertyValueKind::Flow,
            PropertyValue::SelfAlign(_) => PropertyValueKind::SelfAlign,
            PropertyValue::Layout(_) => PropertyValueKind::Layout,
            PropertyValue::CornerRadius(_) => PropertyValueKind::CornerRadius,
            PropertyValue::Paints(_) => PropertyValueKind::Paints,
            PropertyValue::Strokes(_) => PropertyValueKind::Strokes,
            PropertyValue::LensOps(_) => PropertyValueKind::LensOps,
            PropertyValue::PathGeometry(_) => PropertyValueKind::PathGeometry,
        }
    }

    fn as_ref(&self) -> PropertyValueRef<'_> {
        match self {
            PropertyValue::AxisBinding(value) => PropertyValueRef::AxisBinding(*value),
            PropertyValue::SizeIntent(value) => PropertyValueRef::SizeIntent(*value),
            PropertyValue::OptionalNumber(value) => PropertyValueRef::OptionalNumber(*value),
            PropertyValue::OptionalAspectRatio(value) => {
                PropertyValueRef::OptionalAspectRatio(*value)
            }
            PropertyValue::Boolean(value) => PropertyValueRef::Boolean(*value),
            PropertyValue::Number(value) => PropertyValueRef::Number(*value),
            PropertyValue::Flow(value) => PropertyValueRef::Flow(*value),
            PropertyValue::SelfAlign(value) => PropertyValueRef::SelfAlign(*value),
            PropertyValue::Layout(value) => PropertyValueRef::Layout(*value),
            PropertyValue::CornerRadius(value) => PropertyValueRef::CornerRadius(*value),
            PropertyValue::Paints(value) => PropertyValueRef::Paints(value),
            PropertyValue::Strokes(value) => PropertyValueRef::Strokes(value),
            PropertyValue::LensOps(value) => PropertyValueRef::LensOps(value),
            PropertyValue::PathGeometry(value) => PropertyValueRef::PathGeometry(value),
        }
    }
}

/// Borrowed property value. Large paint/stroke/lens-operation values stay
/// borrowed while scalar values remain cheap copies.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PropertyValueRef<'a> {
    AxisBinding(AxisBinding),
    SizeIntent(SizeIntent),
    OptionalNumber(Option<f32>),
    OptionalAspectRatio(Option<(f32, f32)>),
    Boolean(bool),
    Number(f32),
    Flow(Flow),
    SelfAlign(SelfAlign),
    Layout(LayoutBehavior),
    CornerRadius(RectangularCornerRadius),
    Paints(&'a Paints),
    Strokes(&'a [Stroke]),
    LensOps(&'a [LensOp]),
    PathGeometry(&'a Arc<PathGeometry>),
}

impl PropertyValueRef<'_> {
    pub fn kind(self) -> PropertyValueKind {
        match self {
            PropertyValueRef::AxisBinding(_) => PropertyValueKind::AxisBinding,
            PropertyValueRef::SizeIntent(_) => PropertyValueKind::SizeIntent,
            PropertyValueRef::OptionalNumber(_) => PropertyValueKind::OptionalNumber,
            PropertyValueRef::OptionalAspectRatio(_) => PropertyValueKind::OptionalAspectRatio,
            PropertyValueRef::Boolean(_) => PropertyValueKind::Boolean,
            PropertyValueRef::Number(_) => PropertyValueKind::Number,
            PropertyValueRef::Flow(_) => PropertyValueKind::Flow,
            PropertyValueRef::SelfAlign(_) => PropertyValueKind::SelfAlign,
            PropertyValueRef::Layout(_) => PropertyValueKind::Layout,
            PropertyValueRef::CornerRadius(_) => PropertyValueKind::CornerRadius,
            PropertyValueRef::Paints(_) => PropertyValueKind::Paints,
            PropertyValueRef::Strokes(_) => PropertyValueKind::Strokes,
            PropertyValueRef::LensOps(_) => PropertyValueKind::LensOps,
            PropertyValueRef::PathGeometry(_) => PropertyValueKind::PathGeometry,
        }
    }

    pub fn to_owned(self) -> PropertyValue {
        match self {
            PropertyValueRef::AxisBinding(value) => PropertyValue::AxisBinding(value),
            PropertyValueRef::SizeIntent(value) => PropertyValue::SizeIntent(value),
            PropertyValueRef::OptionalNumber(value) => PropertyValue::OptionalNumber(value),
            PropertyValueRef::OptionalAspectRatio(value) => {
                PropertyValue::OptionalAspectRatio(value)
            }
            PropertyValueRef::Boolean(value) => PropertyValue::Boolean(value),
            PropertyValueRef::Number(value) => PropertyValue::Number(value),
            PropertyValueRef::Flow(value) => PropertyValue::Flow(value),
            PropertyValueRef::SelfAlign(value) => PropertyValue::SelfAlign(value),
            PropertyValueRef::Layout(value) => PropertyValue::Layout(value),
            PropertyValueRef::CornerRadius(value) => PropertyValue::CornerRadius(value),
            PropertyValueRef::Paints(value) => PropertyValue::Paints(value.clone()),
            PropertyValueRef::Strokes(value) => PropertyValue::Strokes(value.to_vec()),
            PropertyValueRef::LensOps(value) => PropertyValue::LensOps(value.to_vec()),
            PropertyValueRef::PathGeometry(value) => PropertyValue::PathGeometry(Arc::clone(value)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PropertyTarget {
    pub node: NodeKey,
    pub property: PropertyKey,
}

impl PropertyTarget {
    pub fn new(node: NodeKey, property: PropertyKey) -> Self {
        Self { node, property }
    }
}

/// Conservative stage impact. Multiple flags may be present.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PropertyImpact(u8);

impl PropertyImpact {
    pub const MEASURE: Self = Self(1 << 0);
    pub const LAYOUT: Self = Self(1 << 1);
    pub const TRANSFORM: Self = Self(1 << 2);
    pub const BOUNDS: Self = Self(1 << 3);
    pub const PAINT: Self = Self(1 << 4);
    pub const RESOURCE: Self = Self(1 << 5);

    const fn from_bits(bits: u8) -> Self {
        Self(bits)
    }

    pub const fn bits(self) -> u8 {
        self.0
    }

    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }
}

impl std::ops::BitOr for PropertyImpact {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        Self(self.0 | rhs.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyApplicability {
    EveryNode,
    HorizontalExtent,
    VerticalExtent,
    AspectRatioShape,
    Frame,
    RoundedBox,
    FillPaintable,
    StrokePaintable,
    Lens,
    Path,
}

impl PropertyApplicability {
    #[inline]
    pub fn accepts(self, node: &Node) -> bool {
        match self {
            PropertyApplicability::EveryNode => true,
            PropertyApplicability::HorizontalExtent => !node.payload.box_is_derived(),
            PropertyApplicability::VerticalExtent => {
                !node.payload.box_is_derived()
                    && !matches!(
                        node.payload,
                        Payload::Shape {
                            desc: ShapeDesc::Line
                        }
                    )
            }
            PropertyApplicability::AspectRatioShape => matches!(
                node.payload,
                Payload::Shape {
                    desc: ShapeDesc::Rect | ShapeDesc::Ellipse | ShapeDesc::Path(_)
                }
            ),
            PropertyApplicability::Frame => matches!(node.payload, Payload::Frame { .. }),
            PropertyApplicability::RoundedBox => matches!(
                node.payload,
                Payload::Frame { .. }
                    | Payload::Shape {
                        desc: ShapeDesc::Rect
                    }
            ),
            PropertyApplicability::FillPaintable => matches!(
                node.payload,
                Payload::Frame { .. }
                    | Payload::Shape {
                        desc: ShapeDesc::Rect | ShapeDesc::Ellipse | ShapeDesc::Path(_)
                    }
                    | Payload::Text { .. }
                    | Payload::AttributedText { .. }
            ),
            PropertyApplicability::StrokePaintable => matches!(
                node.payload,
                Payload::Frame { .. }
                    | Payload::Shape { .. }
                    | Payload::Text { .. }
                    | Payload::AttributedText { .. }
            ),
            PropertyApplicability::Lens => matches!(node.payload, Payload::Lens { .. }),
            PropertyApplicability::Path => matches!(
                node.payload,
                Payload::Shape {
                    desc: ShapeDesc::Path(_)
                }
            ),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PropertySpec {
    pub key: PropertyKey,
    pub value_kind: PropertyValueKind,
    pub applicability: PropertyApplicability,
    pub impact: PropertyImpact,
}

impl PropertySpec {
    #[inline]
    pub fn applies_to(self, node: &Node) -> bool {
        self.applicability.accepts(node)
    }

    /// Read the authored base value. `None` means this key does not apply to
    /// the node; it never means a registered nullable value is null.
    pub fn base_value(self, node: &Node) -> Option<PropertyValue> {
        self.applies_to(node)
            .then(|| base_value_ref(node, self.key).to_owned())
    }
}

const GEOMETRY: PropertyImpact = PropertyImpact::from_bits(
    PropertyImpact::MEASURE.bits()
        | PropertyImpact::LAYOUT.bits()
        | PropertyImpact::TRANSFORM.bits()
        | PropertyImpact::BOUNDS.bits()
        | PropertyImpact::PAINT.bits(),
);
const BOUNDS_PAINT: PropertyImpact =
    PropertyImpact::from_bits(PropertyImpact::BOUNDS.bits() | PropertyImpact::PAINT.bits());
const VISUAL_TRANSFORM: PropertyImpact = PropertyImpact::from_bits(
    PropertyImpact::TRANSFORM.bits() | PropertyImpact::BOUNDS.bits() | PropertyImpact::PAINT.bits(),
);
const PAINT_RESOURCE: PropertyImpact =
    PropertyImpact::from_bits(PropertyImpact::PAINT.bits() | PropertyImpact::RESOURCE.bits());
const BOUNDS_PAINT_RESOURCE: PropertyImpact = PropertyImpact::from_bits(
    PropertyImpact::BOUNDS.bits() | PropertyImpact::PAINT.bits() | PropertyImpact::RESOURCE.bits(),
);
const ALL_STAGES: PropertyImpact = PropertyImpact::from_bits(
    PropertyImpact::MEASURE.bits()
        | PropertyImpact::LAYOUT.bits()
        | PropertyImpact::TRANSFORM.bits()
        | PropertyImpact::BOUNDS.bits()
        | PropertyImpact::PAINT.bits()
        | PropertyImpact::RESOURCE.bits(),
);

static PROPERTY_REGISTRY: [PropertySpec; PropertyKey::ALL.len()] = [
    PropertySpec {
        key: PropertyKey::X,
        value_kind: PropertyValueKind::AxisBinding,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Y,
        value_kind: PropertyValueKind::AxisBinding,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Width,
        value_kind: PropertyValueKind::SizeIntent,
        applicability: PropertyApplicability::HorizontalExtent,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Height,
        value_kind: PropertyValueKind::SizeIntent,
        applicability: PropertyApplicability::VerticalExtent,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::MinWidth,
        value_kind: PropertyValueKind::OptionalNumber,
        applicability: PropertyApplicability::HorizontalExtent,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::MaxWidth,
        value_kind: PropertyValueKind::OptionalNumber,
        applicability: PropertyApplicability::HorizontalExtent,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::MinHeight,
        value_kind: PropertyValueKind::OptionalNumber,
        applicability: PropertyApplicability::VerticalExtent,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::MaxHeight,
        value_kind: PropertyValueKind::OptionalNumber,
        applicability: PropertyApplicability::VerticalExtent,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::AspectRatio,
        value_kind: PropertyValueKind::OptionalAspectRatio,
        applicability: PropertyApplicability::AspectRatioShape,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Active,
        value_kind: PropertyValueKind::Boolean,
        applicability: PropertyApplicability::EveryNode,
        impact: ALL_STAGES,
    },
    PropertySpec {
        key: PropertyKey::Rotation,
        value_kind: PropertyValueKind::Number,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::FlipX,
        value_kind: PropertyValueKind::Boolean,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::FlipY,
        value_kind: PropertyValueKind::Boolean,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Flow,
        value_kind: PropertyValueKind::Flow,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Grow,
        value_kind: PropertyValueKind::Number,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::SelfAlign,
        value_kind: PropertyValueKind::SelfAlign,
        applicability: PropertyApplicability::EveryNode,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::Opacity,
        value_kind: PropertyValueKind::Number,
        applicability: PropertyApplicability::EveryNode,
        impact: PropertyImpact::PAINT,
    },
    PropertySpec {
        key: PropertyKey::Layout,
        value_kind: PropertyValueKind::Layout,
        applicability: PropertyApplicability::Frame,
        impact: GEOMETRY,
    },
    PropertySpec {
        key: PropertyKey::ClipsContent,
        value_kind: PropertyValueKind::Boolean,
        applicability: PropertyApplicability::Frame,
        impact: BOUNDS_PAINT,
    },
    PropertySpec {
        key: PropertyKey::CornerRadius,
        value_kind: PropertyValueKind::CornerRadius,
        applicability: PropertyApplicability::RoundedBox,
        impact: BOUNDS_PAINT,
    },
    PropertySpec {
        key: PropertyKey::CornerSmoothing,
        value_kind: PropertyValueKind::Number,
        applicability: PropertyApplicability::RoundedBox,
        impact: BOUNDS_PAINT,
    },
    PropertySpec {
        key: PropertyKey::Fills,
        value_kind: PropertyValueKind::Paints,
        applicability: PropertyApplicability::FillPaintable,
        impact: PAINT_RESOURCE,
    },
    PropertySpec {
        key: PropertyKey::Strokes,
        value_kind: PropertyValueKind::Strokes,
        applicability: PropertyApplicability::StrokePaintable,
        impact: BOUNDS_PAINT_RESOURCE,
    },
    PropertySpec {
        key: PropertyKey::LensOps,
        value_kind: PropertyValueKind::LensOps,
        applicability: PropertyApplicability::Lens,
        impact: VISUAL_TRANSFORM,
    },
    PropertySpec {
        key: PropertyKey::PathGeometry,
        value_kind: PropertyValueKind::PathGeometry,
        applicability: PropertyApplicability::Path,
        impact: BOUNDS_PAINT,
    },
];

pub fn property_registry() -> &'static [PropertySpec] {
    &PROPERTY_REGISTRY
}

#[derive(Debug, Clone, PartialEq)]
pub enum PropertyError {
    DuplicateTarget {
        target: PropertyTarget,
    },
    StaleTarget {
        target: PropertyTarget,
    },
    WrongValueKind {
        target: PropertyTarget,
        expected: PropertyValueKind,
        actual: PropertyValueKind,
    },
    Inapplicable {
        target: PropertyTarget,
        applicability: PropertyApplicability,
    },
    InvalidValue {
        target: PropertyTarget,
        reason: String,
    },
    InvalidEffectiveState {
        node: NodeKey,
        properties: Vec<PropertyKey>,
        reason: String,
    },
}

impl std::fmt::Display for PropertyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PropertyError::DuplicateTarget { target } => {
                write!(f, "duplicate property target {target:?}")
            }
            PropertyError::StaleTarget { target } => {
                write!(
                    f,
                    "property target is not live in this document: {target:?}"
                )
            }
            PropertyError::WrongValueKind {
                target,
                expected,
                actual,
            } => write!(
                f,
                "wrong value kind for {target:?}: expected {expected:?}, found {actual:?}"
            ),
            PropertyError::Inapplicable {
                target,
                applicability,
            } => write!(
                f,
                "property {target:?} does not satisfy {applicability:?} applicability"
            ),
            PropertyError::InvalidValue { target, reason } => {
                write!(f, "invalid value for {target:?}: {reason}")
            }
            PropertyError::InvalidEffectiveState {
                node,
                properties,
                reason,
            } => write!(
                f,
                "invalid effective state for {node:?} across {properties:?}: {reason}"
            ),
        }
    }
}

impl std::error::Error for PropertyError {}

/// Immutable, sorted, unique node-property values.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PropertyValues {
    entries: BTreeMap<PropertyTarget, PropertyValue>,
}

impl PropertyValues {
    pub fn new(
        document: &Document,
        entries: impl IntoIterator<Item = (PropertyTarget, PropertyValue)>,
    ) -> Result<Self, PropertyError> {
        let mut values = Self::default();
        for (target, value) in entries {
            if values.entries.contains_key(&target) {
                return Err(PropertyError::DuplicateTarget { target });
            }
            validate_entry(document, target, &value)?;
            values.entries.insert(target, value);
        }
        values.validate_effective_states(document)?;
        Ok(values)
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn get(&self, target: PropertyTarget) -> Option<&PropertyValue> {
        self.entries.get(&target)
    }

    pub fn iter(&self) -> impl ExactSizeIterator<Item = (PropertyTarget, &PropertyValue)> {
        self.entries.iter().map(|(target, value)| (*target, value))
    }

    fn validate(&self, document: &Document) -> Result<(), PropertyError> {
        for (&target, value) in &self.entries {
            validate_entry(document, target, value)?;
        }
        self.validate_effective_states(document)
    }

    fn validate_effective_states(&self, document: &Document) -> Result<(), PropertyError> {
        let mut touched = BTreeMap::<NodeKey, Vec<PropertyKey>>::new();
        for target in self.entries.keys() {
            touched
                .entry(target.node)
                .or_default()
                .push(target.property);
        }

        for (node_key, keys) in touched {
            let node = document
                .node_for_key(node_key)
                .expect("entry validation rejects stale property targets");
            let target = |property| PropertyTarget::new(node_key, property);
            let geometry_properties = [
                PropertyKey::X,
                PropertyKey::Y,
                PropertyKey::Width,
                PropertyKey::Height,
                PropertyKey::MinWidth,
                PropertyKey::MaxWidth,
                PropertyKey::MinHeight,
                PropertyKey::MaxHeight,
                PropertyKey::AspectRatio,
            ];
            let geometry_touched = geometry_properties
                .into_iter()
                .filter(|property| keys.contains(property))
                .collect::<Vec<_>>();
            if !geometry_touched.is_empty() {
                let mut header = node.header.clone();
                for property in geometry_properties {
                    let Some(value) = self.entries.get(&target(property)) else {
                        continue;
                    };
                    match (property, value) {
                        (PropertyKey::X, PropertyValue::AxisBinding(value)) => header.x = *value,
                        (PropertyKey::Y, PropertyValue::AxisBinding(value)) => header.y = *value,
                        (PropertyKey::Width, PropertyValue::SizeIntent(value)) => {
                            header.width = *value
                        }
                        (PropertyKey::Height, PropertyValue::SizeIntent(value)) => {
                            header.height = *value
                        }
                        (PropertyKey::MinWidth, PropertyValue::OptionalNumber(value)) => {
                            header.min_width = *value
                        }
                        (PropertyKey::MaxWidth, PropertyValue::OptionalNumber(value)) => {
                            header.max_width = *value
                        }
                        (PropertyKey::MinHeight, PropertyValue::OptionalNumber(value)) => {
                            header.min_height = *value
                        }
                        (PropertyKey::MaxHeight, PropertyValue::OptionalNumber(value)) => {
                            header.max_height = *value
                        }
                        (PropertyKey::AspectRatio, PropertyValue::OptionalAspectRatio(value)) => {
                            header.aspect_ratio = *value
                        }
                        _ => unreachable!("entry validation fixes the registered value kind"),
                    }
                }
                renderability::validate_geometry(&header, &node.payload).map_err(|error| {
                    PropertyError::InvalidEffectiveState {
                        node: node_key,
                        properties: geometry_touched,
                        reason: error.to_string(),
                    }
                })?;
            }
            let corner_radius = match self.entries.get(&target(PropertyKey::CornerRadius)) {
                Some(PropertyValue::CornerRadius(value)) => *value,
                None => node.corner_radius,
                Some(_) => unreachable!("entry validation fixes the registered value kind"),
            };
            let corner_smoothing = match self.entries.get(&target(PropertyKey::CornerSmoothing)) {
                Some(PropertyValue::Number(value)) => CornerSmoothing(*value),
                None => node.corner_smoothing,
                Some(_) => unreachable!("entry validation fixes the registered value kind"),
            };

            if keys.contains(&PropertyKey::CornerRadius)
                || keys.contains(&PropertyKey::CornerSmoothing)
            {
                renderability::validate_smooth_corner_radii(corner_radius, corner_smoothing)
                    .map_err(|error| PropertyError::InvalidEffectiveState {
                        node: node_key,
                        properties: vec![PropertyKey::CornerRadius, PropertyKey::CornerSmoothing],
                        reason: error.to_string(),
                    })?;
            }

            if keys.contains(&PropertyKey::Strokes)
                || keys.contains(&PropertyKey::CornerSmoothing)
                || keys.contains(&PropertyKey::PathGeometry)
            {
                let strokes = match self.entries.get(&target(PropertyKey::Strokes)) {
                    Some(PropertyValue::Strokes(value)) => value.as_slice(),
                    None => node.strokes.as_slice(),
                    Some(_) => unreachable!("entry validation fixes the registered value kind"),
                };
                let effective_path = match self.entries.get(&target(PropertyKey::PathGeometry)) {
                    Some(PropertyValue::PathGeometry(value)) => Some(value.as_ref()),
                    None => None,
                    Some(_) => unreachable!("entry validation fixes the registered value kind"),
                };
                validate_strokes(&node.payload, strokes, corner_smoothing, effective_path)
                    .map_err(|reason| PropertyError::InvalidEffectiveState {
                        node: node_key,
                        properties: vec![
                            PropertyKey::CornerSmoothing,
                            PropertyKey::Strokes,
                            PropertyKey::PathGeometry,
                        ],
                        reason,
                    })?;
            }
        }
        Ok(())
    }
}

/// One validated immutable view over authored structure plus optional typed
/// property values. All registered property reads go through this type;
/// structural reads still come from [`Self::document`].
///
/// Each typed accessor keeps an explicit authored-base branch. Do not funnel
/// that branch through [`PropertyValueRef`]: resolution performs many reads per
/// node, and materializing then decoding the generic union there doubled the
/// flat-canvas release gate. The effective branch still resolves a complete
/// generational [`PropertyTarget`] before reading sparse values.
#[derive(Debug)]
pub struct ValueView<'a> {
    document: &'a Document,
    values: Option<&'a PropertyValues>,
}

impl<'a> ValueView<'a> {
    pub fn base(document: &'a Document) -> Self {
        Self {
            document,
            values: None,
        }
    }

    pub fn new(document: &'a Document, values: &'a PropertyValues) -> Result<Self, PropertyError> {
        values.validate(document)?;
        Ok(Self {
            document,
            values: Some(values),
        })
    }

    #[inline]
    pub fn document(&self) -> &'a Document {
        self.document
    }

    #[inline]
    fn target(&self, id: NodeId, property: PropertyKey) -> PropertyTarget {
        PropertyTarget::new(
            self.document
                .key_of(id)
                .expect("resolver traverses only live nodes"),
            property,
        )
    }

    #[inline]
    fn assert_applicable(&self, id: NodeId, property: PropertyKey) {
        assert!(
            property.spec().applies_to(self.document.get(id)),
            "ValueView read inapplicable property {property:?} on node {id}"
        );
    }

    #[inline]
    fn debug_assert_applicable(&self, id: NodeId, property: PropertyKey) {
        debug_assert!(
            property.spec().applies_to(self.document.get(id)),
            "resolver read inapplicable property {property:?} on node {id}"
        );
    }

    #[inline]
    fn effective_value_for_id(&self, id: NodeId, property: PropertyKey) -> PropertyValueRef<'_> {
        let values = self.values.expect("effective read requires PropertyValues");
        let target = self.target(id, property);
        values
            .get(target)
            .map(PropertyValue::as_ref)
            .unwrap_or_else(|| base_value_ref(self.document.get(id), property))
    }

    #[inline]
    pub fn x(&self, id: NodeId) -> AxisBinding {
        if self.values.is_none() {
            return self.document.get(id).header.x;
        }
        match self.effective_value_for_id(id, PropertyKey::X) {
            PropertyValueRef::AxisBinding(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn y(&self, id: NodeId) -> AxisBinding {
        if self.values.is_none() {
            return self.document.get(id).header.y;
        }
        match self.effective_value_for_id(id, PropertyKey::Y) {
            PropertyValueRef::AxisBinding(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn width(&self, id: NodeId) -> SizeIntent {
        self.assert_applicable(id, PropertyKey::Width);
        self.width_unchecked(id)
    }

    #[inline]
    pub(crate) fn width_unchecked(&self, id: NodeId) -> SizeIntent {
        self.debug_assert_applicable(id, PropertyKey::Width);
        if self.values.is_none() {
            return self.document.get(id).header.width;
        }
        match self.effective_value_for_id(id, PropertyKey::Width) {
            PropertyValueRef::SizeIntent(value) => value,
            _ => unreachable!(),
        }
    }

    /// Authored value used only to report the model's ignored-by-rule state
    /// on derived boxes. Overrides for that inapplicable target are rejected.
    pub(crate) fn authored_width(&self, id: NodeId) -> SizeIntent {
        self.document.get(id).header.width
    }

    #[inline]
    pub fn height(&self, id: NodeId) -> SizeIntent {
        self.assert_applicable(id, PropertyKey::Height);
        self.height_unchecked(id)
    }

    #[inline]
    pub(crate) fn height_unchecked(&self, id: NodeId) -> SizeIntent {
        self.debug_assert_applicable(id, PropertyKey::Height);
        if self.values.is_none() {
            return self.document.get(id).header.height;
        }
        match self.effective_value_for_id(id, PropertyKey::Height) {
            PropertyValueRef::SizeIntent(value) => value,
            _ => unreachable!(),
        }
    }

    /// See [`Self::authored_width`].
    pub(crate) fn authored_height(&self, id: NodeId) -> SizeIntent {
        self.document.get(id).header.height
    }

    #[inline]
    pub fn min_width(&self, id: NodeId) -> Option<f32> {
        self.optional_number(id, PropertyKey::MinWidth)
    }

    #[inline]
    pub(crate) fn min_width_unchecked(&self, id: NodeId) -> Option<f32> {
        self.debug_assert_applicable(id, PropertyKey::MinWidth);
        self.optional_number_unchecked(id, PropertyKey::MinWidth)
    }

    #[inline]
    pub fn max_width(&self, id: NodeId) -> Option<f32> {
        self.optional_number(id, PropertyKey::MaxWidth)
    }

    #[inline]
    pub(crate) fn max_width_unchecked(&self, id: NodeId) -> Option<f32> {
        self.debug_assert_applicable(id, PropertyKey::MaxWidth);
        self.optional_number_unchecked(id, PropertyKey::MaxWidth)
    }

    #[inline]
    pub fn min_height(&self, id: NodeId) -> Option<f32> {
        self.optional_number(id, PropertyKey::MinHeight)
    }

    #[inline]
    pub(crate) fn min_height_unchecked(&self, id: NodeId) -> Option<f32> {
        self.debug_assert_applicable(id, PropertyKey::MinHeight);
        self.optional_number_unchecked(id, PropertyKey::MinHeight)
    }

    #[inline]
    pub fn max_height(&self, id: NodeId) -> Option<f32> {
        self.optional_number(id, PropertyKey::MaxHeight)
    }

    #[inline]
    pub(crate) fn max_height_unchecked(&self, id: NodeId) -> Option<f32> {
        self.debug_assert_applicable(id, PropertyKey::MaxHeight);
        self.optional_number_unchecked(id, PropertyKey::MaxHeight)
    }

    #[inline]
    fn optional_number(&self, id: NodeId, key: PropertyKey) -> Option<f32> {
        self.assert_applicable(id, key);
        self.optional_number_unchecked(id, key)
    }

    #[inline]
    fn optional_number_unchecked(&self, id: NodeId, key: PropertyKey) -> Option<f32> {
        if self.values.is_none() {
            let header = &self.document.get(id).header;
            return match key {
                PropertyKey::MinWidth => header.min_width,
                PropertyKey::MaxWidth => header.max_width,
                PropertyKey::MinHeight => header.min_height,
                PropertyKey::MaxHeight => header.max_height,
                _ => unreachable!("optional-number helper accepts only constraint keys"),
            };
        }
        match self.effective_value_for_id(id, key) {
            PropertyValueRef::OptionalNumber(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn aspect_ratio(&self, id: NodeId) -> Option<(f32, f32)> {
        self.assert_applicable(id, PropertyKey::AspectRatio);
        self.aspect_ratio_unchecked(id)
    }

    #[inline]
    pub(crate) fn aspect_ratio_unchecked(&self, id: NodeId) -> Option<(f32, f32)> {
        self.debug_assert_applicable(id, PropertyKey::AspectRatio);
        if self.values.is_none() {
            return self.document.get(id).header.aspect_ratio;
        }
        match self.effective_value_for_id(id, PropertyKey::AspectRatio) {
            PropertyValueRef::OptionalAspectRatio(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn active(&self, id: NodeId) -> bool {
        self.boolean_unchecked(id, PropertyKey::Active)
    }

    #[inline]
    pub fn flip_x(&self, id: NodeId) -> bool {
        self.boolean_unchecked(id, PropertyKey::FlipX)
    }

    #[inline]
    pub fn flip_y(&self, id: NodeId) -> bool {
        self.boolean_unchecked(id, PropertyKey::FlipY)
    }

    #[inline]
    pub fn clips_content(&self, id: NodeId) -> bool {
        self.boolean(id, PropertyKey::ClipsContent)
    }

    #[inline]
    fn boolean(&self, id: NodeId, key: PropertyKey) -> bool {
        self.assert_applicable(id, key);
        self.boolean_unchecked(id, key)
    }

    #[inline]
    fn boolean_unchecked(&self, id: NodeId, key: PropertyKey) -> bool {
        if self.values.is_none() {
            let node = self.document.get(id);
            return match key {
                PropertyKey::Active => node.header.active,
                PropertyKey::FlipX => node.header.flip_x,
                PropertyKey::FlipY => node.header.flip_y,
                PropertyKey::ClipsContent => match node.payload {
                    Payload::Frame { clips_content, .. } => clips_content,
                    _ => unreachable!("registry applicability rejects non-frame clip reads"),
                },
                _ => unreachable!("boolean helper accepts only registered boolean keys"),
            };
        }
        match self.effective_value_for_id(id, key) {
            PropertyValueRef::Boolean(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn rotation(&self, id: NodeId) -> f32 {
        self.number_unchecked(id, PropertyKey::Rotation)
    }

    #[inline]
    pub fn grow(&self, id: NodeId) -> f32 {
        self.number_unchecked(id, PropertyKey::Grow)
    }

    #[inline]
    pub fn opacity(&self, id: NodeId) -> f32 {
        self.number_unchecked(id, PropertyKey::Opacity)
    }

    #[inline]
    pub fn corner_smoothing(&self, id: NodeId) -> CornerSmoothing {
        self.assert_applicable(id, PropertyKey::CornerSmoothing);
        self.corner_smoothing_unchecked(id)
    }

    #[inline]
    pub(crate) fn corner_smoothing_unchecked(&self, id: NodeId) -> CornerSmoothing {
        self.debug_assert_applicable(id, PropertyKey::CornerSmoothing);
        if self.values.is_none() {
            return self.document.get(id).corner_smoothing;
        }
        match self.effective_value_for_id(id, PropertyKey::CornerSmoothing) {
            PropertyValueRef::Number(value) => CornerSmoothing(value),
            _ => unreachable!(),
        }
    }

    #[inline]
    fn number_unchecked(&self, id: NodeId, key: PropertyKey) -> f32 {
        if self.values.is_none() {
            let header = &self.document.get(id).header;
            return match key {
                PropertyKey::Rotation => header.rotation,
                PropertyKey::Grow => header.grow,
                PropertyKey::Opacity => header.opacity,
                PropertyKey::CornerSmoothing => self.document.get(id).corner_smoothing.value(),
                _ => unreachable!("number helper accepts only registered number keys"),
            };
        }
        match self.effective_value_for_id(id, key) {
            PropertyValueRef::Number(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn flow(&self, id: NodeId) -> Flow {
        if self.values.is_none() {
            return self.document.get(id).header.flow;
        }
        match self.effective_value_for_id(id, PropertyKey::Flow) {
            PropertyValueRef::Flow(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn self_align(&self, id: NodeId) -> SelfAlign {
        if self.values.is_none() {
            return self.document.get(id).header.self_align;
        }
        match self.effective_value_for_id(id, PropertyKey::SelfAlign) {
            PropertyValueRef::SelfAlign(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn layout(&self, id: NodeId) -> LayoutBehavior {
        self.assert_applicable(id, PropertyKey::Layout);
        if self.values.is_none() {
            return match self.document.get(id).payload {
                Payload::Frame { layout, .. } => layout,
                _ => unreachable!("registry applicability rejects non-frame layout reads"),
            };
        }
        match self.effective_value_for_id(id, PropertyKey::Layout) {
            PropertyValueRef::Layout(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn corner_radius(&self, id: NodeId) -> RectangularCornerRadius {
        self.assert_applicable(id, PropertyKey::CornerRadius);
        if self.values.is_none() {
            return self.document.get(id).corner_radius;
        }
        match self.effective_value_for_id(id, PropertyKey::CornerRadius) {
            PropertyValueRef::CornerRadius(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn fills(&self, id: NodeId) -> &Paints {
        self.assert_applicable(id, PropertyKey::Fills);
        if self.values.is_none() {
            return &self.document.get(id).fills;
        }
        match self.effective_value_for_id(id, PropertyKey::Fills) {
            PropertyValueRef::Paints(value) => value,
            _ => unreachable!(),
        }
    }

    #[inline]
    pub fn strokes(&self, id: NodeId) -> &[Stroke] {
        self.assert_applicable(id, PropertyKey::Strokes);
        self.strokes_unchecked(id)
    }

    #[inline]
    pub(crate) fn strokes_unchecked(&self, id: NodeId) -> &[Stroke] {
        self.debug_assert_applicable(id, PropertyKey::Strokes);
        if self.values.is_none() {
            return &self.document.get(id).strokes;
        }
        match self.effective_value_for_id(id, PropertyKey::Strokes) {
            PropertyValueRef::Strokes(value) => value,
            _ => unreachable!(),
        }
    }

    /// The complete effective transform program of a lens. Operations retain
    /// their authored order; this accessor does not expose member targets.
    #[inline]
    pub fn lens_ops(&self, id: NodeId) -> &[LensOp] {
        self.assert_applicable(id, PropertyKey::LensOps);
        if self.values.is_none() {
            return match &self.document.get(id).payload {
                Payload::Lens { ops } => ops,
                _ => unreachable!("registry applicability rejects non-lens ops reads"),
            };
        }
        match self.effective_value_for_id(id, PropertyKey::LensOps) {
            PropertyValueRef::LensOps(value) => value,
            _ => unreachable!(),
        }
    }

    /// Complete effective unit-reference geometry of a path node. Resolution
    /// maps this artifact through the final box exactly once, just as it does
    /// for authored path geometry.
    #[inline]
    pub fn path_geometry(&self, id: NodeId) -> &Arc<PathGeometry> {
        self.assert_applicable(id, PropertyKey::PathGeometry);
        if self.values.is_none() {
            return match &self.document.get(id).payload {
                Payload::Shape {
                    desc: ShapeDesc::Path(path),
                } => path.geometry(),
                _ => unreachable!("registry applicability rejects non-path geometry reads"),
            };
        }
        match self.effective_value_for_id(id, PropertyKey::PathGeometry) {
            PropertyValueRef::PathGeometry(value) => value,
            _ => unreachable!(),
        }
    }
}

#[inline]
fn base_value_ref(node: &Node, key: PropertyKey) -> PropertyValueRef<'_> {
    match key {
        PropertyKey::X => PropertyValueRef::AxisBinding(node.header.x),
        PropertyKey::Y => PropertyValueRef::AxisBinding(node.header.y),
        PropertyKey::Width => PropertyValueRef::SizeIntent(node.header.width),
        PropertyKey::Height => PropertyValueRef::SizeIntent(node.header.height),
        PropertyKey::MinWidth => PropertyValueRef::OptionalNumber(node.header.min_width),
        PropertyKey::MaxWidth => PropertyValueRef::OptionalNumber(node.header.max_width),
        PropertyKey::MinHeight => PropertyValueRef::OptionalNumber(node.header.min_height),
        PropertyKey::MaxHeight => PropertyValueRef::OptionalNumber(node.header.max_height),
        PropertyKey::AspectRatio => PropertyValueRef::OptionalAspectRatio(node.header.aspect_ratio),
        PropertyKey::Active => PropertyValueRef::Boolean(node.header.active),
        PropertyKey::Rotation => PropertyValueRef::Number(node.header.rotation),
        PropertyKey::FlipX => PropertyValueRef::Boolean(node.header.flip_x),
        PropertyKey::FlipY => PropertyValueRef::Boolean(node.header.flip_y),
        PropertyKey::Flow => PropertyValueRef::Flow(node.header.flow),
        PropertyKey::Grow => PropertyValueRef::Number(node.header.grow),
        PropertyKey::SelfAlign => PropertyValueRef::SelfAlign(node.header.self_align),
        PropertyKey::Opacity => PropertyValueRef::Number(node.header.opacity),
        PropertyKey::Layout => match node.payload {
            Payload::Frame { layout, .. } => PropertyValueRef::Layout(layout),
            _ => unreachable!("registry applicability rejects non-frame layout reads"),
        },
        PropertyKey::ClipsContent => match node.payload {
            Payload::Frame { clips_content, .. } => PropertyValueRef::Boolean(clips_content),
            _ => unreachable!("registry applicability rejects non-frame clip reads"),
        },
        PropertyKey::CornerRadius => PropertyValueRef::CornerRadius(node.corner_radius),
        PropertyKey::CornerSmoothing => PropertyValueRef::Number(node.corner_smoothing.value()),
        PropertyKey::Fills => PropertyValueRef::Paints(&node.fills),
        PropertyKey::Strokes => PropertyValueRef::Strokes(&node.strokes),
        PropertyKey::LensOps => match &node.payload {
            Payload::Lens { ops } => PropertyValueRef::LensOps(ops),
            _ => unreachable!("registry applicability rejects non-lens ops reads"),
        },
        PropertyKey::PathGeometry => match &node.payload {
            Payload::Shape {
                desc: ShapeDesc::Path(path),
            } => PropertyValueRef::PathGeometry(path.geometry()),
            _ => unreachable!("registry applicability rejects non-path geometry reads"),
        },
    }
}

fn validate_entry(
    document: &Document,
    target: PropertyTarget,
    value: &PropertyValue,
) -> Result<(), PropertyError> {
    let node = document
        .node_for_key(target.node)
        .ok_or(PropertyError::StaleTarget { target })?;
    let spec = target.property.spec();
    if value.kind() != spec.value_kind {
        return Err(PropertyError::WrongValueKind {
            target,
            expected: spec.value_kind,
            actual: value.kind(),
        });
    }
    if !spec.applies_to(node) {
        return Err(PropertyError::Inapplicable {
            target,
            applicability: spec.applicability,
        });
    }
    validate_value(target, value)
}

fn invalid(target: PropertyTarget, reason: impl Into<String>) -> PropertyError {
    PropertyError::InvalidValue {
        target,
        reason: reason.into(),
    }
}

fn validate_value(target: PropertyTarget, value: &PropertyValue) -> Result<(), PropertyError> {
    match (target.property, value) {
        (PropertyKey::X | PropertyKey::Y, PropertyValue::AxisBinding(binding)) => {
            let finite = match binding {
                AxisBinding::Pin { offset, .. } => offset.is_finite(),
                AxisBinding::Span { start, end } => start.is_finite() && end.is_finite(),
            };
            finite
                .then_some(())
                .ok_or_else(|| invalid(target, "axis bindings must contain finite numbers"))
        }
        (PropertyKey::Width | PropertyKey::Height, PropertyValue::SizeIntent(intent)) => {
            match intent {
                SizeIntent::Auto => Ok(()),
                SizeIntent::Fixed(value) if value.is_finite() && *value >= 0.0 => Ok(()),
                SizeIntent::Fixed(_) => Err(invalid(
                    target,
                    "fixed size must be finite and non-negative",
                )),
            }
        }
        (
            PropertyKey::MinWidth
            | PropertyKey::MaxWidth
            | PropertyKey::MinHeight
            | PropertyKey::MaxHeight,
            PropertyValue::OptionalNumber(value),
        ) => value
            .is_none_or(|value| value.is_finite() && value >= 0.0)
            .then_some(())
            .ok_or_else(|| invalid(target, "optional size constraints must be non-negative")),
        (PropertyKey::AspectRatio, PropertyValue::OptionalAspectRatio(value)) => value
            .is_none_or(|(width, height)| {
                width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0
            })
            .then_some(())
            .ok_or_else(|| {
                invalid(
                    target,
                    "an aspect ratio must contain two finite positive numbers",
                )
            }),
        (PropertyKey::Rotation, PropertyValue::Number(value)) => value
            .is_finite()
            .then_some(())
            .ok_or_else(|| invalid(target, "rotation must be finite")),
        (PropertyKey::Grow, PropertyValue::Number(value)) => (value.is_finite() && *value >= 0.0)
            .then_some(())
            .ok_or_else(|| invalid(target, "grow must be finite and non-negative")),
        (PropertyKey::Opacity, PropertyValue::Number(value)) => (value.is_finite()
            && (0.0..=1.0).contains(value))
        .then_some(())
        .ok_or_else(|| invalid(target, "opacity must be within [0, 1]")),
        (PropertyKey::Layout, PropertyValue::Layout(layout)) => {
            validate_layout(*layout).map_err(|reason| invalid(target, reason))
        }
        (PropertyKey::CornerRadius, PropertyValue::CornerRadius(radius)) => {
            validate_corner_radius(*radius).map_err(|reason| invalid(target, reason))
        }
        (PropertyKey::CornerSmoothing, PropertyValue::Number(value)) => (value.is_finite()
            && (0.0..=1.0).contains(value))
        .then_some(())
        .ok_or_else(|| invalid(target, "corner smoothing must be within [0, 1]")),
        (PropertyKey::Fills, PropertyValue::Paints(paints)) => {
            renderability::validate_paints(paints)
                .map_err(|reason| invalid(target, reason.to_string()))
        }
        (PropertyKey::Strokes, PropertyValue::Strokes(strokes)) => strokes
            .iter()
            .try_for_each(renderability::validate_stroke_value)
            .map_err(|error| invalid(target, error.to_string())),
        (PropertyKey::LensOps, PropertyValue::LensOps(ops)) => {
            validate_lens_ops(ops).map_err(|reason| invalid(target, reason))
        }
        (PropertyKey::PathGeometry, PropertyValue::PathGeometry(path)) => path
            .validate()
            .map_err(|error| invalid(target, error.to_string())),
        (
            PropertyKey::Active
            | PropertyKey::FlipX
            | PropertyKey::FlipY
            | PropertyKey::ClipsContent,
            PropertyValue::Boolean(_),
        )
        | (PropertyKey::Flow, PropertyValue::Flow(_))
        | (PropertyKey::SelfAlign, PropertyValue::SelfAlign(_)) => Ok(()),
        _ => unreachable!("value kind validation precedes key-specific validation"),
    }
}

fn validate_layout(layout: LayoutBehavior) -> Result<(), &'static str> {
    let numbers = [
        layout.padding.top,
        layout.padding.right,
        layout.padding.bottom,
        layout.padding.left,
        layout.gap_main,
        layout.gap_cross,
    ];
    if numbers
        .iter()
        .all(|value| value.is_finite() && *value >= 0.0)
    {
        Ok(())
    } else {
        Err("layout padding and gaps must be finite and non-negative")
    }
}

fn validate_corner_radius(radius: RectangularCornerRadius) -> Result<(), &'static str> {
    let values = [
        radius.tl.rx,
        radius.tl.ry,
        radius.tr.rx,
        radius.tr.ry,
        radius.br.rx,
        radius.br.ry,
        radius.bl.rx,
        radius.bl.ry,
    ];
    if values
        .iter()
        .all(|value| value.is_finite() && *value >= 0.0)
    {
        Ok(())
    } else {
        Err("corner radii must be finite and non-negative")
    }
}

fn validate_strokes(
    payload: &Payload,
    strokes: &[Stroke],
    corner_smoothing: CornerSmoothing,
    path_geometry: Option<&PathGeometry>,
) -> Result<(), String> {
    for stroke in strokes {
        let result = match path_geometry {
            Some(path_geometry) => renderability::validate_stroke_with_path_geometry(
                stroke,
                payload,
                corner_smoothing,
                path_geometry,
            ),
            None => renderability::validate_stroke(stroke, payload, corner_smoothing),
        };
        result.map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn validate_lens_ops(ops: &[LensOp]) -> Result<(), String> {
    for (index, op) in ops.iter().enumerate() {
        let finite = match op {
            LensOp::Translate { x, y } | LensOp::Scale { x, y } => x.is_finite() && y.is_finite(),
            LensOp::Rotate { deg } => deg.is_finite(),
            LensOp::Skew { x_deg, y_deg } => x_deg.is_finite() && y_deg.is_finite(),
            LensOp::Matrix { m } => m.iter().all(|value| value.is_finite()),
        };
        if !finite {
            return Err(format!(
                "lens operation {index} must contain only finite numbers"
            ));
        }
    }
    Ok(())
}
