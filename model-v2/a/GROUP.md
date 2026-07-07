# GROUP — what a group _is_

2026-07-07. The owner's framing: groups are needed in a graphics tool,
no questions asked — but every system means something different by one.
SVG's `<g>` is a transform + a style-inheritance scope; HTML has no
group at all (a div is a real box that always contributes to layout);
Figma's group "only holds" — and its children's constraints famously
bind to the **non-group parent**. This chapter fixes the definition for
anchor, documents what is already decided and tested, and resolves the
one open fork with verified peer semantics (research run 2026-07-07,
primary sources; quotes below).

## The definition

> **A group is a named set with a coordinate space — nothing else.**
> It has no box of its own (derived union), no style, no layout opinion.
> Everything a group appears to "have" is either carried in the uniform
> header (opacity, blend, rotation, placement of its origin) or derived
> from its members.

## The peer table

|                    | box                                      | children's coords                                                                 | constraints ref                                                        | AL/layout pass-through                                                                                                 | style inheritance                                 | transform unit                                      |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| SVG `<g>`          | none (bbox derived)                      | group space                                                                       | n/a                                                                    | n/a                                                                                                                    | **yes — fill/stroke cascade**                     | transform attr                                      |
| HTML div           | **real box**                             | parent space                                                                      | n/a                                                                    | it IS layout                                                                                                           | CSS cascade                                       | transform (paint-only)                              |
| Figma group        | derived, re-fits (`resizeToFit`)         | **stored** group-relative; **presented** frame-relative (plugin API skips groups) | **nearest FRAME — skips groups** (verified)                            | **no** — layoutAlign/Grow inert on group children; the GROUP is the flex item and carries FIXED/FILL itself (verified) | no                                                | stored on the group-frame; re-fit writes compensate |
| Sketch classic     | derived                                  | group space                                                                       | **the group** (opposite of Figma)                                      | n/a                                                                                                                    | no                                                | frame + rotation                                    |
| Sketch Athens      | derived                                  | _frame_-relative (groups skipped, Figma-like)                                     | frame pins                                                             | via Frames                                                                                                             | no                                                |                                                     |
| **anchor `group`** | derived union of oriented children (D-1) | group space                                                                       | direct parent today → **E-A13 proposal: nearest non-derived ancestor** | **no** (= Figma, verified parity); the group carries `grow`/`self_align` itself                                        | **no — rejected by construction** (empty payload) | 3 scalars (rotation + origin), never child writes   |

Key verified quotes (Plugin API / help center / best-practices):

- _"Constraints of this node relative to its containing FrameNode …
  Group and BooleanOperation nodes do not have a constraint property
  themselves. Instead, resizing a frame applies the constraints on the
  children of those nodes."_
- _"Constraints applied to elements will always be relative to the
  closest parent frame — not relative to the bounds of the group."_
- _"layoutAlign … applicable only on direct children of auto-layout
  frames"_ — group children do **not** negotiate with the outer frame;
  the user's recollection is half-right: **constraints pass through;
  auto-layout child properties do not** (the group itself is the item).
- _"It is **not** relative to its direct parent if the parent is a
  group"_ — Figma **stores** group-relative (kiwi: groups are FRAME
  nodes, `resizeToFit: true`) and **materializes** frame-relative in the
  plugin API. The same stored-vs-presented split as `normalizedSize`
  (E7) — Figma keeps validating our reads-materialize doctrine.
- _"a group's position and size will change if you change its content"_
  — Figma pays **re-fit compensation writes** on every child edit
  (X-FIG-4), the exact behavior anchor's derived-origin design exists
  to avoid (D-3: child edits write nothing to the group — lab-tested).

## Decided and tested (the closed half)

| decision          | rule                                                                                                                                                                                                      | evidence                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Box               | derived = union of **oriented** children; op-result for `bool`                                                                                                                                            | D-1 ✅, `group_union_of_rotated_members` ✅                    |
| Placement         | bindings place the **origin**, never the union (E-A1)                                                                                                                                                     | D-2 ✅ `d2_sibling_stability…`, depth-3 ✅ (census fix)        |
| Child edits       | never write the group — reported box changes, siblings don't move (free ctx)                                                                                                                              | D-3 ✅; law 9 with the census's in-flow qualifier              |
| Rotation          | one scalar, origin pivot; center-feel gesture = 3 writes; ungroup bakes per-kind                                                                                                                          | ✅ `group_origin_pivot…`, `ungroup_nested_group…` (census fix) |
| Style inheritance | **rejected** — group payload is empty; no fill/stroke can exist on a group, so nothing can cascade (the SVG `<g>` behavior is structurally impossible, which is the strongest form of "not what we want") | model shape (a.md §3)                                          |
| Compositing       | group opacity/blend live in the header (isolate-then-fade); **effects ignored-by-rule** — a Figma group with effects re-kinds to frame at import                                                          | §8; COMPAT figma row                                           |
| In flow           | the group is one flex item via its derived AABB (rotated per E1)                                                                                                                                          | D-6 ✅ `d6_group_in_flex…`, edge demo `group` scene            |
| Empty / hidden    | empty union = zero rect at the placed origin; hidden children skipped                                                                                                                                     | ✅ census tests ×2                                             |
| SVG `<g>` import  | → group natively; `<g filter/clip/mask>` re-kinds to frame                                                                                                                                                | COMPAT svg row                                                 |

