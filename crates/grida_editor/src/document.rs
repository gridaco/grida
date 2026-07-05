//! Document working copy and the closed mutation vocabulary.
//!
//! Reference implementation of `crates/grida_editor/docs/document.md` (`DOC-*`
//! contracts). The [`WorkingCopy`] wraps a [`grida::node::schema::Scene`]
//! and addresses nodes by **stable ids** ([`Id`]); every contract is
//! stated in terms of stable ids, never the internal `u64` handles.
//!
//! ## Adaptations to the real `SceneGraph` API
//!
//! - The `grida` scene graph has no API to re-insert an existing node id
//!   into the scene `roots` list (only `append_child` of a *new* node and
//!   `remove_from_roots`). The working copy therefore wraps all scene
//!   roots under a single synthetic root node it owns; `parent: None`
//!   in the mutation vocabulary maps to that wrapper. This gives every
//!   structural operation a real parent id, so ordering is uniformly
//!   handled by `set_children` / `add_child_at`.
//! - Batch atomicity (`DOC-4`) is implemented as **apply with
//!   rollback-via-inverse**: mutations apply one by one; on the first
//!   failure the already-applied prefix is undone by applying its
//!   accumulated inverses in reverse order, then the error (naming the
//!   offending mutation index) is returned.
//!
//! ## M1 property-domain restrictions (documented, not faked)
//!
//! - `fill_solid` patches require the node's current fills to be exactly
//!   one solid paint — otherwise the inverse (also a `fill_solid` patch)
//!   could not restore the prior paint stack.
//! - `size` patches are supported only on node kinds with a concrete
//!   `Size` (Rectangle, Ellipse, RegularPolygon, RegularStarPolygon,
//!   Line, Image, Error, HTMLEmbed). Auto-sized kinds (`Option<f32>`
//!   dims) are rejected as `Unsupported` because "auto" is not
//!   representable in the patch, so inversion would be lossy.
//! - Display names live in the scene graph's name map, which has no
//!   removal API; an absent name and an empty-string name are treated
//!   as equivalent (normalized in [`WorkingCopy::structure_eq`]).

use std::collections::{HashMap, HashSet};

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::runtime::invalidation::ChangeKind;

/// Stable node id at the editor boundary.
///
/// Maps to internal `u64` node ids via a bidirectional map owned by the
/// [`WorkingCopy`]. Stable ids persist in files and across instances.
pub type Id = String;

/// A ruler guide (`docs/wg/canvas/ruler.md`): the axis-aligned line
/// `axis = offset`, stored per scene as document truth (`RUL-4`).
/// Re-exported from `math2` so the document, the snap session
/// ([`crate::snap`]), and interpretation all speak one type.
pub use math2::snap::canvas::Guide;

// ---------------------------------------------------------------------------
// Mutation vocabulary
// ---------------------------------------------------------------------------

/// A serializable node subtree carried by [`Mutation::Insert`].
///
/// Plain data (no closures): the node record, its desired stable id,
/// optional display name, and children in document order. Carrying the
/// stable ids is what lets a `Remove` inverse restore identity (`DOC-2`
/// round-trips include ids).
#[derive(Debug, Clone)]
pub struct Fragment {
    /// Stable id the inserted node will be addressable by.
    pub id: Id,
    /// Optional display name.
    pub name: Option<String>,
    /// The node record (children links are carried by `children`).
    pub node: Node,
    /// Child subtrees in document order.
    pub children: Vec<Fragment>,
}

impl Fragment {
    /// All stable ids in this fragment, pre-order.
    pub(crate) fn ids(&self) -> Vec<&Id> {
        let mut out = vec![&self.id];
        for c in &self.children {
            out.extend(c.ids());
        }
        out
    }
}

/// A sparse property patch for the M1 property subset.
///
/// `None` fields are left untouched. See the module docs for the
/// per-field support domain.
#[derive(Debug, Clone, Default)]
pub struct PropPatch {
    /// Display name.
    pub name: Option<String>,
    /// Visibility flag.
    pub active: Option<bool>,
    /// Node opacity (0.0–1.0).
    pub opacity: Option<f32>,
    /// Replace the fills with a single solid color. The narrow M1
    /// convenience domain, kept for the wire fragment metadata and the
    /// solid hot path; [`fills`](Self::fills) is the general domain.
    pub fill_solid: Option<CGColor>,
    /// Replace the node's whole fill stack (bottom→top paint order) —
    /// the general paint-list domain (`properties-sheet.md` Fills). Any
    /// paint kind (solid / gradient / image); the inverse carries the
    /// prior stack, so inversion is exact on any fill-bearing node.
    /// Supersedes [`fill_solid`](Self::fill_solid) for panel authoring;
    /// mutually independent in one patch (both write `fills`, so a patch
    /// setting both is rejected).
    pub fills: Option<Paints>,
    /// Replace the node's whole stroke paint stack — the general
    /// stroke-paint domain (`properties-sheet.md` Strokes). Same shape
    /// and invertibility as [`fills`](Self::fills); a different set of
    /// node kinds carries it (includes Line and Image, which have no
    /// fills).
    pub strokes: Option<Paints>,
    /// Uniform stroke weight (px). Normalized across the engine's three
    /// width representations (`StrokeWidth` enum, `SingularStrokeWidth`,
    /// plain `f32`) — the panel authors a single uniform value; per-side
    /// widths are a later refinement.
    pub stroke_width: Option<f32>,
    /// Stroke alignment (inside / center / outside). Supported on the
    /// `stroke_style` kinds (the common shapes).
    pub stroke_align: Option<StrokeAlign>,
    /// Stroke line cap (butt / round / square).
    pub stroke_cap: Option<StrokeCap>,
    /// Stroke line join (miter / round / bevel).
    pub stroke_join: Option<StrokeJoin>,
    /// Miter limit (applies when the join is miter).
    pub stroke_miter: Option<f32>,
    /// Dash pattern. An empty vec clears it (solid); a non-empty vec is
    /// the dash/gap sequence.
    pub stroke_dash: Option<Vec<f32>>,
    /// The layer-blur effect slot (single per layer — `LayerEffects.blur`).
    /// The outer `Option` says the patch touches the slot; the inner says
    /// the new value (`Some(_)` sets/replaces the blur, `None` removes
    /// it). The inverse carries the whole prior slot, so undo restores it
    /// exactly. v1 authors the `Gaussian` variant; progressive blur is a
    /// later refinement. Effect-capable node kinds only (`PROP-1`).
    pub layer_blur: Option<Option<FeLayerBlur>>,
    /// The node's whole drop/inner shadow list (bottom→top), replaced
    /// wholesale — the multi-valued shadow domain (`properties-sheet.md`
    /// Effects). Same replace-and-invert shape as [`fills`](Self::fills);
    /// the inverse carries the prior list, so inversion is exact.
    pub shadows: Option<Vec<FilterShadowEffect>>,
    /// Layer blend mode (compositing). Unsupported on `InitialContainer`
    /// and `Error`.
    pub blend_mode: Option<LayerBlendMode>,
    /// Uniform corner radius (shape kinds that carry one).
    pub corner_radius: Option<f32>,
    /// Regular-polygon / star point count (3–60).
    pub point_count: Option<usize>,
    /// Container content clipping.
    pub clips_content: Option<bool>,
    /// Horizontal text alignment (text kinds).
    pub text_align: Option<TextAlign>,
    /// Vertical text alignment within the text box (text kinds).
    pub text_align_vertical: Option<TextAlignVertical>,
    /// Font size in px (text kinds). Authored on the node-level style
    /// (`TextSpan.text_style` / `AttributedText.default_style`); per-run
    /// overrides are a later refinement.
    pub font_size: Option<f32>,
    /// Font weight (1–1000, text kinds).
    pub font_weight: Option<u32>,
    /// Italic flag (text kinds) — the engine's `font_style_italic`.
    pub font_italic: Option<bool>,
    /// Line height (text kinds). v1 authors the `Factor` (multiplier)
    /// variant; the `Fixed`/`Normal` variants and the mode toggle are a
    /// later refinement. The inverse carries the whole prior enum, so
    /// undo restores the exact prior variant.
    pub line_height: Option<TextLineHeight>,
    /// Letter spacing (text kinds). v1 authors the `Fixed` (px) variant;
    /// the `Factor` variant and the mode toggle are a later refinement.
    pub letter_spacing: Option<TextLetterSpacing>,
    /// Absolute translation components (x, y).
    pub position: Option<(f32, f32)>,
    /// Size `(width, height)`; `None` per axis = leave that axis.
    pub size: Option<(Option<f32>, Option<f32>)>,
    /// Rotation angle in radians (transform-based node kinds only;
    /// recomposes the transform as rotation + translation, so kinds
    /// carrying scale/skew are outside the domain — see module docs).
    pub rotation: Option<f32>,
    /// Text content (TextSpan only).
    pub text: Option<String>,
    /// Replace a Vector node's network with a straight-segment
    /// polyline (vertices local to the node). Supported only when the
    /// current network is itself a polyline, so the inverse is exact —
    /// the pencil-authoring domain (`tool.md`).
    pub vector_polyline: Option<Vec<(f32, f32)>>,
    /// Replace a Vector node's network wholesale (vertices, segments
    /// with tangents, region topology) — the vector edit-mode domain
    /// (`docs/wg/feat-vector-network/vector-edit.md`). The inverse carries the prior
    /// network, so inversion is exact on any Vector node. Mutually
    /// exclusive with `vector_polyline` in one patch (both write the
    /// same property).
    pub vector_network: Option<grida::vectornetwork::VectorNetwork>,
}

/// The closed mutation vocabulary (`DOC-1`). All change flows through
/// these operations; everything higher-level composes from them.
#[derive(Debug, Clone)]
pub enum Mutation {
    /// Insert a subtree under `parent` at a document-order `index`.
    /// `parent: None` = scene root level. The fragment is boxed to keep
    /// the `Mutation` variants size-balanced.
    Insert {
        parent: Option<Id>,
        index: usize,
        fragment: Box<Fragment>,
    },
    /// Remove a node and its subtree.
    Remove { id: Id },
    /// Set one or more properties on a node.
    Patch { id: Id, set: PropPatch },
    /// Reparent/reorder nodes to `parent` at a **post-removal**
    /// document-order index (`DOC-5`).
    Move {
        ids: Vec<Id>,
        parent: Option<Id>,
        index: usize,
    },
    /// Insert a guide at `index` in the scene's guide list — the
    /// guide domain (`docs/wg/canvas/ruler.md`, `RUL-4`).
    GuideInsert { index: usize, guide: Guide },
    /// Remove the guide at `index`.
    GuideRemove { index: usize },
    /// Reposition the guide at `index`. The axis is fixed at creation
    /// (`RUL-10`): a guide repositions along its axis or is removed,
    /// never re-axed.
    GuideSet { index: usize, offset: f32 },
    /// Set the scene's background color — the `scene(op)` domain's
    /// first field (document.md; the "solid background" layer of the
    /// canvas stack, transparency-grid.md). `None` = no background:
    /// the transparency grid shows.
    SceneBackground { color: Option<CGColor> },
}

impl Mutation {
    /// Whether this mutation belongs to the guide domain (touches the
    /// guide list, never a node).
    pub(crate) fn is_guide(&self) -> bool {
        matches!(
            self,
            Mutation::GuideInsert { .. } | Mutation::GuideRemove { .. } | Mutation::GuideSet { .. }
        )
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Why a single mutation was rejected.
#[derive(Debug, Clone, PartialEq)]
pub enum MutationErrorReason {
    /// A referenced stable id does not exist.
    UnknownId(Id),
    /// An inserted stable id already exists (or repeats in a fragment),
    /// or a moved id repeats in a move.
    DuplicateId(Id),
    /// The mutation would move a node into its own subtree.
    Cycle(Id),
    /// A document-order index is out of bounds.
    IndexOutOfBounds { index: usize, len: usize },
    /// The mutation is outside the M1 support domain for this node.
    Unsupported(String),
}

/// A rejected batch (`DOC-4`): identifies the offending mutation by its
/// index in the batch plus a diagnosable reason. The document is
/// unchanged when this is returned.
#[derive(Debug, Clone, PartialEq)]
pub struct MutationError {
    /// Index of the offending mutation within the batch.
    pub index: usize,
    /// Why it was rejected.
    pub reason: MutationErrorReason,
}

impl std::fmt::Display for MutationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "mutation {} rejected: ", self.index)?;
        match &self.reason {
            MutationErrorReason::UnknownId(id) => write!(f, "unknown id {id:?}"),
            MutationErrorReason::DuplicateId(id) => write!(f, "duplicate id {id:?}"),
            MutationErrorReason::Cycle(id) => {
                write!(f, "cycle: {id:?} cannot contain its new parent")
            }
            MutationErrorReason::IndexOutOfBounds { index, len } => {
                write!(f, "index {index} out of bounds (len {len})")
            }
            MutationErrorReason::Unsupported(what) => write!(f, "unsupported: {what}"),
        }
    }
}

impl std::error::Error for MutationError {}

// ---------------------------------------------------------------------------
// Change summary
// ---------------------------------------------------------------------------

/// Which nodes an applied batch touched and in what class (`DOC-7`).
/// Produced at the choke-point; observers never diff the document.
///
/// Doubles as the unit of **damage** (`frame.md`): the editor merges
/// summaries into its damage ledger, and the presentation host drains
/// the merged summary at its reflect point.
#[derive(Debug, Clone, Default)]
pub struct ChangeSummary {
    /// One entry per touched node (deduplicated; kinds combined).
    pub nodes: Vec<(Id, ChangeKind)>,
    /// The batch changed the scene's structure (insert, remove,
    /// move) — a consumer mirroring per-node records must rebuild
    /// wholesale instead.
    pub structural: bool,
    /// The batch changed the scene's guide list (`ruler.md`).
    /// Non-structural for the renderer — guides are chrome, not
    /// content — but overlay damage for the host (the guide mirror
    /// and the strips repaint).
    pub guides: bool,
    /// The batch changed the scene's background color. Non-structural
    /// — the renderer's clear color updates in place, no scene
    /// rebuild — but a content frame (the canvas repaints).
    pub background: bool,
}

