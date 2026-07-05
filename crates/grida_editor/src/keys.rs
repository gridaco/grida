//! Keybindings — the normative sheet as data
//! (`crates/grida_editor/docs/keybindings.md`, `KEY-*` contracts) over the
//! command registry ([`crate::command`]), resolved by chain dispatch
//! (`crates/grida_editor/docs/routing.md`).
//!
//! The module is pure and headless: a static binding table, a resolver,
//! and an enumeration-time validator. The shell maps platform key
//! events onto [`KeyCode`]/[`Mods`], asks [`resolve`] for the chord's
//! [`Binding`], and walks its command chain — the first handler that
//! *consumes* wins, the rest are skipped (routing.md chain dispatch).
//! No key reaches meaning outside this table except through the
//! capture layers above it (text session, active edit mode — routing
//! capture order), which is what keeps `SHELL-1`/`KEY-1` honest: the
//! table has no inline behavior, and the shell has no key behavior
//! outside the table.
//!
//! **Masks.** Every row declares its *meaningful modifiers*
//! ([`Mask`], `KEY-2`): meaningful-and-listed must be held,
//! meaningful-and-unlisted must be absent, unmeaningful modifiers are
//! don't-care. Two rows on one key with overlapping masks are a table
//! error detected by [`validate`] — enumeration, never a runtime
//! priority race (`ROUTE-1`).
//!
//! **The virtual primary modifier.** Rows are authored against `Mod`,
//! never a physical key; [`Mask::phys`] resolves it to the platform's
//! primary modifier (`KEY-3`) — ⌘ on mac, Ctrl elsewhere — merging
//! the constraint into the physical mask and failing validation on a
//! contradictory row.
//!
//! Sheet rows whose commands are not yet implemented (group, boolean,
//! text style, outline mode, color picker, locked, remove fill/stroke)
//! are **not shipped** — an unshippable row would be a
//! permanently-declining lie. The remaining rows are tracked in
//! `TODO.md`; the reserved rows the spec mandates (flip-h/v, scale
//! tool, lasso) ship as named no-ops. Align & distribute (Alt+A/D/W/S,
//! Alt+H/V, Alt+Ctrl+H/V) ship live (`Command::Align`/`Distribute`).

use crate::tool::{ShapeKind, Tool};

/// Host platform, for `KEY-3` virtual-modifier resolution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    /// `Mod` = ⌘ (the meta/super key).
    Mac,
    /// `Mod` = Ctrl.
    Other,
}

impl Platform {
    /// The platform this build runs on.
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Platform::Mac
        } else {
            Platform::Other
        }
    }
}

/// Physical modifier state at the keystroke.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Mods {
    pub shift: bool,
    pub alt: bool,
    pub ctrl: bool,
    pub meta: bool,
}

/// Logical key of a chord. Characters are canonical: lowercase, and
/// shifted symbols folded to their base key (see [`canonical_char`]) —
/// the sheet binds *keys*, the Shift constraint lives in the mask.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyCode {
    Char(char),
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    Escape,
    Enter,
    Tab,
    Space,
    Backspace,
    Delete,
    PageUp,
    PageDown,
}

/// Fold a produced character back to its canonical key: lowercase
/// letters, US-layout shifted symbols to their base. The virtual `Mod`
/// is layout-portable (`KEY-3`); character canonicalization is
/// US-layout by assumption — a reference-shell simplification.
pub fn canonical_char(c: char) -> char {
    match c {
        '!' => '1',
        '@' => '2',
        '#' => '3',
        '$' => '4',
        '%' => '5',
        '^' => '6',
        '&' => '7',
        '*' => '8',
        '(' => '9',
        ')' => '0',
        '"' => '\'',
        ':' => ';',
        '{' => '[',
        '}' => ']',
        '|' => '\\',
        '+' => '=',
        '_' => '-',
        '?' => '/',
        '<' => ',',
        '>' => '.',
        '~' => '`',
        _ => c.to_ascii_lowercase(),
    }
}

