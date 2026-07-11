//! ENG-4.2 · oracle version tags. Every content oracle (text shaper,
//! pathops for bool bounds, image-decode metrics) is a versioned pure
//! function; its version is stamped into a replay header and checked before
//! execution, so a tier measured under one oracle can never be silently
//! reinterpreted by another. The deterministic lab/replay path uses an
//! explicitly glyphless stub; host-font frames use a separately identified
//! Skia Paragraph bridge. The production oracle choice remains DEC-4/OS-4a.

/// Deterministic, glyphless lab text metric used by legacy replays.
pub const TEXT_STUB: &str = "text=stub@lab-0";

/// First real text-layout oracle hosted by the model-v2 engine.
///
/// This identifies the shaping/layout result, not a persisted document value.
/// A promoted deterministic oracle will receive a new version rather than
/// silently reinterpreting existing resolved artifacts.
pub const TEXT_SKPARAGRAPH: &str = "skparagraph@skia-0.93.1";

/// The oracle version set stamped into the current lab replay header. Grows a
/// field per oracle as they land (pathops, image); today it is text only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OracleTags {
    pub text: String,
}

impl Default for OracleTags {
    fn default() -> Self {
        Self {
            text: TEXT_STUB.to_string(),
        }
    }
}
