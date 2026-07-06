//! Binding — the preview/commit value contract (`UI-4`) between
//! widgets and the editor.
//!
//! Widgets never see the editor. They emit [`Emission`]s — plain data
//! commands carrying a [`Binding`] (property + target ids) and a
//! [`BindingPhase`]. The driver (shell or test harness) hands them to
//! [`apply`], which maps them onto the editor's gesture framing:
//!
//! - `Begin`   → [`Editor::begin_gesture`]
//! - `Preview` → one `Silent` patch batch (live render, never recorded)
//! - `Commit`  → one final `Silent` patch batch, then
//!   [`Editor::commit_gesture`] — exactly one history entry per
//!   interaction (`UI-4`, `HISB-2`)
//! - `Revert`  → [`Editor::abort_gesture`] — pre-interaction state
//!   restored, nothing recorded
//!
//! Widgets uphold the phase discipline (every interaction is `Begin`,
//! previews*, then exactly one `Commit` or `Revert`); `apply` is
//! mechanical and does not police it.

use grida::cg::fe::{FeBlur, FeGaussianBlur, FeLayerBlur, FeShadow, FilterShadowEffect};
use grida::cg::prelude::{
    BlendMode, CGColor, DiamondGradientPaint, GradientStop, LayerBlendMode, LinearGradientPaint,
    Paint, Paints, RadialGradientPaint, SolidPaint, StrokeAlign, StrokeCap, StrokeJoin,
    SweepGradientPaint, TextAlign, TextAlignVertical, TextLetterSpacing, TextLineHeight,
};

use crate::document::{Id, Mutation, PropPatch};

/// The text-align options the UI offers, in list order — the source
/// of truth for the index the segmented control emits and reads back.
pub const TEXT_ALIGNS: &[(&str, TextAlign)] = &[
    ("Left", TextAlign::Left),
    ("Center", TextAlign::Center),
    ("Right", TextAlign::Right),
    ("Justify", TextAlign::Justify),
];

/// The vertical text-align options, in list order — the source of truth
/// for the index the segmented control emits and reads back.
pub const TEXT_ALIGN_VERTICALS: &[(&str, TextAlignVertical)] = &[
    ("Top", TextAlignVertical::Top),
    ("Middle", TextAlignVertical::Center),
    ("Bottom", TextAlignVertical::Bottom),
];

/// The font-weight options the weight select offers, in list order — the
/// named OpenType weights (`FontWeight` constants). A node whose weight
/// is off-table (e.g. 600) maps to the nearest entry for display; the
/// commit sets the exact table value.
pub const FONT_WEIGHTS: &[(&str, u32)] = &[
    ("Thin", 100),
    ("Light", 300),
    ("Regular", 400),
    ("Medium", 500),
    ("Bold", 700),
];

/// The [`FONT_WEIGHTS`] index nearest to a raw weight — the display
/// direction of the weight select (a panel reads this to pick the shown
/// option), symmetric with the `FontWeight` resolver's index→weight
/// direction. Off-table weights (e.g. 600) map to the closest entry.
pub fn font_weight_index(weight: u32) -> usize {
    FONT_WEIGHTS
        .iter()
        .enumerate()
        .min_by_key(|(_, (_, v))| v.abs_diff(weight))
        .map(|(i, _)| i)
        .unwrap_or(2)
}

/// The blend-mode options the UI offers, in list order — the single
/// source of truth for the index the select emits (`BlendMode`
/// binding) and the index the panel reads back. A curated subset (the
/// full CSS set is longer); "Pass through" is the non-isolated
/// default.
pub const BLEND_MODES: &[(&str, LayerBlendMode)] = &[
    ("Pass through", LayerBlendMode::PassThrough),
    ("Normal", LayerBlendMode::Blend(BlendMode::Normal)),
    ("Multiply", LayerBlendMode::Blend(BlendMode::Multiply)),
    ("Screen", LayerBlendMode::Blend(BlendMode::Screen)),
    ("Overlay", LayerBlendMode::Blend(BlendMode::Overlay)),
    ("Darken", LayerBlendMode::Blend(BlendMode::Darken)),
    ("Lighten", LayerBlendMode::Blend(BlendMode::Lighten)),
    ("Difference", LayerBlendMode::Blend(BlendMode::Difference)),
];
use crate::editor::{Editor, Recording};
use crate::history::Origin;

