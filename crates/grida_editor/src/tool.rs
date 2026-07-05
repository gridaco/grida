//! The authoring tool system — `docs/wg/canvas/tool.md` (`TOOL-*`).
//!
//! The [`ToolMachine`] is editor-core and headless: it consumes
//! normalized pointer events (canvas-space plus screen-space points)
//! and emits mutation batches through the editor's dispatch — never
//! touching a renderer. The shell routes canvas pointer events here
//! while a non-cursor tool is armed (the `SURF-1` ladder's tool rung)
//! and reflects the [`ToolOutcome`] (flush/mirror, selection, title,
//! text-edit session entry).
//!
//! Authoring previews ride the existing gesture frame (`HISB-2`):
//! drag-insert is `begin_gesture` → insert + size previews (silent) →
//! `commit_gesture`; Escape aborts the frame and the inserted node
//! vanishes because gesture abort restores the pre-gesture document
//! (`HISB-4`, `TOOL-4`). No new preview mechanism exists.
//!
//! The text tool composes with the engine's text-edit session (the
//! shell owns the live session; see `tool.md` "Text"): the machine
//! opens the gesture and inserts the node, the session accumulates
//! typing, and [`ToolMachine::finish_text`] shapes the single history
//! entry (`TOOL-6`) — or aborts the frame when a fresh node ends
//! empty.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::schema::{LayerEffects, LayoutPositioningBasis, Node, Size};
use math2::transform::AffineTransform;

use crate::document::{Fragment, Id, Mutation, PropPatch, polyline_network};
use crate::editor::{Editor, Recording};
use crate::history::Origin;

/// Pointer travel (screen px) that turns an armed press into a drag
/// (`tool.md`: an explicit named number, not a host accident).
pub const DRAG_THRESHOLD_PX: f32 = 5.0;

/// Click-insert default size (web parity: 100×100, centered).
pub const CLICK_INSERT_SIZE: f32 = 100.0;

/// Pencil stroke width (fixed in M1; see `tool.md` Pencil).
pub const PENCIL_STROKE_WIDTH: f32 = 2.0;

/// Shape kinds served by the shared insertion machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShapeKind {
    Rectangle,
    Ellipse,
    Polygon,
}

/// The closed tool taxonomy (`TOOL-1`). Virtual tools (hand, zoom) and
/// deferred tools (pen, scale) are not members — see `tool.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Tool {
    /// The home state: selection / surface gestures.
    #[default]
    Cursor,
    Shape(ShapeKind),
    /// Container (`tray: false`) or Tray (`tray: true`) — the adopting
    /// insert tools (`TOOL-5`).
    Container {
        tray: bool,
    },
    Text,
    /// Line (`arrow: false`) or Arrow (`arrow: true`) — same node
    /// kind, marker difference only (`TOOL-9`).
    Line {
        arrow: bool,
    },
    Pencil,
}

/// What the machine did with an event, beyond the document itself —
/// content changes reach pixels through the editor's damage ledger
/// (`frame.md`), so the outcome only carries what the ledger cannot:
/// lifecycle facts and shell follow-ups.
#[derive(Debug, Default)]
pub struct ToolOutcome {
    /// A history entry was committed.
    pub committed: bool,
    /// A gesture was aborted (the working copy rolled back).
    pub reverted: bool,
    /// Selection to adopt (the inserted node).
    pub select: Option<Vec<Id>>,
    /// The shell should enter the engine text-edit session for this
    /// node (`TOOL-6`).
    pub enter_text_edit: Option<Id>,
}

impl ToolOutcome {
    /// A lifecycle transition the shell must reflect in its own chrome
    /// (toolbar state, cursor, selection push) happened.
    pub fn is_effective(&self) -> bool {
        self.committed || self.reverted || self.select.is_some() || self.enter_text_edit.is_some()
    }
}

