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
//! model (`PROP-2`, `WID-6`) is a later task. **Fills** and **Strokes**
//! are the paint-list domains (`fills` / `strokes`): one code path
//! ([`PaintTarget`]) building a list of paint entries (`SHEET-3`) — add
//! / remove / toggle-active, per-entry kind (solid / gradient) and
//! color (through the picker). Image paints are shown but their source
//! is host-gated; the gradient stop-track editor and stroke *geometry*
//! (width/align/cap/join/dash) are named-and-deferred. **Effects**,
//! **Selection colors**, and **Export** are minimal introductions:
//! effects and selection-colors are read-only summaries, export is a
//! present-but-deferred scaffold (no authoring domain yet).
//!
//! [`sync`]: PropertiesPanel::sync

use grida::cg::prelude::{CGColor, Paint};
use grida::node::schema::Size;
use math2::rect::Rectangle;

use crate::document::Id;
use crate::editor::Editor;
use crate::ui::UiLayer;
use crate::ui::bind::{
    BLEND_MODES, Binding, BindingProperty, BindingValue, FONT_WEIGHTS, ListOp, PAINT_KINDS,
    SHADOW_KINDS, STROKE_ALIGNS, STROKE_CAPS, STROKE_JOINS, TEXT_ALIGN_VERTICALS, TEXT_ALIGNS,
    blur_radius, font_weight_index, shadow_kind_index, shadow_params,
};
use crate::ui::field::Field;
use crate::ui::widget::{Widget, WidgetState};
use crate::ui::widgets::color_picker::PickerState;
use crate::ui::widgets::{
    Button, ColorPicker, Label, Number, Panel, Row, SectionHeader, Segment, Segmented, Select,
    Slider, Swatch, SwatchAction, Text, Toggle, ToggleLook,
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
// Typography rows (the Text section — gated on a text kind).
pub const TEXT_HEADER_ID: &str = "props.text.header";
pub const TEXT_SIZE_ROW_ID: &str = "props.text.size.row";
pub const TEXT_SIZE_ID: &str = "props.text.size";
pub const TEXT_WEIGHT_ROW_ID: &str = "props.text.weight.row";
pub const TEXT_WEIGHT_ID: &str = "props.text.weight";
pub const TEXT_ITALIC_ROW_ID: &str = "props.text.italic.row";
pub const TEXT_ITALIC_ID: &str = "props.text.italic";
pub const TEXT_LINE_ROW_ID: &str = "props.text.line.row";
pub const TEXT_LINE_ID: &str = "props.text.line";
pub const TEXT_LETTER_ROW_ID: &str = "props.text.letter.row";
pub const TEXT_LETTER_ID: &str = "props.text.letter";
pub const TEXT_VALIGN_ROW_ID: &str = "props.text.valign.row";
pub const TEXT_VALIGN_ID: &str = "props.text.valign";
pub const BG_ROW_ID: &str = "props.scene.bg.row";
pub const BG_ID: &str = "props.scene.bg";
pub const BG_CLEAR_ID: &str = "props.scene.bg.clear";
pub const OPACITY_ROW_ID: &str = "props.opacity.row";
pub const OPACITY_ID: &str = "props.opacity";
/// The two paint-list sections the panel builds identically (`SHEET-3`
/// list of paint entries; per-entry sub-controls addressed by their
/// index through the binding's `entry`). One code path, two targets;
/// they differ only in which node field they read/write and their
/// widget-id prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaintTarget {
    Fill,
    Stroke,
}

impl PaintTarget {
    /// Section title.
    fn title(self) -> &'static str {
        match self {
            PaintTarget::Fill => "Fills",
            PaintTarget::Stroke => "Strokes",
        }
    }
    /// Widget-id prefix for per-entry ids (`fill` / `stroke`).
    fn entry_prefix(self) -> &'static str {
        match self {
            PaintTarget::Fill => "fill",
            PaintTarget::Stroke => "stroke",
        }
    }
    /// Widget-id prefix for the section header (`fills` / `strokes`).
    fn section_prefix(self) -> &'static str {
        match self {
            PaintTarget::Fill => "fills",
            PaintTarget::Stroke => "strokes",
        }
    }
    /// The structural list property.
    fn list_prop(self) -> BindingProperty {
        match self {
            PaintTarget::Fill => BindingProperty::Fills,
            PaintTarget::Stroke => BindingProperty::Strokes,
        }
    }
    /// The per-entry color property.
    fn color_prop(self) -> BindingProperty {
        match self {
            PaintTarget::Fill => BindingProperty::FillColor,
            PaintTarget::Stroke => BindingProperty::StrokeColor,
        }
    }
    /// The per-entry kind property.
    fn kind_prop(self) -> BindingProperty {
        match self {
            PaintTarget::Fill => BindingProperty::FillKind,
            PaintTarget::Stroke => BindingProperty::StrokeKind,
        }
    }
    /// The per-entry active property.
    fn active_prop(self) -> BindingProperty {
        match self {
            PaintTarget::Fill => BindingProperty::FillActive,
            PaintTarget::Stroke => BindingProperty::StrokeActive,
        }
    }
    /// This target's stack in the snapshot.
    fn stack(self, s: &Snapshot) -> &Option<Vec<Paint>> {
        match self {
            PaintTarget::Fill => &s.fills,
            PaintTarget::Stroke => &s.strokes,
        }
    }
}

pub const FILLS_HEADER_ID: &str = "props.fills.header";
pub const FILLS_ADD_ID: &str = "props.fills.add";
pub const STROKES_HEADER_ID: &str = "props.strokes.header";
pub const STROKES_ADD_ID: &str = "props.strokes.add";

fn paint_add_id(t: PaintTarget) -> String {
    format!("props.{}.add", t.section_prefix())
}
fn paint_header_id(t: PaintTarget) -> String {
    format!("props.{}.header", t.section_prefix())
}
fn paint_row_id(t: PaintTarget, i: usize) -> String {
    format!("props.{}.{i}.row", t.entry_prefix())
}
fn paint_swatch_id(t: PaintTarget, i: usize) -> String {
    format!("props.{}.{i}.swatch", t.entry_prefix())
}
fn paint_kind_id(t: PaintTarget, i: usize) -> String {
    format!("props.{}.{i}.kind", t.entry_prefix())
}
fn paint_active_id(t: PaintTarget, i: usize) -> String {
    format!("props.{}.{i}.active", t.entry_prefix())
}
fn paint_remove_id(t: PaintTarget, i: usize) -> String {
    format!("props.{}.{i}.remove", t.entry_prefix())
}
fn paint_label_id(t: PaintTarget, i: usize) -> String {
    format!("props.{}.{i}.label", t.entry_prefix())
}

/// The fill swatch id (opens the picker) — public for the harness.
pub fn fill_swatch_id(i: usize) -> String {
    paint_swatch_id(PaintTarget::Fill, i)
}
/// The fill kind-select id — public for the harness.
pub fn fill_kind_id(i: usize) -> String {
    paint_kind_id(PaintTarget::Fill, i)
}
/// The stroke swatch id — public for the harness.
pub fn stroke_swatch_id(i: usize) -> String {
    paint_swatch_id(PaintTarget::Stroke, i)
}

