//! `menu` — the context-menu presenter: anchored, modal panels over
//! [`crate::menu`]'s data (`crates/grida_editor/docs/context-menu.md`), built
//! as plain engine nodes like every other widget (`UI-1`).
//!
//! The popover pattern, realized with what the layer already has:
//!
//! - **Anchored placement** is a pure function ([`place`]): the panel
//!   opens down-right of the anchor, *flips* to the other side of the
//!   axis when it would overflow the viewport, and *clamps* when
//!   neither side fits — the collision behavior the web's anchored
//!   layers converged on. Submenus place beside their row
//!   ([`place_submenu`]) with the same discipline.
//! - **Modality is the popup grab**: while open, the menu widget
//!   holds its layer's pointer capture ([`UiLayer::set_capture`]), so
//!   every pointer event — including presses *outside* the panels —
//!   reaches [`MenuWidget::handle`]. Outside-press dismissal is the
//!   widget's own rule; nothing leaks to the canvas (`UI-5`).
//! - **The output is one [`Outcome`]** — chosen command or dismissed
//!   — queued in the retained [`MenuState`] and drained by the host
//!   ([`ContextMenu::drain`]), the same outbox pattern as the button
//!   and tree widgets. The menu never dispatches (`CTX-1`).
//! - **Keys are host-routed** ([`ContextMenu::key`]): the menu never
//!   takes text focus; the shell forwards the navigation vocabulary
//!   (arrows, Enter, Escape) while open and suppresses the rest —
//!   routing.md's widget-focus capture layer in its modal form.
//!
//! Activation is on pointer *up* over an enabled action row (the
//! native press-drag-release idiom works: captured moves keep the
//! hover live until release). Disabled rows consume and do nothing —
//! the menu stays open, mirroring the platforms.

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::Parent;
use grida::node::schema::*;
use math2::rect::Rectangle;

use crate::command::Command;
use crate::keys;
use crate::menu::{Item, Menu};
use crate::ui::UiLayer;
use crate::ui::popover;
use crate::ui::widget::{BuildCtx, UiResponse, Widget, WidgetEvent, WidgetId, WidgetState};

/// The anchored-placement rule is the shared popover primitive's
/// ([`popover::place`]); re-exported here for the context-menu
/// conformance suite that names it.
pub use crate::ui::popover::place;

/// Panel width, logical px (fixed — dev-mode quality bar, like the
/// shell's strips).
pub const MENU_W: f32 = 180.0;
/// Action / submenu row height.
pub const ROW_H: f32 = 22.0;
/// Separator row height.
pub const SEP_H: f32 = 7.0;
/// Panel padding (all sides); rows are inset by it.
pub const PAD: f32 = 4.0;

const ROW_W: f32 = MENU_W - 2.0 * PAD;
const LABEL_W: f32 = 104.0;
const HINT_W: f32 = ROW_W - 12.0 - LABEL_W;

/// The menu widget's stable identity in its (dedicated) layer.
pub const WIDGET_ID: &str = "menu";

/// What an open menu resolved to. One outcome ends the menu.
#[derive(Debug, Clone, PartialEq)]
pub enum Outcome {
    /// An enabled action row was activated.
    Chosen(Command),
    /// Dismissed without a choice (outside press, Escape).
    Dismissed,
}

/// Retained menu state (`UI-2`): hover, the open submenu, and the
/// outcome outbox the host drains.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MenuState {
    /// Hovered top-level row index (enabled rows only).
    pub hover: Option<usize>,
    /// Open submenu: a top-level `Item::Submenu` index.
    pub open_sub: Option<usize>,
    /// Hovered row index inside the open submenu.
    pub sub_hover: Option<usize>,
    /// The outbox: set once, drained by [`ContextMenu::drain`].
    pub outcome: Option<Outcome>,
}

/// The navigation vocabulary the shell forwards while the menu is
/// open ([`ContextMenu::key`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuKey {
    Up,
    Down,
    Left,
    Right,
    Enter,
    Escape,
}

// -- pure layout -------------------------------------------------------------

