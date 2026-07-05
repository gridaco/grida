//! The toolbar strip — tool activation UI (`docs/wg/canvas/tool.md`).
//!
//! Contains no tool logic (`ARCH-3` spirit): it renders one button per
//! tool with the active one highlighted, and [`ToolbarPanel::handle`]
//! drains button clicks into a [`Tool`] for the shell to activate on
//! the machine. Keyboard shortcuts live in the shell's key routing —
//! the toolbar is just the visible face.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;

use crate::tool::{ShapeKind, Tool};
use crate::ui::UiLayer;
use crate::ui::widget::{BuildCtx, Widget, WidgetId, WidgetState};
use crate::ui::widgets::Button;

/// One toolbar item: the tool, its button id, its label — the tool's
/// shortcut, single-glyph, so the strip stays compact enough to sit
/// bottom-centered.
const ITEMS: [(Tool, &str, &str); 10] = [
    (Tool::Cursor, "toolbar.cursor", "V"),
    (Tool::Shape(ShapeKind::Rectangle), "toolbar.rect", "R"),
    (Tool::Shape(ShapeKind::Ellipse), "toolbar.ellipse", "O"),
    (Tool::Shape(ShapeKind::Polygon), "toolbar.polygon", "Y"),
    (Tool::Container { tray: false }, "toolbar.container", "F"),
    (Tool::Container { tray: true }, "toolbar.tray", "⇧F"),
    (Tool::Text, "toolbar.text", "T"),
    (Tool::Line { arrow: false }, "toolbar.line", "L"),
    (Tool::Line { arrow: true }, "toolbar.arrow", "⇧L"),
    (Tool::Pencil, "toolbar.pencil", "⇧P"),
];

const BUTTON_W: f32 = 28.0;
const BUTTON_H: f32 = 22.0;
const GAP: f32 = 4.0;
const PADDING: f32 = 5.0;

/// The horizontal strip container widget.
struct Strip {
    id: WidgetId,
    origin: (f32, f32),
    children: Vec<Box<dyn Widget>>,
}

impl Widget for Strip {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut strip = nf.create_container_node();
        strip.position = LayoutPositioningBasis::Cartesian(CGPoint {
            x: self.origin.0,
            y: self.origin.1,
        });
        strip.layout_container = LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_gap: Some(LayoutGap::uniform(GAP)),
            layout_padding: Some(EdgeInsets::all(PADDING)),
            ..Default::default()
        };
        let width = ITEMS.len() as f32 * BUTTON_W + (ITEMS.len() - 1) as f32 * GAP + 2.0 * PADDING;
        strip.layout_dimensions.layout_target_width = Some(width);
        strip.layout_dimensions.layout_target_height = Some(BUTTON_H + 2.0 * PADDING);
        strip.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            250, 250, 250, 255,
        )))]);
        strip.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            220, 220, 220, 255,
        )))]);
        strip.stroke_width = StrokeWidth::Uniform(1.0);
        strip.corner_radius = RectangularCornerRadius::circular(4.0);
        let node = ctx.graph.append_child(Node::Container(strip), parent);
        // Interactive so pointer input over the strip never falls
        // through to the canvas (UI-5).
        ctx.register(&self.id, node, false, true);
        for child in &self.children {
            child.build(ctx, Parent::NodeId(node));
        }
        node
    }

    fn children(&self) -> &[Box<dyn Widget>] {
        &self.children
    }

    fn children_mut(&mut self) -> Option<&mut Vec<Box<dyn Widget>>> {
        Some(&mut self.children)
    }
}

/// The toolbar panel: mounts the strip, tracks the active tool, and
/// drains button clicks.
pub struct ToolbarPanel {
    /// Strip top-left, logical px.
    pub origin: (f32, f32),
    built_for: Option<Tool>,
}

impl ToolbarPanel {
    pub fn new(origin: (f32, f32)) -> Self {
        Self {
            origin,
            built_for: None,
        }
    }

    /// The strip's outer size, logical px — the shell derives the
    /// bottom-centered origin from it.
    pub fn size() -> (f32, f32) {
        (
            ITEMS.len() as f32 * BUTTON_W + (ITEMS.len() - 1) as f32 * GAP + 2.0 * PADDING,
            BUTTON_H + 2.0 * PADDING,
        )
    }

    /// Move the strip (viewport-derived placement); a change
    /// invalidates so the next [`sync`](Self::sync) rebuilds there.
    pub fn set_origin(&mut self, origin: (f32, f32)) {
        if self.origin != origin {
            self.origin = origin;
            self.built_for = None;
        }
    }

    /// Forget the built state; the next [`sync`](Self::sync) rebuilds.
    pub fn invalidate(&mut self) {
        self.built_for = None;
    }

    /// Reconcile the strip with the machine's active tool.
    pub fn sync(&mut self, ui: &mut UiLayer, active: Tool) {
        if self.built_for == Some(active) {
            return;
        }
        let children: Vec<Box<dyn Widget>> = ITEMS
            .iter()
            .map(|(tool, id, label)| {
                Box::new(Button {
                    id: (*id).to_string(),
                    label: (*label).to_string(),
                    active: *tool == active,
                    width: BUTTON_W,
                    height: BUTTON_H,
                    commit: None,
                }) as Box<dyn Widget>
            })
            .collect();
        ui.mount(vec![Box::new(Strip {
            id: "toolbar".to_string(),
            origin: self.origin,
            children,
        })]);
        self.built_for = Some(active);
    }

    /// Drain button clicks: the last clicked tool wins.
    pub fn handle(&mut self, ui: &mut UiLayer) -> Option<Tool> {
        let mut chosen = None;
        for (tool, id, _) in ITEMS {
            if let Some(WidgetState::Button(s)) = ui.state_mut(&id.to_string())
                && s.clicks > 0
            {
                s.clicks = 0;
                chosen = Some(tool);
            }
        }
        chosen
    }
}
