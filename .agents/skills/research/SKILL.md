---
name: research
description: >
  Research upstream and peer projects to inform Grida's design and
  implementation. Use when investigating how Chromium, Skia, Servo,
  Taffy, or peer canvas editors solve a problem before writing code.
  Covers source-code exploration and research document authoring under
  docs/wg/research/.
---

# Code Research Skill

Workflow for going from "how does X work?" to a documented survey
grounded in prior art from upstream and peer projects.

## When to Use This Skill

- Investigating how a browser engine solves a rendering/layout/compositing problem
- Looking up undocumented Skia API behavior
- Understanding CSS feature semantics before adding support
- Comparing canvas editor architectures (excalidraw, tldraw)
- Writing or extending `docs/wg/research/` documents

---

## How to Orient Yourself

Before touching any external repo, check what Grida already knows.

| What you need                | How to find it                                                |
| ---------------------------- | ------------------------------------------------------------- |
| Existing research on a topic | `docs/wg/research/chromium/index.md` (topic map)              |
| Code that cites sources      | `grep "based on\|adapted from\|ported from" --include="*.rs"` |
| Vendored third-party code    | `ls third_party/`                                             |
| Feature docs for a subsystem | `ls docs/wg/feat-*/`                                          |

If already documented, cite it and move on.

---

## Reference Repositories

**Local clones (optional):** If `~/Documents/GitHub/` exists, it may contain default-style clones (sibling dirs named by repo, e.g. `skia`). Prefer searching there before cloning or using only the web.

