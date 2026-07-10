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
    b.node_mut(artboard).fills = Paints::solid("#FFFFFF".into());

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
    b.node_mut(row).fills = Paints::solid("#F1F3F5".into());
    let a1 = b.add(row, named(card(70.0, 110.0), "card.a"), rect());
    b.node_mut(a1).fills = Paints::solid("#4A90D9".into());
    let mut rot = named(card(70.0, 110.0), "card.rot");
    rot.rotation = 20.0;
    let a2 = b.add(row, rot, rect());
    b.node_mut(a2).fills = Paints::solid("#E2574C".into());
    let a3 = b.add(
        row,
        named(Header::new(SizeIntent::Auto, SizeIntent::Auto), "label"),
        Payload::Text {
            content: "revenue".into(),
            font_size: 18.0,
        },
    );
    b.node_mut(a3).fills = Paints::solid("#171A1F".into());
    let mut grow = named(card(70.0, 110.0), "card.grow");
    grow.grow = 1.0;
    let a4 = b.add(row, grow, rect());
    b.node_mut(a4).fills = Paints::solid("#57B894".into());

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
    b.node_mut(hug).fills = Paints::solid("#F1F3F5".into());
    let h1 = b.add(hug, named(card(60.0, 90.0), "hug.a"), rect());
    b.node_mut(h1).fills = Paints::solid("#8B7BD8".into());
    let mut h2h = named(card(60.0, 90.0), "hug.rot");
    h2h.rotation = 30.0;
    let h2 = b.add(hug, h2h, rect());
    b.node_mut(h2).fills = Paints::solid("#E2A23F".into());

    // End-pinned badge: tracks the artboard's right edge with 0 writes.
    let mut badge = named(card(84.0, 48.0), "badge");
    badge.x = AxisBinding::end(32.0);
    badge.y = AxisBinding::start(32.0);
    let bd = b.add(artboard, badge, rect());
    b.node_mut(bd).fills = Paints::solid("#57B894".into());

    // Span bar: stretches with the artboard, x is owned by the Span
    // (dragging it sideways is a TYPED error, visible in the log).
    let mut bar = named(
        Header::new(SizeIntent::Auto, SizeIntent::Fixed(16.0)),
        "bar",
    );
    bar.x = AxisBinding::Span {
        start: 32.0,
        end: 32.0,
    };
    bar.y = AxisBinding::end(24.0);
    let br = b.add(artboard, bar, rect());
    b.node_mut(br).fills = Paints::solid("#E2A23F".into());

    // Group: transparent-select, origin pivot, 3-write center-feel rotate.
    let grp = b.add(
        artboard,
        named(
            at(
                Header::new(SizeIntent::Auto, SizeIntent::Auto),
                620.0,
                240.0,
            ),
            "chips",
        ),
        Payload::Group,
    );
    let g1 = b.add(grp, named(card(56.0, 36.0), "chip.a"), rect());
    b.node_mut(g1).fills = Paints::solid("#8B7BD8".into());
    let g2 = b.add(
        grp,
        named(at(card(56.0, 36.0), 26.0, 46.0), "chip.b"),
        rect(),
    );
    b.node_mut(g2).fills = Paints::solid("#E2574C".into());

    // Lens: the paint lane — rotates visually, layout-transparent.
    let lens = b.add(
        artboard,
        named(
            at(
                Header::new(SizeIntent::Auto, SizeIntent::Auto),
                620.0,
                380.0,
            ),
            "lens",
        ),
        Payload::Lens {
            ops: vec![LensOp::Rotate { deg: 25.0 }],
        },
    );
    let l1 = b.add(lens, named(card(80.0, 80.0), "lens.child"), rect());
    b.node_mut(l1).fills = Paints::solid("#4A90D9".into());

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
    b.node_mut(t).fills = Paints::solid("#171A1F".into());

    (b.build(), artboard)
}

