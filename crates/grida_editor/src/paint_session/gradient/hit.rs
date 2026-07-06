//! Pure hover resolution for the gradient session — nearest control in
//! **canvas** space, screen-px thresholds ÷ zoom
//! (`docs/wg/canvas/paint-session/gradient.md`, chrome and hover). No
//! editor, no state: the session projects the frame and stops to canvas
//! and calls these, owning what the answers mean. (Canvas space, not
//! unit space: the unit gradient box is not canvas-scaled, so a
//! screen-px threshold only has a fixed meaning once projected.)

use super::frame::{Frame, FramePoint};

/// Frame-handle grab radius, screen px.
pub const HANDLE_HIT_PX: f32 = 7.0;
/// Stop-chip grab radius, screen px (about the chip's half-size).
pub const STOP_HIT_PX: f32 = 12.0;
/// Track grab band for stop insertion + the hover-preview chip, screen
/// px — a touch generous so the preview shows readily along the track.
pub const TRACK_HIT_PX: f32 = 11.0;

/// One interactive control of the gradient chrome. At most one is
/// hovered.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Control {
    /// A frame handle (origin / primary / secondary).
    Frame(FramePoint),
    /// A color-stop knob, by index.
    Stop(usize),
    /// The ramp track at a parametric offset — a stop-insertion
    /// candidate.
    Track(f32),
}

fn dist_sq(a: [f32; 2], b: [f32; 2]) -> f32 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    dx * dx + dy * dy
}

fn nearest_within(points: &[[f32; 2]], cursor: [f32; 2], threshold: f32) -> Option<usize> {
    let t2 = threshold * threshold;
    points
        .iter()
        .enumerate()
        .map(|(i, p)| (i, dist_sq(*p, cursor)))
        .filter(|(_, d)| *d <= t2)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(i, _)| i)
}

/// Resolve the hovered control by priority: frame handles ≻ stops ≻
/// track. `frame` and `stops` are in **canvas** space; `track` is the
/// projected insertion candidate `(offset, canvas point)`, or `None`
/// when the cursor is off the ramp. Thresholds are screen px ÷ `zoom`.
pub fn hover(
    frame: &Frame,
    stops: &[[f32; 2]],
    track: Option<(f32, [f32; 2])>,
    cursor: [f32; 2],
    zoom: f32,
) -> Option<Control> {
    // Frame handles first — they draw on top of everything.
    let ht = HANDLE_HIT_PX / zoom;
    let handles = [
        (FramePoint::Origin, Some(frame.origin)),
        (FramePoint::Primary, Some(frame.primary)),
        (FramePoint::Secondary, frame.secondary),
    ];
    let handle = handles
        .iter()
        .filter_map(|(fp, p)| p.map(|p| (*fp, dist_sq(p, cursor))))
        .filter(|(_, d)| *d <= ht * ht)
        .min_by(|a, b| a.1.total_cmp(&b.1));
    if let Some((fp, _)) = handle {
        return Some(Control::Frame(fp));
    }

    // Then the stops.
    if let Some(i) = nearest_within(stops, cursor, STOP_HIT_PX / zoom) {
        return Some(Control::Stop(i));
    }

    // Then the track (an insertion candidate the session projected).
    if let Some((offset, p)) = track
        && dist_sq(p, cursor) <= (TRACK_HIT_PX / zoom).powi(2)
    {
        return Some(Control::Track(offset));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame() -> Frame {
        Frame {
            origin: [0.0, 0.0],
            primary: [100.0, 0.0],
            secondary: Some([0.0, 50.0]),
        }
    }

    #[test]
    fn handles_win_over_stops_and_track() {
        // Cursor on the origin handle, with a stop and a track candidate
        // also nearby: the handle wins (drawn on top).
        let hit = hover(
            &frame(),
            &[[1.0, 1.0]],
            Some((0.0, [0.0, 0.0])),
            [0.0, 0.0],
            1.0,
        );
        assert_eq!(hit, Some(Control::Frame(FramePoint::Origin)));
    }

    #[test]
    fn stop_wins_over_track() {
        let hit = hover(
            &frame(),
            &[[50.0, 0.0]],
            Some((0.5, [50.0, 0.0])),
            [50.0, 1.0],
            1.0,
        );
        assert_eq!(hit, Some(Control::Stop(0)));
    }

    #[test]
    fn track_when_only_the_ramp_is_near() {
        let hit = hover(&frame(), &[], Some((0.5, [50.0, 0.0])), [50.0, 2.0], 1.0);
        assert_eq!(hit, Some(Control::Track(0.5)));
    }

    #[test]
    fn nothing_when_all_far() {
        assert_eq!(
            hover(&frame(), &[[50.0, 0.0]], None, [50.0, 400.0], 1.0),
            None
        );
    }

    #[test]
    fn thresholds_are_zoom_invariant() {
        // 8 canvas units off a stop: hit at zoom 1 (8 < 9 px), miss at
        // zoom 4 (32 > 9 px).
        assert_eq!(
            hover(&frame(), &[[50.0, 0.0]], None, [50.0, 8.0], 1.0),
            Some(Control::Stop(0))
        );
        assert_eq!(
            hover(&frame(), &[[50.0, 0.0]], None, [50.0, 8.0], 4.0),
            None
        );
    }
}