fn item_h(item: &Item) -> f32 {
    match item {
        Item::Separator => SEP_H,
        _ => ROW_H,
    }
}

/// Per-item `(y, height)` offsets inside a panel, plus the panel's
/// outer size — the one layout truth both the build and the hit test
/// read.
pub fn item_offsets(items: &[Item]) -> (Vec<(f32, f32)>, [f32; 2]) {
    let mut y = PAD;
    let mut offsets = Vec::with_capacity(items.len());
    for item in items {
        let h = item_h(item);
        offsets.push((y, h));
        y += h;
    }
    (offsets, [MENU_W, y + PAD])
}

/// Submenu placement: beside its row, via the shared popover
/// [`popover::place_beside`] — right of the panel, flipping to its
/// left on overflow; top-aligned with the row (the `- PAD` accounts
/// for the panel's own padding), clamped into the viewport.
pub fn place_submenu(
    panel_origin: [f32; 2],
    row_y: f32,
    size: [f32; 2],
    viewport: [f32; 2],
) -> [f32; 2] {
    popover::place_beside(
        panel_origin[0],
        panel_origin[0] + MENU_W,
        panel_origin[1] + row_y - PAD,
        size,
        viewport,
    )
}

fn panel_contains(origin: [f32; 2], items: &[Item], point: [f32; 2]) -> bool {
    let (_, size) = item_offsets(items);
    point[0] >= origin[0]
        && point[0] <= origin[0] + size[0]
        && point[1] >= origin[1]
        && point[1] <= origin[1] + size[1]
}

/// The interactive row (action or submenu) under `point`, if any.
fn hit_row(origin: [f32; 2], items: &[Item], point: [f32; 2]) -> Option<usize> {
    if point[0] < origin[0] + PAD || point[0] > origin[0] + PAD + ROW_W {
        return None;
    }
    let (offsets, _) = item_offsets(items);
    for (i, item) in items.iter().enumerate() {
        if matches!(item, Item::Separator) {
            continue;
        }
        let (y, h) = offsets[i];
        let top = origin[1] + y;
        if point[1] >= top && point[1] < top + h {
            return Some(i);
        }
    }
    None
}

/// Indices of navigable rows: enabled actions and enabled submenus.
fn nav_rows(items: &[Item]) -> Vec<usize> {
    items
        .iter()
        .enumerate()
        .filter_map(|(i, item)| match item {
            Item::Action(a) if a.enabled => Some(i),
            Item::Submenu(s) if s.enabled() => Some(i),
            _ => None,
        })
        .collect()
}

fn step(rows: &[usize], current: Option<usize>, forward: bool) -> Option<usize> {
    if rows.is_empty() {
        return None;
    }
    let pos = current.and_then(|c| rows.iter().position(|r| *r == c));
    let next = match (pos, forward) {
        (None, true) => 0,
        (None, false) => rows.len() - 1,
        (Some(p), true) => (p + 1) % rows.len(),
        (Some(p), false) => (p + rows.len() - 1) % rows.len(),
    };
    Some(rows[next])
}

// -- the widget ---------------------------------------------------------------

/// An open submenu's placement, computed by the host at rebuild time
/// (the widget renders and hit-tests what it is given).
#[derive(Debug, Clone)]
struct SubPanel {
    index: usize,
    origin: [f32; 2],
}

/// The menu widget: the main panel and (when open) the submenu, each
/// built as its **own top-level scene root** at its Cartesian origin
/// — plain engine nodes. They are independent roots, not a shared
/// parent's children, because the engine lays out only the first
/// absolute child of a Flex parent; a second panel sibling would not
/// render. The widget registers the main panel for identity and owns
/// both panels' hit-testing under the popup grab.
struct MenuWidget {
    id: WidgetId,
    menu: Menu,
    origin: [f32; 2],
    sub: Option<SubPanel>,
    platform: keys::Platform,
}

impl MenuWidget {
    fn sub_items(&self) -> Option<(&SubPanel, &[Item])> {
        let sub = self.sub.as_ref()?;
        match self.menu.items.get(sub.index) {
            Some(Item::Submenu(s)) => Some((sub, &s.items)),
            _ => None,
        }
    }
}

