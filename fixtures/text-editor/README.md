# text-editor fixtures

Shared behavioral fixtures for the text-editor engine. Consumed by **both**
[`crates/grida/src/text_edit/`](../../crates/grida/src/text_edit/) (Rust) and
[`packages/grida-text-editor/`](../../packages/grida-text-editor/) (TS) so the
two implementations cannot drift apart silently.

## Why this exists

We maintain two implementations of the same editing engine — a Rust crate that
drives the main WASM canvas editor, and a TS package that drives the SVG editor
(and is positioned to replace the main editor's DOM-backend fallback in a
future iteration). Both are bound by the same behavioral contract spelled out
in the working-group docs at [`docs/wg/feat-text-editing/`](../../docs/wg/feat-text-editing/).

The WG docs describe the contract; this directory pins it. Each fixture is a
hard, machine-checked example of "for input X, the engine must produce Y."
Adding a fixture is how a paragraph of prose in the manifesto graduates into
a regression-proof guarantee enforced on every CI run, in both languages.

When a fixture fails on one side, the divergence is real and a decision has to
be made: the impl is wrong, the doc is wrong, or the fixture is wrong. Quietly
weakening the fixture so both sides pass is the worst of the three options —
it's a lie that hides the question.

### Relation to the WG docs

| this directory                 | the WG docs                        |
| ------------------------------ | ---------------------------------- |
| machine-checked examples       | natural-language specification     |
| pinned input → expected output | the rule that produced the output  |
| fails CI if either impl drifts | gets updated when consensus shifts |