/// One modifier's requirement in a mask: meaningful-held,
/// meaningful-absent, or unmeaningful (don't-care).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Req {
    Held,
    Absent,
    Any,
}

impl Req {
    fn admits(self, held: bool) -> bool {
        match self {
            Req::Held => held,
            Req::Absent => !held,
            Req::Any => true,
        }
    }

    /// Whether two requirements can be satisfied by one modifier state
    /// (the overlap half of the `KEY-2` table-error check).
    fn overlaps(self, other: Req) -> bool {
        !matches!(
            (self, other),
            (Req::Held, Req::Absent) | (Req::Absent, Req::Held)
        )
    }

    /// Merge the virtual-primary constraint into a physical one; `None`
    /// = contradiction (a table error surfaced by [`validate`]).
    fn merge(self, other: Req) -> Option<Req> {
        match (self, other) {
            (Req::Any, r) | (r, Req::Any) => Some(r),
            (a, b) if a == b => Some(a),
            _ => None,
        }
    }
}

/// The authored meaningful-modifier mask (`KEY-2`). `primary` is the
/// virtual `Mod` (`KEY-3`); `ctrl` is the *physical* Ctrl key — on
/// non-mac the two land on the same key and [`Mask::phys`] merges
/// them (or rejects the row as contradictory).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Mask {
    pub primary: Req,
    pub shift: Req,
    pub alt: Req,
    pub ctrl: Req,
}

/// The platform-resolved physical mask.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhysMask {
    pub shift: Req,
    pub alt: Req,
    pub ctrl: Req,
    pub meta: Req,
}

impl Mask {
    /// Resolve the virtual primary onto the platform's physical
    /// modifier (`KEY-3`). `None` = the row is contradictory on this
    /// platform (e.g. primary-held + ctrl-absent on non-mac).
    pub fn phys(&self, platform: Platform) -> Option<PhysMask> {
        match platform {
            Platform::Mac => Some(PhysMask {
                shift: self.shift,
                alt: self.alt,
                ctrl: self.ctrl,
                meta: self.primary,
            }),
            Platform::Other => Some(PhysMask {
                shift: self.shift,
                alt: self.alt,
                ctrl: self.ctrl.merge(self.primary)?,
                meta: Req::Any,
            }),
        }
    }
}

impl PhysMask {
    pub fn matches(&self, mods: Mods) -> bool {
        self.shift.admits(mods.shift)
            && self.alt.admits(mods.alt)
            && self.ctrl.admits(mods.ctrl)
            && self.meta.admits(mods.meta)
    }

    fn overlaps(&self, other: &PhysMask) -> bool {
        self.shift.overlaps(other.shift)
            && self.alt.overlaps(other.alt)
            && self.ctrl.overlaps(other.ctrl)
            && self.meta.overlaps(other.meta)
    }
}

/// The table's vocabulary is the command registry
/// ([`crate::command`]); re-exported so the sheet's consumers read
/// naturally against the surface they bind through.
pub use crate::command::Command;

/// One sheet row: a chord (key + meaningful-modifier mask) bound to
/// an ordered command chain (routing.md — the first consumer wins).
#[derive(Debug, Clone, Copy)]
pub struct Binding {
    pub key: KeyCode,
    pub mask: Mask,
    pub chain: &'static [Command],
    /// `KEY-4`: this row stays live while a widget holds keyboard
    /// focus (the sheet's explicitly-marked exceptions — the primary-
    /// modifier command chords, which dispatch *before* the focused
    /// widget per `UI-3`'s command priority).
    pub focus_legal: bool,
    /// `(hold)` row (`KEY-5`): press activates, release restores the
    /// prior state exactly. (The pen key's held keep-projecting is
    /// live gesture configuration, not a hold row — it never switches
    /// state away, so there is nothing to restore.)
    pub hold: bool,
}

