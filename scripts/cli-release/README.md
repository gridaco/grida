# CLI package preparation and release

For maintainers preparing the independently installed `grida` executable.
Publication requires deployed account access, public documentation and release
configuration. These scripts do not provision services or change the package's
release metadata.

The web server's [OAuth deployment reference](../../editor/lib/auth/README.md)
owns the required environment variables, registration alignment, secret rotation
and hosted verification. Supabase registration and green CI do not activate
those settings in an existing Vercel deployment.

## Local candidate

Use Node 24 and its bundled npm. Build before packing; choose a new absolute
output directory whose parent already exists.

```sh
pnpm turbo run build --filter=grida...
pnpm turbo run typecheck test --filter=grida...
node --test scripts/cli-release/prepare.test.mjs
node scripts/cli-release/prepare.mjs --out "$PWD/.cache/cli-candidate"
node scripts/cli-release/prepare.mjs --verify --out "$PWD/.cache/cli-candidate"
node scripts/cli-media-local/proof.mjs --archive "$PWD/.cache/cli-candidate/grida-0.1.0.tgz"
```

Use the actual archive name from `candidate.json` after a version change. The
output includes the archive SHA-256 and exact packed file list. Preparation
copies only the bundled executable, package manifest, README, third-party
notices and repository license into an isolated directory. Review the notice
inventory whenever bundled dependencies change. npm runs offline with empty configuration,
no ambient credentials and no lifecycle scripts. Verification reads the archive
without extraction, checks its hash and file boundary, and compares the packed
manifest with the checked-out revision. An existing output directory is refused.

The [installed media proof](../cli-media-local/README.md) installs that exact
archive with optional dependencies omitted and exercises independent processes
using synthetic providers and an owned local API. It proves operation without
the optional keyring binding; the native-auth CI separately exercises custody
and a disposable macOS keyring entry. Neither substitutes for hosted registration
or real provider acceptance testing.

## Independent release ownership

The existing [workspace publisher](../../.github/workflows/publish-packages.yml)
is configured to release npm packages through Changesets and token authentication. The
CLI follows its manual trigger, repository Node version and frozen pnpm install
pattern, with a dedicated package artifact and trusted publishing identity.

CLI publication uses npm Trusted Publishing through GitHub Actions OIDC only.
The existing token flow is historical precedent, not the authentication pattern
to copy. Do not configure `NPM_TOKEN`, `NODE_AUTH_TOKEN` or a token fallback for
CLI releases. Fix a failed trusted-publisher configuration before publishing.

The CLI is excluded from Changesets version planning by `ignore`. That setting
does not control `changeset publish`: it can still publish an ignored public
package. The repository's `pnpm publish-packages` command therefore uses an
explicit [publisher wrapper](../publish-packages.mjs) to mark only the CLI private
while Changesets runs, then restore its exact manifest bytes. A failed child also
restores the manifest; an uncatchable interruption can leave it private, preventing
publication. Use this repository command instead of invoking Changesets publication
directly. The wrapper leaves other packages' publication and the existing
private-package Git tagging policy unchanged; those tags do not authorize a CLI
npm release. Its regression runs the installed Changesets CLI against a synthetic
workspace with inert npm/pnpm/git commands, including an unwrapped positive control.

The CLI version is reviewed explicitly in its manifest; `0.0.0` and
`private: true` cannot pass the release guard. `cli-release.yml` does not edit
the version or remove `private: true`; publication requires a reviewed manifest.

`cli-verify.yml` checks the packed CLI on Linux and macOS and retains one Linux
candidate. `cli-docs.yml` checks guides, examples and installed help. Both run on
relevant PRs without production credentials. API and local OAuth workflows own
their respective server and issuer proofs.

`cli-release.yml` is a manual, main-only operation. It runs package, docs, API and
local OAuth checks at the selected revision, then downloads and verifies the
same candidate for publication. It does not rebuild between verification and
publish. Reuse the `npm-publish` GitHub environment and its existing reviewer
and branch protections. Its shared allowlist includes main and canary; the CLI's
guard independently restricts this workflow to main. Define
`CLI_NPM_RELEASE_ENABLED=true` only once release readiness has been reviewed.
Keep that variable disabled when readiness is unknown. The workflow itself also
refuses a missing or false value. The maintainer dispatches the release and
approves the environment's deployment gate. A sole maintainer must keep
self-review prevention disabled when relying on their own approval. See
[GitHub environment protections](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Before the first release, establish the final workflow filename on the default
branch. A self-contained, non-publishing `workflow_dispatch` workflow can do this
before the release implementation and its reusable workflows land. It needs no
checkout, npm command, secret or OIDC permission. Replace its body with the
verified release implementation later, keeping the filename stable. GitHub
requires the default-branch workflow for [manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
Saving npm's publisher configuration does not validate that configuration or
prove a publish will succeed; no placeholder package release is needed.

Configure the npm package's trusted publisher for `gridaco/grida`, workflow file
`cli-release.yml`, environment `npm-publish`, with permission to run `npm publish`.
Use GitHub-hosted runners, Node 24 and npm 11.5.1 or newer. Publication uses OIDC
and provenance; do not add a persistent npm token. New trusted publishers may
default to staged publication only, so direct publishing must be explicitly
allowed in npm. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [provenance](https://docs.npmjs.com/generating-provenance-statements/).

Stable releases use the `latest` distribution tag, the workflow's default.
The standalone CLI's first stable version is `0.1.0`, installed with
`npm install -g grida`. Prereleases use `next` and cannot replace
`latest`. Review the existing package's versions and tags before
choosing a version; an old package name does not imply an empty release history.
Successful CI is a prerequisite, not evidence that docs, OAuth or API changes
have been deployed. Verify those separately before approving publication.

## Recovery

Stop new publication by disabling the release environment. Identify the last
verified compatible version before moving a distribution tag back to it;
deprecate an affected version with a clear migration instruction when necessary.
Both are registry mutations requiring maintainer authorization. Do not default
to unpublishing or silently removing the old API: already installed clients
remain in use. Ship a corrective version and retain compatible server behavior.
See the [installed-client policy](https://grida.co/docs/wg/cli/v1#installed-client-compatibility).
