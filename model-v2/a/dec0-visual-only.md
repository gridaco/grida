# DEC-0 · visual-only, normative

2026-07-07. The rule set for the flipped default — **rotation (and every
header transform) is a post-layout paint transform; sizing never reads
it; reads stay oriented** — written as the spec review DEC-0's flip was
gated on. Each rule names its consequence and its guarding test
(`lab/tests/visual_only.rs` unless noted).

## The two tiers (the one sentence)

- **Sizing tier** (phase M measure, phase L layout: flex contributions,
  hug, spans, derived unions): reads the **untransformed box** —
  rotation and flips do not exist here. CSS-pure: no exceptions, no
  hybrid hug.
- **Read tier** (phase B and everything downstream: `world_aabb`,
  selection chrome, hit-testing, culling): **oriented, always** — even
  CSS reports post-transform bounds for reads.

`xywh` (the box read) belongs to the sizing tier: it reports the stable
basis, not the ink. Ink bounds are `world_aabb`. Two named reads, two
meanings, both spec'd — never one value doing both jobs.

## Rules

- **V-1 · flex contribution** — a rotated in-flow child contributes its
  unrotated box; slot = box; rotation paints about the box center.
  Siblings do not make room; overlap is correct behavior.
  (`r3` sheet column, `v1_*`)
- **V-2 · fill never fights rotation** — `grow` and `self_align:Stretch`
  apply to the unrotated box regardless of rotation; continuous at
  every angle by construction. E-A4/E-A11/E-A12 retire; DEC-1/DEC-2/
  DEC-3 close n/a. (`v2_*`)
- **V-3 · hug ignores transforms** — auto-sized containers (flex hug
  AND free-context hug) measure children's unrotated boxes at their
  pins. A rotated child's ink may escape its hug parent; that is the
  accepted CSS wart, and the escape is visible in the read tier
  (`world_aabb` ⊃ box). (`v3_*`)
- **V-4 · THE GROUP-BOX FORK, decided: derived boxes are sizing-tier.**
  A group/lens box = union of members' **unrotated** boxes at their
  pins (translation only — member rotation AND flips ignored). Chosen
  over the oriented union because the derived box feeds flex/hug: an
  oriented union would smuggle the envelope back into layout one
  nesting level deep — the exact behavior DEC-0 removes. Consequences:
  `xywh` of a group under-reports rotated ink (by design; ink =
  `world_aabb`); selection chrome for derived kinds SHOULD use ink
  bounds (spike HUD does). E-A1 origin placement and D-2 sibling
  stability are untouched (the union is still union-shaped, just
  unrotated). (`v4_*`)
- **V-5 · the group's own transform** — a group's OWN rotation/flip
  still paints (origin pivot, E-A1/B1 unchanged) and still does not
  feed its parent's sizing (the group contributes its unrotated union
  box). (`v4_group_own_rotation_paints_only`)
- **V-6 · rotated parent rigidity (unchanged)** — layout runs in the
  parent's local space; the assembly transforms as one body. Identical
  in both arms and in CSS. (existing `rotation.rs` arm-pinned)
- **V-7 · the lens (unchanged mechanics, demoted distinction)** —
  lens ops stay post-resolution paint; with header rotation now also
  paint-only, `lens-rotate ≡ header-rotate` behaviorally. E-A8's lint
  inverts: a lens containing ONLY `Rotate` is always redundant — use
  header rotation. The lens remains the quarantine for shear/matrix/
  retained-scale. (existing `derived.rs` lens tests, arm-pinned where
  needed)
- **V-8 · reads stay oriented** — `world_aabb`, pick, HUD chrome
  geometry: unchanged from the anchor arm; flip/rotation fully visible
  here. (existing `arena_pick.rs`, `geometry.rs`)
- **V-9 · reports** — the rotated-inert report class
  (grow/stretch-ignored-when-rotated) must NOT fire: nothing is ignored
  anymore. §8's matrix loses those rows. (`v2_no_inert_reports`)
- **V-10 · importer posture (COMPAT)** — Figma rotated-in-auto-layout
  children import as `flow:Absolute` + pins at their resolved position
  (geometry-exact, flow participation dropped); frequency to be
  measured by E9. CSS `transform:rotate` imports 1:1 (this framing IS
  CSS's).

## What stays true from the anchor run (unchanged laws)

E-A1 origins · E-A2/E-A14 flip semantics (flip was ALREADY
layout-invisible for boxed kinds; V-4 extends "sizing ignores flips" to
derived members) · E-A3 two stretches · E-A5 underdetermined bindings ·
E-A6 format RMW (DEC-7 open) · E-A9/E-A10 points & scales · E-A13 group
constraint pass-through (orthogonal to rotation) · the ops layer,
write counts, typed walls · the IR · free context (no sizing consumer
of rotation existed there anyway — hug aside, which V-3 now covers).

## Retirements

- **E-A4, E-A11, E-A12** (grow/stretch × rotation policy) — the
  configurations are legal and continuous now; nothing to declare.
- **E-A7** (envelope readout as layout explainer) — demoted to
  selection info: basis vs ink is still worth showing, but mid-turn
  slot width no longer changes, so nothing "reads as a bug".
- **E-A8** (context-scoped lens-rotate lint) — inverted, see V-7.
- **DEC-1, DEC-2, DEC-3** — closed n/a in the register.
- The dec0-fork and edge-cases artifacts remain as the DECISION RECORD
  (they show both arms; the left panel is now the road not taken).

## Review verdict

The flip is semantics-narrow (one resolver read policy + the V-4
definition) but the V-4 fork was REAL undefined behavior until decided
— a group with rotated members had four consumers reading one value
with two possible meanings. Decided sizing-tier; the suite now pins
both arms explicitly (the anchor arm's laws remain tested as the
documented alternative), and `visual_only.rs` is the new default's
conformance floor.
