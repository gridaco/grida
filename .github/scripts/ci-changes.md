# Rust and CLI CI selection

[`ci-changes.mjs`](ci-changes.mjs) selects expensive jobs from their inputs.
The dedicated workflows start on every PR so their final checks can report a
successful intentional skip. General package CI keeps its existing JavaScript
build, typecheck, lint and test coverage, but excludes the `grida` package from
all three Turbo task invocations. Its uncached tasks run Cargo; dedicated Rust
CI now owns that work.

## Input inventory

| Group         | Work and inputs                                                                                                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rust`        | Three-platform formatting, Clippy, workspace tests and build. Consumes `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.cargo/**`, `crates/**`, shared auth fixtures and the checker PNG used by the conformance executable.                                                                                                   |
| `conformance` | Linux/macOS Rust and TypeScript contracts, keyring interoperability, generated AI assets, installed npm behavior and guides. Adds the five shared SDK packages (`ai`, `ai-models`, `auth`, `account`, `home`), `data/ai/**`, `.oxfmtrc.jsonc`, root Turbo configuration, CLI contract helpers, documentation and packaging inputs. |
| `native`      | All eight target builds, ABI/license checks, exact bundled candidate and installed platform matrix. Consumes Cargo inputs, `packages/grida-cli/**`, release helpers, `scripts/cli-contracts/installed.mjs`, npm helpers, `LICENSE`, `.gitattributes` and `.nvmrc`. This workflow does not install the pnpm workspace or run Turbo. |
| `docs`        | Builds Docusaurus, the Rust parser and a host candidate; checks installed help, links and example inputs offline. Consumes Cargo, packaging, `docs/**`, `apps/docs/**`, CLI docs helpers and `fixtures/images/checker.png`. The existing `editor/next.config.ts` routing trigger is retained.                                      |
| `tooling`     | Tests independent package publication and native release guards. Consumes packaging inputs, npm/publisher helpers, Changesets configuration and JavaScript installation configuration.                                                                                                                                             |

Auth fixtures include `packages/grida-auth/fixtures/account-v1/custody.json`
and `providers-v1/*.toml`, consumed directly by Rust tests. The checker PNG is
read by the Rust conformance driver and documentation examples. Shared AI
authoring data and SDK projections require contract verification even though
production Rust embeds the generated copies under `crates/grida-ai/data/`.

The separate Local OAuth proof retains its cross-product auth/editor paths.
The Machine API boundary workflow intentionally remains unconditional.

## Representative changes

| Change                                                       | Before                                                                                             | After                                                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary editor UI or `apps/api` source                      | Dedicated matrices skipped, but general package build/typecheck/test invoked uncached Cargo tasks. | General JavaScript checks run without those Cargo tasks; dedicated Rust/CLI work skips.                                                                                          |
| App package manifest without a lockfile change               | General package CI invoked Cargo; an editor manifest also selected Local OAuth proof.              | General package CI excludes Cargo. Existing editor dependency/auth coverage remains.                                                                                             |
| App dependency bump with `pnpm-lock.yaml`                    | Selected broad Rust/CLI verification, including native delivery.                                   | Conservatively runs conformance, docs and publication tooling; skips the standalone Rust matrix and full native delivery matrix. These conformance/docs jobs still compile Rust. |
| Root `turbo.json`                                            | Selected Rust and native delivery through broad workflow filters.                                  | Runs conformance and Local OAuth proof, which use Turbo to build SDK consumers; native delivery skips.                                                                           |
| Shared SDK or AI data                                        | Broad Rust/CLI matrices.                                                                           | Shared contract checks run; native delivery waits for a changed native input, such as generated Cargo assets.                                                                    |
| Cargo source/configuration, CLI launcher or native packaging | Full native verification for most inputs; `.cargo/**` had gaps.                                    | Relevant Rust/CLI jobs run, including the complete native delivery matrix.                                                                                                       |
| CLI guides, docs build tooling or checker/auth fixtures      | Coverage depended on separate, incomplete workflow path lists.                                     | Their owning contract/docs/Rust checks run, including newly covered consumed fixtures.                                                                                           |

## Conservative boundaries

The selector deliberately does not implement a second pnpm dependency resolver.
Any root `package.json`, lockfile, workspace configuration or `.npmrc` change
selects the JavaScript-consuming conformance, docs and publication jobs. An
app-only lockfile update can therefore still compile the host CLI. Native
delivery has no pnpm dependency graph, so these files alone do not select it.

The complete Cargo tree remains one unit, including crate tests and docs. The
complete documentation tree remains one unit because Docusaurus builds it and
CLI guide links can depend on other pages. Any CI workflow or selector change
selects all groups. Unclassified root configuration, fixtures and tooling also
select all groups; known unrelated product trees do not. When adding a consumed
input or SDK dependency, update the classifier, this inventory and its tests.

## Comparisons, releases and required checks

PR selection uses the cumulative three-dot diff between the event's base and
head commits. Push selection uses `before..after`. Checkout fetches full history;
Git emits NUL-separated names with rename detection disabled, so both the old
and new paths of a rename are considered and deletions remain visible. Missing
commits, malformed event data, unsupported events and failed comparisons select
all groups. An unavailable comparison is never treated as an empty change.

Manual runs select all groups. Reusable calls default their explicit full-run
input to true, preserving release verification even though a reusable workflow
inherits its caller's event name. The native delivery workflow remains complete
whenever selected, and the release workflow keeps its existing gates.

The stable checks intended for branch protection are **Rust verification**,
**CLI package verification**, and **CLI documentation verification**. Their
`always()` summaries require successful change selection and successful results
from every selected job. Only an explicitly unselected job may be skipped;
failures, cancellations and unexpected skips cannot produce a successful gate.
Configure branch protection to require these summaries rather than individual
conditionally skipped matrix jobs.

Run the selection and gate regression tests with:

```sh
node --test .github/scripts/ci-changes.test.mjs
```
