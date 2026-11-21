//! Reviewed Desktop packages. Their host grants are checked at input acceptance.

pub(super) struct Extension {
    pub id: &'static str,
    pub description: &'static str,
    pub skills: &'static [(&'static str, &'static str)],
}

pub(super) const BUNDLED: &[Extension] = include!(concat!(env!("OUT_DIR"), "/extension_skills.rs"));
