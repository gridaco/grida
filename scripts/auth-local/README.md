# Local OAuth auth fixture

> **GRIDA-SEC-011** — local provisioning and fixture isolation are bound by
> [SECURITY.md](../../SECURITY.md).
> **GRIDA-SEC-006 / GRIDA-GG: token** — GG access uses fresh fixture signing
> authority and a memory-only scoped grant.

This developer harness runs Grida's OAuth proof against a disposable local
Supabase project. It requires Node.js 24, Git, a running local Docker engine, and
the Supabase CLI **2.116.0** release bundle. It does not use a Supabase account or
hosted project.

## Release bundle

Download the archive for your platform and `checksums.txt` from the official
[Supabase CLI 2.116.0 release](https://github.com/supabase/cli/releases/tag/v2.116.0).
Verify the archive's SHA-256 before extracting it into a dedicated tools directory.
Keep `supabase` and `supabase-go` together. Do not replace the globally installed
CLI to run this fixture.

| Archive                                | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `supabase_2.116.0_darwin_arm64.tar.gz` | `8b750455d7b02c989cec0c6c26599d28b0aefcbeedf20a315bb1d5215a185a83` |
| `supabase_2.116.0_linux_amd64.tar.gz`  | `5b3031cb297d51b25be4c284e4c852254460ec722ec221d3b81b07d55acfd158` |

The harness checks both executables' versions inside the disposable home, then
uses the normal `supabase` executable for the TOML configuration and PostgreSQL
15 lifecycle. Once running, it checks the actual Docker Auth image and health
version against **2.196.0**, the database image against major **15**, and the OAuth
discovery and server settings against the fixture configuration. A mismatched
local image or cached version override fails the run.

## Start and bootstrap

Run from the repository root, supplying absolute filesystem paths. Docker Desktop
commonly exposes a socket under the user's `.docker/run` directory; Linux commonly
uses `/var/run/docker.sock`. Select the local engine's socket explicitly.

```sh
node scripts/auth-local/stack.mjs prepare \
  --supabase-bin /absolute/path/to/release/supabase \
  --docker-socket /absolute/path/to/docker.sock
```

`prepare` returns JSON with `statePath`, `workdir`, `setupPath`, `editorEnvPath`,
and `publicClientPath`. Use the returned absolute `statePath` in subsequent
commands. Preparation copies the current contents of Git-tracked migrations and
seed, recording their hashes. It performs no Docker or Supabase API requests.

```sh
node scripts/auth-local/stack.mjs start --state /absolute/fixture/fixture.json
node scripts/auth-local/stack.mjs bootstrap --state /absolute/fixture/fixture.json
node scripts/auth-local/stack.mjs inspect --state /absolute/fixture/fixture.json
```

`start` downloads missing public container images through Docker, applies the full
repository migration history and seed, and starts only the fixture project.
Storage stays enabled because Grida's migrations use its baseline schema.
Realtime, image transformation, edge runtime, analytics, and the database pooler
are disabled or excluded.

`bootstrap` registers one public OAuth client through the fixture's local Auth
admin API, with `token_endpoint_auth_method=none`, authorization-code and
refresh-token grants, and both exact callback URLs below. Dynamic client
registration is disabled. Repeating bootstrap reuses that fixture's client and
writes fresh editor settings; restart the fixture editor after repeating it.

| Surface                         | Local address                     |
| ------------------------------- | --------------------------------- |
| Project ID                      | `grida_auth_test`                 |
| Grida editor                    | `http://127.0.0.1:3041`           |
| Supabase API                    | `http://127.0.0.1:55431`          |
| PostgreSQL                      | `127.0.0.1:55432`                 |
| Studio                          | `http://127.0.0.1:55433`          |
| Mailpit                         | `http://127.0.0.1:55434`          |
| Native callback, first session  | `http://127.0.0.1:55435/callback` |
| Native callback, second session | `http://127.0.0.1:55436/callback` |

The fixture also reserves ports 55430 and 55437–55439. Start fails if any fixture
port, container, volume, or another fixture's ownership lock is already in use.
It does not stop or reset an existing stack.

## Private outputs and integration

The OS temporary directory contains a fresh `grida-auth-test-*` directory with
mode `0700`. Outputs have mode `0600`:

- `fixture.json`: validated paths, versions, lifecycle phase, and copied-source
  hashes. `readState(path)` is exported from `stack.mjs` for the editor launcher.
- `public-client.json`: `{clientId, issuer, apiOrigin, redirectUris}` for the native
  auth producer. It contains no OAuth client secret.
- `setup.json`: fixture API keys, seeded test credentials, and an `editorEnv`
  object for the isolated editor launcher. These are local fixture credentials.
- `editor.env`: the same editor settings for tools that explicitly consume an env
  file. Do not copy it into the repository or source it into a normal shell.
- `commands.log`: subprocess output with token, key, password, and database URL
  redaction. Normal command output reports safe status and paths only.

The editor environment includes the local Supabase URL and keys, insiders auth,
the exact loopback `GRIDA_API_ORIGIN`,
the allowed OAuth client ID, fixed callback allowlist, editor origin, and fresh
independent 32-byte consent and GG signing secrets. `GG_TOKEN_SECRET` is generated
by bootstrap and stored only with the private fixture settings; it is never
inherited from the ordinary environment. Repeating bootstrap rotates those
fixture secrets and requires restarting the editor. No Upstash or provider
credential is supplied. The seed accounts are `insider@grida.co`,
`alice@acme.com`, and `random@example.com`, with password `password`; their
organization membership comes from the repository seed.

CLI subprocesses receive a constructed environment with a private home, Docker
config, explicit Unix socket, and telemetry opt-out. Inherited tokens, hosted
project references, proxies, Docker contexts, and Node preload hooks are omitted.
The fixture copies neither the repository's Supabase configuration nor its
`.temp`, `.env`, or linked-project metadata. It refuses linked metadata and dotenv
files along its own ancestor path before invoking the CLI. HTTP bootstrap and
inspection requests use the fixed loopback origin and never follow redirects.

## Editor and browser proof

Install repository dependencies and build shared packages before launching the
editor. These are the same package artifacts the browser proof consumes:

```sh
pnpm install --frozen-lockfile
pnpm turbo build --filter='./packages/*'
editor/node_modules/.bin/playwright install chromium
```

With the fixture bootstrapped, start its editor in one terminal:

```sh
node scripts/auth-local/editor.mjs --state /absolute/fixture/fixture.json
```

The launcher snapshots editor sources into the ignored `.cache/auth-local`
directory, excludes env files and generated output, and gives Next.js a private
home and build directory. It loads only the fixture editor settings. Node fetch
and TCP guards catch accidental non-loopback connections; they are not an OS
network sandbox. The proof separately restricts browser traffic to the exact
editor, API, and callback origins. Google Fonts use local test CSS, and telemetry
is disabled.

Run the proof from another terminal after the editor reports ready:

```sh
GRIDA_AUTH_TEST_STATE=/absolute/fixture/fixture.json \
  editor/node_modules/.bin/playwright test --config editor/playwright.auth.config.ts
```

To use an existing compatible Chromium executable, also set
`GRIDA_AUTH_TEST_BROWSER_EXECUTABLE` to its absolute path; otherwise Playwright uses
its installed browser. The dedicated configuration does not load env files or
start a fallback dev server. It disables traces, videos, and screenshots because
this test handles credentials.

This launcher uses Next.js development mode. In the installed Next.js 16.2.6,
`BaseServer.pipeImpl` deliberately replaces page Cache-Control with
`no-cache, must-revalidate`; the browser proof asserts that development header.
Consent remains `force-dynamic` with configured `no-store`, and the production
dynamic cache-control helper includes `no-store` for `revalidate: 0`. Verify the
actual hosted HTML response before deployment. The proof still requires actual
`no-store` on identity JSON and consent decision responses; development behavior
does not weaken those checks.

The consumer proof has passed against the real local Auth 2.196.0 and Grida
endpoints. It verifies browser sign-in, denial and reused consent, one-use codes,
bearer credential rejection, independent native sessions, rotating refresh,
seeded `local`/`acme` organization RLS, and the distinct effects of session-local
logout, application-grant revocation, and account-wide logout.

The account check calls the package's public
`auth.requestAccount("organizations.list", { after })` operation through Grida's
HTTP API. Two native users see their own seeded organizations. The fixture's
setup authority temporarily adds a non-owner Alice membership in `local`, then
removes only that new membership; the same native credential immediately sees
both changes. Seeded owner memberships remain intact. This exercises current
PostgreSQL RLS, unlike the separate synthetic production request-pipeline proof.

The same proof reads cached credits through the auth package and the independent
`@grida/account` client. Sole/name/ID selection and multiple-membership errors are
exercised before the server rechecks membership. A removed member receives no
credits with the same credential. Existing fixture setup RPCs link synthetic
billing identifiers and seed cache values; no billing provider is contacted.
Unprovisioned/unobserved credit data remains distinct from observed zero, and the
existing gate floor and entitlement flag are preserved. Cache snapshots before
and after each read prove the read leaves billing state unchanged. Direct REST
checks verify the safe view columns and other-user denial under real RLS.

The GG extension has passed against local Auth 2.196.0 and PostgreSQL
15.8.1.085. A native client opts into
the public `requestGgAccess({organization_id})` contract with a trusted
synchronous memory sink. The account bearer goes only to the fixed native mint;
the returned GG credential goes only to the configured origin's existing
`GET /api/v1/ai/models`, then is discarded. Safe IPC/public results contain
organization, expiry and model-list metadata, never the grant or account tokens.
The model list imports the static catalog directly and requires no provider
initialization. Minting uses the shared GG quota/member/sign policy and does not
query or refresh credits.

The local GG pass exercises two-user and removed-membership denial, wrong
credential families and conflicting cookies, revoked-account remint refusal,
and restart/remint through copied public package exports. Existing scoped tokens
retain their 900-second window plus server clock tolerance after membership or
account revocation; this does not establish immediate GG revocation. Fixture
billing/cache snapshots remain unchanged around access, and restart/remint
retains no GG grant in the copied package's custody. No generation endpoint, billing
mutation or provider request belongs in this check. Offline tests cover quota,
clock/key rotation, malformed responses and handoff races; those tests do not
substitute for the real local acceptance run or prove provider readiness.

Its restart check copies both built packages and manifests outside the repository
and runs separate Node processes with disposable `0700`/`0600` test custody.
It lists organizations and reads credits before and after restart, and checks a terminal cursor.
That proves independent package use and this test adapter's restart behavior;
it does not establish product credential storage or cross-process coordination.
No hosted service or deployment is covered by the local result. Normal output
contains phase progress; failure diagnostics exclude tokens, proofs, URL queries,
and full page content. Offline contracts run separately:

```sh
pnpm --filter @grida/auth typecheck
pnpm --filter @grida/auth test
node --test scripts/auth-local/guards.test.mjs scripts/auth-local/network.test.mjs
node_modules/.bin/vitest run --config editor/vitest.oauth.config.ts
```

The dedicated Vitest configuration skips env loading and includes auth contracts
and tenant routing regressions. The [local OAuth CI job](../../.github/workflows/auth-local.yml)
runs these checks, acquires the checksum-pinned release, prepares and bootstraps a
fresh local stack, launches the isolated editor, and runs the same consumer proof.
Cleanup always targets only its owned `grida_auth_test` project. CI supplies no
hosted service credentials and does not upload fixture files or browser state.

## Stop and test guards

Stop the fixture editor, then stop the owned Supabase fixture:

```sh
node scripts/auth-local/stack.mjs stop --state /absolute/fixture/fixture.json
node --test scripts/auth-local/guards.test.mjs
```

Stop targets only `grida_auth_test` and uses `--no-backup`; the fixture's database
contents are disposable. Keep the returned state path to stop a partial failed
start. A stopped fixture cannot restart; prepare a new one. Temporary files remain
available for inspecting a failure and may be removed after stopping. The harness
never calls `login`, `link`, a hosted management API, or `stop --all`.
