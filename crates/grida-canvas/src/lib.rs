pub mod cache;
pub mod cg;
pub mod devtools;
pub mod dummy;
pub mod export;
pub mod fonts;
pub mod helpers;
pub mod hittest;
pub mod html;
pub mod htmlcss;
pub mod io;
pub mod layout;
pub mod node;
pub mod os;
pub mod painter;
pub mod query;
pub mod resources;
pub mod runtime;
pub mod shape;
pub mod sk;
pub mod sk_tiny;
pub mod surface;
pub mod svg;
pub mod sys;
pub mod text;
pub mod text_edit;
pub mod text_edit_session;
pub mod vectornetwork;
pub mod window;

/// Shared test lock for Stylo's process-global DOM slot.
///
/// Both `html` and `htmlcss` modules use Stylo which is **not** thread-safe.
/// All tests that call into Stylo must hold this lock. We use
/// `unwrap_or_else(|e| e.into_inner())` to recover from poison so a single
/// test panic does not cascade to every other Stylo test.
#[cfg(test)]
pub(crate) mod stylo_test {
    use std::sync::{Mutex, MutexGuard};

    static STYLO_TEST_LOCK: Mutex<()> = Mutex::new(());

    pub fn lock() -> MutexGuard<'static, ()> {
        STYLO_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }
}
