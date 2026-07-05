//! The properties strip — the M3 seed of the inspector
//! (`crates/grida_editor/docs/properties.md`).
//!
//! Contains no editing logic (`ARCH-3`): it **reads** the editor via
//! queries and **writes** only through widget bindings. On [`sync`] it
//! compares the current selection's values against the snapshot the
//! panel was last built from and rebuilds exactly the widgets whose
//! displayed value changed — the observation-granularity seed
//! (`PROP-7`: a dispatch changing only the name does not rebuild the
//! opacity slider's subtree). A selection change rebuilds the whole
//! panel.
//!
//! M3 scope: the panel binds to the **first** selected node's values
//! and broadcasts commits to the whole selection; the mixed-value
//! model (`PROP-2`, `WID-6`) is a later task. The **Fills** section is
//! the general paint-list domain (`fills`): a list of paint entries
//! (`SHEET-3`) — add / remove / toggle-active, per-entry kind
//! (solid / gradient) and color (through the picker). Image paints are
//! shown but their source is host-gated; the gradient stop-track editor
//! and stroke sections are named-and-deferred (fills-first slice).
//!
//! [`sync`]: PropertiesPanel::sync

use grida::cg::prelude::{CGColor, Paint};
use grida::node::schema::Size;
use math2::rect::Rectangle;

use crate::document::Id;
use crate::editor::Editor;
use crate::ui::UiLayer;
use crate::ui::bind::{
    BLEND_MODES, Binding, BindingProperty, BindingValue, ListOp, PAINT_KINDS, TEXT_ALIGNS,
};
use crate::ui::field::Field;
use crate::ui::widget::{Widget, WidgetState};
use crate::ui::widgets::color_picker::PickerState;
use crate::ui::widgets::{
    Button, ColorPicker, Label, Number, Panel, Row, Segment, Segmented, Select, Slider, Swatch,
    SwatchAction, Text, Toggle, ToggleLook,
};

/// Widget identity slots (stable across value rebuilds — identity is
/// what `PROP-7` asserts against).
pub const PANEL_ID: &str = "props.panel";
pub const NAME_ID: &str = "props.name";
pub const VISIBLE_ID: &str = "props.visible";
pub const VISIBLE_ROW_ID: &str = "props.visible.row";
pub const ROTATION_ID: &str = "props.rotation";
pub const ROTATION_ROW_ID: &str = "props.rotation.row";
pub const BLEND_ID: &str = "props.blend";
pub const BLEND_ROW_ID: &str = "props.blend.row";
pub const CORNER_ID: &str = "props.corner";
pub const CORNER_ROW_ID: &str = "props.corner.row";
pub const COUNT_ID: &str = "props.count";
pub const COUNT_ROW_ID: &str = "props.count.row";
pub const CLIP_ID: &str = "props.clip";
pub const CLIP_ROW_ID: &str = "props.clip.row";
pub const ALIGN_ID: &str = "props.align";
pub const ALIGN_ROW_ID: &str = "props.align.row";
pub const BG_ROW_ID: &str = "props.scene.bg.row";
pub const BG_ID: &str = "props.scene.bg";
pub const BG_CLEAR_ID: &str = "props.scene.bg.clear";
pub const OPACITY_ROW_ID: &str = "props.opacity.row";
pub const OPACITY_ID: &str = "props.opacity";
/// Fills section widget ids. The section is a list of paint entries
/// (`SHEET-3`); per-entry sub-controls are addressed by their fill
/// index so a generic atom edits `fills[i]` through its binding's
/// `entry` (see [`Binding::entry`]).
pub const FILLS_HEADER_ID: &str = "props.fills.header";
pub const FILLS_ADD_ID: &str = "props.fills.add";

/// The row hosting fill entry `i`.
pub fn fill_row_id(i: usize) -> String {
    format!("props.fill.{i}.row")
}
/// The color swatch of fill entry `i` (opens the picker).
pub fn fill_swatch_id(i: usize) -> String {
    format!("props.fill.{i}.swatch")
}
/// The kind select of fill entry `i`.
pub fn fill_kind_id(i: usize) -> String {
    format!("props.fill.{i}.kind")
}
/// The active toggle of fill entry `i`.
pub fn fill_active_id(i: usize) -> String {
    format!("props.fill.{i}.active")
}
/// The remove button of fill entry `i`.
pub fn fill_remove_id(i: usize) -> String {
    format!("props.fill.{i}.remove")
}
/// The "Image" label of an image fill entry `i`.
pub fn fill_label_id(i: usize) -> String {
    format!("props.fill.{i}.label")
}
pub const X_ID: &str = "props.x";
pub const Y_ID: &str = "props.y";
pub const W_ID: &str = "props.w";
pub const H_ID: &str = "props.h";
/// The color-picker popover the fill/background swatch opens.
pub const PICKER_ID: &str = "props.picker";
/// Picker popover content width, logical px.
const PICKER_W: f32 = 200.0;

