# `editor/components`

`/editor/components` contains **reusable UI building blocks**.

The intended shape of this directory is:

- **Unopinionated**: primitives with a clear role; avoid app-feature coupling.
- **Reusable anywhere**: components should be safe to use across routes/features.
- **Override-friendly**: default styles should look good, but consumers must be able to override easily (typically via `className`, composition, and prop-driven variants).

If you find yourself adding heavy state machines, feature workflows, or global/editor state bindings, it likely belongs in `kits/` or `scaffolds/` instead.

## Hard constraints (please follow)

- **No route coupling**: do not import from specific Next.js route segments under `app/` (e.g. `app/(workbench)/...`).
- **Avoid global state coupling**: prefer props and local state; do not require editor/workbench global stores just to render.
- **Composable styling**: prefer `className` + the merge helper `cn(...)` (imported from `@app/ui/lib/utils`) and avoid “closed” styling that can’t be overridden.
- **Small surface area**: keep components narrowly-scoped; split when a component becomes a mini-feature.
- **No new directories by default**: do not create new folders under `components/` unless explicitly required. This tree is intentionally curated by project maintainers, and everything here should remain broadly reusable.

## Base primitives live in `@app/ui` (not here)

The shadcn **base primitive set** and the **AI elements** were promoted out of this
directory into the `@app/ui` workspace package (`packages/ui`). Import them — do not
re-add them here:

- Primitives: `@app/ui/components/*` (e.g. `@app/ui/components/button`)
- AI elements: `@app/ui/ai-elements/*`
- `cn` helper: `@app/ui/lib/utils`
- Shared theme/tokens: `@app/ui/globals.css` (owned by the package)

To add or update a base primitive, run `shadcn` against the **package** (`packages/ui`
has its own `components.json`), not the editor. See `packages/ui` for details.

## Directory map (highlighted)

The directories below are what remains **in `editor/components`** — editor-local
primitive sets that build _on top of_ `@app/ui`:

| directory               | role                                                                               | opinionation | notes                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `components/ui-editor/` | Editor-leaning primitives (generally more condensed/special) for editor-ish UI/UX. | medium       | A parallel set to `@app/ui` when the editor needs different density/interaction defaults. |
| `components/ui-forms/`  | Forms-specific UI primitives.                                                      | medium       | Opinionated toward predictable forms behavior/UX.                                         |
| `components/ui2/`       | Preview-only UI primitives for the visual builder.                                 | medium       | Dedicated to preview constraints; e.g. relative-position overlays/dialog mechanics.       |

## How to choose where a component goes

| if your component is…                                                      | put it in…                                 |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| a basic primitive (button, input, popover, dialog, etc.)                   | `@app/ui` (`shadcn add` → `packages/ui`)   |
| an AI / chat registry primitive                                            | `@app/ui/ai-elements` (add to the package) |
| a primitive but optimized for editor density / special editor interactions | `components/ui-editor/`                    |
| a primitive meant for forms-specific UX                                    | `components/ui-forms/`                     |
| a primitive that must work inside preview/embedded rendering constraints   | `components/ui2/`                          |
| a higher-level widget with internal state but used broadly                 | `kits/`                                    |
| bound to global editor/workbench state, or a feature assembly              | `scaffolds/`                               |

## Authoring guidelines

- **Prefer “headless + styling” patterns** where reasonable (composition beats configuration).
- **Expose `className` on outer wrappers** and important slots when consumers need to restyle.
- **Keep defaults beautiful** but don’t prevent consumer overrides.
- **Document provenance** for imported modules (registry/forks) in a local `README.md` when relevant.
