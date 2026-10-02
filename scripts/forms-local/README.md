# Forms API local proof

This proof builds the actual Nitro API and exercises it over HTTP against real
local Supabase Auth, Postgres, PostgREST, Vault and Storage. The ordinary editor
environment is never loaded. It is required by the [Forms API workflow](../../.github/workflows/forms-api.yml).

Use Node.js 24, installed repository dependencies, Docker and the verified CLI
bundle described in [auth-local](../auth-local/README.md). Provision a fresh
owned stack using that harness's `prepare`, `start` and `bootstrap` commands.
Do not use a developer stack or a hosted project. The two proofs share the
fixed `grida_auth_test` fixture identity and must run serially on one machine.

```sh
pnpm --filter @grida/tokens build
pnpm --filter @grida/forms build
pnpm --filter @grida/forms typecheck
pnpm --filter @grida/forms test
pnpm --filter @grida/api typecheck
pnpm --filter @grida/api test
pnpm --filter @grida/api build:local
pnpm --filter @grida/api build
pnpm --filter @grida/api check:vercel
node --test scripts/auth-local/guards.test.mjs scripts/forms-local/network.test.mjs
node scripts/forms-local/proof.mjs --state /absolute/fixture/fixture.json
node scripts/auth-local/stack.mjs stop --state /absolute/fixture/fixture.json
```

The API and provider recorder use ephemeral loopback ports; Supabase uses the
fixture's fixed port 55431. Receipt navigation URLs use the explicit web origin
`http://localhost:3000`, but no web server or self-HTTP completion call is needed.
Cleanup stops only the proof's own process groups and removes its source/build
snapshot. The caller must stop its owned Supabase fixture even after a failed
proof; CI uses an unconditional cleanup step. Missing setup or a failed assertion
fails the command; nothing is skipped.

## What the proof executes

The runner copies and hashes the API source, configuration and package manifest.
It also hashes the lockfile and the linked Forms, token and database packages,
including built package output. Build shared dependencies first. The snapshot
runs a production Nitro `node-server` build with a constructed environment,
private HOME and fresh output, then starts that output and makes real HTTP calls.
Separate typechecks, contract tests and the Vercel build remain required; the
local HTTP proof does not exercise Vercel ingress.

The snapshot adds a fixture-only error observer that records stack frames in the
private log, without error messages or request/provider data. Product diagnostics
remain unchanged; the observer does not change responses or operation behavior.

`fixtures.mjs` creates fresh projects under the canonical seed's two
organizations, small Forms records, inventory, a public response bucket and a
real connected table. Run-specific identifiers isolate repeated attempts without
resetting previous data. `scenarios.mjs` imports no application operation or
validator: it checks public responses against independent persisted rows,
associations, inventory and downloaded bytes. Authenticated seed personas and an
anonymous caller exercise the actual migrated RLS and RPC privileges. Separate
transport cases check CORS, request IDs, no-store, HEAD and JSON failures.

`clients.ts` runs the real editor submission, upload/resolver and email-challenge
clients in a separate process against that same API. Its input and output files
stay private; it receives public origins and synthetic respondent capabilities,
but no database credentials. The parent independently checks resulting rows,
session associations, Storage bytes and unverified identity after denied OTP
verification. This is a client HTTP check, not a rendered-browser UI test.

The connected target is a separate table on the same disposable server. A
fixture-only Vault secret represents an existing configured connection; the
operation must retrieve it through its real reveal RPC and write via PostgREST.
This does not certify a second hosted project's networking or the older
connection-management creation RPC. That RPC currently assumes `pgsodium.key`,
which is absent from the local migration history. Fixtures do not change the
repository migration stream or replace the moved operation with a database fake.

## Baseline and carryover

The pre-extraction Next baseline passed before moves at commit
`ff6d64c7a`, including 13 seeded
scenario groups. The current runner proves the extracted owner; it does not
rebuild or keep the old application runtime.

For the one-time owner handoff, the old owner prepared a real saved draft and
uploaded bytes in the same disposable fixture. Its private `forms-carryover.json`
lives beside the fixture state. When that prepared state is available, run:

```sh
node scripts/forms-local/proof.mjs --state /absolute/fixture/fixture.json --resume-carryover
```

This submits the existing session and uploaded object through the new API,
checking the preserved draft, final stored bytes and connected row. Missing or
already-consumed carryover fails. The file contains a respondent capability and
must remain private. Ordinary CI starts fresh and proves current behavior; it
does not claim to repeat that historical handoff or require old source artifacts.

## Effects and containment

`network.cjs` permits only owned loopback ports. It redirects the exact Resend,
IPinfo and Bird provider origins to the local recorder, preserving actual SDK
serialization and email template rendering. No live provider credential is
supplied. Unexpected provider operations fail verification. The guard rejects
other destinations, unowned loopback ports, Unix sockets and implicit redirects.
This is an application guard, not an OS network sandbox; the runtime, dependencies
and same-user machine are trusted.

The proof checks denial before writes separately from receipt failure after an
accepted submission. A failed required effect does not roll back committed
responses or files, and the caller does not replay the write. HTTP requests,
Storage objects and Vault secrets use separate connections and effects: they
are cleaned up by destroying the owned fixture, not a surrounding SQL rollback.

Reports under `.cache/forms-local` contain source hashes, versions, scenario
outcomes and cleanup status. Private logs are redacted and are not uploaded.
Provider payloads and OTPs remain in memory. Fixture credentials and carryover
capabilities stay in the owned temporary stack directory. A successful local run
proves neither Vercel ingress nor hosted preview/production configuration.
