//! Shared helpers for the conformance-derived suites.

use anchor_lab::math::RectF;
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, Resolved, ResolveOptions, RotationInFlow};

pub const EPS: f32 = 1e-3; // N-3 within-platform tolerance for the lab

pub fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::AabbParticipates,
    }
}

pub fn opts_visual() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

pub fn run(doc: &Document) -> Resolved {
    resolve(doc, &opts())
}

pub fn assert_close(a: f32, b: f32, msg: &str) {
    assert!(
        (a - b).abs() < EPS,
        "{msg}: {a} vs {b} (Δ={})",
        (a - b).abs()
    );
}

pub fn assert_rect(r: RectF, x: f32, y: f32, w: f32, h: f32, msg: &str) {
    assert_close(r.x, x, &format!("{msg}.x"));
    assert_close(r.y, y, &format!("{msg}.y"));
    assert_close(r.w, w, &format!("{msg}.w"));
    assert_close(r.h, h, &format!("{msg}.h"));
}

pub fn shape(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

pub fn frame_free(w: SizeIntent, h: SizeIntent) -> (Header, Payload) {
    (
        Header::new(w, h),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    )
}

pub fn frame_flex(
    w: SizeIntent,
    h: SizeIntent,
    direction: Direction,
    gap: f32,
    padding: f32,
) -> (Header, Payload) {
    (
        Header::new(w, h),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction,
                gap_main: gap,
                padding: EdgeInsets::all(padding),
                ..Default::default()
            },
            clips_content: false,
        },
    )
}
