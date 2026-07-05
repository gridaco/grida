//! The `Widget` trait and build/event plumbing shared by all widgets.
//!
//! A widget is a **stateless config**: the panel constructs fresh widget
//! values on every rebuild ("rebuild, don't react"), while retained
//! per-instance state lives in the [`UiLayer`]'s state map keyed by the
//! widget's stable [`WidgetId`] (`UI-2`). `build` constructs the
//! widget's subtree out of plain engine schema nodes (`UI-1`);
//! `handle` mutates the retained state and reports [`Emission`]s for
//! the binding layer to apply.
//!
//! [`UiLayer`]: crate::ui::UiLayer

use std::collections::HashMap;

use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::NodeId;
use grida::overlay::Modifiers;
use grida::text_edit::session::KeyName;
use math2::rect::Rectangle;

use crate::ui::bind::Emission;
use crate::ui::menu::MenuState;
use crate::ui::scroll::ScrollState;
use crate::ui::widgets::button::ButtonState;
use crate::ui::widgets::color_picker::PickerState;
use crate::ui::widgets::list_section::ListState;
use crate::ui::widgets::number::NumberState;
use crate::ui::widgets::quad::QuadState;
use crate::ui::widgets::select::SelectState;
use crate::ui::widgets::slider::SliderState;
use crate::ui::widgets::text::TextState;
use crate::ui::widgets::tree::TreeState;

/// Stable widget identity. State keyed by this survives rebuilds
/// (`UI-2`); tab order is the build order of focusable ids (`UI-3`).
pub type WidgetId = String;

/// Retained per-widget state (`UI-2`). A closed enum, per the dumbness
/// doctrine — no `Any` bags, no reactive cells.
#[derive(Debug, Clone, PartialEq)]
pub enum WidgetState {
    /// The widget retains nothing.
    None,
    /// Slider interaction state (drag anchor).
    Slider(SliderState),
    /// Scroll container state (offset).
    Scroll(ScrollState),
    /// Numeric input state (scrub anchor + typed-entry buffer).
    Number(NumberState),
    /// Hierarchy tree state (expansion, drag, output queue).
    Tree(TreeState),
    /// Button state (pending click queue).
    Button(ButtonState),
    /// Context-menu state (hover, open submenu, outcome outbox).
    Menu(MenuState),
    /// Select-dropdown state (open flag, list anchor, highlight).
    Select(SelectState),
    /// Text-input state (edit buffer while focused).
    Text(TextState),
    /// Quad state (uniform⇄split mode, active side + edit buffer).
    Quad(QuadState),
    /// Color-picker state (drag target, working HSVA, hex buffer).
    Picker(PickerState),
    /// List-section state (in-flight reorder drag).
    List(ListState),
}

/// A normalized event addressed to one widget, in UI-local logical
/// screen coordinates. Derived from the same surface-event vocabulary
/// the canvas uses (`UI-7`).
#[derive(Debug, Clone)]
pub enum WidgetEvent {
    /// Primary pointer pressed at `point`.
    PointerDown {
        point: [f32; 2],
        modifiers: Modifiers,
    },
    /// Pointer moved to `point` (routed while captured).
    PointerMove { point: [f32; 2] },
    /// Primary pointer released at `point`.
    PointerUp {
        point: [f32; 2],
        modifiers: Modifiers,
    },
    /// A key reached this widget (it is focused, `UI-3`).
    Key { key: KeyName, modifiers: Modifiers },
}

/// What a widget did with an event.
#[derive(Debug, Default)]
pub struct UiResponse {
    /// The event was handled; do not propagate further.
    pub consumed: bool,
    /// Binding emissions produced by the interaction (`UI-4`).
    pub emissions: Vec<Emission>,
    /// Begin routing all pointer events to this widget until `release`.
    pub capture: bool,
    /// End pointer capture.
    pub release: bool,
    /// The interaction changed the widget's own rendered structure
    /// (e.g. a select opening its list, a picker showing its popover):
    /// the layer rebuilds the widget subtree so the new structure is
    /// drawn and laid out ("rebuild, don't react"). Distinct from the
    /// panel's value-driven rebuilds — this is a widget asking to
    /// re-render *itself* after an interaction, the general mechanism
    /// behind self-contained floating overlays (`WID-8`).
    pub rebuild: bool,
}

