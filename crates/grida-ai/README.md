# grida-ai

Private Rust media domain used by the CLI. The crate discovers and validates the
bundled image, video, audio, 3D generation and rigging contracts and executes
their provider protocols through an explicitly supplied `Transport`.

The host owns credentials, scoped GG token expiry, DNS/route authorization, TLS,
streaming response bounds, cancellation, local files and artifact persistence.
Provider POSTs are never retried. Provider result downloads receive no credential.
Returned failures contain stable codes and observed Tripo task receipts only.

`Catalog::bundled` has no side effects. `parse_input` validates and owns JSON data
before `MediaClient::execute` receives invocation authority. The executor checks
the parsed contract again, preventing a changed public `Parsed` value from
bypassing validation. `verify` and `voices` are explicitly networked operations.

Normal Cargo builds require neither Node nor schema generation. See
[data/README.md](data/README.md) for generated asset ownership and
[tests/fixtures/README.md](tests/fixtures/README.md) for the shared provider contracts.

```sh
cargo test -p grida-ai
cargo clippy -p grida-ai --all-targets -- -D warnings
```

The existing Vercel video contract rejects `seed: 0`, preserving behavior from
the TypeScript serializer that dropped zero seeds. Changing that behavior
requires a separate contract decision.

## Provider contract baseline

Run `just cli-provider-contracts` from the repository root for the ordinary,
zero-cost development check. It exercises real serializers and response parsers
through an injected synthetic transport, plus native HTTP tests using local
sockets. No provider credentials, account, Keychain approval or paid call is
needed. The Rust workflow runs these tests on every relevant change.

The checked-in baseline covers all 112 bundled operations, 5,451 input vectors
and 1,110 provider fault vectors. Both successful and failing exchanges check
method, destination, authorization lane, headers and body. Results and safe
errors are checked too. Independently authored polling tests use Tokio's paused
clock to cover queued/running/success, failure, cancellation during a wait and
deadlines for fal, OpenRouter video and Tripo. Unexpected requests fail, including
a second paid submission. Native HTTP tests separately cover TLS names, bounded
responses, SSE completion, redirects, cancellation and the no-retry rule.

Fixtures are synthetic contracts, not recordings of live customer traffic.
Never regenerate them just to make a failing implementation pass. Review the
intended contract change, adjust the smallest relevant expectation, and retain a
regression for the old failure. New Rust behavior should gain a small independent
test here; it need not grow a second implementation or a shared testing crate.
See the [fixture policy](tests/fixtures/README.md) for normalization and checks
against the continuing TypeScript SDK consumers.

This follows the approach inspected in Zed's injectable
[HTTP client](https://github.com/zed-industries/zed/blob/74c134a3c12418cc095122fff938ef1c2504ae06/crates/http_client/src/http_client.rs)
and handcrafted [provider transport tests](https://github.com/zed-industries/zed/blob/74c134a3c12418cc095122fff938ef1c2504ae06/crates/open_ai/src/chat_completion_transport_tests.rs).
No Zed implementation is copied. No recording framework is needed.

The baseline detects regressions in the contracts we assert; it cannot certify
that an upstream API or account entitlement is unchanged. Budgeted live smoke
tests remain separate acceptance checks for new provider routes/capabilities,
changes to wire behavior, suspected upstream drift and releases. Ordinary
refactors run the zero-cost suite; CI has no live provider keys or spending.
