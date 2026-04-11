//! Render-time viewport filters.
//!
//! These types restrict what the renderer draws and hit-tests without
//! mutating the document, caches, or layout. They are pure viewport
//! overlays — the scene graph stays fully loaded and laid out.
//!
//! # Architecture
//!
//! [`RenderFilter`] is the single home for all viewport-time filters,
//! owned by the [`Renderer`](super::scene::Renderer). Currently it
//! holds one slot — [`IsolationMode`] — but the struct is designed so
//! adding a new filter category (visibility overrides, layer-type
//! filters, debug tints) means adding a field here, not plumbing a
//! fresh parameter through every layer.
//!
//! # C-ABI boundary
//!
//! [`IsolationModeFlags`] packs boolean options into a `u32` for the
//! WASM/C-ABI layer. [`IsolationModeStagePreset`] is `#[repr(u32)]`
//! so it crosses as a plain integer. Rust-side code should prefer the
//! typed structs.

use crate::cg::color::CGColor;
use crate::cg::fe::{FeShadow, FilterShadowEffect};
use crate::cg::types::Paints;
use crate::node::schema::NodeId;

// ═══════════════════════════════════════════════════════════════════════
// RenderFilter
// ═══════════════════════════════════════════════════════════════════════

/// Composite render-time filter owned by the Renderer.
#[derive(Debug, Clone, Default)]
pub struct RenderFilter {
    /// When set, only the isolation root and its descendants are drawn
    /// and hit-tested. Everything else is invisible.
    pub isolation_mode: Option<IsolationMode>,
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationMode
// ═══════════════════════════════════════════════════════════════════════

/// Viewport filter that restricts which part of the scene is drawn and
/// hit-tested. Does NOT mutate the document, caches, or layout.
///
/// This is the same primitive Blender calls "Local View", Maya/Max/C4D
/// call "Isolate Select", Illustrator calls "Isolation Mode", and After
/// Effects calls "Solo".
#[derive(Debug, Clone)]
pub struct IsolationMode {
    /// The only node whose subtree (including itself) is drawn and
    /// hit-tested. Everything else is invisible to paint and pointer.
    pub root: NodeId,

    /// How to treat content that falls outside the isolation root's
    /// own bounds. See [`IsolationModeOutside`].
    pub outside: IsolationModeOutside,

