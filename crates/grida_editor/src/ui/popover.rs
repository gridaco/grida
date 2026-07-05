//! `popover` — the one anchored-overlay primitive (`WID-8`,
//! [widgets.md](../../../crates/grida_editor/docs/widgets.md)). Every floating
//! surface — the context menu, a select list, the color picker, a
//! detail sheet — is an instance of this shape, so placement, the
//! panel shell, and the grab convention live here once.
//!
//! - **Anchored placement** ([`place`]) is a pure function: the panel
//!   opens down-right of its anchor, *flips* across an axis when it
//!   would overflow the viewport, and *clamps* when neither side
//!   fits — the collision behavior the web's anchored layers
//!   converged on. A panel opening *beside* another (a submenu, a
//!   cascading list) uses [`place_beside`] with the same discipline.
//! - **The panel is its own top-level scene root** ([`build_panel`]):
//!   the painter flattens each scene root independently, so an
//!   overlay must be a root at a Cartesian origin — never a second
//!   absolute child of a flex parent, which the engine would not lay
//!   out. Content is appended into the returned node and flows.
//! - **Modality is the popup grab**: while open, the hosting widget
//!   holds its layer's pointer capture ([`crate::ui::UiLayer::set_capture`]),
//!   so every pointer event — including presses *outside* the panel —
//!   reaches the widget; nothing leaks to the canvas (`UI-5`).
//! - **Dismissal is one rule** ([`should_dismiss`]): a press dismisses
//!   the popover only when it lands **outside the panel *and* outside
//!   its trigger**. The trigger is part of the dismiss-safe region.
//!   This is the whole interaction model, and it unifies the two
//!   cases that otherwise diverge: a popover opened *at* the cursor
//!   (the context menu — trigger degenerates to the cursor, which is
//!   inside the panel it opened) and a popover opened *beside* a
//!   separate trigger (the color picker — trigger is the swatch). The
//!   second case is why the trigger must be excluded: the opening
//!   gesture grabs capture mid-gesture and its residual follow-through
//!   press lands on the trigger, *outside* the panel; excluding the
//!   trigger keeps that press from dismissing the popover it just
//!   opened, with no per-widget guard.
//!
//! The context menu ([`crate::ui::menu`]) is the first client and the
//! reference implementation; select / picker / detail overlays reuse
//! these functions rather than grow a second placement or shell.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use math2::rect::Rectangle;

use crate::ui::widget::BuildCtx;

/// The one dismissal rule for every popover (`WID-8`): a press
/// dismisses only when it lands **outside the `panel` and outside the
/// `trigger`**. The trigger is the widget that opened the popover — a
/// swatch, a menu-anchor point (`Rectangle::from_point`) — and is
/// part of the dismiss-safe region.
///
/// Excluding the trigger is what makes a popover opened *beside* its
/// opener behave like one opened *at* the cursor: the opening gesture
/// grabs capture mid-gesture and its residual follow-through press
/// lands on the trigger, outside the panel; without this exclusion
/// that press would dismiss the popover it just opened (and a
/// per-widget "just opened" guard would only paper over it, at the
/// cost of a second click to dismiss for real). With no trigger,
/// this is simply "outside the panel" — the case of a popover opened
/// at the cursor, where the cursor is already inside the panel.
pub fn should_dismiss(point: [f32; 2], panel: Rectangle, trigger: Option<Rectangle>) -> bool {
    if panel.contains_point(point) {
        return false;
    }
    !trigger.is_some_and(|t| t.contains_point(point))
}

/// Anchored placement, per axis: prefer down-right of the anchor,
/// flip to the other side on overflow, clamp when neither fits.
pub fn place(anchor: [f32; 2], size: [f32; 2], viewport: [f32; 2]) -> [f32; 2] {
    [
        place_axis(anchor[0], size[0], viewport[0]),
        place_axis(anchor[1], size[1], viewport[1]),
    ]
}

fn place_axis(anchor: f32, size: f32, viewport: f32) -> f32 {
    if anchor + size <= viewport {
        anchor
    } else if anchor - size >= 0.0 {
        anchor - size
    } else {
        (viewport - size).max(0.0)
    }
}

/// Place a panel *beside* a parent one: to the parent's right (using
/// its `parent_right` edge), flipping to `parent_left - size` on
/// overflow; vertically at `top`, clamped into the viewport. The
/// cascading-menu / nested-list placement.
pub fn place_beside(
    parent_left: f32,
    parent_right: f32,
    top: f32,
    size: [f32; 2],
    viewport: [f32; 2],
) -> [f32; 2] {
    let x = if parent_right + size[0] <= viewport[0] {
        parent_right
    } else {
        (parent_left - size[0]).max(0.0)
    };
    let y = top.min((viewport[1] - size[1]).max(0.0)).max(0.0);
    [x, y]
}

/// Build the standard popover panel shell at `origin` (world/logical
/// coords), sized `size`, as its **own top-level scene root**. The
/// root is enforced here — the panel is always appended to
/// [`Parent::Root`], never a caller-supplied parent — because a
/// popover nested under a flex/positioned ancestor would inherit that
/// ancestor's coordinate space and layout rules and render in the
/// wrong place (or not at all). This is why an *embeddable* trigger
/// (a swatch, a select in a panel row) can open a correctly-placed
/// popover regardless of where the trigger sits in the tree. Content
/// flows vertically inside `padding`; the caller appends children to
/// the returned node. The fixed overlay look (light fill, hairline
/// stroke, small radius) is shared by every popover.
pub fn build_panel(ctx: &mut BuildCtx, origin: [f32; 2], size: [f32; 2], padding: f32) -> NodeId {
    let nf = NodeFactory::new();
    let mut panel = nf.create_container_node();
    panel.position = LayoutPositioningBasis::Cartesian(CGPoint {
        x: origin[0],
        y: origin[1],
    });
    panel.layout_container = LayoutContainerStyle {
        layout_mode: LayoutMode::Flex,
        layout_direction: Axis::Vertical,
        layout_gap: Some(LayoutGap::uniform(0.0)),
        layout_padding: Some(EdgeInsets::all(padding)),
        ..Default::default()
    };
    panel.layout_dimensions.layout_target_width = Some(size[0]);
    panel.layout_dimensions.layout_target_height = Some(size[1]);
    panel.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
        250, 250, 250, 255,
    )))]);
    panel.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
        220, 220, 220, 255,
    )))]);
    panel.stroke_width = StrokeWidth::Uniform(1.0);
    panel.corner_radius = RectangularCornerRadius::circular(4.0);
    // A popover is a top-level overlay: append to Root so its
    // Cartesian `origin` is world space, independent of the trigger's
    // nesting. Passing the trigger's parent here (the earlier bug)
    // double-offset a nested select's list and it never appeared.
    ctx.graph.append_child(Node::Container(panel), Parent::Root)
}