/// The X/Y/W/H numeric slots, in build order.
const NUMBER_IDS: [&str; 4] = [X_ID, Y_ID, W_ID, H_ID];

/// What the panel was last built from.
///
/// PROP-2 gap, stated honestly: on a multi-selection the panel shows
/// the **first** node's values (no mixed-state rendering yet, `WID-6`
/// deferred); commits broadcast to every selected node that supports
/// the property (unsupported targets are skipped in the bind layer).
#[derive(Debug, Clone, PartialEq)]
struct Snapshot {
    selection: Vec<Id>,
    name: String,
    /// Head node's visibility (`active`).
    visible: bool,
    /// Head node's rotation in **degrees** (the node stores radians).
    rotation: f32,
    /// Head node's blend mode as an index into `BLEND_MODES`.
    blend: usize,
    opacity: f32,
    /// Head node's whole fill stack (bottom→top), or `None` when the
    /// kind carries no fills (the Fills-section capability gate). The
    /// panel displays top-most-first at build time; the stored order is
    /// document/paint order.
    fills: Option<Vec<Paint>>,
    /// Head node's position, when it has one.
    position: Option<(f32, f32)>,
    /// Head node's concrete size, when it has one.
    size: Option<(f32, f32)>,
    /// Appearance-batch rows, present only for the kinds that carry
    /// them (each `Some` renders its row; a presence change is a
    /// structure change → full mount).
    corner_radius: Option<f32>,
    point_count: Option<usize>,
    clips_content: Option<bool>,
    /// Text alignment as an index into `TEXT_ALIGNS`.
    text_align: Option<usize>,
    /// Typed-entry buffers of the X/Y/W/H inputs (retained widget
    /// state; part of the snapshot so a keystroke rebuilds the edited
    /// input's displayed text).
    buffers: [Option<String>; 4],
    /// Edit buffers of the name text input and the rotation number —
    /// same reason as `buffers`: a keystroke rebuilds the shown text.
    name_buffer: Option<String>,
    rotation_buffer: Option<String>,
    /// Edit buffers of the corner-radius and point-count numbers.
    corner_buffer: Option<String>,
    count_buffer: Option<String>,
}

/// What the scene-mode panel (empty selection) was last built from.
#[derive(Debug, Clone, Copy, PartialEq)]
struct SceneSnapshot {
    background: Option<CGColor>,
}

/// The presence signature of the Option-gated appearance rows; a
/// change means a row appeared/vanished (a structure change).
fn optional_rows(s: &Snapshot) -> (bool, bool, bool, bool) {
    (
        s.corner_radius.is_some(),
        s.point_count.is_some(),
        s.clips_content.is_some(),
        s.text_align.is_some(),
    )
}

/// A candidate swatch the picker may open from: `(widget id, bound
/// property, fill entry, targets, history label)`.
type SwatchRequest = (String, BindingProperty, Option<usize>, Vec<Id>, String);

/// Which color the open picker edits and where it floats — the
/// panel's picker-host bookkeeping.
#[derive(Debug, Clone)]
struct PickerOpen {
    property: BindingProperty,
    targets: Vec<Id>,
    /// The fill index this picker edits, for a `FillColor` binding
    /// (`None` for the scene background).
    entry: Option<usize>,
    label: String,
    /// Popover top-left, world/logical px.
    anchor: [f32; 2],
    /// The swatch that opened it — excluded from outside-dismiss so
    /// the opening gesture's residual press does not close the picker.
    trigger: Rectangle,
}

/// The right-side properties strip: with a selection, the node
/// inspector (name label, opacity slider — the hot path — fill
/// swatch); with an empty selection, the **scene's** properties — the
/// background color control. The panel never unmounts to nothing.
pub struct PropertiesPanel {
    /// Fixed strip width, logical px (`SHELL` fixed panel widths).
    pub width: f32,
    snapshot: Option<Snapshot>,
    scene_snapshot: Option<SceneSnapshot>,
    /// The open color picker, when a swatch has activated it.
    picker: Option<PickerOpen>,
}

impl PropertiesPanel {
    pub fn new(width: f32) -> Self {
        Self {
            width,
            snapshot: None,
            scene_snapshot: None,
            picker: None,
        }
    }

    /// Forget the built state; the next [`sync`](Self::sync) does a
    /// full rebuild (viewport changes, external invalidation).
    pub fn invalidate(&mut self) {
        self.snapshot = None;
        self.scene_snapshot = None;
    }

    /// Drain the scene panel's clear-background click, if any (the
    /// shell dispatches the actual mutation — the panel contains no
    /// editing logic, `ARCH-3`).
    pub fn take_clear_background(&mut self, ui: &mut UiLayer) -> bool {
        match ui.state_mut(&BG_CLEAR_ID.to_string()) {
            Some(WidgetState::Button(s)) if s.clicks > 0 => {
                s.clicks = 0;
                true
            }
            _ => false,
        }
    }