const fn mask(primary: Req, shift: Req, alt: Req, ctrl: Req) -> Mask {
    Mask {
        primary,
        shift,
        alt,
        ctrl,
    }
}

/// Plain chord: no primary, Shift constrained by the row, Alt/Ctrl
/// don't-care.
const fn plain(shift: Req) -> Mask {
    mask(Req::Absent, shift, Req::Any, Req::Any)
}

/// Primary-modifier chord (`Mod+…`).
const fn cmd(shift: Req) -> Mask {
    mask(Req::Held, shift, Req::Any, Req::Any)
}

const ANY: Mask = mask(Req::Any, Req::Any, Req::Any, Req::Any);

const fn row(key: KeyCode, mask: Mask, chain: &'static [Command]) -> Binding {
    Binding {
        key,
        mask,
        chain,
        focus_legal: false,
        hold: false,
    }
}

const fn cmd_row(key: KeyCode, mask: Mask, chain: &'static [Command]) -> Binding {
    Binding {
        key,
        mask,
        chain,
        focus_legal: true,
        hold: false,
    }
}

const fn hold_row(key: KeyCode, mask: Mask, chain: &'static [Command]) -> Binding {
    Binding {
        key,
        mask,
        chain,
        focus_legal: false,
        hold: true,
    }
}

/// Translate-nudge mask (`KEY-2`'s worked example): Mod and Ctrl
/// meaningful-absent, Shift constrained by the row, Alt don't-care —
/// plain-arrow nudge keeps firing while the measurement modifier is
/// held.
const fn nudge_mask(shift: Req) -> Mask {
    mask(Req::Absent, shift, Req::Any, Req::Absent)
}

/// Resize-nudge mask: Ctrl+Alt meaningful-held, Shift constrained,
/// Meta don't-care.
const fn resize_mask(shift: Req) -> Mask {
    mask(Req::Any, shift, Req::Held, Req::Held)
}

/// Opacity-digit mask: bare digits only (Alt digits are symbol input,
/// Shift digits are the zoom rows).
const OPACITY: Mask = mask(Req::Absent, Req::Absent, Req::Absent, Req::Any);

/// Align mask (keybindings.md "Align & distribute"): Alt held alone —
/// no primary, no Shift, no Ctrl. Disjoint from the Alt+Ctrl distribute
/// rows on Ctrl, and from the plain tool rows on Alt.
const ALIGN: Mask = mask(Req::Absent, Req::Absent, Req::Held, Req::Absent);

/// Distribute mask: Alt+Ctrl held. Primary is don't-care (like
/// [`resize_mask`]) so platforms whose virtual primary *is* Ctrl stay
/// satisfiable; disjoint from the align rows on Ctrl.
const DISTRIBUTE: Mask = mask(Req::Any, Req::Absent, Req::Held, Req::Held);

/// The empty-selection camera-pan step, screen px (`NUDGE-5`).
pub const PAN_STEP_PX: f32 = 50.0;