/// The document property a widget binds to (M3 subset).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindingProperty {
    /// Node opacity (0.0–1.0).
    Opacity,
    /// Single solid fill color — the narrow M1 convenience domain.
    FillSolid,
    /// A structural edit to the fill stack (add / remove / toggle-active
    /// / reorder), carried as a [`BindingValue::ListOp`]. `targets` each
    /// resolve against their own current stack; `entry` is unused (the
    /// op carries its own index).
    Fills,
    /// The representative color of the fill paint at `entry` — the solid
    /// color, or the first gradient stop. No-op on image paints.
    FillColor,
    /// The kind of the fill paint at `entry`, by index into
    /// [`PAINT_KINDS`] — converts the paint, carrying its color/stops.
    FillKind,
    /// The opacity (0.0–1.0) of the fill paint at `entry` (solid → color
    /// alpha; gradient/image → the paint's `opacity`).
    FillOpacity,
    /// The active flag of the fill paint at `entry` (disable without
    /// removing).
    FillActive,
    /// The stroke-paint counterparts of the `Fill*` domain — same
    /// shapes, resolved against the node's `strokes` stack.
    Strokes,
    StrokeColor,
    StrokeKind,
    StrokeOpacity,
    StrokeActive,
    /// Stroke geometry (uniform weight px; align/cap/join by index into
    /// [`STROKE_ALIGNS`]/[`STROKE_CAPS`]/[`STROKE_JOINS`]; miter limit;
    /// dash length where 0 = solid).
    StrokeWidth,
    StrokeAlign,
    StrokeCap,
    StrokeJoin,
    StrokeMiter,
    StrokeDash,
    /// Display name.
    Name,
    /// Visibility (the node's `active` flag).
    Visible,
    /// Rotation, authored in **degrees** at the UI and stored in
    /// **radians** on the node (the resolver converts).
    Rotation,
    /// Layer blend mode, chosen by index into [`BLEND_MODES`].
    BlendMode,
    /// Uniform corner radius.
    CornerRadius,
    /// Regular-polygon / star point count.
    PointCount,
    /// Container content clipping.
    ClipsContent,
    /// Horizontal text alignment, by index into [`TEXT_ALIGNS`].
    TextAlign,
    /// Vertical text alignment, by index into [`TEXT_ALIGN_VERTICALS`].
    TextAlignVertical,
    /// Typography (text kinds), authored on the node-level style. Size in
    /// px; weight by index into [`FONT_WEIGHTS`]; italic flag; line-height
    /// multiplier (`Factor`); letter-spacing px (`Fixed`).
    FontSize,
    FontWeight,
    FontItalic,
    LineHeight,
    LetterSpacing,
    /// The layer-blur slot (single per layer). `LayerBlurEnabled` (Bool)
    /// adds/removes the slot; `LayerBlurRadius` (number) authors the
    /// Gaussian radius; `LayerBlurActive` (Bool) toggles it without
    /// removing. Effect-capable node kinds only.
    LayerBlurEnabled,
    LayerBlurRadius,
    LayerBlurActive,
    /// A structural edit to the drop/inner shadow list (add / remove /
    /// toggle-active / reorder), carried as a [`BindingValue::ListOp`] —
    /// the multi-valued shadow counterpart of [`Fills`](Self::Fills).
    Shadows,
    /// Per-shadow sub-values addressed by the binding's `entry`: the
    /// color, drop-vs-inner kind (index into [`SHADOW_KINDS`]), active
    /// flag, offset (dx / dy), blur radius, and spread.
    ShadowColor,
    ShadowKind,
    ShadowActive,
    ShadowDx,
    ShadowDy,
    ShadowBlur,
    ShadowSpread,
    /// Absolute translation x.
    PositionX,
    /// Absolute translation y.
    PositionY,
    /// Concrete width (nodes with a plain `Size` only).
    SizeWidth,
    /// Concrete height (nodes with a plain `Size` only).
    SizeHeight,
    /// The scene's background color — a scene field, not a node
    /// property: the binding's `targets` are ignored (document.md
    /// `scene(op)`; the "solid background" of the canvas stack).
    SceneBackground,
}

/// A value carried by a preview or commit.
#[derive(Debug, Clone, PartialEq)]
pub enum BindingValue {
    Number(f32),
    /// A relative change: applied per target against that node's
    /// *current* value (`WID-2` — on a mixed selection a step is a
    /// per-node relative delta, not a broadcast absolute).
    NumberDelta(f32),
    Color(CGColor),
    Text(String),
    /// A boolean (toggle atoms — visible, locked, wrap, active…).
    Bool(bool),
    /// A one-of-N choice by option index (segmented / select atoms —
    /// alignment, blend mode, cap/join…). The property resolver maps
    /// the index onto the concrete enum value.
    Index(usize),
    /// A four-sided value in `[top, right, bottom, left]` order (quad
    /// composites — corner radius, padding, per-side stroke width).
    Quad([f32; 4]),
    /// An ordered numeric sequence (number-list composites — the dash
    /// pattern).
    Numbers(Vec<f32>),
    /// A structural edit to a list-shaped property (fills, strokes,
    /// effects, export) carrying the affected entry index. List ops
    /// are commit-only bindings — property-scoped, one history entry
    /// each (`SHEET-3`) — distinct from the selection-scoped commands.
    ListOp(ListOp),
}

/// A structural edit to a list property (`SHEET-3`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListOp {
    /// Append a default entry.
    Add,
    /// Remove the entry at the index.
    Remove(usize),
    /// Toggle an entry's active flag (disable without delete).
    ToggleEntry(usize),
    /// Reorder: move an entry from one index to another.
    Move { from: usize, to: usize },
}