    /// Reconcile the panel with the editor: scene mode on empty
    /// selection, full rebuild on selection change, per-widget rebuild
    /// on value change (`PROP-7`), no-op when nothing displayed
    /// changed.
    pub fn sync(&mut self, ui: &mut UiLayer, editor: &Editor) {
        // Picker host: a swatch activation opens the color-picker
        // popover; while it is open the panel full-mounts itself plus
        // the picker (the incremental PROP-7 path resumes once it
        // closes). The picker's Color emissions reach the document
        // through the same binding the swatch carried (ARCH-3).
        self.drain_picker(ui, editor);
        if self.picker.is_some() {
            self.mount_with_picker(ui, editor);
            return;
        }

        let selection: Vec<Id> = editor.selection().to_vec();
        if selection.is_empty() {
            // Scene mode: the scene's own properties.
            let snapshot = SceneSnapshot {
                background: editor.background_color(),
            };
            if self.snapshot.take().is_some() || self.scene_snapshot != Some(snapshot) {
                ui.mount(vec![Box::new(self.scene_panel(ui.viewport(), &snapshot))]);
                self.scene_snapshot = Some(snapshot);
            }
            return;
        }
        self.scene_snapshot = None;

        let snapshot = self.node_snapshot(ui, editor, selection);

        match &self.snapshot {
            Some(prev) if prev.selection == snapshot.selection => {
                // Same selection: rebuild only what changed.
                if prev == &snapshot {
                    return;
                }
                // The Option-gated appearance rows appearing/vanishing
                // is a structure change → rebuild the whole panel.
                if optional_rows(prev) != optional_rows(&snapshot) {
                    ui.mount(vec![Box::new(self.panel(ui.viewport(), &snapshot))]);
                    self.snapshot = Some(snapshot);
                    return;
                }
                if prev.name != snapshot.name || prev.name_buffer != snapshot.name_buffer {
                    ui.rebuild_widget(&NAME_ID.to_string(), Box::new(self.name_text(&snapshot)));
                }
                if prev.visible != snapshot.visible {
                    ui.rebuild_widget(
                        &VISIBLE_ID.to_string(),
                        Box::new(self.visible_toggle(&snapshot)),
                    );
                }
                if prev.rotation != snapshot.rotation
                    || prev.rotation_buffer != snapshot.rotation_buffer
                {
                    ui.rebuild_widget(
                        &ROTATION_ID.to_string(),
                        Box::new(self.rotation_number(&snapshot)),
                    );
                }
                if prev.opacity != snapshot.opacity {
                    ui.rebuild_widget(&OPACITY_ID.to_string(), Box::new(self.slider(&snapshot)));
                }
                if prev.blend != snapshot.blend {
                    ui.rebuild_widget(
                        &BLEND_ID.to_string(),
                        Box::new(self.blend_select(&snapshot)),
                    );
                }
                if prev.corner_radius != snapshot.corner_radius
                    || prev.corner_buffer != snapshot.corner_buffer
                {
                    ui.rebuild_widget(
                        &CORNER_ID.to_string(),
                        Box::new(self.corner_number(&snapshot)),
                    );
                }
                if prev.point_count != snapshot.point_count
                    || prev.count_buffer != snapshot.count_buffer
                {
                    ui.rebuild_widget(
                        &COUNT_ID.to_string(),
                        Box::new(self.count_number(&snapshot)),
                    );
                }
                if prev.clips_content != snapshot.clips_content {
                    ui.rebuild_widget(&CLIP_ID.to_string(), Box::new(self.clip_toggle(&snapshot)));
                }
                if prev.text_align != snapshot.text_align {
                    ui.rebuild_widget(
                        &ALIGN_ID.to_string(),
                        Box::new(self.align_segmented(&snapshot)),
                    );
                }
                match (prev.position.is_some(), prev.size.is_some())
                    == (snapshot.position.is_some(), snapshot.size.is_some())
                {
                    true => {
                        if prev.position != snapshot.position
                            || prev.buffers[0] != snapshot.buffers[0]
                            || prev.buffers[1] != snapshot.buffers[1]
                        {
                            for number in self.position_numbers(&snapshot) {
                                let id = number.id.clone();
                                ui.rebuild_widget(&id, Box::new(number));
                            }
                        }
                        if prev.size != snapshot.size
                            || prev.buffers[2] != snapshot.buffers[2]
                            || prev.buffers[3] != snapshot.buffers[3]
                        {
                            for number in self.size_numbers(&snapshot) {
                                let id = number.id.clone();
                                ui.rebuild_widget(&id, Box::new(number));
                            }
                        }
                    }
                    // A numeric row appeared or vanished: structure
                    // changed, rebuild the panel.
                    false => {
                        ui.mount(vec![Box::new(self.panel(ui.viewport(), &snapshot))]);
                        self.snapshot = Some(snapshot);
                        return;
                    }
                }
                // Fills: a structure change (entry count, or an entry's
                // image-ness — its row shape) remounts the panel; a
                // value-only change (recolor, solid⇄gradient kind swap,
                // active) rebuilds just the changed entries' controls
                // (PROP-7 for the fill list).
                if fills_shape(prev) != fills_shape(&snapshot) {
                    ui.mount(vec![Box::new(self.panel(ui.viewport(), &snapshot))]);
                    self.snapshot = Some(snapshot);
                    return;
                }
                // Same shape (checked above): rebuild just the entries
                // whose paint value changed (recolor / kind swap /
                // active). Both are `Some` here — a `None`⇄`Some`
                // difference is a shape change already handled above.
                if let (Some(pf), Some(sf)) = (&prev.fills, &snapshot.fills) {
                    for (i, paint) in sf.iter().enumerate() {
                        if pf.get(i) == Some(paint) {
                            continue;
                        }
                        if !matches!(paint, Paint::Image(_)) {
                            ui.rebuild_widget(
                                &fill_swatch_id(i),
                                Box::new(self.fill_swatch(i, paint, &snapshot)),
                            );
                            ui.rebuild_widget(
                                &fill_kind_id(i),
                                Box::new(self.fill_kind(i, paint, &snapshot)),
                            );
                        }
                        ui.rebuild_widget(
                            &fill_active_id(i),
                            Box::new(self.fill_active(i, paint, &snapshot)),
                        );
                    }
                }
            }
            _ => {
                let panel = self.panel(ui.viewport(), &snapshot);
                ui.mount(vec![Box::new(panel)]);
            }
        }
        self.snapshot = Some(snapshot);
    }

