# Docs agent guide (`/docs`)

This directory is the **source of truth** for documentation content.

- **Source**: `/docs/**` (edit here)
- **Site build copy**: `/apps/docs/docs/**` (generated/synced during docs site build)
- **Published at**: `https://grida.co/docs`

## Actively maintained

We **only actively maintain** the following docs areas:

- `docs/wg/**` — working group docs (design notes, architecture, proposals, WIP)
- `docs/reference/**` — reference docs (glossary, specs, stable technical references)

## Everything else

Other folders under `/docs` are **not actively managed**.

- Unless you have a specific task, **avoid editing** content outside `docs/wg/**` and `docs/reference/**`.
- Do not edit generated artifacts under `/apps/docs/docs/**`.

## Structure

| directory                        | name          | description                                                            | active |
| -------------------------------- | ------------- | ---------------------------------------------------------------------- | ------ |
| [/docs/wg](./wg)                 | working group | working group documents, architecture documents, todo list, etc        | yes    |
| [/docs/reference](./reference)   | reference     | glossary and references (technical documents)                          | yes    |
| [/docs/math](./math)             | math          | Math reference, used for internal docs referencing                     | yes    |
| [/docs/platform](./platform)     | platform      | Grida Platform (API/Spec) documents                                    | yes    |
| [/docs/editor](./editor)         | editor        | Grida Editor - User Documentation                                      | yes    |
| [/docs/canvas](./canvas)         | canvas        | Grida Canvas SDK - User Documentation                                  | no     |
| [/docs/cli](./cli)               | cli           | Grida CLI - User Documentation                                         | yes    |
| [/docs/together](./together)     | together      | Contributing, Support, Community, etc                                  | yes    |
| [/docs/with-figma](./with-figma) | with-figma    | Grida with Figma - Grida &lt;-&gt; Figma compatibility and user guides | yes    |
