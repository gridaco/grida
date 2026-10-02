# Forms API local proof

This proof builds the selected current Forms routes with production Next.js,
then exercises them over HTTP against real local Supabase Auth, Postgres,
PostgREST, Vault and Storage. It is the behavior baseline for extracting the
public API. The ordinary editor environment is never loaded.

Use Node.js 24+, installed repository dependencies, Docker and the pinned CLI
bundle described in [auth-local](../auth-local/README.md). Provision a fresh
owned stack using that harness's `prepare`, `start` and `bootstrap` commands.
Do not use a developer stack or a hosted project. The two proofs share the
fixed `grida_auth_test` fixture identity and must run serially on one machine.

```sh
node --test scripts/forms-local/network.test.mjs
node scripts/forms-local/proof.mjs --state /absolute/fixture/fixture.json
node scripts/auth-local/stack.mjs stop --state /absolute/fixture/fixture.json
```

The Forms proof refuses an occupied port 3000: the current owner's self-HTTP
completion URLs use `localhost:3000`. It also uses the fixture's fixed Supabase
port 55431 and one ephemeral provider-recorder port. Cleanup stops only the
proof's own process groups and removes its source/build snapshot. The caller
must stop its owned Supabase fixture even after a failed proof, as shown above.
Missing setup or a failed assertion fails the command; nothing is skipped.

## What the proof executes

`sources.mjs` enumerates the current runtime dependency closure. The runner
copies and hashes those files, including the real Next configuration, proxy,
cookie refresh and tenant middleware. A minimal root page/layout replaces the
unrelated UI. The configuration wrapper changes only Turbopack's resolution
root. Production `next build` and `next start` run with a constructed environment,
private HOME and fresh output. Next's build does not replace the separate
repository typecheck.

`fixtures.mjs` creates fresh projects under the canonical seed's two
organizations, small Forms records, inventory, a public response bucket and a
real connected table. Run-specific identifiers isolate repeated attempts without
resetting previous data. `scenarios.mjs` imports no application operation or
validator: it checks responses against independent persisted rows, associations,
inventory and downloaded bytes. Authenticated seed personas and an anonymous
caller exercise the actual migrated RLS and RPC privileges.

The connected target is a separate table on the same disposable server. A
fixture-only Vault secret represents an existing configured connection; the
operation must retrieve it through its real reveal RPC and write via PostgREST.
This does not certify a second hosted project's networking or the older
connection-management creation RPC. That RPC currently assumes `pgsodium.key`,
which is absent from the local migration history. Fixtures do not change the
repository migration stream or mask the moved operation with a database fake.

## Effects and containment

`network.cjs` permits only owned loopback ports. It redirects the exact Resend,
IPinfo and Bird provider origins to the local recorder, preserving the actual
SDK serialization and email template rendering. No live provider credential is
supplied. Unexpected provider operations fail verification. The guard rejects
other destinations, unowned loopback ports, Unix sockets and implicit redirects.
This is an application guard, not an OS network sandbox; the runtime, dependencies
and same-user machine are trusted.

Reports under `.cache/forms-local` contain source hashes, versions, scenario
outcomes and cleanup status. Private logs are redacted and are not uploaded.
Provider payloads and OTPs remain in memory. Fixture credentials stay in the
owned temporary stack directory. A successful local run proves neither Vercel
ingress nor hosted preview/production configuration.
