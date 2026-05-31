---
title: Skills and Project Instructions
description: Two layers of knowledge an agent reaches for beyond its tools. Skills (lazy, advertise-then-load, agent picks when relevant) and project instructions (eager, unconditional, the floor every session stands on).
keywords:
  [
    agent-system,
    skills,
    project-instructions,
    agents-md,
    claude-md,
    system-prompt,
    discovery,
    manifest,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Skills and Project Instructions

Two distinct layers of knowledge an agent reaches for at session
start:

- **Project instructions** are _unconditional_. They go straight into
  the system prompt; the agent always sees them.
- **Skills** are _conditional_. Names and one-line descriptions go
  into the system prompt; the body loads on demand via the locked
  `skill` tool.

Both are discovered once per session. Both lay on top of the system
prompt the agent declares in its manifest. They differ in **when** the
body lands in context.

| Layer                | Body in system prompt               | When discovered       | When loaded                        |
| -------------------- | ----------------------------------- | --------------------- | ---------------------------------- |
| Project instructions | Yes — eagerly, on every turn        | Once at session start | Always                             |
| Skills               | No — only the index (name + 1-line) | Once at session start | When the model calls `skill(name)` |

## Project instructions

A **project instruction file** is a Markdown body the user commits to
the repository at a well-known path. Conventional names:

- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`

Implementors MUST pick at least one of these as the canonical name
and honor it across their hosts. Hosts SHOULD honor all three for
interoperability.

### Discovery

Walk **upward** from the workspace root collecting every instruction
file. Concatenate them, **nearest-last** so the closest file has
the final word. A user-level instruction file (e.g.
`~/.agents/AGENTS.md`) is the outermost layer; the project root's is
the innermost.

The concatenated result is injected into the system prompt at the
position defined by [`session / system prompt assembly`](./session.md#system-prompt-assembly).

### Why eager

Project instructions are **unconditional knowledge** — "this repo
uses pnpm, not npm"; "the test command is `just test`." Making the
model re-discover this on every relevant
turn is a tax on every turn. Bake it in once.

Skills, by contrast, are _conditional_ — "load this when authoring
SVG documentation." Loading every skill on every turn would inflate
the system prompt for material the model usually does not need.

### Size discipline

Project instructions are intended to be a few hundred lines, not a
few thousand. Long-form recipes belong in skills. An implementor
MAY apply a hard cap (recommended: **8k tokens** total across all
instruction files for a session) and route overflow to a warning;
the model still sees the truncated head.

### Compaction interaction

Project instructions are part of the **system prompt**, not the
conversation. Compaction ([`session / compaction`](./session.md#compaction))
MUST NOT touch them. They count toward the model's context window
as overhead the agent cannot reclaim.

## Skills

A **skill** is a self-contained Markdown body with YAML frontmatter
(name + description, optional metadata). It encodes a recipe, a
contract, a domain pattern — the kind of long instruction set that
inflates a system prompt if pasted in.

### Manifest

```md
---
name: <kebab-case>
description: One sentence. The model reads this to decide whether to load.
---

# <Skill body>

…long-form instructions, examples, file pointers, tables…
```

The frontmatter `description` is the only thing the model sees up
front. It MUST answer **"when should the model use this skill?"** in
one line. A vague description (`"helpful for writing"`) is invisible.
A specific one (`"author user-facing docs for the canvas editor"`)
gives the model a clear hook.

The body is free-form Markdown. It MAY include:

- Step-by-step recipes.
- Table of conventions.
- Pointers to specific files in the project.
- Examples (good and bad).
- References to other skills (`[[name]]` is a common convention).

### Discovery sources

Skills are discovered at session start from a layered set of sources,
walked in order. First definition wins on name collision; duplicates
log a warning and are skipped.

| Order | Source                                | Notes                                                                                               |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | Project-scoped: walk upward from root | `.agents/skills/`, `.claude/skills/` — the nearest definition wins.                                 |
| 2     | User-scoped                           | `~/.agents/skills/`, `~/.claude/skills/`.                                                           |
| 3     | Host-bundled                          | Built-in skills the host ships.                                                                     |
| 4     | Config-declared paths                 | `skills.paths[]` in host or project config. Useful for shared team skills outside the project tree. |
| 5     | Remote URLs                           | `skills.urls[]` — fetched at session start, cached locally, refreshed on a version bump.            |

### Static index per session

Discovery happens **once**, at session creation. The skill index is
static for the session's lifetime. A skill added to disk
mid-session is invisible until the next session.

This is deliberate: a dynamic skill index would race with the running
stream, and the model would see a moving target between turns.

### How the model reaches them

The system prompt includes a section like:

```text
You have access to the following skills. Load any when relevant.

- canvas-docs-svg-kit: Author SVG figures for canvas user docs.
- canvas-user-docs: Write user-facing documentation for the canvas editor.
- code-react: React-specific code shape.
- ee-billing: Surface workflow for billing.
- …
```

The model calls the `skill` tool when it picks one:

```ts
skill({ name: "canvas-docs-svg-kit" }) → { content: "<full SKILL.md body>" }
```

The body lands as a tool output in the conversation. The model reads
it on the next turn.

The body MUST be wrapped in a stable marker so the model can tell
the skill content apart from surrounding tool output. The de-facto
shape is an XML-ish tag:

```text
<skill_content name="canvas-docs-svg-kit">
…full SKILL.md body…
</skill_content>
```

The textual marker is canonical here for the same reason
[`editor-context`](./compositor.md#editor-context) uses one — skill
bodies have no provider-native equivalent, and a stable discriminator
keeps the loaded body unambiguous to the model. The exact tag SHOULD
be stable for portability; implementors MAY substitute the wrapping
syntax as long as the persisted tool-output shape stays conformant.

### Skill body lifecycle

A loaded skill body **stays in context** for the rest of the
conversation. It contributes to the token rollup; it participates
in compaction; rewind can soft-hide it.

**Hot-reload semantics.** Calling `skill(name)` twice in the same
session returns the cached first load. A force-refresh requires a
new session.

### Skill vs system prompt vs MCP

The decision matrix:

| Goal                                                      | Right surface                 |
| --------------------------------------------------------- | ----------------------------- |
| Every agent on this host should know this                 | System prompt                 |
| The model should learn this **only when needed**          | Skill                         |
| A new callable capability that should always be reachable | Locked or agent-specific tool |
| A discoverable tool from an external server               | MCP                           |
| A floor every session in this project stands on           | Project instruction file      |

The boundary cases:

- "Always callable + domain-specific + small" → ship as an
  agent-specific tool.
- "Sometimes callable + long prose + deletable without breaking
  the agent" → it's a skill.
- "Always referenced but never executed" → it's a project
  instruction.

## Implementor checklist

A conforming implementation MUST:

- Discover project instructions before skills, on every session
  start.
- Discover skills from at least the project-scoped and user-scoped
  paths.
- Treat the skill index as static for the session's lifetime.
- Inject only the skill **descriptions** into the system prompt at
  start — never bodies.
- Load the body only when the model calls `skill(name)`.
- Cache loaded skill bodies for the session.
- Emit a warning (not a fatal error) on duplicate skill names; the
  first source wins.

## What this guide does not specify

- **Skill marketplaces.** A registry of named skills is a host-level
  product. The discovery layer accepts URLs; what populates them is
  out of scope.
- **Skill versioning.** A future `name: foo@1.2.3` convention is
  attractive but unnecessary until the first real collision.
  Implementors MAY add a version field; the contract does not require
  it.
- **Hot-reload mid-session.** Out of scope. A new skill requires a
  new session.

## See also

- [Foundations](./foundations.md) — the locked `skill` tool that
  loads bodies.
- [Tools](./tools.md) — the `skill` tool's contract.
- [MCP](./mcp.md) — the sibling lazy-discovery layer for external
  tools.
- [Binary file handling](./binary.md) — the skill-per-format
  convention applied to binary attachments (pdf / zip / pptx / psd / fig / …).
- [Session Lifecycle](./session.md) — how skill bodies count toward
  the context window and interact with compaction.
