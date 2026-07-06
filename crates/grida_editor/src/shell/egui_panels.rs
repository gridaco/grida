//! egui-rendered editor panels — the real migration off `UiLayer`.
//!
//! Immediate-mode: each frame we **read** the editor via the same
//! queries `UiLayer`'s panels used and **write** only through the same
//! `bind` layer (`bind::apply`) — ARCH-3 is preserved verbatim, the view
//! is the only thing that changed. There is no snapshot, no diff, no
//! rebuild: the panel *is* a function of the current editor state.
//!
//! All four chrome surfaces live here now: the **properties** panel
//! (`Panel::right`), the **hierarchy** tree (`Panel::left`), the
//! **toolbar** (`Area`), and the **context menu** (`Popup`). `UiLayer`
//! is fully dormant (`draw_ui` is a no-op) pending the dead-plumbing
//! deletion. Deferred within properties (named, not silently dropped):
//! per-paint active/opacity, gradient stop-track, image source,
//! selection-colors aggregate, and the export scaffold. Deferred in the
//! hierarchy: drag-reorder (egui dnd).

use std::collections::HashSet;

use grida::cg::prelude::{CGColor, Paint};

use crate::command::Command;
use crate::document::{Id, Mutation};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::menu::{Item, Menu};
use crate::tool::{ShapeKind, Tool};
use crate::ui::bind::{
    self, BLEND_MODES, Binding, BindingPhase, BindingProperty, BindingValue, Emission,
    FONT_WEIGHTS, ListOp, PAINT_KINDS, SHADOW_KINDS, STROKE_ALIGNS, STROKE_CAPS, STROKE_JOINS,
    TEXT_ALIGN_VERTICALS, TEXT_ALIGNS, blur_radius, font_weight_index, shadow_params,
};
use crate::ui::hierarchy::{DropIndicator, INDENT, ROW_H};

/// Transient panel state that immediate mode cannot derive from the
/// document each frame.
#[derive(Default)]
pub(crate) struct EguiPanels {
    /// The name field's in-progress edit buffer (a text field must
    /// survive keystrokes between frames).
    name_buffer: String,
    /// Hierarchy expansion set — which containers are open. View state,
    /// never persisted, never in history (`HIER-*`). Immediate mode
    /// owns it here; the flatten walk descends only into these.
    hier_expanded: HashSet<Id>,
    /// The selection the tree last built against — a change reveals
    /// (expand the ancestor chain, scroll the head into view, `HIER-4`).
    hier_last_selection: Vec<Id>,
    /// The row being dragged (its stable id), while a reorder drag is in
    /// flight. `None` = no drag. The drop target is re-resolved from the
    /// live pointer each frame (`HIER-1/2/3`), so nothing else is stored.
    hier_drag: Option<Id>,
}

impl EguiPanels {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Build the right-hand properties panel for the current selection.
    pub(crate) fn properties(
        &mut self,
        ui: &mut egui::Ui,
        editor: &mut Editor,
        last_frame_ms: f32,
    ) {
        // `exact_size` (not `default_size`) PINS the width to the camera's
        // right inset (`super::PANEL_WIDTH`, the same constant
        // `apply_viewport` reserves) — so an empty/scene selection can't
        // shrink the panel to its content and break the layout.
        egui::Panel::right("props.egui")
            .exact_size(super::PANEL_WIDTH)
            .frame(
                egui::Frame::new()
                    .fill(ui.visuals().panel_fill)
                    .inner_margin(egui::Margin {
                        left: 14,
                        right: 12,
                        top: 10,
                        bottom: 10,
                    }),
            )
            .show(ui, |ui| {
                // Calmer vertical rhythm than egui's default.
                ui.spacing_mut().item_spacing = egui::vec2(8.0, 6.0);
                ui.spacing_mut().interact_size.y = 22.0;
                // No scrollbar drawn (wheel / trackpad scroll only): the
                // panel stays clean and right-aligned controls (+/✕) never
                // sit under a bar. Nothing reserves horizontal space, so
                // content uses the full padded width.
                egui::ScrollArea::vertical()
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
                    .show(ui, |ui| {
                        let selection: Vec<Id> = editor.selection().to_vec();
                        if selection.is_empty() {
                            scene_section(ui, editor);
                        } else {
                            let head = selection[0].clone();
                            self.node_sections(ui, editor, &head, &selection);
                        }
                        // Dev-only frame-time readout — deliberately faint.
                        ui.add_space(16.0);
                        ui.label(
                            egui::RichText::new(format!("{last_frame_ms:.1} ms"))
                                .size(10.0)
                                .color(egui::Color32::from_gray(185)),
                        );
                    });
            });
    }

    fn node_sections(&mut self, ui: &mut egui::Ui, editor: &mut Editor, head: &Id, sel: &[Id]) {
        section(ui, "Layer", |ui| {
            grid(ui, "g.layer", |ui| {
                lbl(ui, "Name");
                let current = editor.document().node_name(head).unwrap_or_default();
                let id = egui::Id::new("props.name");
                if ui.memory(|m| m.focused() != Some(id)) {
                    self.name_buffer = current;
                }
                let resp = ui.add(
                    egui::TextEdit::singleline(&mut self.name_buffer)
                        .id(id)
                        .desired_width(VAL_W),
                );
                if resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    emit_commit(
                        editor,
                        BindingProperty::Name,
                        None,
                        sel,
                        "ui.name",
                        BindingValue::Text(self.name_buffer.clone()),
                    );
                }
                ui.end_row();

                if let Some(mut v) = editor.document().node_active(head) {
                    lbl(ui, "Visible");
                    if ui.checkbox(&mut v, "").changed() {
                        emit_commit(
                            editor,
                            BindingProperty::Visible,
                            None,
                            sel,
                            "ui.visible",
                            BindingValue::Bool(v),
                        );
                    }
                    ui.end_row();
                }
                if let Some(op) = editor.node_opacity(head) {
                    lbl(ui, "Opacity");
                    let mut v = op;
                    let r = ui.add_sized(
                        [VAL_W, ui.spacing().interact_size.y],
                        egui::Slider::new(&mut v, 0.0..=1.0).fixed_decimals(2),
                    );
                    emit_scalar(
                        editor,
                        &r,
                        BindingProperty::Opacity,
                        None,
                        sel,
                        "ui.opacity",
                        BindingValue::Number(v),
                    );
                    ui.end_row();
                }
                if let Some(bm) = editor.node_blend_mode(head) {
                    lbl(ui, "Blend");
                    let cur = BLEND_MODES.iter().position(|(_, v)| *v == bm).unwrap_or(0);
                    if let Some(i) = combo(ui, "props.blend", cur, &labels(BLEND_MODES), VAL_W) {
                        emit_commit(
                            editor,
                            BindingProperty::BlendMode,
                            None,
                            sel,
                            "ui.blend",
                            BindingValue::Index(i),
                        );
                    }
                    ui.end_row();
                }
            });
        });

