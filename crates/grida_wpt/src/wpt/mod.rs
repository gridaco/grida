//! WPT-specific integration. Reserved for anything exclusively a WPT
//! concern (as opposed to the generic golden producer in
//! [`crate::render`]): `MANIFEST.json` parsing, fuzzy-ref tolerance
//! handling, future daemon-mode IPC for wptrunner. Empty until a
//! caller needs something here — the Python plugin lives in the
//! `gridaco/wpt` fork.
