//! The render backend and the chrome builder — the HUD's per-frame
//! pure function (`HUD-6`): (machine state, mirrors, `shape_of`) →
//! (draw list, hit registry). The two outputs deliberately disagree
//! (`HUD-5`): knobs draw small and hit fat; rotate halos and edge
//! strips hit without drawing at all; outlines and the size badge
//! draw without hitting.

use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use super::gesture::HudGesture;
use super::hit::{
    HitRegion, HitRegistry, HitShape, HudAction, PRIORITY_BODY, PRIORITY_CORNER, PRIORITY_EDGE,
    PRIORITY_GUIDE, PRIORITY_ROTATE, PRIORITY_STRIP,
};
use super::vocab::{HudScene, Id, ResizeDirection, RotationCorner, SelectionShape};

/// Visible knob size (screen px). The hit region is larger — pad the
/// hit, never the visual.
pub const KNOB_VISUAL_PX: f32 = 8.0;
/// Knob hit size (screen px).
pub const KNOB_HIT_PX: f32 = 16.0;
/// Virtual edge-strip thickness (screen px).
pub const EDGE_HIT_PX: f32 = 12.0;
/// Virtual rotate-halo size (screen px).
pub const ROTATE_HIT_PX: f32 = 16.0;
/// Radial outward offset of a rotate halo from its corner (screen px).
pub const ROTATE_OFFSET_PX: f32 = 14.0;
/// Below this screen size the transform handles hide (the chrome
/// would dominate the content).
pub const MIN_HANDLE_SELECTION_PX: f32 = 12.0;
/// Guide-line grab thickness (screen px) — fat hit, hairline visual
/// (`ruler.md` "Move"; the two-backend rule).
pub const GUIDE_HIT_PX: f32 = 8.0;

/// Chrome role — the host maps roles to its style tokens; the HUD
/// ships geometry, not looks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Hover,
    Selection,
    Marquee,
    /// Host-fed measurement readout (`docs/wg/canvas/measurement.md`)
    /// — decorative only, never a hit region.
    Measurement,
    /// Host-fed snap-guide chrome (`docs/wg/canvas/snap.md`) —
    /// decorative only, never a hit region.
    Snap,
    /// A persistent ruler guide (`docs/wg/canvas/ruler.md`) — the one
    /// chrome role that *does* pair with a hit region (the fat grab
    /// strip along the hairline).
    Guide,
    /// A guide the idle pointer is over: same color, heavier stroke
    /// (the web's hover affordance).
    GuideHover,
    /// The guide an active guide gesture is editing: selection accent
    /// (blue), heavier stroke.
    GuideActive,
    /// Host-fed drop-target overlay (`docs/wg/canvas/translate.md`,
    /// `TRL-8`): the prospective parent's highlight outline during a
    /// re-parenting translate — decorative only, never a hit region.
    DropTarget,
    /// Vector edit-mode geometry chrome, idle (`vector-edit.md`):
    /// segment bodies, vertex dot outlines.
    VectorIdle,
    /// The hovered vector control (`VEC-12`: at most one).
    VectorHover,
    /// Sub-selected vector controls.
    VectorSelected,
    /// The pen's preview chrome: rubber-band curve, projected
    /// insertion point — decorative, never a hit region.
    VectorPreview,
    /// Tangent knobs and their hairline connectors.
    VectorTangent,
}

/// A dumb draw primitive. Canvas-space geometry; the host projects
/// and paints.
#[derive(Debug, Clone, PartialEq)]
pub enum HudPrim {
    /// Closed 4-corner outline (canvas space; axis-aligned rects are
    /// the degenerate case).
    Outline { corners: [[f32; 2]; 4], role: Role },
    /// Screen-sized square at a canvas anchor (resize knob).
    Knob { anchor: [f32; 2], size: f32 },
    /// Filled + stroked canvas-space rect (the marquee).
    Region { rect: Rectangle, role: Role },
    /// Text pill at a canvas anchor (size badge, measurement labels).
    Pill {
        anchor: [f32; 2],
        text: String,
        role: Role,
    },
    /// Canvas-space line segment (host-fed extras: measurement
    /// spacing lines solid, auxiliary projections dashed).
    Line {
        a: [f32; 2],
        b: [f32; 2],
        dashed: bool,
        role: Role,
    },
    /// Point marker at a canvas anchor, rendered as a small
    /// screen-fixed crosshair "X" (host-fed extras: snap hit points —
    /// the web HUD's `HUDPoint`).
    Point { anchor: [f32; 2], role: Role },
    /// Full-length hairline across the viewport at a canvas offset on
    /// one axis (host-fed extras: snap-to-guide hits; the ruler's
    /// guides later).
    Rule {
        axis: math2::vector2::Axis,
        offset: f32,
        role: Role,
    },
    /// Cubic Bézier stroke in canvas space, tangent form (vector
    /// edit-mode segment bodies and the pen's rubber-band preview —
    /// `vector-edit.md` chrome inventory).
    Curve {
        a: [f32; 2],
        b: [f32; 2],
        ta: [f32; 2],
        tb: [f32; 2],
        dashed: bool,
        role: Role,
    },
    /// Small screen-fixed dot at a canvas anchor (vector vertices and
    /// tangent knobs; the role carries the state).
    Dot { anchor: [f32; 2], role: Role },
}