/// A widget's connection to the document: which property, on which
/// nodes (a commit broadcasts to all targets in one batch — one
/// history entry, `PROP-3` spirit), and the history step label.
#[derive(Debug, Clone)]
pub struct Binding {
    pub property: BindingProperty,
    pub targets: Vec<Id>,
    /// History entry label (e.g. `"ui.opacity"`) — display only.
    pub label: String,
    /// For list-property bindings (fills, strokes, effects), the index
    /// of the entry this control addresses; `None` for scalar
    /// properties. This is how a *generic* atom (a swatch, a select, a
    /// toggle) says *which* paint it edits without knowing about paints:
    /// the atom passes the binding through unchanged and the resolver
    /// reads `entry` to reach `fills[entry]` (`SHEET-3`, per-entry
    /// sub-values commit independently).
    pub entry: Option<usize>,
}

/// Stroke alignment options, in segmented-control order — the source
/// of truth for the index `StrokeAlign` bindings emit and read back.
pub const STROKE_ALIGNS: &[(&str, StrokeAlign)] = &[
    ("Inside", StrokeAlign::Inside),
    ("Center", StrokeAlign::Center),
    ("Outside", StrokeAlign::Outside),
];

/// Stroke line-cap options, in order.
pub const STROKE_CAPS: &[(&str, StrokeCap)] = &[
    ("Butt", StrokeCap::Butt),
    ("Round", StrokeCap::Round),
    ("Square", StrokeCap::Square),
];

/// Stroke line-join options, in order.
pub const STROKE_JOINS: &[(&str, StrokeJoin)] = &[
    ("Miter", StrokeJoin::Miter),
    ("Round", StrokeJoin::Round),
    ("Bevel", StrokeJoin::Bevel),
];

/// The fill/stroke paint kinds the kind-select offers for authoring, in
/// list order — the source of truth for the index [`BindingProperty::
/// FillKind`] emits and the panel reads back. Image is intentionally
/// absent: an image paint needs a host-provided source, so it is
/// presented by its own panel row rather than authored by kind switch.
pub const PAINT_KINDS: &[&str] = &["Solid", "Linear", "Radial", "Sweep", "Diamond"];

/// The shadow kinds the kind-select offers, in list order — the source
/// of truth for the index [`BindingProperty::ShadowKind`] emits and the
/// panel reads back (0 = drop, 1 = inner).
pub const SHADOW_KINDS: &[&str] = &["Drop", "Inner"];

/// The list index of a shadow's drop-vs-inner kind, for the panel's kind
/// select — the read direction of the `ShadowKind` index binding.
pub fn shadow_kind_index(shadow: &FilterShadowEffect) -> usize {
    match shadow {
        FilterShadowEffect::DropShadow(_) => 0,
        FilterShadowEffect::InnerShadow(_) => 1,
    }
}

/// Interaction phase (`UI-4`).
#[derive(Debug, Clone, PartialEq)]
pub enum BindingPhase {
    /// Interaction started; open the gesture frame.
    Begin,
    /// Live value — applied for rendering, never recorded.
    Preview(BindingValue),
    /// Final value — the one event that produces a history entry.
    Commit(BindingValue),
    /// Cancel — restore the pre-interaction value, record nothing.
    Revert,
}

/// One binding command emitted by a widget.
#[derive(Debug, Clone)]
pub struct Emission {
    pub binding: Binding,
    pub phase: BindingPhase,
}

/// What [`apply`] did beyond the document itself — the applied
/// patches reach pixels through the editor's damage ledger
/// (`frame.md`); this only carries the interaction lifecycle facts.
#[derive(Debug, Default)]
pub struct AppliedEmissions {
    /// At least one commit happened (history changed).
    pub committed: bool,
    /// A revert happened (the working copy rolled back).
    pub reverted: bool,
}

/// Apply emissions to the editor (the single mutation authority).
pub fn apply(editor: &mut Editor, emissions: &[Emission]) -> AppliedEmissions {
    let mut out = AppliedEmissions::default();
    for emission in emissions {
        match &emission.phase {
            BindingPhase::Begin => editor.begin_gesture(),
            BindingPhase::Preview(value) => {
                if let Some(batch) = patch_batch(editor, &emission.binding, value) {
                    let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                }
            }
            BindingPhase::Commit(value) => {
                if let Some(batch) = patch_batch(editor, &emission.binding, value) {
                    let _ = editor.dispatch(batch, Origin::Local, Recording::Silent);
                }
                editor.commit_gesture(Some(emission.binding.label.clone()));
                out.committed = true;
            }
            BindingPhase::Revert => {
                editor.abort_gesture();
                out.reverted = true;
            }
        }
    }
    out
}

/// Build the patch batch for a binding + value: one `Patch` per target
/// node (single batch — single history scope).
///
/// Reads the editor for per-target resolution: relative deltas
/// (`BindingValue::NumberDelta`) resolve against each node's current
/// value, and single-axis position/size writes carry the node's
/// current other-axis value (the `PropPatch` position field is a
/// tuple). Targets that do not support the bound property are skipped
/// rather than failing the whole batch (`DOC-4` atomicity would
/// otherwise reject the supporting targets too).
fn patch_batch(editor: &Editor, binding: &Binding, value: &BindingValue) -> Option<Vec<Mutation>> {
    // Scene fields have no node targets: one scene mutation.
    if matches!(binding.property, BindingProperty::SceneBackground) {
        let BindingValue::Color(color) = value else {
            return None;
        };
        return Some(vec![Mutation::SceneBackground {
            color: Some(*color),
        }]);
    }
    if binding.targets.is_empty() {
        return None;
    }
    let batch: Vec<Mutation> = binding
        .targets
        .iter()
        .filter_map(|id| {
            let set = patch_for(editor, id, binding.property, binding.entry, value)?;
            Some(Mutation::Patch {
                id: id.clone(),
                set: Box::new(set),
            })
        })
        .collect();
    if batch.is_empty() {
        return None;
    }
    Some(batch)
}

