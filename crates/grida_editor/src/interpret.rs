//! Intent interpretation — the host side of the HUD seam
//! (`crates/grida_editor/docs/hud.md`, `HUD-7`).
//!
//! The HUD emits intent, and intent only; **this module is the one
//! place an intent becomes document meaning**. It maps the phased
//! intent stream onto the editor's gesture framing (first preview
//! opens the frame and captures baselines, previews apply silent
//! patches, commit closes one history entry, cancel aborts —
//! `HISB-2/4`, `SURF-2`), and it owns every document-semantics
//! decision the HUD is forbidden to know:
//!
//! - **Rotation** — the document has no first-class rotation; a
//!   `rotate` intent's angle is recomposed into the rotation patch
//!   domain with the position compensated so the visual pivot holds,
//!   and node kinds outside the domain are *refused* here (skipped),
//!   with the HUD needing no knowledge of the refusal.
//! - **Resize** — the union's new rect maps each member through the
//!   linear union-to-union transform; rotated members are refused in
//!   v1 (local-frame resize is named deferred in the RFC).
//! - **Marquee** — the rect resolves to ids via the host scene
//!   ([`InterpretScene`]); additive unions against the selection
//!   captured when the marquee began.
//! - **Translate structure** (`docs/wg/canvas/translate.md`) — the
//!   clone modifier's live edges (`TRL-1..5`: origins rest, deep
//!   clones take the gesture; the OFF edge rolls the frame back to
//!   its checkpoint) and hierarchy change (`TRL-6..9`: the resolved
//!   drop target re-parents the moving cohort live, world position
//!   preserved through the parent-frame re-derivation); the armed
//!   `(origin, clone)` pairs feed the repeat-offset duplicate
//!   ([`Interpreter::duplicate`]).
//! - **Snap** — the snap family (`docs/wg/canvas/snap.md`, `SNAP-1`)
//!   corrects gestures between intent and mutation: a translate's
//!   delta through [`crate::snap::translate`] (geometry + space +
//!   pixel grid), a resize's moving edges through
//!   [`crate::snap::resize`] + the moving-corner quantize (`SNAP-10`,
//!   `SNAP-4`). The session freezes at gesture open (`SNAP-7`) and
//!   the fired hits feed the guide chrome
//!   ([`Interpreter::snap_guides`]). The toggles live on
//!   [`Interpreter::snap`]; keyboard nudges skip the content snaps
//!   entirely ([`Interpreter::nudge`], `SNAP-6`).
//!
//! Scene reads happen *before* the mutable editor borrow: the host
//! gathers [`SceneFacts`] per intent ([`facts_for`]), then calls
//! [`Interpreter::apply`]. Replaying the same intent stream with the
//! same facts against the same document produces the same mutations.

use std::collections::{HashMap, HashSet};

use math2::rect::Rectangle;

use crate::document::{Id, Mutation, PropPatch};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::hud::{Intent, Phase, ResizeDirection, SelectMode, SelectionShape};
use crate::snap;

/// The scene queries interpretation needs — resolved by the host
/// *outside* the editor borrow (see [`facts_for`]).
pub trait InterpretScene {
    /// Nodes intersecting a canvas-space rect (marquee semantics).
    fn nodes_in_rect(&self, rect: &Rectangle) -> Vec<Id>;
    /// A node's world-space AABB.
    fn world_bounds(&self, id: &Id) -> Option<Rectangle>;
    /// The snap neighborhood for moving content (snap.md "The
    /// session"): the parent's bounds and every sibling's bounds,
    /// excluding the moving ids themselves. Default empty — a scene
    /// that cannot answer gets no geometry snapping.
    fn snap_anchors(&self, moving: &[Id]) -> Vec<Rectangle> {
        let _ = moving;
        Vec::new()
    }
    /// The guide-drag snap targets (ruler.md `RUL-6`): the scene's
    /// top-level content bounds (web precedent — a dragged guide
    /// aligns to root-level nodes, not the whole tree). Default
    /// empty.
    fn guide_anchors(&self) -> Vec<Rectangle> {
        Vec::new()
    }
    /// Every node under a canvas-space point, topmost first — the
    /// drop-target candidate chain (translate.md "Drop-target
    /// resolution"). Default empty: a scene that cannot answer gets no
    /// hierarchy change.
    fn hit_chain(&self, canvas_point: [f32; 2]) -> Vec<Id> {
        let _ = canvas_point;
        Vec::new()
    }
    /// A node's parent id (`None` = scene-root level or unknown) —
    /// resolved here so [`facts_for`] can fetch the moving ids' parent
    /// frames before the editor borrow.
    fn parent_of(&self, id: &Id) -> Option<Id> {
        let _ = id;
        None
    }
    /// The world origin of the node's **child coordinate frame**, when
    /// that frame is a pure translation; `None` refuses the node as a
    /// re-parenting frame (a rotated/scaled container is not a v1
    /// adoption target — local re-derivation under a non-translation
    /// frame is deferred with local-frame resize). Default `None`.
    fn frame_origin(&self, id: &Id) -> Option<[f32; 2]> {
        let _ = id;
        None
    }
}

/// Pre-resolved host reads for one intent: scene facts gathered by
/// [`facts_for`], plus the per-event host state the snap stages need
/// (`zoom`, the disable modifier) — set by the caller after
/// gathering.
#[derive(Debug)]
pub struct SceneFacts {
    pub marquee_hits: Option<Vec<Id>>,
    pub world_bounds: HashMap<Id, Rectangle>,
    /// The snap neighborhood (snap.md), resolved per translate
    /// intent; the interpreter reads it once, at gesture open
    /// (`SNAP-7`).
    pub snap_anchors: Vec<Rectangle>,
    /// The scene's guides (ruler.md) — empty until guides land.
    pub snap_guides: Vec<snap::Guide>,
    /// The pointer's hit chain, topmost first — the drop-target
    /// candidates for a translate preview (translate.md). Chain
    /// nodes' world bounds join `world_bounds` (the overlay outline).
    pub pointer_hits: Vec<Id>,
    /// Pure-translation child-frame world origins: the hit-chain
    /// nodes and the moving ids' current parents. A chain node absent
    /// here is a refused re-parenting frame; the scene root's frame
    /// is implicit `(0, 0)`.
    pub frame_origins: HashMap<Id, [f32; 2]>,
    /// Current zoom (logical screen px per canvas unit): the
    /// screen-space snap threshold divides by it (`SNAP-9`).
    pub zoom: f32,
    /// The golden "disable snapping" modifier, live (`SNAP-3`).
    pub snap_disabled: bool,
}

