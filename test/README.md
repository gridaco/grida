# Evals — Test Case Registry

This directory contains structured test case (TC) specifications for behaviors that are difficult or impractical to cover with automated tests. These are primarily UX interactions requiring human judgment, visual verification, or complex multi-step browser interaction.

## Purpose

- **Regression tracking**: Document behaviors that have broken before and need manual verification after refactors.
- **Feature specification**: Record intended behavior and design decisions as verifiable descriptions.
- **Future test specs**: Natural-language descriptions that can guide manual QA or future automation efforts.

## What does NOT belong here

Core math, algorithmic, or low-level features should be covered by formal unit/integration tests co-located with their source code (`__tests__/`, `*.test.ts`, `cargo test`). Only add entries here when automated testing is impractical or would bloat the test suite unnecessarily.

## File naming

```
{module}-{area}-{short-description}.md
```

Examples: `canvas-resize-vector-aspect-ratio.md`, `forms-validation-conditional-fields.md`

## Frontmatter

Every file uses YAML frontmatter for machine-parseable metadata. See `_template.md` for the full schema.

Key fields:

| Field         | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `id`          | Stable unique ID: `TC-{MODULE}-{AREA}-{NNN}`                   |
| `module`      | Top-level module: `canvas`, `forms`, `database`, `editor`, ... |
| `area`        | Sub-domain within the module                                   |
| `status`      | `untested` · `verified` · `regression` · `deprecated`          |
| `severity`    | `low` · `medium` · `high` · `critical`                         |
| `automatable` | Whether this can eventually become a code test                 |
| `covered_by`  | Paths to test files if partially automated                     |

## Workflow

1. **Adding a new TC**: Copy `_template.md`, rename following the naming convention, fill in frontmatter and body.
2. **After a refactor**: Filter by module/area, manually verify TCs marked `verified` or `regression`.
3. **Promoting to code**: When a TC becomes automatable, write the test, add its path to `covered_by`, and set `status: deprecated` once fully covered.