/// The shipped table — the normative sheet (keybindings.md), minus
/// the rows whose commands do not exist yet (see module docs), plus
/// the reality rows the spec amendment names (save, snap toggles).
pub const SHEET: &[Binding] = &[
    // -- History & clipboard ------------------------------------------------
    cmd_row(KeyCode::Char('z'), cmd(Req::Absent), &[Command::Undo]),
    cmd_row(KeyCode::Char('z'), cmd(Req::Held), &[Command::Redo]),
    cmd_row(KeyCode::Char('x'), cmd(Req::Absent), &[Command::Cut]),
    cmd_row(KeyCode::Char('c'), cmd(Req::Absent), &[Command::Copy]),
    cmd_row(KeyCode::Char('c'), cmd(Req::Held), &[Command::CopyAsPng]),
    // Alt meaningfully-absent (`KEY-2`): the `v` key now carries the
    // Alt+Ctrl distribute row, so Mod+V must exclude Alt to stay
    // disjoint from it (Ctrl stays don't-care — on non-mac it *is* the
    // primary).
    cmd_row(
        KeyCode::Char('v'),
        mask(Req::Held, Req::Absent, Req::Absent, Req::Any),
        &[Command::Paste],
    ),
    cmd_row(KeyCode::Char('d'), cmd(Req::Absent), &[Command::Duplicate]),
    cmd_row(KeyCode::Char('s'), cmd(Req::Absent), &[Command::Save]),
    row(
        KeyCode::Backspace,
        ANY,
        &[Command::DeleteSubSelection, Command::DeleteSelection],
    ),
    row(
        KeyCode::Delete,
        ANY,
        &[Command::DeleteSubSelection, Command::DeleteSelection],
    ),
    // -- Selection & traversal ----------------------------------------------
    row(
        KeyCode::Char('a'),
        mask(Req::Held, Req::Absent, Req::Absent, Req::Any),
        &[Command::SelectAll],
    ),
    row(KeyCode::Escape, ANY, &[Command::EscapeLadder]),
    row(
        KeyCode::Enter,
        mask(Req::Any, Req::Absent, Req::Any, Req::Any),
        &[Command::EnterContentEdit, Command::SelectChildren],
    ),
    row(
        KeyCode::Enter,
        mask(Req::Any, Req::Held, Req::Any, Req::Any),
        &[Command::SelectParent],
    ),
    row(
        KeyCode::Char('\\'),
        plain(Req::Any),
        &[Command::SelectParent],
    ),
    row(
        KeyCode::Tab,
        mask(Req::Any, Req::Absent, Req::Any, Req::Any),
        &[Command::NextSibling],
    ),
    row(
        KeyCode::Tab,
        mask(Req::Any, Req::Held, Req::Any, Req::Any),
        &[Command::PrevSibling],
    ),
    // -- Nudge (keybindings.md masks; nudge.md semantics) --------------------
    row(
        KeyCode::ArrowLeft,
        nudge_mask(Req::Absent),
        &[
            Command::NudgeSelection { dx: -1.0, dy: 0.0 },
            Command::PanCamera {
                dx: -PAN_STEP_PX,
                dy: 0.0,
            },
        ],
    ),
    row(
        KeyCode::ArrowRight,
        nudge_mask(Req::Absent),
        &[
            Command::NudgeSelection { dx: 1.0, dy: 0.0 },
            Command::PanCamera {
                dx: PAN_STEP_PX,
                dy: 0.0,
            },
        ],
    ),
    row(
        KeyCode::ArrowUp,
        nudge_mask(Req::Absent),
        &[
            Command::NudgeSelection { dx: 0.0, dy: -1.0 },
            Command::PanCamera {
                dx: 0.0,
                dy: -PAN_STEP_PX,
            },
        ],
    ),
    row(
        KeyCode::ArrowDown,
        nudge_mask(Req::Absent),
        &[
            Command::NudgeSelection { dx: 0.0, dy: 1.0 },
            Command::PanCamera {
                dx: 0.0,
                dy: PAN_STEP_PX,
            },
        ],
    ),
    row(
        KeyCode::ArrowLeft,
        nudge_mask(Req::Held),
        &[
            Command::NudgeSelection { dx: -10.0, dy: 0.0 },
            Command::PanCamera {
                dx: -10.0 * PAN_STEP_PX,
                dy: 0.0,
            },
        ],
    ),
    row(
        KeyCode::ArrowRight,
        nudge_mask(Req::Held),
        &[
            Command::NudgeSelection { dx: 10.0, dy: 0.0 },
            Command::PanCamera {
                dx: 10.0 * PAN_STEP_PX,
                dy: 0.0,
            },
        ],
    ),
    row(
        KeyCode::ArrowUp,
        nudge_mask(Req::Held),
        &[
            Command::NudgeSelection { dx: 0.0, dy: -10.0 },
            Command::PanCamera {
                dx: 0.0,
                dy: -10.0 * PAN_STEP_PX,
            },
        ],
    ),
    row(
        KeyCode::ArrowDown,
        nudge_mask(Req::Held),
        &[
            Command::NudgeSelection { dx: 0.0, dy: 10.0 },
            Command::PanCamera {
                dx: 0.0,
                dy: 10.0 * PAN_STEP_PX,
            },
        ],
    ),
    row(
        KeyCode::ArrowLeft,
        resize_mask(Req::Absent),
        &[Command::ResizeNudge { dw: -1.0, dh: 0.0 }],
    ),
    row(
        KeyCode::ArrowRight,
        resize_mask(Req::Absent),
        &[Command::ResizeNudge { dw: 1.0, dh: 0.0 }],
    ),
    row(
        KeyCode::ArrowUp,
        resize_mask(Req::Absent),
        &[Command::ResizeNudge { dw: 0.0, dh: -1.0 }],
    ),
    row(
        KeyCode::ArrowDown,
        resize_mask(Req::Absent),
        &[Command::ResizeNudge { dw: 0.0, dh: 1.0 }],
    ),
    row(
        KeyCode::ArrowLeft,
        resize_mask(Req::Held),
        &[Command::ResizeNudge { dw: -10.0, dh: 0.0 }],
    ),
    row(
        KeyCode::ArrowRight,
        resize_mask(Req::Held),
        &[Command::ResizeNudge { dw: 10.0, dh: 0.0 }],
    ),
    row(
        KeyCode::ArrowUp,
        resize_mask(Req::Held),
        &[Command::ResizeNudge { dw: 0.0, dh: -10.0 }],
    ),
    row(
        KeyCode::ArrowDown,
        resize_mask(Req::Held),
        &[Command::ResizeNudge { dw: 0.0, dh: 10.0 }],
    ),
    // -- Tools ----------------------------------------------------------------
    // Alt-absent so Alt+V is the align-vertical-centers row, not cursor.
    row(
        KeyCode::Char('v'),
        mask(Req::Absent, Req::Absent, Req::Absent, Req::Any),
        &[Command::SetTool(Tool::Cursor)],
    ),
    row(
        KeyCode::Char('a'),
        mask(Req::Absent, Req::Absent, Req::Absent, Req::Any),
        &[Command::SetTool(Tool::Container { tray: false })],
    ),
    row(
        KeyCode::Char('f'),
        plain(Req::Absent),
        &[Command::SetTool(Tool::Container { tray: false })],
    ),
    row(
        KeyCode::Char('f'),
        plain(Req::Held),
        &[Command::SetTool(Tool::Container { tray: true })],
    ),
    row(
        KeyCode::Char('r'),
        plain(Req::Absent),
        &[Command::SetTool(Tool::Shape(ShapeKind::Rectangle))],
    ),
    row(
        KeyCode::Char('o'),
        plain(Req::Absent),
        &[Command::SetTool(Tool::Shape(ShapeKind::Ellipse))],
    ),
    row(
        KeyCode::Char('y'),
        plain(Req::Absent),
        &[Command::SetTool(Tool::Shape(ShapeKind::Polygon))],
    ),
    row(
        KeyCode::Char('t'),
        plain(Req::Absent),
        &[Command::SetTool(Tool::Text)],
    ),
    row(
        KeyCode::Char('l'),
        plain(Req::Absent),
        &[Command::SetTool(Tool::Line { arrow: false })],
    ),
    row(
        KeyCode::Char('l'),
        plain(Req::Held),
        &[Command::SetTool(Tool::Line { arrow: true })],
    ),
    row(KeyCode::Char('p'), plain(Req::Absent), &[Command::PenTool]),
    row(
        KeyCode::Char('p'),
        plain(Req::Held),
        &[Command::SetTool(Tool::Pencil)],
    ),
    row(
        KeyCode::Char('k'),
        plain(Req::Absent),
        &[Command::Reserved("scale-tool")],
    ),
    row(
        KeyCode::Char('q'),
        plain(Req::Absent),
        &[Command::Reserved("lasso")],
    ),
    // Alt-absent so Alt+H is the align-horizontal-centers row, not hand.
    row(
        KeyCode::Char('h'),
        mask(Req::Absent, Req::Absent, Req::Absent, Req::Any),
        &[Command::HandTool],
    ),
    hold_row(KeyCode::Space, ANY, &[Command::HandHold]),
    hold_row(KeyCode::Char('z'), plain(Req::Any), &[Command::ZoomHold]),
    // -- Arrange ----------------------------------------------------------------
    row(
        KeyCode::Char(']'),
        plain(Req::Any),
        &[Command::BringToFront],
    ),
    row(KeyCode::Char('['), plain(Req::Any), &[Command::SendToBack]),
    row(KeyCode::Char(']'), cmd(Req::Any), &[Command::BringForward]),
    row(KeyCode::Char('['), cmd(Req::Any), &[Command::SendBackward]),
    row(KeyCode::Char('e'), cmd(Req::Absent), &[Command::Flatten]),
    // -- Align & distribute (align.md) -------------------------------------------
    row(
        KeyCode::Char('a'),
        ALIGN,
        &[Command::Align(crate::align::Align::Left)],
    ),
    row(
        KeyCode::Char('d'),
        ALIGN,
        &[Command::Align(crate::align::Align::Right)],
    ),
    row(
        KeyCode::Char('w'),
        ALIGN,
        &[Command::Align(crate::align::Align::Top)],
    ),
    row(
        KeyCode::Char('s'),
        ALIGN,
        &[Command::Align(crate::align::Align::Bottom)],
    ),
    row(
        KeyCode::Char('h'),
        ALIGN,
        &[Command::Align(crate::align::Align::HCenter)],
    ),
    row(
        KeyCode::Char('v'),
        ALIGN,
        &[Command::Align(crate::align::Align::VCenter)],
    ),
    // Web-editor parity (hotkeys.tsx): the distribute letter is the
    // *opposite* axis of the align center on the same key — Alt+Ctrl+V
    // distributes horizontally, Alt+Ctrl+H vertically. (The web's align
    // rows use letter=axis, its distribute rows letter=opposite-axis;
    // matched here for muscle-memory continuity, not consistency.)
    row(
        KeyCode::Char('v'),
        DISTRIBUTE,
        &[Command::Distribute(crate::align::Distribute::Horizontal)],
    ),
    row(
        KeyCode::Char('h'),
        DISTRIBUTE,
        &[Command::Distribute(crate::align::Distribute::Vertical)],
    ),
    // -- Object & style ----------------------------------------------------------
    row(
        KeyCode::Char('h'),
        cmd(Req::Held),
        &[Command::ToggleVisible],
    ),
    row(KeyCode::Char('1'), OPACITY, &[Command::Opacity(1)]),
    row(KeyCode::Char('2'), OPACITY, &[Command::Opacity(2)]),
    row(KeyCode::Char('3'), OPACITY, &[Command::Opacity(3)]),
    row(KeyCode::Char('4'), OPACITY, &[Command::Opacity(4)]),
    row(KeyCode::Char('5'), OPACITY, &[Command::Opacity(5)]),
    row(KeyCode::Char('6'), OPACITY, &[Command::Opacity(6)]),
    row(KeyCode::Char('7'), OPACITY, &[Command::Opacity(7)]),
    row(KeyCode::Char('8'), OPACITY, &[Command::Opacity(8)]),
    row(KeyCode::Char('9'), OPACITY, &[Command::Opacity(9)]),
    row(KeyCode::Char('0'), OPACITY, &[Command::Opacity(0)]),
    // -- View ----------------------------------------------------------------------
    cmd_row(KeyCode::Char('='), cmd(Req::Any), &[Command::ZoomIn]),
    cmd_row(KeyCode::Char('-'), cmd(Req::Any), &[Command::ZoomOut]),
    row(KeyCode::Char('0'), plain(Req::Held), &[Command::Zoom100]),
    row(KeyCode::Char('1'), plain(Req::Held), &[Command::ZoomFit]),
    row(
        KeyCode::Char('2'),
        plain(Req::Held),
        &[Command::ZoomSelection],
    ),
    row(
        KeyCode::Char('r'),
        plain(Req::Held),
        &[Command::ToggleRuler],
    ),
    cmd_row(KeyCode::Char('\\'), cmd(Req::Any), &[Command::ToggleUi]),
    row(
        KeyCode::Char('\''),
        plain(Req::Held),
        &[Command::TogglePixelGrid],
    ),
    cmd_row(
        KeyCode::Char('\''),
        cmd(Req::Absent),
        &[Command::ToggleSnapPixelGrid],
    ),
    cmd_row(
        KeyCode::Char(';'),
        cmd(Req::Absent),
        &[Command::ToggleSnapGeometry],
    ),
    row(KeyCode::PageUp, ANY, &[Command::PrevScene]),
    row(KeyCode::PageDown, ANY, &[Command::NextScene]),
    // -- Reserved (sheet: bound to no-ops so future meaning does not collide) --
    row(
        KeyCode::Char('h'),
        plain(Req::Held),
        &[Command::Reserved("flip-horizontal")],
    ),
    row(
        KeyCode::Char('v'),
        plain(Req::Held),
        &[Command::Reserved("flip-vertical")],
    ),
];