    /// Build the node-mode snapshot the panel binds to (`PROP-2`: the
    /// head node's values; the number inputs' edit buffers ride along
    /// so a keystroke rebuilds the edited input's text).
    fn node_snapshot(&self, ui: &UiLayer, editor: &Editor, selection: Vec<Id>) -> Snapshot {
        let head = &selection[0];
        let buffers = NUMBER_IDS.map(|id| match ui.state(&id.to_string()) {
            Some(WidgetState::Number(s)) => s.buffer.clone(),
            _ => None,
        });
        let name_buffer = match ui.state(&NAME_ID.to_string()) {
            Some(WidgetState::Text(s)) => s.buffer.clone(),
            _ => None,
        };
        let rotation_buffer = match ui.state(&ROTATION_ID.to_string()) {
            Some(WidgetState::Number(s)) => s.buffer.clone(),
            _ => None,
        };
        let number_buffer = |id: &str| match ui.state(&id.to_string()) {
            Some(WidgetState::Number(s)) => s.buffer.clone(),
            _ => None,
        };
        Snapshot {
            name: editor.document().node_name(head).unwrap_or_default(),
            visible: editor.document().node_active(head).unwrap_or(true),
            rotation: editor.node_rotation(head).unwrap_or(0.0).to_degrees(),
            blend: editor
                .node_blend_mode(head)
                .and_then(|bm| BLEND_MODES.iter().position(|(_, v)| *v == bm))
                .unwrap_or(0),
            opacity: editor.node_opacity(head).unwrap_or(1.0),
            fills: editor.node_fills(head).map(|p| p.as_slice().to_vec()),
            position: editor.node_position(head),
            size: editor.node_size(head),
            corner_radius: editor.node_corner_radius(head),
            point_count: editor.node_point_count(head),
            clips_content: editor.node_clips_content(head),
            text_align: editor
                .node_text_align(head)
                .and_then(|a| TEXT_ALIGNS.iter().position(|(_, v)| *v == a)),
            buffers,
            name_buffer,
            rotation_buffer,
            corner_buffer: number_buffer(CORNER_ID),
            count_buffer: number_buffer(COUNT_ID),
            selection,
        }
    }

    /// Picker host bookkeeping: close the open picker when it asks to
    /// be dismissed, else open one when a swatch reports a click. Both
    /// transitions invalidate the incremental snapshot so the base
    /// panel rebuilds cleanly across the mode change.
    fn drain_picker(&mut self, ui: &mut UiLayer, editor: &Editor) {
        if self.picker.is_some() {
            let closed = matches!(
                ui.state(&PICKER_ID.to_string()),
                Some(WidgetState::Picker(PickerState { closed: true, .. }))
            );
            if closed {
                self.picker = None;
                self.invalidate();
            }
            return;
        }
        // Candidate swatches, in priority order: each fill entry's
        // swatch (node selection), then the background swatch (scene).
        // A fill swatch carries its entry index so the picker binds to
        // `FillColor` at that paint.
        let mut requests: Vec<SwatchRequest> = Vec::new();
        if let Some(head) = editor.selection().first()
            && let Some(fills) = editor.node_fills(head)
        {
            for i in 0..fills.as_slice().len() {
                requests.push((
                    fill_swatch_id(i),
                    BindingProperty::FillColor,
                    Some(i),
                    editor.selection().to_vec(),
                    "ui.fill.color".to_string(),
                ));
            }
        }
        requests.push((
            BG_ID.to_string(),
            BindingProperty::SceneBackground,
            None,
            Vec::new(),
            "ui.scene.bg".to_string(),
        ));
        for (id, property, entry, targets, label) in requests {
            let clicked = matches!(
                ui.state(&id),
                Some(WidgetState::Button(s)) if s.clicks > 0
            );
            if clicked {
                if let Some(WidgetState::Button(s)) = ui.state_mut(&id) {
                    s.clicks = 0;
                }
                let trigger = self.swatch_bounds(ui, &id);
                self.picker = Some(PickerOpen {
                    property,
                    targets,
                    entry,
                    label,
                    anchor: self.picker_anchor(ui.viewport(), trigger),
                    trigger,
                });
                // The picker starts from a clean state on every open —
                // clear any stale flags the state map persisted from a
                // previous session (drag / hex buffer / closed outbox).
                ui.set_state(
                    PICKER_ID.to_string(),
                    WidgetState::Picker(PickerState::default()),
                );
                self.invalidate();
                return;
            }
        }
    }

