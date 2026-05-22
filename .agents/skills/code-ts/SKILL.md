---
name: code-ts
description: >
  TypeScript code shape inside a well-named module — taste, not lint. Prefer
  one class or namespace per file (the unit a test targets) over scattered
  free exports; consolidate related code, don't fragment. The unit of code
  should be the unit of spec. Use when authoring TS in
  `editor/grida-canvas*`, `editor/lib/`, or `packages/*`. Sibling to the
  `naming` skill; React-specific shape lives in `code-react`.
---

# code-ts

Vanilla TS conventions (PascalCase types, `kebab-case` files, `use-*`
hooks) are table stakes — assume them. This is the taste on top.
Where [`naming`](../naming/SKILL.md) decides the boundary of a module,
`code-ts` decides what the code inside that boundary looks like so it
stays testable and the boundary keeps doing its job.

## One class or one namespace per file

The exported unit should be a single thing a test can target: one
class with cohesive methods, or one `export namespace` (or
const-as-namespace) wrapping related functions. Avoid the
alternative — a file that exports ten free functions and a handful
of types side-by-side.

Why:

- `import { css } from "./css"` then asserting against
  `css.toReactCSSProperties(...)` mirrors the file's structure 1:1.
  Tests, callers, and grep all read the same shape.
- Scattering free `export`s loses the gate `naming` worked to
  establish. The file becomes a bag — anything can drift in alongside.
- The unit becomes mockable and replaceable as a contract, not a
  pile of helpers.

The repo lives this. `editor/grida-canvas/data-transfer.ts` is a
24-line `export namespace datatransfer` carrying a type, a key, and
an `encode`/`decode` pair, and nothing else.
`editor/grida-canvas-utils/css.ts` is a single `export namespace css`
with ~20 CSS-conversion functions inside, paired one-to-one with
`editor/grida-canvas-utils/css.test.ts`. `editor/grida-canvas/editor.ts`
is the `Editor` class — the engine's front door, one contract
surface for everything downstream.

## Not class or namespace everywhere

This is not "always use a class" or "always use a namespace." It is
that the code most worth grouping in this repo — engine logic,
library modules, contract-bearing utilities — is overwhelmingly
stateful or spec-bearing, and reads better that way. UI glue, route
handlers, one-shot scripts, and small page-local helpers can be
plain exports.

Heuristic: if the filename is a noun that `naming` would approve
(one concept, strict, honest), the contents probably want to live
under that noun as a class or namespace. If the file is named for
its _location_ in a feature flow (`page.tsx`, `loader.ts`,
`route.ts`), free exports are fine.

## Consolidate, don't fragment

Prefer one coherent file with a namespace of five methods over five
files each exporting one function. Five files force callers to
remember five paths and force you to invent five names that didn't
need to exist; one namespace exposes one path with five methods,
and shared private helpers stay private without ceremony.

This is the inside-the-file consequence of the same discipline
[`naming`](../naming/SKILL.md) applies at the directory level —
flatten with siblings, don't nest to hide drift. Siblings (the
`painter.rs` / `painter_geometry.rs` pattern) are for things that
earned their own gate, not for shaving a namespace into chunks.

The negative tell: a directory whose `index.ts` is a wall of
re-exports from one-function files. That is a namespace pretending
to be a folder.

## The spec is the shape

The unit of test should be the unit of code. A namespace `css`
paired with `css.test.ts`, where each `describe` block targets one
`css.<fn>`, is the shape this repo expects.

Why:

- The test file becomes a readable spec of the module's public
  contract. A reader can enumerate the module's surface without
  opening the source.
- It keeps the public surface honest. Anything not in the test is
  suspect — either dead, or doing work behind the contract that
  should be exposed.

`editor/grida-canvas-utils/css.ts` and its `css.test.ts` are the
canonical example: namespace methods map directly to test suites.
`editor/lib/templating/template.ts` and `template.test.ts` show the
same shape for a single-function module.

Co-locate tests as `*.test.ts` siblings to the source, unless the
module already uses a `__tests__/` directory — then follow local
convention.

## The short version

- One class or one namespace per file. The exported unit is what a
  test targets.
- Not everywhere — engine and library code want this shape; UI
  glue and route handlers don't.
- Consolidate over fragment. Five one-function files want to be
  one namespace.
- The test file should read like the spec of the module. If it
  doesn't, the export surface is wrong, not the test.

See also [`naming`](../naming/SKILL.md) for the boundary discipline
this builds on, and [`code-react`](../code-react/SKILL.md) for
React-specific shape.
