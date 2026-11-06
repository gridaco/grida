# Workspace npm publication

This guide is for maintainers configuring and publishing the public JavaScript
workspace packages. The `grida` CLI has its own
[release workflow and publisher](cli-release/README.md).

## Trusted publisher registration

For each public package, open its settings on npmjs.com and add a GitHub Actions
trusted publisher with these values:

| Field                | Value                                 |
| -------------------- | ------------------------------------- |
| Organization or user | `gridaco`                             |
| Repository           | `grida`                               |
| Workflow filename    | `publish-packages.yml`                |
| Environment          | `npm-publish`                         |
| Allowed actions      | Direct publication with `npm publish` |

The environment field must match the workflow. The existing GitHub
`npm-publish` environment requires maintainer approval; the workflow and
publisher additionally restrict this release path to `main`. Retain the
environment's reviewer and deployment-branch protections.

The shared publisher uses the repository's pinned pnpm 11.5.2, which exchanges
the GitHub Actions OIDC identity for a short-lived token for each package.
The wrapper invokes pnpm directly for one selected workspace package. Do not supply `NPM_TOKEN`,
`NODE_AUTH_TOKEN`, or `NPM_ID_TOKEN`: the wrapper rejects them and isolates user
and global npm configuration rather than using saved credentials.

The current public workspace packages, excluding the independently published
CLI, are:

- `@grida/cmath`
- `@grida/color`
- `@grida/history`
- `@grida/hud`
- `@grida/keybinding`
- `@grida/number-input`
- `@grida/pixel-grid`
- `@grida/refig`
- `@grida/ruler`
- `@grida/svg`
- `@grida/svg-editor`
- `@grida/tailwindcss-colors`
- `@grida/text-editor`
- `@grida/transparency-grid`
- `@grida/tree-view`
- `@grida/vn`
- `dotcanvas`

Register newly public packages before including them in a release. Registration
is per package; configuring `grida` or one scoped package does not authorize
the others. Keep `grida` bound to `cli-release.yml` through its independent
release setup.

npm initially marks new connections **Pending validation** and displays a
deadline for the first OIDC publication (48 hours when this setup was checked).
Registration alone does not validate publication. Coordinate registration with
the intended release, and check each package's displayed status and deadline.

See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and
[pnpm publication](https://pnpm.io/cli/publish).

## Preparing a release

Use Changesets to prepare package versions and changelogs in a release PR.
Commit the version changes, consumed changesets, and any dependency updates
before publishing. For a partial release, keep deferred packages' versions and
changesets unchanged. Review the generated diff, then merge it to `main`.

Versioning and publication are separate operations. The publication workflow
does not run `changeset version`, change manifests, or create version commits.
The independently published `grida` CLI is rejected by this entrypoint.

For the Tailwind color package, palette generation is a development step. Commit
and test the generated data before the release PR; publishing does not regenerate
it from floating upstream dependencies.

## Running a release

Open [Publish Packages](https://github.com/gridaco/grida/actions/workflows/publish-packages.yml),
select **Run workflow**, and choose `main`. Enter the exact public workspace
package name and the stable version already recorded in its manifest. For this
release, use `@grida/tailwindcss-colors` and `4.0.2`.

The equivalent CLI command is:

```sh
gh workflow run publish-packages.yml --repo gridaco/grida --ref main \
  -f package=@grida/tailwindcss-colors -f version=4.0.2
```

Approve the run's `npm-publish` deployment. The job validates the workspace
package and exact version, rejects an existing release tag, builds and tests the
selected package and its dependencies, and publishes only that package to npm's
`latest` tag through OIDC. An empty selection or version mismatch fails; other
public packages are not published or changed.

After successful publication, a separate job records a lightweight
`<package>@<version>` Git tag at the workflow's tested commit. Only that job has
repository write permission; it cannot overwrite an existing tag. Confirm the
npm version, provenance, and Trusted Publisher validation after the run.

If publication succeeds but recording the Git tag fails, rerun the failed tag
job. It accepts an existing tag at the same commit. Do not rerun successful
publication or move a release tag to another commit; npm versions are immutable.

## Local verification

```sh
node --test scripts/publish-packages.test.mjs .github/scripts/npm-release-tag.test.cjs
```

The publisher tests intercept subprocesses in synthetic workspaces. They prove
exact package/version selection, CLI exclusion, unchanged manifests, OIDC
propagation, isolated npm configuration, and denial of invalid authority or token
fallback. Tag tests use a fake GitHub client to check creation and safe retries.
They do not publish packages or contact npm or GitHub.
