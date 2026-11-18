---
name: releasing
description: Plan, prepare, or verify releases of the Grida CLI and Grida Desktop, including upstream FX dependencies and version alignment.
---

# Releasing Grida

Keep the npm `grida` CLI and Grida Desktop on the same version by default. An urgent release for one product may advance its patch version independently. Keep the same major and minor versions. When the two next ship together, use a common version higher than both published versions. Check the published npm version and Desktop GitHub tag when choosing a version. FX has its own version. Use [externals](../externals/SKILL.md) for shared dependency pins.

## Release order

1. **Start from published FX.** If a new FX version is needed, release it before changing Grida's pin. The FX repository owns its version checks, dry run, and approved tag release. Its workflow publishes the platform engines before the npm SDK, then publishes the PyPI wheels. Verify that the exact npm SDK and platform packages are available before adopting them in Grida. The FX tag also supplies the template source archive. Follow the [FX release runbook](https://github.com/gridaco/fx/blob/main/RELEASING.md).
2. **Prepare one reviewed Grida revision.** When adopting FX, update both exact pins and lockfiles together and sync the `fx-guide` source to the CLI's pinned FX tag. For a joint release, update the [Desktop manifest](../../../desktop/package.json) and [CLI npm manifest](../../../packages/grida-cli/package.json) to the common version. Keep the [CLI crate](../../../crates/grida-cli/Cargo.toml), [Cargo lockfile](../../../Cargo.lock), and generated notices aligned. Verify the installed CLI's `grida fx --version` and the staged Desktop engine on supported targets. Check [Desktop renderer compatibility](../desktop/SKILL.md#release-impact-and-versioning) when the hosted UI changes alongside the native app. See the [docs source rules](../../../apps/docs/AGENTS.md#docs-from-other-repos-docs-sources).
3. **Ship the CLI and Desktop through their own workflows.** A CLI version change on `main` starts the npm release workflow, which publishes the exact tested candidate after the `npm-publish` approval. Desktop publication starts with a manual dispatch from `main`. The approved builds produce installers and assemble a GitHub draft. Review the draft before publishing and verify the downloads and update feed afterward. Both workflows can use the same reviewed revision. See the [CLI release runbook](../../../scripts/cli-release/README.md#release-ownership) and the [Desktop release runbook](../../../docs/contributing/desktop-release.md).