        if let Some((x, y)) = editor.node_position(head) {
            section(ui, "Transform", |ui| {
                grid(ui, "g.transform", |ui| {
                    lbl(ui, "Position");
                    ui.horizontal(|ui| {
                        let mut xv = x;
                        let rx = pair(ui, &mut xv, 1.0, "X");
                        emit_scalar(
                            editor,
                            &rx,
                            BindingProperty::PositionX,
                            None,
                            sel,
                            "ui.x",
                            BindingValue::Number(xv),
                        );
                        let mut yv = y;
                        let ry = pair(ui, &mut yv, 1.0, "Y");
                        emit_scalar(
                            editor,
                            &ry,
                            BindingProperty::PositionY,
                            None,
                            sel,
                            "ui.y",
                            BindingValue::Number(yv),
                        );
                    });
                    ui.end_row();

                    if let Some((w, h)) = editor.node_size(head) {
                        lbl(ui, "Size");
                        ui.horizontal(|ui| {
                            let mut wv = w;
                            let rw = pair(ui, &mut wv, 1.0, "W");
                            emit_scalar(
                                editor,
                                &rw,
                                BindingProperty::SizeWidth,
                                None,
                                sel,
                                "ui.w",
                                BindingValue::Number(wv.max(0.0)),
                            );
                            let mut hv = h;
                            let rh = pair(ui, &mut hv, 1.0, "H");
                            emit_scalar(
                                editor,
                                &rh,
                                BindingProperty::SizeHeight,
                                None,
                                sel,
                                "ui.h",
                                BindingValue::Number(hv.max(0.0)),
                            );
                        });
                        ui.end_row();
                    }
                    if let Some(rot) = editor.node_rotation(head) {
                        lbl(ui, "Rotation");
                        let mut v = rot.to_degrees();
                        let r = ui.add_sized(
                            [VAL_W, ui.spacing().interact_size.y],
                            egui::DragValue::new(&mut v).speed(1.0).suffix("°"),
                        );
                        emit_scalar(
                            editor,
                            &r,
                            BindingProperty::Rotation,
                            None,
                            sel,
                            "ui.rotation",
                            BindingValue::Number(v),
                        );
                        ui.end_row();
                    }
                    if let Some(cr) = editor.node_corner_radius(head) {
                        lbl(ui, "Corner");
                        let mut v = cr;
                        let r = num(ui, &mut v, 0.5);
                        emit_scalar(
                            editor,
                            &r,
                            BindingProperty::CornerRadius,
                            None,
                            sel,
                            "ui.corner",
                            BindingValue::Number(v.max(0.0)),
                        );
                        ui.end_row();
                    }
                    if let Some(pc) = editor.node_point_count(head) {
                        lbl(ui, "Points");
                        let mut v = pc as f32;
                        let r = num(ui, &mut v, 0.1);
                        emit_scalar(
                            editor,
                            &r,
                            BindingProperty::PointCount,
                            None,
                            sel,
                            "ui.count",
                            BindingValue::Number(v),
                        );
                        ui.end_row();
                    }
                    if let Some(mut c) = editor.node_clips_content(head) {
                        lbl(ui, "Clip");
                        if ui.checkbox(&mut c, "").changed() {
                            emit_commit(
                                editor,
                                BindingProperty::ClipsContent,
                                None,
                                sel,
                                "ui.clip",
                                BindingValue::Bool(c),
                            );
                        }
                        ui.end_row();
                    }
                });
            });
        }

