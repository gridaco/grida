//! Wire encoding of the mutation vocabulary — `DOC-3` made literal.
//!
//! `crates/grida_editor/docs/document.md` requires mutations to be serializable
//! data; `docs/wg/canvas/io.md` and `docs/wg/feat-crdt/sync.md` are the
//! two consumers: clipboard fragments (self-describing, versioned,
//! never process-local pointers — IO-5) and the sync operation stream.
//! The `grida` engine's `Node` records do not derive serde, so this
//! module owns the wire types and the mapping.
//!
//! ## Envelope
//!
//! Everything that crosses a process boundary travels as an
//! [`Envelope`]: `{ "format": "grida-editor/x", "version": 1,
//! "payload": … }`. Readers reject unknown formats and newer versions.
//!
//! ## Fidelity — what survives the wire (honest subset)
//!
//! A [`WireNode`] carries the property set the editor can author (the
//! M1 [`PropPatch`] domain) plus kind and children:
//!
//! - node kind — the [`WireNodeKind`] set only (kinds the editor's
//!   property vocabulary covers; see below);
//! - display name, `active`, `opacity`;
//! - single solid fill (when the node's fills are exactly one solid
//!   paint; anything else degrades to the receiver's factory default
//!   paints);
//! - position (absolute translation components) and concrete size;
//! - rotation, text content (Text kind), the vector network (Vector
//!   kind — as a compact `polyline` when the network is one, in full
//!   [`WireVectorNetwork`] form otherwise; region *paints* do not ride,
//!   matching the single-solid-fill degradation), and the line
//!   end-marker (the arrow tool) — the authoring vocabulary
//!   (`docs/wg/canvas/tool.md`, `docs/wg/feat-vector-network/vector-edit.md`).
//!
//! Strokes, effects, image sources, and kinds outside [`WireNodeKind`]
//! do **not** survive; encoding a node of such a kind is an error
//! ([`WireError::UnsupportedKind`]) rather than a silent lossy pass —
//! copy/sync of those is out of the M1 domain and reported as such.
//!
//! The [`WirePatch`] mutation path, by contrast, mirrors the **full**
//! [`PropPatch`] M1 domain field-for-field (`blend_mode`,
//! `corner_radius`, `point_count`, `clips_content`, `text_align`
//! included) — a `Patch` the editor can author always round-trips
//! (`DOC-3`). Both `From` directions destructure their source so a new
//! `PropPatch` field cannot be silently dropped.
//!
//! Full-fidelity fragment encoding is the `.grida` format's job
//! (document save uses it — see [`crate::io`]); the wire subset will
//! grow with the editor's authoring vocabulary.

use serde::{Deserialize, Serialize};

use grida::cg::prelude::{
    BlendMode, CGColor, LayerBlendMode, Paints, StrokeMarkerPreset, TextAlign,
};
use grida::node::factory::NodeFactory;
use grida::node::schema::{Node, NodeTrait};
use grida::runtime::invalidation::ChangeKind;

use crate::document::{self, ChangeSummary, Fragment, Guide, Id, Mutation, PropPatch};

/// The wire format identifier.
pub const FORMAT: &str = "grida-editor/x";
/// The current wire format version.
pub const VERSION: u32 = 1;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/// The versioned, self-describing wire envelope.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Envelope {
    /// Always [`FORMAT`].
    pub format: String,
    /// Wire format version ([`VERSION`]).
    pub version: u32,
    /// The carried payload.
    pub payload: Payload,
}

impl Envelope {
    /// Wrap a payload in a current-version envelope.
    pub fn new(payload: Payload) -> Self {
        Self {
            format: FORMAT.to_string(),
            version: VERSION,
            payload,
        }
    }

    /// Serialize to a JSON string.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("invariant: wire types serialize infallibly")
    }

    /// Parse and validate an envelope from JSON.
    pub fn from_json(json: &str) -> Result<Self, WireError> {
        let envelope: Envelope = serde_json::from_str(json).map_err(WireError::Json)?;
        if envelope.format != FORMAT {
            return Err(WireError::Format(envelope.format));
        }
        if envelope.version > VERSION {
            return Err(WireError::Version(envelope.version));
        }
        Ok(envelope)
    }
}