## The fork, resolved: constraint transparency (E-A13, proposal)

**Problem.** Anchor today: bindings resolve against the _direct_ parent,
and E-A5 makes End/Center/Span error-by-rule under a derived parent —
so a right-pinned icon inside a group **loses its responsive intent**.
Figma: constraints skip groups to the nearest frame. Faithful import
currently requires group→frame promotion (COMPAT surgery row), trading
away either grouping or responsiveness.

**Why Figma's answer looked cyclic for us — and isn't.** The naive
pass-through reading ("resolve the child against the outer frame, then
derive the group") threatens a cycle: child position → union → group
box → child position. Figma escapes by _writing_ re-fits back into the
stored group-frame (compensation writes). **Anchor escapes by E-A1**:
the group's origin is _stored intent_ (Start-pin scalars), independent
of the union. So pass-through resolution is single-pass:

```
E        = extent of the nearest non-derived ancestor A   (known, top-down)
x_in_A   = binding table against E                        (Pin{End,o} → E − o − w)
x_in_grp = x_in_A − Σ origins of the derived chain        (stored scalars — known)
union    = derived afterward, as always
```

No re-fit writes, no cycle, no CRDT cost — the derived-origin rule we
adopted for sibling stability turns out to be the _enabling_ condition
for Figma-parity constraint transparency. (This is the run's second
case of one decision paying for another; the first was rotation's
center pivot making Pin{Center} correction-free.)

**E-A13 (for the phase-3 spec):**

1. Binding **reference** = the nearest non-derived ancestor's box.
   Under a derived parent, non-Start pins resolve through the chain as
   above — E-A5's error-by-rule shrinks to the truly underdetermined
   cases (derived chain under an Auto-hug axis, and free-standing
   groups with no extent-bearing ancestor… which the regularized root
   guarantees cannot happen).
2. **v1 restriction:** the derived chain must be unrotated and
   unflipped for non-Start pins (mixing a rotated group space with the
   ancestor's axes has no honest single answer — Figma is equally
   undefined there). Violation = error-by-rule with report, exactly the
   E-A5 mechanism, narrowed.
3. **Auto-layout properties do NOT pass through** — verified Figma
   parity. `grow`/`self_align` on group children under an outer flex
   are inert (§8 gains the explicit cell); the group itself carries
   them (with the census caveat that grow/stretch on a derived box
   needs its declared rule — the Figma answer is rescale-children,
   which for anchor is a K-bake, kept op-layer).
4. **COMPAT upgrade:** the figma "group constraint-transparency" row
   moves surgery → native; the group→frame promotion remains only for
   effects-carrying and rotated-constrained groups.
5. Conformance: new G-rows (pin-through-group resolution table;
   chain-rotated → report) + a D-row (pass-through preserves D-2
   sibling stability — it does, by construction, but it must be locked
   by test).

**Costs, honestly:** resolution must walk the derived chain (bounded,
cheap); the §8 matrix gains a context column ("under derived parent");
the text IR grammar needs one sentence; and the group-resize _gesture_
(user drags a group handle) remains what it is everywhere — an op-layer
fan-out (Figma: constraint-apply; Sketch K: scale; anchor: per-child
bake with declared write-set), never a stored mode.

## The lens corroboration

Figma is beta-testing **`TransformGroupNode`** — "a group with
`transformModifiers` that transforms its children." That is a
_non-transparent_ group: exactly anchor's `lens`, invented independently
by the peer with the largest corpus. The group/lens split (transparent
set vs transforming quarantine) is not our idiosyncrasy; it is where
the industry is heading. Worth tracking for import (a TransformGroup
imports as a lens, trivially).

## Residual opens

- Rotated-chain pass-through (declared error in v1; a future answer
  needs a "constraints in rotated spaces" doctrine nobody has).
- `bool` inherits all group placement rules but its operand semantics
  and Phase-M path-ops dependency stay in LIMITS §B-5.
- The group-resize gesture write-set (op-layer, editor.md row owed —
  Figma's `resize()` vs `resizeWithoutConstraints()` split is the
  precedent to mirror).
