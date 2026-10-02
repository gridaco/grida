# CLI documentation check

The root `docs/cli` guides are the user documentation. This check reads their
actual shell examples and named text/JSON inputs; there is no copied example
registry or generated prose.

```sh
pnpm --filter docs build
node --test scripts/cli-docs/check.test.mjs
node --test apps/docs/scripts/docs-site-gen/copy-translations.test.cjs
node scripts/cli-docs/check.mjs
```

Use Node 24 and its bundled npm. The default check
builds the Rust executable and prepares a host-only test candidate. Release CI
passes `--native-candidate /absolute/candidate-directory` to consume the exact
single archive containing the eight platform executables from the native build
matrix. The package is installed offline, without lifecycle scripts, in an owned
temporary directory. The checker removes the installation and example files.

The checker builds the current feature-only `grida-conformance` executable.
Its documentation modes expose the production topic table and call the current
Rust grammar, file lowering, and input-schema validation without dispatching a
command. No historical TypeScript CLI checkout or SDK build is needed.
Installed help, docs routes and model descriptors come from the actual native
package and must match the current source.

The check verifies:

- Every actual help topic maps to a non-draft, non-retired built CLI guide;
  public pages have unique emitted routes and matching canonical URLs.
- Relative guide links and anchors resolve in built docs. Repository links
  point to existing files. External sites are not contacted.
- Root and translated landing articles emit links to the canonical CLI guide;
  a working sidebar cannot mask a stale `.md` link in the article.
- The candidate's help and docs URLs match current source, with an empty home,
  scrubbed environment, and an OS network perimeter: macOS Seatbelt or Linux
  network namespaces. A native executable cannot be constrained by a Node preload.
  Linux CI sets `GRIDA_CLI_DOCS_SUDO_NETWORK=1` to use noninteractive sudo only
  for each read-only native child inside the empty network namespace, with an
  explicit scrubbed environment. Builds, npm installation, the checker and
  credential tests remain unprivileged. Local runs can use unprivileged user
  namespaces where the system permits them.
- Every ordinary `sh` fence parses with the real CLI grammar. Generation and
  inspection examples resolve a real operation; candidate schemas match source
  schemas. Generation inputs pass real file lowering and SDK validation.
- The validation driver and installed executable share the same OS network
  perimeter and empty home. Generation examples never reserve output directories
  or request credentials. Named input files are required; stdin examples need an
  explicit fixture before they can be added to checked shell fences.

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
`npm install -g grida` setup block is marked `grida-setup` and exempted; the
checker never runs that command. Named `text`/`json` fences are copied literally
into each guide's temporary directory.
If a workflow needs additional shell orchestration, explain it separately and
keep its Grida commands in ordinary checked fences.

The workflow runs on relevant code/docs changes, including docs-only PRs, and
is callable by release CI with a `native_candidate_artifact` input. Publication checks
remain a release responsibility; local HTML success does not prove deployment.
Broader pre-existing docs warnings are not promoted to failures by this check.