/// What an envelope carries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Payload {
    /// Clipboard fragments: whole node subtrees in document order,
    /// self-contained (IO clipboard doctrine).
    Fragments { fragments: Vec<WireNode> },
    /// A sync protocol message (`docs/wg/feat-crdt/sync.md`).
    Sync { msg: Msg },
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Why wire encoding/decoding failed.
#[derive(Debug)]
pub enum WireError {
    /// The JSON was not a valid envelope.
    Json(serde_json::Error),
    /// The envelope's `format` field is not [`FORMAT`].
    Format(String),
    /// The envelope's `version` is newer than this reader supports.
    Version(u32),
    /// A node kind outside the wire subset (see module docs).
    UnsupportedKind(String),
}

impl std::fmt::Display for WireError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WireError::Json(e) => write!(f, "invalid wire JSON: {e}"),
            WireError::Format(got) => {
                write!(f, "unknown wire format {got:?} (expected {FORMAT:?})")
            }
            WireError::Version(got) => {
                write!(f, "wire version {got} is newer than supported ({VERSION})")
            }
            WireError::UnsupportedKind(kind) => {
                write!(f, "node kind {kind} is outside the wire subset")
            }
        }
    }
}

impl std::error::Error for WireError {}

// ---------------------------------------------------------------------------
// Wire node (fragment subtrees)
// ---------------------------------------------------------------------------

/// Node kinds representable on the wire (see module docs for the
/// fidelity contract).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireNodeKind {
    Rectangle,
    Ellipse,
    RegularPolygon,
    RegularStarPolygon,
    Line,
    Group,
    Container,
    Tray,
    Text,
    Vector,
}

/// A [`Fragment`] on the wire: one node subtree, ids included.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireNode {
    /// Stable id (paste re-mints these — IO-3; sync preserves them).
    pub id: Id,
    pub kind: WireNodeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub active: bool,
    pub opacity: f32,
    /// Single solid fill; `None` = not exactly one solid paint
    /// (receiver keeps its factory default paints — module docs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<CGColor>,
    /// Layer blend mode (kinds that carry one).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<WireBlendMode>,
    /// Uniform corner radius (shape kinds that carry one).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f32>,
    /// Regular-polygon / star point count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub point_count: Option<usize>,
    /// Container content-clipping flag.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clips_content: Option<bool>,
    /// Horizontal text alignment (Text kind).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<TextAlign>,
    /// Absolute translation components `[x, y]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<(f32, f32)>,
    /// Concrete size `[w, h]` (kinds with a plain `Size` only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<(f32, f32)>,
    /// Rotation in radians (transform-based kinds; omitted when zero).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
    /// Text content (Text kind).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Local polyline vertices (Vector kind — the pencil domain).
    /// Emitted when the network *is* a polyline; the compact,
    /// backward-compatible form.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub polyline: Option<Vec<(f32, f32)>>,
    /// Full vector network (Vector kind), emitted when the network is
    /// richer than a polyline. Decode prefers this over `polyline`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<WireVectorNetwork>,
    /// End-marker preset (Line kind — the arrow tool, `TOOL-9`).
    /// Carries the *actual* preset so a non-triangle marker round-trips
    /// faithfully (`DOC-3`); `None` = no end marker.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker_end: Option<StrokeMarkerPreset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<WireNode>,
}

