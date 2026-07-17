---
name: links
description: >
  Write any link or URL so it resolves where it is rendered, not where
  it lives in the repo. Use when authoring or editing a link — in docs,
  source docstrings, READMEs (incl. npm-published), or product UI: docs
  cross-refs, "see SECURITY.md", universal `/_/` routes, GitHub URLs.
---

# Links

A link is correct or broken **at the surface it is rendered on**, for
**that surface's audience** — not where the text lives in the repo. The
same path string is valid in one host and dead in another. This skill
is the single source of truth for which form to use; `docs/AGENTS.md`
defers here.

## Before you write any link, answer three questions

1. **Where is this text rendered/hosted?** (the surface)
2. **Who is the audience there?**
3. **When they click, where does it resolve _from that host_ — and is
   that the thing you meant?**

Question 3 is the one that must not break. Everything below is just the
answer table.

## Surfaces (where text is rendered)

| Surface                                 | Lives in                                  | Audience             |
| --------------------------------------- | ----------------------------------------- | -------------------- |
| Docs site (Docusaurus, `grida.co/docs`) | `docs/**`                                 | users / contributors |
| GitHub (repo browse)                    | source files, repo-root `*.md`            | developers           |
| npm (`npmjs.com`)                       | published `packages/*/README.md`          | package users        |
| Product UI (`grida.co` app)             | `editor/app/**` strings/components        | product users        |
| Raw / no host                           | IDE, stack trace, pasted, compiled output | whoever has it       |

## Decision table (rendered host → target → form)

| Rendered in               | Target                           | Use                                                                                                         |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Docs site                 | another docs page                | **relative within `/docs`**                                                                                 |
| Docs site                 | repo path outside `/docs`        | **absolute GitHub URL**                                                                                     |
| Docs site / Product UI    | the product / dashboard / editor | **universal route**                                                                                         |
| Source code               | a docs page                      | **hosted docs URL**                                                                                         |
| Source code               | another source file              | **relative repo path**                                                                                      |
| npm README                | anything in-repo                 | **absolute** (GitHub URL or `grida.co`)                                                                     |
| Product UI                | a docs page                      | **hosted docs URL** (or universal route)                                                                    |
| Repo-root `*.md` (GitHub) | docs / source                    | relative works on GitHub but lands on raw `.md`; use the **hosted docs URL** when you mean the rendered doc |
| Any                       | external                         | `https://…` as-is                                                                                           |

## Grida URLs

The only first-party hosts. Build every absolute link from these — if a
link should be first-party but isn't one of these, it is wrong.

| URL                                  | What                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://grida.co`                   | Main website (marketing / product root)                                                                                                                |
| `https://grida.co/docs`              | Docs site (Docusaurus). `docs/<path>.md` → `https://grida.co/docs/<path>` (drop the `docs/` prefix and the extension)                                  |
| `https://grida.co/_/<path>`          | Universal route — resolves to the tenant path `/:org/:project/...` at runtime                                                                          |
| `https://github.com/gridaco`         | The GitHub org                                                                                                                                         |
| `https://github.com/gridaco/grida`   | This repo. File → `…/gridaco/grida/blob/main/<path>`; dir → `…/gridaco/grida/tree/main/<path>`                                                         |
| `https://github.com/gridaco/nothing` | **The engine repo** (crates/, format/, engine docs/wg clusters, engine fixtures). File → `…/blob/main/<path>`; dir → `…/tree/main/<path>`; `main` only |

Decision row for engine targets: **any grida surface → an engine-repo path →
absolute** `https://github.com/gridaco/nothing/blob|tree/main/<path>`. Never
relative (different repo), never `grida.co/docs/wg/<engine-cluster>/…` —
**the docs site no longer publishes the engine wg clusters** (canvas, format,
research, feat-2d/svg/css/paragraph/text-editing/…). A redirect shim keeps
_old_ published URLs alive; do not author _new_ links through a redirect.

