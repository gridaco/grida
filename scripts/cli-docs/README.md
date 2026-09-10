# CLI documentation check

The root `docs/cli` guides are the user documentation. This check reads their
actual shell examples and named text/JSON inputs; there is no copied example
registry or generated prose.

```sh
pnpm --filter grida... build
pnpm --filter docs build
node --import tsx --test scripts/cli-docs/check.test.mjs
node --test apps/docs/scripts/docs-site-gen/copy-translations.test.cjs
node --import tsx scripts/cli-docs/check.mjs
```

Use Node 24 and its bundled npm. The check packs a candidate with the shared
release preparer, or accepts `--archive /absolute/candidate.tgz`. It installs
offline with scripts and optional dependencies disabled in an owned temporary
directory. All temporary installation, home and example files are removed.

The check verifies:

- Every actual help topic maps to a non-draft, non-retired built CLI guide;
  public pages have unique emitted routes and matching canonical URLs.
- Relative guide links and anchors resolve in built docs. Repository links
  point to existing files. External sites are not contacted.
- Root and translated landing articles emit links to the canonical CLI guide;
  a working sidebar cannot mask a stale `.md` link in the article.
- The candidate's help and docs URLs match current source, with an empty home,
  scrubbed environment, and the existing installed-CLI offline network guard.
- Every ordinary `sh` fence parses with the real CLI grammar. Generation and
  inspection examples resolve a real operation; candidate schemas match source
  schemas. Generation inputs pass real file lowering and SDK validation.

The checker supplies the existing checkerboard PNG for `reference.png` and the
illustrative preceding `image/output-1.png`. It reads `prompt.txt` and
`request.json` directly from titled guide fences. These are deterministic input
checks, not inference or provider acceptance tests. Auth/configuration commands
are parsed only and never dispatched. No real provider, account, billing,
credential store, keyring, or browser is used. The existing installed media
proof owns synthetic execution and saving behavior.

Author ordinary `sh` fences with one literal Grida invocation per logical line;
backslash continuation and shell quotes are supported. Shell expansion, pipes,
redirection, and arbitrary shell evaluation are rejected. Only the exact
`npm install -g grida@next` setup block is marked `grida-setup` and exempted; the
checker never runs that command. Named `text`/`json` fences are copied literally
into each guide's temporary directory.
If a workflow needs additional shell orchestration, explain it separately and
keep its Grida commands in ordinary checked fences.

The workflow runs on relevant code/docs changes, including docs-only PRs, and
is callable by release CI with an `archive_artifact` input. Publication checks
remain a release responsibility; local HTML success does not prove deployment.
Broader pre-existing docs warnings are not promoted to failures by this check.
