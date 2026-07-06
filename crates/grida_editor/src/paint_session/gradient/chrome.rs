//! The gradient session's chrome — the pure draw-list build
//! (`docs/wg/canvas/paint-session/gradient.md`, chrome and hover).
//!
//! A pure function from the session's visible state to [`HudDraw`]
//! prims in **canvas** space (the host projects and paints, exactly
//! like the document HUD and vector chrome). The unit-space frame and
//! stops are mapped out through `unit_to_canvas` — the composition of
//! the node's world transform with `scale(width, height)`, so the whole
//! surface lives in unit gradient space and only meets the canvas here.
//!
//! The inventory: the A→B axis; the ellipse ring **for sweep only**
//! (virtual for radial/diamond — it drives the control model but is not
//! drawn); the circle control-point handles; and the color-stop
//! **chips** — rounded color squares with a caret, floated off a
//! straight axis (linear/radial/diamond, caret back at the track) or
//! sitting on the ring (sweep, caret at the center so the color aligns
//! with the render), with the hovered-track insertion **preview** ghost.

use std::collections::BTreeSet;

use grida::cg::prelude::GradientStop;
use math2::transform::AffineTransform;
use math2::vector2::{self, Vector2};

use crate::hud::{HudDraw, HudPrim, Role};

use super::frame::{Frame, FramePoint, GradientType};
use super::hit::Control;
use super::ops;

/// The tunable screen-px layout of the gradient chrome — one place to
/// adjust every dimension. Offsets are consumed in canvas space (÷ zoom);
/// sizes are drawn screen-fixed by the host painter.
pub mod layout {
    /// The color-stop chip's square size.
    pub const CHIP: f32 = 18.0;
    /// Perpendicular float off a straight axis (linear/radial/diamond),
    /// so the chip clears the line and an endpoint stop is grabbable.
    pub const STRAIGHT_OFFSET: f32 = 25.0;
    /// Radial float off the sweep ring, so the chip sits **on** the arc
    /// without the arc cutting through its middle.
    pub const SWEEP_OFFSET: f32 = 13.0;
    /// Control-point handle circle radius.
    pub const HANDLE_RADIUS: f32 = 5.0;
    /// Caret half-base and how far its tip juts past the chip edge.
    pub const CARET_HALF: f32 = 4.5;
    pub const CARET_TIP: f32 = 6.0;
    /// Distance from the preview chip center to its offset-% badge.
    pub const BADGE_GAP: f32 = 34.0;
    /// Segments the ellipse ring is tessellated into.
    pub const RING_SEGMENTS: usize = 48;
}

/// The visible state of a gradient session, borrowed for one build.
pub struct GradientChrome<'a> {
    pub ty: GradientType,
    /// The control-point frame in **unit** gradient space.
    pub frame: &'a Frame,
    pub stops: &'a [GradientStop],
    /// The selected stop indices (their chips read active).
    pub selected: &'a BTreeSet<usize>,
    /// The hovered control, if any (`GRAD` exclusive hover).
    pub hover: Option<Control>,
    /// Unit gradient space → canvas: `node_world × scale(w, h)`.
    pub unit_to_canvas: AffineTransform,
    /// The camera zoom — the chip offset is screen-fixed, so it divides
    /// out the zoom to stay constant on screen (see [`layout`]).
    pub zoom: f32,
}

impl GradientChrome<'_> {
    fn to_canvas(&self, p: Vector2) -> [f32; 2] {
        vector2::transform(p, &self.unit_to_canvas)
    }

    /// A unit-space direction into canvas space (linear part only —
    /// directions do not translate).
    fn dir_to_canvas(&self, t: Vector2) -> [f32; 2] {
        vector2::transform_direction(t, &self.unit_to_canvas)
    }

    /// A stop chip for `offset`, as `(centre, toward)` where `toward` is
    /// the point the caret points at. For sweep the chip floats radially
    /// off the ring and its caret points at the gradient center (so it
    /// rides the arc with the color aligned to the render there); for the
    /// straight-axis types it floats off the axis and its caret points
    /// back at the track.
    fn chip(&self, offset: f32) -> ([f32; 2], [f32; 2]) {
        let on_track = self.to_canvas(ops::offset_to_point(self.ty, self.frame, offset));
        let tangent = self.dir_to_canvas(ops::tangent_at(self.ty, self.frame, offset));
        let origin = self.to_canvas(self.frame.origin);
        let center = chip_center(self.ty, on_track, tangent, origin, self.zoom);
        let toward = if self.ty.is_sweep() { origin } else { on_track };
        (center, toward)
    }

    /// A color-stop chip prim for `offset` (shared by the real stops and
    /// the insertion preview, which differ only by color/flags).
    fn chip_prim(&self, offset: f32, color: [u8; 4], selected: bool, preview: bool) -> HudPrim {
        let (anchor, toward) = self.chip(offset);
        HudPrim::GradientChip {
            anchor,
            toward,
            color,
            selected,
            preview,
        }
    }
}