/// The insertion state machine phase (`tool.md` "Insertion gestures").
#[derive(Debug, Clone)]
enum Phase {
    Idle,
    /// Pointer is down, threshold not yet crossed.
    Armed {
        anchor_canvas: [f32; 2],
        anchor_screen: [f32; 2],
    },
    /// Drag-insert in flight: the node exists inside an open gesture.
    Dragging {
        anchor: [f32; 2],
        id: Id,
    },
    /// Pencil stroke in flight: local polyline grows per move.
    Stroking {
        anchor: [f32; 2],
        id: Id,
        points: Vec<(f32, f32)>,
    },
    /// A text-edit session is active (the shell owns the live session;
    /// the gesture frame is open — `finish_text` closes it).
    TextSession {
        id: Id,
        fresh: bool,
    },
}

/// The tool machine: active tool + insertion phase. Instance UI state
/// (`TOOL-2`) — creating, holding, or switching tools never touches
/// the document.
pub struct ToolMachine {
    tool: Tool,
    phase: Phase,
    minted: u64,
}

impl Default for ToolMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolMachine {
    pub fn new() -> Self {
        Self {
            tool: Tool::Cursor,
            phase: Phase::Idle,
            minted: 0,
        }
    }

    /// The active tool (`TOOL-1`: `Cursor` on a fresh machine).
    pub fn tool(&self) -> Tool {
        self.tool
    }

    /// Activate a tool. No document effect (`TOOL-2`); an in-flight
    /// authoring drag keeps running under its original tool.
    pub fn set_tool(&mut self, tool: Tool) {
        if matches!(self.phase, Phase::Idle) {
            self.tool = tool;
        }
    }

    /// Whether canvas pointer events should route here instead of the
    /// surface (the `SURF-1` tool rung).
    pub fn wants_pointer(&self) -> bool {
        !matches!(self.tool, Tool::Cursor) || !matches!(self.phase, Phase::Idle)
    }

    /// Whether a text-edit session is pending on this machine.
    pub fn in_text_session(&self) -> bool {
        matches!(self.phase, Phase::TextSession { .. })
    }

    /// The node under the pending text-edit session, if any.
    pub fn text_session_node(&self) -> Option<Id> {
        match &self.phase {
            Phase::TextSession { id, .. } => Some(id.clone()),
            _ => Option::None,
        }
    }

    /// Whether a press/drag sequence is in flight (armed, dragging, or
    /// stroking) — UI regions must not steal the pointer mid-sequence.
    pub fn pointer_busy(&self) -> bool {
        matches!(
            self.phase,
            Phase::Armed { .. } | Phase::Dragging { .. } | Phase::Stroking { .. }
        )
    }

    // -- pointer events -------------------------------------------------------

    /// Pointer down on the canvas with a non-cursor tool: arm.
    pub fn pointer_down(
        &mut self,
        _editor: &mut Editor,
        canvas: [f32; 2],
        screen: [f32; 2],
    ) -> ToolOutcome {
        if matches!(self.tool, Tool::Cursor) || !matches!(self.phase, Phase::Idle) {
            return ToolOutcome::default();
        }
        self.phase = Phase::Armed {
            anchor_canvas: canvas,
            anchor_screen: screen,
        };
        ToolOutcome::default()
    }

    /// Pointer move: crossing the threshold begins the drag-insert /
    /// stroke; while dragging, previews the size (or the polyline).
    pub fn pointer_move(
        &mut self,
        editor: &mut Editor,
        canvas: [f32; 2],
        screen: [f32; 2],
    ) -> ToolOutcome {
        match self.phase.clone() {
            Phase::Armed {
                anchor_canvas,
                anchor_screen,
            } => {
                let dx = screen[0] - anchor_screen[0];
                let dy = screen[1] - anchor_screen[1];
                if (dx * dx + dy * dy).sqrt() < DRAG_THRESHOLD_PX {
                    return ToolOutcome::default();
                }
                self.begin_drag(editor, anchor_canvas, canvas)
            }
            Phase::Dragging { anchor, id } => {
                let batch = self.drag_preview_batch(editor, &id, anchor, canvas);
                if !batch.is_empty() {
                    let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                }
                ToolOutcome::default()
            }
            Phase::Stroking {
                anchor,
                id,
                mut points,
            } => {
                let local = (canvas[0] - anchor[0], canvas[1] - anchor[1]);
                if points.last() == Some(&local) {
                    return ToolOutcome::default();
                }
                points.push(local);
                let batch = vec![Mutation::Patch {
                    id: id.clone(),
                    set: Box::new(PropPatch {
                        vector_polyline: Some(points.clone()),
                        ..Default::default()
                    }),
                }];
                let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                self.phase = Phase::Stroking { anchor, id, points };
                ToolOutcome::default()
            }
            _ => ToolOutcome::default(),
        }
    }

