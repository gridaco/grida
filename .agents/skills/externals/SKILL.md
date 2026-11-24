---
name: externals
description: Coordinate upstream versions across Grida products. Use when updating a shared external or checking shipping pins for drift.
---

# External release pins

When updating a shared external, check the upstream release and each shipping consumer. Update the exact pins and their lockfiles together by default. If a surface needs a different version, record the compatibility or release reason and what will let the pins converge.

## Tracked externals

**Grida FX** ships through both Grida Desktop and the `grida` npm package. Keep both on the same published `@grida/fx` version so a project gets consistent engine and record behavior from either entry point.

- **Desktop** pin in [desktop/package.json](../../../desktop/package.json) and [desktop/pnpm-lock.yaml](../../../desktop/pnpm-lock.yaml). Verify the staged engine in the Desktop package.
- **CLI** pin in [packages/grida-cli/package.json](../../../packages/grida-cli/package.json) and the [root pnpm lockfile](../../../pnpm-lock.yaml). Follow the [CLI release procedure](../../../scripts/cli-release/README.md#grida-fx-the-one-dependency) and verify the installed `grida fx --version`.

Start from a [published FX release](https://www.npmjs.com/package/@grida/fx) with its platform artifacts available. Review any existing exact-version package-manager exceptions when changing pins.
Compare the tagged FX changelog and upstream `skills/grida-fx/SKILL.md` with
the bundled Desktop FX skill at `extensions/desktop-fx/skills/desktop-fx/SKILL.md`.
Carry over workflow changes that affect Desktop and use its `grida-fx` command
spelling.

**Grida Models** publishes the public model facts. When updating the bundled
seed, change the exact `@grida/ai-models` pin, the root lockfile, and generated
projections together. [Models source](https://github.com/gridaco/models) ·
[Seed update procedure](../../../data/ai/README.md)

Desktop refreshes supported foreground chat and BYOK image and video from
compatible Models V2 releases after installation. The exact pin keeps builds
reproducible and supplies the first-launch fallback. Changes to installed
adapters or the discovery bridge follow the [Desktop release runbook](../../../docs/contributing/desktop-release.md#verify-compatibility).
