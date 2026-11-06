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
Changesets invokes that pnpm publisher. Do not supply `NPM_TOKEN`,
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

See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and
[pnpm publication](https://pnpm.io/cli/publish).

## Running a release

After the code and changesets are merged, manually dispatch **Publish Packages**
from `main` in GitHub Actions and approve its `npm-publish` deployment.
The job installs Node, pnpm, and Deno, runs the existing build/test/lint and
Changesets versioning steps, then calls `scripts/publish-packages.mjs`.
Deno is needed by the Tailwind color package's generation hook.

The wrapper temporarily excludes only the CLI from Changesets publication and
restores its manifest when publication finishes or fails. Other public packages
whose local version is absent from npm are eligible for publication, including
packages with no new changeset. Confirm the intended release set before dispatch.

This workflow does not push the versioning commit or generated tags back to
GitHub. Retain those release changes through the repository's versioning process;
OIDC registration alone does not add a Changesets release-PR workflow.

## Local verification

```sh
node --test scripts/publish-packages.test.mjs
```

The tests run real Changesets against a synthetic workspace with intercepted
registry and publication commands. They prove CLI exclusion, exact manifest
restoration, OIDC propagation, isolated npm configuration, and denial of missing
OIDC credentials, other repositories or branches, and token fallback. They do
not publish packages or contact the npm registry.