    /// The swatch's world bounds (the picker's trigger), or a
    /// right-edge fallback if it is not laid out.
    fn swatch_bounds(&self, ui: &UiLayer, swatch_id: &str) -> Rectangle {
        ui.widget_bounds(&swatch_id.to_string())
            .unwrap_or(Rectangle {
                x: ui.viewport().width - self.width,
                y: 40.0,
                width: 20.0,
                height: 14.0,
            })
    }

    /// Place the picker popover to the left of the swatch (so it does
    /// not cover the strip), clamped into the viewport.
    fn picker_anchor(&self, vp: Size, swatch: Rectangle) -> [f32; 2] {
        // Picker outer height ≈ content + popover padding; keep it on
        // screen.
        let picker_h = 214.0;
        let x = (swatch.x - PICKER_W - 24.0).max(4.0);
        let y = swatch.y.min((vp.height - picker_h - 4.0).max(4.0)).max(4.0);
        [x, y]
    }

    /// Mount the base panel plus the open picker, and grant the picker
    /// the popup grab so an outside press dismisses it.
    fn mount_with_picker(&mut self, ui: &mut UiLayer, editor: &Editor) {
        let open = self.picker.clone().expect("picker open");
        let selection: Vec<Id> = editor.selection().to_vec();
        let base: Box<dyn Widget> = if selection.is_empty() {
            let snap = SceneSnapshot {
                background: editor.background_color(),
            };
            let w = Box::new(self.scene_panel(ui.viewport(), &snap));
            self.scene_snapshot = Some(snap);
            w
        } else {
            let snap = self.node_snapshot(ui, editor, selection);
            let w = Box::new(self.panel(ui.viewport(), &snap));
            self.snapshot = Some(snap);
            w
        };
        let color = match open.property {
            BindingProperty::SceneBackground => editor.background_color(),
            BindingProperty::FillColor => editor.selection().first().and_then(|id| {
                let fills = editor.node_fills(id)?;
                open.entry
                    .and_then(|i| fills.as_slice().get(i).map(paint_swatch_color))
            }),
            _ => editor
                .selection()
                .first()
                .and_then(|id| editor.node_fill_solid(id)),
        }
        .unwrap_or(CGColor::from_rgba(0, 0, 0, 255));
        let picker = ColorPicker {
            id: PICKER_ID.to_string(),
            value: Field::Value(color),
            width: PICKER_W,
            origin: Some(open.anchor),
            trigger: Some(open.trigger),
            binding: Binding {
                property: open.property,
                targets: open.targets,
                label: open.label,
                entry: open.entry,
            },
        };
        ui.mount(vec![base, Box::new(picker)]);
        ui.set_capture(PICKER_ID.to_string());
    }

    /// The scene-mode panel (empty selection): the background color
    /// control — a swatch bound to the scene background, plus a clear
    /// button back to `None` (the transparency grid). A `None`
    /// background displays as a white swatch (placeholder, like the
    /// swatch's preset palette; the canvas itself shows the truth).
    fn scene_panel(&self, viewport: Size, snapshot: &SceneSnapshot) -> Panel {
        let swatch = Swatch {
            id: BG_ID.to_string(),
            color: snapshot
                .background
                .unwrap_or(CGColor::from_rgba(255, 255, 255, 255)),
            width: 20.0,
            height: 14.0,
            action: SwatchAction::OpenPicker,
            binding: Binding {
                property: BindingProperty::SceneBackground,
                targets: Vec::new(),
                label: "ui.scene.bg".to_string(),
                entry: None,
            },
        };
        let clear = Button {
            id: BG_CLEAR_ID.to_string(),
            label: "×".to_string(),
            active: snapshot.background.is_none(),
            width: 20.0,
            height: 14.0,
            commit: None,
        };
        Panel {
            id: PANEL_ID.to_string(),
            title: "Scene".to_string(),
            origin: ((viewport.width - self.width).max(0.0), 0.0),
            width: self.width,
            height: viewport.height,
            children: vec![Box::new(Row {
                id: BG_ROW_ID.to_string(),
                label: "Background".to_string(),
                width: self.width - 24.0,
                height: 20.0,
                children: vec![Box::new(swatch), Box::new(clear)],
            })],
        }
    }