A new fixture should usually be backed by language in the WG docs. When
behavior is observed-but-undocumented (e.g. the
[selection-collapse-on-arrow rule](../../docs/wg/feat-text-editing/index.md#selection-collapse-on-navigation)
was an obvious behavior implemented in the Rust crate but not written down
anywhere until 2026-05-13), patch the docs in the same commit you add the
fixture.

When the WG docs and the fixture diverge, the docs are authoritative — but
that should be a deliberate change, not a quiet one.

## Format

`v1.json` is the V1 corpus. Each entry has:

- `id` — short unique identifier; used as the test name on both sides.
- `description` — optional one-liner; surfaces in failure diagnostics and
  documents intent (especially for cases that pin a _deliberate_ behavior
  choice the impls might otherwise diverge on).
- `initial` — `{ text, caret, anchor }`. `anchor: null` means no selection.
- `commands` — array of `EditingCommand`. The schema mirrors the TS
  discriminated union (`type` + camelCase fields). Granularity-bearing commands
  carry an explicit `"grapheme" | "word"`.
- `final` — expected end state after applying all commands in order.

## V1 scope

- **ASCII text only.** Offsets are unambiguous (UTF-8 bytes == UTF-16 code
  units), so the same numeric `caret`/`anchor`/`start`/`end` values can be
  consumed by Rust (UTF-8) and TS (UTF-16) without conversion.
- **Pure commands only.** No IME, no clipboard, no layout-dependent commands
  (`move_up`, `move_line_*`, `page_*`, etc.) — those require host-supplied
  state the fixture format can't carry yet.
- Commands used: `insert`, `delete`, `backspace`, `replace`, `move_left`,
  `move_right`, `move_doc_start`, `move_doc_end`, `select_all`, `set_selection`.

V2 candidates (deliberately out of scope today): multi-byte text (CJK, emoji
ZWJ sequences), IME composition, HTML clipboard round-trips, line-aware
navigation. Each requires either an offset-encoding convention in the schema
or a host-mock contract — both worth doing, neither blocking V1.

## TODO / roadmap

The V1 corpus is intentionally minimal. The long-term direction is for the
fixture suite to be the **primary** behavioral test on both sides — the per-
language unit tests should reduce over time to _impl-specific_ concerns
(e.g. TS's `session.emit` guarantee, Rust's grapheme-snap-at-load semantics,
host DOM integration). Anything observable from outside the engine — "given
this state, this command produces that state" — belongs here.

Concrete things missing today, roughly in order of value:

- **Selection range as a first-class final state.** Most fixtures end with
  `anchor: null` (collapsed). Add a richer corpus of cases that _end_ in a
  selection — shift-arrow chains, `set_selection` programmatic sets, drag-
  style anchor/focus reversals, multi-step extends that grow then shrink the
  range. Consider promoting `selection: { start, end }` to an explicit
  optional field in `final` so reverse-anchored selections aren't ambiguous.
- **Bidi text** (UAX#9). Mixed LTR/RTL strings; logical vs visual movement;
  affinity at directional run boundaries. Pinning the policy choices the WG
  manifesto leaves to implementers (selection_rect mode, end-of-line
  affinity policy, etc.) belongs here.
- **IME composition** if expressible. Likely shape: a command sequence with
  `composition_set` / `composition_commit` / `composition_cancel`, and a
  `composition` field on `initial`/`final` mirroring `text`/`caret`/`anchor`.
  Some IME edge cases (winit macOS sentinels, dead-key finalize-via-non-
  composable) are platform-specific and stay in per-side tests.
- **Clipboard** (copy/cut/paste). Plain-text first; HTML rich-text after V2
  attributed-text lands. A `clipboard` field on `initial`/`final` (or a
  separate `clipboard_after`) carries the system clipboard's expected value.
- **Layout-dependent navigation.** `move_up`, `move_down`, `move_line_*`,
  `page_*`. Requires a mock layout in the fixture (line metrics, char-per-
  line table, or pre-computed `position_for_navigation` answers). Probably
  cleanest as a separate schema variant or a sibling `*-layout.json`.
- **Multi-byte text** (CJK, emoji ZWJ sequences, combining marks). Requires
  an encoding convention — almost certainly UTF-16 indices on the wire,
  Rust converts on load via the existing utf16↔utf8 helpers. Surfaces
  grapheme-cluster boundary correctness on both sides.
- **More word/line boundary edge cases.** Punctuation runs, contractions
  ("don't"), CamelCase, URLs. UAX-29 has a long tail.
- **`replace`, `select_at`, IME edge** cases at extreme positions (0, length,
  out-of-bounds clamps).
  These are sequenced by their dependency on schema extensions. Selection-range
  fixtures are pure additions and can land first. Bidi and IME need schema
  additions but no per-language harness changes. Layout-dependent commands need
  both. Multi-byte needs an encoding convention written down before any case is
  added (otherwise the fixture is ambiguous about which side is wrong).

Out of scope for the current schema, tracked elsewhere:

- **History boundaries** (`EditKind` merge-by-2s-timeout). History is a
  per-session stack, not a pure command-applies-to-state fixture. A sibling
  schema covering "sequence of commands + expected undo/redo entries" would
  pin the Rust crate's merge rules against the TS port — but it's a different
  shape from `v1.json` and belongs in its own file when authored.

## Maintenance rules

1. **A fixture that's been weakened so both sides pass is a lie.** If a case
   fails on one side, fix the underlying implementation or remove the case
   with a comment in the harness — never quietly soften the expectation.
2. **New fixtures should reference WG-doc language.** If the behavior isn't
   in the docs yet, patch the docs in the same change.
3. **Authoring bias is real.** Don't write a fixture by running it on the impl
   you happen to be looking at and recording what came out. Write what the
   _spec_ says should come out; run it on both impls; investigate any
   divergence rather than aligning the fixture to whichever side you saw
   first. (For an instance of this going wrong, see the early commits that
   added this directory — the first cut cherry-picked clean word-edge
   positions that both impls already agreed on, hiding the actual segment-vs-
   word-with-whitespace divergence that the suite was supposed to catch.)

   _Procedure for new fixtures:_
   1. Cite the WG-doc section the expectation comes from in the case's
      `description` field (or patch the docs in the same change per rule 2).
   2. Run the fixture against **both** harnesses before opening the PR —
      `pnpm turbo test --filter @grida/text-editor` and
      `cargo test -p grida text_edit::shared_fixtures`. If either fails,
      the fix lives in code or in the doc, not in the fixture.

## Harnesses

- TS: [`packages/grida-text-editor/__tests__/shared-fixtures.test.ts`](../../packages/grida-text-editor/__tests__/shared-fixtures.test.ts)
  uses `it.each` so each case is a named row.
- Rust: [`crates/grida/src/text_edit/shared_fixtures_tests.rs`](../../crates/grida/src/text_edit/shared_fixtures_tests.rs)
  loops in a single `#[test]` with the failing case id in the `assert_eq!`
  message.

Both `include`/`include_str!` this directory at compile/import time — there's
no fs-at-runtime path, so the fixture travels with the binary/bundle.
