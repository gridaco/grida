---
unlisted: true
---

# Docs agent guide (`/docs`)

This directory is the **source of truth** for documentation content.

- **Source**: `/docs/**` (edit here)
- **Site build copy**: `/apps/docs/docs/**` (generated/synced during docs site build)
- **Published at**: `https://grida.co/docs`

## Actively maintained

We **only actively maintain** the following docs areas:

- `docs/wg/**` — working group docs (design notes, architecture, proposals, WIP)
- `docs/reference/**` — reference docs (glossary, specs, stable technical references)

## SEO frontmatter

For docs SEO/frontmatter cleanup, start with the actively maintained areas:
`docs/wg/**` and `docs/reference/**`. Avoid broad repo-wide churn across
older docs sections unless the task explicitly asks for that migration.

When adding or meaningfully editing an actively maintained doc page, prefer
frontmatter with `title`, `description`, and `keywords`. For most `wg/` and
`reference/` Markdown pages that do not use MDX/JSX features, also include
`format: md` as described below.

## Everything else

Other folders under `/docs` are **not actively managed**.

- Unless you have a specific task, **avoid editing** content outside `docs/wg/**` and `docs/reference/**`.
- Do not edit generated artifacts under `/apps/docs/docs/**`.

## Universal routing (linking to editor pages)

When writing or updating **user-facing docs**, prefer **universal routing** links for any “open this page in the editor” instruction.

- **Use production URLs**: links should start with `https://grida.co`.
- **Use the universal prefix**: use `https://grida.co/_/<path>` instead of tenant-specific canonical paths.
  - Example: `https://grida.co/_/connect/channels`
- **If you add a new user-facing page** that should be linkable from docs, make sure it’s registered in **universal routing** so the `/_/…` alias resolves correctly. See `docs/wg/platform/universal-docs-routing.md`.

## Linking rules

- **Never link outside `/docs`** from docs markdown files. Links like
  `../../../crates/...` or `../../packages/...` break when docs are
  hosted on Docusaurus (only `/docs/**` is deployed). Instead, reference
  external paths as inline code: `` `crates/grida-canvas/examples/foo.rs` ``.
- Links **within `/docs`** (relative paths between docs pages) are fine.
- Links to **external URLs** (`https://...`) are fine.

## Conventions

### `_history/` directories (unlisted docs)

Use a `_history/` folder inside any docs subdirectory (e.g. `docs/wg/platform/_history/`) for **historical snapshots** and other “record only” documents that should **not** appear in Docusaurus navigation.

- Put these documents under a `_history/` folder.
- Mark them as **unlisted** via frontmatter:

```md
---
unlisted: true
---
```

## MDX compatibility

Docs are built with Docusaurus which uses **MDX** (Markdown + JSX). MDX reserves `<` and `>` for JSX tags, so bare angle brackets in prose or tables will break the build.

**Preferred fix — `format: md` frontmatter:**

For files that don't use JSX/MDX features (most `wg/` and `reference/` docs), opt out of MDX entirely by adding `format: md` to the frontmatter:

```md
---
format: md
---
```

This prevents all MDX-related parsing issues for the entire file.

**Per-occurrence alternatives** (when a file does use MDX features):

| Technique          | Example       | Notes                          |
| ------------------ | ------------- | ------------------------------ |
| Backtick code span | `` `C < A` `` | Best for code/math expressions |
| Backslash escape   | `C \< A`      | MDX-native escape              |
| HTML entity        | `C &lt; A`    | Works but hurts readability    |

**Common pitfalls:**

- Comparison operators in tables: `C < A`, `> 80%`, `<100 nodes`
- Angle-bracketed URLs: `<https://example.com>` — use `[text](url)` or bare URL instead
- Generic type syntax: `Array<string>` — wrap in backticks

## Structure

| directory                        | name          | description                                                            | active |
| -------------------------------- | ------------- | ---------------------------------------------------------------------- | ------ |
| [/docs/wg](./wg)                 | working group | working group documents, architecture documents, todo list, etc        | yes    |
| [/docs/wg/format](./wg/format)   | format        | Grida IR spec and CSS/HTML/SVG import mapping trackers                 | yes    |
| [/docs/reference](./reference)   | reference     | glossary and references (technical documents)                          | yes    |
| [/docs/math](./math)             | math          | Math reference, used for internal docs referencing                     | yes    |
| [/docs/platform](./platform)     | platform      | Grida Platform (API/Spec) documents                                    | yes    |
| [/docs/editor](./editor)         | editor        | Grida Editor - User Documentation                                      | yes    |
| [/docs/forms](./forms)           | forms         | Grida Forms - User Documentation                                       | yes    |
| [/docs/canvas](./canvas)         | canvas        | Grida Canvas SDK - User Documentation                                  | no     |
| [/docs/cli](./cli)               | cli           | Grida CLI - User Documentation                                         | yes    |
| [/docs/together](./together)     | together      | Contributing, Support, Community, etc                                  | yes    |
| [/docs/with-figma](./with-figma) | with-figma    | Grida with Figma - Grida &lt;-&gt; Figma compatibility and user guides | yes    |