/// The patch for one target, or `None` when the target does not
/// support the property (or the value kind does not fit it).
fn patch_for(
    editor: &Editor,
    id: &Id,
    property: BindingProperty,
    entry: Option<usize>,
    value: &BindingValue,
) -> Option<PropPatch> {
    match (property, value) {
        // ── Fills: the general paint-list domain ──────────────────────
        // Structure: read this target's own stack, apply the op, commit
        // the whole next stack (the editing logic lives here, not in the
        // panel — ARCH-3).
        (BindingProperty::Fills, BindingValue::ListOp(op)) => Some(fill_patch(
            apply_paint_list_op(&editor.node_fills(id)?, *op),
        )),
        (BindingProperty::Strokes, BindingValue::ListOp(op)) => Some(stroke_patch(
            apply_paint_list_op(&editor.node_strokes(id)?, *op),
        )),
        // Per-entry sub-values: edit `paints[entry]` in place, commit the
        // whole next stack. Skip silently if the entry is out of range
        // (a stale binding after another edit shortened the list).
        (BindingProperty::FillColor, BindingValue::Color(c)) => {
            edit_paint_at(editor.node_fills(id)?, entry?, |p| set_paint_color(p, *c))
                .map(fill_patch)
        }
        (BindingProperty::StrokeColor, BindingValue::Color(c)) => {
            edit_paint_at(editor.node_strokes(id)?, entry?, |p| set_paint_color(p, *c))
                .map(stroke_patch)
        }
        (BindingProperty::FillActive, BindingValue::Bool(active)) => {
            edit_paint_at(editor.node_fills(id)?, entry?, |p| {
                set_paint_active(p, *active)
            })
            .map(fill_patch)
        }
        (BindingProperty::StrokeActive, BindingValue::Bool(active)) => {
            edit_paint_at(editor.node_strokes(id)?, entry?, |p| {
                set_paint_active(p, *active)
            })
            .map(stroke_patch)
        }
        (BindingProperty::FillKind, BindingValue::Index(kind)) => {
            edit_paint_at(editor.node_fills(id)?, entry?, |p| {
                *p = convert_paint(p, *kind)
            })
            .map(fill_patch)
        }
        (BindingProperty::StrokeKind, BindingValue::Index(kind)) => {
            edit_paint_at(editor.node_strokes(id)?, entry?, |p| {
                *p = convert_paint(p, *kind)
            })
            .map(stroke_patch)
        }
        (BindingProperty::FillOpacity, value) => {
            let entry = entry?;
            let paints = editor.node_fills(id)?;
            let current = paints.as_slice().get(entry)?.opacity();
            let next = resolve_number(value, current)?.clamp(0.0, 1.0);
            edit_paint_at(paints, entry, |p| set_paint_opacity(p, next)).map(fill_patch)
        }
        (BindingProperty::StrokeOpacity, value) => {
            let entry = entry?;
            let paints = editor.node_strokes(id)?;
            let current = paints.as_slice().get(entry)?.opacity();
            let next = resolve_number(value, current)?.clamp(0.0, 1.0);
            edit_paint_at(paints, entry, |p| set_paint_opacity(p, next)).map(stroke_patch)
        }
        // ── Stroke geometry ───────────────────────────────────────────
        (BindingProperty::StrokeWidth, value) => {
            let current = editor.node_stroke_width(id)?;
            Some(PropPatch {
                stroke_width: Some(resolve_number(value, current)?.max(0.0)),
                ..Default::default()
            })
        }
        (BindingProperty::StrokeAlign, BindingValue::Index(i)) => {
            editor.node_stroke_align(id)?; // capability gate
            let (_, align) = STROKE_ALIGNS.get(*i)?;
            Some(PropPatch {
                stroke_align: Some(*align),
                ..Default::default()
            })
        }
        (BindingProperty::StrokeCap, BindingValue::Index(i)) => {
            editor.node_stroke_cap(id)?;
            let (_, cap) = STROKE_CAPS.get(*i)?;
            Some(PropPatch {
                stroke_cap: Some(*cap),
                ..Default::default()
            })
        }
        (BindingProperty::StrokeJoin, BindingValue::Index(i)) => {
            editor.node_stroke_join(id)?;
            let (_, join) = STROKE_JOINS.get(*i)?;
            Some(PropPatch {
                stroke_join: Some(*join),
                ..Default::default()
            })
        }
        (BindingProperty::StrokeMiter, value) => {
            let current = editor.node_stroke_miter(id)?;
            Some(PropPatch {
                stroke_miter: Some(resolve_number(value, current)?.max(1.0)),
                ..Default::default()
            })
        }
        (BindingProperty::StrokeDash, value) => {
            // The panel edits the first dash length; preserve any remaining
            // segments (e.g. the gap in `[4, 2]`) by editing element 0 in
            // place. 0 clears the pattern entirely (solid stroke).
            let mut dashes = editor.node_stroke_dash(id)?;
            let current = dashes.first().copied().unwrap_or(0.0);
            let n = resolve_number(value, current)?.max(0.0);
            if n > 0.0 {
                if dashes.is_empty() {
                    dashes.push(n);
                } else {
                    dashes[0] = n;
                }
            } else {
                dashes.clear();
            }
            Some(PropPatch {
                stroke_dash: Some(dashes),
                ..Default::default()
            })
        }
        (BindingProperty::Opacity, BindingValue::Number(v)) => Some(PropPatch {
            opacity: Some(v.clamp(0.0, 1.0)),
            ..Default::default()
        }),
        (BindingProperty::Opacity, BindingValue::NumberDelta(d)) => {
            let current = editor.node_opacity(id)?;
            Some(PropPatch {
                opacity: Some((current + d).clamp(0.0, 1.0)),
                ..Default::default()
            })
        }
        (BindingProperty::FillSolid, BindingValue::Color(c)) => Some(PropPatch {
            fill_solid: Some(*c),
            ..Default::default()
        }),
        (BindingProperty::Name, BindingValue::Text(s)) => Some(PropPatch {
            name: Some(s.clone()),
            ..Default::default()
        }),
        (BindingProperty::Visible, BindingValue::Bool(v)) => Some(PropPatch {
            active: Some(*v),
            ..Default::default()
        }),
        (BindingProperty::BlendMode, BindingValue::Index(i)) => {
            let (_, mode) = BLEND_MODES.get(*i)?;
            Some(PropPatch {
                blend_mode: Some(*mode),
                ..Default::default()
            })
        }
        (BindingProperty::CornerRadius, value) => {
            // Query first so targets without a corner radius are
            // skipped (not failed) — the position/size discipline.
            let current = editor.node_corner_radius(id)?;
            let radius = resolve_number(value, current)?.max(0.0);
            Some(PropPatch {
                corner_radius: Some(radius),
                ..Default::default()
            })
        }
        (BindingProperty::PointCount, value) => {
            let current = editor.node_point_count(id)? as f32;
            let count = resolve_number(value, current)?.round().clamp(3.0, 60.0) as usize;
            Some(PropPatch {
                point_count: Some(count),
                ..Default::default()
            })
        }
        (BindingProperty::ClipsContent, BindingValue::Bool(v)) => {
            editor.node_clips_content(id)?; // skip non-containers
            Some(PropPatch {
                clips_content: Some(*v),
                ..Default::default()
            })
        }
        (BindingProperty::TextAlign, BindingValue::Index(i)) => {
            editor.node_text_align(id)?; // skip non-text targets
            let (_, align) = TEXT_ALIGNS.get(*i)?;
            Some(PropPatch {
                text_align: Some(*align),
                ..Default::default()
            })
        }
        // ── Typography ────────────────────────────────────────────────
        (BindingProperty::TextAlignVertical, BindingValue::Index(i)) => {
            editor.node_text_align_vertical(id)?; // skip non-text targets
            let (_, v) = TEXT_ALIGN_VERTICALS.get(*i)?;
            Some(PropPatch {
                text_align_vertical: Some(*v),
                ..Default::default()
            })
        }
        (BindingProperty::FontSize, value) => {
            let current = editor.node_font_size(id)?;
            Some(PropPatch {
                font_size: Some(resolve_number(value, current)?.max(1.0)),
                ..Default::default()
            })
        }
        (BindingProperty::FontWeight, BindingValue::Index(i)) => {
            editor.node_font_weight(id)?; // capability gate
            let (_, w) = FONT_WEIGHTS.get(*i)?;
            Some(PropPatch {
                font_weight: Some(*w),
                ..Default::default()
            })
        }
        (BindingProperty::FontItalic, BindingValue::Bool(v)) => {
            editor.node_font_italic(id)?;
            Some(PropPatch {
                font_italic: Some(*v),
                ..Default::default()
            })
        }
        (BindingProperty::LineHeight, value) => {
            // v1 authors the multiplier (`Factor`) variant.
            let current = editor.node_line_height(id)?;
            let n = resolve_number(value, current)?.max(0.0);
            Some(PropPatch {
                line_height: Some(TextLineHeight::Factor(n)),
                ..Default::default()
            })
        }
        (BindingProperty::LetterSpacing, value) => {
            // v1 authors the px (`Fixed`) variant; may go negative.
            let current = editor.node_letter_spacing(id)?;
            let n = resolve_number(value, current)?;
            Some(PropPatch {
                letter_spacing: Some(TextLetterSpacing::Fixed(n)),
                ..Default::default()
            })
        }
        // ── Layer blur (single slot) ──────────────────────────────────
        (BindingProperty::LayerBlurEnabled, BindingValue::Bool(on)) => {
            let fx = editor.node_effects(id)?; // capability gate
            // Enable → create a default blur (or keep the existing one);
            // disable → clear the slot.
            let next = if *on {
                Some(fx.blur.unwrap_or_else(default_layer_blur))
            } else {
                None
            };
            Some(PropPatch {
                layer_blur: Some(next),
                ..Default::default()
            })
        }
        (BindingProperty::LayerBlurRadius, value) => {
            // Skip when the node has no blur to edit. v1 authors the
            // Gaussian variant; the current is the projected radius.
            let mut blur = editor.node_effects(id)?.blur?;
            let current = blur_radius(&blur.blur);
            let n = resolve_number(value, current)?.max(0.0);
            blur.blur = FeBlur::Gaussian(FeGaussianBlur { radius: n });
            Some(PropPatch {
                layer_blur: Some(Some(blur)),
                ..Default::default()
            })
        }
        (BindingProperty::LayerBlurActive, BindingValue::Bool(active)) => {
            let mut blur = editor.node_effects(id)?.blur?;
            blur.active = *active;
            Some(PropPatch {
                layer_blur: Some(Some(blur)),
                ..Default::default()
            })
        }
        // ── Shadows (multi-valued list) ───────────────────────────────
        // Structure: read this target's own list, apply the op, commit
        // the whole next list (the editing logic lives here — ARCH-3).
        (BindingProperty::Shadows, BindingValue::ListOp(op)) => Some(shadow_patch(
            apply_shadow_list_op(&editor.node_effects(id)?.shadows, *op),
        )),
        (BindingProperty::ShadowColor, BindingValue::Color(c)) => {
            edit_shadow_at(editor.node_effects(id)?.shadows, entry?, |s| s.color = *c)
                .map(shadow_patch)
        }
        (BindingProperty::ShadowActive, BindingValue::Bool(active)) => {
            edit_shadow_at(editor.node_effects(id)?.shadows, entry?, |s| {
                s.active = *active
            })
            .map(shadow_patch)
        }
        (BindingProperty::ShadowKind, BindingValue::Index(kind)) => {
            convert_shadow_at(editor.node_effects(id)?.shadows, entry?, *kind).map(shadow_patch)
        }
        (BindingProperty::ShadowDx, value) => {
            let entry = entry?;
            let shadows = editor.node_effects(id)?.shadows;
            let current = shadow_params(shadows.get(entry)?).dx;
            let n = resolve_number(value, current)?;
            edit_shadow_at(shadows, entry, |s| s.dx = n).map(shadow_patch)
        }
        (BindingProperty::ShadowDy, value) => {
            let entry = entry?;
            let shadows = editor.node_effects(id)?.shadows;
            let current = shadow_params(shadows.get(entry)?).dy;
            let n = resolve_number(value, current)?;
            edit_shadow_at(shadows, entry, |s| s.dy = n).map(shadow_patch)
        }
        (BindingProperty::ShadowBlur, value) => {
            let entry = entry?;
            let shadows = editor.node_effects(id)?.shadows;
            let current = shadow_params(shadows.get(entry)?).blur;
            let n = resolve_number(value, current)?.max(0.0);
            edit_shadow_at(shadows, entry, |s| s.blur = n).map(shadow_patch)
        }
        (BindingProperty::ShadowSpread, value) => {
            let entry = entry?;
            let shadows = editor.node_effects(id)?.shadows;
            let current = shadow_params(shadows.get(entry)?).spread;
            let n = resolve_number(value, current)?;
            edit_shadow_at(shadows, entry, |s| s.spread = n).map(shadow_patch)
        }
        (BindingProperty::Rotation, value) => {
            // The UI authors degrees; the node stores radians. A delta
            // (scrub / arrow) is a degree delta applied to the node's
            // current radians.
            let current = editor.node_rotation(id)?;
            let radians = match value {
                BindingValue::Number(deg) => deg.to_radians(),
                BindingValue::NumberDelta(deg) => current + deg.to_radians(),
                _ => return None,
            };
            Some(PropPatch {
                rotation: Some(radians),
                ..Default::default()
            })
        }
        (BindingProperty::PositionX, value) => {
            let (x, y) = editor.node_position(id)?;
            Some(PropPatch {
                position: Some((resolve_number(value, x)?, y)),
                ..Default::default()
            })
        }
        (BindingProperty::PositionY, value) => {
            let (x, y) = editor.node_position(id)?;
            Some(PropPatch {
                position: Some((x, resolve_number(value, y)?)),
                ..Default::default()
            })
        }
        (BindingProperty::SizeWidth, value) => {
            let (w, _) = editor.node_size(id)?;
            Some(PropPatch {
                size: Some((Some(resolve_number(value, w)?), None)),
                ..Default::default()
            })
        }
        (BindingProperty::SizeHeight, value) => {
            let (_, h) = editor.node_size(id)?;
            Some(PropPatch {
                size: Some((None, Some(resolve_number(value, h)?))),
                ..Default::default()
            })
        }
        _ => None,
    }
}