impl Default for SceneFacts {
    fn default() -> Self {
        Self {
            marquee_hits: None,
            world_bounds: HashMap::new(),
            snap_anchors: Vec::new(),
            snap_guides: Vec::new(),
            pointer_hits: Vec::new(),
            frame_origins: HashMap::new(),
            zoom: 1.0,
            snap_disabled: false,
        }
    }
}

/// Resolve the scene facts one intent needs. Cheap for everything but
/// a marquee preview (one rect query).
pub fn facts_for(intent: &Intent, scene: &impl InterpretScene) -> SceneFacts {
    let mut facts = SceneFacts::default();
    match intent {
        Intent::Marquee { rect, .. } => {
            facts.marquee_hits = Some(scene.nodes_in_rect(rect));
        }
        Intent::Translate { ids, pointer, .. } => {
            for id in ids {
                if let Some(b) = scene.world_bounds(id) {
                    facts.world_bounds.insert(id.clone(), b);
                }
                // The current parent's frame, for the gesture-open
                // baselines (translate.md hierarchy change); root is
                // implicit (0,0).
                if let Some(p) = scene.parent_of(id)
                    && let Some(o) = scene.frame_origin(&p)
                {
                    facts.frame_origins.insert(p, o);
                }
            }
            facts.snap_anchors = scene.snap_anchors(ids);
            // The drop-target probe: the chain under the pointer, each
            // node's frame (adoption math) and bounds (the overlay).
            facts.pointer_hits = scene.hit_chain(*pointer);
            for id in &facts.pointer_hits {
                if let Some(o) = scene.frame_origin(id) {
                    facts.frame_origins.insert(id.clone(), o);
                }
                if let Some(b) = scene.world_bounds(id) {
                    facts.world_bounds.insert(id.clone(), b);
                }
            }
        }
        Intent::Resize { ids, .. } => {
            for id in ids {
                if let Some(b) = scene.world_bounds(id) {
                    facts.world_bounds.insert(id.clone(), b);
                }
            }
            facts.snap_anchors = scene.snap_anchors(ids);
        }
        Intent::Rotate { ids, .. } => {
            for id in ids {
                if let Some(b) = scene.world_bounds(id) {
                    facts.world_bounds.insert(id.clone(), b);
                }
            }
        }
        Intent::Guide { .. } => {
            facts.snap_anchors = scene.guide_anchors();
        }
        _ => {}
    }
    facts
}

/// What one applied intent asks the host shell to do beyond the
/// document (the ledger and the selection mirror cover everything
/// else).
#[derive(Debug, Default)]
pub struct Outcome {
    /// A double-click asked to edit this node; the host decides what
    /// "edit" means for its kind.
    pub enter_content_edit: Option<Id>,
}

// ── Baselines ──────────────────────────────────────────────────────

/// One translate subject's gesture state. `pos` is the local baseline
/// against the *current* parent frame — re-derived on every re-parent
/// so the world position is continuous (translate.md, `TRL-6`).
struct TranslateMember {
    pos: (f32, f32),
    /// The current parent frame's world origin (root = `(0,0)`).
    frame: [f32; 2],
    /// The parent at gesture start — the honest-overlay reference
    /// (`TRL-8`: a commit "would re-parent" relative to this).
    start_parent: Option<Id>,
    /// World bounds at gesture start (snap agents; clone anchors).
    world: Option<Rectangle>,
    /// Held in place structurally: the parent is a derived one (group
    /// / boolean — `TRL-7`) or its frame could not be resolved.
    closed: bool,
    /// Trays only enter the scene root or another tray (`TRL-7`).
    tray: bool,
}

struct ResizeBaseline {
    pos: (f32, f32),
    size: (f32, f32),
    world: Rectangle,
}

struct RotateBaseline {
    pos: (f32, f32),
    /// `None` = the kind has no size domain; rotation applies without
    /// pivot compensation.
    size: Option<(f32, f32)>,
    rotation: f32,
    world_center: [f32; 2],
}

/// A translate gesture's snap state (boxed in [`Active`] — it dwarfs
/// the other gestures' state).
struct TranslateSnap {
    /// The frozen session (`SNAP-7`).
    session: snap::Session,
    /// The clone cohort's variant (translate.md: "the clones are the
    /// snap agents and the resting originals become ordinary snap
    /// anchors") — frozen eagerly at gesture open from the same
    /// facts, so a modifier flip retargets without re-reading the
    /// scene (`SNAP-7` discipline).
    clone_session: snap::Session,
    /// The last preview's geometry hit — the chrome source
    /// (`SNAP-8`); dies with the gesture.
    snapped: Option<snap::GeometrySnap>,
}

/// The live clone cohort while the clone modifier is held
/// (translate.md "Clone on translate").
struct CloneCohort {
    /// `(origin, clone root)` pairs, in member order — the commit
    /// arms repeat-offset duplication from these (`TRL-4`).
    pairs: Vec<(Id, Id)>,
    /// The gesture checkpoint taken before the clones were inserted:
    /// the OFF edge rolls the frame back here, so abandoned clones
    /// leave no trace in the committed entry (`TRL-5`).
    mark: usize,
    /// The clones' gesture state (mirrors the origins' baselines).
    members: Vec<(Id, TranslateMember)>,
}

/// A resize gesture's snap state (boxed in [`Active`], like
/// [`TranslateSnap`]).
struct ResizeSnapState {
    /// The frozen session (`SNAP-7`).
    session: snap::Session,
    /// The last preview's moving-edge hit — the rule chrome's source
    /// (`SNAP-8`/`SNAP-10`); dies with the gesture.
    snapped: Option<snap::ResizeSnap>,
}

