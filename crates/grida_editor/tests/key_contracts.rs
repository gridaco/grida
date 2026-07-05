//! Keybindings conformance (`KEY-*`) — `crates/grida_editor/docs/keybindings.md`
//! — plus the chain-dispatch half of routing (`ROUTE-1`, `ROUTE-3`) —
//! `crates/grida_editor/docs/routing.md`.
//!
//! Headless throughout: the binding table is data, so the whole sheet
//! is exercised by enumeration and resolution — no window, no shell.
//! The capture-layer behaviors above the table (text session, widget
//! focus, edit-mode re-resolution — `ROUTE-4`) live in the shell and
//! the mode suites.

use grida_editor::keys::{
    self, Binding, Command, KeyCode, Mask, Mods, OpacityTaps, Platform, Req, TableError,
};
use grida_editor::tool::{ShapeKind, Tool};

fn mods(shift: bool, alt: bool, ctrl: bool, meta: bool) -> Mods {
    Mods {
        shift,
        alt,
        ctrl,
        meta,
    }
}

const NONE: Mods = Mods {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
};

/// The platform's primary modifier held, nothing else (`Mod+…`).
fn primary(platform: Platform) -> Mods {
    match platform {
        Platform::Mac => mods(false, false, false, true),
        Platform::Other => mods(false, false, true, false),
    }
}

fn chain_names(binding: &Binding) -> Vec<&'static str> {
    binding.chain.iter().map(|c| c.name()).collect()
}

/// KEY-1 — table–registry equality: the shipped table enumerates
/// cleanly on every platform (no unbound row, no contradictory or
/// overlapping mask — `ROUTE-1`'s total binding order established by
/// enumeration, never a runtime priority race), and every row
/// dispatches registry commands by name.
#[test]
fn key_1_table_enumerates_against_the_registry() {
    for platform in [Platform::Mac, Platform::Other] {
        assert_eq!(keys::validate(platform), Ok(()), "platform {platform:?}");
    }
    for binding in keys::SHEET {
        assert!(!binding.chain.is_empty());
        for cmd in binding.chain {
            assert!(!cmd.name().is_empty());
        }
    }
}