/// Resolve a numeric binding value against a current value: absolute
/// passes through, delta adds.
fn resolve_number(value: &BindingValue, current: f32) -> Option<f32> {
    match value {
        BindingValue::Number(v) => Some(*v),
        BindingValue::NumberDelta(d) => Some(current + d),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Paint editing (the fills-domain resolvers, owned here — ARCH-3)
// ---------------------------------------------------------------------------

/// Mutate the paint at `entry` in place and return the next stack.
/// `None` (skipped) when `entry` is out of range (a stale binding after
/// another edit shortened the list). Target-agnostic — the caller wraps
/// the result into the right patch field ([`fill_patch`] /
/// [`stroke_patch`]).
fn edit_paint_at(paints: Paints, entry: usize, f: impl FnOnce(&mut Paint)) -> Option<Paints> {
    let mut v = paints.as_slice().to_vec();
    f(v.get_mut(entry)?);
    Some(Paints::new(v))
}

/// Wrap a next fill stack into a patch.
fn fill_patch(fills: Paints) -> PropPatch {
    PropPatch {
        fills: Some(fills),
        ..Default::default()
    }
}

/// Wrap a next stroke stack into a patch.
fn stroke_patch(strokes: Paints) -> PropPatch {
    PropPatch {
        strokes: Some(strokes),
        ..Default::default()
    }
}

/// Apply a structural list op to a fill stack, returning the next stack.
/// Out-of-range indices are no-ops (the op simply does not apply).
fn apply_paint_list_op(current: &Paints, op: ListOp) -> Paints {
    let mut v = current.as_slice().to_vec();
    match op {
        ListOp::Add => v.push(default_fill_paint(v.is_empty())),
        ListOp::Remove(i) => {
            if i < v.len() {
                v.remove(i);
            }
        }
        ListOp::ToggleEntry(i) => {
            if let Some(p) = v.get_mut(i) {
                let active = !p.active();
                set_paint_active(p, active);
            }
        }
        ListOp::Move { from, to } => {
            if from < v.len() && to < v.len() {
                let p = v.remove(from);
                v.insert(to, p);
            }
        }
    }
    Paints::new(v)
}

/// The paint appended by "add fill": opaque black for the first entry,
/// half-alpha black otherwise (so a stacked fill reads as an overlay) —
/// mirrors the web's `getNextFillPaint`.
fn default_fill_paint(first: bool) -> Paint {
    let a = if first { 255 } else { 128 };
    Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(0, 0, 0, a)))
}