/// The chip centre from the on-track canvas point, the canvas track
/// tangent, and the gradient center. A sweep chip floats
/// [`layout::SWEEP_OFFSET`] **radially outward** from the center (so it
/// sits on the arc, clear of the ring line); a straight-axis chip floats
/// [`layout::STRAIGHT_OFFSET`] along the axis perpendicular. Shared by the
/// chrome and the session's hit-testing so a chip is clicked where drawn.
pub fn chip_center(
    ty: GradientType,
    on_track: [f32; 2],
    tangent: [f32; 2],
    origin: [f32; 2],
    zoom: f32,
) -> [f32; 2] {
    let (dir, offset) = if ty.is_sweep() {
        // Radially outward from the center.
        (
            vector2::normalize([on_track[0] - origin[0], on_track[1] - origin[1]]),
            layout::SWEEP_OFFSET,
        )
    } else {
        // Perpendicular to the axis, on a consistent side (web: perpY ≤ 0).
        let mut perp = vector2::normalize([-tangent[1], tangent[0]]);
        if perp[1] > 0.0 {
            perp = [-perp[0], -perp[1]];
        }
        (perp, layout::STRAIGHT_OFFSET)
    };
    let d = offset / zoom.max(1e-3);
    [on_track[0] + dir[0] * d, on_track[1] + dir[1] * d]
}

/// Build one frame of gradient chrome.
pub fn build(input: GradientChrome) -> HudDraw {
    let mut draw = HudDraw::default();
    let frame = input.frame;

    // The A→B axis track.
    draw.prims.push(HudPrim::Line {
        a: input.to_canvas(frame.origin),
        b: input.to_canvas(frame.primary),
        dashed: false,
        role: Role::GradientTrack,
    });

    // The ellipse ring — drawn only for **sweep**, where the stops ride
    // it. For radial/diamond the ellipse is virtual (it drives the
    // control model but is not rendered). It is the unit circle (centre
    // 0.5, radius 0.5) carried through the frame — `origin + cos·(primary
    // −origin) + sin·(secondary−origin)`.
    if input.ty.is_sweep()
        && let Some(secondary) = frame.secondary
    {
        let mut prev = input.to_canvas(frame.primary);
        for i in 1..=layout::RING_SEGMENTS {
            let (sin, cos) =
                (i as f32 / layout::RING_SEGMENTS as f32 * std::f32::consts::TAU).sin_cos();
            let p = [
                frame.origin[0]
                    + cos * (frame.primary[0] - frame.origin[0])
                    + sin * (secondary[0] - frame.origin[0]),
                frame.origin[1]
                    + cos * (frame.primary[1] - frame.origin[1])
                    + sin * (secondary[1] - frame.origin[1]),
            ];
            let next = input.to_canvas(p);
            draw.prims.push(HudPrim::Line {
                a: prev,
                b: next,
                dashed: false,
                role: Role::GradientTrack,
            });
            prev = next;
        }
    }

    // The color-stop chips (floated off a straight axis, on the ring for
    // sweep).
    for (i, stop) in input.stops.iter().enumerate() {
        let selected = input.selected.contains(&i) || input.hover == Some(Control::Stop(i));
        let color = [stop.color.r, stop.color.g, stop.color.b, stop.color.a];
        draw.prims
            .push(input.chip_prim(stop.offset, color, selected, false));
    }

    // The insertion preview: a ghost chip where a stop would land while
    // the track is hovered (same placement as a real chip), plus an
    // offset-% badge floated further out so the user sees where and what
    // a click would insert.
    if let Some(Control::Track(offset)) = input.hover {
        let (anchor, toward) = input.chip(offset);
        draw.prims
            .push(input.chip_prim(offset, [0x80, 0x80, 0x80, 0xff], false, true));
        // The badge sits further along the chip's float direction (away
        // from the track), a screen-fixed gap out.
        let away = vector2::normalize([anchor[0] - toward[0], anchor[1] - toward[1]]);
        let gap = layout::BADGE_GAP / input.zoom.max(1e-3);
        draw.prims.push(HudPrim::Pill {
            anchor: [anchor[0] + away[0] * gap, anchor[1] + away[1] * gap],
            text: format!("{}%", (offset * 100.0).round() as i32),
            role: Role::GradientBadge,
        });
    }

    // The control-point handles, on top.
    let handle = |which: FramePoint, p: Vector2| HudPrim::GradientHandle {
        anchor: input.to_canvas(p),
        active: input.hover == Some(Control::Frame(which)),
    };
    draw.prims.push(handle(FramePoint::Origin, frame.origin));
    draw.prims.push(handle(FramePoint::Primary, frame.primary));
    if let Some(secondary) = frame.secondary {
        draw.prims.push(handle(FramePoint::Secondary, secondary));
    }

    draw
}

