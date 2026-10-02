# grida-auth

Native Grida account sessions and the provider credential store shared with
TypeScript hosts. Account profiles remain independent of Desktop cookie sessions.

`AuthClient` owns registration validation, loopback OAuth with S256 PKCE, live
identity verification, rotating session custody, safe account projections, and
local-session logout. Hosts provide a synchronous `Transport`; it must enforce
deadlines and response bounds, reject redirects, make one request, and omit
ambient cookies. Run blocking auth work on a worker and await its completion
through cancellation. No default network transport is installed.

Keyring custody is the default. Explicit file selection is remembered; failures
never select a fallback backend. macOS uses Security Framework generic-password
items, and Linux uses the exact keytar Secret Service schema/service/account
attributes. Shared file custody supports macOS and Linux; Windows fails before
access until a separately verified ACL adapter exists.

`ProviderStore` implements the existing provider TOML v1 protocol. Values are
secret-bearing; listing returns presence only. For legacy migration, acquire the
source `CredentialLock`, then call `ProviderStore::migrate`; source retirement
must preserve unrelated records and finish durably. Pending migration blocks
ordinary access and resumes retirement without reimporting.

GRIDA-SEC-010 / GRIDA-SEC-014: profile identities preserve the ordered JSON hash,
private files reject aliases/unsafe modes/ACL grants, publication uses fsync and
atomic replacement, and the shared SQLite `BEGIN IMMEDIATE` lock carries no
credentials. Revision fences prevent stale consent commits. Accepted refresh
rotation is persisted before the separate identity request.

Tests use temporary homes and synthetic credentials:

```sh
cargo test -p grida-auth --all-features --locked
pnpm exec turbo run build --filter=@grida/auth...
node --test scripts/cli-contracts/auth-process.test.mjs
# Explicit native integration test: disposable entries and real logout custody.
GRIDA_AUTH_KEYRING_SMOKE=1 node --test scripts/cli-contracts/auth-keyring.test.mjs
# Linux CI, after installing dbus-x11, gnome-keyring and libsecret-1-dev:
sh scripts/cli-contracts/auth-linux.sh
```

The process suite checks all current TypeScript/Rust combinations. The continuing
TS provider credential owner is also used by Desktop; Desktop's browser account
session remains separate. Frozen [account v1 fixtures](../../packages/grida-auth/fixtures/account-v1/README.md)
preserve historical storage compatibility without retaining an old executable.
The `conformance` feature builds a fixture-only stdio driver; it is
not an npm executable and requires a marked disposable home. Platform keyring
tests are separate from ordinary tests and never enumerate existing entries.
They check exact native values and all four TypeScript/Rust writer/logout pairs,
including restart reads, secret-free tombstones and empty-logout revision changes.
The fixture creator removes its disposable entries after each test;
cross-application deletion is not the shipped custody contract. Build the current
TS package closure before process tests; no historical CLI checkout is required.
