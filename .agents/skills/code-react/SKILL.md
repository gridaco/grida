---
name: code-react
description: >
  React-specific code shape in the Grida editor. Hooks cannot be tested or
  benchmarked and silently break tuned UX under layered composition, so they
  are barred from the engine and main system — load-bearing logic lives in
  classes and namespaces, hooks only as thin edge wires. `data-testid`
  follows component-root discipline: one per significant component, not
  scattered. Use when authoring React in `editor/grida-canvas-react/`,
  `editor/components/`, `editor/scaffolds/`, or `editor/app/*`.
---

# code-react

React in this repo is a thin layer over a framework-agnostic engine.
These conventions protect that thinness — where logic is allowed to
live, and where test landmarks land in the DOM — so the React layer
stays replaceable and easy to read.

## Hooks live at the edge

React hooks must not appear in the main system — the canvas engine,
reducers, document model, font manager, presentation engine, command
handlers, anything that represents domain state or compute logic.
Hooks live only at the React edge: small `use-*` adapters that
bridge engine state into components, plus component-local UI state.

The reason is that **hooks cannot be tested, cannot be benchmarked,
and cannot be reasoned about by inspection** once their composition
crosses more than a couple of layers. In a complex editor — where
one render is a chain of conditional effects, memoized derivations,
and re-entrant subscriptions — the execution order and re-render
layering _are_ the behavior. A subtle ordering change, a missed
dep, a state read one tick later, and the user-visible UX shifts.
**Features you tuned will get silently dropped** — no failing test,
no benchmark regression, no noisy error to alert you. By the time
someone notices, the regression is weeks deep and no bisect helps,
because nothing was ever measurable.

The escape is not "test your hooks better," not "be more careful
with deps," not "add a `renderHook` suite." It is **don't use
hooks for anything load-bearing in the first place**. The rule is
prevention, not discipline — discipline fails at the third layer
of composition; prevention does not. Logic that matters lives in
a class or namespace where the execution order is explicit, the
contract is testable, and the hot path is benchmarkable. The hook
is reduced to a wire — short enough that you can verify it by
sight, and small enough that not testing it is honest.

A hook is acceptable in exactly two situations:

1. **Not testing it is honest.** The hook calls
   `useSyncExternalStore`, `useContext`, or a `useEffect`
   lifecycle, with no branch and no derivation. The test would
   be tautological.
2. **The spec would be longer than the code.** The hook is short
   enough that no test could catch a bug the code couldn't already
   reveal at sight.

If a hook fails both — branching logic, derivations, coordination
across effects, anything you would want to benchmark or assert on
— extract the logic out, test and benchmark it there, and reduce
the hook to a three-line call site.

A pair of examples pins the boundary:

- **Fine.** `useState` and hooks for component-local UI state —
  hover, focus, open/closed, the in-flight value of an input
  about to be committed. The spec is the code; not testing it
  is honest.
- **Never.** Hooks for features layered on top of a rich-text
  or canvas runtime — a slash-menu, mention picker, inline
  toolbar plugin, anything that composes with the host editor's
  state machine. Even when the host (e.g. tiptap, lexical) is
  hook-friendly, _your_ features run on an execution order you
  do not own. Build them as classes or namespaces against the
  host's imperative API; React renders the result.

The split is structural, not lint-enforced. The engine package
must not import React. The React bindings consume the engine
through its public surface — never the reverse — so the engine
stays replaceable and the bindings stay verifiable by sight. A
`use-*` that wires `useSyncExternalStore`, `useContext`, or a
disposal `useEffect` to the engine is the entire allowed shape;
anything more is engine logic in the wrong package.

## One `data-testid` per component root

Test IDs are landmarks, not scattered selectors. A significant
component — a panel, a dialog, a workflow root, a complex isolated
module — gets one `data-testid` on its outermost element. Internal
children are located via semantic queries (`findByRole`, text)
rooted at that landmark.

Apply to: panels, dialogs, popovers, major layout regions, complex
modules. Skip for: `Button`, `Input`, `Icon`, primitive layout
wrappers (`Box`, `Flex`, `Stack`), and any element a test can
reach with a role or text query from the landmark above it.

Values are kebab-case, factful, and unique:
`sidebar-right-inspect-node-properties`,
`popover-color-picker-rgba32f`, `dialog-export-settings`. Avoid
tying values to file names, UI copy strings, or styling concerns —
those churn.

Why: a `data-testid` is a contract between the DOM and the
component that rendered it. If every span has one, the contract
is meaningless and tests start coupling to implementation details.
One per landmark keeps the contract small and stable.

The full reference — with the apply/skip table and worked
examples — lives in `docs/contributing/react.md`. The rule above
is the load-bearing part.

## The short version

- Hooks cannot be tested, cannot be benchmarked, and silently
  shift UX under layered composition. Prevention is the rule, not
  discipline — discipline fails at the third layer.
- Load-bearing logic lives in a class or namespace where it can
  be tested and benchmarked. Hooks are a wire to React, nothing
  more.
- A hook is acceptable only when not testing it is honest, or
  when the spec would be longer than the code. Otherwise extract.
- `data-testid` goes on the component root, not its children.
  Tests find the landmark, then use semantic queries.
- kebab-case `data-testid` values, factful and unique; never
  tied to file names, copy, or styling.

See also [`code-ts`](../code-ts/SKILL.md) for the TypeScript code
shape this builds on, and `docs/contributing/react.md` for the
canonical UI test ID reference.