impl ChangeSummary {
    /// Add a touched node, combining kinds when the id repeats.
    pub fn push(&mut self, id: Id, kind: ChangeKind) {
        if let Some(existing) = self.nodes.iter_mut().find(|(i, _)| *i == id) {
            existing.1 = combine_kinds(existing.1, kind);
        } else {
            self.nodes.push((id, kind));
        }
    }

    /// Merge another summary into this one.
    pub fn merge(&mut self, other: &ChangeSummary) {
        for (id, kind) in &other.nodes {
            self.push(id.clone(), *kind);
        }
        self.structural |= other.structural;
        self.guides |= other.guides;
        self.background |= other.background;
    }

    /// Nothing was touched (no nodes, no structural change, no guide
    /// or background change).
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty() && !self.structural && !self.guides && !self.background
    }
}

/// Combine two change kinds for the same node into the narrowest kind
/// that covers both.
pub(crate) fn combine_kinds(a: ChangeKind, b: ChangeKind) -> ChangeKind {
    use ChangeKind::*;
    match (a, b) {
        (None, k) | (k, None) => k,
        (Full, _) | (_, Full) => Full,
        (Layout, Layout) => Layout,
        (Paint, Paint) => Paint,
        (Layout, Paint) | (Paint, Layout) => Full,
    }
}

/// The result of a successfully applied batch.
#[derive(Debug, Clone)]
pub struct Applied {
    /// Inverse batch: applying it to the post-state restores the
    /// pre-state (`DOC-2`). In reverse order of the applied batch.
    pub inverse: Vec<Mutation>,
    /// Exactly one summary per batch (`DOC-7`).
    pub summary: ChangeSummary,
}

// ---------------------------------------------------------------------------
// WorkingCopy
// ---------------------------------------------------------------------------

/// The editor's working copy of a document: a [`Scene`] plus the
/// stable-id ↔ internal-id maps. The only way to change it is
/// [`WorkingCopy::apply`] (`DOC-1`).
#[derive(Debug, Clone)]
pub struct WorkingCopy {
    scene: Scene,
    /// Synthetic root wrapper node (internal only; has no stable id).
    root: NodeId,
    to_stable: HashMap<NodeId, Id>,
    to_internal: HashMap<Id, NodeId>,
    /// Counter for minting stable ids (`n1`, `n2`, …).
    minted: u64,
    /// The scene's ruler guides (`ruler.md`, `RUL-4`): document truth
    /// mutated only through the guide domain of the vocabulary. Held
    /// beside the scene because the engine's `Scene` record has no
    /// guide field (the `.grida` schema defines one; the engine io
    /// does not map it yet — the persistence gap ruler.md names).
    guides: Vec<Guide>,
}

impl WorkingCopy {
    /// Create an empty working copy.
    pub fn new_empty(name: &str) -> Self {
        let scene = Scene {
            name: name.to_string(),
            graph: grida::node::scene_graph::SceneGraph::new(),
            background_color: Option::None,
        };
        // Empty scene: from_scene wraps zero roots.
        Self::from_scene(scene, HashMap::new())
    }

    /// Wrap an existing scene. `id_map` maps internal node ids to stable
    /// ids; nodes absent from the map get minted ids (`n1`, `n2`, …) in
    /// document order, so two loads of the same scene mint identically
    /// (`ED-6`).
    pub fn from_scene(mut scene: Scene, id_map: HashMap<NodeId, Id>) -> Self {
        let factory = NodeFactory::new();
        let root = scene
            .graph
            .append_child(Node::Group(factory.create_group_node()), Parent::Root);
        let old_roots: Vec<NodeId> = scene
            .graph
            .roots()
            .iter()
            .copied()
            .filter(|r| *r != root)
            .collect();
        scene
            .graph
            .set_children(&root, old_roots)
            .expect("invariant: wrapping scene roots under the synthetic root cannot fail");

        let mut wc = Self {
            scene,
            root,
            to_stable: HashMap::new(),
            to_internal: HashMap::new(),
            minted: 0,
            guides: Vec::new(),
        };

        // Assign stable ids in document order (deterministic minting).
        let mut order: Vec<NodeId> = Vec::new();
        wc.scene
            .graph
            .walk_preorder(&root, &mut |id| order.push(*id))
            .expect("invariant: synthetic root exists");
        for iid in order.into_iter().filter(|iid| *iid != root) {
            let stable = match id_map.get(&iid) {
                Some(s) => s.clone(),
                Option::None => wc.mint(),
            };
            wc.to_stable.insert(iid, stable.clone());
            wc.to_internal.insert(stable, iid);
        }
        wc
    }

    fn mint(&mut self) -> Id {
        loop {
            self.minted += 1;
            let candidate = format!("n{}", self.minted);
            if !self.to_internal.contains_key(&candidate) {
                return candidate;
            }
        }
    }

    // -- queries ------------------------------------------------------------

    /// Whether a stable id exists.
    pub fn contains(&self, id: &Id) -> bool {
        self.to_internal.contains_key(id)
    }

    /// Children of `parent` in document order. `None` = scene root level.
    pub fn children(&self, parent: Option<&Id>) -> Vec<Id> {
        let Some(pi) = self.resolve_parent_opt(parent) else {
            return Vec::new();
        };
        self.scene
            .graph
            .get_children(&pi)
            .map(|c| {
                c.iter()
                    .filter_map(|iid| self.to_stable.get(iid).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The scene's guides in list order (`ruler.md`).
    pub fn guides(&self) -> &[Guide] {
        &self.guides
    }

    /// The scene's background color (`None` = no background; the
    /// transparency grid shows).
    pub fn background_color(&self) -> Option<CGColor> {
        self.scene.background_color
    }

    /// The node's opacity, if the id exists.
    pub fn node_opacity(&self, id: &Id) -> Option<f32> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().map(|n| n.opacity())
    }

    /// The node's `active` flag, if the id exists.
    pub fn node_active(&self, id: &Id) -> Option<bool> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().map(|n| n.active())
    }

    /// The node's layer blend mode, or `None` for kinds that have no
    /// blend mode (`InitialContainer`, `Error`).
    pub fn node_blend_mode(&self, id: &Id) -> Option<LayerBlendMode> {
        let iid = self.to_internal.get(id)?;
        let node = self.scene.graph.get_node(iid).ok()?;
        match node {
            Node::InitialContainer(_) | Node::Error(_) => None,
            _ => Some(node.blend_mode()),
        }
    }

    /// The node's uniform corner radius (`None` for kinds without one).
    pub fn node_corner_radius(&self, id: &Id) -> Option<f32> {
        let iid = self.to_internal.get(id)?;
        node_corner_radius(self.scene.graph.get_node(iid).ok()?)
    }

    /// The node's polygon / star point count (`None` otherwise).
    pub fn node_point_count(&self, id: &Id) -> Option<usize> {
        let iid = self.to_internal.get(id)?;
        node_point_count(self.scene.graph.get_node(iid).ok()?)
    }

    /// The container's content-clipping flag (`None` for non-containers).
    pub fn node_clips_content(&self, id: &Id) -> Option<bool> {
        let iid = self.to_internal.get(id)?;
        node_clips_content(self.scene.graph.get_node(iid).ok()?)
    }

    /// The node's horizontal text alignment (`None` for non-text).
    pub fn node_text_align(&self, id: &Id) -> Option<TextAlign> {
        let iid = self.to_internal.get(id)?;
        node_text_align(self.scene.graph.get_node(iid).ok()?)
    }

    /// The node's display name (absent normalizes to `None`).
    pub fn node_name(&self, id: &Id) -> Option<String> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_name(iid).map(|s| s.to_string())
    }

    /// The node's position (absolute translation components), if the id
    /// exists and the node kind has a position (see module docs).
    pub fn node_position(&self, id: &Id) -> Option<(f32, f32)> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().and_then(node_position)
    }