enum Active {
    Translate {
        members: Vec<(Id, TranslateMember)>,
        /// `None` when the gesture opened with no world bounds to
        /// snap.
        snap: Option<Box<TranslateSnap>>,
        /// The live clone cohort (`Some` while the modifier is held).
        clone: Option<CloneCohort>,
        /// The drop-target overlay's truth (`TRL-8`): the prospective
        /// parent and its world bounds when a commit at this instant
        /// would leave at least one member re-parented (relative to
        /// its gesture-start parent). The scene root, having no
        /// bounds, draws none.
        drop: Option<(Id, Rectangle)>,
    },
    Resize {
        baselines: Vec<(Id, ResizeBaseline)>,
        initial_union: Rectangle,
        snap: Option<Box<ResizeSnapState>>,
    },
    Rotate {
        baselines: Vec<(Id, RotateBaseline)>,
        pivot: [f32; 2],
    },
    Marquee {
        before: Vec<Id>,
    },
    /// A guide gesture (ruler.md `RUL-4..7`): the guide's index in
    /// the document list, whether this gesture created it (a create
    /// that returns to the strip must net to nothing), and the
    /// frozen snap-anchor offsets on its axis (`SNAP-7` discipline).
    Guide {
        index: usize,
        created: bool,
        anchors: Vec<f32>,
    },
}

/// The stateful interpreter: holds the open gesture's baselines
/// between previews. One instance per HUD.
#[derive(Default)]
pub struct Interpreter {
    active: Option<Active>,
    /// The snap toggles (snap.md, [`snap::Config`]): geometry snap
    /// and pixel-grid quantization, independently switchable — the
    /// host's on/off surface. Both default on.
    pub snap: snap::Config,
    /// Repeat-offset arming (translate.md `TRL-4`): the `(origin,
    /// clone)` pairs from the last cloned commit or duplicate. The
    /// next duplicate *measures* their current offset — however the
    /// clones were moved since — and repeats it.
    armed: Option<Vec<(Id, Id)>>,
}

fn rot(v: (f32, f32), angle: f32) -> (f32, f32) {
    let (s, c) = angle.sin_cos();
    (v.0 * c - v.1 * s, v.0 * s + v.1 * c)
}

/// Drop-target resolution (translate.md): the top-most valid hit
/// under the pointer — in z-order — among nodes that can adopt
/// children. `None` = the scene root (the fallback candidate).
/// Refused along the chain: kinds that are not spatial parents
/// (groups, booleans, leaves), nodes whose child frame the facts
/// could not resolve (rotated/scaled frames — deferred with
/// local-frame resize), and anything inside the excluded subtrees.
fn resolve_drop_target(
    doc: &crate::document::WorkingCopy,
    facts: &SceneFacts,
    excluded: &[Id],
) -> Option<Id> {
    'chain: for k in &facts.pointer_hits {
        if doc.node_adopts(k) != Some(true) {
            continue;
        }
        if !facts.frame_origins.contains_key(k) {
            continue;
        }
        // The exclusion is subtree-deep: walk k's ancestor chain.
        let mut cur = Some(k.clone());
        while let Some(c) = cur {
            if excluded.contains(&c) {
                continue 'chain;
            }
            cur = doc.node_parent(&c).flatten();
        }
        return Some(k.clone());
    }
    None
}

/// Whether `id` sits inside another dragged member's subtree — such a
/// member rides its ancestor through hierarchy changes; re-parenting
/// it individually would flatten the dragged structure.
fn is_nested(doc: &crate::document::WorkingCopy, id: &Id, roots: &[&Id]) -> bool {
    let mut cur = doc.node_parent(id).flatten();
    while let Some(c) = cur {
        if roots.iter().any(|r| **r == c) {
            return true;
        }
        cur = doc.node_parent(&c).flatten();
    }
    false
}

/// The moving edge values of a resize target, from the dragged handle
/// (snap.md "Moving edges"): the E family moves the right edge, the W
/// family the left, N the top, S the bottom; an axis the handle does
/// not move is `None` and is never snapped or quantized.
fn moving_edges(dir: ResizeDirection, target: &Rectangle) -> snap::MovingEdges {
    use ResizeDirection::*;
    let x = match dir {
        E | NE | SE => Some(target.x + target.width),
        W | NW | SW => Some(target.x),
        N | S => None,
    };
    let y = match dir {
        S | SE | SW => Some(target.y + target.height),
        N | NE | NW => Some(target.y),
        E | W => None,
    };
    (x, y)
}

/// Apply a signed correction to a resize target's moving edges,
/// preserving the gesture's anchor (`SNAP-10`): with the default
/// opposite-edge anchor only the moving edge shifts (the size absorbs
/// the correction); when the opposite edge has left the initial union
/// — center-resize — the correction applies symmetrically, so the
/// center holds and the moving edge still lands exactly. Sizes clamp
/// at 1, mirroring the HUD's resize floor.
fn adjust_moving_edges(
    target: &mut Rectangle,
    initial: &Rectangle,
    dir: ResizeDirection,
    dx: f32,
    dy: f32,
) {
    use ResizeDirection::*;
    const EPS: f32 = 1e-3;
    if dx != 0.0 {
        match dir {
            E | NE | SE => {
                if (target.x - initial.x).abs() > EPS {
                    target.x -= dx;
                    target.width += 2.0 * dx;
                } else {
                    target.width += dx;
                }
            }
            W | NW | SW => {
                let fixed_right = initial.x + initial.width;
                let centered = (target.x + target.width - fixed_right).abs() > EPS;
                target.x += dx;
                target.width -= if centered { 2.0 * dx } else { dx };
            }
            N | S => {}
        }
        target.width = target.width.max(1.0);
    }
    if dy != 0.0 {
        match dir {
            S | SE | SW => {
                if (target.y - initial.y).abs() > EPS {
                    target.y -= dy;
                    target.height += 2.0 * dy;
                } else {
                    target.height += dy;
                }
            }
            N | NE | NW => {
                let fixed_bottom = initial.y + initial.height;
                let centered = (target.y + target.height - fixed_bottom).abs() > EPS;
                target.y += dy;
                target.height -= if centered { 2.0 * dy } else { dy };
            }
            E | W => {}
        }
        target.height = target.height.max(1.0);
    }
}

impl Interpreter {
    pub fn new() -> Self {
        Self::default()
    }

    /// True while a phased content gesture holds an open editor
    /// frame.
    pub fn gesture_open(&self) -> bool {
        matches!(
            self.active,
            Some(Active::Translate { .. })
                | Some(Active::Resize { .. })
                | Some(Active::Rotate { .. })
                | Some(Active::Guide { .. })
        )
    }