/// One frame of chrome.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct HudDraw {
    pub prims: Vec<HudPrim>,
}

/// Chrome build inputs (borrowed views of the machine's state).
pub(super) struct ChromeInput<'a> {
    pub selection: &'a [Id],
    pub hover: Option<&'a Id>,
    pub gesture: &'a HudGesture,
    pub view: &'a AffineTransform,
    pub readonly: bool,
    /// Ruler visibility (`RUL-8`): gates the strip regions and every
    /// guide prim/region below.
    pub ruler: bool,
    /// The canvas viewport's top-left (logical px) — the ruler L's
    /// corner; strip regions sit at these edges.
    pub ruler_origin: [f32; 2],
    /// The document's guides (host-pushed mirror).
    pub guides: &'a [math2::snap::canvas::Guide],
    /// Idle hover emphasis (machine state).
    pub hover_guide: Option<usize>,
    /// Active guide-gesture emphasis (machine state).
    pub active_guide: Option<usize>,
}

fn rect_corners(r: &Rectangle) -> [[f32; 2]; 4] {
    r.corners()
}

fn shape_corners(shape: &SelectionShape) -> [[f32; 2]; 4] {
    match shape {
        SelectionShape::Rect(r) => rect_corners(r),
        SelectionShape::Transformed { local, matrix } => {
            let c = local.corners();
            [
                math2::vector2::transform(c[0], matrix),
                math2::vector2::transform(c[1], matrix),
                math2::vector2::transform(c[2], matrix),
                math2::vector2::transform(c[3], matrix),
            ]
        }
    }
}

/// Project a canvas rect to a screen AABB.
fn project_rect(r: &Rectangle, view: &AffineTransform) -> Rectangle {
    let pts: Vec<[f32; 2]> = r
        .corners()
        .iter()
        .map(|c| math2::vector2::transform(*c, view))
        .collect();
    Rectangle::from_points(&pts)
}

/// The four corner (dir, canvas-point) pairs of a rect.
fn corner_points(r: &Rectangle) -> [(ResizeDirection, RotationCorner, [f32; 2]); 4] {
    [
        (ResizeDirection::NW, RotationCorner::NW, [r.x, r.y]),
        (
            ResizeDirection::NE,
            RotationCorner::NE,
            [r.x + r.width, r.y],
        ),
        (
            ResizeDirection::SE,
            RotationCorner::SE,
            [r.x + r.width, r.y + r.height],
        ),
        (
            ResizeDirection::SW,
            RotationCorner::SW,
            [r.x, r.y + r.height],
        ),
    ]
}

