//! The starter document — one scene that exercises every mechanism the
//! feel checklist walks: a flex row with a rotated child (envelope live),
//! a hug frame, end/span pins, a group, a lens escape, and free text.

use anchor_lab::model::*;

pub const ARTBOARD: &str = "artboard";

/// Find a node by header name (the spike's stable handle across IR
/// round-trips — the IR does not carry ids).
pub fn find_named(doc: &Document, name: &str) -> Option<NodeId> {
    (0..doc.capacity() as u32).find(|id| {
        doc.get_opt(*id)
            .and_then(|n| n.header.name.as_deref())
            .map(|n| n == name)
            .unwrap_or(false)
    })
}

fn named(mut h: Header, name: &str) -> Header {
    h.name = Some(name.to_string());
    h
}

fn at(mut h: Header, x: f32, y: f32) -> Header {
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    h
}

fn card(w: f32, h: f32) -> Header {
    Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h))
}

fn rect() -> Payload {
    Payload::Shape {
        desc: ShapeDesc::Rect,
    }
}

pub fn starter() -> (Document, NodeId) {
    let mut b = DocBuilder::new();

    // The artboard: an ordinary fixed frame — resizing it is ordinary
    // writes on IT; its end/span-pinned children respond with ZERO
    // writes of their own.
    let mut ab = named(card(900.0, 640.0), ARTBOARD);
    ab = at(ab, 60.0, 60.0);
    let artboard = b.add(
        0,
        ab,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    b.node_mut(artboard).fill = Some("#FFFFFF".into());

    // Flex row: cards + a rotated card + a grow card. Under DEC-0
    // (visual-only) rotation is paint: the row does NOT reflow, fill
    // never fights rotation (V-1/V-2), overlap is correct behavior.
    let row = b.add(
        artboard,
        named(at(card(520.0, 150.0), 40.0, 40.0), "row"),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                gap_main: 10.0,
                padding: EdgeInsets::all(10.0),
                cross_align: CrossAlign::Center,
                ..Default::default()
            },
            clips_content: false,
        },
    );
    b.node_mut(row).fill = Some("#F1F3F5".into());
    let a1 = b.add(row, named(card(70.0, 110.0), "card.a"), rect());
    b.node_mut(a1).fill = Some("#4A90D9".into());
    let mut rot = named(card(70.0, 110.0), "card.rot");
    rot.rotation = 20.0;
    let a2 = b.add(row, rot, rect());
    b.node_mut(a2).fill = Some("#E2574C".into());
    let a3 = b.add(
        row,
        named(Header::new(SizeIntent::Auto, SizeIntent::Auto), "label"),
        Payload::Text {
            content: "revenue".into(),
            font_size: 18.0,
        },
    );
    b.node_mut(a3).fill = Some("#171A1F".into());
    let mut grow = named(card(70.0, 110.0), "card.grow");
    grow.grow = 1.0;
    let a4 = b.add(row, grow, rect());
    b.node_mut(a4).fill = Some("#57B894".into());

    // Hug frame: breathes when its rotated member turns.
    let hug = b.add(
        artboard,
        named(
            at(Header::new(SizeIntent::Auto, SizeIntent::Auto), 40.0, 240.0),
            "hug",
        ),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                gap_main: 10.0,
                padding: EdgeInsets::all(10.0),
                cross_align: CrossAlign::Center,
                ..Default::default()
            },
            clips_content: false,
        },
    );
    b.node_mut(hug).fill = Some("#F1F3F5".into());
    let h1 = b.add(hug, named(card(60.0, 90.0), "hug.a"), rect());
    b.node_mut(h1).fill = Some("#8B7BD8".into());
    let mut h2h = named(card(60.0, 90.0), "hug.rot");
    h2h.rotation = 30.0;
    let h2 = b.add(hug, h2h, rect());
    b.node_mut(h2).fill = Some("#E2A23F".into());

    // End-pinned badge: tracks the artboard's right edge with 0 writes.
    let mut badge = named(card(84.0, 48.0), "badge");
    badge.x = AxisBinding::end(32.0);
    badge.y = AxisBinding::start(32.0);
    let bd = b.add(artboard, badge, rect());
    b.node_mut(bd).fill = Some("#57B894".into());

    // Span bar: stretches with the artboard, x is owned by the Span
    // (dragging it sideways is a TYPED error, visible in the log).
    let mut bar = named(Header::new(SizeIntent::Auto, SizeIntent::Fixed(16.0)), "bar");
    bar.x = AxisBinding::Span {
        start: 32.0,
        end: 32.0,
    };
    bar.y = AxisBinding::end(24.0);
    let br = b.add(artboard, bar, rect());
    b.node_mut(br).fill = Some("#E2A23F".into());

    // Group: transparent-select, origin pivot, 3-write center-feel rotate.
    let grp = b.add(
        artboard,
        named(
            at(Header::new(SizeIntent::Auto, SizeIntent::Auto), 620.0, 240.0),
            "chips",
        ),
        Payload::Group,
    );
    let g1 = b.add(grp, named(card(56.0, 36.0), "chip.a"), rect());
    b.node_mut(g1).fill = Some("#8B7BD8".into());
    let g2 = b.add(grp, named(at(card(56.0, 36.0), 26.0, 46.0), "chip.b"), rect());
    b.node_mut(g2).fill = Some("#E2574C".into());

    // Lens: the paint lane — rotates visually, layout-transparent.
    let lens = b.add(
        artboard,
        named(
            at(Header::new(SizeIntent::Auto, SizeIntent::Auto), 620.0, 380.0),
            "lens",
        ),
        Payload::Lens {
            ops: vec![LensOp::Rotate { deg: 25.0 }],
        },
    );
    let l1 = b.add(lens, named(card(80.0, 80.0), "lens.child"), rect());
    b.node_mut(l1).fill = Some("#4A90D9".into());

    // Free text.
    let t = b.add(
        artboard,
        named(
            at(Header::new(SizeIntent::Auto, SizeIntent::Auto), 40.0, 560.0),
            "title",
        ),
        Payload::Text {
            content: "anchor spike — E10".into(),
            font_size: 24.0,
        },
    );
    b.node_mut(t).fill = Some("#171A1F".into());

    (b.build(), artboard)
}