/// The wire kind of a live node record, if it is in the subset.
fn wire_kind(node: &Node) -> Result<WireNodeKind, WireError> {
    match node {
        Node::Rectangle(_) => Ok(WireNodeKind::Rectangle),
        Node::Ellipse(_) => Ok(WireNodeKind::Ellipse),
        Node::RegularPolygon(_) => Ok(WireNodeKind::RegularPolygon),
        Node::RegularStarPolygon(_) => Ok(WireNodeKind::RegularStarPolygon),
        Node::Line(_) => Ok(WireNodeKind::Line),
        Node::Group(_) => Ok(WireNodeKind::Group),
        Node::Container(_) => Ok(WireNodeKind::Container),
        Node::Tray(_) => Ok(WireNodeKind::Tray),
        Node::TextSpan(_) => Ok(WireNodeKind::Text),
        Node::Vector(_) => Ok(WireNodeKind::Vector),
        other => Err(WireError::UnsupportedKind(
            match other {
                Node::InitialContainer(_) => "InitialContainer",
                Node::Error(_) => "Error",
                Node::Polygon(_) => "Polygon",
                Node::AttributedText(_) => "AttributedText",
                Node::Path(_) => "Path",
                Node::BooleanOperation(_) => "BooleanOperation",
                Node::Image(_) => "Image",
                Node::MarkdownEmbed(_) => "MarkdownEmbed",
                Node::HTMLEmbed(_) => "HTMLEmbed",
                _ => "unknown",
            }
            .to_string(),
        )),
    }
}

// ---------------------------------------------------------------------------
// Wire vector network
// ---------------------------------------------------------------------------

/// A vector network segment on the wire: vertex indices plus the two
/// endpoint-relative tangents (`vector-edit.md` network model).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireVectorSegment {
    pub a: usize,
    pub b: usize,
    pub ta: (f32, f32),
    pub tb: (f32, f32),
}

/// A region on the wire: loops of segment indices plus the fill rule.
/// Region paints do not ride (module docs — the fidelity subset).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireVectorRegion {
    pub loops: Vec<Vec<usize>>,
    pub fill_rule: grida::cg::prelude::FillRule,
}

/// A full vector network on the wire.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireVectorNetwork {
    pub vertices: Vec<(f32, f32)>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub segments: Vec<WireVectorSegment>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub regions: Vec<WireVectorRegion>,
}

impl From<&grida::vectornetwork::VectorNetwork> for WireVectorNetwork {
    fn from(network: &grida::vectornetwork::VectorNetwork) -> Self {
        Self {
            vertices: network.vertices.clone(),
            segments: network
                .segments
                .iter()
                .map(|s| WireVectorSegment {
                    a: s.a,
                    b: s.b,
                    ta: s.ta,
                    tb: s.tb,
                })
                .collect(),
            regions: network
                .regions
                .iter()
                .map(|r| WireVectorRegion {
                    loops: r.loops.iter().map(|l| l.0.clone()).collect(),
                    fill_rule: r.fill_rule,
                })
                .collect(),
        }
    }
}

impl From<&WireVectorNetwork> for grida::vectornetwork::VectorNetwork {
    fn from(wire: &WireVectorNetwork) -> Self {
        // Defensive decode: a fragment can arrive from another process
        // or an older version (`IO-5`), so its indices are untrusted.
        // Drop any segment that references a missing vertex, remap the
        // survivors, and drop any region loop that referenced a dropped
        // segment — keeping the network internally consistent so nothing
        // downstream indexes out of range (an adversarial fragment must
        // never panic the editor). For a network the editor itself
        // encoded every index is in range, so this is the identity and
        // the round-trip is exact. (A hard `WireError` would be stricter
        // but requires threading `Result` through the public decode API.)
        let vcount = wire.vertices.len();
        let mut remap: Vec<Option<usize>> = vec![None; wire.segments.len()];
        let mut segments = Vec::with_capacity(wire.segments.len());
        for (i, s) in wire.segments.iter().enumerate() {
            if s.a < vcount && s.b < vcount {
                remap[i] = Some(segments.len());
                segments.push(grida::vectornetwork::VectorNetworkSegment {
                    a: s.a,
                    b: s.b,
                    ta: s.ta,
                    tb: s.tb,
                });
            }
        }
        let regions = wire
            .regions
            .iter()
            .filter_map(|r| {
                // A loop with any dangling segment index is geometrically
                // meaningless, so drop it whole; a region that loses all
                // its loops is dropped in turn.
                let loops: Vec<_> = r
                    .loops
                    .iter()
                    .filter_map(|l| {
                        l.iter()
                            .map(|si| remap.get(*si).copied().flatten())
                            .collect::<Option<Vec<usize>>>()
                            .map(grida::vectornetwork::VectorNetworkLoop)
                    })
                    .collect();
                if loops.is_empty() && !r.loops.is_empty() {
                    None
                } else {
                    Some(grida::vectornetwork::VectorNetworkRegion {
                        loops,
                        fill_rule: r.fill_rule,
                        fills: None,
                    })
                }
            })
            .collect();
        Self {
            vertices: wire.vertices.clone(),
            segments,
            regions,
        }
    }
}