// ── the stress scene: one realistic card, loop-placed into a grid ──────────
//
// A "real-world-ish" document for feeling perf on the live spike (and for the
// `--bench` headless numbers): a content card with genuine nesting depth and
// flex layout, tiled across a large board so the content extends well past the
// viewport (a true pan/zoom test). `starter()` stays the golden scene; this is
// selected only for the live window via `ANCHOR_SCENE` (see `from_env`).

const PAGE_W: f32 = 240.0;
const PAGE_H: f32 = 320.0;
/// Page content width = PAGE_W − 2·padding; the inner rows/blocks are sized to
/// it explicitly (deterministic — no reliance on cross-axis stretch).
const PAGE_INNER_W: f32 = PAGE_W - 24.0;
const PAGE_GAP: f32 = 40.0;
const BOARD_MARGIN: f32 = 40.0;

const PALETTE: [&str; 6] = [
    "#4A90D9", "#E2574C", "#57B894", "#8B7BD8", "#E2A23F", "#43B7C6",
];

fn flex_row(main: MainAlign, gap: f32) -> Payload {
    Payload::Frame {
        layout: LayoutBehavior {
            mode: LayoutMode::Flex,
            direction: Direction::Row,
            main_align: main,
            cross_align: CrossAlign::Center,
            gap_main: gap,
            ..Default::default()
        },
        clips_content: false,
    }
}

/// One card: a flex-column frame holding a header row (avatar · title · menu),
/// a hero block, three body lines, a flex footer (two buttons), and an
/// absolutely-pinned rotated "NEW" badge (DEC-0 visual-only paint). ~13 nodes,
/// nested to the header's avatar/title (page → header → children).
fn page(b: &mut DocBuilder, parent: NodeId, x: f32, y: f32, i: usize) -> NodeId {
    let accent = PALETTE[i % PALETTE.len()];

    let page = b.add(
        parent,
        at(named(card(PAGE_W, PAGE_H), &format!("page.{i}")), x, y),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction: Direction::Column,
                gap_main: 10.0,
                padding: EdgeInsets::all(12.0),
                ..Default::default()
            },
            clips_content: false,
        },
    );
    b.node_mut(page).fills = Paints::solid("#FFFFFF".into());

    // header row: avatar (ellipse) · title (text) · menu (rect), space-between.
    let header = b.add(
        page,
        named(card(PAGE_INNER_W, 36.0), "hdr"),
        flex_row(MainAlign::SpaceBetween, 8.0),
    );
    let avatar = b.add(
        header,
        card(32.0, 32.0),
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        },
    );
    b.node_mut(avatar).fills = Paints::solid(accent.into());
    let title = b.add(
        header,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: format!("Project {i}"),
            font_size: 15.0,
        },
    );
    b.node_mut(title).fills = Paints::solid("#171A1F".into());
    let menu = b.add(header, card(20.0, 20.0), rect());
    b.node_mut(menu).fills = Paints::solid("#CED4DA".into());

    // hero block (image placeholder).
    let hero = b.add(page, card(PAGE_INNER_W, 110.0), rect());
    b.node_mut(hero).fills = Paints::solid(accent.into());

    // three body lines (the last one short, left-set — a text paragraph feel).
    for k in 0..3 {
        let w = if k == 2 { 120.0 } else { PAGE_INNER_W };
        let line = b.add(page, card(w, 10.0), rect());
        b.node_mut(line).fills = Paints::solid("#E9ECEF".into());
    }

    // footer: two buttons pushed to the edges.
    let footer = b.add(
        page,
        named(card(PAGE_INNER_W, 30.0), "ftr"),
        flex_row(MainAlign::SpaceBetween, 8.0),
    );
    let b1 = b.add(footer, card(70.0, 28.0), rect());
    b.node_mut(b1).fills = Paints::solid("#F1F3F5".into());
    let b2 = b.add(footer, card(70.0, 28.0), rect());
    b.node_mut(b2).fills = Paints::solid(accent.into());

    // rotated "NEW" badge, absolutely pinned to the top-right corner. Out of
    // flex flow, end-pinned, visually rotated — exercises the paint transform.
    let mut badge = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    badge.flow = Flow::Absolute;
    badge.x = AxisBinding::end(10.0);
    badge.y = AxisBinding::start(10.0);
    badge.rotation = -12.0;
    let bg = b.add(
        page,
        badge,
        Payload::Text {
            content: "NEW".into(),
            font_size: 12.0,
        },
    );
    b.node_mut(bg).fills = Paints::solid("#E2574C".into());

    page
}