## The forms (exact)

**Universal route** — any "open this in the product" link.
`https://grida.co/_/<path>` (e.g. `/_/dash`, `/_/connect/share`). A
stable shorthand resolved at runtime to the tenant path
`/:org/:project/...`. Never hardcode `/:org/:project/...`. Defined in
`docs/wg/platform/universal-docs-routing.md`; register new user-facing
pages there so the `/_/` alias resolves.

**Hosted docs URL** — source code / product UI / npm → a docs page.
`https://grida.co/docs/<path>` where `<path>` drops the `docs/` prefix
and the extension: `docs/wg/platform/billing/ai-credits.md` →
`https://grida.co/docs/wg/platform/billing/ai-credits`. Not a relative
`../../docs/...`. Why: it points at the canonical rendered doc and
survives file moves, paste, and stack traces. (New convention —
existing source uses relative links; migrate opportunistically, do not
churn.)

**Absolute GitHub URL** — docs site / npm → a repo path outside the
deployable root. File: `https://github.com/gridaco/grida/blob/main/<path>`.
Directory: `https://github.com/gridaco/grida/tree/main/<path>`. Always
`main`; never pin a commit or other branch SHA — the reader must land
on current `main`. (A file URL requires `/blob/main/`; there is no
shorter valid form.)

**Relative** — only within the same host. Docs→docs relative within
`/docs`; source→source relative repo path. Correct precisely because it
resolves in that host.

## Hard rules

- **Never link outside `/docs` from a docs page with a relative path.**
  Only `/docs/**` is deployed; `../../crates/...` 404s on the site — and
  `crates/` now lives in gridaco/nothing, so such a link is wrong twice. Use
  the absolute GitHub URL of the owning repo. (Supersedes any older "use
  inline code" guidance.)
- **npm-published package READMEs** (`packages/*` with
  `"private": false`): every in-repo reference must be absolute —
  relative paths die on `npmjs.com`.
- **Cross-host `#fragment`:** GitHub and Docusaurus slugify headings
  differently. When the link crosses render hosts, link the page/file,
  not a guessed anchor. Use a fragment only if you can verify it in the
  _target host's_ slug scheme.
- **Do not link from shipped docs to a `draft: true`, unpublished, or
  `unlisted` page** — the target will not resolve on the site.
- **Never target generated or synced trees** (`apps/docs/docs/**`,
  `docs/@designto-code/**`). Link the `docs/**` source or its hosted
  URL.
- **Source-code docstrings → docs:** use the hosted docs URL. A
  relative `../../docs/...` resolves on GitHub but lands on raw
  markdown and rots when the file moves.
- **No local-only references — clean them before commit.** While
  working you will reference things that exist only on your machine:
  absolute machine paths (`/Users/...`, `~/...`), `/tmp` and scratch
  dirs, untracked or gitignored files, prior local research,
  `~/.claude/plans/...`. They resolve to **nothing** for anyone else
  and leak into docstrings, docs, comments, and PR text far more often
  than you'd expect. Before commit, delete them or replace with a
  committed path / public URL. Verify: if `git ls-files` /
  `git check-ignore` shows the target isn't tracked and it isn't a
  public URL, it does not exist for the audience. This is correctness,
  not hygiene.

## The pass (apply to every link you write or touch)

1. Name the **render host** (where this text is shown).
2. Name the **target's** canonical host.
3. Same host → relative is fine. Crossing hosts → use the target's
   canonical absolute form: `grida.co/docs/...` (a doc),
   `grida.co/_/...` (the product), or
   `github.com/gridaco/grida/blob/main/...` (a repo file).
4. No commit/branch SHA pins — `main` only.
5. No cross-host fragment guesses.
6. Target is actually published (not `draft`/`unlisted`, not a
   generated/synced copy).
7. **Pre-commit gate:** no local-only/untracked target — the referent
   exists for the audience, not just on your machine.