    /// Apply one intent. Selection intents land immediately; phased
    /// intents ride the editor's gesture frame; `Cancel` aborts it.
    pub fn apply(&mut self, editor: &mut Editor, intent: &Intent, facts: &SceneFacts) -> Outcome {
        let mut outcome = Outcome::default();
        match intent {
            Intent::Select { ids, mode } => {
                let new = match mode {
                    SelectMode::Replace => ids.clone(),
                    SelectMode::Toggle => {
                        let mut sel = editor.selection().to_vec();
                        for id in ids {
                            if let Some(i) = sel.iter().position(|s| s == id) {
                                sel.remove(i);
                            } else {
                                sel.push(id.clone());
                            }
                        }
                        sel
                    }
                };
                editor.set_selection(new);
            }
            Intent::DeselectAll => editor.set_selection(Vec::new()),
            Intent::Marquee {
                additive, phase, ..
            } => {
                self.abort_mismatched(editor, |a| matches!(a, Active::Marquee { .. }));
                if self.active.is_none() {
                    self.active = Some(Active::Marquee {
                        before: editor.selection().to_vec(),
                    });
                }
                let hits = facts.marquee_hits.clone().unwrap_or_default();
                let new = if *additive {
                    let Some(Active::Marquee { before }) = &self.active else {
                        unreachable!("marquee active set above");
                    };
                    let mut sel = before.clone();
                    for id in hits {
                        if !sel.contains(&id) {
                            sel.push(id);
                        }
                    }
                    sel
                } else {
                    hits
                };
                editor.set_selection(new);
                if matches!(phase, Phase::Commit) {
                    self.active = None;
                }
            }
            Intent::Translate {
                ids,
                dx,
                dy,
                axis_lock,
                pointer: _,
                clone,
                phase,
            } => {
                self.abort_mismatched(editor, |a| matches!(a, Active::Translate { .. }));
                if self.active.is_none() {
                    editor.begin_gesture();
                    let quantized = self.snap.pixel_grid;
                    let members: Vec<(Id, TranslateMember)> = ids
                        .iter()
                        .filter_map(|id| {
                            // Refusal (like resize/rotate): a member with
                            // no position domain is skipped, not moved —
                            // the surviving members still translate. Every
                            // authorable node kind has a position, so this
                            // is unreachable for real selections; it is a
                            // guard, not a silent partial-move.
                            let (mut x, mut y) = editor.node_position(id)?;
                            let world = facts.world_bounds.get(id).copied();
                            // Pixel grid (`SNAP-4`): each member's
                            // baseline lattice-corrects through its
                            // world frame at gesture open (a local
                            // translation delta equals the world one,
                            // so the correction transfers) — the
                            // moved content lands on the lattice as a
                            // whole, matching the web pipeline.
                            if quantized && let Some(w) = world {
                                x += w.x.round() - w.x;
                                y += w.y.round() - w.y;
                            }
                            let parent = editor.document().node_parent(id).flatten();
                            // The parent frame's world origin: root is
                            // (0,0); a parent whose frame the facts
                            // could not resolve closes the member
                            // (it still translates — a local delta
                            // works under any static frame — but
                            // never re-parents).
                            let (frame, resolvable) = match &parent {
                                None => ([0.0, 0.0], true),
                                Some(p) => match facts.frame_origins.get(p) {
                                    Some(o) => (*o, true),
                                    None => ([0.0, 0.0], false),
                                },
                            };
                            // Closed parents hold their children
                            // (`TRL-7`): a derived parent (group /
                            // boolean) is dissolved deliberately,
                            // never by dragging its children away.
                            let held = parent
                                .as_ref()
                                .is_some_and(|p| editor.document().node_adopts(p) == Some(false));
                            Some((
                                id.clone(),
                                TranslateMember {
                                    pos: (x, y),
                                    frame,
                                    start_parent: parent,
                                    world,
                                    closed: held || !resolvable,
                                    tray: editor.document().node_is_tray(id).unwrap_or(false),
                                },
                            ))
                        })
                        .collect();
                    let worlds: Vec<Rectangle> =
                        members.iter().filter_map(|(_, m)| m.world).collect();
                    // The session freeze (`SNAP-7`): anchors read from
                    // this event's facts, once — later previews carry
                    // fresh facts, and they are deliberately ignored.
                    // The clone variant joins the resting origins as
                    // anchors (step-and-repeat: a clone snaps against
                    // its own origin), frozen from the same facts.
                    let snap = (!worlds.is_empty()).then(|| {
                        let mut clone_anchors = facts.snap_anchors.clone();
                        clone_anchors.extend(worlds.iter().copied());
                        Box::new(TranslateSnap {
                            session: snap::Session::freeze(
                                &worlds,
                                facts.snap_anchors.clone(),
                                facts.snap_guides.clone(),
                                quantized,
                            ),
                            clone_session: snap::Session::freeze(
                                &worlds,
                                clone_anchors,
                                facts.snap_guides.clone(),
                                quantized,
                            ),
                            snapped: None,
                        })
                    });
                    self.active = Some(Active::Translate {
                        members,
                        snap,
                        clone: None,
                        drop: None,
                    });
                }
                // The clone modifier's live edges (`TRL-1`): the flip
                // acts on the modifier edge itself — the HUD re-emits
                // a preview on `ModifiersChanged`, so no pointer
                // movement is required.
                let is_cloning =
                    matches!(&self.active, Some(Active::Translate { clone: Some(_), .. }));
                if *clone && !is_cloning {
                    self.clone_on(editor);
                } else if !*clone && is_cloning {
                    self.clone_off(editor);
                }
                let Some(Active::Translate {
                    members,
                    snap,
                    clone,
                    drop,
                }) = &mut self.active
                else {
                    unreachable!("translate active set above");
                };
                // A locked axis is `None`: geometry snap never touches
                // it (snap.md's pipeline order — the lock precedes the
                // snap stages).
                let movement: math2::snap::axis::Movement = match axis_lock {
                    Some(math2::vector2::Axis::X) => (Some(*dx), None),
                    Some(math2::vector2::Axis::Y) => (None, Some(*dy)),
                    None => (Some(*dx), Some(*dy)),
                };
                let cloning = clone.is_some();
                let delta = match snap.as_deref_mut() {
                    Some(ts) => {
                        // Snapping retargets with the selection: the
                        // clone cohort snaps through the session that
                        // carries the origins as anchors.
                        let session = if cloning {
                            &ts.clone_session
                        } else {
                            &ts.session
                        };
                        let r = snap::translate(
                            session,
                            &self.snap,
                            facts.snap_disabled,
                            movement,
                            facts.zoom,
                        );
                        ts.snapped = r.geometry;
                        r.delta
                    }
                    None => [*dx, *dy],
                };
                // ── Hierarchy change (translate.md): the tree follows
                // the pointer — resolve the drop target and re-parent
                // the moving cohort live, before the position patches.
                let active_members = match clone.as_mut() {
                    Some(cohort) => &mut cohort.members,
                    None => members,
                };
                // Exclusions: the dragged nodes, any live clones, and
                // (via the ancestor walk in the resolver) all their
                // descendants — a subtree can never adopt itself.
                let mut excluded: Vec<Id> = ids.clone();
                if cloning {
                    excluded.extend(active_members.iter().map(|(id, _)| id.clone()));
                }
                let target = resolve_drop_target(editor.document(), facts, &excluded);
                let mut movers: Vec<Id> = Vec::new();
                let mut would_reparent = false;
                {
                    let doc = editor.document();
                    // Members inside another member's subtree ride
                    // their ancestor; re-parenting them individually
                    // would flatten the dragged structure.
                    let roots: Vec<&Id> = active_members.iter().map(|(id, _)| id).collect();
                    for (id, m) in active_members.iter() {
                        if m.closed || is_nested(doc, id, &roots) {
                            continue;
                        }
                        // A tray may only enter the scene root or
                        // another tray (`TRL-7`).
                        if m.tray
                            && let Some(t) = &target
                            && doc.node_is_tray(t) != Some(true)
                        {
                            continue;
                        }
                        if m.start_parent != target {
                            would_reparent = true;
                        }
                        if doc.node_parent(id).flatten() != target {
                            movers.push(id.clone());
                        }
                    }
                }
                if !movers.is_empty() {
                    // The mover enters at the top of the new parent's
                    // z-order (last in document order); `Move`'s index
                    // is post-removal (`DOC-5`), and no mover is
                    // already under the target.
                    let index = editor.children(target.as_ref()).len();
                    if editor
                        .dispatch(
                            vec![Mutation::Move {
                                ids: movers.clone(),
                                parent: target.clone(),
                                index,
                            }],
                            Origin::Local,
                            Recording::Silent,
                        )
                        .is_ok()
                    {
                        // World position is preserved (`TRL-6`): the
                        // local baseline re-derives against the new
                        // parent's frame.
                        let new_frame = target
                            .as_ref()
                            .and_then(|t| facts.frame_origins.get(t))
                            .copied()
                            .unwrap_or([0.0, 0.0]);
                        for (id, m) in active_members.iter_mut() {
                            if movers.contains(id) {
                                m.pos.0 += m.frame[0] - new_frame[0];
                                m.pos.1 += m.frame[1] - new_frame[1];
                                m.frame = new_frame;
                            }
                        }
                    }
                }
                // The overlay tells the truth (`TRL-8`): highlight the
                // prospective parent exactly while a commit now would
                // leave a member re-parented relative to its
                // gesture-start parent. The scene root draws none.
                *drop = if would_reparent {
                    target
                        .as_ref()
                        .and_then(|t| facts.world_bounds.get(t).map(|b| (t.clone(), *b)))
                } else {
                    None
                };
                let batch: Vec<Mutation> = active_members
                    .iter()
                    .map(|(id, m)| Mutation::Patch {
                        id: id.clone(),
                        set: PropPatch {
                            position: Some((m.pos.0 + delta[0], m.pos.1 + delta[1])),
                            ..Default::default()
                        },
                    })
                    .collect();
                let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                if matches!(phase, Phase::Commit) {
                    // A cloned commit arms repeat-offset duplication
                    // (`TRL-4`) — the pairs are kept, the offset is
                    // measured at the next duplicate.
                    if let Some(cohort) = clone {
                        self.armed = Some(cohort.pairs.clone());
                    }
                    editor.commit_gesture(Some("translate".to_string()));
                    self.active = None;
                }
            }
            Intent::Resize {
                ids,
                anchor,
                shape,
                phase,
            } => {
                self.abort_mismatched(editor, |a| matches!(a, Active::Resize { .. }));
                if self.active.is_none() {
                    editor.begin_gesture();
                    // Refusals: members without a size domain or with a
                    // rotation the linear union map cannot express are
                    // skipped — the HUD needs no knowledge of this.
                    let baselines: Vec<(Id, ResizeBaseline)> = ids
                        .iter()
                        .filter_map(|id| {
                            if editor.node_rotation(id).unwrap_or(0.0) != 0.0 {
                                return None;
                            }
                            let pos = editor.node_position(id)?;
                            let size = editor.node_size(id)?;
                            let world = *facts.world_bounds.get(id)?;
                            Some((id.clone(), ResizeBaseline { pos, size, world }))
                        })
                        .collect();
                    let worlds: Vec<Rectangle> = baselines.iter().map(|(_, b)| b.world).collect();
                    let initial_union = if worlds.is_empty() {
                        Rectangle::from_xywh(0.0, 0.0, 1.0, 1.0)
                    } else {
                        math2::rect::union(&worlds)
                    };
                    // The session freeze (`SNAP-7`), same as translate's.
                    let snap = (!worlds.is_empty()).then(|| {
                        Box::new(ResizeSnapState {
                            session: snap::Session::freeze(
                                &worlds,
                                facts.snap_anchors.clone(),
                                facts.snap_guides.clone(),
                                self.snap.pixel_grid,
                            ),
                            snapped: None,
                        })
                    });
                    self.active = Some(Active::Resize {
                        baselines,
                        initial_union,
                        snap,
                    });
                }
                let Some(Active::Resize {
                    baselines,
                    initial_union,
                    snap,
                }) = &mut self.active
                else {
                    unreachable!("resize active set above");
                };
                let mut target = match shape {
                    SelectionShape::Rect(r) => *r,
                    // v1 HUD never emits a transformed resize shape.
                    SelectionShape::Transformed { .. } => initial_union.to_owned(),
                };
                // Snap the moving edges (`SNAP-10`), then quantize the
                // moving corner (`SNAP-4`) — the gesture's anchor holds
                // exactly through both stages.
                if let Some(state) = snap.as_deref_mut() {
                    let snapped = snap::resize(
                        &state.session,
                        &self.snap,
                        facts.snap_disabled,
                        moving_edges(*anchor, &target),
                        facts.zoom,
                    );
                    if let Some(rs) = &snapped {
                        adjust_moving_edges(&mut target, initial_union, *anchor, rs.dx, rs.dy);
                    }
                    state.snapped = snapped;
                }
                if self.snap.pixel_grid {
                    let (ex, ey) = moving_edges(*anchor, &target);
                    let dx = ex.map_or(0.0, |e| e.round() - e);
                    let dy = ey.map_or(0.0, |e| e.round() - e);
                    if dx != 0.0 || dy != 0.0 {
                        adjust_moving_edges(&mut target, initial_union, *anchor, dx, dy);
                    }
                }
                let sx = if initial_union.width > 0.0 {
                    target.width / initial_union.width
                } else {
                    1.0
                };
                let sy = if initial_union.height > 0.0 {
                    target.height / initial_union.height
                } else {
                    1.0
                };
                let batch: Vec<Mutation> = baselines
                    .iter()
                    .map(|(id, b)| {
                        // The new world x/y is scaled about the union;
                        // it is folded back into the member's *local*
                        // `pos` as a world delta (`new_world - world`).
                        // PRECONDITION: the member's parent frame is a
                        // pure translation, so a world delta equals the
                        // local one — the same static-frame assumption
                        // translate makes for its local delta. A member
                        // under a rotated/scaled parent would be mapped
                        // incorrectly; the v1 HUD does not drive such
                        // resizes, and the facts carry no parent
                        // transform to refuse them here. Documented, not
                        // silently assumed.
                        let new_world_x = target.x + (b.world.x - initial_union.x) * sx;
                        let new_world_y = target.y + (b.world.y - initial_union.y) * sy;
                        Mutation::Patch {
                            id: id.clone(),
                            set: PropPatch {
                                position: Some((
                                    b.pos.0 + (new_world_x - b.world.x),
                                    b.pos.1 + (new_world_y - b.world.y),
                                )),
                                size: Some((
                                    Some((b.size.0 * sx).max(1.0)),
                                    Some((b.size.1 * sy).max(1.0)),
                                )),
                                ..Default::default()
                            },
                        }
                    })
                    .collect();
                let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                if matches!(phase, Phase::Commit) {
                    editor.commit_gesture(Some("resize".to_string()));
                    self.active = None;
                }
            }
            Intent::Rotate { ids, angle, phase } => {
                self.abort_mismatched(editor, |a| matches!(a, Active::Rotate { .. }));
                if self.active.is_none() {
                    editor.begin_gesture();
                    // Refusal is here, once: kinds outside the rotation
                    // patch domain (`node_rotation` = None) are skipped.
                    let baselines: Vec<(Id, RotateBaseline)> = ids
                        .iter()
                        .filter_map(|id| {
                            let rotation = editor.node_rotation(id)?;
                            let pos = editor.node_position(id)?;
                            let world = facts.world_bounds.get(id)?;
                            Some((
                                id.clone(),
                                RotateBaseline {
                                    pos,
                                    size: editor.node_size(id),
                                    rotation,
                                    world_center: world.center(),
                                },
                            ))
                        })
                        .collect();
                    let centers: Vec<Rectangle> = baselines
                        .iter()
                        .filter_map(|(id, _)| facts.world_bounds.get(id).copied())
                        .collect();
                    let pivot = if centers.is_empty() {
                        [0.0, 0.0]
                    } else {
                        math2::rect::union(&centers).center()
                    };
                    self.active = Some(Active::Rotate { baselines, pivot });
                }
                let Some(Active::Rotate { baselines, pivot }) = &self.active else {
                    unreachable!("rotate active set above");
                };
                let batch: Vec<Mutation> = baselines
                    .iter()
                    .map(|(id, b)| {
                        let theta_new = b.rotation + angle;
                        // Orbit the node's center around the pivot…
                        let rel = (b.world_center[0] - pivot[0], b.world_center[1] - pivot[1]);
                        let orbited = rot(rel, *angle);
                        let dc = (
                            pivot[0] + orbited.0 - b.world_center[0],
                            pivot[1] + orbited.1 - b.world_center[1],
                        );
                        // …and compensate the origin so the node spins
                        // about its own center, not its top-left: the
                        // document's rotation domain pivots at the
                        // transform origin.
                        let position = match b.size {
                            Some((w, h)) => {
                                let half = (w * 0.5, h * 0.5);
                                let before = rot(half, b.rotation);
                                let after = rot(half, theta_new);
                                (
                                    b.pos.0 + dc.0 + before.0 - after.0,
                                    b.pos.1 + dc.1 + before.1 - after.1,
                                )
                            }
                            None => (b.pos.0 + dc.0, b.pos.1 + dc.1),
                        };
                        Mutation::Patch {
                            id: id.clone(),
                            set: PropPatch {
                                position: Some(position),
                                rotation: Some(theta_new),
                                ..Default::default()
                            },
                        }
                    })
                    .collect();
                let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                if matches!(phase, Phase::Commit) {
                    editor.commit_gesture(Some("rotate".to_string()));
                    self.active = None;
                }
            }
            Intent::Guide {
                axis,
                index,
                offset,
                on_strip,
                phase,
            } => {
                self.abort_mismatched(editor, |a| matches!(a, Active::Guide { .. }));
                if self.active.is_none() {
                    editor.begin_gesture();
                    // The frozen anchors (`SNAP-7` discipline): the
                    // scene's top-level bounds, reduced to this
                    // axis's offsets, read from this event's facts
                    // once.
                    let anchors = snap::guide_anchor_offsets(*axis, &facts.snap_anchors);
                    let (idx, created) = match index {
                        Some(i) => (*i, false),
                        None => {
                            // A create drag: the guide materializes
                            // in the document now, at the pointer's
                            // corrected position (RUL-5/RUL-6), as a
                            // silent in-gesture insert.
                            let i = editor.guides().len();
                            let corrected = snap::guide_offset(
                                *offset,
                                &anchors,
                                &self.snap,
                                facts.snap_disabled,
                                facts.zoom,
                            );
                            let _ = editor.dispatch(
                                vec![Mutation::GuideInsert {
                                    index: i,
                                    guide: crate::document::Guide {
                                        axis: *axis,
                                        offset: corrected,
                                    },
                                }],
                                Origin::Local,
                                Recording::Silent,
                            );
                            (i, true)
                        }
                    };
                    self.active = Some(Active::Guide {
                        index: idx,
                        created,
                        anchors,
                    });
                }
                let Some(Active::Guide {
                    index: idx,
                    created,
                    anchors,
                }) = &self.active
                else {
                    unreachable!("guide active set above");
                };
                let (idx, created) = (*idx, *created);
                let corrected = snap::guide_offset(
                    *offset,
                    anchors,
                    &self.snap,
                    facts.snap_disabled,
                    facts.zoom,
                );
                let _ = editor.dispatch(
                    vec![Mutation::GuideSet {
                        index: idx,
                        offset: corrected,
                    }],
                    Origin::Local,
                    Recording::Silent,
                );
                if matches!(phase, Phase::Commit) {
                    if *on_strip {
                        // Delete by return (RUL-7): the whole gesture
                        // rolls back — a create nets to nothing; a
                        // move restores the original position, then
                        // the remove records as the one entry.
                        editor.abort_gesture();
                        if !created {
                            let _ = editor.dispatch(
                                vec![Mutation::GuideRemove { index: idx }],
                                Origin::Local,
                                Recording::Record {
                                    label: Some("guide".to_string()),
                                },
                            );
                        }
                    } else {
                        editor.commit_gesture(Some("guide".to_string()));
                    }
                    self.active = None;
                }
            }
            Intent::EnterContentEdit { id } => {
                outcome.enter_content_edit = Some(id.clone());
            }
            Intent::Cancel => self.close_active(editor),
        }
        outcome
    }

