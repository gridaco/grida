# Installed CLI local proof

> **GRIDA-SEC-010 / GRIDA-SEC-011** — real native account custody in an owned
> local OAuth fixture. See [SECURITY.md](../../SECURITY.md).

## Native CLI acceptance

`native-proof.mjs` installs the exact verified native candidate using
`installNative`, then invokes its installed Rust executable in separate processes.
It accepts an already bootstrapped [owned OAuth fixture](../auth-local/README.md)
whose dedicated editor is running. It never starts, adopts, resets, or stops a
Supabase stack.

```sh
node scripts/cli-local/native-proof.mjs \
  --state /absolute/fixture/fixture.json \
  --candidate /absolute/native-candidate
node --test scripts/cli-local/native-proof.test.mjs
```

The candidate directory must come from the native release preparer. Local CI may
use `buildHostFixture` from `scripts/cli-release/native-fixture.mjs`; the selected
host executable is real, foreign headers are marked as inert fixtures, and such
a candidate cannot be published. The report records the package archive hash and the
installed executable hash.

The native proof covers manual browser consent with fresh PKCE/state, real code
exchange and identity, explicit file storage, process restart, independent native
profiles, occupied callback ports, cancellation cleanup, concurrent account reads,
cached credits and membership denial, local-session logout, and durable revision
advancement after empty logout. It does not open the OS keyring: default storage
metadata is inspected, then file custody is selected explicitly before session
access.

Children receive a constructed environment and private home. Browser routing
allows only the fixture origins; traces, screenshots, video and service workers
are disabled. Authorization URLs, seeded passwords and tokens remain in memory
or the disposable owned custody tree. All owned child processes, browser storage
and credential files are removed before the safe report is written to ignored
`.cache/cli-local/native-result.json`. The caller retains ownership of the stack
and editor. The auth-local workflow runs this installed proof while its fixture
editor is alive and preserves the existing TypeScript auth-package/keytar tests.

The proof does not intercept native process network calls or inject an application
clock. It makes no claim about forced-expiry refresh, expired logout, or network
tripwire counts. The native host itself pins its account endpoints. These checks
do not certify hosted registration, the system browser launcher, naturally
expired JWTs, Windows custody, or native keyring availability.

## Related verification

The [CLI contracts](../cli-contracts/README.md) gate exercises the current
installed native package against synthetic OAuth/account/GG endpoints.
[Native HTTP tests](../../crates/grida-cli/src/http_tests.rs) verify destination
admission, credential routes and bounded transport separately. Current
[auth lifecycle tests](../../packages/grida-auth/src/auth-client.test.ts) and
[persistent auth tests](../../packages/grida-auth/src/persistent-auth.test.ts)
exercise controlled-clock expiry behavior; the
[mixed-process contracts](../cli-contracts/auth-process.test.mjs) exercise
TypeScript/Rust custody and serialized refresh. The separate
[real-issuer auth proof](../auth-local/README.md) covers captured and renewed
refresh-token revocation with the current TypeScript auth package.

The retired TypeScript CLI's archive preparer, installed proofs, Linux smoke and
Node preloads were removed after native cutover. Their package assumptions no
longer match the shipped CLI, and their interception cannot constrain a Rust
process. Historical results remain in Git; use the current native commands above.
