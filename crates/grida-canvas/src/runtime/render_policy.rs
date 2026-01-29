//! Renderer policy configuration (what to render, not how).
//!
//! This module intentionally avoids feature-specific booleans like "outline mode".
//! Instead, higher-level features are represented as combinations of generic policies.
//!
//! The policy is also used to derive an in-memory render-variant key so caches can
//! keep multiple representations of the same scene (e.g. standard vs wireframe)
//! without invalidating each other.

use crate::cg::color::CGColor;
use std::hash::{Hash, Hasher};

/// How content should be rendered (fills/strokes vs forced outlines).
#[derive(Debug, Clone, Copy)]
pub enum ContentPolicy {
    /// Standard rendering: node-defined fills/strokes, optionally suppressed.
    Standard {
        render_fills: bool,
        render_strokes: bool,
    },
    /// Wireframe rendering: ignore node-defined paints and draw geometry-only outlines.
    Wireframe(OutlineStyle),
}

/// Whether layer effects (blur/shadow/noise/backdrop, etc.) are applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EffectsPolicy {
    Enabled,
    Disabled,
}

/// Whether compositing state (opacity, blend modes, clip/masks) is applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CompositingPolicy {
    Enabled,
    Disabled,
}

/// Style for forced outlines.
#[derive(Debug, Clone, Copy)]
pub struct OutlineStyle {
    pub color: CGColor,
    pub width: f32,
}

impl PartialEq for OutlineStyle {
    fn eq(&self, other: &Self) -> bool {
        self.color == other.color && self.width.to_bits() == other.width.to_bits()
    }
}

impl Eq for OutlineStyle {}

impl Hash for OutlineStyle {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.color.hash(state);
        self.width.to_bits().hash(state);
    }
}

/// Render policy for the renderer.
///
/// - `content`: controls fills/strokes vs forced outlines.
/// - `effects`: controls whether effects are applied.
/// - `compositing`: controls whether opacity/blend/masks/clips are applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RenderPolicy {
    pub content: ContentPolicy,
    pub effects: EffectsPolicy,
    pub compositing: CompositingPolicy,
    /// When true, clip paths / mask groups are ignored (content is not clipped).
    ///
    /// This is intended for debugging/inspection (e.g. outline mode).
    pub ignore_clips_content: bool,
}

impl RenderPolicy {
    /// Standard default behavior (existing renderer semantics).
    pub const STANDARD: Self = Self {
        content: ContentPolicy::Standard {
            render_fills: true,
            render_strokes: true,
        },
        effects: EffectsPolicy::Enabled,
        compositing: CompositingPolicy::Enabled,
        ignore_clips_content: false,
    };

    /// Convenience preset used by the editor feature \"Show outlines\".
    pub const WIREFRAME_DEFAULT: Self = Self {
        content: ContentPolicy::Wireframe(OutlineStyle {
            color: CGColor::from_rgb(68, 68, 68), // #444444
            width: 1.0,
        }),
        effects: EffectsPolicy::Disabled,
        compositing: CompositingPolicy::Disabled,
        // Wireframe is primarily used for inspection; by default, ignore clips.
        ignore_clips_content: true,
    };

    /// True only for the default renderer behavior (full fills/strokes + effects + compositing).
    #[inline]
    pub fn is_default(&self) -> bool {
        *self == Self::STANDARD
    }

    /// True when using the standard (non-wireframe) content policy, even if fills/strokes are suppressed.
    #[inline]
    pub fn is_standard_content(&self) -> bool {
        matches!(self.content, ContentPolicy::Standard { .. })
    }

    #[inline]
    pub fn is_wireframe(&self) -> bool {
        matches!(self.content, ContentPolicy::Wireframe(_))
    }

    #[inline]
    pub fn outline_style(&self) -> Option<OutlineStyle> {
        match self.content {
            ContentPolicy::Wireframe(s) => Some(s),
            ContentPolicy::Standard { .. } => None,
        }
    }

    #[inline]
    pub fn render_fills(&self) -> bool {
        match self.content {
            ContentPolicy::Standard { render_fills, .. } => render_fills,
            ContentPolicy::Wireframe(_) => false,
        }
    }

    #[inline]
    pub fn render_strokes(&self) -> bool {
        match self.content {
            ContentPolicy::Standard { render_strokes, .. } => render_strokes,
            ContentPolicy::Wireframe(_) => false,
        }
    }

    /// Tile caching is only correct/beneficial for the standard pipeline today.
    #[inline]
    pub fn allows_tile_cache(&self) -> bool {
        self.is_default()
    }