    fn panel(&self, viewport: Size, snapshot: &Snapshot) -> Panel {
        let mut children: Vec<Box<dyn Widget>> = vec![
            Box::new(self.name_text(snapshot)),
            Box::new(Row {
                id: VISIBLE_ROW_ID.to_string(),
                label: "Visible".to_string(),
                width: self.width - 24.0,
                height: 20.0,
                children: vec![Box::new(self.visible_toggle(snapshot))],
            }),
        ];
        for number in self
            .position_numbers(snapshot)
            .into_iter()
            .chain(self.size_numbers(snapshot))
        {
            let label = match number.id.as_str() {
                X_ID => "X",
                Y_ID => "Y",
                W_ID => "W",
                _ => "H",
            };
            children.push(Box::new(Row {
                id: format!("{}.row", number.id),
                label: label.to_string(),
                width: self.width - 24.0,
                height: 20.0,
                children: vec![Box::new(number)],
            }));
        }
        children.push(Box::new(Row {
            id: ROTATION_ROW_ID.to_string(),
            label: "Rotate".to_string(),
            width: self.width - 24.0,
            height: 20.0,
            children: vec![Box::new(self.rotation_number(snapshot))],
        }));
        children.push(Box::new(Row {
            id: OPACITY_ROW_ID.to_string(),
            label: "Opacity".to_string(),
            width: self.width - 24.0,
            height: 20.0,
            children: vec![Box::new(self.slider(snapshot))],
        }));
        children.push(Box::new(Row {
            id: BLEND_ROW_ID.to_string(),
            label: "Blend".to_string(),
            width: self.width - 24.0,
            height: 22.0,
            children: vec![Box::new(self.blend_select(snapshot))],
        }));
        if snapshot.corner_radius.is_some() {
            children.push(Box::new(Row {
                id: CORNER_ROW_ID.to_string(),
                label: "Radius".to_string(),
                width: self.width - 24.0,
                height: 20.0,
                children: vec![Box::new(self.corner_number(snapshot))],
            }));
        }
        if snapshot.point_count.is_some() {
            children.push(Box::new(Row {
                id: COUNT_ROW_ID.to_string(),
                label: "Count".to_string(),
                width: self.width - 24.0,
                height: 20.0,
                children: vec![Box::new(self.count_number(snapshot))],
            }));
        }
        if snapshot.clips_content.is_some() {
            children.push(Box::new(Row {
                id: CLIP_ROW_ID.to_string(),
                label: "Clip".to_string(),
                width: self.width - 24.0,
                height: 20.0,
                children: vec![Box::new(self.clip_toggle(snapshot))],
            }));
        }
        if snapshot.text_align.is_some() {
            children.push(Box::new(Row {
                id: ALIGN_ROW_ID.to_string(),
                label: "Align".to_string(),
                width: self.width - 24.0,
                height: 22.0,
                children: vec![Box::new(self.align_segmented(snapshot))],
            }));
        }
        self.push_fills(&mut children, snapshot);
        Panel {
            id: PANEL_ID.to_string(),
            title: "Properties".to_string(),
            origin: ((viewport.width - self.width).max(0.0), 0.0),
            width: self.width,
            height: viewport.height,
            children,
        }
    }

    /// The node name — an editable text input (`Text`), committing a
    /// `Name` patch on confirm.
    fn name_text(&self, snapshot: &Snapshot) -> Text {
        Text {
            id: NAME_ID.to_string(),
            value: Field::Value(snapshot.name.clone()),
            placeholder: "(unnamed)".to_string(),
            width: self.width - 24.0,
            height: 20.0,
            binding: Binding {
                property: BindingProperty::Name,
                targets: snapshot.selection.clone(),
                label: "ui.name".to_string(),
                entry: None,
            },
        }
    }

    /// The node visibility — a checkbox toggle bound to `active`.
    fn visible_toggle(&self, snapshot: &Snapshot) -> Toggle {
        Toggle {
            id: VISIBLE_ID.to_string(),
            value: Field::Value(snapshot.visible),
            look: ToggleLook::Check,
            size: 16.0,
            binding: Binding {
                property: BindingProperty::Visible,
                targets: snapshot.selection.clone(),
                label: "ui.visible".to_string(),
                entry: None,
            },
        }
    }

    /// Blend mode — a dropdown select over the curated `BLEND_MODES`,
    /// committing the chosen index.
    fn blend_select(&self, snapshot: &Snapshot) -> Select {
        Select {
            id: BLEND_ID.to_string(),
            options: BLEND_MODES
                .iter()
                .map(|(label, _)| label.to_string())
                .collect(),
            selected: Field::Value(snapshot.blend),
            width: self.width - 24.0 - 64.0 - 8.0,
            height: 20.0,
            binding: Binding {
                property: BindingProperty::BlendMode,
                targets: snapshot.selection.clone(),
                label: "ui.blend".to_string(),
                entry: None,
            },
        }
    }