        if editor.node_font_size(head).is_some() {
            text_section(ui, editor, head, sel);
        }
        paint_section(ui, editor, head, sel, PaintKind::Fill);
        paint_section(ui, editor, head, sel, PaintKind::Stroke);
        if editor.node_stroke_width(head).is_some() {
            stroke_geometry_section(ui, editor, head, sel);
        }
        if editor.node_effects(head).is_some() {
            effects_section(ui, editor, head, sel);
        }
    }

    /// The left-hand layers tree (`docs/wg/canvas/hierarchy.md`). A real
    /// full-height opaque panel (not the old transparent overlay): egui
    /// gates its input, so the canvas beneath is never touched. Reads via
    /// [`crate::ui::hierarchy::flatten`] (the same walk the retired
    /// `UiLayer` tree used) and writes selection/reorder straight through
    /// the editor — `ARCH-3`, no tree-side logic. Drag-reorder reuses the
    /// ported `hierarchy::resolve_drop` geometry (`HIER-1/2/3`).
    pub(crate) fn hierarchy(&mut self, ui: &mut egui::Ui, editor: &mut Editor) {
        // Reveal on external selection change (`HIER-4`): expand exactly
        // the ancestor chain of the newly selected nodes — additive,
        // collapsing nothing — before the flatten so they show this frame.
        let selection: Vec<Id> = editor.selection().to_vec();
        let reveal = selection != self.hier_last_selection;
        if reveal {
            for id in &selection {
                let mut cursor = editor.document().node_parent(id).flatten();
                while let Some(ancestor) = cursor {
                    cursor = editor.document().node_parent(&ancestor).flatten();
                    self.hier_expanded.insert(ancestor);
                }
            }
            self.hier_last_selection = selection;
        }

        egui::Panel::left("hier.egui")
            .exact_size(super::HIER_WIDTH)
            .frame(
                egui::Frame::new()
                    .fill(ui.visuals().panel_fill)
                    .inner_margin(egui::Margin {
                        left: 8,
                        right: 8,
                        top: 10,
                        bottom: 10,
                    }),
            )
            .show(ui, |ui| {
                ui.label(section_title("Layers"));
                ui.add_space(6.0);

                // Deferred to after the row loop / scroll area so the
                // flatten's borrow of `hier_expanded` / `editor` stays
                // immutable while resolving.
                let mut toggle: Option<Id> = None;
                let mut click: Option<(Id, bool)> = None;
                // A committed reorder: (moving ids, new parent, index).
                let mut do_move: Option<(Vec<Id>, Option<Id>, usize)> = None;

                egui::ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
                    .show(ui, |ui| {
                        let rows = crate::ui::hierarchy::flatten(editor, &self.hier_expanded);
                        let row_w = ui.available_width();
                        // Drag lifecycle for this frame, resolved after the
                        // loop: the row that started a drag, and whether the
                        // in-flight drag released this frame.
                        let mut started: Option<Id> = None;
                        let mut released = false;
                        let mut first_rect: Option<egui::Rect> = None;

                        for row in &rows {
                            let (rect, _) = ui.allocate_exact_size(
                                egui::vec2(row_w, ROW_H),
                                egui::Sense::hover(),
                            );
                            first_rect.get_or_insert(rect);
                            // Stable per-row id so egui tracks the drag on
                            // the grabbed row across frames as the pointer
                            // moves over its neighbours.
                            let resp = ui.interact(
                                rect,
                                egui::Id::new(("hier.row", &row.id)),
                                egui::Sense::click_and_drag(),
                            );

                            let dragging = self.hier_drag.is_some();
                            // Neutral highlight (no accent colour — the
                            // editor's house style): selected, else hover
                            // (hover suppressed while a drag is in flight).
                            if row.selected {
                                ui.painter().rect_filled(rect, 3.0, HIER_SEL_BG);
                            } else if resp.hovered() && !dragging {
                                ui.painter().rect_filled(rect, 3.0, HIER_HOVER_BG);
                            }
                            let indent = row.depth as f32 * INDENT;
                            // Disclosure triangle (containers only).
                            if row.is_container {
                                let glyph = if row.expanded {
                                    icon::CHEVRON_DOWN
                                } else {
                                    icon::CHEVRON_RIGHT
                                };
                                ui.painter().text(
                                    egui::pos2(rect.left() + indent, rect.center().y),
                                    egui::Align2::LEFT_CENTER,
                                    glyph,
                                    icon::font_id(10.0),
                                    HIER_DISCLOSURE,
                                );
                            }
                            let icon_x = rect.left() + indent + HIER_DISCLOSURE_W;
                            let color = if row.active {
                                HIER_TEXT
                            } else {
                                HIER_TEXT_INACTIVE
                            };
                            // Node-type icon, then the name shifted past it.
                            ui.painter().text(
                                egui::pos2(icon_x, rect.center().y),
                                egui::Align2::LEFT_CENTER,
                                type_icon(row.kind),
                                icon::font_id(11.0),
                                color,
                            );
                            ui.painter().text(
                                egui::pos2(icon_x + HIER_TYPE_ICON_W, rect.center().y),
                                egui::Align2::LEFT_CENTER,
                                &row.name,
                                egui::FontId::proportional(12.0),
                                color,
                            );

                            if resp.drag_started() {
                                started = Some(row.id.clone());
                            }
                            if self.hier_drag.as_ref() == Some(&row.id) && resp.drag_stopped() {
                                released = true;
                            }
                            // A click (never fires on a drag): disclosure
                            // zone toggles expansion, elsewhere selects.
                            if resp.clicked() {
                                let in_disclosure = row.is_container
                                    && resp.interact_pointer_pos().is_some_and(|p| {
                                        p.x < rect.left() + indent + HIER_DISCLOSURE_W
                                    });
                                if in_disclosure {
                                    toggle = Some(row.id.clone());
                                } else {
                                    let additive = ui.input(|i| i.modifiers.command);
                                    click = Some((row.id.clone(), additive));
                                }
                            }
                            // Scroll the freshly selected head into view.
                            if reveal && row.selected {
                                resp.scroll_to_me(Some(egui::Align::Center));
                            }
                        }

                        // A drag started this frame: latch the grabbed row.
                        if let Some(id) = started {
                            self.hier_drag = Some(id);
                        }
                        // While a drag is live, resolve + draw the drop
                        // placement from the live pointer (`HIER-1/2/3`);
                        // commit one recorded move on release.
                        if let Some(pressed_id) = self.hier_drag.clone() {
                            let pressed = rows.iter().position(|r| r.id == pressed_id);
                            let pointer = ui.ctx().pointer_interact_pos();
                            if let (Some(pressed), Some(first), Some(p)) =
                                (pressed, first_rect, pointer)
                            {
                                let bounds = math2::rect::Rectangle {
                                    x: first.left(),
                                    y: first.top(),
                                    width: first.width(),
                                    height: rows.len() as f32 * ROW_H,
                                };
                                let dragged = crate::ui::hierarchy::dragged_ids(&rows, pressed);
                                let target = crate::ui::hierarchy::resolve_drop(
                                    &rows,
                                    &dragged,
                                    [p.x, p.y],
                                    bounds,
                                );
                                if let Some(t) = &target {
                                    match t.indicator {
                                        DropIndicator::Gap(g) => {
                                            let y = first.top() + g as f32 * ROW_H - 1.0;
                                            ui.painter().rect_filled(
                                                egui::Rect::from_min_size(
                                                    egui::pos2(first.left(), y),
                                                    egui::vec2(first.width(), 2.0),
                                                ),
                                                0.0,
                                                HIER_DROP_LINE,
                                            );
                                        }
                                        DropIndicator::Into(r) => {
                                            let y = first.top() + r as f32 * ROW_H;
                                            ui.painter().rect_filled(
                                                egui::Rect::from_min_size(
                                                    egui::pos2(first.left(), y),
                                                    egui::vec2(first.width(), ROW_H),
                                                ),
                                                3.0,
                                                HIER_DROP_BAND,
                                            );
                                        }
                                    }
                                }
                                ui.ctx().set_cursor_icon(egui::CursorIcon::Grabbing);
                                if released {
                                    do_move = target.map(|t| (dragged, t.parent, t.index));
                                }
                            }
                            if released {
                                self.hier_drag = None;
                            }
                        }
                    });

                if let Some(id) = toggle
                    && !self.hier_expanded.remove(&id)
                {
                    self.hier_expanded.insert(id);
                }
                if let Some((id, additive)) = click {
                    // Plain click replaces; cmd/ctrl-click toggles
                    // membership — parity with the retired tree widget.
                    let next = if additive {
                        let mut s = editor.selection().to_vec();
                        if let Some(pos) = s.iter().position(|x| *x == id) {
                            s.remove(pos);
                        } else {
                            s.push(id);
                        }
                        s
                    } else {
                        vec![id]
                    };
                    editor.set_selection(next);
                }
                // Commit the reorder as ONE recorded mutation (undo
                // restores structure exactly) — the same `Mutation::Move`
                // the retired tree's `apply` dispatched.
                if let Some((ids, parent, index)) = do_move {
                    let _ = editor.dispatch(
                        vec![Mutation::Move { ids, parent, index }],
                        Origin::Local,
                        Recording::Record {
                            label: Some("hier.move".to_string()),
                        },
                    );
                }
            });
    }
}

