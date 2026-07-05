//! The measurement readout — `docs/wg/canvas/measurement.md`
//! (`MEAS-*` contracts): hold the measurement modifier and hover, and
//! the canvas shows the distances between the selection and the
//! hovered node.
//!
//! Host-side and pure. The engine is [`math2::measurement::measure`]
//! (the `cmath.measure` port); [`readout`] is the trigger
//! truth-table; [`chrome`] converts a measurement into decorative
//! draw primitives the host appends to the HUD draw list — the
//! host-fed-extras channel of hud.md's "Not a snapping engine"
//! bullet. Nothing here retains state, registers a hit region, or
//! touches the document: showing, moving, and dismissing the readout
//! are overlay damage only.

use math2::RectangleSide;
use math2::measurement::{self, Measurement};
use math2::rect::{self, Rectangle};

use crate::hud::{HudPrim, Role};

/// Subject rects are snapped to a fine grid before measuring so
/// float noise in derived bounds cannot flip the spatial relation
/// (an epsilon overlap between visually-touching rects would read as
/// *intersecting* — a different readout shape entirely). The web
/// host quantizes to 0.01 for the same reason; a binary quantum of
/// comparable size keeps exact inputs exact in f32.
const SUBJECT_QUANTUM: f32 = 1.0 / 128.0;

/// The trigger truth-table (`MEAS-1`): a measurement exists exactly
/// when modifier ∧ idle ∧ selection ∧ hover target ∧ a ≠ b. `a` is
/// the selection's union bounds and `b` the hovered node's bounds,
/// both canvas-space; the caller passes `None` for a missing
/// conjunct. Pure — the host recomputes per event, so dismissal is
/// the same-event consequence of any conjunct dropping.
pub fn readout(
    modifier: bool,
    idle: bool,
    a: Option<Rectangle>,
    b: Option<Rectangle>,
) -> Option<Measurement> {
    if !modifier || !idle {
        return None;
    }
    let a = rect::quantize(a?, SUBJECT_QUANTUM);
    let b = rect::quantize(b?, SUBJECT_QUANTUM);
    // `measure` returns None for identical rects — the a ≠ b conjunct
    // and MEAS-4's "identical rects draw nothing", in one place.
    measurement::measure(a, b)
}

/// `Measurement::distance[i]` ↔ the box side its spacing line leaves.
const SIDES: [RectangleSide; 4] = [
    RectangleSide::Top,
    RectangleSide::Right,
    RectangleSide::Bottom,
    RectangleSide::Left,
];

/// Convert a measurement into decorative chrome (`MEAS-6`): thin
/// outlines on both subjects, one labelled solid spacing line per
/// non-zero side (`MEAS-4` zero omission), and a dashed auxiliary
/// line projecting a spacing line's far end to `b` where it does not
/// already land on `b`'s edge. Canvas-space geometry throughout, so
/// the values are zoom-invariant by construction (`MEAS-3`); none of
/// these primitives can register a hit region (`MEAS-2`).
pub fn chrome(m: &Measurement) -> Vec<HudPrim> {
    let mut prims = vec![
        HudPrim::Outline {
            corners: m.a.corners(),
            role: Role::Measurement,
        },
        HudPrim::Outline {
            corners: m.b.corners(),
            role: Role::Measurement,
        },
    ];
    for (i, side) in SIDES.iter().enumerate() {
        let dist = m.distance[i];
        if dist <= 0.0 {
            continue;
        }
        // Solid spacing line from the box side's midpoint, outward by
        // the distance (zoom = 1: canvas space), labelled at its
        // midpoint.
        let [x1, y1, x2, y2, _, _] = measurement::guide_line_xylr(m.box_rect, *side, dist, 1.0);
        prims.push(HudPrim::Line {
            a: [x1, y1],
            b: [x2, y2],
            dashed: false,
            role: Role::Measurement,
        });
        prims.push(HudPrim::Pill {
            anchor: [(x1 + x2) * 0.5, (y1 + y2) * 0.5],
            text: crate::hud::label_number(dist),
            role: Role::Measurement,
        });
        // Dashed auxiliary from the far end toward `b`; zero length
        // (or NaN, when the end lies on/inside `b`) means the spacing
        // line already lands on the edge.
        let [ax1, ay1, ax2, ay2, alen, _] =
            measurement::auxiliary_line_xylr([x2, y2], m.b, *side, 1.0);
        if alen > 0.0 {
            prims.push(HudPrim::Line {
                a: [ax1, ay1],
                b: [ax2, ay2],
                dashed: true,
                role: Role::Measurement,
            });
        }
    }
    prims
}