    /// Pointer up: click-insert (below threshold) or commit the drag.
    pub fn pointer_up(&mut self, editor: &mut Editor, _canvas: [f32; 2]) -> ToolOutcome {
        match self.phase.clone() {
            Phase::Armed { anchor_canvas, .. } => {
                self.phase = Phase::Idle;
                self.click_insert(editor, anchor_canvas)
            }
            Phase::Dragging { id, .. } => {
                let mut out = ToolOutcome::default();
                if let Tool::Container { .. } = self.tool {
                    let batch = adoption_batch(editor, &id);
                    if !batch.is_empty() {
                        let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                    }
                }
                if matches!(self.tool, Tool::Text) {
                    // Drag-sized text: the gesture stays open; typing
                    // happens in the session, `finish_text` commits.
                    self.phase = Phase::TextSession {
                        id: id.clone(),
                        fresh: true,
                    };
                    out.select = Some(vec![id.clone()]);
                    out.enter_text_edit = Some(id);
                    return out;
                }
                editor.commit_gesture(Some("insert".to_string()));
                out.committed = true;
                out.select = Some(vec![id]);
                self.phase = Phase::Idle;
                self.revert_after_insert();
                out
            }
            Phase::Stroking { id, .. } => {
                editor.commit_gesture(Some("stroke".to_string()));
                self.phase = Phase::Idle;
                // Pencil stays active across strokes (TOOL-8 exception).
                ToolOutcome {
                    committed: true,
                    select: Some(vec![id]),
                    ..Default::default()
                }
            }
            _ => ToolOutcome::default(),
        }
    }

    /// Escape: abort an in-flight authoring drag (`TOOL-4`), else
    /// revert a non-cursor tool to cursor. Returns `None` when the
    /// machine had nothing to do (the shell's Escape ladder falls
    /// through to deselect).
    pub fn escape(&mut self, editor: &mut Editor) -> Option<ToolOutcome> {
        match &self.phase {
            Phase::Dragging { .. } | Phase::Stroking { .. } => {
                editor.abort_gesture();
                self.phase = Phase::Idle;
                Some(ToolOutcome {
                    reverted: true,
                    ..Default::default()
                })
            }
            Phase::Armed { .. } => {
                self.phase = Phase::Idle;
                Some(ToolOutcome::default())
            }
            Phase::TextSession { .. } => Option::None, // shell exits the session first
            Phase::Idle if !matches!(self.tool, Tool::Cursor) => {
                self.tool = Tool::Cursor;
                Some(ToolOutcome::default())
            }
            Phase::Idle => Option::None,
        }
    }

    // -- text session (TOOL-6) --------------------------------------------------

    /// Open a text-edit frame on an **existing** text node (cursor
    /// double-click path). The session lives in the shell;
    /// [`finish_text`](Self::finish_text) closes the frame.
    pub fn begin_text_edit_existing(&mut self, editor: &mut Editor, id: Id) {
        editor.begin_gesture();
        self.phase = Phase::TextSession { id, fresh: false };
    }

    /// Close the text-edit frame with the session's final text
    /// (`None` = unmodified). One entry containing the node with its
    /// final text — or a full abort when a fresh node ends empty.
    pub fn finish_text(&mut self, editor: &mut Editor, final_text: Option<String>) -> ToolOutcome {
        let Phase::TextSession { id, fresh } = self.phase.clone() else {
            return ToolOutcome::default();
        };
        self.phase = Phase::Idle;
        let mut out = ToolOutcome::default();

        let effective = final_text
            .clone()
            .or_else(|| editor.node_text(&id))
            .unwrap_or_default();
        if fresh && effective.is_empty() {
            // Empty authoring leaves no trace (TOOL-6).
            editor.abort_gesture();
            out.reverted = true;
        } else {
            if let Some(text) = final_text {
                let batch = vec![Mutation::Patch {
                    id: id.clone(),
                    set: Box::new(PropPatch {
                        text: Some(text),
                        ..Default::default()
                    }),
                }];
                let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
            }
            editor.commit_gesture(Some("text".to_string()));
            out.committed = true;
            out.select = Some(vec![id]);
        }
        self.revert_after_insert();
        out
    }

