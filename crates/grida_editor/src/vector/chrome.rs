//! Vector edit-mode chrome — the pure draw-list build
//! (`vector-edit.md` "Chrome and hover").
//!
//! A pure function from the mode's visible state to [`HudDraw`] prims
//! in **canvas** space (the host projects and paints, exactly like the
//! document HUD's chrome). The inventory: segment bodies, vertex dots
//! by state, tangent knobs with hairline connectors under the
//! neighbourhood rule, the projected insertion point, and the pen's
//! rubber-band preview — an honest render of the segment a click
//! would create.
//!
//! Deferred, named: region fills (regions are derived content — their
//! chrome joins with region derivation) and the lasso outline (the
//! lasso tool is deferred).

use grida::vectornetwork::VectorNetwork;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use crate::hud::{HudDraw, HudPrim, Role};

use super::hit::{Control, TangentRef};
use super::mode::VectorMode;
use super::ops;

/// The node's world transform (local space → canvas space), through
/// which the chrome projects. Wraps a full affine so a nested node's
/// entire ancestor chain — translation, rotation *and* scale — is
/// honoured, not just the node's own position/rotation. For a
/// top-level node it is exactly the node's own transform, so this is a
/// strict generalization ([`crate::editor::Editor::node_world_transform`]
/// is the host's source).
#[derive(Debug, Clone, Copy)]
pub struct NodeFrame(pub AffineTransform);

impl Default for NodeFrame {
    fn default() -> Self {
        Self(AffineTransform::identity())
    }
}

impl From<AffineTransform> for NodeFrame {
    fn from(t: AffineTransform) -> Self {
        Self(t)
    }
}

impl NodeFrame {
    /// Project a node-local point into canvas space (full affine —
    /// translation included).
    fn to_canvas(self, p: (f32, f32)) -> [f32; 2] {
        let m = self.0.matrix;
        [
            m[0][0] * p.0 + m[0][1] * p.1 + m[0][2],
            m[1][0] * p.0 + m[1][1] * p.1 + m[1][2],
        ]
    }

    /// Project a node-local direction (a tangent) into canvas space —
    /// the linear part only; directions do not translate.
    fn dir_to_canvas(self, t: (f32, f32)) -> [f32; 2] {
        let m = self.0.matrix;
        [m[0][0] * t.0 + m[0][1] * t.1, m[1][0] * t.0 + m[1][1] * t.1]
    }
}

/// Build one frame of vector-mode chrome from the machine's visible
/// state and the live network.
pub fn build(mode: &VectorMode, net: &VectorNetwork, frame: NodeFrame) -> HudDraw {
    let mut draw = HudDraw::default();
    let sel = mode.selection();
    let hover = mode.hovered();

    // Segment bodies.
    for (i, _) in net.segments.iter().enumerate() {
        let Some(cubic) = ops::segment_cubic(net, i) else {
            continue;
        };
        let role = if sel.segments.contains(&i) {
            Role::VectorSelected
        } else if hover == Some(Control::Segment(i)) {
            Role::VectorHover
        } else {
            Role::VectorIdle
        };
        draw.prims.push(HudPrim::Curve {
            a: frame.to_canvas((cubic.a[0], cubic.a[1])),
            b: frame.to_canvas((cubic.b[0], cubic.b[1])),
            ta: frame.dir_to_canvas((cubic.ta[0], cubic.ta[1])),
            tb: frame.dir_to_canvas((cubic.tb[0], cubic.tb[1])),
            dashed: false,
            role,
        });
    }

    // Tangent knobs + hairline connectors (the neighbourhood rule
    // lives in `visible_tangents`; zero tangents never appear).
    for tref in mode.visible_tangents(net) {
        let (Some(vertex), Some(knob)) = (tref.vertex(net), tref.position(net)) else {
            continue;
        };
        let Some(vpos) = net.vertices.get(vertex).copied() else {
            continue;
        };
        let selected = sel.tangents.contains(&(tref.segment, tref.end));
        let hovered = hover == Some(Control::Tangent(tref));
        draw.prims.push(HudPrim::Line {
            a: frame.to_canvas(vpos),
            b: frame.to_canvas(knob),
            dashed: false,
            role: Role::VectorTangent,
        });
        draw.prims.push(HudPrim::Dot {
            anchor: frame.to_canvas(knob),
            role: if selected {
                Role::VectorSelected
            } else if hovered {
                Role::VectorHover
            } else {
                Role::VectorTangent
            },
        });
    }

    // Vertex dots (on top of segments and connectors).
    for (i, v) in net.vertices.iter().enumerate() {
        let role = if sel.vertices.contains(&i) {
            Role::VectorSelected
        } else if hover == Some(Control::Vertex(i)) {
            Role::VectorHover
        } else {
            Role::VectorIdle
        };
        draw.prims.push(HudPrim::Dot {
            anchor: frame.to_canvas(*v),
            role,
        });
    }

    // The projected insertion point — present only while its segment
    // is hovered (VEC-12).
    if let Some(p) = mode.projection() {
        draw.prims.push(HudPrim::Dot {
            anchor: frame.to_canvas(p),
            role: Role::VectorPreview,
        });
    }

    // The marquee's sweep rect — the same prim the document HUD's
    // marquee paints with. The corners are stored node-local;
    // projecting them back through the frame reproduces the pointer's
    // canvas points exactly (the press mapping's inverse), so the rect
    // is the true drag rect under any node rotation.
    if let Some((origin, last)) = mode.marquee() {
        draw.prims.push(HudPrim::Region {
            rect: Rectangle::from_points(&[frame.to_canvas(origin), frame.to_canvas(last)]),
            role: Role::Marquee,
        });
    }

    // The pen's rubber band: origin → snapped cursor, departing with
    // the pending tangent — the segment a click would create.
    if let (Some((origin, tangent)), Some(cursor)) = (mode.pen_preview(), mode.cursor())
        && let Some(a) = net.vertices.get(origin).copied()
    {
        draw.prims.push(HudPrim::Curve {
            a: frame.to_canvas(a),
            b: frame.to_canvas(cursor),
            ta: frame.dir_to_canvas(tangent),
            tb: [0.0, 0.0],
            dashed: true,
            role: Role::VectorPreview,
        });
    }

    draw
}

