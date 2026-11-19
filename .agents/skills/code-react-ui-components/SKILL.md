---
name: code-react-ui-components
description: >
  Design a React component for reuse, decide whether to promote feature UI, or
  build a standalone dev demo for a complex interaction with hard-to-reach
  states. Covers component naming, consumer APIs, and representative fixtures.
  Routine UI edits follow the ordinary React and local directory rules.
---

# React UI components

Use this skill when there is a concrete payoff from giving callers a component
they can build on, or from making a complex interaction easy to exercise in
isolation. These are independent reasons to do the work.

## Where things go

- [`packages/ui`](../../../packages/ui/AGENTS.md) owns app-agnostic primitives, shared AI elements, and theme tokens.
- [`editor/components`](../../../editor/components/AGENTS.md) holds reusable editor building blocks.
- [`editor/kits`](../../../editor/kits/AGENTS.md) holds drop-in widgets with their own interaction state.
- [`editor/scaffolds`](../../../editor/AGENTS.md) holds feature UI wired to product or workbench state.
- [`editor/app/(dev)/ui/components`](<../../../editor/app/(dev)/ui/components>) hosts standalone dev demos for components from any of these layers.

Use the local authoring rules at the chosen destination. Follow
[`code-react`](../code-react/SKILL.md) for React implementation.

## Decide whether to promote

1. **Name the responsibility.** Say what the component owns in one sentence.
   If the name needs a long explanation, narrow the responsibility, extract
   a coherent part, or keep the UI in the feature.
2. **Identify the consumer and the payoff.** Sketch a real call site. A useful
   abstraction lets its consumer rely on interaction behavior such as keyboard
   navigation, focus restoration, or cancellation without rebuilding it. A
   similar appearance alone is a weak reason to promote.
3. **Draw the boundary from the call site.** Expose the inputs and events the
   consumer uses. Keep implementation details inside. Leave product data,
   persistence, and policy with their owners. An API that requires consumers to
   coordinate the same internal sequence is a sign to keep refining the
   boundary or leave the component local.
4. **Verify the behavior callers rely on.** Add a component-level test when
   it protects a promise callers build on, such as keyboard reordering or
   retaining focus when an item moves. Tests are optional for simple
   behavior. Cover product wiring at its own boundary when needed.

## Build a dev demo when it helps

Make the hard interaction easy to reach and repeat. Render the production
component through its existing API and use local fixtures for surrounding state
or services. Give the demo enough context to exercise the interaction as used,
including relevant narrow, empty, or in-progress states. Add the page to
[`/ui` navigation](<../../../editor/app/(dev)/ui/_nav.ts>) when it is useful for
ongoing development.

The [Desktop composer demo](<../../../editor/app/(dev)/ui/components/composer>)
uses fixtures for attachments, queued messages, and streaming. Workspace
content tabs are another candidate for a demo: sorting merits repeatable
overflow and keyboard checks, while tab identity, previews, and window chrome
are concrete workbench concerns.