// Stroke geometry rows (inside the Strokes section, below the paints).
pub const STROKE_WIDTH_ROW_ID: &str = "props.stroke.width.row";
pub const STROKE_WIDTH_ID: &str = "props.stroke.width";
pub const STROKE_ALIGN_ROW_ID: &str = "props.stroke.align.row";
pub const STROKE_ALIGN_ID: &str = "props.stroke.align";
pub const STROKE_CAP_ROW_ID: &str = "props.stroke.cap.row";
pub const STROKE_CAP_ID: &str = "props.stroke.cap";
pub const STROKE_JOIN_ROW_ID: &str = "props.stroke.join.row";
pub const STROKE_JOIN_ID: &str = "props.stroke.join";
pub const STROKE_MITER_ROW_ID: &str = "props.stroke.miter.row";
pub const STROKE_MITER_ID: &str = "props.stroke.miter";
pub const STROKE_DASH_ROW_ID: &str = "props.stroke.dash.row";
pub const STROKE_DASH_ID: &str = "props.stroke.dash";

// Effects sections. Slice 1 authors the single layer-blur slot and the
// multi-valued shadow list (drop/inner); backdrop blur, glass, noise, and
// progressive blur are later slices (`properties-sheet.md` Effects).
pub const BLUR_HEADER_ID: &str = "props.blur.header";
pub const BLUR_ENABLE_ID: &str = "props.blur.enable";
pub const BLUR_RADIUS_ROW_ID: &str = "props.blur.radius.row";
pub const BLUR_RADIUS_ID: &str = "props.blur.radius";
pub const BLUR_ACTIVE_ROW_ID: &str = "props.blur.active.row";
pub const BLUR_ACTIVE_ID: &str = "props.blur.active";
pub const SHADOWS_HEADER_ID: &str = "props.shadows.header";
pub const SHADOWS_ADD_ID: &str = "props.shadows.add";
/// A per-shadow widget id: `props.shadow.{i}.{part}`. Row ids append
/// `.row` to the control's part.
fn shadow_part_id(i: usize, part: &str) -> String {
    format!("props.shadow.{i}.{part}")
}
/// The shadow color-swatch id (opens the picker) — public for the
/// harness.
pub fn shadow_swatch_id(i: usize) -> String {
    shadow_part_id(i, "swatch")
}