// ── Toolbar ──────────────────────────────────────────────────────────

/// The tool strip, in order: `(command, Lucide icon, name, shortcut)`.
/// The icon is the button face; the name + shortcut ride the hover
/// tooltip (so the shortcut stays discoverable now the face is a glyph).
///
/// The rows dispatch through the [`Command`] registry (like the menu),
/// not a `Tool` fast-path: most are `SetTool`, but the **Pen** is
/// [`Command::PenTool`] (a vector-edit entry, not a `Tool`). Pen (`P`) and
/// Pencil (`⇧P`) form a pair, mirroring Line/Arrow (`L`/`⇧L`) and
/// Frame/Tray (`F`/`⇧F`).
const TOOLBAR_ITEMS: &[(Command, char, &str, &str)] = &[
    (
        Command::SetTool(Tool::Cursor),
        icon::MOUSE_POINTER_2,
        "Cursor",
        "V",
    ),
    (
        Command::SetTool(Tool::Shape(ShapeKind::Rectangle)),
        icon::SQUARE,
        "Rectangle",
        "R",
    ),
    (
        Command::SetTool(Tool::Shape(ShapeKind::Ellipse)),
        icon::CIRCLE,
        "Ellipse",
        "O",
    ),
    (
        Command::SetTool(Tool::Shape(ShapeKind::Polygon)),
        icon::TRIANGLE,
        "Polygon",
        "Y",
    ),
    (
        Command::SetTool(Tool::Container { tray: false }),
        icon::FRAME,
        "Frame",
        "F",
    ),
    (
        Command::SetTool(Tool::Container { tray: true }),
        icon::FRAME,
        "Frame (tray)",
        "⇧F",
    ),
    (Command::SetTool(Tool::Text), icon::TYPE, "Text", "T"),
    (
        Command::SetTool(Tool::Line { arrow: false }),
        icon::MINUS,
        "Line",
        "L",
    ),
    (
        Command::SetTool(Tool::Line { arrow: true }),
        icon::MOVE_UP_RIGHT,
        "Arrow",
        "⇧L",
    ),
    (Command::PenTool, icon::PEN_TOOL, "Pen", "P"),
    (Command::SetTool(Tool::Pencil), icon::PENCIL, "Pencil", "⇧P"),
];

/// The bottom-centered tool strip. Returns the command the user clicked
/// this frame; the shell dispatches it through the registry (`ARCH-3` —
/// the toolbar owns no tool logic). `current` is the active authoring
/// tool and `pen_active` whether the pen/vector entry is engaged, so the
/// right button reads pressed.
pub(crate) fn toolbar(ui: &mut egui::Ui, current: Tool, pen_active: bool) -> Option<Command> {
    let mut picked = None;
    egui::Area::new(egui::Id::new("toolbar.egui"))
        .anchor(egui::Align2::CENTER_BOTTOM, egui::vec2(0.0, -16.0))
        .show(ui.ctx(), |ui| {
            egui::Frame::popup(ui.style()).show(ui, |ui| {
                ui.horizontal(|ui| {
                    for (cmd, glyph, name, shortcut) in TOOLBAR_ITEMS {
                        let selected = match cmd {
                            Command::SetTool(t) => *t == current && !pen_active,
                            Command::PenTool => pen_active,
                            _ => false,
                        };
                        let hit = ui
                            .selectable_label(selected, icon::icon(*glyph))
                            .on_hover_text(format!("{name}  ({shortcut})"));
                        if hit.clicked() {
                            picked = Some(*cmd);
                        }
                    }
                });
            });
        });
    picked
}

// ── Context menu ─────────────────────────────────────────────────────

/// What a frame of the open context menu produced.
pub(crate) enum ContextMenuResult {
    /// Still open, no choice yet.
    Open,
    /// Dismissed (outside click / Esc) — no command.
    Close,
    /// An action was chosen; the shell dispatches it (`MENU-1`).
    Chosen(Command),
}

/// Render the open context menu at `pos` (logical px), using egui's
/// native `Popup` (menu kind) + `SubMenuButton` — real menu styling,
/// real nested submenus, native dismissal. Reuses the `crate::menu`
/// inventory model (`canvas_menu`); only the view is egui.
pub(crate) fn context_menu(ui: &mut egui::Ui, menu: &Menu, pos: egui::Pos2) -> ContextMenuResult {
    let id = egui::Id::new("ctxmenu.egui");
    // We own the open lifetime (via `menu_open` in the shell), so the
    // popup is force-open each frame; `open` flips to false when egui's
    // close-on-click-outside fires, which we surface as `Close`.
    let mut open = true;
    let inner = egui::Popup::new(
        id,
        ui.ctx().clone(),
        egui::PopupAnchor::Position(pos),
        egui::LayerId::new(egui::Order::Foreground, id),
    )
    .kind(egui::PopupKind::Menu)
    .open_bool(&mut open)
    .close_behavior(egui::PopupCloseBehavior::CloseOnClickOutside)
    .show(|ui| {
        // Raw `Popup` doesn't apply the menu look the higher-level
        // `MenuButton` does: `menu_style` makes items frameless (no grey
        // pill, highlight only on hover) and the justified top-down
        // layout makes each item a full-width row.
        egui::containers::menu::menu_style(ui.style_mut());
        let mut chosen: Option<Command> = None;
        ui.with_layout(egui::Layout::top_down_justified(egui::Align::Min), |ui| {
            menu_items(ui, &menu.items, &mut chosen);
        });
        chosen
    });

    if let Some(cmd) = inner.and_then(|r| r.inner) {
        ContextMenuResult::Chosen(cmd)
    } else if !open {
        ContextMenuResult::Close
    } else {
        ContextMenuResult::Open
    }
}