    /// Derive an in-memory cache namespace key for this render policy.
    ///
    /// - `0` is reserved for the standard policy for fast-path lookups.
    pub fn variant_key(&self) -> u64 {
        if self.is_default() {
            return 0;
        }
        let mut h = std::collections::hash_map::DefaultHasher::new();
        self.hash(&mut h);
        h.finish()
    }
}

impl Default for RenderPolicy {
    fn default() -> Self {
        Self::STANDARD
    }
}

impl PartialEq for ContentPolicy {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (
                ContentPolicy::Standard {
                    render_fills: a_f,
                    render_strokes: a_s,
                },
                ContentPolicy::Standard {
                    render_fills: b_f,
                    render_strokes: b_s,
                },
            ) => a_f == b_f && a_s == b_s,
            (ContentPolicy::Wireframe(a), ContentPolicy::Wireframe(b)) => a == b,
            _ => false,
        }
    }
}

impl Eq for ContentPolicy {}

impl Hash for ContentPolicy {
    fn hash<H: Hasher>(&self, state: &mut H) {
        match self {
            ContentPolicy::Standard {
                render_fills,
                render_strokes,
            } => {
                0u8.hash(state);
                render_fills.hash(state);
                render_strokes.hash(state);
            }
            ContentPolicy::Wireframe(style) => {
                1u8.hash(state);
                style.hash(state);
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Flags-based policy (WASM / host API boundary)
// -----------------------------------------------------------------------------

pub type RenderPolicyFlags = u32;

pub const FLAG_RENDER_FILLS: RenderPolicyFlags = 1 << 0;
pub const FLAG_RENDER_STROKES: RenderPolicyFlags = 1 << 1;
/// When set, render geometry-only outlines regardless of node paints.
pub const FLAG_RENDER_OUTLINES_ALWAYS: RenderPolicyFlags = 1 << 2;
pub const FLAG_EFFECTS_ENABLED: RenderPolicyFlags = 1 << 3;
pub const FLAG_COMPOSITING_ENABLED: RenderPolicyFlags = 1 << 4;
pub const FLAG_IGNORE_CLIPS_CONTENT: RenderPolicyFlags = 1 << 5;

impl RenderPolicy {
    /// Build a policy from flags.
    ///
    /// Notes:
    /// - `FLAG_RENDER_OUTLINES_ALWAYS` selects wireframe rendering.
    /// - Otherwise, flags map to standard rendering with optional fill/stroke suppression.
    pub fn from_flags(flags: RenderPolicyFlags) -> Self {
        let effects = if (flags & FLAG_EFFECTS_ENABLED) != 0 {
            EffectsPolicy::Enabled
        } else {
            EffectsPolicy::Disabled
        };

        let compositing = if (flags & FLAG_COMPOSITING_ENABLED) != 0 {
            CompositingPolicy::Enabled
        } else {
            CompositingPolicy::Disabled
        };

        let ignore_clips_content = (flags & FLAG_IGNORE_CLIPS_CONTENT) != 0;

        if (flags & FLAG_RENDER_OUTLINES_ALWAYS) != 0 {
            // Outline style is currently encoded in the preset; can be expanded later.
            let mut p = Self::WIREFRAME_DEFAULT;
            p.effects = effects;
            p.compositing = compositing;
            p.ignore_clips_content = ignore_clips_content;
            return p;
        }

        Self {
            content: ContentPolicy::Standard {
                render_fills: (flags & FLAG_RENDER_FILLS) != 0,
                render_strokes: (flags & FLAG_RENDER_STROKES) != 0,
            },
            effects,
            compositing,
            ignore_clips_content,
        }
    }

    /// Convert policy to flags (best-effort for current variants).
    pub fn to_flags(&self) -> RenderPolicyFlags {
        let mut flags = 0;
        if self.effects == EffectsPolicy::Enabled {
            flags |= FLAG_EFFECTS_ENABLED;
        }
        if self.compositing == CompositingPolicy::Enabled {
            flags |= FLAG_COMPOSITING_ENABLED;
        }
        if self.ignore_clips_content {
            flags |= FLAG_IGNORE_CLIPS_CONTENT;
        }

        match self.content {
            ContentPolicy::Standard {
                render_fills,
                render_strokes,
            } => {
                if render_fills {
                    flags |= FLAG_RENDER_FILLS;
                }
                if render_strokes {
                    flags |= FLAG_RENDER_STROKES;
                }
            }
            ContentPolicy::Wireframe(_) => {
                flags |= FLAG_RENDER_OUTLINES_ALWAYS;
            }
        }

        flags
    }
}