/// Resolve a chord against the table. Validation guarantees at most
/// one row matches (`ROUTE-1` determinism); resolution runs no
/// handler.
pub fn resolve(key: KeyCode, mods: Mods, platform: Platform) -> Option<&'static Binding> {
    SHEET
        .iter()
        .find(|b| b.key == key && b.mask.phys(platform).is_some_and(|phys| phys.matches(mods)))
}

/// "Is this chord advertised?" without running any handler
/// (`ROUTE-3`): the shell suppresses host defaults for advertised
/// chords even when every handler declines.
pub fn claims(key: KeyCode, mods: Mods, platform: Platform) -> bool {
    resolve(key, mods, platform).is_some()
}

/// A table error found by enumeration (`KEY-2`: never resolved at
/// runtime by luck).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TableError {
    /// A row's mask is contradictory on this platform (virtual
    /// primary merged onto a constrained physical key).
    Contradiction { index: usize },
    /// Two rows on one key admit a common modifier state.
    Overlap { first: usize, second: usize },
    /// A row with no commands — unbound (`KEY-1`).
    EmptyChain { index: usize },
}

/// Enumerate a table against a platform: every row resolvable, no
/// empty chain, no two rows overlapping on one chord (`KEY-1`,
/// `KEY-2`, `ROUTE-1`).
pub fn validate_table(table: &[Binding], platform: Platform) -> Result<(), TableError> {
    let mut phys: Vec<PhysMask> = Vec::with_capacity(table.len());
    for (i, b) in table.iter().enumerate() {
        if b.chain.is_empty() {
            return Err(TableError::EmptyChain { index: i });
        }
        let p = b
            .mask
            .phys(platform)
            .ok_or(TableError::Contradiction { index: i })?;
        phys.push(p);
    }
    for i in 0..table.len() {
        for j in (i + 1)..table.len() {
            if table[i].key == table[j].key && phys[i].overlaps(&phys[j]) {
                return Err(TableError::Overlap {
                    first: i,
                    second: j,
                });
            }
        }
    }
    Ok(())
}