fn menu_items(ui: &mut egui::Ui, items: &[Item], chosen: &mut Option<Command>) {
    for item in items {
        match item {
            Item::Action(a) => {
                if ui
                    .add_enabled(a.enabled, egui::Button::new(a.label))
                    .clicked()
                {
                    *chosen = Some(a.command);
                }
            }
            Item::Submenu(s) => {
                egui::containers::menu::SubMenuButton::new(s.label)
                    .ui(ui, |ui| menu_items(ui, &s.items, chosen));
            }
            Item::Separator => {
                ui.separator();
            }
            Item::Deferred(d) => {
                ui.add_enabled(false, egui::Button::new(d.label));
            }
        }
    }
}

// ── Sections ─────────────────────────────────────────────────────────

fn scene_section(ui: &mut egui::Ui, editor: &mut Editor) {
    section(ui, "Scene", |ui| {
        grid(ui, "g.scene", |ui| {
            lbl(ui, "Background");
            ui.horizontal(|ui| {
                let mut c = to_c32(
                    editor
                        .background_color()
                        .unwrap_or(CGColor::from_rgba(255, 255, 255, 255)),
                );
                if ui.color_edit_button_srgba(&mut c).changed() {
                    emit_commit(
                        editor,
                        BindingProperty::SceneBackground,
                        None,
                        &[],
                        "ui.scene.bg",
                        BindingValue::Color(from_c32(c)),
                    );
                }
                if ui.button("Clear").clicked() {
                    let _ = editor.dispatch(
                        vec![Mutation::SceneBackground { color: None }],
                        Origin::Local,
                        Recording::Record {
                            label: Some("ui.scene.bg".to_string()),
                        },
                    );
                }
            });
            ui.end_row();
        });
    });
}

fn text_section(ui: &mut egui::Ui, editor: &mut Editor, head: &Id, sel: &[Id]) {
    section(ui, "Text", |ui| {
        grid(ui, "g.text", |ui| {
            if let Some(sz) = editor.node_font_size(head) {
                lbl(ui, "Size");
                let mut v = sz;
                let r = num(ui, &mut v, 0.5);
                emit_scalar(
                    editor,
                    &r,
                    BindingProperty::FontSize,
                    None,
                    sel,
                    "ui.font_size",
                    BindingValue::Number(v.max(1.0)),
                );
                ui.end_row();
            }
            if let Some(w) = editor.node_font_weight(head) {
                lbl(ui, "Weight");
                let cur = font_weight_index(w);
                if let Some(i) = combo(ui, "props.weight", cur, &labels(FONT_WEIGHTS), VAL_W) {
                    emit_commit(
                        editor,
                        BindingProperty::FontWeight,
                        None,
                        sel,
                        "ui.font_weight",
                        BindingValue::Index(i),
                    );
                }
                ui.end_row();
            }
            if let Some(mut it) = editor.node_font_italic(head) {
                lbl(ui, "Italic");
                if ui.checkbox(&mut it, "").changed() {
                    emit_commit(
                        editor,
                        BindingProperty::FontItalic,
                        None,
                        sel,
                        "ui.italic",
                        BindingValue::Bool(it),
                    );
                }
                ui.end_row();
            }
            if let Some(lh) = editor.node_line_height(head) {
                lbl(ui, "Line");
                let mut v = lh;
                let r = num(ui, &mut v, 0.05);
                emit_scalar(
                    editor,
                    &r,
                    BindingProperty::LineHeight,
                    None,
                    sel,
                    "ui.line_height",
                    BindingValue::Number(v.max(0.0)),
                );
                ui.end_row();
            }
            if let Some(ls) = editor.node_letter_spacing(head) {
                lbl(ui, "Letter");
                let mut v = ls;
                let r = num(ui, &mut v, 0.1);
                emit_scalar(
                    editor,
                    &r,
                    BindingProperty::LetterSpacing,
                    None,
                    sel,
                    "ui.letter_spacing",
                    BindingValue::Number(v),
                );
                ui.end_row();
            }
            if let Some(a) = editor.node_text_align(head) {
                lbl(ui, "Align");
                let cur = TEXT_ALIGNS.iter().position(|(_, v)| *v == a).unwrap_or(0);
                if let Some(i) = combo(ui, "props.talign", cur, &labels(TEXT_ALIGNS), VAL_W) {
                    emit_commit(
                        editor,
                        BindingProperty::TextAlign,
                        None,
                        sel,
                        "ui.text_align",
                        BindingValue::Index(i),
                    );
                }
                ui.end_row();
            }
            if let Some(v) = editor.node_text_align_vertical(head) {
                lbl(ui, "Vertical");
                let cur = TEXT_ALIGN_VERTICALS
                    .iter()
                    .position(|(_, x)| *x == v)
                    .unwrap_or(0);
                if let Some(i) = combo(
                    ui,
                    "props.valign",
                    cur,
                    &labels(TEXT_ALIGN_VERTICALS),
                    VAL_W,
                ) {
                    emit_commit(
                        editor,
                        BindingProperty::TextAlignVertical,
                        None,
                        sel,
                        "ui.valign",
                        BindingValue::Index(i),
                    );
                }
                ui.end_row();
            }
        });
    });
}

#[derive(Clone, Copy, PartialEq)]
enum PaintKind {
    Fill,
    Stroke,
}

