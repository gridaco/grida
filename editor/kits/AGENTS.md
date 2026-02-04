# `editor/kits`

`/editor/kits` is a collection of **opinionated, state-rich UI modules** that are:

- **Stateful internally**: a kit manages its own local state, effects, and UI behavior.
- **Stateless for the consumer**: the consuming page/scaffold should not need to understand or rewire the kit’s internal state graph.
- **Reusable across the app**: any part of the editor can import and use a kit.

Kits are “bigger than components”, but “smaller / less app-coupled than scaffolds”.

## Kits vs Components vs Scaffolds

Use this mental model when deciding where code belongs:

| layer         | what it is                      | state                            | customization                 | can be used anywhere? | examples                        |
| ------------- | ------------------------------- | -------------------------------- | ----------------------------- | --------------------- | ------------------------------- |
| `components/` | primitives + small reusable UI  | little/no domain state           | high (props-first)            | yes                   | buttons, inputs, popovers       |
| `kits/`       | opinionated feature-ish widgets | **local state inside the kit**   | medium (supported knobs only) | **yes**               | rich text editor kit            |
| `scaffolds/`  | app-feature assemblies          | **binds to global/editor state** | low/feature-specific          | no (feature-scoped)   | editor blocks, workbench panels |

Rule of thumb:

- If it’s a **primitive building block**, put it in `components/`.
- If it’s a **ready-to-use widget** that needs internal state but should be easy to drop in anywhere, put it in `kits/`.
- If it **depends on global editor/workbench state**, it belongs in `scaffolds/` (or a feature folder under `app/`).

## Hard constraints (please follow)

- **No global state coupling**: kits must not require app-global stores (e.g. editor/workbench state) to function.
  - Passing data in/out via props is fine (`value`, `onChange`, callbacks).
  - Importing types from shared domains is fine; importing global state hooks is not.
- **Avoid Next.js route coupling**: a kit should not import from route segments under `app/` (e.g. `app/(workbench)/...`) or depend on route-only modules.
- **Bounded public API**: expose a small, stable API from the kit’s `index.ts`. Hide internals (subcomponents, implementation hooks, etc.) unless they’re meant to be used externally.
- **Opinionated by design**: do not add “escape hatch” props unless there is a clear, repeated need. Prefer a few supported variants over full customization.
- **No side effects without an injection point**: if a kit needs I/O (uploads, fetches, analytics), prefer passing a function in via props (dependency injection) instead of hardcoding endpoints.

## Expected kit structure

Kits are typically self-contained in a folder:

```txt
kits/<kit-name>/
  README.md               # required: what/why/how (+ provenance if forked)
  index.ts                # public exports (recommended)
  components/             # optional: good practice when the kit grows
  ...                     # implementation files/folders as needed
```

General conventions:

- `index.ts` re-exports the intended public surface.
- Styles are imported by the kit entry component (`import "./styles/index.css";`) rather than leaking via global app CSS.

## Kits in this directory

| kit              | description                                      | entry                   |
| ---------------- | ------------------------------------------------ | ----------------------- |
| `minimal-tiptap` | Opinionated rich-text editor kit (Tiptap-based). | `@/kits/minimal-tiptap` |

## API design guidelines

Kits should feel like “drop-in components”:

- **Prefer controlled patterns**:
  - `value?: T`
  - `onChange?: (value: T) => void`
  - Provide sane defaults when `value` is omitted (uncontrolled mode) if it’s useful.
- **Expose only the knobs you can support**:
  - e.g. `disabled`, `placeholder`, `autofocus`, `className`, small variant flags.
  - If consumers want arbitrary rendering overrides, that’s usually a `components/` concern.
- **Be explicit about output types**:
  - If output can be `"html" | "json"`, type it and document it.
- **Keep types portable**:
  - Avoid leaking deep dependency types unless the dependency is part of the kit’s contract.

## Common pitfalls

- Turning a kit into a scaffold by accident (importing global editor state hooks, relying on page context, etc.).
- Exporting too many internals from `index.ts` (locks you into supporting them forever).
- Adding “custom render props” everywhere (kits are not meant to be fully composable frameworks).
- Shipping global CSS unintentionally (keep CSS imports local to the kit entrypoint).

## When you modify or add a kit

Checklist:

- Keep changes **contained** to the kit folder unless there is a strong reason.
- Ensure the kit is usable from multiple places (no workbench-only assumptions).
- `README.md` is **required** for every kit; keep it updated (especially for forks/sync notes and API decisions).
- If you add non-trivial logic, consider adding a small `*.test.ts` near the kit (or colocated where the logic lives).