| Repo                                                   | Lang | When to reference                                                             | Key paths                                             |
| ------------------------------------------------------ | ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| [chromium](https://github.com/chromium/chromium)       | C++  | Skia usage, compositing, layer trees, paint scheduling, tiling, GPU resources | `cc/` `third_party/blink/renderer/` `components/viz/` |
| [skia](https://github.com/google/skia)                 | C++  | Undocumented API behavior, GPU internals, filter details                      | `src/gpu/` `src/core/` `src/effects/`                 |
| [rust-skia](https://github.com/rust-skia/rust-skia)    | Rust | Rust binding ergonomics — our direct `skia-safe` dependency                   | `skia-safe/src/`                                      |
| [resvg](https://github.com/linebender/resvg)           | Rust | SVG rendering, path conversion, filter effects                                | `crates/resvg/src/` `crates/usvg/src/`                |
| [servo](https://github.com/servo/servo)                | Rust | CSS layout, DOM, Rust browser-engine patterns. We vendor its style system     | `components/style/` `components/layout/`              |
| [stylo](https://github.com/servo/stylo)                | Rust | CSS parsing and style resolution                                              | `style/`                                              |
| [taffy](https://github.com/DioxusLabs/taffy)           | Rust | Flexbox/Grid layout algorithms                                                | `src/tree/` `src/compute/` `src/style/`               |
| [excalidraw](https://github.com/excalidraw/excalidraw) | TS   | Canvas API optimization, rendering heuristics, interaction                    | `packages/excalidraw/renderer/`                       |
| [tldraw](https://github.com/tldraw/tldraw)             | TS   | CRDT state model, modular SDK, DOM/SVG canvas                                 | `packages/editor/` `packages/store/`                  |

**Searching large repos:** use https://source.chromium.org/ for Chromium. Narrow to `cc/layers/` `cc/tiles/` `cc/trees/` (compositing), `cc/paint/` (recording), `cc/scheduler/` (frame scheduling). Servo: `components/style/properties/`, `components/style/stylist.rs`, `components/layout/`. Skia: `include/core/` `include/effects/`, GPU in `src/gpu/ganesh/` (GL) or `src/gpu/graphite/` (Metal/Vulkan).

---

## The Research Workflow

1. **Frame the question.** Specific and bounded. Bad: "how does Chromium handle rendering?" Good: "how does Chromium decide which layers get their own composited surface?"
2. **Check existing knowledge** in `docs/wg/research/` and code comments before going upstream.
3. **Explore the source** with targeted searches — never read entire codebases:
   ```sh
   grep "struct LayerTreeHost"     --include="*.h"  -r cc/    # owning type
   grep "ShouldCreateRenderSurface" --include="*.cc" -r cc/   # decision points
   grep "kDefault.*Tile\|kMax.*Memory" --include="*.h" -r cc/ # design constants
   ```
4. **Extract findings:** **what** (mechanism + file path), **why** (rationale), **constants** (thresholds/heuristics).
5. **Document:**

| Scope                        | Action                                        |
| ---------------------------- | --------------------------------------------- |
| Quick answer                 | Code comment citing the source                |
| Reusable subsystem knowledge | Research doc in `docs/wg/research/<project>/` |
| Confirming existing approach | Update the relevant research doc              |

---

## Writing Research Documents

> **A research document is a pure survey of how upstream solves a problem.** It describes
> the upstream system on its own terms, in enough depth that a reader could reimplement
> the design from the doc alone. It is **not** a plan, a proposal, or a gap analysis —
> Grida should be essentially absent from these pages.

Docs live in `docs/wg/research/<project>/`. Create new subdirectories as needed (`servo/`, `skia/`).

### Stay in survey mode

Write as if Grida did not exist. The reader is someone trying to understand the upstream project — Chromium, Skia, Servo, etc. — not someone planning a Grida change. Concretely:

- **Frame in upstream terms.** "Blink resolves `clip-path` by..." (✅) — not "Blink does X, which is what we'd need..." (❌).
- **Use upstream names** for types, files, functions, constants.
- **Quote the spec, the source, the upstream commit.** Anchor every claim to a file path or spec section.
- **Compare upstream to upstream.** Chromium vs. resvg vs. Servo belongs here; Chromium vs. Grida does not.
- **Spec gotchas, magic numbers, edge cases** are on-topic — they explain the upstream design.

### Keep Grida out of the body

Forbidden in research docs:

- "Relevance to Grida" / "What we borrow" / "What we differ on" sections.
- Citations of `crates/grida/...` or any in-repo file path.
- "Plan for our implementation" / "Implementation checklist" sections.
- Sentences using "we", "our renderer", "our codebase", or "our fix" for Grida-side work.
- "This is the gap blocking N fixtures" intros, "TODO" lists, "where the fix lands" footers.

A neutral "the Rust binding for this Skia API is `skia_safe::FooBar`" is fine — it surveys the primitive. Becomes off-limits the moment the sentence ties it to Grida ("we use this at filename.rs:42").

### Required structure

1. **Title and scope** — what subsystem, what questions it answers (in upstream terms).
2. **Source references** — upstream file paths (with commit hash if volatile).
3. **Architecture description** — how the upstream subsystem works, with diagrams for pipelines.
4. **Key data structures** — important types and relationships (use upstream names).
5. **Constants and heuristics** — magic numbers and their reasoning.
6. **Cross-project comparison** (when relevant) — Chromium vs. resvg vs. Servo vs. Skia, each on its own terms.

**Conventions:** Upstream terminology. Short code excerpts (5–15 lines) with file path citations. Organize by concept, not by file. Update `index.md` when adding new docs. File names: lowercase, hyphenated, topic-descriptive.

### Review your draft before saving

Treat this as a required step — past drafts have repeatedly slipped Grida-side content into research, and it's cheapest to catch right before save:

- [ ] Search for `Grida`, `grida`, `crates/grida`, `our `, `we `, `we'd`, `we have`, `we use`. Every match must justify itself — usually by being removed.
- [ ] Skim for headings like "Relevance to ...", "What we borrow", "What we differ on", "Plan for ...", "Implementation checklist", "Where our code is wrong". Delete them.
- [ ] Check the intro and conclusion. Framed around an upstream question, or around a Grida gap? Reframe to upstream.
- [ ] Check "See also" / "References". Internal Grida paths there are a smell.
- [ ] If the doc would be useless to a reader who didn't know Grida exists, it isn't a research doc yet. Move the Grida-side content out.

If you find yourself wanting to write "and here's how this maps to our renderer", stop — that's not what a research doc is for.

---

## Pitfalls

- **Writing a Grida-flavored survey.** Most common failure mode — the brief is "research X" and the agent writes a survey ending in "here's how we should do it". Stay in survey mode.
- **Researching what's already documented.** Check `docs/wg/research/` and code comments first. The Chromium research alone is 15 documents.
- **Reading too broadly.** Arrive with a specific question, find the code path, extract the answer, leave. Use source.chromium.org.
- **Confusing Skia docs with Skia behavior.** Skia's documentation is minimal and sometimes wrong. Read the implementation.
- **Stale source references.** Reference stable concepts (struct names, enum variants) over line numbers.
- **Mixing terminologies.** Research docs: upstream terms. Code comments: Grida terms with parenthetical upstream reference.

---

## Checklist

- [ ] Framed a specific, bounded question
- [ ] Checked existing research and code comments
- [ ] Identified the right repo and narrowed to specific directories
- [ ] Extracted findings with file paths, rationale, and constants
- [ ] Wrote the research doc as a pure upstream survey — no Grida content
- [ ] **Reviewed the draft** against the [review checklist](#review-your-draft-before-saving) — searched for `Grida`, `our`, `we`; deleted any planning sections
- [ ] Updated `index.md` if a new research doc was created