fn paint_section(ui: &mut egui::Ui, editor: &mut Editor, head: &Id, sel: &[Id], target: PaintKind) {
    let (title, stack, list_prop, color_prop, kind_prop, id_prefix, label_prefix) = match target {
        PaintKind::Fill => (
            "Fills",
            editor.node_fills(head),
            BindingProperty::Fills,
            BindingProperty::FillColor,
            BindingProperty::FillKind,
            "fill",
            "ui.fill",
        ),
        PaintKind::Stroke => (
            "Strokes",
            editor.node_strokes(head),
            BindingProperty::Strokes,
            BindingProperty::StrokeColor,
            BindingProperty::StrokeKind,
            "stroke",
            "ui.stroke",
        ),
    };
    let Some(paints) = stack else { return };
    if section_add(ui, title) {
        emit_listop(
            editor,
            list_prop,
            sel,
            &format!("{label_prefix}s"),
            ListOp::Add,
        );
    }
    for (i, paint) in paints.as_slice().iter().enumerate() {
        ui.horizontal(|ui| {
            if let Paint::Image(_) = paint {
                ui.label("Image");
            } else {
                // Color swatch (built-in egui picker replaces the popover).
                let mut c = to_c32(paint_swatch_color(paint));
                if ui.color_edit_button_srgba(&mut c).changed() {
                    emit_commit(
                        editor,
                        color_prop,
                        Some(i),
                        sel,
                        &format!("{label_prefix}.color"),
                        BindingValue::Color(from_c32(c)),
                    );
                }
                let cur = paint_kind_index(paint);
                if let Some(k) = combo(
                    ui,
                    &format!("props.{id_prefix}.kind.{i}"),
                    cur,
                    PAINT_KINDS,
                    96.0,
                ) {
                    emit_commit(
                        editor,
                        kind_prop,
                        Some(i),
                        sel,
                        &format!("{label_prefix}.kind"),
                        BindingValue::Index(k),
                    );
                }
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if remove_button(ui).clicked() {
                    emit_listop(
                        editor,
                        list_prop,
                        sel,
                        &format!("{label_prefix}s"),
                        ListOp::Remove(i),
                    );
                }
            });
        });
    }
}

fn stroke_geometry_section(ui: &mut egui::Ui, editor: &mut Editor, head: &Id, sel: &[Id]) {
    section(ui, "Stroke", |ui| {
        grid(ui, "g.strokegeom", |ui| {
            if let Some(w) = editor.node_stroke_width(head) {
                lbl(ui, "Weight");
                let mut v = w;
                let r = num(ui, &mut v, 0.25);
                emit_scalar(
                    editor,
                    &r,
                    BindingProperty::StrokeWidth,
                    None,
                    sel,
                    "ui.stroke_width",
                    BindingValue::Number(v.max(0.0)),
                );
                ui.end_row();
            }
            if let Some(a) = editor.node_stroke_align(head) {
                lbl(ui, "Align");
                let cur = STROKE_ALIGNS.iter().position(|(_, v)| *v == a).unwrap_or(0);
                if let Some(i) = combo(ui, "props.salign", cur, &labels(STROKE_ALIGNS), VAL_W) {
                    emit_commit(
                        editor,
                        BindingProperty::StrokeAlign,
                        None,
                        sel,
                        "ui.stroke_align",
                        BindingValue::Index(i),
                    );
                }
                ui.end_row();
            }
            if let Some(c) = editor.node_stroke_cap(head) {
                lbl(ui, "Cap");
                let cur = STROKE_CAPS.iter().position(|(_, v)| *v == c).unwrap_or(0);
                if let Some(i) = combo(ui, "props.scap", cur, &labels(STROKE_CAPS), VAL_W) {
                    emit_commit(
                        editor,
                        BindingProperty::StrokeCap,
                        None,
                        sel,
                        "ui.stroke_cap",
                        BindingValue::Index(i),
                    );
                }
                ui.end_row();
            }
            if let Some(j) = editor.node_stroke_join(head) {
                lbl(ui, "Join");
                let cur = STROKE_JOINS.iter().position(|(_, v)| *v == j).unwrap_or(0);
                if let Some(i) = combo(ui, "props.sjoin", cur, &labels(STROKE_JOINS), VAL_W) {
                    emit_commit(
                        editor,
                        BindingProperty::StrokeJoin,
                        None,
                        sel,
                        "ui.stroke_join",
                        BindingValue::Index(i),
                    );
                }
                ui.end_row();
                // Miter limit only when join = Miter (index 0).
                if cur == 0
                    && let Some(m) = editor.node_stroke_miter(head)
                {
                    lbl(ui, "Miter");
                    let mut v = m;
                    let r = num(ui, &mut v, 0.1);
                    emit_scalar(
                        editor,
                        &r,
                        BindingProperty::StrokeMiter,
                        None,
                        sel,
                        "ui.stroke_miter",
                        BindingValue::Number(v.max(0.0)),
                    );
                    ui.end_row();
                }
            }
            if let Some(d) = editor.node_stroke_dash(head) {
                lbl(ui, "Dash");
                let mut v = d.first().copied().unwrap_or(0.0);
                let r = num(ui, &mut v, 0.5);
                emit_scalar(
                    editor,
                    &r,
                    BindingProperty::StrokeDash,
                    None,
                    sel,
                    "ui.stroke_dash",
                    BindingValue::Number(v.max(0.0)),
                );
                ui.end_row();
            }
        });
    });
}