    /// The clone modifier's ON edge (translate.md, `TRL-1/2`): the
    /// origins revert to their gesture-start positions and rest; a
    /// deep clone of each — fresh ids, inserted as its origin's
    /// immediate next sibling — takes over the gesture, and the
    /// selection retargets to the clones. The gesture checkpoint
    /// taken between the revert and the mint is the OFF edge's
    /// rollback point (`TRL-5`).
    fn clone_on(&mut self, editor: &mut Editor) {
        let Some(Active::Translate { members, clone, .. }) = &mut self.active else {
            return;
        };
        if clone.is_some() {
            return;
        }
        let revert: Vec<Mutation> = members
            .iter()
            .map(|(id, m)| Mutation::Patch {
                id: id.clone(),
                set: PropPatch {
                    position: Some(m.pos),
                    ..Default::default()
                },
            })
            .collect();
        if !revert.is_empty() {
            let _ = editor.dispatch(revert, Origin::Local, Recording::Silent);
        }
        let mark = editor.gesture_mark().unwrap_or(0);
        let mut counter = 0u64;
        let mut minted: HashSet<Id> = HashSet::new();
        let mut pairs: Vec<(Id, Id)> = Vec::new();
        let mut clone_members: Vec<(Id, TranslateMember)> = Vec::new();
        let roots: Vec<&Id> = members.iter().map(|(id, _)| id).collect();
        for (id, m) in members.iter() {
            // A member inside another member's subtree rides its
            // ancestor's deep clone — cloning it separately would
            // double it.
            if is_nested(editor.document(), id, &roots) {
                continue;
            }
            // Captured after the revert, so the clone is born at the
            // origin's resting position. Inserts dispatch one by one:
            // each next-sibling index reads the document its
            // predecessor already changed.
            let Some((insert, clone_id)) =
                crate::io::clone_next_sibling(editor.document(), id, &mut counter, &mut minted)
            else {
                continue;
            };
            let start_parent = editor.document().node_parent(id).flatten();
            if editor
                .dispatch(vec![insert], Origin::Local, Recording::Silent)
                .is_err()
            {
                continue;
            }
            pairs.push((id.clone(), clone_id.clone()));
            clone_members.push((
                clone_id,
                TranslateMember {
                    pos: m.pos,
                    frame: m.frame,
                    start_parent,
                    world: m.world,
                    closed: m.closed,
                    tray: m.tray,
                },
            ));
        }
        editor.set_selection(pairs.iter().map(|(_, c)| c.clone()).collect());
        *clone = Some(CloneCohort {
            pairs,
            mark,
            members: clone_members,
        });
    }

