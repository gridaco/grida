//! Text editing decoration overlay (caret + selection highlights).
//!
//! Drawn in the **devtools overlay pass** — after the scene is flushed and
//! composited. This means the caret and selection highlights are:
//!
//! - **Not clipped** by parent containers (visible even when the text
//!   overflows its bounds — matching standard OS text editor behavior).
//! - **Zoom-independent**: the caret width is fixed in screen pixels
//!   (see [`DEFAULT_CARET_WIDTH`]), regardless of the canvas zoom level.
//!
//! The overlay transforms layout-local decoration geometry to screen space
//! using the node's world transform and the camera view matrix, following
//! the same pattern as [`super::stroke_overlay::StrokeOverlay`].

use crate::cache::scene::SceneCache;
use crate::node::schema::NodeId;
use crate::painter::layer::Layer;
use crate::runtime::camera::Camera2D;
use crate::sk;
use crate::text_edit::{CaretRect, SelectionRect, DEFAULT_CARET_WIDTH};
use skia_safe::{Canvas, Color, Matrix, Paint, PaintStyle, Rect};

// ---------------------------------------------------------------------------
// Decoration data (computed per-frame by the editing session)
// ---------------------------------------------------------------------------

/// Caret visual state.
#[derive(Clone, Debug)]
pub struct CaretDecoration {
    /// Caret position and size in layout-local coordinates.
    /// `x` is the logical caret position — the caret is drawn **centered**
    /// on this x coordinate.
    pub rect: CaretRect,
    /// Whether the caret is currently visible (blink + selection state).
    pub visible: bool,
}

/// Visual decorations for the text node being edited.
///
/// All geometry is in **layout-local** coordinates. The overlay applies
/// the node world transform + camera view matrix at draw time.
#[derive(Clone, Debug)]
pub struct TextEditingDecorations {
    /// The node being edited.
    pub node_id: NodeId,
    /// Caret decoration (None before the first layout pass).
    pub caret: Option<CaretDecoration>,
    /// Selection highlight rectangles.
    pub selection_rects: Vec<SelectionRect>,
    /// Vertical offset from text vertical alignment (top/center/bottom).
    /// Applied as a Y translation before the node transform.
    pub y_offset: f32,
}

// ---------------------------------------------------------------------------
// Overlay renderer
// ---------------------------------------------------------------------------

/// Selection highlight color: semi-transparent blue (matches OS selection).
const SELECTION_COLOR: Color = Color::from_argb(80, 66, 133, 244);

/// Caret color: opaque black.
const CARET_COLOR: Color = Color::BLACK;

/// Caret width in screen pixels (zoom-independent).
const CARET_SCREEN_WIDTH: f32 = DEFAULT_CARET_WIDTH;

pub struct TextEditDecorationOverlay;

impl TextEditDecorationOverlay {
    /// Draw caret and selection decorations for the active text editing session.
    ///
    /// The canvas is in **screen space** (no camera transform applied).
    /// The overlay computes the full transform chain itself:
    ///
    /// ```text
    /// screen = view_matrix × node_transform × translate(0, y_offset)
    /// ```
    pub fn draw(
        canvas: &Canvas,
        deco: &TextEditingDecorations,
        camera: &Camera2D,
        cache: &SceneCache,
    ) {
        // Look up the node's world transform from the layer list.
        let entry = cache.layers.layers.iter().find(|e| e.id == deco.node_id);
        let Some(entry) = entry else {
            return;
        };

        let node_matrix = sk::sk_matrix(entry.layer.transform().matrix);
        let view_matrix = sk::sk_matrix(camera.view_matrix().matrix);

        // Combined transform: layout-local (with y_offset) → screen.
        let y_offset_matrix = Matrix::translate((0.0, deco.y_offset));
        let combined = view_matrix * node_matrix * y_offset_matrix;

        // --- Selection highlights (drawn first, behind the caret) ---
        if !deco.selection_rects.is_empty() {
            canvas.save();
            canvas.concat(&combined);

            let mut paint = Paint::default();
            paint.set_anti_alias(true);
            paint.set_color(SELECTION_COLOR);
            paint.set_style(PaintStyle::Fill);

            for sr in &deco.selection_rects {
                let rect = Rect::from_xywh(sr.x, sr.y, sr.width, sr.height);
                canvas.draw_rect(rect, &paint);
            }

            canvas.restore();
        }

        // --- Caret ---
        if let Some(ref caret) = deco.caret {
            if caret.visible {
                // Transform the caret center-line to screen space, then
                // draw a fixed-width rect in screen pixels.
                let caret_top = skia_safe::Point::new(caret.rect.x, caret.rect.y);
                let caret_bottom =
                    skia_safe::Point::new(caret.rect.x, caret.rect.y + caret.rect.height);

                let screen_top = combined.map_point(caret_top);
                let screen_bottom = combined.map_point(caret_bottom);

                // The caret is a vertical line centered on the logical x.
                let half_w = CARET_SCREEN_WIDTH / 2.0;
                let rect = Rect::from_xywh(
                    screen_top.x - half_w,
                    screen_top.y,
                    CARET_SCREEN_WIDTH,
                    screen_bottom.y - screen_top.y,
                );

                let mut paint = Paint::default();
                paint.set_anti_alias(false);
                paint.set_color(CARET_COLOR);
                paint.set_style(PaintStyle::Fill);

                canvas.draw_rect(rect, &paint);
            }
        }
    }
}