fn effects_section(ui: &mut egui::Ui, editor: &mut Editor, head: &Id, sel: &[Id]) {
    let Some(fx) = editor.node_effects(head) else {
        return;
    };
    section(ui, "Effects", |ui| {
        grid(ui, "g.effects", |ui| {
            // Layer blur (single slot).
            let mut blur_on = fx.blur.is_some();
            lbl(ui, "Layer blur");
            if ui.checkbox(&mut blur_on, "").changed() {
                emit_commit(
                    editor,
                    BindingProperty::LayerBlurEnabled,
                    None,
                    sel,
                    "ui.blur",
                    BindingValue::Bool(blur_on),
                );
            }
            ui.end_row();
            if let Some(b) = fx.blur.as_ref() {
                lbl(ui, "Radius");
                let mut v = blur_radius(&b.blur);
                let r = num(ui, &mut v, 0.5);
                emit_scalar(
                    editor,
                    &r,
                    BindingProperty::LayerBlurRadius,
                    None,
                    sel,
                    "ui.blur_radius",
                    BindingValue::Number(v.max(0.0)),
                );
                ui.end_row();
            }
        });
    });

    // Shadows (list).
    if section_add(ui, "Shadows") {
        emit_listop(
            editor,
            BindingProperty::Shadows,
            sel,
            "ui.shadows",
            ListOp::Add,
        );
    }
    for (i, s) in fx.shadows.iter().enumerate() {
        let p = shadow_params(s);
        ui.horizontal(|ui| {
            let mut c = to_c32(p.color);
            if ui.color_edit_button_srgba(&mut c).changed() {
                emit_commit(
                    editor,
                    BindingProperty::ShadowColor,
                    Some(i),
                    sel,
                    "ui.shadow.color",
                    BindingValue::Color(from_c32(c)),
                );
            }
            let cur = bind::shadow_kind_index(s);
            if let Some(k) = combo(
                ui,
                &format!("props.shadow.kind.{i}"),
                cur,
                SHADOW_KINDS,
                84.0,
            ) {
                emit_commit(
                    editor,
                    BindingProperty::ShadowKind,
                    Some(i),
                    sel,
                    "ui.shadow.kind",
                    BindingValue::Index(k),
                );
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if remove_button(ui).clicked() {
                    emit_listop(
                        editor,
                        BindingProperty::Shadows,
                        sel,
                        "ui.shadows",
                        ListOp::Remove(i),
                    );
                }
            });
        });
        ui.horizontal(|ui| {
            let mut dx = p.dx;
            let rdx = pair(ui, &mut dx, 0.5, "X");
            emit_scalar(
                editor,
                &rdx,
                BindingProperty::ShadowDx,
                Some(i),
                sel,
                "ui.shadow.dx",
                BindingValue::Number(dx),
            );
            let mut dy = p.dy;
            let rdy = pair(ui, &mut dy, 0.5, "Y");
            emit_scalar(
                editor,
                &rdy,
                BindingProperty::ShadowDy,
                Some(i),
                sel,
                "ui.shadow.dy",
                BindingValue::Number(dy),
            );
        });
        ui.horizontal(|ui| {
            let mut bl = p.blur;
            let rbl = pair(ui, &mut bl, 0.5, "B");
            emit_scalar(
                editor,
                &rbl,
                BindingProperty::ShadowBlur,
                Some(i),
                sel,
                "ui.shadow.blur",
                BindingValue::Number(bl.max(0.0)),
            );
            let mut sp = p.spread;
            let rsp = pair(ui, &mut sp, 0.5, "S");
            emit_scalar(
                editor,
                &rsp,
                BindingProperty::ShadowSpread,
                Some(i),
                sel,
                "ui.shadow.spread",
                BindingValue::Number(sp),
            );
        });
    }
}

// ── Emission helpers (the only writers — all through `bind::apply`) ───

fn mk(property: BindingProperty, entry: Option<usize>, targets: &[Id], label: &str) -> Binding {
    Binding {
        property,
        targets: targets.to_vec(),
        label: label.to_string(),
        entry,
    }
}

/// Apply a single-phase emission (the `mk` + `apply` dance).
fn emit_one(
    editor: &mut Editor,
    property: BindingProperty,
    entry: Option<usize>,
    targets: &[Id],
    label: &str,
    phase: BindingPhase,
) {
    bind::apply(
        editor,
        &[Emission {
            binding: mk(property, entry, targets, label),
            phase,
        }],
    );
}

/// One-shot discrete change: Begin + Commit, one history entry.
fn emit_commit(
    editor: &mut Editor,
    property: BindingProperty,
    entry: Option<usize>,
    targets: &[Id],
    label: &str,
    value: BindingValue,
) {
    let b = mk(property, entry, targets, label);
    bind::apply(
        editor,
        &[
            Emission {
                binding: b.clone(),
                phase: BindingPhase::Begin,
            },
            Emission {
                binding: b,
                phase: BindingPhase::Commit(value),
            },
        ],
    );
}

/// A structural list edit (add/remove/reorder), commit-only.
fn emit_listop(
    editor: &mut Editor,
    property: BindingProperty,
    targets: &[Id],
    label: &str,
    op: ListOp,
) {
    emit_commit(
        editor,
        property,
        None,
        targets,
        label,
        BindingValue::ListOp(op),
    );
}

/// A drag-framed scalar: Begin on drag start, Preview while dragging,
/// Commit on release — so a slider/DragValue drag is ONE undo entry. A
/// typed edit (no drag) collapses to a one-shot Begin+Commit.
#[allow(clippy::too_many_arguments)]
fn emit_scalar(
    editor: &mut Editor,
    resp: &egui::Response,
    property: BindingProperty,
    entry: Option<usize>,
    targets: &[Id],
    label: &str,
    value: BindingValue,
) {
    if resp.drag_started() {
        emit_one(editor, property, entry, targets, label, BindingPhase::Begin);
    }
    if resp.dragged() && resp.changed() {
        emit_one(
            editor,
            property,
            entry,
            targets,
            label,
            BindingPhase::Preview(value.clone()),
        );
    }
    if resp.drag_stopped() {
        emit_one(
            editor,
            property,
            entry,
            targets,
            label,
            BindingPhase::Commit(value.clone()),
        );
    }
    if resp.changed() && !resp.dragged() && !resp.drag_stopped() {
        emit_commit(editor, property, entry, targets, label, value);
    }
}

// ── Design primitives ────────────────────────────────────────────────

/// Field-label column width, and the uniform value-control width.
const LABEL_W: f32 = 56.0;
const VAL_W: f32 = 132.0;

// ── Hierarchy tree metrics + neutral palette (no accent colour) ───────
// Row height + indent are `hierarchy::{ROW_H, INDENT}` (imported): the
// drop-resolution geometry and this rendering must share one source.
/// The disclosure-triangle gutter width (rendering-only).
const HIER_DISCLOSURE_W: f32 = 13.0;
/// Gutter reserved for a row's node-type icon, before the name.
const HIER_TYPE_ICON_W: f32 = 16.0;