/// The tangents currently visible — re-exported shape for hosts that
/// need the knob list itself (hit parity with the chrome).
pub fn visible_tangents(mode: &VectorMode, net: &VectorNetwork) -> Vec<TangentRef> {
    mode.visible_tangents(net)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Mutation, WorkingCopy, polyline_network};
    use crate::editor::{Editor, Recording};
    use crate::history::Origin;
    use crate::vector::mode::{VecMods, VectorTool};

    fn editor_with_vector() -> Editor {
        let mut editor = Editor::new(WorkingCopy::new_empty("test"));
        editor
            .dispatch(
                vec![Mutation::Insert {
                    parent: None,
                    index: 0,
                    fragment: Box::new(crate::tool::vector_fragment(
                        "v".to_string(),
                        "V",
                        [0.0, 0.0],
                        polyline_network(&[(0.0, 0.0), (100.0, 0.0)]),
                    )),
                }],
                Origin::Local,
                Recording::Record { label: None },
            )
            .unwrap();
        editor
    }

    fn count_role(draw: &HudDraw, role: Role) -> usize {
        draw.prims
            .iter()
            .filter(|p| match p {
                HudPrim::Curve { role: r, .. }
                | HudPrim::Dot { anchor: _, role: r }
                | HudPrim::Line { role: r, .. } => *r == role,
                _ => false,
            })
            .count()
    }

    fn dot_anchors(draw: &HudDraw) -> Vec<[f32; 2]> {
        draw.prims
            .iter()
            .filter_map(|p| match p {
                HudPrim::Dot { anchor, .. } => Some(*anchor),
                _ => None,
            })
            .collect()
    }

    fn has_point(dots: &[[f32; 2]], p: [f32; 2]) -> bool {
        dots.iter()
            .any(|d| (d[0] - p[0]).abs() < 1e-3 && (d[1] - p[1]).abs() < 1e-3)
    }

    /// The nesting bug's forward half: chrome projects node-local
    /// geometry through the node's *world* frame, so a nested node's
    /// vertices land at the composed canvas position — not the
    /// node-local origin. The full affine also carries an ancestor's
    /// scale, which the old position+rotation frame could not express.
    #[test]
    fn frame_projects_chrome_through_full_world_affine() {
        let editor = editor_with_vector();
        let mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
        let net = editor.node_vector_network(&"v".to_string()).unwrap();
        // Polyline vertices are node-local (0,0) and (100,0).

        // Identity frame — a top-level node: vertices at local coords
        // (the pre-fix behaviour, preserved).
        let top = dot_anchors(&build(&mode, &net, NodeFrame::default()));
        assert!(has_point(&top, [0.0, 0.0]) && has_point(&top, [100.0, 0.0]));

        // A translated parent frame at (300, 200): vertices ride it.
        let nested = dot_anchors(&build(
            &mode,
            &net,
            NodeFrame::from(AffineTransform::new(300.0, 200.0, 0.0)),
        ));
        assert!(
            has_point(&nested, [300.0, 200.0]) && has_point(&nested, [400.0, 200.0]),
            "nested chrome must ride the ancestor translation"
        );

        // A scaled *and* translated ancestor (2×, then +(300,200)):
        // (100,0) → (2·100+300, 200) = (500, 200). Only a full affine
        // reaches this — the old frame dropped scale entirely.
        let scaled = dot_anchors(&build(
            &mode,
            &net,
            NodeFrame::from(AffineTransform::from_acebdf(
                2.0, 0.0, 300.0, 0.0, 2.0, 200.0,
            )),
        ));
        assert!(
            has_point(&scaled, [300.0, 200.0]) && has_point(&scaled, [500.0, 200.0]),
            "nested chrome must honour ancestor scale"
        );
    }

    #[test]
    fn build_is_deterministic_and_state_pure() {
        let mut editor = editor_with_vector();
        let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
        mode.pointer_move(&mut editor, [2.0, 1.0], [2.0, 1.0], 1.0, VecMods::default());
        let net = editor.node_vector_network(&"v".to_string()).unwrap();
        let a = build(&mode, &net, NodeFrame::default());
        let b = build(&mode, &net, NodeFrame::default());
        assert_eq!(a, b);
        // Hovered vertex renders as the one hover-role dot.
        assert_eq!(count_role(&a, Role::VectorHover), 1);
    }

    #[test]
    fn vec_12_projection_chrome_only_while_segment_hovered() {
        let mut editor = editor_with_vector();
        let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
        let net = editor.node_vector_network(&"v".to_string()).unwrap();

        // Hovering the segment body: exactly one preview dot.
        mode.pointer_move(
            &mut editor,
            [50.0, 4.0],
            [50.0, 4.0],
            1.0,
            VecMods::default(),
        );
        let draw = build(&mode, &net, NodeFrame::default());
        assert_eq!(count_role(&draw, Role::VectorPreview), 1);

        // Away from everything: no preview chrome.
        mode.pointer_move(
            &mut editor,
            [50.0, 60.0],
            [50.0, 60.0],
            1.0,
            VecMods::default(),
        );
        let draw = build(&mode, &net, NodeFrame::default());
        assert_eq!(count_role(&draw, Role::VectorPreview), 0);
    }

    #[test]
    fn rubber_band_present_iff_projecting() {
        let mut editor = editor_with_vector();
        let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
        mode.set_tool(VectorTool::Pen);
        // Adopt the open end, then move: the rubber band renders.
        mode.pointer_down(
            &mut editor,
            [100.0, 0.0],
            [100.0, 0.0],
            1.0,
            0,
            VecMods::default(),
        );
        mode.pointer_up(&mut editor, [100.0, 0.0]);
        mode.pointer_move(
            &mut editor,
            [160.0, 40.0],
            [160.0, 40.0],
            1.0,
            VecMods::default(),
        );
        let net = editor.node_vector_network(&"v".to_string()).unwrap();
        let draw = build(&mode, &net, NodeFrame::default());
        let bands = draw
            .prims
            .iter()
            .filter(|p| matches!(p, HudPrim::Curve { dashed: true, .. }))
            .count();
        assert_eq!(bands, 1);

        // Disconnect: the rubber band vanishes (VEC-4's visible half).
        mode.escape(&mut editor);
        let draw = build(&mode, &net, NodeFrame::default());
        assert!(
            !draw
                .prims
                .iter()
                .any(|p| matches!(p, HudPrim::Curve { dashed: true, .. }))
        );
    }

    #[test]
    fn marquee_rect_renders_while_sweeping() {
        let mut editor = editor_with_vector();
        let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();
        // Press on empty space, sweep past the drag threshold.
        mode.pointer_down(
            &mut editor,
            [40.0, 40.0],
            [40.0, 40.0],
            1.0,
            0,
            VecMods::default(),
        );
        mode.pointer_move(
            &mut editor,
            [90.0, 90.0],
            [90.0, 90.0],
            1.0,
            VecMods::default(),
        );
        let net = editor.node_vector_network(&"v".to_string()).unwrap();
        let draw = build(&mode, &net, NodeFrame::default());
        let rect = draw.prims.iter().find_map(|p| match p {
            HudPrim::Region {
                rect,
                role: Role::Marquee,
            } => Some(*rect),
            _ => None,
        });
        let rect = rect.expect("sweeping marquee renders its rect");
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (40.0, 40.0, 50.0, 50.0)
        );

        // Release: the rect vanishes with the gesture.
        mode.pointer_up(&mut editor, [90.0, 90.0]);
        let draw = build(&mode, &net, NodeFrame::default());
        assert!(
            !draw
                .prims
                .iter()
                .any(|p| matches!(p, HudPrim::Region { .. }))
        );
    }

    #[test]
    fn neighbourhood_rule_gates_knobs() {
        let mut editor = editor_with_vector();
        // Give the segment a tangent so a knob could exist.
        let mut net = editor.node_vector_network(&"v".to_string()).unwrap();
        net.segments[0].ta = (10.0, 20.0);
        editor
            .dispatch(
                vec![Mutation::Patch {
                    id: "v".to_string(),
                    set: Box::new(crate::document::PropPatch {
                        vector_network: Some(net.clone()),
                        ..Default::default()
                    }),
                }],
                Origin::Local,
                Recording::Record { label: None },
            )
            .unwrap();
        let mut mode = VectorMode::enter(&editor, "v".to_string()).unwrap();

        // Nothing selected: no knobs, no connectors.
        let draw = build(&mode, &net, NodeFrame::default());
        assert_eq!(count_role(&draw, Role::VectorTangent), 0);

        // Select the vertex: its knob (and connector) appear.
        mode.pointer_down(
            &mut editor,
            [0.0, 0.0],
            [0.0, 0.0],
            1.0,
            0,
            VecMods::default(),
        );
        mode.pointer_up(&mut editor, [0.0, 0.0]);
        let draw = build(&mode, &net, NodeFrame::default());
        assert_eq!(
            count_role(&draw, Role::VectorTangent),
            2,
            "knob + connector"
        );
    }
}