/// A fresh factory node record for a wire kind.
fn factory_node(kind: WireNodeKind) -> Node {
    let nf = NodeFactory::new();
    match kind {
        WireNodeKind::Rectangle => Node::Rectangle(nf.create_rectangle_node()),
        WireNodeKind::Ellipse => Node::Ellipse(nf.create_ellipse_node()),
        WireNodeKind::RegularPolygon => Node::RegularPolygon(nf.create_regular_polygon_node()),
        WireNodeKind::RegularStarPolygon => {
            Node::RegularStarPolygon(nf.create_regular_star_polygon_node())
        }
        WireNodeKind::Line => Node::Line(nf.create_line_node()),
        WireNodeKind::Group => Node::Group(nf.create_group_node()),
        WireNodeKind::Container => Node::Container(nf.create_container_node()),
        WireNodeKind::Tray => Node::Tray(nf.create_tray_node()),
        WireNodeKind::Text => Node::TextSpan(nf.create_text_span_node()),
        WireNodeKind::Vector => crate::tool::pencil_fragment(String::new(), [0.0, 0.0], &[]).node,
    }
}

/// Encode a fragment subtree for the wire.
pub fn encode_fragment(fragment: &Fragment) -> Result<WireNode, WireError> {
    let rotation = document::node_rotation(&fragment.node).filter(|r| *r != 0.0);
    let marker_end = match &fragment.node {
        Node::Line(n) if !matches!(n.marker_end_shape, StrokeMarkerPreset::None) => {
            Some(n.marker_end_shape)
        }
        _ => None,
    };
    // Vector: the compact polyline form when the network is one, the
    // full network form otherwise — never both.
    let polyline = document::node_vector_polyline(&fragment.node);
    let network = if polyline.is_none() {
        document::node_vector_network(&fragment.node).map(WireVectorNetwork::from)
    } else {
        None
    };
    Ok(WireNode {
        id: fragment.id.clone(),
        kind: wire_kind(&fragment.node)?,
        name: fragment.name.clone(),
        active: fragment.node.active(),
        opacity: fragment.node.opacity(),
        fill: document::single_solid_fill(&fragment.node),
        blend_mode: document::node_blend_mode(&fragment.node).map(WireBlendMode::from),
        corner_radius: document::node_corner_radius(&fragment.node),
        point_count: document::node_point_count(&fragment.node),
        clips_content: document::node_clips_content(&fragment.node),
        text_align: document::node_text_align(&fragment.node),
        position: document::node_position(&fragment.node),
        size: document::node_size(&fragment.node),
        rotation,
        text: document::node_text(&fragment.node),
        polyline,
        network,
        marker_end,
        children: fragment
            .children
            .iter()
            .map(encode_fragment)
            .collect::<Result<_, _>>()?,
    })
}

