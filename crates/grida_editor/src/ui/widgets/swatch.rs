//! `swatch` — displays a solid fill color. Its activation is one of
//! two modes ([`SwatchAction`]): **open the color picker** (the
//! canonical form — the swatch is the picker's collapsed state, and
//! the host opens the picker popover on click), or **cycle a preset
//! palette** (a self-contained placeholder commit, one history entry
//! per click, kept for standalone use and the binding-contract tests).

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::{Binding, BindingPhase, BindingValue, Emission};
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};
use crate::ui::widgets::button::ButtonState;

/// The placeholder preset palette (cycle mode).
pub const PALETTE: [CGColor; 4] = [
    CGColor::from_u32(0xE65A46FF),
    CGColor::from_u32(0x5096E6FF),
    CGColor::from_u32(0x78C878FF),
    CGColor::from_u32(0x3C3C3CFF),
];

/// What activating a swatch does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwatchAction {
    /// Record the click in a [`ButtonState`] outbox for the host to
    /// drain (the panel opens the picker popover). No emission.
    OpenPicker,
    /// Cycle the preset palette as a self-contained placeholder
    /// commit (standalone use, contract tests).
    Cycle,
}

pub struct Swatch {
    pub id: WidgetId,
    /// The displayed paint (the bound node's current solid fill).
    pub color: CGColor,
    pub width: f32,
    pub height: f32,
    /// What a click does.
    pub action: SwatchAction,
    pub binding: Binding,
}

impl Swatch {
    fn next_color(&self) -> CGColor {
        let i = PALETTE.iter().position(|c| *c == self.color);
        match i {
            Some(i) => PALETTE[(i + 1) % PALETTE.len()],
            None => PALETTE[0],
        }
    }

    fn cycle(&self) -> UiResponse {
        let next = self.next_color();
        UiResponse {
            consumed: true,
            emissions: vec![
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Begin,
                },
                Emission {
                    binding: self.binding.clone(),
                    phase: BindingPhase::Commit(BindingValue::Color(next)),
                },
            ],
            capture: false,
            release: false,
            rebuild: false,
        }
    }
}

impl Widget for Swatch {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        match self.action {
            SwatchAction::OpenPicker => WidgetState::Button(ButtonState::default()),
            SwatchAction::Cycle => WidgetState::None,
        }
    }

    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId {
        let nf = NodeFactory::new();
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: self.width,
            height: self.height,
        };
        rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(self.color))]);
        rect.corner_radius = RectangularCornerRadius::circular(3.0);
        rect.strokes = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            200, 200, 200, 255,
        )))]);
        rect.stroke_width = StrokeWidth::Uniform(1.0);
        let node = ctx.graph.append_child(Node::Rectangle(rect), parent);
        ctx.register(&self.id, node, true, true);
        node
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        _bounds: Rectangle,
    ) -> UiResponse {
        let activated = matches!(
            event,
            WidgetEvent::PointerDown { .. }
                | WidgetEvent::Key {
                    key: KeyName::Enter | KeyName::Space,
                    ..
                }
        );
        if !activated {
            return UiResponse::ignored();
        }
        match self.action {
            SwatchAction::Cycle => self.cycle(),
            SwatchAction::OpenPicker => {
                // Record the click; the host drains it to open the
                // picker (the swatch never opens it itself — panels
                // own no editing logic, ARCH-3).
                if let WidgetState::Button(s) = state {
                    s.clicks += 1;
                }
                UiResponse::consumed()
            }
        }
    }
}
