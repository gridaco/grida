# Writing Skills for Grida

Skills provide focused, loadable context that AI coding agents pull in on demand. Think of them as topic-specific playbooks -- too detailed to live in `AGENTS.md`, but essential when the task calls for them.

## Should This Be a Skill?

A skill makes sense when the content is:

- **Deep** -- multi-step workflows, code templates, diagnostic checklists that would bloat `AGENTS.md`
- **Situational** -- only useful for a subset of tasks, not something every session touches
- **Standalone** -- coherent on its own without requiring the rest of `AGENTS.md` for context

If it's a short rule that applies universally, keep it in `AGENTS.md`. If it's a bare fact with no actionable steps, it probably belongs in a doc, not a skill.

## Directory Layout

Each skill lives in its own folder under `.agents/skills/`:

```
.agents/skills/
├── example-skill/
│   ├── SKILL.md            # Entry point (required)
│   ├── workflow.md          # Supplementary detail
│   └── pitfalls.md          # Supplementary detail
├── another-skill/
│   └── SKILL.md
└── README.md                # You are here
```

A skill folder must contain at least a `SKILL.md`. Additional files are optional -- use them to break up large skills while keeping the entry point scannable.

## Anatomy of SKILL.md

Every `SKILL.md` starts with YAML frontmatter:

```yaml
---
name: example-skill
description: >
  Performance optimization for the Grida Canvas Rust engine (cg crate).
  Covers benchmarking, profiling, compositing, caching, culling, and
  frame budgeting. Relevant files: optimization.md, bench_camera.
---
```

### Frontmatter Fields

| Field         | Required | Description                                                                                                    |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `name`        | Yes      | Short, hyphenated identifier used for referencing and invocation (e.g. `cg-perf`, `canvas-wasm`)               |
| `description` | Yes      | What the skill covers and when to activate it. **This is how agents decide whether to load the skill.** (below) |

Your agent runtime may support additional fields (e.g. `allowed-tools`, `context`, `model`). Check its documentation for what's available.

### Writing Effective Descriptions

The `description` drives auto-activation -- it's what agents match against. Include:

- The topic and scope
- When to activate (the trigger scenario)
- Key filenames, crate names, or module paths involved
- Domain terms a developer would use when asking about this topic

```yaml
# Weak -- too broad, matches everything and nothing
description: Helps with performance.

# Strong -- specific scope, named files, concrete trigger terms
description: >
  Performance optimization for the Grida Canvas Rust engine (cg crate).
  Covers benchmarking, profiling, compositing, caching, culling, and
  frame budgeting. Relevant files: optimization.md, bench_camera.
```

## How to Write Good Skill Content

### Keep It Actionable

A skill should tell the agent what to **do**, not just what to **know**. Prefer:

- Opening with "Use this when..." to set scope
- Step-by-step procedures over prose explanations
- Concrete commands and code snippets over abstract guidance
- Verification steps at the end (e.g. `cargo test -p cg`, `turbo typecheck`)
- Links to related skills when they exist

### Complement, Don't Repeat

`AGENTS.md` is the always-on baseline -- project structure, conventions, common commands. Skills go deeper on a specific topic. If a rule already exists in `AGENTS.md`, don't restate it; expand on it with the detailed workflow.

You can reference skills from `AGENTS.md` using `$skill-name` notation to create a clear trail from high-level rule to detailed procedure.

### Naming Conventions

- Short and descriptive: `cg-perf`, `form-validation`, `tenant-routing`
- Hyphenated, lowercase
- No `grida-` prefix -- the skill is already scoped to this repo

### Splitting Large Skills

When a single `SKILL.md` gets unwieldy, extract detail into sibling files and link to them:

```
example-skill/
├── SKILL.md              # Overview, quick-start commands, table of contents
├── workflow.md            # Full verification workflow
└── pitfalls.md            # Documented failure modes
```

`SKILL.md` stays as the entry point -- keep it scannable so the agent can orient quickly, then follow links for depth.