impl Widget for MenuWidget {
    fn id(&self) -> &WidgetId {
        &self.id
    }

    fn default_state(&self) -> WidgetState {
        WidgetState::Menu(MenuState::default())
    }

    fn build(&self, ctx: &mut BuildCtx, _parent: Parent) -> NodeId {
        // The menu's panels are top-level roots (built at Root by the
        // popover primitive), so the widget's own parent is unused.
        let state = match ctx.states.get(&self.id) {
            Some(WidgetState::Menu(s)) => s.clone(),
            _ => MenuState::default(),
        };
        // The main panel and the submenu are **independent top-level
        // roots** (each flattened separately by the painter, like the
        // shell's panel strips), Cartesian-placed at their own origins
        // — NOT children of a shared parent: the engine lays out only
        // the first absolute child of a Flex parent, so a second
        // absolute panel sibling would not render. The widget
        // registers the main panel for identity; capture routes all
        // events here regardless of bounds.
        let main = build_panel(
            ctx,
            &self.menu.items,
            self.origin,
            state.hover,
            self.platform,
        );
        ctx.register(&self.id, main, false, true);
        if let Some((sub, items)) = self.sub_items() {
            build_panel(ctx, items, sub.origin, state.sub_hover, self.platform);
        }
        main
    }

    fn handle(
        &self,
        state: &mut WidgetState,
        event: &WidgetEvent,
        _bounds: Rectangle,
    ) -> UiResponse {
        let WidgetState::Menu(s) = state else {
            return UiResponse::ignored();
        };
        match event {
            WidgetEvent::PointerMove { point } => {
                if let Some((sub, items)) = self.sub_items()
                    && panel_contains(sub.origin, items, *point)
                {
                    s.sub_hover = hit_row(sub.origin, items, *point)
                        .filter(|i| matches!(&items[*i], Item::Action(a) if a.enabled));
                } else if let Some(i) = hit_row(self.origin, &self.menu.items, *point) {
                    match &self.menu.items[i] {
                        Item::Action(a) => {
                            s.hover = if a.enabled { Some(i) } else { None };
                            // Hovering any other row closes an open
                            // submenu (platform behavior).
                            s.open_sub = None;
                            s.sub_hover = None;
                        }
                        Item::Submenu(sub) => {
                            if sub.enabled() {
                                s.hover = Some(i);
                                if s.open_sub != Some(i) {
                                    s.open_sub = Some(i);
                                    s.sub_hover = None;
                                }
                            } else {
                                s.hover = None;
                                s.open_sub = None;
                                s.sub_hover = None;
                            }
                        }
                        Item::Separator => {}
                    }
                }
                // Outside both panels: state holds (the pointer may
                // be crossing the gap toward a submenu).
                UiResponse::consumed()
            }
            WidgetEvent::PointerDown { point, .. } => {
                let inside = panel_contains(self.origin, &self.menu.items, *point)
                    || self
                        .sub_items()
                        .is_some_and(|(sub, items)| panel_contains(sub.origin, items, *point));
                if inside {
                    UiResponse::consumed()
                } else {
                    // Light dismissal: the outside press closes and is
                    // swallowed (never reaches the canvas).
                    s.outcome = Some(Outcome::Dismissed);
                    UiResponse {
                        consumed: true,
                        release: true,
                        rebuild: false,
                        ..UiResponse::default()
                    }
                }
            }
            WidgetEvent::PointerUp { point, .. } => {
                if let Some((sub, items)) = self.sub_items()
                    && panel_contains(sub.origin, items, *point)
                {
                    if let Some(i) = hit_row(sub.origin, items, *point)
                        && let Item::Action(a) = &items[i]
                        && a.enabled
                    {
                        s.outcome = Some(Outcome::Chosen(a.command));
                        return UiResponse {
                            consumed: true,
                            release: true,
                            rebuild: false,
                            ..UiResponse::default()
                        };
                    }
                    return UiResponse::consumed();
                }
                if panel_contains(self.origin, &self.menu.items, *point) {
                    if let Some(i) = hit_row(self.origin, &self.menu.items, *point) {
                        match &self.menu.items[i] {
                            Item::Action(a) if a.enabled => {
                                s.outcome = Some(Outcome::Chosen(a.command));
                                return UiResponse {
                                    consumed: true,
                                    release: true,
                                    rebuild: false,
                                    ..UiResponse::default()
                                };
                            }
                            Item::Submenu(sub) if sub.enabled() => {
                                s.hover = Some(i);
                                s.open_sub = Some(i);
                            }
                            _ => {}
                        }
                    }
                    return UiResponse::consumed();
                }
                // Released outside after dragging out: close without
                // a choice (platform behavior).
                s.outcome = Some(Outcome::Dismissed);
                UiResponse {
                    consumed: true,
                    release: true,
                    rebuild: false,
                    ..UiResponse::default()
                }
            }
            WidgetEvent::Key { .. } => UiResponse::ignored(),
        }
    }
}

