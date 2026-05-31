---
name: grounding
description: >
  Establish what is actually true and current for the surface you are
  about to change — not just search. Grounding = locate the
  authoritative source and reconcile sources that disagree (code vs doc,
  migration vs schema, memory vs current code, live vs archived), not
  take the first hit. Use before any grep/find/explore of the codebase
  or docs, when deciding which of several definitions is the real one,
  or when a doc or memory conflicts with the code. Covers the
  source-of-truth hierarchy, reconciliation discipline, scoped ripgrep,
  and the docs/tags.yml + docsearch.py index.
---

# Grounding

Grounding is establishing what is **actually true and current for the
surface you are about to change**, then acting on that — not on a guess,
a memory, or the first grep hit. The hard part is not search; it is
picking the **authoritative** source and **reconciling** sources that
disagree.

> Intentional seed. This holds only Grida-specific facts that are not
> obvious from `CLAUDE.md`/`AGENTS.md`. Grow it from real, discovered
> specifics (concept→file anchors that bite repeatedly, conflicts that
> actually happened and how they resolved). Do not pad it with generic
> search advice a competent agent already knows.

## Source of truth (scoped to the surface)

Authority is per-surface — the engine model and its TS mirror can each
be right for their own surface and still disagree. Name the surface,
then trust:

- **Canvas render/node model** → Rust engine `crates/grida/src/`
  (`node/schema.rs`). The TS mirror `editor/grida-canvas/` is
  authoritative for _editor behavior_ and can lag the engine.
- **DB schema** → `supabase/migrations/` (applied, immutable);
  `supabase/schemas/*.sql` is a readable projection that can lag — use
  the **database** skill.
- **Directory contract** → the nearest `AGENTS.md`/`README.md`.
- **"I remember API X…"** → re-read current code; a memory is a claim
  about a _past_ state, verify before acting.

Disagreement → decide which wins _and why_ (`git log -1` recency, what
the running entrypoint imports, what tests assert); don't average;
surface a material conflict to the user. **Never authoritative even when
they match:** `docs/_history/`,
`docs/@designto-code/` (synced — truth is upstream), `docs/cli/`
(deprecated), `.ref/`, vendored `third_party/`.

## Dead-tree traps

Some directories are git-tracked but dead — a bare `rg` from repo root
returns obsolete hits that look like confirmation: `docs/_history/`,
`.ref/`, vendored `third_party/`. (The legacy editor trees `.legacy/`
and `packages/.legacy/` were retired May 2026; recover via the
`archive/do-not-delete-legacy-retired-pr759` tag.) `rg` already skips gitignored build dirs
(`node_modules/`, `target/`, `.next/`, …); don't waste flags there.
Scope positively, or exclude the dead trees:

```sh
rg PATTERN editor/grida-canvas crates/grida/src packages
rg PATTERN -g '!**/third_party/**' -g '!**/docs/_history/**'
```

## Grounding the docs

~360 markdown files; only `docs/wg/**` and `docs/reference/**` (plus the
user-facing trees in `docs/AGENTS.md`) are maintained. `docs/tags.yml`
is the controlled vocabulary; `tags:` frontmatter is the navigation
signal. Use the index, don't grep bodies — `scripts/docsearch.py` reads
frontmatter only, self-installs via `uv`, runs from any cwd:

```sh
S=.agents/skills/grounding/scripts/docsearch.py
uv run $S tags                          # vocabulary + usage counts + drift
uv run $S find --tag canvas --tag svg   # AND (--any=OR); + --has K --field K=V
uv run $S show wg/feat-svg/pattern.md   # one file's frontmatter only
```

Before trusting a doc over code: `draft: true` = proposal not built yet
(intent ahead); `doc_tasks:` or stale `git log -1` = likely behind.

## Related skills

`database` (DB source-of-truth), `research` (upstream/peer projects),
`naming` (where new things belong).