// ---------------------------------------------------------------------------
// Effect editing (the layer-effects resolvers, owned here — ARCH-3)
// ---------------------------------------------------------------------------

/// The blur added by "enable layer blur": a Gaussian 4px, active.
fn default_layer_blur() -> FeLayerBlur {
    FeLayerBlur::from(4.0)
}

/// A blur's authoring radius (display projection): the Gaussian radius,
/// or the progressive end radius. Lossy — the invertible truth is the
/// whole prior slot carried in the patch (v1 authors Gaussian only).
/// Shared by the resolver's delta base and the panel's radius display.
pub fn blur_radius(blur: &FeBlur) -> f32 {
    match blur {
        FeBlur::Gaussian(g) => g.radius,
        FeBlur::Progressive(p) => p.radius2,
    }
}

/// The shadow appended by "add shadow": a soft drop shadow (0,4) blur 4,
/// 25%-black, active.
fn default_shadow() -> FilterShadowEffect {
    FilterShadowEffect::DropShadow(FeShadow {
        dx: 0.0,
        dy: 4.0,
        blur: 4.0,
        spread: 0.0,
        color: CGColor::from_rgba(0, 0, 0, 64),
        active: true,
    })
}

/// The inner [`FeShadow`] of a shadow effect, regardless of drop-vs-inner
/// kind (both variants wrap one). Shared with the panel's per-shadow
/// display.
pub fn shadow_params(shadow: &FilterShadowEffect) -> &FeShadow {
    match shadow {
        FilterShadowEffect::DropShadow(s) | FilterShadowEffect::InnerShadow(s) => s,
    }
}