    /// The clone modifier's OFF edge (`TRL-1/5`): the clones vanish —
    /// the gesture frame rolls back to the mint checkpoint, so the
    /// committed entry never carries an abandoned clone or its ids —
    /// and the selection returns to the originals, which resume
    /// following the pointer on this very event.
    fn clone_off(&mut self, editor: &mut Editor) {
        let Some(Active::Translate { members, clone, .. }) = &mut self.active else {
            return;
        };
        let Some(cohort) = clone.take() else {
            return;
        };
        editor.gesture_rollback(cohort.mark);
        editor.set_selection(members.iter().map(|(id, _)| id.clone()).collect());
    }

    /// The repeat offset the next duplicate should apply (translate.md
    /// `TRL-4`): *measured now* — not stored — as the world offset
    /// between the first armed `(origin, clone)` pair, however the
    /// clone was moved since (drag, nudge, inspector). Zero when
    /// nothing is armed or the armed clones are not exactly the
    /// current selection.
    pub fn duplicate_offset(&self, editor: &Editor, scene: &impl InterpretScene) -> [f32; 2] {
        let Some(pairs) = &self.armed else {
            return [0.0, 0.0];
        };
        let selection: std::collections::HashSet<&Id> = editor.selection().iter().collect();
        let armed: std::collections::HashSet<&Id> = pairs.iter().map(|(_, c)| c).collect();
        if pairs.is_empty() || selection != armed {
            return [0.0, 0.0];
        }
        let (origin, clone) = &pairs[0];
        match (scene.world_bounds(origin), scene.world_bounds(clone)) {
            (Some(o), Some(c)) => [c.x - o.x, c.y - o.y],
            _ => [0.0, 0.0],
        }
    }