impl UiResponse {
    /// The event was not handled.
    pub fn ignored() -> Self {
        Self::default()
    }

    /// Handled, nothing else to report.
    pub fn consumed() -> Self {
        Self {
            consumed: true,
            ..Self::default()
        }
    }
}

/// One interactive/identifiable region registered during a build:
/// the widget's subtree root plus its routing metadata. Order in the
/// registry is build order (tab order, and reversed for topmost-first
/// hit-testing).
#[derive(Debug, Clone)]
pub struct RegistryEntry {
    /// The widget's stable identity.
    pub id: WidgetId,
    /// Root node of the widget's subtree in the UI scene.
    pub node: NodeId,
    /// Nearest enclosing scroll viewport node — hit-testing intersects
    /// with its bounds (`UI-6`).
    pub clip: Option<NodeId>,
    /// Participates in tab order and receives key events (`UI-3`).
    pub focusable: bool,
    /// Receives pointer events (non-interactive entries still block
    /// the canvas underneath, `UI-5`).
    pub interactive: bool,
    /// This entry is a scroll viewport (wheel target, `UI-6`).
    pub scroll: bool,
}

/// Build-time context: the UI scene graph being (re)built, read access
/// to retained state, and the registry the build populates.
pub struct BuildCtx<'a> {
    /// The UI scene graph under construction. Widgets append plain
    /// schema nodes — no special node kinds exist (`UI-1`).
    pub graph: &'a mut SceneGraph,
    /// Retained widget state (read-only during build; `UI-2`).
    pub states: &'a HashMap<WidgetId, WidgetState>,
    pub(crate) registry: Vec<RegistryEntry>,
    pub(crate) clip_stack: Vec<NodeId>,
}

impl<'a> BuildCtx<'a> {
    pub(crate) fn new(
        graph: &'a mut SceneGraph,
        states: &'a HashMap<WidgetId, WidgetState>,
    ) -> Self {
        Self {
            graph,
            states,
            registry: Vec::new(),
            clip_stack: Vec::new(),
        }
    }

    /// Register the calling widget's subtree root. Every widget calls
    /// this exactly once from `build`, before building children, so
    /// registry order equals build order.
    pub fn register(&mut self, id: &WidgetId, node: NodeId, focusable: bool, interactive: bool) {
        self.registry.push(RegistryEntry {
            id: id.clone(),
            node,
            clip: self.clip_stack.last().copied(),
            focusable,
            interactive,
            scroll: false,
        });
    }

    /// Register a scroll viewport (see [`crate::ui::scroll`]).
    pub fn register_scroll(&mut self, id: &WidgetId, node: NodeId) {
        self.registry.push(RegistryEntry {
            id: id.clone(),
            node,
            clip: self.clip_stack.last().copied(),
            focusable: false,
            interactive: false,
            scroll: true,
        });
    }

    /// Push a clipping viewport for children built inside `f`.
    pub fn push_clip(&mut self, node: NodeId) {
        self.clip_stack.push(node);
    }

    /// Pop the innermost clipping viewport.
    pub fn pop_clip(&mut self) {
        self.clip_stack.pop();
    }
}

/// A widget: `build` a plain engine-node subtree, `handle` events
/// against retained state.
pub trait Widget {
    /// The widget's stable identity.
    fn id(&self) -> &WidgetId;

    /// The state minted for this identity on first sight (`UI-2`).
    fn default_state(&self) -> WidgetState {
        WidgetState::None
    }

    /// Construct the widget's subtree under `parent` and return its
    /// root node. Must call [`BuildCtx::register`] for itself.
    fn build(&self, ctx: &mut BuildCtx, parent: Parent) -> NodeId;

    /// Handle an event. `bounds` is the widget root's world rect from
    /// the engine's computed layout (geometry cache).
    fn handle(
        &self,
        _state: &mut WidgetState,
        _event: &WidgetEvent,
        _bounds: Rectangle,
    ) -> UiResponse {
        UiResponse::ignored()
    }

    /// Child widgets (containers override; used for state seeding,
    /// dispatch lookup, and selective replacement).
    fn children(&self) -> &[Box<dyn Widget>] {
        &[]
    }

    /// Mutable child list, when the container supports replacing a
    /// child config in place (`UiLayer::rebuild_widget`).
    fn children_mut(&mut self) -> Option<&mut Vec<Box<dyn Widget>>> {
        None
    }
}