/// Mutable [`shadow_params`].
fn shadow_params_mut(shadow: &mut FilterShadowEffect) -> &mut FeShadow {
    match shadow {
        FilterShadowEffect::DropShadow(s) | FilterShadowEffect::InnerShadow(s) => s,
    }
}

/// Mutate the shadow at `entry` in place and return the next list. `None`
/// (skipped) when `entry` is out of range (a stale binding after another
/// edit shortened the list) — the [`edit_paint_at`] pattern.
fn edit_shadow_at(
    mut shadows: Vec<FilterShadowEffect>,
    entry: usize,
    f: impl FnOnce(&mut FeShadow),
) -> Option<Vec<FilterShadowEffect>> {
    f(shadow_params_mut(shadows.get_mut(entry)?));
    Some(shadows)
}

/// Convert the shadow at `entry` to the drop-vs-inner kind at index
/// `kind` (into [`SHADOW_KINDS`]), carrying its parameters. `None` when
/// out of range.
fn convert_shadow_at(
    mut shadows: Vec<FilterShadowEffect>,
    entry: usize,
    kind: usize,
) -> Option<Vec<FilterShadowEffect>> {
    let slot = shadows.get_mut(entry)?;
    let params = *shadow_params(slot);
    *slot = match kind {
        1 => FilterShadowEffect::InnerShadow(params),
        _ => FilterShadowEffect::DropShadow(params),
    };
    Some(shadows)
}

