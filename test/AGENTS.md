# `test`

Manual test cases and UX behavior specifications that are impractical to automate.

## When to add a new TC

- You fixed a UX bug that required human interaction to verify — document it here so it doesn't regress silently.
- You implemented a UX behavior with subtle invariants (z-order, modifier keys, pointer events) that would be fragile or verbose as code tests.
- You discovered an edge case during development that only manifests through real user interaction.

Do **not** add entries for pure logic, math, or data transformations — those belong in co-located `__tests__/` or `*.test.ts` files.

## How to add

1. Copy `_template.md` and rename: `{module}-{area}-{short-description}.md`
2. Assign a unique ID: `TC-{MODULE}-{AREA}-{NNN}` (increment NNN within the module+area)
3. Fill in all frontmatter fields — `status` starts as `untested`
4. Write the `## Behavior` section as natural-language prose (design rationale, not just steps)
5. Write `## Steps` with enough detail for someone unfamiliar to verify

## How to reference from code

When code implements behavior documented here, add a comment pointing to the file:

```ts
// (see test/canvas-input-history-undo-cem.md)
```

## Rules

- **One behavior per file.** If a TC covers two independent behaviors, split it.
- **Never delete a TC** — set `status: deprecated` instead (preserves history).
- **When automating**: write the code test, add its path to `covered_by`, set `status: deprecated` once fully covered.
- **Keep prose stable.** Frontmatter fields change freely, but avoid rewriting `## Behavior` unless the actual behavior changed — git blame on that section is the audit trail.