    /// The node's concrete `(width, height)`, if the id exists and the
    /// node kind has a plain `Size` (the `size` patch domain — see
    /// module docs).
    pub fn node_size(&self, id: &Id) -> Option<(f32, f32)> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().and_then(node_size)
    }

    /// Whether the node is a container kind (accepts children — the
    /// hierarchy panel's "into" drop domain).
    pub fn node_is_container(&self, id: &Id) -> Option<bool> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().map(|n| {
            matches!(
                n,
                Node::Container(_)
                    | Node::InitialContainer(_)
                    | Node::Group(_)
                    | Node::Tray(_)
                    | Node::BooleanOperation(_)
            )
        })
    }

    /// Whether the node is a *spatial* adoption target — the
    /// translate drop-target domain (`docs/wg/canvas/translate.md`):
    /// containers and trays adopt children by pointer position; groups
    /// and boolean nodes are derived parents, not spatial ones, and
    /// refuse. Narrower than [`WorkingCopy::node_is_container`] (the
    /// hierarchy panel's "into" domain, which includes the derived
    /// parents).
    pub fn node_adopts(&self, id: &Id) -> Option<bool> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().map(|n| {
            matches!(
                n,
                Node::Container(_) | Node::InitialContainer(_) | Node::Tray(_)
            )
        })
    }

    /// Whether the node is a tray (`translate.md`: a tray may only
    /// enter the scene root or another tray).
    pub fn node_is_tray(&self, id: &Id) -> Option<bool> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .map(|n| matches!(n, Node::Tray(_)))
    }

    /// The node's parent: `Some(None)` for scene-root level,
    /// `Some(Some(id))` for a nested node, `None` for an unknown id.
    #[allow(clippy::option_option)]
    pub fn node_parent(&self, id: &Id) -> Option<Option<Id>> {
        let iid = self.to_internal.get(id)?;
        let pi = self.scene.graph.get_parent(iid)?;
        if pi == self.root {
            Some(None)
        } else {
            Some(self.to_stable.get(&pi).cloned())
        }
    }

    /// Partition a selection by direct parent — the substrate the
    /// structural commands read
    /// ([selection-partition.md](../../../docs/wg/canvas/ux-surface/selection-partition.md),
    /// `PART-1`). Scene/root-level members share the `None` (scene)
    /// partition. Within each partition members keep document sibling
    /// order; partitions are ordered by first appearance in `selection`.
    /// Unknown ids are dropped.
    pub fn partition_selection(&self, selection: &[Id]) -> Vec<(Option<Id>, Vec<Id>)> {
        let selected: std::collections::HashSet<&Id> = selection.iter().collect();
        let mut order: Vec<Option<Id>> = Vec::new();
        let mut seen: std::collections::HashSet<Option<Id>> = std::collections::HashSet::new();
        for id in selection {
            if let Some(parent) = self.node_parent(id)
                && seen.insert(parent.clone())
            {
                order.push(parent);
            }
        }
        order
            .into_iter()
            .map(|parent| {
                let members = self
                    .children(parent.as_ref())
                    .into_iter()
                    .filter(|c| selected.contains(c))
                    .collect();
                (parent, members)
            })
            .collect()
    }

    /// Whether the node is a *dissolvable* wrapper — a group or a
    /// boolean-operation node
    /// ([grouping.md](../../../docs/wg/canvas/grouping.md), `GRP-4`):
    /// ungroup promotes its children and removes it. A container is a
    /// frame (content), not dissolved this way.
    pub fn node_is_group(&self, id: &Id) -> bool {
        self.to_internal
            .get(id)
            .and_then(|iid| self.scene.graph.get_node(iid).ok())
            .map(|n| matches!(n, Node::Group(_) | Node::BooleanOperation(_)))
            .unwrap_or(false)
    }

    /// The node's world transform (local space → canvas/root space):
    /// the composition of every ancestor's local transform, outermost
    /// first. This is the placement the renderer paints the node at, so
    /// overlay chrome (vector edit) and pointer mapping must both
    /// project through it — projecting through the node's *own* local
    /// transform alone lands a nested node's chrome at its
    /// parent-relative offset measured from the canvas origin.
    ///
    /// Identity for an unknown id (the callers treat that as "no
    /// offset", matching the old position/rotation fallbacks).
    pub fn node_world_transform(&self, id: &Id) -> math2::transform::AffineTransform {
        use math2::transform::AffineTransform;
        // Walk node → root, collecting each level's local factor.
        let mut chain: Vec<AffineTransform> = Vec::new();
        let mut cur = Some(id.clone());
        while let Some(cid) = cur {
            if let Some(iid) = self.to_internal.get(&cid)
                && let Ok(node) = self.scene.graph.get_node(iid)
            {
                chain.push(node_local_transform(node));
            }
            cur = self.node_parent(&cid).flatten();
        }
        // Compose outermost → innermost: world = root · … · parent · node.
        let mut world = AffineTransform::identity();
        for local in chain.iter().rev() {
            world = world.compose(local);
        }
        world
    }

    /// Whether this member's position is authored by its parent's
    /// auto-layout flow rather than by the member itself — the
    /// computed-vs-authored doctrine (align.md `ALIGN-6`, nudge.md
    /// `NUDGE-4`, properties `PROP-5`). True only when the parent is a
    /// `Flex` container **and** the member participates in that flow
    /// (its own positioning is not `Absolute`). Geometric
    /// align/distribute excludes such members: the container's own
    /// alignment property owns their arrangement, and any translation
    /// would be immediately overridden by layout. Root-level and
    /// free-standing members return `false`.
    pub fn is_layout_owned(&self, id: &Id) -> bool {
        use grida::cg::types::{LayoutMode, LayoutPositioning};
        // A root-level or unknown member has no owning parent flow.
        let Some(Some(parent)) = self.node_parent(id) else {
            return false;
        };
        let is_flex_parent = self
            .to_internal
            .get(&parent)
            .and_then(|piid| self.scene.graph.get_node(piid).ok())
            .is_some_and(|node| match node {
                Node::Container(c) => c.layout_container.layout_mode == LayoutMode::Flex,
                _ => false,
            });
        if !is_flex_parent {
            return false;
        }
        // An in-flow child is layout-owned; an `Absolute` child opts out.
        let absolute = self
            .to_internal
            .get(id)
            .and_then(|iid| self.scene.graph.get_node(iid).ok())
            .map(node_layout_positioning)
            == Some(LayoutPositioning::Absolute);
        !absolute
    }

    /// The node's rotation in radians, when the kind is in the
    /// `rotation` patch domain (transform-based kinds).
    pub fn node_rotation(&self, id: &Id) -> Option<f32> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().and_then(node_rotation)
    }

    /// The node's text content (TextSpan only).
    pub fn node_text(&self, id: &Id) -> Option<String> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok().and_then(node_text)
    }

    /// The node's vector network as a polyline, when it is one (the
    /// `vector_polyline` patch domain).
    pub fn node_vector_polyline(&self, id: &Id) -> Option<Vec<(f32, f32)>> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(node_vector_polyline)
    }

    /// The node's vector network (Vector kind only) — the
    /// `vector_network` patch domain.
    pub fn node_vector_network(&self, id: &Id) -> Option<grida::vectornetwork::VectorNetwork> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(node_vector_network)
            .cloned()
    }

    /// Whether any of the node's fills is an image paint (the
    /// edit-mode dispatch table's image-fill row, MODE-2).
    pub fn node_has_image_fill(&self, id: &Id) -> bool {
        let Some(iid) = self.to_internal.get(id) else {
            return false;
        };
        self.scene
            .graph
            .get_node(iid)
            .is_ok_and(node_has_image_fill)
    }

    /// The node's fill color when its fills are exactly one solid
    /// paint — the `fill_solid` patch domain (see module docs).
    pub fn node_fill_solid(&self, id: &Id) -> Option<CGColor> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(single_solid_fill)
    }

    /// The node's whole fill stack (bottom→top paint order), or `None`
    /// for kinds that carry no fills — the `fills` patch domain and the
    /// Fills-section capability gate (`PROP-1`).
    pub fn node_fills(&self, id: &Id) -> Option<Paints> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(|n| n.fills().cloned())
    }

    /// The node's stroke paint stack (bottom→top), or `None` for kinds
    /// that carry no strokes — the `strokes` patch domain and the
    /// Strokes-section capability gate.
    pub fn node_strokes(&self, id: &Id) -> Option<Paints> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(node_strokes_ref)
            .cloned()
    }

    /// The node's uniform stroke weight (px), or `None` for kinds with
    /// no stroke width.
    pub fn node_stroke_width(&self, id: &Id) -> Option<f32> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(node_stroke_width_val)
    }

    /// The node's stroke alignment, or `None` for kinds without a
    /// stroke style.
    pub fn node_stroke_align(&self, id: &Id) -> Option<StrokeAlign> {
        self.stroke_style(id).map(|s| s.stroke_align)
    }

    /// The node's stroke cap.
    pub fn node_stroke_cap(&self, id: &Id) -> Option<StrokeCap> {
        self.stroke_style(id).map(|s| s.stroke_cap)
    }

    /// The node's stroke join.
    pub fn node_stroke_join(&self, id: &Id) -> Option<StrokeJoin> {
        self.stroke_style(id).map(|s| s.stroke_join)
    }

    /// The node's miter limit.
    pub fn node_stroke_miter(&self, id: &Id) -> Option<f32> {
        self.stroke_style(id).map(|s| s.stroke_miter_limit.0)
    }

    /// The node's dash pattern (empty = solid), or `None` for kinds
    /// without a stroke style.
    pub fn node_stroke_dash(&self, id: &Id) -> Option<Vec<f32>> {
        self.stroke_style(id).map(stroke_style_dash)
    }

    /// The node's stroke style, borrowed (internal helper for the
    /// per-property stroke-geometry queries).
    fn stroke_style(&self, id: &Id) -> Option<&StrokeStyle> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(node_stroke_style)
    }

    /// The node's vertical text alignment (`None` for non-text).
    pub fn node_text_align_vertical(&self, id: &Id) -> Option<TextAlignVertical> {
        let iid = self.to_internal.get(id)?;
        node_text_align_vertical(self.scene.graph.get_node(iid).ok()?)
    }

    /// The node's font size in px (`None` for non-text).
    pub fn node_font_size(&self, id: &Id) -> Option<f32> {
        self.text_style(id).map(|s| s.font_size)
    }

    /// The node's font weight (`None` for non-text).
    pub fn node_font_weight(&self, id: &Id) -> Option<u32> {
        self.text_style(id).map(|s| s.font_weight.0)
    }

    /// The node's italic flag (`None` for non-text).
    pub fn node_font_italic(&self, id: &Id) -> Option<bool> {
        self.text_style(id).map(|s| s.font_style_italic)
    }

    /// The node's line height as an authoring multiplier (`None` for
    /// non-text). Display projection — see [`line_height_multiplier`].
    pub fn node_line_height(&self, id: &Id) -> Option<f32> {
        self.text_style(id).map(line_height_multiplier)
    }

    /// The node's letter spacing magnitude (`None` for non-text).
    /// Display projection — see [`letter_spacing_value`].
    pub fn node_letter_spacing(&self, id: &Id) -> Option<f32> {
        self.text_style(id)
            .map(|s| letter_spacing_value(&s.letter_spacing))
    }

    /// The node's node-level text style, borrowed (internal helper for
    /// the per-property typography queries).
    fn text_style(&self, id: &Id) -> Option<&TextStyleRec> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(node_text_style)
    }

    /// The node's whole layer-effects bag (clone), or `None` for kinds
    /// that carry no effects (`InitialContainer`, `Error`, `Group`,
    /// `Tray`) — the effect patch domains' read side and the Effects
    /// sections' capability gate (`PROP-1`). Bind resolvers read this and
    /// reach into `.blur` / `.shadows`, mirroring how `node_fills` returns
    /// the whole `Paints` stack.
    pub fn node_effects(&self, id: &Id) -> Option<LayerEffects> {
        let iid = self.to_internal.get(id)?;
        self.scene
            .graph
            .get_node(iid)
            .ok()
            .and_then(|n| n.effects().cloned())
    }

    // -- renderer boundary (see crate::bridge) --------------------------------

    /// Internal graph id for a stable id.
    ///
    /// The scene returned by [`WorkingCopy::export_scene`] shares these
    /// internal ids, so this is the stable→renderer translation for a
    /// renderer loaded from that export.
    pub fn internal_id(&self, id: &Id) -> Option<NodeId> {
        self.to_internal.get(id).copied()
    }

    /// Stable id for an internal graph id (renderer→stable translation;
    /// `None` for ids the editor does not own, e.g. the synthetic root).
    pub fn stable_id(&self, internal: NodeId) -> Option<&Id> {
        self.to_stable.get(&internal)
    }

    /// Clone the working copy's scene for a renderer `load_scene`.
    ///
    /// The clone includes the synthetic root wrapper (a plain `Group`
    /// holding the scene roots — see module docs). The wrapper has no
    /// stable id and no paint of its own. Node internal ids are shared
    /// with the working copy, so [`WorkingCopy::internal_id`] /
    /// [`WorkingCopy::stable_id`] translate between a renderer built
    /// from this export and the editor.
    pub fn export_scene(&self) -> Scene {
        self.scene.clone()
    }

    /// The node record for a stable id (bridge mirroring).
    pub(crate) fn node_record(&self, id: &Id) -> Option<&Node> {
        let iid = self.to_internal.get(id)?;
        self.scene.graph.get_node(iid).ok()
    }

    fn resolve_parent_opt(&self, parent: Option<&Id>) -> Option<NodeId> {
        match parent {
            Option::None => Some(self.root),
            Some(id) => self.to_internal.get(id).copied(),
        }
    }

    // -- equality helper ------------------------------------------------------

    /// Structural equality for tests: tree shape by stable id, display
    /// names (absent ≡ empty), node variant, the M1 patched property
    /// subset (active, opacity, first solid fill, position, size),
    /// the guide list (`RUL-4` — guides are document truth), and the
    /// scene's background color.
    pub fn structure_eq(&self, other: &WorkingCopy) -> bool {
        self.guides == other.guides
            && self.scene.background_color == other.scene.background_color
            && self.subtree_eq(other, self.root, other.root, true)
    }

    fn subtree_eq(&self, other: &WorkingCopy, ia: NodeId, ib: NodeId, is_root: bool) -> bool {
        if !is_root {
            let (Some(sa), Some(sb)) = (self.to_stable.get(&ia), other.to_stable.get(&ib)) else {
                return false;
            };
            if sa != sb {
                return false;
            }
            let name_a = self.scene.graph.get_name(&ia).unwrap_or("");
            let name_b = other.scene.graph.get_name(&ib).unwrap_or("");
            if name_a != name_b {
                return false;
            }
            let (Ok(na), Ok(nb)) = (
                self.scene.graph.get_node(&ia),
                other.scene.graph.get_node(&ib),
            ) else {
                return false;
            };
            if node_signature(na) != node_signature(nb) {
                return false;
            }
        }
        let ca = self
            .scene
            .graph
            .get_children(&ia)
            .cloned()
            .unwrap_or_default();
        let cb = other
            .scene
            .graph
            .get_children(&ib)
            .cloned()
            .unwrap_or_default();
        if ca.len() != cb.len() {
            return false;
        }
        ca.iter()
            .zip(cb.iter())
            .all(|(a, b)| self.subtree_eq(other, *a, *b, false))
    }

    // -- apply ----------------------------------------------------------------

    /// Apply a mutation batch, all-or-nothing (`DOC-4`).
    ///
    /// Semantics: apply-with-rollback. Mutations apply in order; on the
    /// first failure the already-applied prefix is rolled back by
    /// applying its inverses in reverse, and the error identifies the
    /// offending mutation. On success, returns the inverse batch (in
    /// reverse order of the applied batch, `DOC-2`) and one change
    /// summary (`DOC-7`).
    pub fn apply(&mut self, batch: &[Mutation]) -> Result<Applied, MutationError> {
        let mut inverses: Vec<Vec<Mutation>> = Vec::with_capacity(batch.len());
        let mut summary = ChangeSummary::default();

        for (index, mutation) in batch.iter().enumerate() {
            match self.apply_one(mutation) {
                Ok((inverse, touched)) => {
                    for (id, kind) in touched {
                        summary.push(id, kind);
                    }
                    if mutation.is_guide() {
                        // Guide changes never rebuild the renderer
                        // scene — they are chrome truth, flagged apart.
                        summary.guides = true;
                    } else if matches!(mutation, Mutation::SceneBackground { .. }) {
                        // The clear color updates in place — a repaint,
                        // not a rebuild.
                        summary.background = true;
                    } else if !matches!(mutation, Mutation::Patch { .. }) {
                        summary.structural = true;
                    }
                    inverses.push(inverse);
                }
                Err(reason) => {
                    // Roll back the applied prefix (reverse order).
                    for inverse in inverses.iter().rev() {
                        for m in inverse {
                            self.apply_one(m).expect(
                                "invariant: rollback inverse must apply (DOC-2 inverse is exact)",
                            );
                        }
                    }
                    return Err(MutationError { index, reason });
                }
            }
        }

        let inverse: Vec<Mutation> = inverses.into_iter().rev().flatten().collect();
        Ok(Applied { inverse, summary })
    }

    /// Apply a single mutation. Returns its inverse (as an ordered
    /// sub-batch) and the touched `(id, kind)` pairs. On error the
    /// document is unchanged (each arm validates before mutating).
    #[allow(clippy::type_complexity)]
    fn apply_one(
        &mut self,
        mutation: &Mutation,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        match mutation {
            Mutation::Insert {
                parent,
                index,
                fragment,
            } => self.apply_insert(parent.as_ref(), *index, fragment),
            Mutation::Remove { id } => self.apply_remove(id),
            Mutation::Patch { id, set } => self.apply_patch(id, set),
            Mutation::Move { ids, parent, index } => self.apply_move(ids, parent.as_ref(), *index),
            Mutation::GuideInsert { index, guide } => self.apply_guide_insert(*index, *guide),
            Mutation::GuideRemove { index } => self.apply_guide_remove(*index),
            Mutation::GuideSet { index, offset } => self.apply_guide_set(*index, *offset),
            Mutation::SceneBackground { color } => self.apply_scene_background(*color),
        }
    }

    // -- scene fields (document.md `scene(op)`) --------------------------------

    #[allow(clippy::type_complexity)]
    fn apply_scene_background(
        &mut self,
        color: Option<CGColor>,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let prev = self.scene.background_color;
        self.scene.background_color = color;
        Ok((vec![Mutation::SceneBackground { color: prev }], Vec::new()))
    }

    // -- guide domain (ruler.md, RUL-4) ---------------------------------------

    #[allow(clippy::type_complexity)]
    fn apply_guide_insert(
        &mut self,
        index: usize,
        guide: Guide,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let len = self.guides.len();
        if index > len {
            return Err(MutationErrorReason::IndexOutOfBounds { index, len });
        }
        self.guides.insert(index, guide);
        Ok((vec![Mutation::GuideRemove { index }], Vec::new()))
    }

    #[allow(clippy::type_complexity)]
    fn apply_guide_remove(
        &mut self,
        index: usize,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let len = self.guides.len();
        if index >= len {
            return Err(MutationErrorReason::IndexOutOfBounds { index, len });
        }
        let guide = self.guides.remove(index);
        Ok((vec![Mutation::GuideInsert { index, guide }], Vec::new()))
    }

    #[allow(clippy::type_complexity)]
    fn apply_guide_set(
        &mut self,
        index: usize,
        offset: f32,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let len = self.guides.len();
        if index >= len {
            return Err(MutationErrorReason::IndexOutOfBounds { index, len });
        }
        let prev = self.guides[index].offset;
        self.guides[index].offset = offset;
        Ok((
            vec![Mutation::GuideSet {
                index,
                offset: prev,
            }],
            Vec::new(),
        ))
    }

    #[allow(clippy::type_complexity)]
    fn apply_insert(
        &mut self,
        parent: Option<&Id>,
        index: usize,
        fragment: &Fragment,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let pi = self
            .resolve_parent_opt(parent)
            .ok_or_else(|| MutationErrorReason::UnknownId(parent.cloned().unwrap_or_default()))?;

        // Validate fragment ids: unique within the fragment, absent from
        // the document.
        let ids = fragment.ids();
        let mut seen: HashSet<&Id> = HashSet::with_capacity(ids.len());
        for id in &ids {
            if !seen.insert(*id) || self.to_internal.contains_key(*id) {
                return Err(MutationErrorReason::DuplicateId((*id).clone()));
            }
        }

        let len = self
            .scene
            .graph
            .get_children(&pi)
            .map(|c| c.len())
            .unwrap_or(0);
        if index > len {
            return Err(MutationErrorReason::IndexOutOfBounds { index, len });
        }

        let mut touched: Vec<(Id, ChangeKind)> = Vec::new();
        let iid = self.insert_fragment(pi, fragment, &mut touched);

        // append_child pushed at the end; splice to the requested index.
        self.scene
            .graph
            .remove_child(&pi, &iid)
            .and_then(|_| self.scene.graph.add_child_at(&pi, iid, index))
            .expect("invariant: repositioning a just-appended child cannot fail");

        let inverse = vec![Mutation::Remove {
            id: fragment.id.clone(),
        }];
        Ok((inverse, touched))
    }

    /// Recursively add a fragment's nodes to the graph (children in
    /// document order) and register their stable ids.
    fn insert_fragment(
        &mut self,
        parent: NodeId,
        fragment: &Fragment,
        touched: &mut Vec<(Id, ChangeKind)>,
    ) -> NodeId {
        let iid = self
            .scene
            .graph
            .append_child(fragment.node.clone(), Parent::NodeId(parent));
        if let Some(name) = &fragment.name {
            self.scene.graph.set_name(iid, name.clone());
        }
        self.to_stable.insert(iid, fragment.id.clone());
        self.to_internal.insert(fragment.id.clone(), iid);
        touched.push((fragment.id.clone(), ChangeKind::Full));
        for child in &fragment.children {
            self.insert_fragment(iid, child, touched);
        }
        iid
    }

    #[allow(clippy::type_complexity)]
    fn apply_remove(
        &mut self,
        id: &Id,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let iid = *self
            .to_internal
            .get(id)
            .ok_or_else(|| MutationErrorReason::UnknownId(id.clone()))?;

        let pi = self
            .scene
            .graph
            .get_parent(&iid)
            .expect("invariant: every stable node has a parent (synthetic root holds roots)");
        let parent_stable = if pi == self.root {
            Option::None
        } else {
            Some(
                self.to_stable
                    .get(&pi)
                    .expect("invariant: non-root parents have stable ids")
                    .clone(),
            )
        };
        let index = self
            .scene
            .graph
            .get_children(&pi)
            .and_then(|c| c.iter().position(|c| *c == iid))
            .expect("invariant: node is listed among its parent's children");

        let fragment = self.capture_fragment(iid);

        let removed = self
            .scene
            .graph
            .remove_subtree(iid)
            .expect("invariant: validated id exists");
        let mut touched: Vec<(Id, ChangeKind)> = Vec::with_capacity(removed.len());
        for rid in removed {
            if let Some(stable) = self.to_stable.remove(&rid) {
                self.to_internal.remove(&stable);
                touched.push((stable, ChangeKind::Full));
            }
        }

        let inverse = vec![Mutation::Insert {
            parent: parent_stable,
            index,
            fragment: Box::new(fragment),
        }];
        Ok((inverse, touched))
    }

    /// Capture a subtree as a [`Fragment`] by stable id (clipboard copy,
    /// document save — the whole-subtree encode surface, IO doctrine).
    pub fn capture(&self, id: &Id) -> Option<Fragment> {
        let iid = *self.to_internal.get(id)?;
        Some(self.capture_fragment(iid))
    }

    /// Capture a subtree as a [`Fragment`] carrying its stable ids, so
    /// a `Remove` inverse restores identity (`DOC-2`).
    fn capture_fragment(&self, iid: NodeId) -> Fragment {
        let node = self
            .scene
            .graph
            .get_node(&iid)
            .expect("invariant: capture of existing node")
            .clone();
        let name = self.scene.graph.get_name(&iid).map(|s| s.to_string());
        let id = self
            .to_stable
            .get(&iid)
            .expect("invariant: captured nodes have stable ids")
            .clone();
        let children = self
            .scene
            .graph
            .get_children(&iid)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|c| self.capture_fragment(c))
            .collect();
        Fragment {
            id,
            name,
            node,
            children,
        }
    }

    #[allow(clippy::type_complexity)]
    fn apply_patch(
        &mut self,
        id: &Id,
        set: &PropPatch,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        let iid = *self
            .to_internal
            .get(id)
            .ok_or_else(|| MutationErrorReason::UnknownId(id.clone()))?;

        // Phase 1: validate every requested field and capture priors
        // (read-only), so a failure leaves the node untouched.
        let node = self
            .scene
            .graph
            .get_node(&iid)
            .expect("invariant: resolved id exists");

        let mut inverse = PropPatch::default();
        let mut kind = ChangeKind::None;

        if set.name.is_some() {
            inverse.name = Some(
                self.scene
                    .graph
                    .get_name(&iid)
                    .unwrap_or_default()
                    .to_string(),
            );
        }
        if set.active.is_some() {
            inverse.active = Some(node.active());
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.opacity.is_some() {
            if matches!(node, Node::InitialContainer(_)) {
                return Err(MutationErrorReason::Unsupported(
                    "opacity is not supported on InitialContainer".to_string(),
                ));
            }
            inverse.opacity = Some(node.opacity());
            kind = combine_kinds(kind, ChangeKind::Paint);
        }
        if set.fill_solid.is_some() {
            if set.fills.is_some() {
                return Err(MutationErrorReason::Unsupported(
                    "fill_solid and fills are mutually exclusive in one patch".to_string(),
                ));
            }
            inverse.fill_solid = Some(single_solid_fill(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "fill_solid requires the node's fills to be exactly one solid paint"
                        .to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Paint);
        }
        if set.fills.is_some() {
            inverse.fills = Some(
                node.fills()
                    .ok_or_else(|| {
                        MutationErrorReason::Unsupported(
                            "fills is not supported for this node type".to_string(),
                        )
                    })?
                    .clone(),
            );
            kind = combine_kinds(kind, ChangeKind::Paint);
        }
        if set.strokes.is_some() {
            inverse.strokes = Some(
                node_strokes_ref(node)
                    .ok_or_else(|| {
                        MutationErrorReason::Unsupported(
                            "strokes is not supported for this node type".to_string(),
                        )
                    })?
                    .clone(),
            );
            kind = combine_kinds(kind, ChangeKind::Paint);
        }
        // Stroke geometry (width/align/cap/join/miter/dash). Width is a
        // bounds-affecting change; the others carried under `Full` too
        // for simplicity (conservative — always correct).
        if set.stroke_width.is_some() {
            inverse.stroke_width = Some(node_stroke_width_val(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "stroke_width is not supported for this node type".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        let stroke_style_err = || {
            MutationErrorReason::Unsupported(
                "stroke style is not supported for this node type".to_string(),
            )
        };
        if set.stroke_align.is_some() {
            inverse.stroke_align = Some(
                node_stroke_style(node)
                    .ok_or_else(stroke_style_err)?
                    .stroke_align,
            );
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.stroke_cap.is_some() {
            inverse.stroke_cap = Some(
                node_stroke_style(node)
                    .ok_or_else(stroke_style_err)?
                    .stroke_cap,
            );
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.stroke_join.is_some() {
            inverse.stroke_join = Some(
                node_stroke_style(node)
                    .ok_or_else(stroke_style_err)?
                    .stroke_join,
            );
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.stroke_miter.is_some() {
            inverse.stroke_miter = Some(
                node_stroke_style(node)
                    .ok_or_else(stroke_style_err)?
                    .stroke_miter_limit
                    .0,
            );
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.stroke_dash.is_some() {
            inverse.stroke_dash = Some(stroke_style_dash(
                node_stroke_style(node).ok_or_else(stroke_style_err)?,
            ));
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.blend_mode.is_some() {
            if matches!(node, Node::InitialContainer(_) | Node::Error(_)) {
                return Err(MutationErrorReason::Unsupported(
                    "blend_mode is not supported on this node type".to_string(),
                ));
            }
            inverse.blend_mode = Some(node.blend_mode());
            kind = combine_kinds(kind, ChangeKind::Paint);
        }
        if set.corner_radius.is_some() {
            inverse.corner_radius = Some(node_corner_radius(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "corner_radius is not supported for this node type".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.point_count.is_some() {
            inverse.point_count = Some(node_point_count(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "point_count is only supported on regular polygons and stars".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.clips_content.is_some() {
            inverse.clips_content = Some(node_clips_content(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "clips_content is only supported on containers".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.text_align.is_some() {
            inverse.text_align = Some(node_text_align(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "text_align is only supported on text nodes".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.text_align_vertical.is_some() {
            inverse.text_align_vertical =
                Some(node_text_align_vertical(node).ok_or_else(|| {
                    MutationErrorReason::Unsupported(
                        "text_align_vertical is only supported on text nodes".to_string(),
                    )
                })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        // Typography (font size / weight / italic / line-height /
        // letter-spacing) reads and writes the node-level text style.
        // Text has no `Node::text_style()` accessor, so `node_text_style`
        // owns the per-kind match — the `stroke_style` pattern one level
        // up. Every field captures its exact prior for an invertible undo.
        // All five typography fields live in one `TextStyleRec`, so a
        // single lookup captures every requested prior (one graph
        // traversal, not five).
        let wants_text_style = set.font_size.is_some()
            || set.font_weight.is_some()
            || set.font_italic.is_some()
            || set.line_height.is_some()
            || set.letter_spacing.is_some();
        if wants_text_style {
            let style = node_text_style(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "text style is only supported on text nodes".to_string(),
                )
            })?;
            if set.font_size.is_some() {
                inverse.font_size = Some(style.font_size);
            }
            if set.font_weight.is_some() {
                inverse.font_weight = Some(style.font_weight.0);
            }
            if set.font_italic.is_some() {
                inverse.font_italic = Some(style.font_style_italic);
            }
            if set.line_height.is_some() {
                inverse.line_height = Some(style.line_height.clone());
            }
            if set.letter_spacing.is_some() {
                inverse.letter_spacing = Some(style.letter_spacing);
            }
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        // Layer effects (blur slot / shadow list). `Node::effects()` is
        // the engine read accessor, but there is no `effects_mut()`, so
        // the write side owns a per-kind match (`node_effects_mut`) — the
        // `stroke_style` pattern. Both fields live in one `LayerEffects`,
        // so a single lookup captures every requested prior. `Full`
        // because shadows and blur extend the node's render bounds
        // (conservative — always correct).
        let wants_effects = set.layer_blur.is_some() || set.shadows.is_some();
        if wants_effects {
            let fx = node.effects().ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "effects are not supported for this node type".to_string(),
                )
            })?;
            if set.layer_blur.is_some() {
                inverse.layer_blur = Some(fx.blur.clone());
            }
            if set.shadows.is_some() {
                inverse.shadows = Some(fx.shadows.clone());
            }
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.position.is_some() {
            inverse.position = Some(node_position(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "position is not supported for this node type".to_string(),
                )
            })?);
            // A Container's position is a Taffy input: the renderer's
            // `ChangeKind::Layout` fast path skips Taffy, so the
            // container's `layout_result` goes stale and it keeps
            // painting (and hit-testing, and shaping HUD chrome) at
            // its old place while the document says it moved. Mirror
            // the engine differ's promotion (grida
            // `runtime/invalidation/differ.rs`, `diff_node`):
            // Container motion → Full. Tray and leaves bypass
            // `layout_result`; their motion keeps the fast path.
            kind = combine_kinds(
                kind,
                if matches!(node, Node::Container(_)) {
                    ChangeKind::Full
                } else {
                    ChangeKind::Layout
                },
            );
        }
        if let Some((w, h)) = set.size {
            let (pw, ph) = node_size(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "size is only supported on nodes with a concrete Size".to_string(),
                )
            })?;
            inverse.size = Some((w.map(|_| pw), h.map(|_| ph)));
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.rotation.is_some() {
            inverse.rotation = Some(node_rotation(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "rotation is not supported for this node type".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Layout);
        }
        if set.text.is_some() {
            inverse.text = Some(node_text(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "text is only supported on TextSpan nodes".to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.vector_polyline.is_some() {
            if set.vector_network.is_some() {
                return Err(MutationErrorReason::Unsupported(
                    "vector_polyline and vector_network are mutually exclusive in one patch"
                        .to_string(),
                ));
            }
            inverse.vector_polyline = Some(node_vector_polyline(node).ok_or_else(|| {
                MutationErrorReason::Unsupported(
                    "vector_polyline requires a Vector node whose network is a polyline"
                        .to_string(),
                )
            })?);
            kind = combine_kinds(kind, ChangeKind::Full);
        }
        if set.vector_network.is_some() {
            inverse.vector_network = Some(
                node_vector_network(node)
                    .ok_or_else(|| {
                        MutationErrorReason::Unsupported(
                            "vector_network requires a Vector node".to_string(),
                        )
                    })?
                    .clone(),
            );
            kind = combine_kinds(kind, ChangeKind::Full);
        }

        // Phase 2: write (infallible after validation).
        if let Some(name) = &set.name {
            self.scene.graph.set_name(iid, name.clone());
        }
        let node = self
            .scene
            .graph
            .get_node_mut(&iid)
            .expect("invariant: resolved id exists");
        if let Some(active) = set.active {
            set_active(node, active);
        }
        if let Some(opacity) = set.opacity {
            set_opacity(node, opacity);
        }
        if let Some(color) = set.fill_solid {
            set_fill_solid(node, color);
        }
        if let Some(fills) = &set.fills {
            set_fills(node, fills.clone());
        }
        if let Some(strokes) = &set.strokes {
            set_strokes(node, strokes.clone());
        }
        if let Some(w) = set.stroke_width {
            set_stroke_width_val(node, w);
        }
        if let Some(a) = set.stroke_align
            && let Some(s) = node_stroke_style_mut(node)
        {
            s.stroke_align = a;
        }
        if let Some(c) = set.stroke_cap
            && let Some(s) = node_stroke_style_mut(node)
        {
            s.stroke_cap = c;
        }
        if let Some(j) = set.stroke_join
            && let Some(s) = node_stroke_style_mut(node)
        {
            s.stroke_join = j;
        }
        if let Some(m) = set.stroke_miter
            && let Some(s) = node_stroke_style_mut(node)
        {
            s.stroke_miter_limit = StrokeMiterLimit(m);
        }
        if let Some(d) = &set.stroke_dash
            && let Some(s) = node_stroke_style_mut(node)
        {
            s.stroke_dash_array = if d.is_empty() {
                Option::None
            } else {
                Some(StrokeDashArray(d.clone()))
            };
        }
        if let Some(blend_mode) = set.blend_mode {
            set_blend_mode(node, blend_mode);
        }
        if let Some(radius) = set.corner_radius {
            set_corner_radius(node, radius);
        }
        if let Some(count) = set.point_count {
            set_point_count(node, count);
        }
        if let Some(clip) = set.clips_content {
            set_clips_content(node, clip);
        }
        if let Some(align) = set.text_align {
            set_text_align(node, align);
        }
        if let Some(v) = set.text_align_vertical {
            set_text_align_vertical(node, v);
        }
        // One mutable lookup writes every requested typography field
        // (all live in the same `TextStyleRec`).
        if wants_text_style && let Some(s) = node_text_style_mut(node) {
            if let Some(sz) = set.font_size {
                s.font_size = sz.max(1.0);
            }
            if let Some(w) = set.font_weight {
                s.font_weight = FontWeight(w.clamp(1, 1000));
            }
            if let Some(it) = set.font_italic {
                s.font_style_italic = it;
            }
            if let Some(lh) = &set.line_height {
                s.line_height = lh.clone();
            }
            if let Some(ls) = set.letter_spacing {
                s.letter_spacing = ls;
            }
        }
        // One mutable lookup writes every requested effect field (both
        // live in the same `LayerEffects`).
        if wants_effects && let Some(fx) = node_effects_mut(node) {
            if let Some(blur) = &set.layer_blur {
                fx.blur = blur.clone();
            }
            if let Some(shadows) = &set.shadows {
                fx.shadows = shadows.clone();
            }
        }
        if let Some((x, y)) = set.position {
            set_position(node, x, y);
        }
        if let Some((w, h)) = set.size {
            set_size(node, w, h);
        }
        if let Some(angle) = set.rotation {
            set_rotation(node, angle);
        }
        if let Some(text) = &set.text {
            set_text(node, text);
        }
        if let Some(points) = &set.vector_polyline {
            set_vector_polyline(node, points);
        }
        if let Some(network) = &set.vector_network {
            set_vector_network(node, network);
        }
        self.scene.graph.refresh_node_geo_data(&iid);

        let inverse = vec![Mutation::Patch {
            id: id.clone(),
            set: inverse,
        }];
        Ok((inverse, vec![(id.clone(), kind)]))
    }

    #[allow(clippy::type_complexity)]
    fn apply_move(
        &mut self,
        ids: &[Id],
        parent: Option<&Id>,
        index: usize,
    ) -> Result<(Vec<Mutation>, Vec<(Id, ChangeKind)>), MutationErrorReason> {
        if ids.is_empty() {
            return Err(MutationErrorReason::Unsupported(
                "move requires at least one id".to_string(),
            ));
        }
        let mut seen: HashSet<&Id> = HashSet::with_capacity(ids.len());
        for id in ids {
            if !seen.insert(id) {
                return Err(MutationErrorReason::DuplicateId(id.clone()));
            }
        }

        let tp = self
            .resolve_parent_opt(parent)
            .ok_or_else(|| MutationErrorReason::UnknownId(parent.cloned().unwrap_or_default()))?;

        let mut moved: Vec<(Id, NodeId)> = Vec::with_capacity(ids.len());
        for id in ids {
            let iid = *self
                .to_internal
                .get(id)
                .ok_or_else(|| MutationErrorReason::UnknownId(id.clone()))?;
            moved.push((id.clone(), iid));
        }

        // Cycle check: the target parent must not be (inside) a moved
        // subtree.
        for (id, iid) in &moved {
            if *iid == tp {
                return Err(MutationErrorReason::Cycle(id.clone()));
            }
            let descendants = self
                .scene
                .graph
                .descendants(iid)
                .expect("invariant: resolved id exists");
            if descendants.contains(&tp) {
                return Err(MutationErrorReason::Cycle(id.clone()));
            }
            // M1 restriction: moved ids must be disjoint subtrees, or
            // the single-splice semantics (and the inverse) are
            // ambiguous.
            for (other_id, other_iid) in &moved {
                if other_iid != iid && descendants.contains(other_iid) {
                    return Err(MutationErrorReason::Unsupported(format!(
                        "move ids must be disjoint subtrees ({other_id:?} is inside {id:?})"
                    )));
                }
            }
        }

        // Capture prior (parent, index) per moved id, from the pre-state.
        let mut captured: Vec<(Id, Option<Id>, NodeId, usize)> = Vec::with_capacity(moved.len());
        for (id, iid) in &moved {
            let pi = self
                .scene
                .graph
                .get_parent(iid)
                .expect("invariant: every stable node has a parent");
            let parent_stable = if pi == self.root {
                Option::None
            } else {
                Some(
                    self.to_stable
                        .get(&pi)
                        .expect("invariant: non-root parents have stable ids")
                        .clone(),
                )
            };
            let position = self
                .scene
                .graph
                .get_children(&pi)
                .and_then(|c| c.iter().position(|c| c == iid))
                .expect("invariant: node is listed among its parent's children");
            captured.push((id.clone(), parent_stable, pi, position));
        }

        // Post-removal splice (DOC-5): detach the moved set, validate the
        // index against the remaining length, splice in `ids` order.
        let moved_set: HashSet<NodeId> = moved.iter().map(|(_, iid)| *iid).collect();
        let mut new_children: Vec<NodeId> = self
            .scene
            .graph
            .get_children(&tp)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|c| !moved_set.contains(c))
            .collect();
        if index > new_children.len() {
            return Err(MutationErrorReason::IndexOutOfBounds {
                index,
                len: new_children.len(),
            });
        }
        for (offset, (_, iid)) in moved.iter().enumerate() {
            new_children.insert(index + offset, *iid);
        }

        // set_children detaches the entered ids from their old parents.
        self.scene
            .graph
            .set_children(&tp, new_children)
            .expect("invariant: move was validated against the pre-state");

        // Inverse: restore each id to its captured (parent, index),
        // ascending by original index per parent so each single-id move
        // sees exactly the post-removal environment it needs.
        let mut order: Vec<usize> = (0..captured.len()).collect();
        order.sort_by_key(|&i| (captured[i].2, captured[i].3));
        let inverse: Vec<Mutation> = order
            .into_iter()
            .map(|i| {
                let (id, parent_stable, _, position) = &captured[i];
                Mutation::Move {
                    ids: vec![id.clone()],
                    parent: parent_stable.clone(),
                    index: *position,
                }
            })
            .collect();

        let touched = moved
            .iter()
            .map(|(id, _)| (id.clone(), ChangeKind::Full))
            .collect();
        Ok((inverse, touched))
    }
}

// ---------------------------------------------------------------------------
// Per-variant node accessors (getters + setters over the Node enum)
// ---------------------------------------------------------------------------
// Editor-only helpers for reaching into Node variant fields. They live
// here (not on `impl Node` in the grida crate) because grida is a
// renderer and should not expose mutable setters on its data model.
// Getters exist so inverses can capture prior values (DOC-2).

/// Property signature for [`WorkingCopy::structure_eq`] (`PROP-7`): the
/// observable node state the panel diffs against. The full `fills`/
/// `strokes` stacks (not just the first solid) are included so the panel
/// observes any paint edit — recolor, add/remove, reorder, kind change;
/// `effects` likewise so an effect add/remove/param edit rebuilds the
/// Effects sections. A named struct (not a tuple) so it grows a field at
/// a time without the std 12-arity `PartialEq` tuple ceiling.
#[derive(Debug, Clone, PartialEq)]
struct NodeSignature {
    kind: std::mem::Discriminant<Node>,
    active: bool,
    opacity: f32,
    fills: Option<Paints>,
    strokes: Option<Paints>,
    stroke_width: Option<f32>,
    stroke_style: Option<StrokeStyle>,
    position: Option<(f32, f32)>,
    size: Option<(f32, f32)>,
    rotation: Option<f32>,
    text: Option<String>,
    text_style: Option<TextStyleSignature>,
    effects: Option<LayerEffects>,
    vector_network: Option<NetworkSignature>,
}

fn node_signature(node: &Node) -> NodeSignature {
    NodeSignature {
        kind: std::mem::discriminant(node),
        active: node.active(),
        opacity: node.opacity(),
        fills: node.fills().cloned(),
        strokes: node_strokes_ref(node).cloned(),
        stroke_width: node_stroke_width_val(node),
        stroke_style: node_stroke_style(node).cloned(),
        position: node_position(node),
        size: node_size(node),
        rotation: node_rotation(node),
        text: node_text(node),
        text_style: text_style_signature(node),
        effects: node.effects().cloned(),
        vector_network: node_vector_network(node).map(network_signature),
    }
}

/// Comparable projection of a node's typography (`TextStyleRec` derives
/// no `PartialEq`, so the panel observes typography edits through this
/// tuple-of-scalars instead — the `NetworkSignature` pattern). Covers
/// the fields the Text section authors; per-run styles are excluded (the
/// rich-text refinement).
#[derive(Debug, Clone, PartialEq)]
struct TextStyleSignature {
    font_size: f32,
    font_weight: u32,
    italic: bool,
    line_height: TextLineHeight,
    letter_spacing: TextLetterSpacing,
    align_vertical: Option<TextAlignVertical>,
}

fn text_style_signature(node: &Node) -> Option<TextStyleSignature> {
    let style = node_text_style(node)?;
    Some(TextStyleSignature {
        font_size: style.font_size,
        font_weight: style.font_weight.0,
        italic: style.font_style_italic,
        line_height: style.line_height.clone(),
        letter_spacing: style.letter_spacing,
        align_vertical: node_text_align_vertical(node),
    })
}

/// Comparable projection of a vector network: vertices, segments
/// (tangents included), and region topology (loop segment indices +
/// fill rule). Region *paints* are excluded — the editor never authors
/// them and `Paints` carries no equality; the `structure_eq` doc-comment
/// names this bound.
#[derive(Debug, Clone, PartialEq)]
struct NetworkSignature {
    vertices: Vec<(f32, f32)>,
    segments: Vec<grida::vectornetwork::VectorNetworkSegment>,
    regions: Vec<(Vec<Vec<usize>>, FillRule)>,
}

fn network_signature(network: &grida::vectornetwork::VectorNetwork) -> NetworkSignature {
    NetworkSignature {
        vertices: network.vertices.clone(),
        segments: network.segments.clone(),
        regions: network
            .regions
            .iter()
            .map(|r| (r.loops.iter().map(|l| l.0.clone()).collect(), r.fill_rule))
            .collect(),
    }
}

/// The node's fill color when its fills are exactly one solid paint.
pub(crate) fn single_solid_fill(node: &Node) -> Option<CGColor> {
    let fills = node.fills()?;
    match fills.as_slice() {
        [Paint::Solid(solid)] => Some(solid.color),
        _ => Option::None,
    }
}

/// Absolute translation components. `None` for `InitialContainer`.
pub(crate) fn node_position(node: &Node) -> Option<(f32, f32)> {
    match node {
        Node::InitialContainer(_) => Option::None,
        Node::Container(n) => Some((n.position.x().unwrap_or(0.0), n.position.y().unwrap_or(0.0))),
        Node::Tray(n) => Some((n.position.x().unwrap_or(0.0), n.position.y().unwrap_or(0.0))),
        Node::Group(n) => {
            let t = n.transform.unwrap_or_default();
            Some((t.x(), t.y()))
        }
        Node::BooleanOperation(n) => {
            let t = n.transform.unwrap_or_default();
            Some((t.x(), t.y()))
        }
        Node::Rectangle(n) => Some((n.transform.x(), n.transform.y())),
        Node::Ellipse(n) => Some((n.transform.x(), n.transform.y())),
        Node::Polygon(n) => Some((n.transform.x(), n.transform.y())),
        Node::RegularPolygon(n) => Some((n.transform.x(), n.transform.y())),
        Node::RegularStarPolygon(n) => Some((n.transform.x(), n.transform.y())),
        Node::Line(n) => Some((n.transform.x(), n.transform.y())),
        Node::TextSpan(n) => Some((n.transform.x(), n.transform.y())),
        Node::AttributedText(n) => Some((n.transform.x(), n.transform.y())),
        Node::Path(n) => Some((n.transform.x(), n.transform.y())),
        Node::Vector(n) => Some((n.transform.x(), n.transform.y())),
        Node::Image(n) => Some((n.transform.x(), n.transform.y())),
        Node::Error(n) => Some((n.transform.x(), n.transform.y())),
        Node::MarkdownEmbed(n) => Some((n.transform.x(), n.transform.y())),
        Node::HTMLEmbed(n) => Some((n.transform.x(), n.transform.y())),
    }
}

/// The node's full local affine (local space → parent space): the
/// transform-kinds' stored matrix, or a pure translation for the
/// axis-aligned container kinds (which carry no rotation or scale).
/// Identity for the scene root. This is the per-level factor
/// [`WorkingCopy::node_world_transform`] composes up the ancestor
/// chain — unlike [`node_position`]/[`node_rotation`], it preserves an
/// ancestor's scale, so the composed world transform is exact.
pub(crate) fn node_local_transform(node: &Node) -> math2::transform::AffineTransform {
    use math2::transform::AffineTransform;
    match node {
        Node::InitialContainer(_) => AffineTransform::identity(),
        Node::Container(n) => AffineTransform::new(
            n.position.x().unwrap_or(0.0),
            n.position.y().unwrap_or(0.0),
            0.0,
        ),
        Node::Tray(n) => AffineTransform::new(
            n.position.x().unwrap_or(0.0),
            n.position.y().unwrap_or(0.0),
            0.0,
        ),
        Node::Group(n) => n.transform.unwrap_or_default(),
        Node::BooleanOperation(n) => n.transform.unwrap_or_default(),
        Node::Rectangle(n) => n.transform,
        Node::Ellipse(n) => n.transform,
        Node::Polygon(n) => n.transform,
        Node::RegularPolygon(n) => n.transform,
        Node::RegularStarPolygon(n) => n.transform,
        Node::Line(n) => n.transform,
        Node::TextSpan(n) => n.transform,
        Node::AttributedText(n) => n.transform,
        Node::Path(n) => n.transform,
        Node::Vector(n) => n.transform,
        Node::Image(n) => n.transform,
        Node::Error(n) => n.transform,
        Node::MarkdownEmbed(n) => n.transform,
        Node::HTMLEmbed(n) => n.transform,
    }
}

/// How a node positions itself within its parent's layout flow. Read
/// from the node's `layout_child` style; kinds that carry no child
/// style (or leave it unset) default to `Auto` (in-flow). Used by
/// [`WorkingCopy::is_layout_owned`] to tell an in-flow member from an
/// `Absolute` one under a flex parent.
fn node_layout_positioning(node: &Node) -> grida::cg::types::LayoutPositioning {
    let child = match node {
        Node::Container(n) => n.layout_child.as_ref(),
        Node::Rectangle(n) => n.layout_child.as_ref(),
        Node::Ellipse(n) => n.layout_child.as_ref(),
        Node::Polygon(n) => n.layout_child.as_ref(),
        Node::RegularPolygon(n) => n.layout_child.as_ref(),
        Node::RegularStarPolygon(n) => n.layout_child.as_ref(),
        Node::Line(n) => n.layout_child.as_ref(),
        Node::TextSpan(n) => n.layout_child.as_ref(),
        Node::AttributedText(n) => n.layout_child.as_ref(),
        Node::Path(n) => n.layout_child.as_ref(),
        Node::Vector(n) => n.layout_child.as_ref(),
        Node::Image(n) => n.layout_child.as_ref(),
        Node::MarkdownEmbed(n) => n.layout_child.as_ref(),
        Node::HTMLEmbed(n) => n.layout_child.as_ref(),
        Node::InitialContainer(_)
        | Node::Group(_)
        | Node::Tray(_)
        | Node::BooleanOperation(_)
        | Node::Error(_) => None,
    };
    child
        .map(|c| c.layout_positioning)
        .unwrap_or(grida::cg::types::LayoutPositioning::Auto)
}

pub(crate) fn set_position(node: &mut Node, x: f32, y: f32) {
    match node {
        Node::InitialContainer(_) => {}
        Node::Container(n) => {
            n.position = LayoutPositioningBasis::Cartesian(CGPoint { x, y });
        }
        Node::Tray(n) => {
            n.position = LayoutPositioningBasis::Cartesian(CGPoint { x, y });
        }
        Node::Group(n) => {
            let mut t = n.transform.unwrap_or_default();
            t.set_translation(x, y);
            n.transform = Some(t);
        }
        Node::BooleanOperation(n) => {
            let mut t = n.transform.unwrap_or_default();
            t.set_translation(x, y);
            n.transform = Some(t);
        }
        Node::Rectangle(n) => n.transform.set_translation(x, y),
        Node::Ellipse(n) => n.transform.set_translation(x, y),
        Node::Polygon(n) => n.transform.set_translation(x, y),
        Node::RegularPolygon(n) => n.transform.set_translation(x, y),
        Node::RegularStarPolygon(n) => n.transform.set_translation(x, y),
        Node::Line(n) => n.transform.set_translation(x, y),
        Node::TextSpan(n) => n.transform.set_translation(x, y),
        Node::AttributedText(n) => n.transform.set_translation(x, y),
        Node::Path(n) => n.transform.set_translation(x, y),
        Node::Vector(n) => n.transform.set_translation(x, y),
        Node::Image(n) => n.transform.set_translation(x, y),
        Node::Error(n) => n.transform.set_translation(x, y),
        Node::MarkdownEmbed(n) => n.transform.set_translation(x, y),
        Node::HTMLEmbed(n) => n.transform.set_translation(x, y),
    }
}

/// Concrete `(width, height)` for node kinds with a plain `Size`,
/// plus Container/Tray when both layout target dimensions are set
/// (their concrete-size representation). `None` for auto-sized /
/// derived kinds (see module docs).
pub(crate) fn node_size(node: &Node) -> Option<(f32, f32)> {
    match node {
        Node::Rectangle(n) => Some((n.size.width, n.size.height)),
        Node::Ellipse(n) => Some((n.size.width, n.size.height)),
        Node::RegularPolygon(n) => Some((n.size.width, n.size.height)),
        Node::RegularStarPolygon(n) => Some((n.size.width, n.size.height)),
        Node::Line(n) => Some((n.size.width, n.size.height)),
        Node::Image(n) => Some((n.size.width, n.size.height)),
        Node::Error(n) => Some((n.size.width, n.size.height)),
        Node::HTMLEmbed(n) => Some((n.size.width, n.size.height)),
        // KNOWN GAP (deferred): the module doc scopes `size` patches to
        // the concrete-`Size` kinds above and rejects auto-sized kinds,
        // but Container/Tray are handled here (getter) and in `set_size`
        // (setter) as an undocumented widening — and the two domains
        // disagree: this getter needs *both* axes concrete (the `?`
        // bails a half-auto container to `None`, rejecting its patch),
        // while `set_size` sets each axis independently. `Option<(f32,
        // f32)>` cannot express a half-auto container, so getter and
        // setter cannot be made identical without a per-axis getter or a
        // dedicated container-dimensions mutation. Left as-is pending
        // that decision; do not treat container size-patch support as
        // contractual until reconciled.
        Node::Container(n) => Some((
            n.layout_dimensions.layout_target_width?,
            n.layout_dimensions.layout_target_height?,
        )),
        Node::Tray(n) => Some((
            n.layout_dimensions.layout_target_width?,
            n.layout_dimensions.layout_target_height?,
        )),
        _ => Option::None,
    }
}

pub(crate) fn set_size(node: &mut Node, width: Option<f32>, height: Option<f32>) {
    let size = match node {
        Node::Rectangle(n) => &mut n.size,
        Node::Ellipse(n) => &mut n.size,
        Node::RegularPolygon(n) => &mut n.size,
        Node::RegularStarPolygon(n) => &mut n.size,
        Node::Line(n) => &mut n.size,
        Node::Image(n) => &mut n.size,
        Node::Error(n) => &mut n.size,
        Node::HTMLEmbed(n) => &mut n.size,
        Node::Container(n) => {
            if let Some(w) = width {
                n.layout_dimensions.layout_target_width = Some(w);
            }
            if let Some(h) = height {
                n.layout_dimensions.layout_target_height = Some(h);
            }
            return;
        }
        Node::Tray(n) => {
            if let Some(w) = width {
                n.layout_dimensions.layout_target_width = Some(w);
            }
            if let Some(h) = height {
                n.layout_dimensions.layout_target_height = Some(h);
            }
            return;
        }
        _ => return,
    };
    if let Some(w) = width {
        size.width = w;
    }
    if let Some(h) = height {
        size.height = h;
    }
}

/// The node's uniform corner radius, for kinds that carry one. The
/// per-side `RectangularCornerRadius` kinds report their average
/// (`is_uniform` is the common case); the scalar kinds report it
/// directly.
/// The node's layer blend mode (`None` for `InitialContainer` and
/// `Error`, which have none — matching `set_blend_mode`'s domain).
pub(crate) fn node_blend_mode(node: &Node) -> Option<LayerBlendMode> {
    match node {
        Node::InitialContainer(_) | Node::Error(_) => None,
        _ => Some(node.blend_mode()),
    }
}

pub(crate) fn node_corner_radius(node: &Node) -> Option<f32> {
    match node {
        Node::Container(n) => Some(n.corner_radius.avg()),
        Node::Tray(n) => Some(n.corner_radius.avg()),
        Node::Rectangle(n) => Some(n.corner_radius.avg()),
        Node::Image(n) => Some(n.corner_radius.avg()),
        Node::MarkdownEmbed(n) => Some(n.corner_radius.avg()),
        Node::HTMLEmbed(n) => Some(n.corner_radius.avg()),
        Node::Ellipse(n) => n.corner_radius,
        Node::BooleanOperation(n) => n.corner_radius,
        Node::Polygon(n) => Some(n.corner_radius),
        Node::RegularPolygon(n) => Some(n.corner_radius),
        Node::RegularStarPolygon(n) => Some(n.corner_radius),
        Node::Vector(n) => Some(n.corner_radius),
        _ => None,
    }
}

/// Set a node's uniform corner radius (per-side kinds become
/// circular; scalar kinds set directly). No-op for kinds without one.
pub(crate) fn set_corner_radius(node: &mut Node, radius: f32) {
    match node {
        Node::Container(n) => n.corner_radius = RectangularCornerRadius::circular(radius),
        Node::Tray(n) => n.corner_radius = RectangularCornerRadius::circular(radius),
        Node::Rectangle(n) => n.corner_radius = RectangularCornerRadius::circular(radius),
        Node::Image(n) => n.corner_radius = RectangularCornerRadius::circular(radius),
        Node::MarkdownEmbed(n) => n.corner_radius = RectangularCornerRadius::circular(radius),
        Node::HTMLEmbed(n) => n.corner_radius = RectangularCornerRadius::circular(radius),
        Node::Ellipse(n) => n.corner_radius = Some(radius),
        Node::BooleanOperation(n) => n.corner_radius = Some(radius),
        Node::Polygon(n) => n.corner_radius = radius,
        Node::RegularPolygon(n) => n.corner_radius = radius,
        Node::RegularStarPolygon(n) => n.corner_radius = radius,
        Node::Vector(n) => n.corner_radius = radius,
        _ => {}
    }
}

/// The node's regular-polygon / star point count.
pub(crate) fn node_point_count(node: &Node) -> Option<usize> {
    match node {
        Node::RegularPolygon(n) => Some(n.point_count),
        Node::RegularStarPolygon(n) => Some(n.point_count),
        _ => None,
    }
}

pub(crate) fn set_point_count(node: &mut Node, count: usize) {
    match node {
        Node::RegularPolygon(n) => n.point_count = count,
        Node::RegularStarPolygon(n) => n.point_count = count,
        _ => {}
    }
}

/// The container's content-clipping flag (`None` for non-containers).
pub(crate) fn node_clips_content(node: &Node) -> Option<bool> {
    match node {
        Node::Container(n) => Some(n.clip),
        _ => None,
    }
}

pub(crate) fn set_clips_content(node: &mut Node, clip: bool) {
    if let Node::Container(n) = node {
        n.clip = clip;
    }
}

/// The node's horizontal text alignment (text kinds only).
pub(crate) fn node_text_align(node: &Node) -> Option<TextAlign> {
    match node {
        Node::TextSpan(n) => Some(n.text_align),
        Node::AttributedText(n) => Some(n.text_align),
        _ => None,
    }
}

pub(crate) fn set_text_align(node: &mut Node, align: TextAlign) {
    match node {
        Node::TextSpan(n) => n.text_align = align,
        Node::AttributedText(n) => n.text_align = align,
        _ => {}
    }
}

/// The node's vertical text alignment (text kinds only).
pub(crate) fn node_text_align_vertical(node: &Node) -> Option<TextAlignVertical> {
    match node {
        Node::TextSpan(n) => Some(n.text_align_vertical),
        Node::AttributedText(n) => Some(n.text_align_vertical),
        _ => None,
    }
}

pub(crate) fn set_text_align_vertical(node: &mut Node, v: TextAlignVertical) {
    match node {
        Node::TextSpan(n) => n.text_align_vertical = v,
        Node::AttributedText(n) => n.text_align_vertical = v,
        _ => {}
    }
}

/// The node's node-level text style — `TextSpan.text_style` or
/// `AttributedText.default_style`. `None` for non-text kinds. The engine
/// exposes no `Node::text_style()` accessor (unlike `fills()`), so this
/// per-kind match is the domain owner for typography (the `stroke_style`
/// pattern). Per-run styles on `AttributedText` are outside this domain
/// (the rich-text refinement).
pub(crate) fn node_text_style(node: &Node) -> Option<&TextStyleRec> {
    match node {
        Node::TextSpan(n) => Some(&n.text_style),
        Node::AttributedText(n) => Some(&n.default_style),
        _ => None,
    }
}

/// Mutable [`node_text_style`].
pub(crate) fn node_text_style_mut(node: &mut Node) -> Option<&mut TextStyleRec> {
    match node {
        Node::TextSpan(n) => Some(&mut n.text_style),
        Node::AttributedText(n) => Some(&mut n.default_style),
        _ => None,
    }
}

/// The line height as an authoring multiplier (display projection):
/// `Factor(x)` → `x`; `Fixed(px)` → `px / font_size` (font-relative);
/// `Normal` → `1.0` (an editable baseline). Lossy on purpose — the
/// invertible truth is the whole [`TextLineHeight`] carried in the patch.
pub(crate) fn line_height_multiplier(style: &TextStyleRec) -> f32 {
    match style.line_height {
        TextLineHeight::Factor(x) => x,
        TextLineHeight::Fixed(px) if style.font_size > 0.0 => px / style.font_size,
        TextLineHeight::Fixed(px) => px,
        TextLineHeight::Normal => 1.0,
    }
}

/// The letter spacing as a plain px-ish magnitude (display projection):
/// both variants surface their inner value. v1 authors `Fixed`.
pub(crate) fn letter_spacing_value(spacing: &TextLetterSpacing) -> f32 {
    match spacing {
        TextLetterSpacing::Fixed(x) => *x,
        TextLetterSpacing::Factor(x) => *x,
    }
}

/// Mutable layer effects — the write counterpart to `Node::effects()`.
/// The engine exposes the read accessor but no `effects_mut()`, so this
/// per-kind match owns the mutable path (the `stroke_style` pattern). The
/// arms mirror `Node::effects()` exactly: the kinds returning `None`
/// there carry no effects here. Used by `apply_patch` after the field
/// was validated against `Node::effects()`.
pub(crate) fn node_effects_mut(node: &mut Node) -> Option<&mut LayerEffects> {
    match node {
        Node::InitialContainer(_) | Node::Error(_) | Node::Group(_) | Node::Tray(_) => None,
        Node::Container(n) => Some(&mut n.effects),
        Node::Rectangle(n) => Some(&mut n.effects),
        Node::Ellipse(n) => Some(&mut n.effects),
        Node::Polygon(n) => Some(&mut n.effects),
        Node::RegularPolygon(n) => Some(&mut n.effects),
        Node::RegularStarPolygon(n) => Some(&mut n.effects),
        Node::Line(n) => Some(&mut n.effects),
        Node::TextSpan(n) => Some(&mut n.effects),
        Node::AttributedText(n) => Some(&mut n.effects),
        Node::Path(n) => Some(&mut n.effects),
        Node::Vector(n) => Some(&mut n.effects),
        Node::BooleanOperation(n) => Some(&mut n.effects),
        Node::Image(n) => Some(&mut n.effects),
        Node::MarkdownEmbed(n) => Some(&mut n.effects),
        Node::HTMLEmbed(n) => Some(&mut n.effects),
    }
}

/// Set a node's layer blend mode. `InitialContainer` and `Error`
/// have no blend mode (guarded out before this in `apply_patch`).
pub(crate) fn set_blend_mode(node: &mut Node, blend_mode: LayerBlendMode) {
    match node {
        Node::InitialContainer(_) | Node::Error(_) => {}
        Node::Container(n) => n.blend_mode = blend_mode,
        Node::Group(n) => n.blend_mode = blend_mode,
        Node::Tray(n) => n.blend_mode = blend_mode,
        Node::Rectangle(n) => n.blend_mode = blend_mode,
        Node::Ellipse(n) => n.blend_mode = blend_mode,
        Node::Polygon(n) => n.blend_mode = blend_mode,
        Node::RegularPolygon(n) => n.blend_mode = blend_mode,
        Node::RegularStarPolygon(n) => n.blend_mode = blend_mode,
        Node::Line(n) => n.blend_mode = blend_mode,
        Node::TextSpan(n) => n.blend_mode = blend_mode,
        Node::AttributedText(n) => n.blend_mode = blend_mode,
        Node::Path(n) => n.blend_mode = blend_mode,
        Node::Vector(n) => n.blend_mode = blend_mode,
        Node::BooleanOperation(n) => n.blend_mode = blend_mode,
        Node::Image(n) => n.blend_mode = blend_mode,
        Node::MarkdownEmbed(n) => n.blend_mode = blend_mode,
        Node::HTMLEmbed(n) => n.blend_mode = blend_mode,
    }
}

pub(crate) fn set_active(node: &mut Node, active: bool) {
    match node {
        Node::InitialContainer(n) => n.active = active,
        Node::Container(n) => n.active = active,
        Node::Error(n) => n.active = active,
        Node::Group(n) => n.active = active,
        Node::Tray(n) => n.active = active,
        Node::Rectangle(n) => n.active = active,
        Node::Ellipse(n) => n.active = active,
        Node::Polygon(n) => n.active = active,
        Node::RegularPolygon(n) => n.active = active,
        Node::RegularStarPolygon(n) => n.active = active,
        Node::Line(n) => n.active = active,
        Node::TextSpan(n) => n.active = active,
        Node::AttributedText(n) => n.active = active,
        Node::Path(n) => n.active = active,
        Node::Vector(n) => n.active = active,
        Node::BooleanOperation(n) => n.active = active,
        Node::Image(n) => n.active = active,
        Node::MarkdownEmbed(n) => n.active = active,
        Node::HTMLEmbed(n) => n.active = active,
    }
}

pub(crate) fn set_opacity(node: &mut Node, opacity: f32) {
    match node {
        Node::InitialContainer(_) => {}
        Node::Container(n) => n.opacity = opacity,
        Node::Error(n) => n.opacity = opacity,
        Node::Group(n) => n.opacity = opacity,
        Node::Tray(n) => n.opacity = opacity,
        Node::Rectangle(n) => n.opacity = opacity,
        Node::Ellipse(n) => n.opacity = opacity,
        Node::Polygon(n) => n.opacity = opacity,
        Node::RegularPolygon(n) => n.opacity = opacity,
        Node::RegularStarPolygon(n) => n.opacity = opacity,
        Node::Line(n) => n.opacity = opacity,
        Node::TextSpan(n) => n.opacity = opacity,
        Node::AttributedText(n) => n.opacity = opacity,
        Node::Path(n) => n.opacity = opacity,
        Node::Vector(n) => n.opacity = opacity,
        Node::BooleanOperation(n) => n.opacity = opacity,
        Node::Image(n) => n.opacity = opacity,
        Node::MarkdownEmbed(n) => n.opacity = opacity,
        Node::HTMLEmbed(n) => n.opacity = opacity,
    }
}

/// Rotation angle in radians for transform-based node kinds. `None`
/// for kinds positioned by layout basis (Container, Tray,
/// InitialContainer) — their rotation is outside the patch domain.
pub(crate) fn node_rotation(node: &Node) -> Option<f32> {
    match node {
        Node::InitialContainer(_) | Node::Container(_) | Node::Tray(_) => Option::None,
        Node::Group(n) => Some(n.transform.unwrap_or_default().rotation()),
        Node::BooleanOperation(n) => Some(n.transform.unwrap_or_default().rotation()),
        Node::Rectangle(n) => Some(n.transform.rotation()),
        Node::Ellipse(n) => Some(n.transform.rotation()),
        Node::Polygon(n) => Some(n.transform.rotation()),
        Node::RegularPolygon(n) => Some(n.transform.rotation()),
        Node::RegularStarPolygon(n) => Some(n.transform.rotation()),
        Node::Line(n) => Some(n.transform.rotation()),
        Node::TextSpan(n) => Some(n.transform.rotation()),
        Node::AttributedText(n) => Some(n.transform.rotation()),
        Node::Path(n) => Some(n.transform.rotation()),
        Node::Vector(n) => Some(n.transform.rotation()),
        Node::Image(n) => Some(n.transform.rotation()),
        Node::Error(n) => Some(n.transform.rotation()),
        Node::MarkdownEmbed(n) => Some(n.transform.rotation()),
        Node::HTMLEmbed(n) => Some(n.transform.rotation()),
    }
}

pub(crate) fn set_rotation(node: &mut Node, angle: f32) {
    let t: Option<&mut math2::transform::AffineTransform> = match node {
        Node::InitialContainer(_) | Node::Container(_) | Node::Tray(_) => Option::None,
        Node::Group(n) => Some(n.transform.get_or_insert_with(Default::default)),
        Node::BooleanOperation(n) => Some(n.transform.get_or_insert_with(Default::default)),
        Node::Rectangle(n) => Some(&mut n.transform),
        Node::Ellipse(n) => Some(&mut n.transform),
        Node::Polygon(n) => Some(&mut n.transform),
        Node::RegularPolygon(n) => Some(&mut n.transform),
        Node::RegularStarPolygon(n) => Some(&mut n.transform),
        Node::Line(n) => Some(&mut n.transform),
        Node::TextSpan(n) => Some(&mut n.transform),
        Node::AttributedText(n) => Some(&mut n.transform),
        Node::Path(n) => Some(&mut n.transform),
        Node::Vector(n) => Some(&mut n.transform),
        Node::Image(n) => Some(&mut n.transform),
        Node::Error(n) => Some(&mut n.transform),
        Node::MarkdownEmbed(n) => Some(&mut n.transform),
        Node::HTMLEmbed(n) => Some(&mut n.transform),
    };
    if let Some(t) = t {
        t.set_rotation(angle);
    }
}

/// Text content (TextSpan only).
pub(crate) fn node_text(node: &Node) -> Option<String> {
    match node {
        Node::TextSpan(n) => Some(n.text.clone()),
        _ => Option::None,
    }
}

pub(crate) fn set_text(node: &mut Node, text: &str) {
    if let Node::TextSpan(n) = node {
        n.text = text.to_string();
    }
}

/// The vector network as local polyline vertices, when the node is a
/// Vector whose network is a pure open polyline (straight consecutive
/// segments, no regions) — the `vector_polyline` patch domain.
pub(crate) fn node_vector_polyline(node: &Node) -> Option<Vec<(f32, f32)>> {
    let Node::Vector(n) = node else {
        return Option::None;
    };
    if !n.network.regions.is_empty() {
        return Option::None;
    }
    let straight_chain = n
        .network
        .segments
        .iter()
        .enumerate()
        .all(|(i, s)| s.a == i && s.b == i + 1 && s.ta == (0.0, 0.0) && s.tb == (0.0, 0.0));
    if !straight_chain
        || (n.network.vertices.len() != n.network.segments.len() + 1
            && !(n.network.vertices.is_empty() && n.network.segments.is_empty())
            && !(n.network.vertices.len() == 1 && n.network.segments.is_empty()))
    {
        return Option::None;
    }
    Some(n.network.vertices.clone())
}

pub(crate) fn set_vector_polyline(node: &mut Node, points: &[(f32, f32)]) {
    if let Node::Vector(n) = node {
        n.network = polyline_network(points);
    }
}

/// The node's vector network (Vector kind only) — the `vector_network`
/// patch domain.
pub(crate) fn node_vector_network(node: &Node) -> Option<&grida::vectornetwork::VectorNetwork> {
    match node {
        Node::Vector(n) => Some(&n.network),
        _ => Option::None,
    }
}

pub(crate) fn set_vector_network(node: &mut Node, network: &grida::vectornetwork::VectorNetwork) {
    if let Node::Vector(n) = node {
        n.network = network.clone();
    }
}

/// Whether any of the node's fills is an image paint — the edit-mode
/// dispatch table's image-fill row (`docs/wg/canvas/edit-mode.md`
/// MODE-2: double-clicking an image-filled shape means "edit the
/// image", not its geometry).
pub(crate) fn node_has_image_fill(node: &Node) -> bool {
    node.fills()
        .is_some_and(|fills| fills.iter().any(|p| matches!(p, Paint::Image(_))))
}

/// A straight-segment open polyline network over local vertices.
pub fn polyline_network(points: &[(f32, f32)]) -> grida::vectornetwork::VectorNetwork {
    grida::vectornetwork::VectorNetwork {
        vertices: points.to_vec(),
        segments: (0..points.len().saturating_sub(1))
            .map(|i| grida::vectornetwork::VectorNetworkSegment::ab(i, i + 1))
            .collect(),
        regions: Vec::new(),
    }
}

/// Overwrite the node's fills with a single solid paint. Only called
/// after [`single_solid_fill`] validated the node (M1 domain).
pub(crate) fn set_fill_solid(node: &mut Node, color: CGColor) {
    let paint = Paint::Solid(SolidPaint::new_color(color));
    match node {
        Node::Container(n) => n.fills = Paints::new([paint]),
        Node::Tray(n) => n.fills = Paints::new([paint]),
        Node::Rectangle(n) => n.fills = Paints::new([paint]),
        Node::Ellipse(n) => n.fills = Paints::new([paint]),
        Node::Polygon(n) => n.fills = Paints::new([paint]),
        Node::RegularPolygon(n) => n.fills = Paints::new([paint]),
        Node::RegularStarPolygon(n) => n.fills = Paints::new([paint]),
        Node::TextSpan(n) => n.fills = Paints::new([paint]),
        Node::Path(n) => n.fills = Paints::new([paint]),
        Node::Vector(n) => n.fills = Paints::new([paint]),
        _ => {}
    }
}

/// Overwrite the node's whole fill stack. Covers exactly the kinds
/// [`Node::fills`] reads (so the read domain equals the write domain
/// and the `fills` inverse is always applicable). Only called after
/// validation confirmed `node.fills()` was `Some`.
pub(crate) fn set_fills(node: &mut Node, fills: Paints) {
    match node {
        Node::Container(n) => n.fills = fills,
        Node::Tray(n) => n.fills = fills,
        Node::Rectangle(n) => n.fills = fills,
        Node::Ellipse(n) => n.fills = fills,
        Node::Polygon(n) => n.fills = fills,
        Node::RegularPolygon(n) => n.fills = fills,
        Node::RegularStarPolygon(n) => n.fills = fills,
        Node::TextSpan(n) => n.fills = fills,
        Node::AttributedText(n) => n.fills = fills,
        Node::Path(n) => n.fills = fills,
        Node::Vector(n) => n.fills = fills,
        Node::BooleanOperation(n) => n.fills = fills,
        Node::MarkdownEmbed(n) => n.fills = fills,
        Node::HTMLEmbed(n) => n.fills = fills,
        _ => {}
    }
}

/// The node's stroke paint stack, or `None` for kinds that carry no
/// strokes. The engine exposes no `Node::strokes()` accessor (unlike
/// `fills()`), so this reader lives here — covering exactly the kinds
/// with a `strokes` field, so the read domain equals [`set_strokes`]'s
/// write domain and the `strokes` inverse is always applicable.
pub(crate) fn node_strokes_ref(node: &Node) -> Option<&Paints> {
    match node {
        Node::Container(n) => Some(&n.strokes),
        Node::Tray(n) => Some(&n.strokes),
        Node::Rectangle(n) => Some(&n.strokes),
        Node::Ellipse(n) => Some(&n.strokes),
        Node::Polygon(n) => Some(&n.strokes),
        Node::RegularPolygon(n) => Some(&n.strokes),
        Node::RegularStarPolygon(n) => Some(&n.strokes),
        Node::TextSpan(n) => Some(&n.strokes),
        Node::AttributedText(n) => Some(&n.strokes),
        Node::Path(n) => Some(&n.strokes),
        Node::Vector(n) => Some(&n.strokes),
        Node::BooleanOperation(n) => Some(&n.strokes),
        Node::Line(n) => Some(&n.strokes),
        Node::Image(n) => Some(&n.strokes),
        _ => Option::None,
    }
}

/// Overwrite the node's whole stroke paint stack. Covers exactly the
/// kinds [`node_strokes_ref`] reads.
pub(crate) fn set_strokes(node: &mut Node, strokes: Paints) {
    match node {
        Node::Container(n) => n.strokes = strokes,
        Node::Tray(n) => n.strokes = strokes,
        Node::Rectangle(n) => n.strokes = strokes,
        Node::Ellipse(n) => n.strokes = strokes,
        Node::Polygon(n) => n.strokes = strokes,
        Node::RegularPolygon(n) => n.strokes = strokes,
        Node::RegularStarPolygon(n) => n.strokes = strokes,
        Node::TextSpan(n) => n.strokes = strokes,
        Node::AttributedText(n) => n.strokes = strokes,
        Node::Path(n) => n.strokes = strokes,
        Node::Vector(n) => n.strokes = strokes,
        Node::BooleanOperation(n) => n.strokes = strokes,
        Node::Line(n) => n.strokes = strokes,
        Node::Image(n) => n.strokes = strokes,
        _ => {}
    }
}

/// The node's uniform stroke weight, normalized across the engine's
/// three width representations (`StrokeWidth` enum, `SingularStrokeWidth`,
/// plain `f32`). `None` for kinds with no stroke width.
pub(crate) fn node_stroke_width_val(node: &Node) -> Option<f32> {
    match node {
        Node::Container(n) => Some(n.stroke_width.max()),
        Node::Tray(n) => Some(n.stroke_width.max()),
        Node::Rectangle(n) => Some(n.stroke_width.max()),
        Node::Image(n) => Some(n.stroke_width.max()),
        Node::Ellipse(n) => Some(n.stroke_width.value_or_zero()),
        Node::Polygon(n) => Some(n.stroke_width.value_or_zero()),
        Node::RegularPolygon(n) => Some(n.stroke_width.value_or_zero()),
        Node::RegularStarPolygon(n) => Some(n.stroke_width.value_or_zero()),
        Node::Path(n) => Some(n.stroke_width.value_or_zero()),
        Node::BooleanOperation(n) => Some(n.stroke_width.value_or_zero()),
        Node::Line(n) => Some(n.stroke_width),
        Node::Vector(n) => Some(n.stroke_width),
        Node::TextSpan(n) => Some(n.stroke_width),
        Node::AttributedText(n) => Some(n.stroke_width),
        _ => Option::None,
    }
}

/// Set the node's uniform stroke weight, writing whichever width
/// representation the kind carries. Covers exactly [`node_stroke_width_val`].
pub(crate) fn set_stroke_width_val(node: &mut Node, w: f32) {
    match node {
        Node::Container(n) => n.stroke_width = StrokeWidth::Uniform(w),
        Node::Tray(n) => n.stroke_width = StrokeWidth::Uniform(w),
        Node::Rectangle(n) => n.stroke_width = StrokeWidth::Uniform(w),
        Node::Image(n) => n.stroke_width = StrokeWidth::Uniform(w),
        Node::Ellipse(n) => n.stroke_width = SingularStrokeWidth(Some(w)),
        Node::Polygon(n) => n.stroke_width = SingularStrokeWidth(Some(w)),
        Node::RegularPolygon(n) => n.stroke_width = SingularStrokeWidth(Some(w)),
        Node::RegularStarPolygon(n) => n.stroke_width = SingularStrokeWidth(Some(w)),
        Node::Path(n) => n.stroke_width = SingularStrokeWidth(Some(w)),
        Node::BooleanOperation(n) => n.stroke_width = SingularStrokeWidth(Some(w)),
        Node::Line(n) => n.stroke_width = w,
        Node::Vector(n) => n.stroke_width = w,
        Node::TextSpan(n) => n.stroke_width = w,
        Node::AttributedText(n) => n.stroke_width = w,
        _ => {}
    }
}

/// The node's stroke style (align / cap / join / miter / dash) — the
/// common `stroke_style` kinds. `None` for kinds that flatten or lack
/// it (Line, Vector, text): their bespoke stroke geometry and markers
/// are a later refinement.
pub(crate) fn node_stroke_style(node: &Node) -> Option<&StrokeStyle> {
    match node {
        Node::Container(n) => Some(&n.stroke_style),
        Node::Tray(n) => Some(&n.stroke_style),
        Node::Rectangle(n) => Some(&n.stroke_style),
        Node::Image(n) => Some(&n.stroke_style),
        Node::Ellipse(n) => Some(&n.stroke_style),
        Node::Polygon(n) => Some(&n.stroke_style),
        Node::RegularPolygon(n) => Some(&n.stroke_style),
        Node::RegularStarPolygon(n) => Some(&n.stroke_style),
        Node::Path(n) => Some(&n.stroke_style),
        Node::BooleanOperation(n) => Some(&n.stroke_style),
        _ => Option::None,
    }
}

/// Mutable [`node_stroke_style`].
pub(crate) fn node_stroke_style_mut(node: &mut Node) -> Option<&mut StrokeStyle> {
    match node {
        Node::Container(n) => Some(&mut n.stroke_style),
        Node::Tray(n) => Some(&mut n.stroke_style),
        Node::Rectangle(n) => Some(&mut n.stroke_style),
        Node::Image(n) => Some(&mut n.stroke_style),
        Node::Ellipse(n) => Some(&mut n.stroke_style),
        Node::Polygon(n) => Some(&mut n.stroke_style),
        Node::RegularPolygon(n) => Some(&mut n.stroke_style),
        Node::RegularStarPolygon(n) => Some(&mut n.stroke_style),
        Node::Path(n) => Some(&mut n.stroke_style),
        Node::BooleanOperation(n) => Some(&mut n.stroke_style),
        _ => Option::None,
    }
}

/// The dash pattern as a plain sequence (empty = solid).
pub(crate) fn stroke_style_dash(style: &StrokeStyle) -> Vec<f32> {
    style
        .stroke_dash_array
        .as_ref()
        .map(|d| d.0.clone())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Batch coalescing (endpoint-minimal gesture entries)
// ---------------------------------------------------------------------------

/// Collapse consecutive patches on the same node into their endpoint
/// patch — the history spec's permitted endpoint-minimality, made
/// real so a long drag (or a pencil stroke) records an entry of a few
/// mutations instead of one per pointer move.
///
/// A `Patch` merges into an earlier `Patch` with the same id when
/// every mutation between them is also a `Patch` (patches on distinct
/// nodes commute; structural mutations do not, so they fence the
/// scan). Later fields override earlier ones; `size` merges per axis.
///
/// The guide domain gets the same endpoint treatment (a guide drag is
/// a stream of `GuideSet`s; a create-drag is a `GuideInsert` plus that
/// stream): a `GuideSet` merges backwards into a `GuideSet` — or the
/// `GuideInsert` — for the same index, scanning across mutations it
/// commutes with (`Patch`es and guide sets of other indices);
/// anything that can reindex the guide list fences the scan.
pub(crate) fn coalesce_batch(batch: Vec<Mutation>) -> Vec<Mutation> {
    let mut out: Vec<Mutation> = Vec::with_capacity(batch.len());
    'next: for mutation in batch {
        if let Mutation::Patch { id, set } = &mutation {
            for prior in out.iter_mut().rev() {
                match prior {
                    Mutation::Patch {
                        id: prior_id,
                        set: prior_set,
                    } => {
                        if prior_id == id {
                            merge_patch_over(prior_set, set);
                            continue 'next;
                        }
                    }
                    // A structural mutation fences the scan.
                    _ => break,
                }
            }
        }
        if let Mutation::GuideSet { index, offset } = &mutation {
            for prior in out.iter_mut().rev() {
                match prior {
                    Mutation::GuideSet {
                        index: prior_index,
                        offset: prior_offset,
                    } => {
                        if prior_index == index {
                            *prior_offset = *offset;
                            continue 'next;
                        }
                    }
                    Mutation::GuideInsert {
                        index: prior_index,
                        guide,
                    } => {
                        if prior_index == index {
                            guide.offset = *offset;
                            continue 'next;
                        }
                        // An insert at another index reindexes the
                        // list: fence.
                        break;
                    }
                    // Patches commute with guide sets.
                    Mutation::Patch { .. } => {}
                    _ => break,
                }
            }
        }
        // The background is a singleton field: a later set overrides
        // an earlier one across anything it commutes with (patches
        // and guide edits touch neither the field nor its meaning).
        if let Mutation::SceneBackground { color } = &mutation {
            for prior in out.iter_mut().rev() {
                match prior {
                    Mutation::SceneBackground { color: prior_color } => {
                        *prior_color = *color;
                        continue 'next;
                    }
                    Mutation::Patch { .. }
                    | Mutation::GuideSet { .. }
                    | Mutation::GuideInsert { .. }
                    | Mutation::GuideRemove { .. } => {}
                    _ => break,
                }
            }
        }
        out.push(mutation);
    }
    out
}

/// Apply `over` on top of `base` field-wise (later wins; size merges
/// per axis).
fn merge_patch_over(base: &mut PropPatch, over: &PropPatch) {
    // Destructure `over` so that adding a field to `PropPatch` fails to
    // compile here until its coalescing behavior is decided. This is
    // the exhaustiveness guard that keeps the mirror honest: a silently
    // dropped field would corrupt the coalesced endpoint and break the
    // undo/redo round-trip (DOC-2 / HISB-1) — the failure this crate
    // exists to prevent.
    let PropPatch {
        name,
        active,
        opacity,
        fill_solid,
        fills,
        strokes,
        stroke_width,
        stroke_align,
        stroke_cap,
        stroke_join,
        stroke_miter,
        stroke_dash,
        layer_blur,
        shadows,
        blend_mode,
        corner_radius,
        point_count,
        clips_content,
        text_align,
        text_align_vertical,
        font_size,
        font_weight,
        font_italic,
        line_height,
        letter_spacing,
        position,
        size,
        rotation,
        text,
        vector_polyline,
        vector_network,
    } = over;

    // Scalar "later wins if set" fields.
    if name.is_some() {
        base.name = name.clone();
    }
    if active.is_some() {
        base.active = *active;
    }
    if opacity.is_some() {
        base.opacity = *opacity;
    }
    if fill_solid.is_some() {
        base.fill_solid = *fill_solid;
    }
    if fills.is_some() {
        base.fills = fills.clone();
    }
    if strokes.is_some() {
        base.strokes = strokes.clone();
    }
    if stroke_width.is_some() {
        base.stroke_width = *stroke_width;
    }
    if stroke_align.is_some() {
        base.stroke_align = *stroke_align;
    }
    if stroke_cap.is_some() {
        base.stroke_cap = *stroke_cap;
    }
    if stroke_join.is_some() {
        base.stroke_join = *stroke_join;
    }
    if stroke_miter.is_some() {
        base.stroke_miter = *stroke_miter;
    }
    if stroke_dash.is_some() {
        base.stroke_dash = stroke_dash.clone();
    }
    if layer_blur.is_some() {
        base.layer_blur = layer_blur.clone();
    }
    if shadows.is_some() {
        base.shadows = shadows.clone();
    }
    if blend_mode.is_some() {
        base.blend_mode = *blend_mode;
    }
    if corner_radius.is_some() {
        base.corner_radius = *corner_radius;
    }
    if point_count.is_some() {
        base.point_count = *point_count;
    }
    if clips_content.is_some() {
        base.clips_content = *clips_content;
    }
    if text_align.is_some() {
        base.text_align = *text_align;
    }
    if text_align_vertical.is_some() {
        base.text_align_vertical = *text_align_vertical;
    }
    if font_size.is_some() {
        base.font_size = *font_size;
    }
    if font_weight.is_some() {
        base.font_weight = *font_weight;
    }
    if font_italic.is_some() {
        base.font_italic = *font_italic;
    }
    if line_height.is_some() {
        base.line_height = line_height.clone();
    }
    if letter_spacing.is_some() {
        base.letter_spacing = *letter_spacing;
    }
    if position.is_some() {
        base.position = *position;
    }
    // Size merges per axis: a later patch touching one axis leaves the
    // other axis's earlier value intact.
    if let Some((w, h)) = *size {
        let (bw, bh) = base.size.unwrap_or((Option::None, Option::None));
        base.size = Some((w.or(bw), h.or(bh)));
    }
    if rotation.is_some() {
        base.rotation = *rotation;
    }
    if text.is_some() {
        base.text = text.clone();
    }
    // The two network fields write the same property: the later one
    // wins outright and clears the other, so the endpoint patch stays
    // unambiguous (apply rejects a patch carrying both).
    if vector_polyline.is_some() {
        base.vector_polyline = vector_polyline.clone();
        base.vector_network = Option::None;
    }
    if vector_network.is_some() {
        base.vector_network = vector_network.clone();
        base.vector_polyline = Option::None;
    }
}