/// Decode a wire subtree back into a [`Fragment`] (factory node of the
/// kind, wire properties applied on top).
pub fn decode_fragment(wire: &WireNode) -> Fragment {
    let mut node = factory_node(wire.kind);
    document::set_active(&mut node, wire.active);
    document::set_opacity(&mut node, wire.opacity);
    if let Some(color) = wire.fill {
        document::set_fill_solid(&mut node, color);
    }
    if let Some(blend_mode) = wire.blend_mode {
        document::set_blend_mode(&mut node, blend_mode.into());
    }
    if let Some(radius) = wire.corner_radius {
        document::set_corner_radius(&mut node, radius);
    }
    if let Some(count) = wire.point_count {
        document::set_point_count(&mut node, count);
    }
    if let Some(clip) = wire.clips_content {
        document::set_clips_content(&mut node, clip);
    }
    if let Some(align) = wire.text_align {
        document::set_text_align(&mut node, align);
    }
    if let Some((x, y)) = wire.position {
        document::set_position(&mut node, x, y);
    }
    if let Some((w, h)) = wire.size {
        document::set_size(&mut node, Some(w), Some(h));
    }
    if let Some(angle) = wire.rotation {
        document::set_rotation(&mut node, angle);
    }
    if let Some(text) = &wire.text {
        document::set_text(&mut node, text);
    }
    if let Some(network) = &wire.network {
        document::set_vector_network(&mut node, &network.into());
    } else if let Some(points) = &wire.polyline {
        document::set_vector_polyline(&mut node, points);
    }
    if let Some(preset) = wire.marker_end
        && let Node::Line(n) = &mut node
    {
        n.marker_end_shape = preset;
    }
    Fragment {
        id: wire.id.clone(),
        name: wire.name.clone(),
        node,
        children: wire.children.iter().map(decode_fragment).collect(),
    }
}

// ---------------------------------------------------------------------------
// Wire mutations
// ---------------------------------------------------------------------------

/// [`PropPatch`] on the wire (field-for-field mirror).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct WirePatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill_solid: Option<CGColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fills: Option<Paints>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<WireBlendMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub point_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clips_content: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<TextAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<(f32, f32)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<(Option<f32>, Option<f32>)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vector_polyline: Option<Vec<(f32, f32)>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vector_network: Option<WireVectorNetwork>,
}

impl From<&PropPatch> for WirePatch {
    fn from(set: &PropPatch) -> Self {
        // Destructure so a new `PropPatch` field must be handled here
        // until decided — the wire mirror's exhaustiveness guard. A
        // field silently missed at encode is a `DOC-3` round-trip hole
        // (copy/paste and sync would drop it).
        let PropPatch {
            name,
            active,
            opacity,
            fill_solid,
            fills,
            blend_mode,
            corner_radius,
            point_count,
            clips_content,
            text_align,
            position,
            size,
            rotation,
            text,
            vector_polyline,
            vector_network,
        } = set;
        Self {
            name: name.clone(),
            active: *active,
            opacity: *opacity,
            fill_solid: *fill_solid,
            fills: fills.clone(),
            blend_mode: blend_mode.map(WireBlendMode::from),
            corner_radius: *corner_radius,
            point_count: *point_count,
            clips_content: *clips_content,
            text_align: *text_align,
            position: *position,
            size: *size,
            rotation: *rotation,
            text: text.clone(),
            vector_polyline: vector_polyline.clone(),
            vector_network: vector_network.as_ref().map(WireVectorNetwork::from),
        }
    }
}

impl From<&WirePatch> for PropPatch {
    fn from(set: &WirePatch) -> Self {
        // Mirror of the encode guard: destructure so decode stays
        // exhaustive over the wire fields.
        let WirePatch {
            name,
            active,
            opacity,
            fill_solid,
            fills,
            blend_mode,
            corner_radius,
            point_count,
            clips_content,
            text_align,
            position,
            size,
            rotation,
            text,
            vector_polyline,
            vector_network,
        } = set;
        Self {
            name: name.clone(),
            active: *active,
            opacity: *opacity,
            fill_solid: *fill_solid,
            fills: fills.clone(),
            blend_mode: blend_mode.map(Into::into),
            corner_radius: *corner_radius,
            point_count: *point_count,
            clips_content: *clips_content,
            text_align: *text_align,
            position: *position,
            size: *size,
            rotation: *rotation,
            text: text.clone(),
            vector_polyline: vector_polyline.clone(),
            vector_network: vector_network.as_ref().map(Into::into),
        }
    }
}

/// A ruler guide on the wire (`ruler.md` — the guide domain).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WireGuide {
    /// `"x"` or `"y"`.
    pub axis: WireAxis,
    pub offset: f32,
}

/// [`math2::vector2::Axis`] on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireAxis {
    X,
    Y,
}