// Read-only / scaffold sections (Selection colors, Export) — minimal
// introductions; authoring is a later slice.
pub const SELECTION_COLORS_HEADER_ID: &str = "props.selcolors.header";
pub const EXPORT_HEADER_ID: &str = "props.export.header";
pub const EXPORT_NOTE_ID: &str = "props.export.note";
fn selection_color_id(i: usize) -> String {
    format!("props.selcolor.{i}.label")
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
    /// Head node's stroke paint stack, or `None` when the kind carries
    /// no strokes (the Strokes-section capability gate).
    strokes: Option<Vec<Paint>>,
    /// Whether the head node carries effects at all (the Effects
    /// sections' capability gate — the Layer-blur and Shadows section
    /// headers render iff this is true).
    effects_capable: bool,
    /// The layer-blur slot: `(radius, active)` when a blur exists, else
    /// `None`. Presence is a structure change (the radius/active rows
    /// appear/vanish).
    blur: Option<(f32, bool)>,
    /// Edit buffer of the blur-radius number.
    blur_buffer: Option<String>,
    /// One entry per drop/inner shadow (bottom→top). Count is a structure
    /// change (rows appear/vanish); per-entry value changes rebuild in
    /// place.
    shadows: Vec<ShadowSnapshot>,
    /// Stroke geometry (present when the head node supports it): uniform
    /// weight; align/cap/join as indices into the `STROKE_*` tables;
    /// miter limit; dash length (0 = solid). Align/cap/join/miter/dash
    /// are `None` for kinds without a stroke style (Line, Vector, text);
    /// width is present for any stroked kind.
    stroke_width: Option<f32>,
    stroke_align: Option<usize>,
    stroke_cap: Option<usize>,
    stroke_join: Option<usize>,
    stroke_miter: Option<f32>,
    stroke_dash: Option<f32>,
    /// Typed-entry buffers for the three stroke-geometry numbers.
    stroke_width_buffer: Option<String>,
    stroke_miter_buffer: Option<String>,
    stroke_dash_buffer: Option<String>,
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
    /// Typography (present when the head node is a text kind): font size
    /// px; weight as the nearest index into `FONT_WEIGHTS`; italic flag;
    /// line-height multiplier; letter-spacing px; vertical align as an
    /// index into `TEXT_ALIGN_VERTICALS`. All present together (a text
    /// kind carries the whole style) — the Text-section capability gate
    /// keys on `font_size`.
    font_size: Option<f32>,
    font_weight: Option<usize>,
    font_italic: Option<bool>,
    line_height: Option<f32>,
    letter_spacing: Option<f32>,
    text_align_vertical: Option<usize>,
    /// Typed-entry buffers for the three typography numbers.
    font_size_buffer: Option<String>,
    line_height_buffer: Option<String>,
    letter_spacing_buffer: Option<String>,
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

/// One drop/inner shadow's displayed state — the per-entry projection the
/// Shadows section diffs against. The four number edit buffers ride along
/// so a keystroke rebuilds the edited input's text (the stroke/typography
/// buffer pattern).
#[derive(Debug, Clone, PartialEq)]
struct ShadowSnapshot {
    /// Drop (0) vs inner (1) — an index into `SHADOW_KINDS`.
    kind: usize,
    color: CGColor,
    active: bool,
    dx: f32,
    dy: f32,
    blur: f32,
    spread: f32,
    dx_buffer: Option<String>,
    dy_buffer: Option<String>,
    blur_buffer: Option<String>,
    spread_buffer: Option<String>,
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

/// The structural signature of the Effects sections: capability, whether
/// the blur slot is filled (its rows render), and the shadow count. A
/// change means a row appeared/vanished (a structure change → remount);
/// per-shadow value edits (kind, color, params) are not shape changes.
fn effects_shape(s: &Snapshot) -> (bool, bool, usize) {
    (s.effects_capable, s.blur.is_some(), s.shadows.len())
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
                // Paint lists (fills, strokes): a structure change
                // (entry count, or an entry's image-ness — its row
                // shape) remounts the panel; a value-only change
                // (recolor, solid⇄gradient kind swap, active) rebuilds
                // just the changed entries' controls (PROP-7 for the
                // paint lists).
                if paints_shape(prev, PaintTarget::Fill) != paints_shape(&snapshot, PaintTarget::Fill)
                    || paints_shape(prev, PaintTarget::Stroke)
                        != paints_shape(&snapshot, PaintTarget::Stroke)
                    // Effects rows appearing/vanishing (capability, the
                    // blur slot, or a shadow added/removed) is a structure
                    // change → remount; per-entry value edits sync below.
                    || effects_shape(prev) != effects_shape(&snapshot)
                    // The miter row appears/vanishes with the join —
                    // a structure change.
                    || (prev.stroke_join == Some(0)) != (snapshot.stroke_join == Some(0))
                {
                    ui.mount(vec![Box::new(self.panel(ui.viewport(), &snapshot))]);
                    self.snapshot = Some(snapshot);
                    return;
                }
                self.sync_paint_values(ui, PaintTarget::Fill, prev, &snapshot);
                self.sync_paint_values(ui, PaintTarget::Stroke, prev, &snapshot);
                self.sync_stroke_geometry(ui, prev, &snapshot);
                self.sync_text(ui, prev, &snapshot);
                self.sync_effects(ui, prev, &snapshot);
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
        let effects = editor.node_effects(head);
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
            strokes: editor.node_strokes(head).map(|p| p.as_slice().to_vec()),
            effects_capable: effects.is_some(),
            blur: effects
                .as_ref()
                .and_then(|e| e.blur.as_ref())
                .map(|b| (blur_radius(&b.blur), b.active)),
            blur_buffer: number_buffer(BLUR_RADIUS_ID),
            shadows: effects
                .as_ref()
                .map(|e| {
                    e.shadows
                        .iter()
                        .enumerate()
                        .map(|(i, s)| {
                            let p = shadow_params(s);
                            ShadowSnapshot {
                                kind: shadow_kind_index(s),
                                color: p.color,
                                active: p.active,
                                dx: p.dx,
                                dy: p.dy,
                                blur: p.blur,
                                spread: p.spread,
                                dx_buffer: number_buffer(&shadow_part_id(i, "dx")),
                                dy_buffer: number_buffer(&shadow_part_id(i, "dy")),
                                blur_buffer: number_buffer(&shadow_part_id(i, "blur")),
                                spread_buffer: number_buffer(&shadow_part_id(i, "spread")),
                            }
                        })
                        .collect()
                })
                .unwrap_or_default(),
            stroke_width: editor.node_stroke_width(head),
            stroke_align: editor
                .node_stroke_align(head)
                .and_then(|a| STROKE_ALIGNS.iter().position(|(_, v)| *v == a)),
            stroke_cap: editor
                .node_stroke_cap(head)
                .and_then(|c| STROKE_CAPS.iter().position(|(_, v)| *v == c)),
            stroke_join: editor
                .node_stroke_join(head)
                .and_then(|j| STROKE_JOINS.iter().position(|(_, v)| *v == j)),
            stroke_miter: editor.node_stroke_miter(head),
            stroke_dash: editor
                .node_stroke_dash(head)
                .map(|d| d.first().copied().unwrap_or(0.0)),
            stroke_width_buffer: number_buffer(STROKE_WIDTH_ID),
            stroke_miter_buffer: number_buffer(STROKE_MITER_ID),
            stroke_dash_buffer: number_buffer(STROKE_DASH_ID),
            position: editor.node_position(head),
            size: editor.node_size(head),
            corner_radius: editor.node_corner_radius(head),
            point_count: editor.node_point_count(head),
            clips_content: editor.node_clips_content(head),
            text_align: editor
                .node_text_align(head)
                .and_then(|a| TEXT_ALIGNS.iter().position(|(_, v)| *v == a)),
            font_size: editor.node_font_size(head),
            font_weight: editor.node_font_weight(head).map(font_weight_index),
            font_italic: editor.node_font_italic(head),
            line_height: editor.node_line_height(head),
            letter_spacing: editor.node_letter_spacing(head),
            text_align_vertical: editor
                .node_text_align_vertical(head)
                .and_then(|v| TEXT_ALIGN_VERTICALS.iter().position(|(_, x)| *x == v)),
            font_size_buffer: number_buffer(TEXT_SIZE_ID),
            line_height_buffer: number_buffer(TEXT_LINE_ID),
            letter_spacing_buffer: number_buffer(TEXT_LETTER_ID),
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
        // Each paint swatch (fills, then strokes) carries its entry
        // index so the picker binds to that target's color property at
        // that paint.
        let mut requests: Vec<SwatchRequest> = Vec::new();
        if let Some(head) = editor.selection().first() {
            for target in [PaintTarget::Fill, PaintTarget::Stroke] {
                let stack = match target {
                    PaintTarget::Fill => editor.node_fills(head),
                    PaintTarget::Stroke => editor.node_strokes(head),
                };
                if let Some(paints) = stack {
                    for i in 0..paints.as_slice().len() {
                        requests.push((
                            paint_swatch_id(target, i),
                            target.color_prop(),
                            Some(i),
                            editor.selection().to_vec(),
                            format!("ui.{}.color", target.entry_prefix()),
                        ));
                    }
                }
            }
            // Each shadow entry's swatch opens the picker on its color.
            if let Some(fx) = editor.node_effects(head) {
                for i in 0..fx.shadows.len() {
                    requests.push((
                        shadow_swatch_id(i),
                        BindingProperty::ShadowColor,
                        Some(i),
                        editor.selection().to_vec(),
                        "ui.shadow.color".to_string(),
                    ));
                }
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
            BindingProperty::FillColor | BindingProperty::StrokeColor => {
                editor.selection().first().and_then(|id| {
                    let stack = if open.property == BindingProperty::StrokeColor {
                        editor.node_strokes(id)?
                    } else {
                        editor.node_fills(id)?
                    };
                    open.entry
                        .and_then(|i| stack.as_slice().get(i).map(paint_swatch_color))
                })
            }
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
        self.push_text(&mut children, snapshot);
        self.push_paints(&mut children, snapshot, PaintTarget::Fill);
        self.push_paints(&mut children, snapshot, PaintTarget::Stroke);
        self.push_stroke_geometry(&mut children, snapshot);
        self.push_layer_blur(&mut children, snapshot);
        self.push_shadows(&mut children, snapshot);
        self.push_selection_colors(&mut children, snapshot);
        self.push_export(&mut children);
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

    /// Horizontal text alignment — a segmented control over `TEXT_ALIGNS`.
    fn align_segmented(&self, snapshot: &Snapshot) -> Segmented {
        self.enum_segmented(
            snapshot,
            ALIGN_ID,
            TEXT_ALIGNS.iter().map(|(l, _)| *l).collect(),
            snapshot.text_align,
            BindingProperty::TextAlign,
            "ui.align".to_string(),
        )
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

    /// Rebuild just the paint entries whose value changed (same shape,
    /// checked by the caller): recolor / kind swap / active. Both stacks
    /// are `Some` here — a `None`⇄`Some` difference is a shape change
    /// handled by a remount.
    fn sync_paint_values(
        &self,
        ui: &mut UiLayer,
        target: PaintTarget,
        prev: &Snapshot,
        snapshot: &Snapshot,
    ) {
        if let (Some(pf), Some(sf)) = (target.stack(prev), target.stack(snapshot)) {
            for (i, paint) in sf.iter().enumerate() {
                if pf.get(i) == Some(paint) {
                    continue;
                }
                if !matches!(paint, Paint::Image(_)) {
                    ui.rebuild_widget(
                        &paint_swatch_id(target, i),
                        Box::new(self.paint_swatch(target, i, paint, snapshot)),
                    );
                    ui.rebuild_widget(
                        &paint_kind_id(target, i),
                        Box::new(self.paint_kind(target, i, paint, snapshot)),
                    );
                }
                ui.rebuild_widget(
                    &paint_active_id(target, i),
                    Box::new(self.paint_active(target, i, paint, snapshot)),
                );
            }
        }
    }

    /// Rebuild the stroke-geometry widgets whose value changed (same
    /// structure — miter presence checked by the caller). Numbers rebuild
    /// on value *or* edit-buffer change (a keystroke); segmented on value.
    fn sync_stroke_geometry(&self, ui: &mut UiLayer, prev: &Snapshot, snapshot: &Snapshot) {
        if prev.stroke_width != snapshot.stroke_width
            || prev.stroke_width_buffer != snapshot.stroke_width_buffer
        {
            ui.rebuild_widget(
                &STROKE_WIDTH_ID.to_string(),
                Box::new(self.number(
                    snapshot,
                    STROKE_WIDTH_ID,
                    snapshot.stroke_width.unwrap_or(0.0),
                    BindingProperty::StrokeWidth,
                    Some(0.0),
                )),
            );
        }
        if prev.stroke_align != snapshot.stroke_align {
            ui.rebuild_widget(
                &STROKE_ALIGN_ID.to_string(),
                Box::new(self.stroke_segmented(
                    snapshot,
                    STROKE_ALIGN_ID,
                    STROKE_ALIGNS.iter().map(|(l, _)| *l).collect(),
                    snapshot.stroke_align,
                    BindingProperty::StrokeAlign,
                    "align",
                )),
            );
        }
        if prev.stroke_cap != snapshot.stroke_cap {
            ui.rebuild_widget(
                &STROKE_CAP_ID.to_string(),
                Box::new(self.stroke_segmented(
                    snapshot,
                    STROKE_CAP_ID,
                    STROKE_CAPS.iter().map(|(l, _)| *l).collect(),
                    snapshot.stroke_cap,
                    BindingProperty::StrokeCap,
                    "cap",
                )),
            );
        }
        if prev.stroke_join != snapshot.stroke_join {
            ui.rebuild_widget(
                &STROKE_JOIN_ID.to_string(),
                Box::new(self.stroke_segmented(
                    snapshot,
                    STROKE_JOIN_ID,
                    STROKE_JOINS.iter().map(|(l, _)| *l).collect(),
                    snapshot.stroke_join,
                    BindingProperty::StrokeJoin,
                    "join",
                )),
            );
        }
        if snapshot.stroke_join == Some(0)
            && (prev.stroke_miter != snapshot.stroke_miter
                || prev.stroke_miter_buffer != snapshot.stroke_miter_buffer)
        {
            ui.rebuild_widget(
                &STROKE_MITER_ID.to_string(),
                Box::new(self.number(
                    snapshot,
                    STROKE_MITER_ID,
                    snapshot.stroke_miter.unwrap_or(4.0),
                    BindingProperty::StrokeMiter,
                    Some(1.0),
                )),
            );
        }
        if prev.stroke_dash != snapshot.stroke_dash
            || prev.stroke_dash_buffer != snapshot.stroke_dash_buffer
        {
            ui.rebuild_widget(
                &STROKE_DASH_ID.to_string(),
                Box::new(self.number(
                    snapshot,
                    STROKE_DASH_ID,
                    snapshot.stroke_dash.unwrap_or(0.0),
                    BindingProperty::StrokeDash,
                    Some(0.0),
                )),
            );
        }
    }

    /// A paint-list section (Fills or Strokes): a header (title + add)
    /// and one row per paint in the stack. Absent entirely when the head
    /// node carries no paints of this target (`PROP-1`). Document/paint
    /// order for now — the top-most-first reversal is a later
    /// refinement.
    fn push_paints(
        &self,
        children: &mut Vec<Box<dyn Widget>>,
        snapshot: &Snapshot,
        target: PaintTarget,
    ) {
        let Some(paints) = target.stack(snapshot) else {
            return;
        };
        let add = Button {
            id: paint_add_id(target),
            label: "＋".to_string(),
            active: false,
            width: 20.0,
            height: 16.0,
            commit: Some((
                self.paint_binding(snapshot, target, target.list_prop(), None, "add"),
                BindingValue::ListOp(ListOp::Add),
            )),
        };
        children.push(Box::new(SectionHeader {
            id: paint_header_id(target),
            label: target.title().to_string(),
            width: self.width - 24.0,
            height: 22.0,
            children: vec![Box::new(add)],
        }));
        for (i, paint) in paints.iter().enumerate() {
            children.push(Box::new(self.paint_row(target, i, paint, snapshot)));
        }
    }

    /// One paint entry's row: solid/gradient paints show a swatch + kind
    /// select; image paints show an "Image" label (source is
    /// host-gated). Both carry an active toggle and a remove button.
    fn paint_row(&self, target: PaintTarget, i: usize, paint: &Paint, snapshot: &Snapshot) -> Row {
        let mut kids: Vec<Box<dyn Widget>> = Vec::new();
        if matches!(paint, Paint::Image(_)) {
            kids.push(Box::new(Label {
                id: paint_label_id(target, i),
                text: "Image".to_string(),
                width: 60.0,
                height: 14.0,
                font_size: 11.0,
            }));
        } else {
            kids.push(Box::new(self.paint_swatch(target, i, paint, snapshot)));
            kids.push(Box::new(self.paint_kind(target, i, paint, snapshot)));
        }
        kids.push(Box::new(self.paint_active(target, i, paint, snapshot)));
        kids.push(Box::new(self.paint_remove(target, i, snapshot)));
        Row {
            id: paint_row_id(target, i),
            label: String::new(),
            width: self.width - 24.0,
            height: 20.0,
            children: kids,
        }
    }

    /// A binding for a paint control, with the shared `ui.<fill|stroke>`
    /// history-label convention.
    fn paint_binding(
        &self,
        snapshot: &Snapshot,
        target: PaintTarget,
        property: BindingProperty,
        entry: Option<usize>,
        verb: &str,
    ) -> Binding {
        Binding {
            property,
            targets: snapshot.selection.clone(),
            label: format!("ui.{}.{verb}", target.entry_prefix()),
            entry,
        }
    }

    /// The color swatch of paint `i` — its representative color (solid,
    /// or the first gradient stop), opening the picker on the target's
    /// color binding at this entry.
    fn paint_swatch(
        &self,
        target: PaintTarget,
        i: usize,
        paint: &Paint,
        _snapshot: &Snapshot,
    ) -> Swatch {
        Swatch {
            id: paint_swatch_id(target, i),
            color: paint_swatch_color(paint),
            width: 20.0,
            height: 14.0,
            action: SwatchAction::OpenPicker,
            binding: self.paint_binding(_snapshot, target, target.color_prop(), Some(i), "color"),
        }
    }

    /// The kind select of paint `i` (solid / the four gradients).
    fn paint_kind(
        &self,
        target: PaintTarget,
        i: usize,
        paint: &Paint,
        _snapshot: &Snapshot,
    ) -> Select {
        Select {
            id: paint_kind_id(target, i),
            options: PAINT_KINDS.iter().map(|k| k.to_string()).collect(),
            selected: Field::Value(paint_kind_index(paint)),
            width: 50.0,
            height: 20.0,
            binding: self.paint_binding(_snapshot, target, target.kind_prop(), Some(i), "kind"),
        }
    }

    /// The active toggle of paint `i` (disable without removing).
    fn paint_active(
        &self,
        target: PaintTarget,
        i: usize,
        paint: &Paint,
        _snapshot: &Snapshot,
    ) -> Toggle {
        Toggle {
            id: paint_active_id(target, i),
            value: Field::Value(paint.active()),
            look: ToggleLook::Check,
            size: 16.0,
            binding: self.paint_binding(_snapshot, target, target.active_prop(), Some(i), "active"),
        }
    }

    /// The remove button of paint `i` — a commit-only list `Remove`.
    fn paint_remove(&self, target: PaintTarget, i: usize, _snapshot: &Snapshot) -> Button {
        Button {
            id: paint_remove_id(target, i),
            label: "✕".to_string(),
            active: false,
            width: 18.0,
            height: 16.0,
            commit: Some((
                self.paint_binding(_snapshot, target, target.list_prop(), None, "remove"),
                BindingValue::ListOp(ListOp::Remove(i)),
            )),
        }
    }

    /// Push a labeled single-control row — the section-builder idiom
    /// shared by the Text and stroke-geometry sections.
    fn push_row(
        &self,
        children: &mut Vec<Box<dyn Widget>>,
        id: &str,
        label: &str,
        control: Box<dyn Widget>,
        height: f32,
    ) {
        children.push(Box::new(Row {
            id: id.to_string(),
            label: label.to_string(),
            width: self.width - 24.0,
            height,
            children: vec![control],
        }));
    }

    /// The **Text** typography section (Slice A): font size / weight /
    /// italic / line-height / letter-spacing / horizontal + vertical
    /// align, authored on the node-level style. Absent for non-text
    /// kinds (`PROP-1`; the gate keys on `font_size`). Font family,
    /// decoration, transform, truncation, and per-run rich text are
    /// later slices (named in TODO); text color/stroke ride the
    /// Fills/Strokes sections.
    fn push_text(&self, children: &mut Vec<Box<dyn Widget>>, snapshot: &Snapshot) {
        let Some(size) = snapshot.font_size else {
            return;
        };
        children.push(Box::new(SectionHeader {
            id: TEXT_HEADER_ID.to_string(),
            label: "Text".to_string(),
            width: self.width - 24.0,
            height: 22.0,
            children: Vec::new(),
        }));
        self.push_row(
            children,
            TEXT_SIZE_ROW_ID,
            "Size",
            Box::new(self.number(
                snapshot,
                TEXT_SIZE_ID,
                size,
                BindingProperty::FontSize,
                Some(1.0),
            )),
            20.0,
        );
        self.push_row(
            children,
            TEXT_WEIGHT_ROW_ID,
            "Weight",
            Box::new(self.font_weight_select(snapshot)),
            20.0,
        );
        self.push_row(
            children,
            TEXT_ITALIC_ROW_ID,
            "Italic",
            Box::new(self.font_italic_toggle(snapshot)),
            20.0,
        );
        self.push_row(
            children,
            TEXT_LINE_ROW_ID,
            "Line",
            Box::new(self.line_height_number(snapshot)),
            20.0,
        );
        self.push_row(
            children,
            TEXT_LETTER_ROW_ID,
            "Letter",
            Box::new(self.letter_spacing_number(snapshot)),
            20.0,
        );
        self.push_row(
            children,
            ALIGN_ROW_ID,
            "Align",
            Box::new(self.align_segmented(snapshot)),
            22.0,
        );
        self.push_row(
            children,
            TEXT_VALIGN_ROW_ID,
            "Vertical",
            Box::new(self.valign_segmented(snapshot)),
            22.0,
        );
    }

    /// Font weight — a dropdown select over the named `FONT_WEIGHTS`.
    fn font_weight_select(&self, snapshot: &Snapshot) -> Select {
        Select {
            id: TEXT_WEIGHT_ID.to_string(),
            options: FONT_WEIGHTS.iter().map(|(l, _)| l.to_string()).collect(),
            selected: snapshot
                .font_weight
                .map(Field::Value)
                .unwrap_or(Field::Mixed),
            width: self.width - 24.0 - 64.0 - 8.0,
            height: 20.0,
            binding: Binding {
                property: BindingProperty::FontWeight,
                targets: snapshot.selection.clone(),
                label: "ui.text.weight".to_string(),
                entry: None,
            },
        }
    }

    /// Italic — a checkbox toggle bound to `font_italic`.
    fn font_italic_toggle(&self, snapshot: &Snapshot) -> Toggle {
        Toggle {
            id: TEXT_ITALIC_ID.to_string(),
            value: Field::Value(snapshot.font_italic.unwrap_or(false)),
            look: ToggleLook::Check,
            size: 16.0,
            binding: Binding {
                property: BindingProperty::FontItalic,
                targets: snapshot.selection.clone(),
                label: "ui.text.italic".to_string(),
                entry: None,
            },
        }
    }

    /// Line height — a scrubbable multiplier (`Factor`), ≥ 0, fine step.
    fn line_height_number(&self, snapshot: &Snapshot) -> Number {
        let mut n = self.number(
            snapshot,
            TEXT_LINE_ID,
            snapshot.line_height.unwrap_or(1.0),
            BindingProperty::LineHeight,
            Some(0.0),
        );
        n.step = 0.1;
        n
    }

    /// Letter spacing — a scrubbable px value (`Fixed`), may go negative.
    fn letter_spacing_number(&self, snapshot: &Snapshot) -> Number {
        let mut n = self.number(
            snapshot,
            TEXT_LETTER_ID,
            snapshot.letter_spacing.unwrap_or(0.0),
            BindingProperty::LetterSpacing,
            None,
        );
        n.step = 0.1;
        n
    }

    /// Vertical text alignment — a segmented control over
    /// `TEXT_ALIGN_VERTICALS`.
    fn valign_segmented(&self, snapshot: &Snapshot) -> Segmented {
        self.enum_segmented(
            snapshot,
            TEXT_VALIGN_ID,
            TEXT_ALIGN_VERTICALS.iter().map(|(l, _)| *l).collect(),
            snapshot.text_align_vertical,
            BindingProperty::TextAlignVertical,
            "ui.text.valign".to_string(),
        )
    }

    /// Rebuild the typography widgets whose value changed. Numbers rebuild
    /// on value *or* edit-buffer change (a keystroke); select/segmented/
    /// toggle on value.
    fn sync_text(&self, ui: &mut UiLayer, prev: &Snapshot, snapshot: &Snapshot) {
        if prev.text_align != snapshot.text_align {
            ui.rebuild_widget(
                &ALIGN_ID.to_string(),
                Box::new(self.align_segmented(snapshot)),
            );
        }
        if prev.font_size != snapshot.font_size
            || prev.font_size_buffer != snapshot.font_size_buffer
        {
            ui.rebuild_widget(
                &TEXT_SIZE_ID.to_string(),
                Box::new(self.number(
                    snapshot,
                    TEXT_SIZE_ID,
                    snapshot.font_size.unwrap_or(0.0),
                    BindingProperty::FontSize,
                    Some(1.0),
                )),
            );
        }
        if prev.font_weight != snapshot.font_weight {
            ui.rebuild_widget(
                &TEXT_WEIGHT_ID.to_string(),
                Box::new(self.font_weight_select(snapshot)),
            );
        }
        if prev.font_italic != snapshot.font_italic {
            ui.rebuild_widget(
                &TEXT_ITALIC_ID.to_string(),
                Box::new(self.font_italic_toggle(snapshot)),
            );
        }
        if prev.line_height != snapshot.line_height
            || prev.line_height_buffer != snapshot.line_height_buffer
        {
            ui.rebuild_widget(
                &TEXT_LINE_ID.to_string(),
                Box::new(self.line_height_number(snapshot)),
            );
        }
        if prev.letter_spacing != snapshot.letter_spacing
            || prev.letter_spacing_buffer != snapshot.letter_spacing_buffer
        {
            ui.rebuild_widget(
                &TEXT_LETTER_ID.to_string(),
                Box::new(self.letter_spacing_number(snapshot)),
            );
        }
        if prev.text_align_vertical != snapshot.text_align_vertical {
            ui.rebuild_widget(
                &TEXT_VALIGN_ID.to_string(),
                Box::new(self.valign_segmented(snapshot)),
            );
        }
    }

    /// Stroke geometry rows (weight / align / cap / join / miter / dash),
    /// appended below the Strokes paint rows when the head node has a
    /// stroke. Align/cap/join/miter/dash render only for kinds with a
    /// stroke style; miter only when the join is miter. Weight shows for
    /// any stroked kind.
    fn push_stroke_geometry(&self, children: &mut Vec<Box<dyn Widget>>, snapshot: &Snapshot) {
        let has_stroke = snapshot.strokes.as_ref().is_some_and(|s| !s.is_empty());
        if !has_stroke {
            return;
        }
        if snapshot.stroke_width.is_some() {
            self.push_row(
                children,
                STROKE_WIDTH_ROW_ID,
                "Weight",
                Box::new(self.number(
                    snapshot,
                    STROKE_WIDTH_ID,
                    snapshot.stroke_width.unwrap_or(0.0),
                    BindingProperty::StrokeWidth,
                    Some(0.0),
                )),
                20.0,
            );
        }
        if snapshot.stroke_align.is_some() {
            self.push_row(
                children,
                STROKE_ALIGN_ROW_ID,
                "Align",
                Box::new(self.stroke_segmented(
                    snapshot,
                    STROKE_ALIGN_ID,
                    STROKE_ALIGNS.iter().map(|(l, _)| *l).collect(),
                    snapshot.stroke_align,
                    BindingProperty::StrokeAlign,
                    "align",
                )),
                22.0,
            );
        }
        if snapshot.stroke_cap.is_some() {
            self.push_row(
                children,
                STROKE_CAP_ROW_ID,
                "Cap",
                Box::new(self.stroke_segmented(
                    snapshot,
                    STROKE_CAP_ID,
                    STROKE_CAPS.iter().map(|(l, _)| *l).collect(),
                    snapshot.stroke_cap,
                    BindingProperty::StrokeCap,
                    "cap",
                )),
                22.0,
            );
        }
        if snapshot.stroke_join.is_some() {
            self.push_row(
                children,
                STROKE_JOIN_ROW_ID,
                "Join",
                Box::new(self.stroke_segmented(
                    snapshot,
                    STROKE_JOIN_ID,
                    STROKE_JOINS.iter().map(|(l, _)| *l).collect(),
                    snapshot.stroke_join,
                    BindingProperty::StrokeJoin,
                    "join",
                )),
                22.0,
            );
            // Miter limit only applies to the miter join (index 0).
            if snapshot.stroke_join == Some(0) {
                self.push_row(
                    children,
                    STROKE_MITER_ROW_ID,
                    "Miter",
                    Box::new(self.number(
                        snapshot,
                        STROKE_MITER_ID,
                        snapshot.stroke_miter.unwrap_or(4.0),
                        BindingProperty::StrokeMiter,
                        Some(1.0),
                    )),
                    20.0,
                );
            }
        }
        if snapshot.stroke_dash.is_some() {
            self.push_row(
                children,
                STROKE_DASH_ROW_ID,
                "Dash",
                Box::new(self.number(
                    snapshot,
                    STROKE_DASH_ID,
                    snapshot.stroke_dash.unwrap_or(0.0),
                    BindingProperty::StrokeDash,
                    Some(0.0),
                )),
                20.0,
            );
        }
    }

    /// A single-select segmented control over an enum option table
    /// (alignment, cap, join, …) — the shared builder the align / valign /
    /// stroke controls delegate to.
    fn enum_segmented(
        &self,
        snapshot: &Snapshot,
        id: &str,
        labels: Vec<&str>,
        selected: Option<usize>,
        property: BindingProperty,
        label: String,
    ) -> Segmented {
        Segmented {
            id: id.to_string(),
            options: labels.into_iter().map(Segment::new).collect(),
            selected: selected.map(Field::Value).unwrap_or(Field::Mixed),
            columns: 0,
            width: self.width - 24.0 - 64.0 - 8.0,
            height: 22.0,
            binding: Binding {
                property,
                targets: snapshot.selection.clone(),
                label,
                entry: None,
            },
        }
    }

    /// A stroke enum segmented control (align / cap / join).
    fn stroke_segmented(
        &self,
        snapshot: &Snapshot,
        id: &str,
        labels: Vec<&str>,
        selected: Option<usize>,
        property: BindingProperty,
        verb: &str,
    ) -> Segmented {
        self.enum_segmented(
            snapshot,
            id,
            labels,
            selected,
            property,
            format!("ui.stroke.{verb}"),
        )
    }

    /// The **Layer blur** effect section (single slot): a header with an
    /// enable toggle; when a blur exists, a Gaussian-radius number and an
    /// active toggle. Absent for kinds that carry no effects (`PROP-1`).
    /// Backdrop blur and progressive blur are later slices.
    fn push_layer_blur(&self, children: &mut Vec<Box<dyn Widget>>, snapshot: &Snapshot) {
        if !snapshot.effects_capable {
            return;
        }
        children.push(Box::new(SectionHeader {
            id: BLUR_HEADER_ID.to_string(),
            label: "Layer blur".to_string(),
            width: self.width - 24.0,
            height: 22.0,
            children: vec![Box::new(self.blur_enable_toggle(snapshot))],
        }));
        if let Some((radius, _)) = snapshot.blur {
            self.push_row(
                children,
                BLUR_RADIUS_ROW_ID,
                "Radius",
                Box::new(self.blur_radius_number(snapshot, radius)),
                20.0,
            );
            self.push_row(
                children,
                BLUR_ACTIVE_ROW_ID,
                "On",
                Box::new(self.blur_active_toggle(snapshot)),
                20.0,
            );
        }
    }

    /// The blur enable toggle (in the section header) — presence of the
    /// slot; flipping it adds a default blur or clears it.
    fn blur_enable_toggle(&self, snapshot: &Snapshot) -> Toggle {
        Toggle {
            id: BLUR_ENABLE_ID.to_string(),
            value: Field::Value(snapshot.blur.is_some()),
            look: ToggleLook::Check,
            size: 16.0,
            binding: Binding {
                property: BindingProperty::LayerBlurEnabled,
                targets: snapshot.selection.clone(),
                label: "ui.blur.enable".to_string(),
                entry: None,
            },
        }
    }

    /// The blur Gaussian-radius number (≥ 0).
    fn blur_radius_number(&self, snapshot: &Snapshot, radius: f32) -> Number {
        self.number(
            snapshot,
            BLUR_RADIUS_ID,
            radius,
            BindingProperty::LayerBlurRadius,
            Some(0.0),
        )
    }

    /// The blur active toggle (disable without removing the slot).
    fn blur_active_toggle(&self, snapshot: &Snapshot) -> Toggle {
        Toggle {
            id: BLUR_ACTIVE_ID.to_string(),
            value: Field::Value(snapshot.blur.map(|(_, a)| a).unwrap_or(false)),
            look: ToggleLook::Check,
            size: 16.0,
            binding: Binding {
                property: BindingProperty::LayerBlurActive,
                targets: snapshot.selection.clone(),
                label: "ui.blur.active".to_string(),
                entry: None,
            },
        }
    }

    /// The **Shadows** effect section (multi-valued): a header with an add
    /// button and one entry per drop/inner shadow. Each entry is a control
    /// row (kind select + color swatch + active toggle + remove) followed
    /// by offset (X / Y), blur, and spread number rows. Absent for kinds
    /// that carry no effects (`PROP-1`).
    fn push_shadows(&self, children: &mut Vec<Box<dyn Widget>>, snapshot: &Snapshot) {
        if !snapshot.effects_capable {
            return;
        }
        let add = Button {
            id: SHADOWS_ADD_ID.to_string(),
            label: "＋".to_string(),
            active: false,
            width: 20.0,
            height: 16.0,
            commit: Some((
                self.shadow_binding(snapshot, BindingProperty::Shadows, None, "add"),
                BindingValue::ListOp(ListOp::Add),
            )),
        };
        children.push(Box::new(SectionHeader {
            id: SHADOWS_HEADER_ID.to_string(),
            label: "Shadows".to_string(),
            width: self.width - 24.0,
            height: 22.0,
            children: vec![Box::new(add)],
        }));
        for (i, shadow) in snapshot.shadows.iter().enumerate() {
            self.push_shadow_entry(children, i, shadow, snapshot);
        }
    }

    /// One shadow entry: a control row then its four parameter rows.
    fn push_shadow_entry(
        &self,
        children: &mut Vec<Box<dyn Widget>>,
        i: usize,
        shadow: &ShadowSnapshot,
        snapshot: &Snapshot,
    ) {
        children.push(Box::new(Row {
            id: shadow_part_id(i, "row"),
            label: String::new(),
            width: self.width - 24.0,
            height: 20.0,
            children: vec![
                Box::new(self.shadow_kind_select(i, shadow, snapshot)),
                Box::new(self.shadow_swatch(i, shadow, snapshot)),
                Box::new(self.shadow_active_toggle(i, shadow, snapshot)),
                Box::new(self.shadow_remove(i, snapshot)),
            ],
        }));
        self.push_row(
            children,
            &shadow_part_id(i, "dx.row"),
            "X",
            Box::new(self.shadow_number(
                snapshot,
                i,
                "dx",
                shadow.dx,
                BindingProperty::ShadowDx,
                None,
            )),
            20.0,
        );
        self.push_row(
            children,
            &shadow_part_id(i, "dy.row"),
            "Y",
            Box::new(self.shadow_number(
                snapshot,
                i,
                "dy",
                shadow.dy,
                BindingProperty::ShadowDy,
                None,
            )),
            20.0,
        );
        self.push_row(
            children,
            &shadow_part_id(i, "blur.row"),
            "Blur",
            Box::new(self.shadow_number(
                snapshot,
                i,
                "blur",
                shadow.blur,
                BindingProperty::ShadowBlur,
                Some(0.0),
            )),
            20.0,
        );
        self.push_row(
            children,
            &shadow_part_id(i, "spread.row"),
            "Spread",
            Box::new(self.shadow_number(
                snapshot,
                i,
                "spread",
                shadow.spread,
                BindingProperty::ShadowSpread,
                None,
            )),
            20.0,
        );
    }

    /// A binding for a shadow control, with the shared `ui.shadow.<verb>`
    /// history-label convention.
    fn shadow_binding(
        &self,
        snapshot: &Snapshot,
        property: BindingProperty,
        entry: Option<usize>,
        verb: &str,
    ) -> Binding {
        Binding {
            property,
            targets: snapshot.selection.clone(),
            label: format!("ui.shadow.{verb}"),
            entry,
        }
    }

    /// The drop-vs-inner kind select of shadow `i`.
    fn shadow_kind_select(&self, i: usize, shadow: &ShadowSnapshot, snapshot: &Snapshot) -> Select {
        Select {
            id: shadow_part_id(i, "kind"),
            options: SHADOW_KINDS.iter().map(|k| k.to_string()).collect(),
            selected: Field::Value(shadow.kind),
            width: 50.0,
            height: 20.0,
            binding: self.shadow_binding(snapshot, BindingProperty::ShadowKind, Some(i), "kind"),
        }
    }

    /// The color swatch of shadow `i`, opening the picker on its color.
    fn shadow_swatch(&self, i: usize, shadow: &ShadowSnapshot, snapshot: &Snapshot) -> Swatch {
        Swatch {
            id: shadow_swatch_id(i),
            color: shadow.color,
            width: 20.0,
            height: 14.0,
            action: SwatchAction::OpenPicker,
            binding: self.shadow_binding(snapshot, BindingProperty::ShadowColor, Some(i), "color"),
        }
    }

    /// The active toggle of shadow `i` (disable without removing).
    fn shadow_active_toggle(
        &self,
        i: usize,
        shadow: &ShadowSnapshot,
        snapshot: &Snapshot,
    ) -> Toggle {
        Toggle {
            id: shadow_part_id(i, "active"),
            value: Field::Value(shadow.active),
            look: ToggleLook::Check,
            size: 16.0,
            binding: self.shadow_binding(
                snapshot,
                BindingProperty::ShadowActive,
                Some(i),
                "active",
            ),
        }
    }

    /// The remove button of shadow `i` — a commit-only list `Remove`.
    fn shadow_remove(&self, i: usize, snapshot: &Snapshot) -> Button {
        Button {
            id: shadow_part_id(i, "remove"),
            label: "✕".to_string(),
            active: false,
            width: 18.0,
            height: 16.0,
            commit: Some((
                self.shadow_binding(snapshot, BindingProperty::Shadows, None, "remove"),
                BindingValue::ListOp(ListOp::Remove(i)),
            )),
        }
    }

    /// An entry-addressed number for shadow `i`'s `part` (dx/dy/blur/
    /// spread) — `self.number` with the binding pointed at `shadows[i]`.
    fn shadow_number(
        &self,
        snapshot: &Snapshot,
        i: usize,
        part: &str,
        value: f32,
        property: BindingProperty,
        min: Option<f32>,
    ) -> Number {
        let mut n = self.number(snapshot, &shadow_part_id(i, part), value, property, min);
        n.binding.entry = Some(i);
        n.binding.label = format!("ui.shadow.{part}");
        n
    }

    /// Rebuild the effect widgets whose value changed (same structure —
    /// blur presence and shadow count changes remounted via
    /// `effects_shape`). Numbers rebuild on value *or* edit-buffer change
    /// (a keystroke); select/swatch/toggle on value.
    fn sync_effects(&self, ui: &mut UiLayer, prev: &Snapshot, snapshot: &Snapshot) {
        if let Some((radius, active)) = snapshot.blur {
            if prev.blur.map(|(r, _)| r) != Some(radius) || prev.blur_buffer != snapshot.blur_buffer
            {
                ui.rebuild_widget(
                    &BLUR_RADIUS_ID.to_string(),
                    Box::new(self.blur_radius_number(snapshot, radius)),
                );
            }
            if prev.blur.map(|(_, a)| a) != Some(active) {
                ui.rebuild_widget(
                    &BLUR_ACTIVE_ID.to_string(),
                    Box::new(self.blur_active_toggle(snapshot)),
                );
            }
        }
        for (i, s) in snapshot.shadows.iter().enumerate() {
            let Some(p) = prev.shadows.get(i) else {
                continue;
            };
            if p == s {
                continue;
            }
            if p.kind != s.kind {
                ui.rebuild_widget(
                    &shadow_part_id(i, "kind"),
                    Box::new(self.shadow_kind_select(i, s, snapshot)),
                );
            }
            if p.color != s.color {
                ui.rebuild_widget(
                    &shadow_swatch_id(i),
                    Box::new(self.shadow_swatch(i, s, snapshot)),
                );
            }
            if p.active != s.active {
                ui.rebuild_widget(
                    &shadow_part_id(i, "active"),
                    Box::new(self.shadow_active_toggle(i, s, snapshot)),
                );
            }
            if p.dx != s.dx || p.dx_buffer != s.dx_buffer {
                ui.rebuild_widget(
                    &shadow_part_id(i, "dx"),
                    Box::new(self.shadow_number(
                        snapshot,
                        i,
                        "dx",
                        s.dx,
                        BindingProperty::ShadowDx,
                        None,
                    )),
                );
            }
            if p.dy != s.dy || p.dy_buffer != s.dy_buffer {
                ui.rebuild_widget(
                    &shadow_part_id(i, "dy"),
                    Box::new(self.shadow_number(
                        snapshot,
                        i,
                        "dy",
                        s.dy,
                        BindingProperty::ShadowDy,
                        None,
                    )),
                );
            }
            if p.blur != s.blur || p.blur_buffer != s.blur_buffer {
                ui.rebuild_widget(
                    &shadow_part_id(i, "blur"),
                    Box::new(self.shadow_number(
                        snapshot,
                        i,
                        "blur",
                        s.blur,
                        BindingProperty::ShadowBlur,
                        Some(0.0),
                    )),
                );
            }
            if p.spread != s.spread || p.spread_buffer != s.spread_buffer {
                ui.rebuild_widget(
                    &shadow_part_id(i, "spread"),
                    Box::new(self.shadow_number(
                        snapshot,
                        i,
                        "spread",
                        s.spread,
                        BindingProperty::ShadowSpread,
                        None,
                    )),
                );
            }
        }
    }

    /// The **Selection colors** section (read-only minimal
    /// introduction): the distinct solid colors of the head node's
    /// fills + strokes, listed as hex labels. The full spec aggregates
    /// across the whole selection and offers recolor-all +
    /// select-by-color — deferred. Reflects the last built (committed)
    /// state; it does not live-update during an in-place recolor.
    fn push_selection_colors(&self, children: &mut Vec<Box<dyn Widget>>, snapshot: &Snapshot) {
        let mut hexes: Vec<String> = Vec::new();
        for stack in [&snapshot.fills, &snapshot.strokes] {
            for paint in stack.iter().flatten() {
                if let Paint::Solid(p) = paint {
                    let hex = color_hex(p.color);
                    if !hexes.contains(&hex) {
                        hexes.push(hex);
                    }
                }
            }
        }
        if hexes.is_empty() {
            return;
        }
        let cw = self.width - 24.0;
        children.push(Box::new(SectionHeader {
            id: SELECTION_COLORS_HEADER_ID.to_string(),
            label: "Colors".to_string(),
            width: cw,
            height: 22.0,
            children: Vec::new(),
        }));
        for (i, hex) in hexes.iter().enumerate() {
            children.push(Box::new(Label {
                id: selection_color_id(i),
                text: hex.clone(),
                width: cw,
                height: 14.0,
                font_size: 11.0,
            }));
        }
    }

    /// The **Export** section (scaffold minimal introduction): a header
    /// and an honest note. Export presets have no document/editor domain
    /// yet (format + scale, `IO-7`) — the section is present so it can
    /// be prioritized, and names its own deferral rather than rendering
    /// a control that does nothing.
    fn push_export(&self, children: &mut Vec<Box<dyn Widget>>) {
        let cw = self.width - 24.0;
        children.push(Box::new(SectionHeader {
            id: EXPORT_HEADER_ID.to_string(),
            label: "Export".to_string(),
            width: cw,
            height: 22.0,
            children: Vec::new(),
        }));
        children.push(Box::new(Label {
            id: EXPORT_NOTE_ID.to_string(),
            text: "No export presets".to_string(),
            width: cw,
            height: 14.0,
            font_size: 11.0,
        }));
    }
}

/// `#RRGGBBAA` hex for a color (the selection-colors read-only list).
fn color_hex(c: CGColor) -> String {
    format!("#{:02X}{:02X}{:02X}{:02X}", c.r, c.g, c.b, c.a)
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

/// A paint section's *row-shape* signature: one flag per entry marking
/// whether it is an image paint (image rows have a different control
/// layout). A change here — count or image-ness — is a structure change
/// that remounts the panel; recolor / kind-swap / active are value
/// changes handled incrementally.
fn paints_shape(snapshot: &Snapshot, target: PaintTarget) -> Option<Vec<bool>> {
    target
        .stack(snapshot)
        .as_ref()
        .map(|v| v.iter().map(|p| matches!(p, Paint::Image(_))).collect())
}