/// KEY-1 (coverage half): the normative sheet's shipped rows resolve
/// to their commands — a spot enumeration across every section.
#[test]
fn key_1_sheet_rows_resolve() {
    let p = Platform::Mac;
    let cmd = primary(p);
    let cmd_shift = mods(true, false, false, true);
    let cases: Vec<(KeyCode, Mods, &str)> = vec![
        // History & clipboard.
        (KeyCode::Char('z'), cmd, "undo"),
        (KeyCode::Char('z'), cmd_shift, "redo"),
        (KeyCode::Char('x'), cmd, "cut"),
        (KeyCode::Char('c'), cmd, "copy"),
        (KeyCode::Char('c'), cmd_shift, "copy-as-png"),
        (KeyCode::Char('v'), cmd, "paste"),
        (KeyCode::Char('d'), cmd, "duplicate"),
        (KeyCode::Char('s'), cmd, "save"),
        (KeyCode::Backspace, NONE, "delete-sub-selection"),
        (KeyCode::Delete, NONE, "delete-sub-selection"),
        // Selection & traversal.
        (KeyCode::Char('a'), cmd, "select-all"),
        (KeyCode::Escape, NONE, "escape-ladder"),
        (KeyCode::Enter, NONE, "enter-content-edit"),
        (
            KeyCode::Enter,
            mods(true, false, false, false),
            "select-parent",
        ),
        (KeyCode::Char('\\'), NONE, "select-parent"),
        (KeyCode::Tab, NONE, "next-sibling"),
        (
            KeyCode::Tab,
            mods(true, false, false, false),
            "prev-sibling",
        ),
        // Nudge.
        (KeyCode::ArrowLeft, NONE, "nudge-selection"),
        (
            KeyCode::ArrowLeft,
            mods(true, false, false, false),
            "nudge-selection",
        ),
        (
            KeyCode::ArrowRight,
            mods(false, true, true, false),
            "resize-nudge",
        ),
        (
            KeyCode::ArrowRight,
            mods(true, true, true, false),
            "resize-nudge",
        ),
        // Tools.
        (KeyCode::Char('v'), NONE, "set-tool"),
        (KeyCode::Char('a'), NONE, "set-tool"),
        (KeyCode::Char('f'), NONE, "set-tool"),
        (
            KeyCode::Char('f'),
            mods(true, false, false, false),
            "set-tool",
        ),
        (KeyCode::Char('r'), NONE, "set-tool"),
        (KeyCode::Char('o'), NONE, "set-tool"),
        (KeyCode::Char('y'), NONE, "set-tool"),
        (KeyCode::Char('t'), NONE, "set-tool"),
        (KeyCode::Char('l'), NONE, "set-tool"),
        (
            KeyCode::Char('l'),
            mods(true, false, false, false),
            "set-tool",
        ),
        (KeyCode::Char('p'), NONE, "pen-tool"),
        (
            KeyCode::Char('p'),
            mods(true, false, false, false),
            "set-tool",
        ),
        (KeyCode::Char('k'), NONE, "scale-tool"),
        (KeyCode::Char('q'), NONE, "lasso"),
        (KeyCode::Char('h'), NONE, "hand-tool"),
        (KeyCode::Space, NONE, "hand-hold"),
        (KeyCode::Char('z'), NONE, "zoom-hold"),
        // Arrange.
        (KeyCode::Char(']'), NONE, "bring-to-front"),
        (KeyCode::Char('['), NONE, "send-to-back"),
        (KeyCode::Char(']'), cmd, "bring-forward"),
        (KeyCode::Char('['), cmd, "send-backward"),
        (KeyCode::Char('e'), cmd, "flatten"),
        // Object & style.
        (KeyCode::Char('h'), cmd_shift, "toggle-visible"),
        (KeyCode::Char('5'), NONE, "opacity"),
        (KeyCode::Char('0'), NONE, "opacity"),
        // View.
        (KeyCode::Char('='), cmd, "zoom-in"),
        (KeyCode::Char('-'), cmd, "zoom-out"),
        (
            KeyCode::Char('0'),
            mods(true, false, false, false),
            "zoom-100",
        ),
        (
            KeyCode::Char('1'),
            mods(true, false, false, false),
            "zoom-fit",
        ),
        (
            KeyCode::Char('2'),
            mods(true, false, false, false),
            "zoom-selection",
        ),
        (
            KeyCode::Char('r'),
            mods(true, false, false, false),
            "toggle-ruler",
        ),
        (
            KeyCode::Char('\''),
            mods(true, false, false, false),
            "toggle-pixel-grid",
        ),
        (KeyCode::Char('\''), cmd, "toggle-snap-pixel-grid"),
        (KeyCode::Char(';'), cmd, "toggle-snap-geometry"),
        (KeyCode::PageUp, NONE, "prev-scene"),
        (KeyCode::PageDown, NONE, "next-scene"),
        // Reserved.
        (
            KeyCode::Char('h'),
            mods(true, false, false, false),
            "flip-horizontal",
        ),
        (
            KeyCode::Char('v'),
            mods(true, false, false, false),
            "flip-vertical",
        ),
    ];
    for (key, m, expected) in cases {
        let binding =
            keys::resolve(key, m, p).unwrap_or_else(|| panic!("no row for {key:?} with {m:?}"));
        assert_eq!(
            chain_names(binding)[0],
            expected,
            "chord {key:?} with {m:?}"
        );
    }
    // Tool payloads carry the sheet's assignments.
    assert_eq!(
        keys::resolve(KeyCode::Char('r'), NONE, p).unwrap().chain[0],
        Command::SetTool(Tool::Shape(ShapeKind::Rectangle))
    );
    assert_eq!(
        keys::resolve(KeyCode::Char('f'), mods(true, false, false, false), p)
            .unwrap()
            .chain[0],
        Command::SetTool(Tool::Container { tray: true })
    );
    assert_eq!(
        keys::resolve(KeyCode::Char('l'), mods(true, false, false, false), p)
            .unwrap()
            .chain[0],
        Command::SetTool(Tool::Line { arrow: true })
    );
}