    /// Ephemeral stage decoration drawn at the root's shape.
    /// See [`IsolationModeStagePreset`].
    pub stage_preset: IsolationModeStagePreset,
    // Future:
    //   pub roots: Vec<NodeId>,  // multi-root isolation
    //   pub hit_test: bool,      // scope hit-testing independently of draw
}

impl IsolationMode {
    /// Convenience: isolation with `Hidden` outside mode and no stage.
    pub fn hidden(root: NodeId) -> Self {
        Self {
            root,
            outside: IsolationModeOutside::Hidden,
            stage_preset: IsolationModeStagePreset::None,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeOutside
// ═══════════════════════════════════════════════════════════════════════

/// Rendering strategy for content outside the isolation root's bounds.
///
/// Each variant is a fundamentally different compositing approach. They
/// are mutually exclusive — the renderer picks one draw strategy based
/// on the active variant.
#[derive(Debug, Clone, Default)]
pub enum IsolationModeOutside {
    /// Hard-hide. Non-isolated content is fully skipped. Subtree content
    /// draws at full opacity regardless of overflow. No overlay.
    ///
    /// This is the default (Blender "Local View", Maya "Isolate Select").
    #[default]
    Hidden,

    /// The isolation root's bounds define a viewport. Subtree content
    /// inside draws at full opacity; overflow is dimmed by a post-draw
    /// overlay with the root's shape punched out (`ClipOp::Difference`).
    /// Non-isolated content is still fully hidden.
    ///
    /// Cost: one additional filled rect per frame.
    ///
    /// This is the Keynote / Google Slides model.
    Viewport(IsolationModeDimStyle),
    // Future:
    // /// Non-isolated content drawn dimmed; isolated content on top.
    // /// Two-pass `saveLayer` compositing (Illustrator model).
    // Context(IsolationModeDimStyle),
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeDimStyle
// ═══════════════════════════════════════════════════════════════════════

/// Visual parameters for dimmed content in isolation mode.
#[derive(Debug, Clone, Copy)]
pub struct IsolationModeDimStyle {
    /// How visible the dimmed content remains. `0.0` = invisible,
    /// `1.0` = fully visible (no dimming). Typical values: `0.1`–`0.3`.
    ///
    /// The overlay uses the scene background color (or white fallback)
    /// at `1.0 - opacity` alpha ("fade toward background").
    pub opacity: f32,
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeStagePreset
// ═══════════════════════════════════════════════════════════════════════

/// Predefined stage decoration presets.
///
/// A stage preset applies ephemeral visual decoration at the isolation
/// root's shape without mutating the document. The renderer resolves
/// the preset into concrete [`IsolationModeStageStyle`] properties at
/// draw time.
///
/// `#[repr(u32)]` for zero-overhead C-ABI crossing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
#[repr(u32)]
pub enum IsolationModeStagePreset {
    /// No stage decoration. The isolation root draws as-is.
    #[default]
    None = 0,

    /// Two-layer drop shadow matching Tailwind `shadow-xl`:
    ///   `0 20px 25px -5px rgb(0 0 0 / 0.1)`,
    ///   `0  8px 10px -6px rgb(0 0 0 / 0.1)`
    ///
    /// Shadow only — no fill, no stroke, no corner radius override.
    ShadowXL = 1,
}

impl IsolationModeStagePreset {
    /// Convert a raw `u32` from the C-ABI boundary. Unknown → `None`.
    pub fn from_u32(v: u32) -> Self {
        match v {
            0 => Self::None,
            1 => Self::ShadowXL,
            _ => Self::None,
        }
    }

    /// Resolve the preset into concrete draw properties.
    /// Returns `None` for [`None`](Self::None).
    pub fn resolve(self) -> Option<IsolationModeStageStyle> {
        match self {
            Self::None => Option::None,
            Self::ShadowXL => Some(IsolationModeStageStyle {
                fills: Option::None,
                strokes: Option::None,
                stroke_width: Option::None,
                corner_radius: Option::None,
                // Tailwind shadow-xl.
                // CSS blur-radius is 2× Skia stdDeviation.
                shadows: Some(vec![
                    FilterShadowEffect::DropShadow(FeShadow {
                        dx: 0.0,
                        dy: 20.0,
                        blur: 12.5, // CSS 25px / 2
                        spread: -5.0,
                        color: CGColor::from_u32(0x0000001A), // black 10%
                        active: true,
                    }),
                    FilterShadowEffect::DropShadow(FeShadow {
                        dx: 0.0,
                        dy: 8.0,
                        blur: 5.0, // CSS 10px / 2
                        spread: -6.0,
                        color: CGColor::from_u32(0x0000001A), // black 10%
                        active: true,
                    }),
                ]),
            }),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeStageStyle (internal, resolved)
// ═══════════════════════════════════════════════════════════════════════

/// Resolved stage decoration consumed by the renderer draw path.
///
/// External callers never construct this directly — they set a
/// [`IsolationModeStagePreset`] and the renderer calls
/// [`resolve()`](IsolationModeStagePreset::resolve).
#[derive(Debug, Clone, Default)]
pub struct IsolationModeStageStyle {
    /// Background fills drawn *behind* the subtree.
    pub fills: Option<Paints>,
    /// Strokes drawn *on top of* the subtree.
    pub strokes: Option<Paints>,
    /// Stroke width in px (default 1.0 when strokes are present).
    pub stroke_width: Option<f32>,
    /// Corner radius override `[tl, tr, br, bl]`.
    pub corner_radius: Option<[f32; 4]>,
    /// Drop shadows + inner shadows drawn with the stage shape.
    pub shadows: Option<Vec<FilterShadowEffect>>,
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationDrawContext (frame-scoped, resolved draw state)
// ═══════════════════════════════════════════════════════════════════════

/// Pre-resolved isolation draw state for a single frame.
///
/// Created once per frame by
/// [`Renderer::build_isolation_draw_context`](super::scene::Renderer).
/// Holds everything the draw path needs — resolved stage style, root
/// shape, transform — so the draw helpers never re-lookup or
/// re-resolve anything.
///
/// # Draw order (all inside the camera transform)
///
/// 1. [`draw_stage_background`](Self::draw_stage_background) — fills + drop shadows
/// 2. *(subtree content drawn by the Painter)*
/// 3. [`draw_stage_foreground`](Self::draw_stage_foreground) — strokes + inner shadows
/// 4. [`draw_viewport_overlay`](Self::draw_viewport_overlay) — overflow dim overlay
pub struct IsolationDrawContext {
    /// The isolation mode snapshot for this frame.
    pub(crate) iso: IsolationMode,
    /// Resolved stage style (from preset). `None` = no stage decoration.
    pub(crate) stage: Option<IsolationModeStageStyle>,
    /// Root node's shape in local space, with stage corner-radius
    /// override applied.
    pub(crate) stage_shape: crate::painter::geometry::PainterShape,
    /// Root node's world transform.
    pub(crate) transform: math2::transform::AffineTransform,
    /// World-space path of the root node's actual shape (for viewport
    /// overlay clip). Uses the node's real geometry, NOT the stage shape.
    pub(crate) root_clip_path: skia_safe::Path,
}

impl IsolationDrawContext {
    /// Draw stage background: drop shadows then fills.
    ///
    /// Call **before** the Painter draws the subtree.
    pub fn draw_stage_background(
        &self,
        canvas: &skia_safe::Canvas,
        images: &crate::runtime::image_repository::ImageRepository,
    ) {
        let style = match &self.stage {
            Some(s) => s,
            None => return,
        };

        canvas.save();
        canvas.concat(&crate::sk::sk_matrix(self.transform.matrix));

        // Drop shadows (behind fills).
        if let Some(ref shadows) = style.shadows {
            for shadow in shadows {
                if let FilterShadowEffect::DropShadow(ref s) = shadow {
                    if s.active {
                        crate::painter::shadow::draw_drop_shadow(canvas, &self.stage_shape, s);
                    }
                }
            }
        }

        // Fills.
        if let Some(ref fills) = style.fills {
            if !fills.is_empty() {
                if let Some(paint) = crate::painter::paint::sk_paint_stack(
                    fills.as_slice(),
                    (
                        self.stage_shape.rect.width(),
                        self.stage_shape.rect.height(),
                    ),
                    images,
                    true,
                ) {
                    self.stage_shape.draw_on_canvas(canvas, &paint);
                }
            }
        }

        canvas.restore();
    }

    /// Draw stage foreground: strokes then inner shadows.
    ///
    /// Call **after** the Painter draws the subtree, before the viewport
    /// overlay.
    pub fn draw_stage_foreground(
        &self,
        canvas: &skia_safe::Canvas,
        images: &crate::runtime::image_repository::ImageRepository,
    ) {
        let style = match &self.stage {
            Some(s) => s,
            None => return,
        };

        canvas.save();
        canvas.concat(&crate::sk::sk_matrix(self.transform.matrix));

        // Strokes.
        if let Some(ref strokes) = style.strokes {
            if !strokes.is_empty() {
                if let Some(mut paint) = crate::painter::paint::sk_paint_stack(
                    strokes.as_slice(),
                    (
                        self.stage_shape.rect.width(),
                        self.stage_shape.rect.height(),
                    ),
                    images,
                    true,
                ) {
                    paint.set_style(skia_safe::PaintStyle::Stroke);
                    paint.set_stroke_width(style.stroke_width.unwrap_or(1.0));
                    self.stage_shape.draw_on_canvas(canvas, &paint);
                }
            }
        }

        // Inner shadows.
        if let Some(ref shadows) = style.shadows {
            for shadow in shadows {
                if let FilterShadowEffect::InnerShadow(ref s) = shadow {
                    if s.active {
                        crate::painter::shadow::draw_inner_shadow(canvas, &self.stage_shape, s);
                    }
                }
            }
        }

        canvas.restore();
    }

    /// Draw the viewport dim overlay.
    ///
    /// Only draws when `outside` is `Viewport`. Punches a hole at the
    /// root's actual shape (not the stage shape) and fills the rest of
    /// the camera viewport with the background color at reduced opacity.
    ///
    /// Call **after** `draw_stage_foreground`.
    pub fn draw_viewport_overlay(
        &self,
        canvas: &skia_safe::Canvas,
        background_color: Option<CGColor>,
        camera_rect: &math2::rect::Rectangle,
    ) {
        let dim = match &self.iso.outside {
            IsolationModeOutside::Viewport(dim) => dim,
            _ => return,
        };

        canvas.save();
        canvas.clip_path(&self.root_clip_path, skia_safe::ClipOp::Difference, true);
        let mut paint = skia_safe::Paint::default();
        let (r, g, b) = background_color
            .map(|c| {
                let c: skia_safe::Color = c.into();
                (c.r(), c.g(), c.b())
            })
            .unwrap_or((255, 255, 255));
        let alpha = ((1.0 - dim.opacity.clamp(0.0, 1.0)) * 255.0) as u8;
        paint.set_color(skia_safe::Color::from_argb(alpha, r, g, b));
        canvas.draw_rect(
            skia_safe::Rect::new(
                camera_rect.x,
                camera_rect.y,
                camera_rect.x + camera_rect.width,
                camera_rect.y + camera_rect.height,
            ),
            &paint,
        );
        canvas.restore();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// IsolationModeFlags (C-ABI)
// ═══════════════════════════════════════════════════════════════════════

/// Bit flags for configuring isolation mode over the C-ABI boundary.
///
/// ```text
/// bit 0  OVERFLOW_DIM  enable Viewport mode (reads overflow_opacity)
/// 1–31   reserved      must be 0
/// ```
pub struct IsolationModeFlags;

impl IsolationModeFlags {
    /// Enable [`IsolationModeOutside::Viewport`].
    pub const OVERFLOW_DIM: u32 = 1 << 0;
}