/// Build one panel and return its node — background plus rows and
/// separators laid out top-to-bottom by the engine's **flex flow**
/// (the proven panel pattern: the engine lays out only the first
/// absolutely-placed child of a Flex parent, so the rows must flow,
/// not each claim an absolute position). `origin` is the panel's own
/// Cartesian placement within its parent. The vertical padding and
/// zero gap keep the flow's row offsets equal to [`item_offsets`], so
/// hit-testing (which reads `item_offsets`) matches what is drawn.
fn build_panel(
    ctx: &mut BuildCtx,
    items: &[Item],
    origin: [f32; 2],
    hover: Option<usize>,
    platform: keys::Platform,
) -> NodeId {
    let nf = NodeFactory::new();
    let (_, size) = item_offsets(items);
    // The panel shell is the shared popover primitive's, built as its
    // own top-level scene root (WID-8); the menu appends its rows into
    // it below.
    let pnode = popover::build_panel(ctx, origin, size, PAD);

    for (i, item) in items.iter().enumerate() {
        match item {
            Item::Separator => build_separator(ctx, &nf, pnode),
            Item::Action(a) => {
                let hint = keys::hint_for(a.command, platform);
                build_row(
                    ctx,
                    &nf,
                    pnode,
                    a.label,
                    hint.as_deref(),
                    a.enabled,
                    hover == Some(i),
                );
            }
            Item::Submenu(sub) => build_row(
                ctx,
                &nf,
                pnode,
                sub.label,
                Some("▸"),
                sub.enabled(),
                hover == Some(i),
            ),
        }
    }
    pnode
}

fn build_row(
    ctx: &mut BuildCtx,
    nf: &NodeFactory,
    panel: NodeId,
    label: &str,
    hint: Option<&str>,
    enabled: bool,
    hovered: bool,
) {
    let mut row = nf.create_container_node();
    row.layout_dimensions.layout_target_width = Some(ROW_W);
    row.layout_dimensions.layout_target_height = Some(ROW_H);
    row.layout_container = LayoutContainerStyle {
        layout_mode: LayoutMode::Flex,
        layout_direction: Axis::Horizontal,
        layout_padding: Some(EdgeInsets {
            top: 4.0,
            right: 6.0,
            bottom: 4.0,
            left: 6.0,
        }),
        ..Default::default()
    };
    if hovered {
        row.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
            232, 232, 232, 255,
        )))]);
        row.corner_radius = RectangularCornerRadius::circular(3.0);
    }
    let rnode = ctx
        .graph
        .append_child(Node::Container(row), Parent::NodeId(panel));

    let text_color = if enabled {
        CGColor::from_rgba(40, 40, 40, 255)
    } else {
        CGColor::from_rgba(170, 170, 170, 255)
    };
    let mut text = nf.create_text_span_node();
    text.text = label.to_string();
    text.width = Some(LABEL_W);
    text.height = Some(ROW_H - 8.0);
    text.text_style = TextStyleRec::from_font("Geist", 11.0);
    text.fills = Paints::new([Paint::Solid(SolidPaint::new_color(text_color))]);
    ctx.graph
        .append_child(Node::TextSpan(text), Parent::NodeId(rnode));

    if let Some(hint) = hint {
        let hint_color = if enabled {
            CGColor::from_rgba(150, 150, 150, 255)
        } else {
            CGColor::from_rgba(190, 190, 190, 255)
        };
        let mut span = nf.create_text_span_node();
        span.text = hint.to_string();
        span.width = Some(HINT_W);
        span.height = Some(ROW_H - 8.0);
        span.text_style = TextStyleRec::from_font("Geist", 11.0);
        span.text_align = TextAlign::Right;
        span.fills = Paints::new([Paint::Solid(SolidPaint::new_color(hint_color))]);
        ctx.graph
            .append_child(Node::TextSpan(span), Parent::NodeId(rnode));
    }
}