/// KEY-2 — mask honesty: plain-arrow nudge fires with Alt held
/// (unmeaningful = don't-care) and does not fire with Mod or Ctrl
/// held (meaningful-absent); `Ctrl+Alt+Arrow` resize-nudges
/// regardless of Meta; and an overlapping pair is a table error found
/// by enumeration.
#[test]
fn key_2_mask_honesty() {
    let p = Platform::Mac;
    // Alt is don't-care on the nudge row (the measurement modifier
    // stays held while nudging).
    let with_alt = keys::resolve(KeyCode::ArrowLeft, mods(false, true, false, false), p).unwrap();
    assert_eq!(
        with_alt.chain[0],
        Command::NudgeSelection { dx: -1.0, dy: 0.0 }
    );
    // Meaningful-absent Mod and Ctrl refuse the chord.
    assert!(keys::resolve(KeyCode::ArrowLeft, mods(false, false, false, true), p).is_none());
    assert!(keys::resolve(KeyCode::ArrowLeft, mods(false, false, true, false), p).is_none());
    // Resize nudge: Ctrl+Alt meaningful-held, Meta don't-care.
    for meta in [false, true] {
        let b = keys::resolve(KeyCode::ArrowRight, mods(false, true, true, meta), p).unwrap();
        assert_eq!(b.chain[0], Command::ResizeNudge { dw: 1.0, dh: 0.0 });
    }
    // Two rows claiming one chord+mask: caught by enumeration, never
    // resolved at runtime by luck.
    let overlapping: &[Binding] = &[
        Binding {
            key: KeyCode::Char('b'),
            mask: Mask {
                primary: Req::Absent,
                shift: Req::Any,
                alt: Req::Any,
                ctrl: Req::Any,
            },
            chain: &[Command::Reserved("first")],
            focus_legal: false,
            hold: false,
        },
        Binding {
            key: KeyCode::Char('b'),
            mask: Mask {
                primary: Req::Absent,
                shift: Req::Held,
                alt: Req::Any,
                ctrl: Req::Any,
            },
            chain: &[Command::Reserved("second")],
            focus_legal: false,
            hold: false,
        },
    ];
    assert_eq!(
        keys::validate_table(overlapping, p),
        Err(TableError::Overlap {
            first: 0,
            second: 1
        })
    );
}

/// KEY-3 — virtual modifier: one authored table serves both
/// platforms; a `Mod` row resolves through ⌘ on mac and Ctrl
/// elsewhere without re-authoring.
#[test]
fn key_3_virtual_modifier_resolves_per_platform() {
    let undo_mac = keys::resolve(
        KeyCode::Char('z'),
        mods(false, false, false, true),
        Platform::Mac,
    )
    .unwrap();
    assert_eq!(undo_mac.chain[0], Command::Undo);
    let undo_other = keys::resolve(
        KeyCode::Char('z'),
        mods(false, false, true, false),
        Platform::Other,
    )
    .unwrap();
    assert_eq!(undo_other.chain[0], Command::Undo);
    // The physical key that is NOT the platform's primary does not
    // stand in for Mod: on mac, Ctrl+Z is the plain-z chord (the zoom
    // hold row), not undo.
    let not_undo = keys::resolve(
        KeyCode::Char('z'),
        mods(false, false, true, false),
        Platform::Mac,
    )
    .unwrap();
    assert_ne!(not_undo.chain[0], Command::Undo);
    // On non-mac, physical Meta is don't-care.
    let undo_meta_too = keys::resolve(
        KeyCode::Char('z'),
        mods(false, false, true, true),
        Platform::Other,
    )
    .unwrap();
    assert_eq!(undo_meta_too.chain[0], Command::Undo);
}

/// KEY-4 — focus guard marks: the rows that stay live under widget
/// focus are exactly the explicitly-marked primary-modifier command
/// chords; tool, digit, and traversal rows are suppressed (the
/// suppression itself is the shell's routing order, upstream of the
/// table — UI-3).
#[test]
fn key_4_focus_legal_rows_are_the_marked_exceptions() {
    let p = Platform::Mac;
    let cmd = primary(p);
    let cmd_shift = mods(true, false, false, true);
    for (key, m) in [
        (KeyCode::Char('z'), cmd),
        (KeyCode::Char('c'), cmd),
        (KeyCode::Char('c'), cmd_shift),
        (KeyCode::Char('v'), cmd),
        (KeyCode::Char('d'), cmd),
        (KeyCode::Char('s'), cmd),
        (KeyCode::Char('='), cmd),
        (KeyCode::Char('-'), cmd),
    ] {
        assert!(
            keys::resolve(key, m, p).unwrap().focus_legal,
            "{key:?} should be focus-legal"
        );
    }
    for (key, m) in [
        (KeyCode::Char('v'), NONE),
        (KeyCode::Char('r'), NONE),
        (KeyCode::Char('5'), NONE),
        (KeyCode::ArrowLeft, NONE),
        (KeyCode::Tab, NONE),
        (KeyCode::Enter, NONE),
        (KeyCode::Escape, NONE),
        (KeyCode::Char('a'), cmd), // select-all yields to a focused input
    ] {
        assert!(
            !keys::resolve(key, m, p).unwrap().focus_legal,
            "{key:?} must be suppressed under focus"
        );
    }
}