/// [`LayerBlendMode`] on the wire. `LayerBlendMode` itself derives only
/// `Deserialize` (it is `#[serde(untagged)]`), so the mutation
/// vocabulary gets an explicit serializable mirror — `BlendMode` is
/// already `Serialize`, so there is no encoding obstacle (`DOC-3`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireBlendMode {
    PassThrough,
    Blend(BlendMode),
}

impl From<LayerBlendMode> for WireBlendMode {
    fn from(m: LayerBlendMode) -> Self {
        match m {
            LayerBlendMode::PassThrough => WireBlendMode::PassThrough,
            LayerBlendMode::Blend(b) => WireBlendMode::Blend(b),
        }
    }
}

impl From<WireBlendMode> for LayerBlendMode {
    fn from(m: WireBlendMode) -> Self {
        match m {
            WireBlendMode::PassThrough => LayerBlendMode::PassThrough,
            WireBlendMode::Blend(b) => LayerBlendMode::Blend(b),
        }
    }
}

impl From<Guide> for WireGuide {
    fn from(g: Guide) -> Self {
        Self {
            axis: match g.axis {
                math2::vector2::Axis::X => WireAxis::X,
                math2::vector2::Axis::Y => WireAxis::Y,
            },
            offset: g.offset,
        }
    }
}

impl From<WireGuide> for Guide {
    fn from(g: WireGuide) -> Self {
        Self {
            axis: match g.axis {
                WireAxis::X => math2::vector2::Axis::X,
                WireAxis::Y => math2::vector2::Axis::Y,
            },
            offset: g.offset,
        }
    }
}

/// [`Mutation`] on the wire.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum WireMutation {
    Insert {
        parent: Option<Id>,
        index: usize,
        fragment: WireNode,
    },
    Remove {
        id: Id,
    },
    Patch {
        id: Id,
        set: WirePatch,
    },
    Move {
        ids: Vec<Id>,
        parent: Option<Id>,
        index: usize,
    },
    GuideInsert {
        index: usize,
        guide: WireGuide,
    },
    GuideRemove {
        index: usize,
    },
    GuideSet {
        index: usize,
        offset: f32,
    },
    SceneBackground {
        color: Option<CGColor>,
    },
}

/// Encode one mutation.
pub fn encode_mutation(mutation: &Mutation) -> Result<WireMutation, WireError> {
    Ok(match mutation {
        Mutation::Insert {
            parent,
            index,
            fragment,
        } => WireMutation::Insert {
            parent: parent.clone(),
            index: *index,
            fragment: encode_fragment(fragment)?,
        },
        Mutation::Remove { id } => WireMutation::Remove { id: id.clone() },
        Mutation::Patch { id, set } => WireMutation::Patch {
            id: id.clone(),
            set: set.into(),
        },
        Mutation::Move { ids, parent, index } => WireMutation::Move {
            ids: ids.clone(),
            parent: parent.clone(),
            index: *index,
        },
        Mutation::GuideInsert { index, guide } => WireMutation::GuideInsert {
            index: *index,
            guide: (*guide).into(),
        },
        Mutation::GuideRemove { index } => WireMutation::GuideRemove { index: *index },
        Mutation::GuideSet { index, offset } => WireMutation::GuideSet {
            index: *index,
            offset: *offset,
        },
        Mutation::SceneBackground { color } => WireMutation::SceneBackground { color: *color },
    })
}

/// Decode one mutation.
pub fn decode_mutation(wire: &WireMutation) -> Mutation {
    match wire {
        WireMutation::Insert {
            parent,
            index,
            fragment,
        } => Mutation::Insert {
            parent: parent.clone(),
            index: *index,
            fragment: Box::new(decode_fragment(fragment)),
        },
        WireMutation::Remove { id } => Mutation::Remove { id: id.clone() },
        WireMutation::Patch { id, set } => Mutation::Patch {
            id: id.clone(),
            set: set.into(),
        },
        WireMutation::Move { ids, parent, index } => Mutation::Move {
            ids: ids.clone(),
            parent: parent.clone(),
            index: *index,
        },
        WireMutation::GuideInsert { index, guide } => Mutation::GuideInsert {
            index: *index,
            guide: (*guide).into(),
        },
        WireMutation::GuideRemove { index } => Mutation::GuideRemove { index: *index },
        WireMutation::GuideSet { index, offset } => Mutation::GuideSet {
            index: *index,
            offset: *offset,
        },
        WireMutation::SceneBackground { color } => Mutation::SceneBackground { color: *color },
    }
}

