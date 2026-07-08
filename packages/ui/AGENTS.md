# `@app/ui`

`packages/ui` is the shared UI package imported as `@app/ui`.

It owns the shadcn base primitives, shared AI elements, the `cn` helper, and the
shared Tailwind token sheet exported to the editor and other apps.

## Package boundary

- Keep this package **generic and app-agnostic**. Do not import from
  `editor/app`, `editor/scaffolds`, `editor/kits`, or feature-specific editor
  state.
- Components here should be safe to use across route groups and products.
  Feature workflows, editor/workbench state bindings, and one-off product UI
  belong in the consuming app, not in `@app/ui`.
- Prefer small primitives and composable building blocks. If a component needs a
  domain model or workflow language to explain it, it probably belongs outside
  this package.

## What lives here

| path                     | role                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `src/components/`        | shadcn/base primitives and small generic components                    |
| `src/ai-elements/`       | shared AI/chat registry components and stream rendering primitives     |
| `src/hooks/`             | generic UI hooks with no editor-specific state assumptions             |
| `src/lib/utils.ts`       | shared utility exports, including `cn(...)`                            |
| `src/styles/globals.css` | shared Tailwind globals, theme tokens, and package-owned CSS variables |

## Authoring rules

- For base primitives, run `shadcn` against this package. The local registry
  config is [`components.json`](components.json).
- Use `lucide-react` icons when an icon is needed for a generic component.
- Keep styles override-friendly: expose `className`, use `cn(...)`, and avoid
  closed wrappers that consumers cannot restyle.
- Do not tune shared primitives for a single consuming surface. If a product
  needs a denser or more opinionated variant, build that variant in the product
  layer.
- Add dependencies only when they are appropriate for the whole shared package.
  Feature-only dependencies should stay with the feature.

## Choosing the right home

| if your change is...                                                 | put it in...                            |
| -------------------------------------------------------------------- | --------------------------------------- |
| a basic primitive such as button, input, dialog, popover, or tooltip | `packages/ui/src/components/`           |
| a shared AI/chat primitive or stream rendering component             | `packages/ui/src/ai-elements/`          |
| a generic styling/helper utility                                     | `packages/ui/src/lib/` or `src/styles/` |
| optimized for editor density or editor-specific interactions         | `editor/components/ui-editor/`          |
| forms-specific editor UI                                             | `editor/components/ui-forms/`           |
| a higher-level stateful widget                                       | `editor/kits/`                          |
| bound to global editor/workbench state or a feature assembly         | `editor/scaffolds/`                     |

## Imports

Consumers should import package exports instead of reaching into `src`:

- Primitives: `@app/ui/components/*`
- AI elements: `@app/ui/ai-elements/*`
- Hooks: `@app/ui/hooks/*`
- Utilities: `@app/ui/lib/*`
- Global styles: `@app/ui/globals.css`