    /// The duplicate command (keybindings.md `Mod+D`; translate.md
    /// `TRL-4`): deep-clone the selection — fresh ids, each clone its
    /// origin's immediate next sibling — offset by the measured
    /// repeat ([`Interpreter::duplicate_offset`]), as **one** history
    /// entry; the selection retargets to the clones and the pairs
    /// re-arm, so repeated duplicates step-and-repeat.
    pub fn duplicate(&mut self, editor: &mut Editor, offset: [f32; 2]) {
        if self.gesture_open() {
            return;
        }
        let selection = editor.selection().to_vec();
        if selection.is_empty() {
            return;
        }
        // Whole subtrees once (the copy precedent): a selected
        // descendant rides its selected ancestor's deep clone.
        let wanted: HashSet<&Id> = selection.iter().collect();
        let mut roots: Vec<Id> = Vec::new();
        crate::io::collect_top_level(editor.document(), None, &wanted, &mut roots);
        editor.begin_gesture();
        let mut counter = 0u64;
        let mut minted: HashSet<Id> = HashSet::new();
        let mut pairs: Vec<(Id, Id)> = Vec::new();
        for id in &roots {
            let Some((mut insert, clone_id)) =
                crate::io::clone_next_sibling(editor.document(), id, &mut counter, &mut minted)
            else {
                continue;
            };
            // The repeat offset bakes into the fragment (the paste
            // precedent), so the entry is inserts only.
            if offset != [0.0, 0.0]
                && let Mutation::Insert { fragment, .. } = &mut insert
                && let Some((x, y)) = crate::document::node_position(&fragment.node)
            {
                crate::document::set_position(&mut fragment.node, x + offset[0], y + offset[1]);
            }
            if editor
                .dispatch(vec![insert], Origin::Local, Recording::Silent)
                .is_ok()
            {
                pairs.push((id.clone(), clone_id));
            }
        }
        editor.set_selection(pairs.iter().map(|(_, c)| c.clone()).collect());
        editor.commit_gesture(Some("duplicate".to_string()));
        self.armed = Some(pairs);
    }