/// [`validate_table`] over the shipped [`SHEET`].
pub fn validate(platform: Platform) -> Result<(), TableError> {
    validate_table(SHEET, platform)
}

/// The opacity multi-tap window (`KEY-6`): a second `0` within this
/// window means 0%.
pub const OPACITY_TAP_WINDOW_MS: u64 = 300;

/// The opacity digit command's state (`KEY-6`) — multi-tap is modeled
/// as a stateful command, never a binding-table feature (routing.md).
#[derive(Debug, Clone, Copy, Default)]
pub struct OpacityTaps {
    last_zero_ms: Option<u64>,
}

impl OpacityTaps {
    /// Resolve a digit press at `now_ms` to an opacity in `[0, 1]`:
    /// 1–9 → tenths; 0 → 100%, or 0% when it double-taps a `0` inside
    /// the window.
    pub fn resolve(&mut self, digit: u8, now_ms: u64) -> f32 {
        if digit == 0 {
            if let Some(t) = self.last_zero_ms.take()
                && now_ms.saturating_sub(t) <= OPACITY_TAP_WINDOW_MS
            {
                return 0.0;
            }
            self.last_zero_ms = Some(now_ms);
            1.0
        } else {
            self.last_zero_ms = None;
            f32::from(digit) / 10.0
        }
    }
}