    // -- internals ----------------------------------------------------------------

    /// Threshold crossed: open the gesture and insert the seed node.
    fn begin_drag(
        &mut self,
        editor: &mut Editor,
        anchor: [f32; 2],
        canvas: [f32; 2],
    ) -> ToolOutcome {
        let id = self.mint(editor);
        let fragment = match self.tool {
            Tool::Pencil => pencil_fragment(id.clone(), anchor, &[(0.0, 0.0)]),
            _ => self.insert_fragment(
                id.clone(),
                anchor,
                Size {
                    width: 1.0,
                    height: 1.0,
                },
            ),
        };
        editor.begin_gesture();
        let index = editor.children(Option::None).len();
        let insert = vec![Mutation::Insert {
            parent: Option::None,
            index,
            fragment: Box::new(fragment),
        }];
        if editor
            .dispatch(insert, Origin::Local, Recording::Silent)
            .is_err()
        {
            editor.abort_gesture();
            self.phase = Phase::Idle;
            return ToolOutcome::default();
        }
        self.phase = match self.tool {
            Tool::Pencil => Phase::Stroking {
                anchor,
                id: id.clone(),
                points: vec![(0.0, 0.0)],
            },
            _ => Phase::Dragging {
                anchor,
                id: id.clone(),
            },
        };
        // Seed the first preview so the node tracks the pointer that
        // crossed the threshold.
        self.pointer_move(editor, canvas, canvas)
    }

    /// The per-move preview patch for a drag-insert.
    fn drag_preview_batch(
        &self,
        _editor: &Editor,
        id: &Id,
        anchor: [f32; 2],
        canvas: [f32; 2],
    ) -> Vec<Mutation> {
        let set = match self.tool {
            Tool::Line { .. } => {
                let (dx, dy) = (canvas[0] - anchor[0], canvas[1] - anchor[1]);
                PropPatch {
                    position: Some((anchor[0], anchor[1])),
                    rotation: Some(dy.atan2(dx)),
                    size: Some((Some((dx * dx + dy * dy).sqrt().max(1.0)), Option::None)),
                    ..Default::default()
                }
            }
            // M1 gap, stated honestly: TextSpan has no concrete-size
            // patch domain (auto-size is not invertibly representable
            // in `size`), so text drag previews position only and the
            // node stays auto-sized. Drag-to-width is deferred tail.
            Tool::Text => PropPatch {
                position: Some((anchor[0].min(canvas[0]), anchor[1].min(canvas[1]))),
                ..Default::default()
            },
            _ => {
                let (x, y) = (anchor[0].min(canvas[0]), anchor[1].min(canvas[1]));
                let (w, h) = (
                    (canvas[0] - anchor[0]).abs().max(1.0),
                    (canvas[1] - anchor[1]).abs().max(1.0),
                );
                PropPatch {
                    position: Some((x, y)),
                    size: Some((Some(w), Some(h))),
                    ..Default::default()
                }
            }
        };
        vec![Mutation::Patch {
            id: id.clone(),
            set: Box::new(set),
        }]
    }

