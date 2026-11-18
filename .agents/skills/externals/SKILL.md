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
