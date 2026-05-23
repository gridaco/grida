# Policy Class

> Pure data + lookups. No behavior.

This module is the runtime encoding of the **Policy Class** abstraction
described in
[`docs/wg/feat-svg-editor/glossary/policy-class.md`](../../../../../docs/wg/feat-svg-editor/glossary/policy-class.md).

It contains three things:

1. The **type vocabulary** (`types.ts`) — `PolicyClass`, `Intent`,
   `Solution`, `SolutionSpace`.
2. **Table 1** (`classify.ts`) — `policy_class_of(tag)` maps an SVG
   element tag to its Policy Class.
3. **Tables 2 & 3** (`tables.ts`) — the solution-space matrix
   (which solutions are legal per cell) and the chosen-policy matrix
   (what v1 actually picks).

The four public lookup functions are:

| Function                       | Question it answers                                                           |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `policy_class_of(tag)`         | What class does this element belong to?                                       |
| `accepts(cls, intent)`         | Does this class accept this intent at all?                                    |
| `legal_solutions(cls, intent)` | What are the legal ways to realise this intent on this class?                 |
| `chosen_policy(cls, intent)`   | What did v1 pick for this cell?                                               |
| `fork_count(cls, intent)`      | How many legal solutions? (0 = rejected, 1 = mandated, ≥ 2 = policy decision) |

## What this module is for

- **Documenting policy**: the table data is the spec. Reading
  `tables.ts` should match reading the glossary doc cell-for-cell.
- **Dispatching by class**: callers that need to know how to handle a
  gesture look up the chosen policy and act on the four-element
  `Solution` enum, instead of switching on the SVG tag.
- **Asserting consistency**: the test suite in
  `__tests__/policy-class/` enforces five invariants
  (`I1`–`I5`, see `tables.ts`) so the doc and the code cannot drift.

## What this module is _not_ for

- **Behavior**. There is no resize math here. The actual `bake` /
  `via-transform` / `promote` / `restrict` implementations live in
  `core/intents.ts` and the `*-pipeline/` directories. This module
  tells you _which_ solution applies; it doesn't apply it.
- **Per-instance dispatch**. The translate fork on "does this element
  already carry `transform=`?" is not a class-level decision and is
  not modeled here.
- **Capability flags on individual nodes**. `is_resizable`,
  `is_rotatable`, etc. are computed by the existing capability layer
  and may consult Policy Class but are not a re-export of it.

## Changing the tables

If you add a class, an intent, a solution, or change a cell:

1. Update the corresponding section of
   [`policy-class.md`](../../../../../docs/wg/feat-svg-editor/glossary/policy-class.md).
2. Update the corresponding entry in `types.ts`, `classify.ts`, or
   `tables.ts`.
3. Run the tests in `__tests__/policy-class/`. They will fail loudly
   if doc and code disagree on any invariant.

The doc is the spec; this module is its executable shadow.