    /// Uniform corner radius — a scrubbable number, ≥ 0.
    fn corner_number(&self, snapshot: &Snapshot) -> Number {
        self.number(
            snapshot,
            CORNER_ID,
            snapshot.corner_radius.unwrap_or(0.0),
            BindingProperty::CornerRadius,
            Some(0.0),
        )
    }

    /// Polygon / star point count — a scrubbable number, 3–60.
    fn count_number(&self, snapshot: &Snapshot) -> Number {
        let mut n = self.number(
            snapshot,
            COUNT_ID,
            snapshot.point_count.unwrap_or(3) as f32,
            BindingProperty::PointCount,
            Some(3.0),
        );
        n.max = Some(60.0);
        n
    }

    /// Container content-clipping — a checkbox toggle bound to `clip`.
    fn clip_toggle(&self, snapshot: &Snapshot) -> Toggle {
        Toggle {
            id: CLIP_ID.to_string(),
            value: Field::Value(snapshot.clips_content.unwrap_or(false)),
            look: ToggleLook::Check,
            size: 16.0,
            binding: Binding {
                property: BindingProperty::ClipsContent,
                targets: snapshot.selection.clone(),
                label: "ui.clip".to_string(),
                entry: None,
            },
        }
    }

    /// Horizontal text alignment — a segmented control over
    /// `TEXT_ALIGNS`, committing the chosen index.
    fn align_segmented(&self, snapshot: &Snapshot) -> Segmented {
        Segmented {
            id: ALIGN_ID.to_string(),
            options: TEXT_ALIGNS.iter().map(|(l, _)| Segment::new(*l)).collect(),
            selected: snapshot
                .text_align
                .map(Field::Value)
                .unwrap_or(Field::Mixed),
            columns: 0,
            width: self.width - 24.0 - 64.0 - 8.0,
            height: 22.0,
            binding: Binding {
                property: BindingProperty::TextAlign,
                targets: snapshot.selection.clone(),
                label: "ui.align".to_string(),
                entry: None,
            },
        }
    }

    /// Rotation — a scrubbable number in degrees (the binding converts
    /// to the node's radians).
    fn rotation_number(&self, snapshot: &Snapshot) -> Number {
        self.number(
            snapshot,
            ROTATION_ID,
            snapshot.rotation,
            BindingProperty::Rotation,
            None,
        )
    }

    fn slider(&self, snapshot: &Snapshot) -> Slider {
        Slider {
            id: OPACITY_ID.to_string(),
            value: snapshot.opacity,
            min: 0.0,
            max: 1.0,
            step: 0.05,
            width: self.width - 24.0 - 64.0 - 8.0,
            height: 12.0,
            binding: Binding {
                property: BindingProperty::Opacity,
                targets: snapshot.selection.clone(),
                label: "ui.opacity".to_string(),
                entry: None,
            },
        }
    }

    /// X/Y inputs when the head node has a position (empty otherwise).
    fn position_numbers(&self, snapshot: &Snapshot) -> Vec<Number> {
        let Some((x, y)) = snapshot.position else {
            return Vec::new();
        };
        vec![
            self.number(snapshot, X_ID, x, BindingProperty::PositionX, None),
            self.number(snapshot, Y_ID, y, BindingProperty::PositionY, None),
        ]
    }

    /// W/H inputs when the head node has a concrete size.
    fn size_numbers(&self, snapshot: &Snapshot) -> Vec<Number> {
        let Some((w, h)) = snapshot.size else {
            return Vec::new();
        };
        vec![
            self.number(snapshot, W_ID, w, BindingProperty::SizeWidth, Some(0.0)),
            self.number(snapshot, H_ID, h, BindingProperty::SizeHeight, Some(0.0)),
        ]
    }

    fn number(
        &self,
        snapshot: &Snapshot,
        id: &str,
        value: f32,
        property: BindingProperty,
        min: Option<f32>,
    ) -> Number {
        Number {
            id: id.to_string(),
            value,
            min,
            max: None,
            step: 1.0,
            scrub_scale: 1.0,
            width: 72.0,
            height: 18.0,
            binding: Binding {
                property,
                // Commits broadcast to the whole selection; targets
                // that do not support the property are skipped in the
                // bind layer (see the Snapshot PROP-2 note).
                targets: snapshot.selection.clone(),
                label: format!("ui.{}", id.trim_start_matches("props.")),
                entry: None,
            },
        }
    }

