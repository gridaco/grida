//! ENG-4.2 · oracle version tags. Every content oracle (text shaper,
//! pathops for bool bounds, image-decode metrics) is a versioned pure
//! function; its version is stamped into a replay header and checked on
//! load, so a tier measured under one oracle can never be silently
//! reinterpreted by another. Today only the text metric exists, and it is
//! the lab stub — named honestly rather than pretending to be a shaper
//! (the real shaper is DEC-4 / OS-4a).

/// The one oracle that exists today: the lab's stub text metric.
pub const TEXT_STUB: &str = "text=stub@lab-0";

/// The oracle version set stamped into a replay header. Grows a field per
/// oracle as they land (pathops, image); today it is text only.
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
