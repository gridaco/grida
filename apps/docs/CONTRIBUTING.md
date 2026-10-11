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
- Locale docs are copied into Docusaurus i18n output with the `translations/<locale>/` segment removed. Keep internal relative doc links aligned with the English source doc unless a translation intentionally changes the document structure.

## Docs from other repos (docs sources)

Some products keep their docs in their own repo, next to their code, and this
site publishes them — e.g. FX's guide at `grida.co/docs/fx`, authored in
[gridaco/fx](https://github.com/gridaco/fx). The model is
[docs sources](../../docs/wg/platform/docs-sources.md): the source repo owns
the pages and their assets; this repo owns only **which commit** is published.

- [`sources.json`](./sources.json) declares each source: repo, ref policy,
  published directories, and the asset rules.
- [`sources.lock.json`](./sources.lock.json) pins each source to a commit. It
  is the only thing this repo stores about a source — no pages, no assets.
- The build fetches each source at its pin into the generated content dir.

### Writing docs in a source repo

Your published directory (e.g. `docs/guide/`) must pass the source rules.
Your CI runs them through the reusable workflow
[`docs-source-check.yml`](../../.github/workflows/docs-source-check.yml):

```yaml
jobs:
  docs:
    uses: gridaco/grida/.github/workflows/docs-source-check.yml@main
```

| Rule       |                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Links      | Ordinary relative links that work on GitHub. A link to another published page stays a site link; any other file becomes a GitHub permalink at the published revision. |
| Assets     | Inside the published directory, next to the page that uses them (an `img/` folder beside it). Never elsewhere in the repo.                                            |
| References | Markdown syntax only: `![alt](./img/shot.png)`. Raw HTML (`<img src="…">`) is not processed by the site and may not point at a published file.                        |
| Kinds      | `png`, `jpg`, `gif`, `webp`, `svg`, `avif` — at most **500 KiB** each. Compress screenshots; prefer `svg` for diagrams.                                               |
| Video      | Never in git. Host it and link to it.                                                                                                                                 |
| Markdown   | Plain markdown as GitHub renders it — no MDX components or `{expressions}`.                                                                                           |
| History    | Never move a release tag or rewrite a tracked branch: a published pin must stay reachable.                                                                            |

Check a local tree before pushing (from `/apps/docs`):

```sh
pnpm sources:check --repo gridaco/fx --dir ../../../fx
```

### Maintaining sources (this repo)

```sh
pnpm sources:status          # wanted vs pinned ref per source
pnpm sources:sync [id]       # move pins to what each policy wants
pnpm sources:sync fx-wg --ref <sha>   # pin one source at a given ref
pnpm sources:verify          # what CI runs on PRs here
```

- **Ref policies.** `"main"` tracks a branch: a weekly workflow opens a PR
  moving the pin. A `version_of` policy follows the exact version a package
  here pins — `fx-guide` follows `@grida/fx` in `packages/grida-cli`, so a PR
  that bumps it must also run `pnpm sources:sync fx-guide` (CI fails
  otherwise).
- **Adding a source.** Declare it in `sources.json`, run
  `pnpm sources:sync <id>`, add it to [`sidebars.js`](./sidebars.js) if it
  needs a sidebar entry, and add the reusable check to the source repo's CI.
  Its pages may not take a path a page in `/docs` already has.
- **Local clones.** `DOCS_SOURCES_LOCAL="gridaco/fx=../fx" pnpm content:setup`
  (paths from the repo root) previews a source from a local clone instead of
  GitHub; `--local gridaco/fx=<dir>` does the same for the CLI.
- **Offline.** `pnpm install` fetches sources best-effort and skips them
  offline; `pnpm build` requires them.

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