    /// The Fills section: a header (title + add) and one row per paint
    /// in the stack (built top-most-first would reverse; the seed keeps
    /// document order for now — the reversal is a later refinement).
    /// Absent entirely when the head node carries no fills (`PROP-1`).
    fn push_fills(&self, children: &mut Vec<Box<dyn Widget>>, snapshot: &Snapshot) {
        let Some(fills) = &snapshot.fills else {
            return;
        };
        let add = Button {
            id: FILLS_ADD_ID.to_string(),
            label: "＋".to_string(),
            active: false,
            width: 20.0,
            height: 16.0,
            commit: Some((
                Binding {
                    property: BindingProperty::Fills,
                    targets: snapshot.selection.clone(),
                    label: "ui.fill.add".to_string(),
                    entry: None,
                },
                BindingValue::ListOp(ListOp::Add),
            )),
        };
        children.push(Box::new(Row {
            id: FILLS_HEADER_ID.to_string(),
            label: "Fills".to_string(),
            width: self.width - 24.0,
            height: 20.0,
            children: vec![Box::new(add)],
        }));
        for (i, paint) in fills.iter().enumerate() {
            children.push(Box::new(self.fill_row(i, paint, snapshot)));
        }
    }

    /// One fill entry's row: solid/gradient paints show a swatch + kind
    /// select; image paints show an "Image" label (source is
    /// host-gated). Both carry an active toggle and a remove button.
    fn fill_row(&self, i: usize, paint: &Paint, snapshot: &Snapshot) -> Row {
        let mut kids: Vec<Box<dyn Widget>> = Vec::new();
        if matches!(paint, Paint::Image(_)) {
            kids.push(Box::new(Label {
                id: fill_label_id(i),
                text: "Image".to_string(),
                width: 60.0,
                height: 14.0,
                font_size: 11.0,
            }));
        } else {
            kids.push(Box::new(self.fill_swatch(i, paint, snapshot)));
            kids.push(Box::new(self.fill_kind(i, paint, snapshot)));
        }
        kids.push(Box::new(self.fill_active(i, paint, snapshot)));
        kids.push(Box::new(self.fill_remove(i, snapshot)));
        Row {
            id: fill_row_id(i),
            label: String::new(),
            width: self.width - 24.0,
            height: 20.0,
            children: kids,
        }
    }

    /// The color swatch of fill `i` — its representative color (solid,
    /// or the first gradient stop), opening the picker on the
    /// `FillColor` binding at this entry.
    fn fill_swatch(&self, i: usize, paint: &Paint, snapshot: &Snapshot) -> Swatch {
        Swatch {
            id: fill_swatch_id(i),
            color: paint_swatch_color(paint),
            width: 20.0,
            height: 14.0,
            action: SwatchAction::OpenPicker,
            binding: Binding {
                property: BindingProperty::FillColor,
                targets: snapshot.selection.clone(),
                label: "ui.fill.color".to_string(),
                entry: Some(i),
            },
        }
    }

    /// The kind select of fill `i` (solid / the four gradients).
    fn fill_kind(&self, i: usize, paint: &Paint, snapshot: &Snapshot) -> Select {
        Select {
            id: fill_kind_id(i),
            options: PAINT_KINDS.iter().map(|k| k.to_string()).collect(),
            selected: Field::Value(paint_kind_index(paint)),
            width: 50.0,
            height: 20.0,
            binding: Binding {
                property: BindingProperty::FillKind,
                targets: snapshot.selection.clone(),
                label: "ui.fill.kind".to_string(),
                entry: Some(i),
            },
        }
    }

    /// The active toggle of fill `i` (disable without removing).
    fn fill_active(&self, i: usize, paint: &Paint, snapshot: &Snapshot) -> Toggle {
        Toggle {
            id: fill_active_id(i),
            value: Field::Value(paint.active()),
            look: ToggleLook::Check,
            size: 16.0,
            binding: Binding {
                property: BindingProperty::FillActive,
                targets: snapshot.selection.clone(),
                label: "ui.fill.active".to_string(),
                entry: Some(i),
            },
        }
    }

    /// The remove button of fill `i` — a commit-only `Fills`/`Remove`.
    fn fill_remove(&self, i: usize, snapshot: &Snapshot) -> Button {
        Button {
            id: fill_remove_id(i),
            label: "✕".to_string(),
            active: false,
            width: 18.0,
            height: 16.0,
            commit: Some((
                Binding {
                    property: BindingProperty::Fills,
                    targets: snapshot.selection.clone(),
                    label: "ui.fill.remove".to_string(),
                    entry: None,
                },
                BindingValue::ListOp(ListOp::Remove(i)),
            )),
        }
    }
}

/// A fill entry's swatch color — the solid color, the first gradient
/// stop, or a neutral placeholder for an image paint (no editable
/// color).
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

/// A paint's index into [`PAINT_KINDS`] for the kind select (image
/// paints do not appear there — they show a label instead).
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

/// The Fills section's *row-shape* signature: one flag per entry
/// marking whether it is an image paint (image rows have a different
/// control layout). A change here — count or image-ness — is a
/// structure change that remounts the panel; recolor / kind-swap /
/// active are value changes handled incrementally.
fn fills_shape(snapshot: &Snapshot) -> Option<Vec<bool>> {
    snapshot
        .fills
        .as_ref()
        .map(|v| v.iter().map(|p| matches!(p, Paint::Image(_))).collect())
}