    /// Keyboard nudge (snap.md's pipeline): an exact instruction —
    /// the step is already lattice-sized, so quantization is identity
    /// and geometry snap never runs (`SNAP-6`); the delta applies
    /// verbatim (`SNAP-4`: exact integer deltas), preserving any
    /// deliberate fractional offset. Each press records its own entry
    /// (`HISB-3` — committed entries never merge); burst framing
    /// (`NUDGE-2`: one entry per rapid burst via a dwell-closed
    /// gesture at this layer) is pending.
    pub fn nudge(&mut self, editor: &mut Editor, ids: &[Id], dx: f32, dy: f32) {
        if self.gesture_open() {
            return;
        }
        let batch: Vec<Mutation> = ids
            .iter()
            .filter_map(|id| {
                editor.node_position(id).map(|(x, y)| Mutation::Patch {
                    id: id.clone(),
                    set: PropPatch {
                        position: Some((x + dx, y + dy)),
                        ..Default::default()
                    },
                })
            })
            .collect();
        if batch.is_empty() {
            return;
        }
        let _ = editor.dispatch(
            batch,
            Origin::Local,
            Recording::Record {
                label: Some("nudge".to_string()),
            },
        );
    }

    /// Resize nudge (nudge.md `NUDGE-3`): origin-anchored — position
    /// is untouched, the far edge moves (the keyboard twin of the SE
    /// handle). All-or-nothing: a member that cannot resize (no size
    /// domain, or the delta would degenerate it) declines the whole
    /// command — nothing resizes a subset. One batch, one entry.
    pub fn resize_nudge(&mut self, editor: &mut Editor, ids: &[Id], dw: f32, dh: f32) -> bool {
        if self.gesture_open() || ids.is_empty() {
            return false;
        }
        let mut batch = Vec::with_capacity(ids.len());
        for id in ids {
            let Some((w, h)) = editor.node_size(id) else {
                return false;
            };
            let (nw, nh) = (w + dw, h + dh);
            if nw <= 0.0 || nh <= 0.0 {
                return false;
            }
            batch.push(Mutation::Patch {
                id: id.clone(),
                set: PropPatch {
                    size: Some((Some(nw), Some(nh))),
                    ..Default::default()
                },
            });
        }
        editor
            .dispatch(
                batch,
                Origin::Local,
                Recording::Record {
                    label: Some("resize nudge".to_string()),
                },
            )
            .is_ok()
    }

    /// The active translate's snap-guide chrome (`SNAP-8`): non-empty
    /// exactly while the last preview geometry-snapped; vanishes with
    /// the gesture. Host-fed extras — same decorative channel as the
    /// measurement readout, appended to the HUD draw list after the
    /// chrome build, so it can never register a hit region.
    pub fn snap_guides(&self) -> Vec<crate::hud::HudPrim> {
        match &self.active {
            Some(Active::Translate {
                snap: Some(ts),
                clone,
                ..
            }) => match &ts.snapped {
                // The chrome reads the session the cohort snapped
                // through (the clone variant carries the origins as
                // anchors).
                Some(geo) => snap::chrome(
                    if clone.is_some() {
                        &ts.clone_session
                    } else {
                        &ts.session
                    },
                    geo,
                ),
                None => Vec::new(),
            },
            Some(Active::Resize { snap: Some(rs), .. }) => match &rs.snapped {
                Some(s) => snap::resize_chrome(s),
                None => Vec::new(),
            },
            _ => Vec::new(),
        }
    }

    /// The drop-target overlay (`TRL-8`): the prospective parent's
    /// highlight outline, exactly while a commit at this instant
    /// would leave a member re-parented — the same decorative
    /// host-extras channel as the snap chrome, so it can never
    /// register a hit region. Vanishes with the gesture.
    pub fn drop_chrome(&self) -> Vec<crate::hud::HudPrim> {
        match &self.active {
            Some(Active::Translate {
                drop: Some((_, b)), ..
            }) => vec![crate::hud::HudPrim::Outline {
                corners: [
                    [b.x, b.y],
                    [b.x + b.width, b.y],
                    [b.x + b.width, b.y + b.height],
                    [b.x, b.y + b.height],
                ],
                role: crate::hud::Role::DropTarget,
            }],
            _ => Vec::new(),
        }
    }

    /// Defensive: the HUD's gestures are exclusive, but if a stream
    /// ever interleaves, close the stale gesture cleanly (abort — the
    /// safe direction) before opening the new one.
    fn abort_mismatched(&mut self, editor: &mut Editor, matches_kind: impl Fn(&Active) -> bool) {
        if let Some(active) = &self.active
            && !matches_kind(active)
        {
            self.close_active(editor);
        }
    }

    /// Close the active interaction, restoring its pre-gesture state and
    /// recording nothing: a marquee restores the prior selection; any
    /// gesture-backed active (translate / resize / rotate / guide) rolls
    /// its gesture back (`HISB-4`).
    fn close_active(&mut self, editor: &mut Editor) {
        match self.active.take() {
            Some(Active::Marquee { before }) => editor.set_selection(before),
            Some(_) => editor.abort_gesture(),
            None => {}
        }
    }
}