/// KEY-5 — the momentary rows: Space and Z are `(hold)` bindings
/// wired to the virtual hand/zoom overlays. (The restore-exactly
/// behavior is structural in the shell: the overlay never touches the
/// tool machine, so releasing it cannot land anywhere but the prior
/// tool.)
#[test]
fn key_5_hold_rows() {
    let p = Platform::Mac;
    let space = keys::resolve(KeyCode::Space, NONE, p).unwrap();
    assert!(space.hold);
    assert_eq!(space.chain[0], Command::HandHold);
    let z = keys::resolve(KeyCode::Char('z'), NONE, p).unwrap();
    assert!(z.hold);
    assert_eq!(z.chain[0], Command::ZoomHold);
    // The pen key's held keep-projecting is live gesture
    // configuration, not a hold row — nothing to restore.
    let pen = keys::resolve(KeyCode::Char('p'), NONE, p).unwrap();
    assert!(!pen.hold);
    // The sticky hand is a plain row.
    assert!(!keys::resolve(KeyCode::Char('h'), NONE, p).unwrap().hold);
}

/// KEY-6 — opacity digits: single digits set tenths; 0 sets 100%; a
/// double-tapped 0 inside the multi-tap window sets 0%; the window
/// re-arms after firing.
#[test]
fn key_6_opacity_digits_and_double_zero() {
    let mut taps = OpacityTaps::default();
    assert_eq!(taps.resolve(5, 0), 0.5);
    assert_eq!(taps.resolve(9, 10), 0.9);
    // First 0 → 100%.
    assert_eq!(taps.resolve(0, 20), 1.0);
    // Second 0 inside the window → 0%.
    assert_eq!(taps.resolve(0, 20 + keys::OPACITY_TAP_WINDOW_MS), 0.0);
    // The double-tap consumed the arm: a third 0 starts over.
    assert_eq!(taps.resolve(0, 700), 1.0);
    // Outside the window, 0 is 100% again.
    assert_eq!(
        taps.resolve(0, 701 + keys::OPACITY_TAP_WINDOW_MS + 700),
        1.0
    );
    // A non-zero digit disarms the pending double-tap.
    assert_eq!(taps.resolve(0, 10_000), 1.0);
    assert_eq!(taps.resolve(3, 10_050), 0.3);
    assert_eq!(taps.resolve(0, 10_100), 1.0);
    // The digit rows only fire bare (KEY-2 masks): Shift digits are
    // the zoom rows, unbound digits fall through.
    let p = Platform::Mac;
    assert_eq!(
        keys::resolve(KeyCode::Char('0'), mods(true, false, false, false), p)
            .unwrap()
            .chain[0],
        Command::Zoom100
    );
    assert!(keys::resolve(KeyCode::Char('3'), mods(true, false, false, false), p).is_none());
}

/// ROUTE-3 — claims purity: an advertised chord answers `claims`
/// without running any handler (resolution is a pure table lookup),
/// and it stays advertised even when its handlers would all decline
/// (Delete with nothing selected is still owned).
#[test]
fn route_3_claims_is_pure_table_lookup() {
    let p = Platform::Mac;
    assert!(keys::claims(KeyCode::Delete, NONE, p));
    assert!(keys::claims(KeyCode::Char('z'), primary(p), p));
    assert!(!keys::claims(KeyCode::Char('b'), NONE, p));
    // Plain 'x' has no row (cut is Mod+X): not advertised.
    assert!(!keys::claims(KeyCode::Char('x'), NONE, p));
}