fn build_separator(ctx: &mut BuildCtx, nf: &NodeFactory, panel: NodeId) {
    let mut sep = nf.create_container_node();
    sep.layout_dimensions.layout_target_width = Some(ROW_W);
    sep.layout_dimensions.layout_target_height = Some(SEP_H);
    sep.layout_container = LayoutContainerStyle {
        layout_mode: LayoutMode::Flex,
        layout_direction: Axis::Horizontal,
        layout_padding: Some(EdgeInsets {
            top: 3.0,
            right: 4.0,
            bottom: 3.0,
            left: 4.0,
        }),
        ..Default::default()
    };
    let snode = ctx
        .graph
        .append_child(Node::Container(sep), Parent::NodeId(panel));
    let mut line = nf.create_container_node();
    line.layout_dimensions.layout_target_width = Some(ROW_W - 8.0);
    line.layout_dimensions.layout_target_height = Some(1.0);
    line.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
        225, 225, 225, 255,
    )))]);
    ctx.graph
        .append_child(Node::Container(line), Parent::NodeId(snode));
}

// -- the host -----------------------------------------------------------------

/// The last-mounted visual key: rebuild only when it moves.
type BuiltKey = (Option<usize>, Option<usize>, Option<usize>);

struct OpenMenu {
    menu: Menu,
    origin: [f32; 2],
    built: BuiltKey,
}

/// The context-menu host: owns the open menu's data and placement,
/// mounts/rebuilds the widget on its dedicated layer, drains the
/// outcome outbox, and answers the navigation keys. The shell only
/// wires events through (`SHELL-3`: no menu logic in the shell).
pub struct ContextMenu {
    platform: keys::Platform,
    open: Option<OpenMenu>,
}

impl ContextMenu {
    pub fn new(platform: keys::Platform) -> Self {
        Self {
            platform,
            open: None,
        }
    }

    pub fn is_open(&self) -> bool {
        self.open.is_some()
    }

    /// Open `menu` at `anchor` (layer-logical px) on `ui` — placement
    /// resolves against the layer's viewport, state starts fresh, and
    /// the widget takes the popup grab.
    pub fn open(&mut self, ui: &mut UiLayer, menu: Menu, anchor: [f32; 2]) {
        let vp = ui.viewport();
        let (_, size) = item_offsets(&menu.items);
        let origin = place(anchor, size, [vp.width, vp.height]);
        ui.set_state(
            WIDGET_ID.to_string(),
            WidgetState::Menu(MenuState::default()),
        );
        self.open = Some(OpenMenu {
            menu,
            origin,
            built: (None, None, None),
        });
        self.mount(ui);
    }

    /// Close and unmount (idempotent).
    pub fn close(&mut self, ui: &mut UiLayer) {
        if self.open.take().is_some() {
            ui.mount(Vec::new());
        }
    }

    /// Drain the outcome outbox; rebuilds the widget when the visual
    /// state (hover / open submenu) moved. The caller closes on
    /// `Some` and dispatches on [`Outcome::Chosen`].
    pub fn drain(&mut self, ui: &mut UiLayer) -> Option<Outcome> {
        self.open.as_ref()?;
        let state = self.state(ui);
        if let Some(outcome) = state.outcome {
            return Some(outcome);
        }
        let key = (state.hover, state.open_sub, state.sub_hover);
        if self.open.as_ref().is_some_and(|o| o.built != key) {
            self.mount(ui);
        }
        None
    }