/// The Lucide glyph for a node's display category — the editor-semantic
/// node→icon mapping (kept here at the call site, not in `icon`, which
/// stays an agnostic Lucide mirror). Shape kinds reuse the tool glyphs.
fn type_icon(kind: NodeKind) -> char {
    match kind {
        NodeKind::Frame => icon::FRAME,
        NodeKind::Group => icon::GROUP,
        NodeKind::Boolean => icon::COMBINE,
        NodeKind::Rectangle => icon::SQUARE,
        NodeKind::Ellipse => icon::CIRCLE,
        NodeKind::Polygon => icon::TRIANGLE,
        NodeKind::Star => icon::STAR,
        NodeKind::Line => icon::MINUS,
        NodeKind::Text => icon::TYPE,
        NodeKind::Vector => icon::PEN_TOOL,
        NodeKind::Image => icon::IMAGE,
        NodeKind::Other => icon::BOX,
    }
}
/// Selected / hovered row fills — greys, not the selection accent.
const HIER_SEL_BG: egui::Color32 = egui::Color32::from_gray(216);
const HIER_HOVER_BG: egui::Color32 = egui::Color32::from_gray(232);
/// Row text: normal, dimmed (hidden node), and the disclosure glyph.
const HIER_TEXT: egui::Color32 = egui::Color32::from_gray(60);
const HIER_TEXT_INACTIVE: egui::Color32 = egui::Color32::from_gray(165);
const HIER_DISCLOSURE: egui::Color32 = egui::Color32::from_gray(120);
/// Drop feedback while dragging — neutral, no accent: a gap line and an
/// "into a container" band.
const HIER_DROP_LINE: egui::Color32 = egui::Color32::from_gray(70);
const HIER_DROP_BAND: egui::Color32 = egui::Color32::from_black_alpha(26);

/// A section: a small, muted, all-caps header, then its body. Grouping
/// is carried by type + whitespace, not heavy separator rules.
fn section(ui: &mut egui::Ui, title: &str, body: impl FnOnce(&mut egui::Ui)) {
    ui.add_space(12.0);
    ui.label(section_title(title));
    ui.add_space(6.0);
    body(ui);
}

/// A list-section header (`title` + a right-aligned add button); returns
/// whether add was clicked this frame.
fn section_add(ui: &mut egui::Ui, title: &str) -> bool {
    ui.add_space(12.0);
    let mut clicked = false;
    ui.horizontal(|ui| {
        ui.label(section_title(title));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if ui
                .add(egui::Button::new(icon::icon(icon::PLUS)).frame(false))
                .clicked()
            {
                clicked = true;
            }
        });
    });
    ui.add_space(6.0);
    clicked
}

fn section_title(title: &str) -> egui::RichText {
    egui::RichText::new(title.to_uppercase())
        .size(10.5)
        .strong()
        .color(egui::Color32::from_gray(125))
}

/// Two-column field grid: labels left-aligned in a fixed column,
/// controls aligned in the next.
fn grid(ui: &mut egui::Ui, id: &str, body: impl FnOnce(&mut egui::Ui)) {
    egui::Grid::new(id)
        .num_columns(2)
        .min_col_width(LABEL_W)
        .spacing([8.0, 6.0])
        .show(ui, body);
}

/// A muted field label (grid column 1).
fn lbl(ui: &mut egui::Ui, text: &str) {
    ui.label(egui::RichText::new(text).color(egui::Color32::from_gray(95)));
}

/// A fixed-width number field — the uniform value column.
fn num(ui: &mut egui::Ui, value: &mut f32, speed: f32) -> egui::Response {
    ui.add_sized(
        [VAL_W, ui.spacing().interact_size.y],
        egui::DragValue::new(value).speed(speed),
    )
}

/// A half-width number field with a leading axis tag, for two-up rows
/// (position X/Y, size W/H, shadow offsets).
fn pair(ui: &mut egui::Ui, value: &mut f32, speed: f32, tag: &str) -> egui::Response {
    ui.add_sized(
        [VAL_W / 2.0 - 3.0, ui.spacing().interact_size.y],
        egui::DragValue::new(value)
            .speed(speed)
            .prefix(format!("{tag}  ")),
    )
}

/// A frameless remove control for list rows.
fn remove_button(ui: &mut egui::Ui) -> egui::Response {
    ui.add(egui::Button::new(icon::icon(icon::X).color(egui::Color32::from_gray(140))).frame(false))
}

/// A one-of-N combo of the given width; returns the new index on change.
fn combo(
    ui: &mut egui::Ui,
    id: &str,
    current: usize,
    labels: &[&str],
    width: f32,
) -> Option<usize> {
    let mut idx = current;
    let selected = labels.get(current).copied().unwrap_or("");
    egui::ComboBox::from_id_salt(id)
        .selected_text(selected)
        .width(width)
        .show_ui(ui, |ui| {
            for (i, name) in labels.iter().enumerate() {
                ui.selectable_value(&mut idx, i, *name);
            }
        });
    (idx != current).then_some(idx)
}

/// The `&str` names of a `(name, value)` table, for [`combo`].
fn labels<T>(table: &[(&'static str, T)]) -> Vec<&'static str> {
    table.iter().map(|(n, _)| *n).collect()
}

fn to_c32(c: CGColor) -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(c.r, c.g, c.b, c.a)
}

fn from_c32(c: egui::Color32) -> CGColor {
    let [r, g, b, a] = c.to_srgba_unmultiplied();
    CGColor::from_rgba(r, g, b, a)
}

fn paint_swatch_color(paint: &Paint) -> CGColor {
    let first_stop = |stops: &[grida::cg::prelude::GradientStop]| {
        stops
            .first()
            .map(|s| s.color)
            .unwrap_or(CGColor::from_rgba(0, 0, 0, 255))
    };
    match paint {
        Paint::Solid(p) => p.color,
        Paint::LinearGradient(p) => first_stop(&p.stops),
        Paint::RadialGradient(p) => first_stop(&p.stops),
        Paint::SweepGradient(p) => first_stop(&p.stops),
        Paint::DiamondGradient(p) => first_stop(&p.stops),
        Paint::Image(_) => CGColor::from_rgba(200, 200, 200, 255),
    }
}

fn paint_kind_index(paint: &Paint) -> usize {
    match paint {
        Paint::Solid(_) => 0,
        Paint::LinearGradient(_) => 1,
        Paint::RadialGradient(_) => 2,
        Paint::SweepGradient(_) => 3,
        Paint::DiamondGradient(_) => 4,
        Paint::Image(_) => 0,
    }
}
