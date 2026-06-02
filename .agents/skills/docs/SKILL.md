---
name: docs
description: >
  Decide which family a doc belongs to before drafting — SDK/developer,
  user/product, or working-group (WG) — since family sets the audience,
  home, and tone. Use when creating, moving, or restructuring docs, when
  unsure which directory a doc belongs in, or when a request says
  "document this" / "write docs for X" without naming the kind. Routes to
  the specialized skill for each family.
---

# Docs

Documentation in Grida is not one thing. Before drafting, name the
**family** — because the family decides the audience, the home directory,
the tone, and which skill governs the rest. Writing the right content in
the wrong family (a spec dump in a user guide, a marketing tone in an
RFC) is the most common and most expensive docs mistake, because it is
invisible until someone reads it for the wrong reason.

`/docs/**` is the source of truth, synced to `/apps/docs/docs/**` at
build and published at `grida.co/docs`. Edit the root `/docs`, never the
synced copy. The operational rules that apply to _every_ family —
taxonomy (`draft` / `unlisted` / `doc_tasks`), frontmatter, MDX safety
(`format: md`), `_history/`, the structure table — live in
[`docs/AGENTS.md`](../../../docs/AGENTS.md). Read it once; this skill does
not repeat it.

## The three families

| Family                      | Audience                                                       | Home                                                                            | Character                                              | Governing skill                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SDK / developer**         | engineers (and, implicitly, agents) consuming a package or API | `packages/<pkg>/docs/` for spec-only; `docs/reference/**` for stable references | technical, example-dense, low-visual, precise          | this skill (below)                                                                                                                                                                                                                                                     |
| **User / product**          | humans using a Grida product                                   | `docs/editor/**`, `docs/forms/**`, `docs/platform/**`, `docs/with-figma/**`, …  | content-rich, screenshots, SEO-friendly, task-oriented | canvas editor (`docs/editor/`) → [`docs-canvas`](../docs-canvas/SKILL.md); cross-cutting → [`seo`](../seo/SKILL.md) + [`docs-svg-kit`](../docs-svg-kit/SKILL.md); other surfaces have no dedicated skill yet — use [`docs/AGENTS.md`](../../../docs/AGENTS.md) + `seo` |
| **WG / research / RFC-RFD** | contributors and maintainers reasoning about _why_ and _what_  | `docs/wg/**`                                                                    | spec-rich, language-agnostic, code-agnostic, factual   | [`docs-wg`](../docs-wg/SKILL.md)                                                                                                                                                                                                                                       |

If the request fits one family cleanly, hand off to its governing skill
and stop reading here. The rest of this page covers the routing edges and
the SDK family (which has no skill of its own).

## Routing — which family is this?

Ask, in order:

1. **Is it about _why_ a thing is designed the way it is, or _what_ a
   feature/spec should be — independent of any one implementation?**
   → WG. Go to [`docs-wg`](../docs-wg/SKILL.md).
2. **Is the reader a person trying to _use_ a shipped product?**
   → User docs. Content-rich and SEO-aware. For the canvas editor
   (`docs/editor/`) use [`docs-canvas`](../docs-canvas/SKILL.md); for
   other surfaces (forms, platform, with-figma) there is no dedicated
   skill yet — follow [`docs/AGENTS.md`](../../../docs/AGENTS.md) and
   [`seo`](../seo/SKILL.md). [`docs-svg-kit`](../docs-svg-kit/SKILL.md)
   covers SVG figures for any of them.
3. **Is the reader an engineer (or agent) trying to _consume_ a package
   or API correctly?** → SDK docs (below).

The boundaries are real, not bureaucratic:

- **Architecture / design rationale never goes in user docs.** It belongs
  in WG. ([`docs-canvas`](../docs-canvas/SKILL.md) enforces the
  same boundary from its side.)
- **A WG doc is not an SDK doc.** WG says "this is what the feature is and
  why"; SDK says "this is the API and how to call it." A WG doc that
  drifts into API signatures has become an SDK doc in the wrong place —
  see [`docs-wg`](../docs-wg/SKILL.md) on staying code-agnostic.
- **Plans, TODO lists, and conversational logs are not docs of any
  family.** Plans live in untracked `*.plan.md` files (gitignored); they
  do not belong under `docs/`.

## SDK / developer docs

SDK docs explain how to consume a package or API. They optimize for an
engineer (and, without ever saying so, for an agent) who needs to get a
call right on the first try.

**Where they live:**

- **`packages/<pkg>/docs/`** — when the docs are spec-heavy and not
  visually rich. Co-locating with the package keeps the contract next to
  the code it describes and versioned with it. (Precedent:
  `packages/grida-svg-editor/docs/`.) A package's `README.md` and
  `AGENTS.md` are the entry points; `docs/` holds the deeper material.
- **`docs/reference/**`** — for stable, cross-package technical
references, glossaries, and specs that deserve a place on the published
site. This tree is actively maintained alongside `docs/wg/\*\*`.

**What good SDK docs look like:**

- **Example-dense.** Every non-trivial API earns a short, runnable
  example. Examples carry more than prose for a consumer.
- **Technical and precise** about types, contracts, and edge cases —
  light on screenshots and marketing.
- **Good for agents by being good, period.** Do not write "for AI" — a
  clear, complete, example-backed reference is what an agent needs and
  what a human needs. The two goals do not diverge.
- **Honest about stability.** Mark experimental surfaces; an SDK doc that
  oversells a shaky API costs its readers time.

## Related skills

[`docs-wg`](../docs-wg/SKILL.md) (WG authoring doctrine),
[`docs-canvas`](../docs-canvas/SKILL.md) (canvas/editor user docs),
[`seo`](../seo/SKILL.md) (frontmatter + search),
[`links`](../links/SKILL.md) (how to write any link),
[`grounding`](../grounding/SKILL.md) (find/reconcile the authoritative
doc before editing). Operational taxonomy and frontmatter:
[`docs/AGENTS.md`](../../../docs/AGENTS.md).