/// A `cols × rows` grid of [`page`] cards on one board frame. ~13 nodes/card,
/// e.g. 10×10 = 100 cards ≈ 1.3k nodes on a ~2840×3640 board.
pub fn pages(cols: usize, rows: usize) -> (Document, NodeId) {
    let (cols, rows) = (cols.max(1), rows.max(1));
    let mut b = DocBuilder::new();

    let grid_w = cols as f32 * PAGE_W + (cols - 1) as f32 * PAGE_GAP;
    let grid_h = rows as f32 * PAGE_H + (rows - 1) as f32 * PAGE_GAP;
    let board = b.add(
        0,
        at(
            named(
                card(grid_w + 2.0 * BOARD_MARGIN, grid_h + 2.0 * BOARD_MARGIN),
                ARTBOARD,
            ),
            60.0,
            60.0,
        ),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    b.node_mut(board).fills = Paints::solid("#F7F8F9".into());

    for i in 0..(cols * rows) {
        let (col, row) = (i % cols, i / cols);
        let x = BOARD_MARGIN + col as f32 * (PAGE_W + PAGE_GAP);
        let y = BOARD_MARGIN + row as f32 * (PAGE_H + PAGE_GAP);
        page(&mut b, board, x, y, i);
    }

    (b.build(), board)
}

#[cfg(test)]
mod tests {
    use super::{pages, starter};

    #[test]
    fn live_scenes_remain_editable_in_the_historical_panel_ir() {
        for (doc, _) in [starter(), pages(1, 1)] {
            anchor_lab::textir::try_print(&doc).expect("live scene must remain TextIr-compatible");
        }
    }
}

/// The live-window scene, selected by `ANCHOR_SCENE` (the `--shot` goldens
/// always use `starter`, so they are unaffected):
///   • unset / `starter` → the feel scene
///   • `pages`           → 100 cards (10×10)
///   • `pages:N`         → ~N cards (squared into a grid)
///   • `pages:CxR`       → an explicit `C×R` grid
pub fn from_env() -> (Document, NodeId) {
    let spec = std::env::var("ANCHOR_SCENE").unwrap_or_default();
    if spec == "pages" || spec.starts_with("pages:") {
        let (cols, rows) = parse_grid(spec.strip_prefix("pages").unwrap_or(""));
        let doc = pages(cols, rows);
        eprintln!(
            "scene: pages {cols}×{rows} = {} cards, {} nodes",
            cols * rows,
            doc.0.len()
        );
        doc
    } else {
        starter()
    }
}

/// Parse the tail after `pages`: "" → 10×10; ":N" → squared grid; ":CxR".
fn parse_grid(tail: &str) -> (usize, usize) {
    let tail = tail.trim_start_matches(':');
    if tail.is_empty() {
        return (10, 10);
    }
    if let Some((c, r)) = tail.split_once('x') {
        if let (Ok(c), Ok(r)) = (c.parse::<usize>(), r.parse::<usize>()) {
            return (c, r);
        }
    }
    if let Ok(n) = tail.parse::<usize>() {
        let cols = (n as f32).sqrt().ceil() as usize;
        return (cols.max(1), n.div_ceil(cols.max(1)));
    }
    (10, 10)
}