    /// Click-insert: one recorded batch (`TOOL-3`), default size,
    /// centered on the point. Draw tools insert nothing (`TOOL-7`).
    fn click_insert(&mut self, editor: &mut Editor, point: [f32; 2]) -> ToolOutcome {
        match self.tool {
            Tool::Cursor | Tool::Line { .. } | Tool::Pencil => ToolOutcome::default(),
            Tool::Text => {
                // Insert at the point (auto-sized — no center offset,
                // web parity) inside an open frame; the session commits.
                let id = self.mint(editor);
                let fragment = self.insert_fragment(
                    id.clone(),
                    point,
                    Size {
                        width: 0.0,
                        height: 0.0,
                    },
                );
                editor.begin_gesture();
                let index = editor.children(Option::None).len();
                let insert = vec![Mutation::Insert {
                    parent: Option::None,
                    index,
                    fragment: Box::new(fragment),
                }];
                if editor
                    .dispatch(insert, Origin::Local, Recording::Silent)
                    .is_err()
                {
                    editor.abort_gesture();
                    return ToolOutcome::default();
                }
                self.phase = Phase::TextSession {
                    id: id.clone(),
                    fresh: true,
                };
                ToolOutcome {
                    select: Some(vec![id.clone()]),
                    enter_text_edit: Some(id),
                    ..Default::default()
                }
            }
            Tool::Shape(_) | Tool::Container { .. } => {
                let id = self.mint(editor);
                let origin = [
                    point[0] - CLICK_INSERT_SIZE / 2.0,
                    point[1] - CLICK_INSERT_SIZE / 2.0,
                ];
                let fragment = self.insert_fragment(
                    id.clone(),
                    origin,
                    Size {
                        width: CLICK_INSERT_SIZE,
                        height: CLICK_INSERT_SIZE,
                    },
                );
                let index = editor.children(Option::None).len();
                let batch = vec![Mutation::Insert {
                    parent: Option::None,
                    index,
                    fragment: Box::new(fragment),
                }];
                if editor
                    .dispatch(
                        batch,
                        Origin::Local,
                        Recording::Record {
                            label: Some("insert".to_string()),
                        },
                    )
                    .is_err()
                {
                    return ToolOutcome::default();
                }
                self.revert_after_insert();
                ToolOutcome {
                    committed: true,
                    select: Some(vec![id]),
                    ..Default::default()
                }
            }
        }
    }

    /// A fresh insert fragment for the active tool at `origin`.
    fn insert_fragment(&self, id: Id, origin: [f32; 2], size: Size) -> Fragment {
        let nf = NodeFactory::new();
        let (node, name) = match self.tool {
            Tool::Shape(ShapeKind::Rectangle) => {
                let mut n = nf.create_rectangle_node();
                n.transform = AffineTransform::new(origin[0], origin[1], 0.0);
                n.size = size;
                (Node::Rectangle(n), "Rectangle")
            }
            Tool::Shape(ShapeKind::Ellipse) => {
                let mut n = nf.create_ellipse_node();
                n.transform = AffineTransform::new(origin[0], origin[1], 0.0);
                n.size = size;
                (Node::Ellipse(n), "Ellipse")
            }
            Tool::Shape(ShapeKind::Polygon) => {
                let mut n = nf.create_regular_polygon_node();
                n.transform = AffineTransform::new(origin[0], origin[1], 0.0);
                n.size = size;
                (Node::RegularPolygon(n), "Polygon")
            }
            Tool::Container { tray: false } => {
                let mut n = nf.create_container_node();
                n.position = LayoutPositioningBasis::Cartesian(CGPoint {
                    x: origin[0],
                    y: origin[1],
                });
                n.layout_dimensions.layout_target_width = Some(size.width);
                n.layout_dimensions.layout_target_height = Some(size.height);
                (Node::Container(n), "Container")
            }
            Tool::Container { tray: true } => {
                let mut n = nf.create_tray_node();
                n.position = LayoutPositioningBasis::Cartesian(CGPoint {
                    x: origin[0],
                    y: origin[1],
                });
                n.layout_dimensions.layout_target_width = Some(size.width);
                n.layout_dimensions.layout_target_height = Some(size.height);
                (Node::Tray(n), "Tray")
            }
            Tool::Text => {
                let mut n = nf.create_text_span_node();
                n.transform = AffineTransform::new(origin[0], origin[1], 0.0);
                if size.width > 1.0 {
                    n.width = Some(size.width);
                }
                (Node::TextSpan(n), "Text")
            }
            Tool::Line { arrow } => {
                let mut n = nf.create_line_node();
                n.transform = AffineTransform::new(origin[0], origin[1], 0.0);
                n.size = Size {
                    width: size.width,
                    height: 0.0,
                };
                if arrow {
                    n.marker_end_shape = StrokeMarkerPreset::RightTriangleOpen;
                }
                (Node::Line(n), if arrow { "Arrow" } else { "Line" })
            }
            Tool::Cursor | Tool::Pencil => unreachable!("not an insert-fragment tool"),
        };
        Fragment {
            id,
            name: Some(name.to_string()),
            node,
            children: Vec::new(),
        }
    }