/// The sheet-derived shortcut hint for a command — what a second
/// command surface (the context menu's trailing hint,
/// `crates/grida_editor/docs/context-menu.md`) displays beside an item.
/// *Derived* from the table, never authored, so a displayed binding
/// cannot drift from the sheet. `None` when no non-hold row binds the
/// command; the first table row whose chain carries it wins (chains
/// are alternatives — any of their chords reaches the command).
pub fn hint_for(cmd: Command, platform: Platform) -> Option<String> {
    let binding = SHEET.iter().find(|b| !b.hold && b.chain.contains(&cmd))?;
    Some(format_chord(binding, platform))
}

/// Present a binding's chord from its *authored* mask: only
/// meaningful-held modifiers display (`Any` is a constraint absence,
/// not a key). Mac uses the platform's glyph order (⌃⌥⇧⌘); other
/// platforms spell modifiers out with `+` (the virtual primary and a
/// held physical Ctrl collapse onto one `Ctrl+`, mirroring
/// [`Mask::phys`]).
fn format_chord(binding: &Binding, platform: Platform) -> String {
    let mut out = String::new();
    let m = binding.mask;
    match platform {
        Platform::Mac => {
            if m.ctrl == Req::Held {
                out.push('⌃');
            }
            if m.alt == Req::Held {
                out.push('⌥');
            }
            if m.shift == Req::Held {
                out.push('⇧');
            }
            if m.primary == Req::Held {
                out.push('⌘');
            }
        }
        Platform::Other => {
            if m.primary == Req::Held || m.ctrl == Req::Held {
                out.push_str("Ctrl+");
            }
            if m.alt == Req::Held {
                out.push_str("Alt+");
            }
            if m.shift == Req::Held {
                out.push_str("Shift+");
            }
        }
    }
    out.push_str(&key_label(binding.key));
    out
}

/// A key's display label — glyphs for the editing keys, uppercase for
/// characters. Presentation only; never used for resolution.
fn key_label(key: KeyCode) -> String {
    match key {
        KeyCode::Char(c) => c.to_ascii_uppercase().to_string(),
        KeyCode::ArrowLeft => "←".to_string(),
        KeyCode::ArrowRight => "→".to_string(),
        KeyCode::ArrowUp => "↑".to_string(),
        KeyCode::ArrowDown => "↓".to_string(),
        KeyCode::Escape => "⎋".to_string(),
        KeyCode::Enter => "↵".to_string(),
        KeyCode::Tab => "⇥".to_string(),
        KeyCode::Space => "Space".to_string(),
        KeyCode::Backspace => "⌫".to_string(),
        KeyCode::Delete => "⌦".to_string(),
        KeyCode::PageUp => "PgUp".to_string(),
        KeyCode::PageDown => "PgDn".to_string(),
    }
}
