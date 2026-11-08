# grida-ai

Private Rust media domain used by the CLI. The crate discovers and validates the
installed BYOK image, video, audio, 3D generation and rigging adapters and executes
their provider protocols through an explicitly supplied `Transport`. GG model
choices come from anonymous public discovery, intersected with the native
interfaces and transports actually implemented here. A new GG model using a
supported JSON interface needs no local model-ID enum or native release.

The host owns credentials, scoped GG token expiry, DNS/route authorization, TLS,
streaming response bounds, cancellation, local files and artifact persistence.
Provider POSTs are never retried. Provider result downloads receive no credential.
Returned failures contain stable codes and observed Tripo task receipts only.

`Catalog::bundled` has no side effects. `parse_input` validates and owns JSON data
before `MediaClient::execute` receives invocation authority. The executor checks
the parsed contract again, preventing a changed public `Parsed` value from
bypassing validation. Dynamic GG descriptors have a private frozen copy; changing
the public descriptor cannot change its selected operation or validation schema.
`verify`, `voices` and `gateway_catalogue` are explicitly networked operations.

`gateway_catalogue` reads only `https://gateway.grida.ai/v1/models` and
`/v1/endpoints` and `/schemas/operations.json`, without credentials.
Expired HTTP metadata or a passed scheduled catalogue change is rejected;
dedicated GG rigging/check commands require their current endpoint before file upload. Reads have a shared 15-second
deadline, 2 MiB per document and bounded local-reference expansion. It never
follows arbitrary schema URLs or falls back to bundled GG availability. BYOK
selection remains offline. The CLI uses the current intersection for GG list,
inspect and generation; cached account credit eligibility remains a separate
optional access check.

GG JSON execution posts to Grida's organization-scoped `/api/v1/ai/operations`
bridge, never sends the product JWT to the public Gateway and never asks the user
for a separate GG API key. Async work polls only the original request ID through
`/api/v1/ai/jobs`; errors preserve that receipt without regenerating. Provider
assets are downloaded through the existing credential-free, size-bounded lane.
Multipart-only operations are not advertised by this JSON adapter. Existing
Tripo local-file adapters remain explicit native contracts, intersected with the
current GG model and variant before selection.

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

The checked-in baseline covers every installed adapter, with accepted/rejected
input vectors and provider fault vectors. Both successful and failing exchanges check
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