/// Apply a structural list op to a shadow list, returning the next list —
/// the [`apply_paint_list_op`] counterpart. Out-of-range indices are
/// no-ops.
fn apply_shadow_list_op(current: &[FilterShadowEffect], op: ListOp) -> Vec<FilterShadowEffect> {
    let mut v = current.to_vec();
    match op {
        ListOp::Add => v.push(default_shadow()),
        ListOp::Remove(i) => {
            if i < v.len() {
                v.remove(i);
            }
        }
        ListOp::ToggleEntry(i) => {
            if let Some(s) = v.get_mut(i) {
                let params = shadow_params_mut(s);
                params.active = !params.active;
            }
        }
        ListOp::Move { from, to } => {
            if from < v.len() && to < v.len() {
                let s = v.remove(from);
                v.insert(to, s);
            }
        }
    }
    v
}

/// Wrap a next shadow list into a patch.
fn shadow_patch(shadows: Vec<FilterShadowEffect>) -> PropPatch {
    PropPatch {
        shadows: Some(shadows),
        ..Default::default()
    }
}

/// Set a paint's active flag across every kind.
fn set_paint_active(paint: &mut Paint, active: bool) {
    match paint {
        Paint::Solid(p) => p.active = active,
        Paint::LinearGradient(p) => p.active = active,
        Paint::RadialGradient(p) => p.active = active,
        Paint::SweepGradient(p) => p.active = active,
        Paint::DiamondGradient(p) => p.active = active,
        Paint::Image(p) => p.active = active,
    }
}

/// Set a paint's representative color: the solid color, or the first
/// gradient stop. No-op on image paints (they carry no editable color).
fn set_paint_color(paint: &mut Paint, color: CGColor) {
    let stop0 = |stops: &mut Vec<GradientStop>| {
        if let Some(s) = stops.first_mut() {
            s.color = color;
        }
    };
    match paint {
        Paint::Solid(p) => p.color = color,
        Paint::LinearGradient(p) => stop0(&mut p.stops),
        Paint::RadialGradient(p) => stop0(&mut p.stops),
        Paint::SweepGradient(p) => stop0(&mut p.stops),
        Paint::DiamondGradient(p) => stop0(&mut p.stops),
        Paint::Image(_) => {}
    }
}

/// Set a paint's opacity: solid paints carry it in the color alpha;
/// gradients and images carry an explicit `opacity`.
fn set_paint_opacity(paint: &mut Paint, opacity: f32) {
    let a = (opacity.clamp(0.0, 1.0) * 255.0).round() as u8;
    match paint {
        Paint::Solid(p) => p.color.a = a,
        Paint::LinearGradient(p) => p.opacity = opacity,
        Paint::RadialGradient(p) => p.opacity = opacity,
        Paint::SweepGradient(p) => p.opacity = opacity,
        Paint::DiamondGradient(p) => p.opacity = opacity,
        Paint::Image(p) => p.opacity = opacity,
    }
}

/// The paint's stops, for carrying color across a kind conversion. A
/// solid becomes a color→transparent ramp; an image (no color) becomes
/// a neutral black→white ramp.
fn paint_stops(paint: &Paint) -> Vec<GradientStop> {
    match paint {
        Paint::LinearGradient(p) => p.stops.clone(),
        Paint::RadialGradient(p) => p.stops.clone(),
        Paint::SweepGradient(p) => p.stops.clone(),
        Paint::DiamondGradient(p) => p.stops.clone(),
        Paint::Solid(p) => {
            let mut end = p.color;
            end.a = 0;
            vec![
                GradientStop {
                    offset: 0.0,
                    color: p.color,
                },
                GradientStop {
                    offset: 1.0,
                    color: end,
                },
            ]
        }
        Paint::Image(_) => vec![
            GradientStop {
                offset: 0.0,
                color: CGColor::BLACK,
            },
            GradientStop {
                offset: 1.0,
                color: CGColor::WHITE,
            },
        ],
    }
}

/// Convert a paint to the kind at index `kind` in [`PAINT_KINDS`],
/// carrying its color (solid) or stops (gradient→gradient) and opacity.
/// Out-of-range indices leave the paint unchanged.
fn convert_paint(paint: &Paint, kind: usize) -> Paint {
    let opacity = paint.opacity();
    let stops = paint_stops(paint);
    let first_color = stops.first().map(|s| s.color).unwrap_or(CGColor::BLACK);
    match kind {
        0 => {
            // Fold the source opacity into the solid's alpha — a solid
            // paint has no separate opacity channel, so dropping it would
            // silently make a translucent gradient fully opaque.
            let mut color = first_color;
            color.a = (color.a as f32 * opacity).round().clamp(0.0, 255.0) as u8;
            Paint::Solid(SolidPaint::new_color(color))
        }
        1 => Paint::LinearGradient(LinearGradientPaint {
            stops,
            opacity,
            ..LinearGradientPaint::default()
        }),
        2 => Paint::RadialGradient(RadialGradientPaint {
            stops,
            opacity,
            ..RadialGradientPaint::default()
        }),
        3 => Paint::SweepGradient(SweepGradientPaint {
            stops,
            opacity,
            ..SweepGradientPaint::default()
        }),
        4 => Paint::DiamondGradient(DiamondGradientPaint {
            stops,
            opacity,
            ..DiamondGradientPaint::default()
        }),
        _ => paint.clone(),
    }
}