/// Build one frame of chrome. Pure over its inputs (`HUD-6`).
pub(super) fn build(
    input: ChromeInput<'_>,
    scene: &dyn HudScene,
    regions: &mut HitRegistry,
) -> HudDraw {
    regions.clear();
    let mut draw = HudDraw::default();
    let gesture_active = input.gesture.is_active();

    // Ruler chrome (ruler.md): guides paint and hit-test only while
    // the ruler is on (RUL-8). The strips themselves are painted by
    // the shell (screen-space frame chrome, top-most); here they are
    // hit regions only — a press on one arms the counter-axis
    // create drag (RUL-10). Regions gate on readonly (viewing keeps
    // the guides visible, editing them needs authority); the corner
    // square stays dead.
    if input.ruler {
        // Far edge of a strip region: strips run the full viewport;
        // the machine holds no viewport size, and pointer coordinates
        // are bounded by it, so a large finite extent is exact.
        const FAR: f32 = 1e7;
        let [ox, oy] = input.ruler_origin;
        if !input.readonly {
            // Top strip reads x, authors axis-y guides.
            regions.add(HitRegion {
                shape: HitShape::ScreenAabb {
                    rect: Rectangle::from_xywh(
                        ox + crate::ruler::STRIP_PX,
                        oy,
                        FAR,
                        crate::ruler::STRIP_PX,
                    ),
                },
                action: HudAction::GuideStrip(math2::vector2::Axis::Y),
                priority: PRIORITY_STRIP,
            });
            // Left strip reads y, authors axis-x guides.
            regions.add(HitRegion {
                shape: HitShape::ScreenAabb {
                    rect: Rectangle::from_xywh(
                        ox,
                        oy + crate::ruler::STRIP_PX,
                        crate::ruler::STRIP_PX,
                        FAR,
                    ),
                },
                action: HudAction::GuideStrip(math2::vector2::Axis::X),
                priority: PRIORITY_STRIP,
            });
        }
        for (index, guide) in input.guides.iter().enumerate() {
            // Emphasis: the actively-edited guide reads as selected
            // (blue, heavier), the hovered one as grabbable (heavier).
            let role = if input.active_guide == Some(index) {
                Role::GuideActive
            } else if input.hover_guide == Some(index) {
                Role::GuideHover
            } else {
                Role::Guide
            };
            draw.prims.push(HudPrim::Rule {
                axis: guide.axis,
                offset: guide.offset,
                role,
            });
            if input.readonly {
                continue;
            }
            // Fat grab strip along the hairline, screen space
            // (HUD-5: pad the hit, never the visual).
            let half = GUIDE_HIT_PX * 0.5;
            let rect = match guide.axis {
                math2::vector2::Axis::X => {
                    let sx = math2::vector2::transform([guide.offset, 0.0], input.view)[0];
                    Rectangle::from_xywh(sx - half, -FAR, GUIDE_HIT_PX, 2.0 * FAR)
                }
                math2::vector2::Axis::Y => {
                    let sy = math2::vector2::transform([0.0, guide.offset], input.view)[1];
                    Rectangle::from_xywh(-FAR, sy - half, 2.0 * FAR, GUIDE_HIT_PX)
                }
            };
            regions.add(HitRegion {
                shape: HitShape::ScreenAabb { rect },
                action: HudAction::GuideLine(index),
                priority: PRIORITY_GUIDE,
            });
        }
    }

    // Hover outline — pick-derived, never suppressed by chrome
    // (`HUD-8`); hidden only while a gesture runs.
    if !gesture_active
        && let Some(h) = input.hover
        && !input.selection.contains(h)
        && let Some(shape) = scene.shape_of(h)
    {
        draw.prims.push(HudPrim::Outline {
            corners: shape_corners(&shape),
            role: Role::Hover,
        });
    }

    // Selection outlines + union.
    let mut shapes: Vec<(Id, SelectionShape)> = Vec::new();
    for id in input.selection {
        if let Some(shape) = scene.shape_of(id) {
            draw.prims.push(HudPrim::Outline {
                corners: shape_corners(&shape),
                role: Role::Selection,
            });
            shapes.push((id.clone(), shape));
        }
    }

    if !shapes.is_empty() {
        let aabbs: Vec<Rectangle> = shapes.iter().map(|(_, s)| s.aabb()).collect();
        let union = math2::rect::union(&aabbs);
        if shapes.len() > 1 {
            draw.prims.push(HudPrim::Outline {
                corners: rect_corners(&union),
                role: Role::Selection,
            });
        }

        if !gesture_active && !input.readonly {
            let screen = project_rect(&union, input.view);
            let all_axis_aligned = shapes
                .iter()
                .all(|(_, s)| matches!(s, SelectionShape::Rect(_)));

            // Body region — claims the press for translate; content
            // underneath stays pickable (hover is decoupled).
            if shapes.len() == 1
                && let SelectionShape::Transformed { local, matrix } = &shapes[0].1
            {
                // Oriented body: exact at any rotation.
                if let Some(inverse) = input.view.compose(matrix).inverse() {
                    regions.add(HitRegion {
                        shape: HitShape::ScreenObb {
                            rect: *local,
                            inverse,
                        },
                        action: HudAction::Body,
                        priority: PRIORITY_BODY,
                    });
                }
            } else {
                regions.add(HitRegion {
                    shape: HitShape::ScreenAabb { rect: screen },
                    action: HudAction::Body,
                    priority: PRIORITY_BODY,
                });
            }

            let big_enough =
                screen.width >= MIN_HANDLE_SELECTION_PX && screen.height >= MIN_HANDLE_SELECTION_PX;

            // Rotate halos — virtual (hit, no render), radially
            // outside each corner of the union (or the projected OBB
            // corners of a single transformed node).
            if big_enough {
                let center = math2::vector2::transform(union.center(), input.view);
                let corners: [(RotationCorner, [f32; 2]); 4] = if shapes.len() == 1 {
                    let c = shape_corners(&shapes[0].1);
                    [
                        (RotationCorner::NW, c[0]),
                        (RotationCorner::NE, c[1]),
                        (RotationCorner::SE, c[2]),
                        (RotationCorner::SW, c[3]),
                    ]
                } else {
                    let cp = corner_points(&union);
                    [
                        (cp[0].1, cp[0].2),
                        (cp[1].1, cp[1].2),
                        (cp[2].1, cp[2].2),
                        (cp[3].1, cp[3].2),
                    ]
                };
                for (corner, pt) in corners {
                    let s = math2::vector2::transform(pt, input.view);
                    let d = [s[0] - center[0], s[1] - center[1]];
                    let len = (d[0] * d[0] + d[1] * d[1]).sqrt().max(1.0);
                    let offset = [d[0] / len * ROTATE_OFFSET_PX, d[1] / len * ROTATE_OFFSET_PX];
                    regions.add(HitRegion {
                        shape: HitShape::ScreenRectAtCanvas {
                            anchor: pt,
                            offset,
                            width: ROTATE_HIT_PX,
                            height: ROTATE_HIT_PX,
                        },
                        action: HudAction::Rotate(corner),
                        priority: PRIORITY_ROTATE,
                    });
                }
            }

            // Resize handles — v1 for axis-aligned selections only
            // (local-frame resize of rotated nodes is named deferred
            // in hud.md).
            if all_axis_aligned && big_enough {
                for (dir, _, pt) in corner_points(&union) {
                    regions.add(HitRegion {
                        shape: HitShape::ScreenRectAtCanvas {
                            anchor: pt,
                            offset: [0.0, 0.0],
                            width: KNOB_HIT_PX,
                            height: KNOB_HIT_PX,
                        },
                        action: HudAction::Resize(dir),
                        priority: PRIORITY_CORNER,
                    });
                    draw.prims.push(HudPrim::Knob {
                        anchor: pt,
                        size: KNOB_VISUAL_PX,
                    });
                }
                // Virtual edge strips, spanning between the corner
                // zones.
                let inset = KNOB_HIT_PX * 0.5;
                let half = EDGE_HIT_PX * 0.5;
                let edges: [(ResizeDirection, Rectangle); 4] = [
                    (
                        ResizeDirection::N,
                        Rectangle::from_xywh(
                            screen.x + inset,
                            screen.y - half,
                            (screen.width - 2.0 * inset).max(0.0),
                            EDGE_HIT_PX,
                        ),
                    ),
                    (
                        ResizeDirection::S,
                        Rectangle::from_xywh(
                            screen.x + inset,
                            screen.y + screen.height - half,
                            (screen.width - 2.0 * inset).max(0.0),
                            EDGE_HIT_PX,
                        ),
                    ),
                    (
                        ResizeDirection::W,
                        Rectangle::from_xywh(
                            screen.x - half,
                            screen.y + inset,
                            EDGE_HIT_PX,
                            (screen.height - 2.0 * inset).max(0.0),
                        ),
                    ),
                    (
                        ResizeDirection::E,
                        Rectangle::from_xywh(
                            screen.x + screen.width - half,
                            screen.y + inset,
                            EDGE_HIT_PX,
                            (screen.height - 2.0 * inset).max(0.0),
                        ),
                    ),
                ];
                for (dir, rect) in edges {
                    if rect.width <= 0.0 || rect.height <= 0.0 {
                        continue;
                    }
                    regions.add(HitRegion {
                        shape: HitShape::ScreenAabb { rect },
                        action: HudAction::Resize(dir),
                        priority: PRIORITY_EDGE,
                    });
                }
            }

            // Size badge — decorative (render, no hit). Single
            // selection reads the node's own dims (local for
            // transformed); multi reads the union.
            let (bw, bh) = if shapes.len() == 1 {
                match &shapes[0].1 {
                    SelectionShape::Rect(r) => (r.width, r.height),
                    SelectionShape::Transformed { local, .. } => (local.width, local.height),
                }
            } else {
                (union.width, union.height)
            };
            draw.prims.push(HudPrim::Pill {
                anchor: [union.x + union.width * 0.5, union.y + union.height],
                text: format!("{} × {}", label_number(bw), label_number(bh)),
                role: Role::Selection,
            });
        }
    }

    // Marquee rect — gesture chrome.
    if let HudGesture::Marquee {
        anchor, current, ..
    } = input.gesture
    {
        draw.prims.push(HudPrim::Region {
            rect: Rectangle::from_points(&[*anchor, *current]),
            role: Role::Marquee,
        });
    }

    draw
}

/// Chrome label formatting: one decimal, integer-clean — shared by
/// the size badge and the measurement readout's distance pills.
pub fn label_number(v: f32) -> String {
    let r = (v * 10.0).round() / 10.0;
    if (r - r.round()).abs() < f32::EPSILON {
        format!("{}", r.round() as i64)
    } else {
        format!("{r:.1}")
    }
}