    /// Insert tools revert to cursor after a completed insertion;
    /// pencil stays (`TOOL-8`).
    fn revert_after_insert(&mut self) {
        if !matches!(self.tool, Tool::Pencil) {
            self.tool = Tool::Cursor;
        }
    }

    /// Mint a fresh stable id for a host-driven insert (the vector
    /// mode's pen-from-scratch creation shares the tool machine's id
    /// sequence).
    pub fn mint_id(&mut self, editor: &Editor) -> Id {
        self.mint(editor)
    }

    /// Mint a fresh stable id (`t1`, `t2`, …) unused in the document.
    fn mint(&mut self, editor: &Editor) -> Id {
        loop {
            self.minted += 1;
            let candidate = format!("t{}", self.minted);
            if !editor.document().contains(&candidate) {
                return candidate;
            }
        }
    }
}

/// A vector authoring fragment: a Vector node at `anchor` carrying
/// `network`, in the shared authoring style (`tool.md` — fixed stroke,
/// round caps, no fill). The pencil, the pen (`vector-edit.md`), and
/// conformance fixtures build vectors through this one factory.
pub fn vector_fragment(
    id: Id,
    name: &str,
    anchor: [f32; 2],
    network: grida::vectornetwork::VectorNetwork,
) -> Fragment {
    let node = Node::Vector(grida::node::schema::VectorNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: Option::None,
        effects: LayerEffects::default(),
        transform: AffineTransform::new(anchor[0], anchor[1], 0.0),
        network,
        corner_radius: 0.0,
        fills: Paints::default(),
        strokes: Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            30, 30, 30, 255,
        )))]),
        stroke_width: PENCIL_STROKE_WIDTH,
        stroke_width_profile: Option::None,
        stroke_align: StrokeAlign::Center,
        stroke_cap: StrokeCap::Round,
        stroke_join: StrokeJoin::Round,
        stroke_miter_limit: StrokeMiterLimit::default(),
        stroke_dash_array: Option::None,
        marker_start_shape: StrokeMarkerPreset::default(),
        marker_end_shape: StrokeMarkerPreset::default(),
        layout_child: Option::None,
    });
    Fragment {
        id,
        name: Some(name.to_string()),
        node,
        children: Vec::new(),
    }
}

/// A pencil stroke fragment: a Vector node at `anchor` whose network
/// is the local polyline (`tool.md` Pencil).
pub(crate) fn pencil_fragment(id: Id, anchor: [f32; 2], points: &[(f32, f32)]) -> Fragment {
    vector_fragment(id, "Pencil", anchor, polyline_network(points))
}

/// The adoption batch for a completed container/tray drag-insert
/// (`TOOL-5`): root-level siblings whose bounds are fully contained in
/// the container's rect become its children (document order
/// preserved), re-anchored so world positions do not move.
///
/// M1 restriction (documented in `tool.md`): candidates are the
/// container's root-level siblings with a queryable position and
/// concrete size; auto-sized kinds are skipped.
pub(crate) fn adoption_batch(editor: &Editor, container_id: &Id) -> Vec<Mutation> {
    let Some((cx, cy)) = editor.node_position(container_id) else {
        return Vec::new();
    };
    let Some((cw, ch)) = editor.node_size(container_id) else {
        return Vec::new();
    };

    let adopted: Vec<(Id, (f32, f32))> = editor
        .children(Option::None)
        .into_iter()
        .filter(|id| id != container_id)
        .filter_map(|id| {
            let (x, y) = editor.node_position(&id)?;
            let (w, h) = editor.node_size(&id)?;
            let inside = x >= cx && y >= cy && x + w <= cx + cw && y + h <= cy + ch;
            inside.then_some((id, (x, y)))
        })
        .collect();
    if adopted.is_empty() {
        return Vec::new();
    }

    let mut batch = vec![Mutation::Move {
        ids: adopted.iter().map(|(id, _)| id.clone()).collect(),
        parent: Some(container_id.clone()),
        index: 0,
    }];
    for (id, (x, y)) in adopted {
        batch.push(Mutation::Patch {
            id,
            set: Box::new(PropPatch {
                position: Some((x - cx, y - cy)),
                ..Default::default()
            }),
        });
    }
    batch
}