#[cfg(test)]
mod tests {
    use super::*;
    use grida::cg::prelude::CGColor;

    fn stops() -> Vec<GradientStop> {
        vec![
            GradientStop {
                offset: 0.0,
                color: CGColor::BLACK,
            },
            GradientStop {
                offset: 1.0,
                color: CGColor::WHITE,
            },
        ]
    }

    fn chrome<'a>(
        ty: GradientType,
        frame: &'a Frame,
        stops: &'a [GradientStop],
        selected: &'a BTreeSet<usize>,
        hover: Option<Control>,
    ) -> GradientChrome<'a> {
        GradientChrome {
            ty,
            frame,
            stops,
            selected,
            hover,
            unit_to_canvas: AffineTransform::from_acebdf(100.0, 0.0, 0.0, 0.0, 100.0, 0.0),
            zoom: 1.0,
        }
    }

    fn count(draw: &HudDraw, f: impl Fn(&HudPrim) -> bool) -> usize {
        draw.prims.iter().filter(|p| f(p)).count()
    }

    #[test]
    fn linear_has_one_axis_two_handles_and_a_chip_per_stop() {
        let frame = super::super::frame::frame_from_transform(
            GradientType::Linear,
            &AffineTransform::identity(),
        );
        let s = stops();
        let sel = BTreeSet::new();
        let draw = build(chrome(GradientType::Linear, &frame, &s, &sel, None));
        assert_eq!(
            count(&draw, |p| matches!(p, HudPrim::Line { .. })),
            1,
            "just the axis"
        );
        assert_eq!(
            count(&draw, |p| matches!(p, HudPrim::GradientHandle { .. })),
            2
        );
        assert_eq!(
            count(&draw, |p| matches!(p, HudPrim::GradientChip { .. })),
            2
        );
    }

    #[test]
    fn track_hover_shows_a_preview_chip_and_offset_badge() {
        let frame = super::super::frame::frame_from_transform(
            GradientType::Linear,
            &AffineTransform::identity(),
        );
        let s = stops();
        let sel = BTreeSet::new();
        let draw = build(chrome(
            GradientType::Linear,
            &frame,
            &s,
            &sel,
            Some(Control::Track(0.42)),
        ));
        assert_eq!(
            count(&draw, |p| matches!(
                p,
                HudPrim::GradientChip { preview: true, .. }
            )),
            1,
            "the hovered track shows a ghost preview chip"
        );
        let badge = draw.prims.iter().find_map(|p| match p {
            HudPrim::Pill {
                text,
                role: Role::GradientBadge,
                ..
            } => Some(text.clone()),
            _ => None,
        });
        assert_eq!(badge.as_deref(), Some("42%"), "the badge reads the offset");
    }

    #[test]
    fn sweep_draws_the_ring_radial_does_not() {
        let s = stops();
        let sel = BTreeSet::new();
        // Sweep draws the ellipse ring (its stops ride it).
        let sweep_frame = super::super::frame::frame_from_transform(
            GradientType::Sweep,
            &AffineTransform::identity(),
        );
        let sweep = build(chrome(GradientType::Sweep, &sweep_frame, &s, &sel, None));
        assert!(
            count(&sweep, |p| matches!(p, HudPrim::Line { .. })) > layout::RING_SEGMENTS,
            "sweep draws the axis + the ring"
        );
        assert_eq!(
            count(&sweep, |p| matches!(p, HudPrim::GradientHandle { .. })),
            3
        );
        // Radial: three handles, but the ellipse is virtual — only the
        // axis line is drawn, no ring.
        let radial_frame = super::super::frame::frame_from_transform(
            GradientType::Radial,
            &AffineTransform::identity(),
        );
        let radial = build(chrome(GradientType::Radial, &radial_frame, &s, &sel, None));
        assert_eq!(
            count(&radial, |p| matches!(p, HudPrim::Line { .. })),
            1,
            "radial draws only the axis, no ring"
        );
        assert_eq!(
            count(&radial, |p| matches!(p, HudPrim::GradientHandle { .. })),
            3
        );
    }

    #[test]
    fn sweep_chips_sit_on_the_ring_pointing_at_center() {
        let frame = super::super::frame::frame_from_transform(
            GradientType::Sweep,
            &AffineTransform::identity(),
        );
        // Distinct ring angles (offset 0 and 1 coincide for sweep).
        let s = vec![
            GradientStop {
                offset: 0.25,
                color: CGColor::BLACK,
            },
            GradientStop {
                offset: 0.75,
                color: CGColor::WHITE,
            },
        ];
        let sel = BTreeSet::new();
        let draw = build(chrome(GradientType::Sweep, &frame, &s, &sel, None));
        let chips: Vec<_> = draw
            .prims
            .iter()
            .filter_map(|p| match p {
                HudPrim::GradientChip { anchor, toward, .. } => Some((*anchor, *toward)),
                _ => None,
            })
            .collect();
        assert_eq!(chips.len(), 2);
        for (anchor, toward) in chips {
            // Riding the ring: centre (50,50), radius 50 (unit_to_canvas =
            // ×100), the chip floated SWEEP_OFFSET radially outward.
            let d = ((anchor[0] - 50.0).powi(2) + (anchor[1] - 50.0).powi(2)).sqrt();
            assert!(
                (d - (50.0 + layout::SWEEP_OFFSET)).abs() < 1e-2,
                "the chip sits just off the ring, radially outward"
            );
            // The caret points at the gradient center (50,50).
            assert!(
                (toward[0] - 50.0).abs() < 1e-3 && (toward[1] - 50.0).abs() < 1e-3,
                "the caret points at the center"
            );
        }
    }

    #[test]
    fn chips_float_off_the_track() {
        // A stop at the very start (offset 0) still yields a chip offset
        // from the origin handle — so stops never hide under handles.
        let frame = super::super::frame::frame_from_transform(
            GradientType::Linear,
            &AffineTransform::identity(),
        );
        let s = stops();
        let sel = BTreeSet::new();
        let draw = build(chrome(GradientType::Linear, &frame, &s, &sel, None));
        let chip0 = draw.prims.iter().find_map(|p| match p {
            HudPrim::GradientChip { anchor, toward, .. } => Some((*anchor, *toward)),
            _ => None,
        });
        let (anchor, toward) = chip0.unwrap();
        let d = ((anchor[0] - toward[0]).powi(2) + (anchor[1] - toward[1]).powi(2)).sqrt();
        assert!(
            (d - layout::STRAIGHT_OFFSET).abs() < 1e-3,
            "chip floats the offset off the track"
        );
    }

    #[test]
    fn selected_and_preview_chips_read() {
        let frame = super::super::frame::frame_from_transform(
            GradientType::Linear,
            &AffineTransform::identity(),
        );
        let s = stops();
        let sel: BTreeSet<usize> = [1].into_iter().collect();
        let draw = build(chrome(
            GradientType::Linear,
            &frame,
            &s,
            &sel,
            Some(Control::Track(0.5)),
        ));
        assert_eq!(
            count(&draw, |p| matches!(
                p,
                HudPrim::GradientChip { selected: true, .. }
            )),
            1
        );
        assert_eq!(
            count(&draw, |p| matches!(
                p,
                HudPrim::GradientChip { preview: true, .. }
            )),
            1
        );
    }
}