    /// One navigation key (routing.md — the modal capture's
    /// vocabulary). Returns the outcome when the key resolves one.
    pub fn key(&mut self, ui: &mut UiLayer, key: MenuKey) -> Option<Outcome> {
        let open = self.open.as_ref()?;
        if key == MenuKey::Escape {
            return Some(Outcome::Dismissed);
        }
        let mut s = self.state(ui);
        let items = &open.menu.items;
        match key {
            MenuKey::Down | MenuKey::Up => {
                let forward = key == MenuKey::Down;
                if let Some(sub) = s.open_sub
                    && let Some(Item::Submenu(subm)) = items.get(sub)
                {
                    s.sub_hover = step(&nav_rows(&subm.items), s.sub_hover, forward);
                } else {
                    s.hover = step(&nav_rows(items), s.hover, forward);
                }
            }
            MenuKey::Right => {
                if let Some(i) = s.hover
                    && let Some(Item::Submenu(subm)) = items.get(i)
                    && subm.enabled()
                {
                    s.open_sub = Some(i);
                    s.sub_hover = step(&nav_rows(&subm.items), None, true);
                }
            }
            MenuKey::Left => {
                s.open_sub = None;
                s.sub_hover = None;
            }
            MenuKey::Enter => {
                if let Some(sub) = s.open_sub
                    && let Some(Item::Submenu(subm)) = items.get(sub)
                {
                    if let Some(j) = s.sub_hover
                        && let Some(Item::Action(a)) = subm.items.get(j)
                        && a.enabled
                    {
                        return Some(Outcome::Chosen(a.command));
                    }
                } else if let Some(i) = s.hover {
                    match items.get(i) {
                        Some(Item::Action(a)) if a.enabled => {
                            return Some(Outcome::Chosen(a.command));
                        }
                        Some(Item::Submenu(subm)) if subm.enabled() => {
                            s.open_sub = Some(i);
                            s.sub_hover = step(&nav_rows(&subm.items), None, true);
                        }
                        _ => {}
                    }
                }
            }
            MenuKey::Escape => unreachable!("handled above"),
        }
        ui.set_state(WIDGET_ID.to_string(), WidgetState::Menu(s));
        self.mount(ui);
        None
    }

    fn state(&self, ui: &UiLayer) -> MenuState {
        match ui.state(&WIDGET_ID.to_string()) {
            Some(WidgetState::Menu(s)) => s.clone(),
            _ => MenuState::default(),
        }
    }

    /// (Re)mount the widget from the current data + retained state:
    /// the submenu's placement is resolved here, then the widget
    /// renders and hit-tests exactly what it was given.
    fn mount(&mut self, ui: &mut UiLayer) {
        let Some(open) = &mut self.open else {
            return;
        };
        let state = match ui.state(&WIDGET_ID.to_string()) {
            Some(WidgetState::Menu(s)) => s.clone(),
            _ => MenuState::default(),
        };
        let vp = ui.viewport();
        let sub = state.open_sub.and_then(|i| match open.menu.items.get(i) {
            Some(Item::Submenu(s)) => {
                let (offsets, _) = item_offsets(&open.menu.items);
                let (_, sub_size) = item_offsets(&s.items);
                Some(SubPanel {
                    index: i,
                    origin: place_submenu(
                        open.origin,
                        offsets[i].0,
                        sub_size,
                        [vp.width, vp.height],
                    ),
                })
            }
            _ => None,
        });
        open.built = (state.hover, state.open_sub, state.sub_hover);
        let widget = MenuWidget {
            id: WIDGET_ID.to_string(),
            menu: open.menu.clone(),
            origin: open.origin,
            sub,
            platform: self.platform,
        };
        ui.mount(vec![Box::new(widget)]);
        ui.set_capture(WIDGET_ID.to_string());
    }
}
