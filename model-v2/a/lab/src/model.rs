//! The `anchor` document model — lab subset of `model-v2/models/a.md`.
//!
//! Kinds implemented: frame, shape (rect/ellipse/line), text, group, lens.
//! Omitted for the lab (noted in the report): tray, image, embed, vector,
//! bool — none of them exercise a geometry mechanism the five above don't.
//!
//! Lab simplifications, all declared:
//! - node ids are `u32`; children are an ordered `Vec` on the parent
//!   (fractional-index ordering is not under test here);
//! - `SurfaceStyle` is reduced to an optional fill color used only by the
//!   SVG snapshot renderer.

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

#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub id: NodeId,
    pub header: Header,
    pub payload: Payload,
    pub children: Vec<NodeId>,
    pub fill: Option<String>, // lab-only paint for SVG snapshots
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
            None => other
                .slots
                .get(i)
                .map(|o| o.is_none())
                .unwrap_or(true),
            Some(n) => {
                other.get_opt(i as NodeId) == Some(n)
                    && self.parents[i] == other.parents[i]
            }
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

    fn ensure_slot(&mut self, id: NodeId) {
        let need = id as usize + 1;
        if self.slots.len() < need {
            self.slots.resize_with(need, || None);
            self.parents.resize(need, None);
        }
    }

    /// Structural insert: registers the node at `node.id` and attaches it
    /// as the last child of `parent`.
    pub fn add_child(&mut self, parent: NodeId, node: Node) -> NodeId {
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
        self.slots[id as usize] = None;
        self.parents[id as usize] = None;
        n
    }

    /// Tombstone a single slot without touching its (already re-homed)
    /// children — the ungroup bake's final step.
    pub fn remove_slot(&mut self, id: NodeId) {
        self.slots[id as usize] = None;
        self.parents[id as usize] = None;
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
                fill: None,
            },
        );
        DocBuilder {
            nodes,
            next: 1,
            root: 0,
        }
    }

    pub fn add(&mut self, parent: NodeId, header: Header, payload: Payload) -> NodeId {
        let id = self.next;
        self.next += 1;
        self.nodes.insert(
            id,
            Node {
                id,
                header,
                payload,
                children: vec![],
                fill: None,
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
