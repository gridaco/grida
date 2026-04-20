# Contributing to docs & docs-site itself

## Where do I begin?

- Translation - i18n support for your native language would be a great first choice.
- Documentation - Improve the documentations

## Source of truth

- Edit docs in `/docs/**`.
- Do not edit generated files in `/apps/docs/docs/**`.
- Translations live next to their source docs under a sibling `translations/` directory and are copied into Docusaurus i18n output during `pnpm content:setup`.

## Documentation taxonomy

Use this workflow when deciding whether a doc should ship:

- Ship docs that are already minimally meaningful. If the page is useful now, publish it now.
- Use `draft: true` only when the page is not yet meaningful enough to ship.
- Reserve `unlisted: true` for intentionally non-discoverable or on-demand docs. It is not the default for incomplete work.
- Use the custom frontmatter field `doc_tasks` to track follow-up work on docs that still ship.

Example:

```md
---
title: Example
description: One-line summary.
doc_tasks:
  - enhance
  - translate
format: md
---
```

`doc_tasks` values:

- `enhance` for pages that need stronger examples, screenshots, or structure
- `update` for pages that should be checked against current product behavior or UI
- `translate` for pages that should get priority locale coverage next

## Translation workflow

- Treat the main English doc in `/docs/**` as the source of truth. Translations flow from `en` to locale docs such as `ko`, `ja`, and `fr`; do not reverse-sync changes from a locale doc back into the English source by default.
- Keep the source doc publishable even before translations exist.
- Add `doc_tasks: [translate]` on the source doc when translation is still pending.
- For a page like `docs/platform/index.md`, place the Korean translation at `docs/platform/translations/ko/index.md`.
- Add `translations/meta.json` in that directory if it does not already exist.

## Validation

Before finishing docs work, run the docs site setup/build from `/apps/docs`:

```sh
pnpm content:setup
pnpm build
```

## Note for Insiders

Beaware of two configurations, next.config.js (web : root) and docusaurus.config.js (docs-site : /docs).
Deploying docs-site individually will break the web app. This is normal.

The configuration will only work for grida.co/docs and it will break on docs.grida.co/

If the docs site works fine on local build, then you can assume that it works fine also on production (only on grida.co/docs)
