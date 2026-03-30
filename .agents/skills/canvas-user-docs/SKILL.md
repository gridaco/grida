---
name: canvas-user-docs
description: >
  Author and manage user-facing documentation for the Grida Canvas editor.
  Covers writing style, tone, product screenshots, demo state preparation,
  and content structure for pages under docs/editor/. Use when creating or
  editing canvas editor documentation, capturing screenshots of canvas
  features, or planning visual demos. Trigger phrases: "write user docs",
  "document this feature", "screenshot for docs", "canvas user guide",
  "update help page".
---

# Canvas User Docs

Guide for pages under `docs/editor/` — user-facing documentation for the
Grida Canvas editor at grida.co/docs.

**Not for:** `docs/wg/`, `docs/reference/`, forms, CLI, or architecture docs.

## Directory & Build

| Item        | Value                                                        |
| ----------- | ------------------------------------------------------------ |
| **Source**  | `docs/editor/`                                               |
| **Site**    | Docusaurus in `apps/docs/`                                   |
| **Product** | Canvas editor at `http://localhost:3000/canvas`              |
| **Build**   | `turbo build --filter=editor && turbo start --filter=editor` |

See `docs/AGENTS.md` for linking rules and MDX caveats.

## Writing

- **Direct, second-person, present-tense.** "You can resize by dragging the handle."
- **Neutral.** No hype, no marketing, no exclamation marks.
- **Concise.** One idea per sentence. Short paragraphs.
- **UI labels** in bold. Shortcuts in `<kbd>` tags. Values/filenames in backticks.
- **Links** to editor pages use universal routing: `https://grida.co/_/<path>`.
- **Add `format: md`** frontmatter unless the page uses JSX/MDX features.
- **No bare angle brackets** in prose (MDX compatibility).

### Page Structure

```markdown
---
title: Feature Name
description: One-line summary.
format: md
---

# Feature Name

Brief intro (1-2 sentences). What is it, why use it?

## How to Use / Creating a \_\_\_ / When to Use

Primary workflow or step-by-step.

## How It Differs from X (if applicable)

Comparison table.

## Nesting / Hierarchy Rules (if applicable)

## Default Appearance (if applicable)

## Keyboard Shortcuts (if applicable)
```

Headings: `##` for sections, `###` for subsections. No `####`+.

## Screenshots

| Property        | Value                                       |
| --------------- | ------------------------------------------- |
| **Output size** | 960 x 960 px (1:1)                          |
| **Format**      | WebP q90 (preferred), PNG fallback          |
| **Theme**       | Default light                               |
| **Naming**      | `<feature>-<description>.webp` (kebab-case) |
| **Location**    | Co-located with the doc or sibling `img/`   |

960x960 is the **cropped output**, not the viewport. Capture at any size,
then crop to the area of interest and resize. Crop aggressively — a single
panel or dialog is better than a full-window capture.

### Preparing Demo State

Prefer scripting over manual interaction, in this order:

1. **Fixture file.** Load a `.grida` or `.svg` from `examples/fixtures/` or `test/`.
2. **Scripting API.** `globalThis.grida` exposes the editor instance
   (via `WindowGlobalCurrentEditorProvider`). Use `javascript_tool` or console
   to create/modify nodes, set state, rename layers programmatically.
3. **URL parameters.** Playground accepts `?src=<url>`, `?backend=canvas|dom`.
4. **Manual interaction.** Fallback only.

Before capture: name layers meaningfully, deselect (<kbd>Escape</kbd>),
zoom to fit. Use realistic labels ("Login", "Dashboard") — never lorem ipsum.

### Requirements

- **Production build** (`localhost`), not dev mode
- No browser chrome, system notifications, or debug panels
- Show hover/focus states only when they're the subject

## Custom Graphics

For workflows, before/after, or relationships a screenshot can't show.

- 960 x 960 px (1:1) or 1280 x 720 px (16:9)
- WebP preferred, SVG for vector diagrams
- Annotations: red (#FF3B30) circles/arrows, 2px stroke, 1-3 callouts max

## Pre-Publish Checklist

- `title` and `description` in frontmatter
- `format: md` (unless using MDX)
- Screenshots are 960x960 WebP, cropped to subject, with alt text
- No broken links, no bare angle brackets
- Page renders: `pnpm --filter docs start`

## Pitfalls

- **Writing for yourself.** Explain what things do, not how they're implemented.
- **Screenshot overload.** One cropped shot beats three full-page captures.
- **Stale screenshots.** When updating a feature, verify screenshots match current UI.
- **Wrong doc type.** Architecture and design decisions belong in `docs/wg/`.
