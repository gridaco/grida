//! Text editing session for the canvas.
//!
//! This module provides the canvas-specific text editing integration by
//! re-using the generic [`crate::text_edit::session::TextEditSession`] with
//! [`ParagraphCacheLayout`] as the layout backend.
//!
//! The generic session already handles all editing concerns:
//! - Text buffer, cursor, selection, attributed text
//! - Undo/redo history with merge grouping
//! - Rich text style toggles (bold, italic, underline, etc.)
//! - Clipboard (copy/cut/paste with HTML formatting)
//! - IME composition (preedit rendering)
//! - Cursor blink timer
//! - Pointer events (click, drag, multi-click)
//! - Geometry queries (caret rect, selection rects)
//! - Scroll management
//!
//! This module adds only canvas-specific concerns:
//! - Constructing the session from a canvas text node's properties
//! - Capturing original text for commit/cancel semantics
//! - The `ActiveTextEdit` bundle that lives on the Application

use crate::cg::types::{Paint, TextStyleRec};
use crate::node::schema::NodeId;
use crate::text::paragraph_cache_layout::ParagraphCacheLayout;
use crate::text_edit::attributed_text::conv::text_style_rec_to_attr_with_fills;

use crate::text_edit::{
    attributed_text::{AttributedText, ParagraphStyle},
    session::TextEditSession,
};

// Re-export for WASM layer
pub use crate::text_edit::EditingCommand as EditCommand;
pub use crate::text_edit::DEFAULT_CARET_WIDTH;

// Re-export the session type for convenience
pub type CanvasTextEditSession = TextEditSession<ParagraphCacheLayout>;

// ---------------------------------------------------------------------------
// TextEditCommit — centralized edit result
// ---------------------------------------------------------------------------

/// The result of committing a text edit session.
///
/// Captures all information needed to apply the edit back to the scene graph
/// in a single struct, avoiding fragmented commit logic across the codebase.
pub struct TextEditCommit {
    /// The node that was being edited.
    pub node_id: NodeId,
    /// The final plain text.
    pub text: String,
    /// Full attributed content (for writing back to AttributedText nodes).
    /// `None` for TextSpan nodes (which only need plain text).
    pub attributed: Option<AttributedText>,
    /// Whether the content was actually modified from its original state.
    pub modified: bool,
}

// ---------------------------------------------------------------------------
// ActiveTextEdit — session bundle with canvas-specific lifecycle
// ---------------------------------------------------------------------------

/// An active text editing session bound to a canvas text node.
///
/// Bundles the generic [`TextEditSession`] (which owns both the editing
/// state and the layout engine) with canvas-specific lifecycle data
/// (original text for commit/cancel, node ID).
///
/// The generic session handles all editing, styling, history, blink, IME,
/// pointer events, and geometry queries internally. The canvas layer only
/// needs to:
/// 1. Forward events (commands, pointer, IME) to the session
/// 2. Read decoration data (caret rect, selection rects) for overlay rendering
/// 3. Commit/cancel the session on exit
pub struct ActiveTextEdit {
    /// The generic text editing session with ParagraphCacheLayout.
    pub session: CanvasTextEditSession,

    /// The canvas node being edited (internal ID, not exposed outside the crate).
    pub(crate) node_id: NodeId,

    /// Original text at session start (for commit comparison).
    original_text: String,

    /// Whether this is an attributed text node (vs. a plain TextSpan).
    is_attributed: bool,
}

impl ActiveTextEdit {
    /// Create a new editing session from a TextSpan node's current state.
    ///
    /// # Arguments
    ///
    /// * `node_id` — The internal node ID being edited.
    /// * `text` — The node's current plain text.
    /// * `text_style_rec` — The node's uniform `TextStyleRec`.
    /// * `fills` — The resolved text fills (from the node's paint stack).
    /// * `paragraph_style` — Paragraph-level attributes.
    /// * `layout` — The pre-configured `ParagraphCacheLayout`.
    pub fn new(
        node_id: NodeId,
        text: &str,
        text_style_rec: &TextStyleRec,
        fills: Vec<Paint>,
        paragraph_style: ParagraphStyle,
        layout: ParagraphCacheLayout,
    ) -> Self {
        let attr_style = text_style_rec_to_attr_with_fills(text_style_rec, fills);
        let mut content = AttributedText::new(text, attr_style);
        *content.paragraph_style_mut() = paragraph_style;

        let mut session = TextEditSession::with_content(layout, content);

        // Select all text when entering edit mode so the user can
        // immediately start typing to replace the existing content.
        session.select_all();

        Self {
            session,
            node_id,
            original_text: text.to_owned(),
            is_attributed: false,
        }
    }

    /// Create a new editing session from an AttributedText node.
    ///
    /// Unlike [`new`](Self::new), this takes pre-built [`AttributedText`]
    /// content directly (already converted from `CgAttributedString`).
    pub fn new_attributed(
        node_id: NodeId,
        content: AttributedText,
        layout: ParagraphCacheLayout,
    ) -> Self {
        let original_text = content.text().to_owned();
        let mut session = TextEditSession::with_content(layout, content);
        session.select_all();

        Self {
            session,
            node_id,
            original_text,
            is_attributed: true,
        }
    }

    /// The canvas node being edited.
    pub fn node_id(&self) -> NodeId {
        self.node_id
    }

    /// Whether this session is editing an attributed text node.
    pub fn is_attributed(&self) -> bool {
        self.is_attributed
    }

    /// Whether the text has been modified from its original state.
    pub fn is_modified(&self) -> bool {
        self.session.state.text != self.original_text
    }

    /// Commit the session and return the final text (if modified).
    ///
    /// Returns `Some(text)` if the text was modified, `None` otherwise.
    pub fn commit(self) -> Option<String> {
        let final_text = self.session.state.text.clone();
        if final_text != self.original_text {
            Some(final_text)
        } else {
            None
        }
    }

    /// Commit the session and return a full [`TextEditCommit`] with all
    /// information needed to apply the edit back to the scene graph.
    pub fn commit_full(self) -> TextEditCommit {
        let modified = self.is_modified();
        let text = self.session.state.text.clone();
        let attributed = if self.is_attributed {
            Some(self.session.content.clone())
        } else {
            None
        };
        TextEditCommit {
            node_id: self.node_id,
            text,
            attributed,
            modified,
        }
    }

    /// Cancel the session, discarding all changes.
    pub fn cancel(self) -> String {
        self.original_text
    }
}