/// Encode a mutation batch.
pub fn encode_batch(batch: &[Mutation]) -> Result<Vec<WireMutation>, WireError> {
    batch.iter().map(encode_mutation).collect()
}

/// Decode a mutation batch.
pub fn decode_batch(batch: &[WireMutation]) -> Vec<Mutation> {
    batch.iter().map(decode_mutation).collect()
}

// ---------------------------------------------------------------------------
// Wire change summary
// ---------------------------------------------------------------------------

/// [`ChangeKind`] on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WireChangeKind {
    None,
    Layout,
    Paint,
    Full,
}

impl From<ChangeKind> for WireChangeKind {
    fn from(kind: ChangeKind) -> Self {
        match kind {
            ChangeKind::None => WireChangeKind::None,
            ChangeKind::Layout => WireChangeKind::Layout,
            ChangeKind::Paint => WireChangeKind::Paint,
            ChangeKind::Full => WireChangeKind::Full,
        }
    }
}

impl From<WireChangeKind> for ChangeKind {
    fn from(kind: WireChangeKind) -> Self {
        match kind {
            WireChangeKind::None => ChangeKind::None,
            WireChangeKind::Layout => ChangeKind::Layout,
            WireChangeKind::Paint => ChangeKind::Paint,
            WireChangeKind::Full => ChangeKind::Full,
        }
    }
}

/// [`ChangeSummary`] on the wire.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct WireChangeSummary {
    pub nodes: Vec<(Id, WireChangeKind)>,
    #[serde(default)]
    pub structural: bool,
    #[serde(default)]
    pub guides: bool,
    #[serde(default)]
    pub background: bool,
}

impl From<&ChangeSummary> for WireChangeSummary {
    fn from(summary: &ChangeSummary) -> Self {
        Self {
            nodes: summary
                .nodes
                .iter()
                .map(|(id, kind)| (id.clone(), (*kind).into()))
                .collect(),
            structural: summary.structural,
            guides: summary.guides,
            background: summary.background,
        }
    }
}

impl From<&WireChangeSummary> for ChangeSummary {
    fn from(summary: &WireChangeSummary) -> Self {
        Self {
            nodes: summary
                .nodes
                .iter()
                .map(|(id, kind)| (id.clone(), (*kind).into()))
                .collect(),
            structural: summary.structural,
            guides: summary.guides,
            background: summary.background,
        }
    }
}

// ---------------------------------------------------------------------------
// Sync protocol messages
// ---------------------------------------------------------------------------

/// Sync protocol messages (`docs/wg/feat-crdt/sync.md`). Content mutations
/// only; presence is out of the M1 scope. Operations carry monotonic
/// per-sender sequence ids for exactly-once application (SYNC-7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "msg", rename_all = "snake_case")]
pub enum Msg {
    /// Authority → new peer: the canonical document (`.grida` bytes)
    /// and the global sequence number it reflects ("fetch canonical
    /// state" on join). `guides` carries the scene's guide set
    /// explicitly — the `.grida` bytes cannot (the engine encoder
    /// does not map guides; the persistence gap `ruler.md` names).
    Welcome {
        doc: Vec<u8>,
        global: u64,
        #[serde(default)]
        guides: Vec<WireGuide>,
    },
    /// Client → authority: a local batch, per-sender sequenced.
    Submit {
        sender: String,
        seq: u64,
        batch: Vec<WireMutation>,
    },
    /// Authority → everyone (echo-ack to the sender included): one
    /// batch in canonical order.
    Commit {
        global: u64,
        sender: String,
        seq: u64,
        batch: Vec<WireMutation>,
    },
}
