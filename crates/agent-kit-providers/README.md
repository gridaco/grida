# Agent Kit Providers

Provider protocol adapters over an explicit host-owned streaming transport.
`OpenAiCompatible` implements the Chat Completions text and JSON function-tool
profile. Its model registry specifies the supported models, token-limit field,
and usage option for the selected endpoint.

## Host transport

`StreamingTransport` receives a binding, a relative operation path, and an
encoded JSON request. It performs a JSON POST and returns selected response
metadata with a byte stream. The host resolves the approved destination,
validates current authority, applies deadlines and cancellation, injects
credentials, and enforces response bounds. Transport must disable automatic
retries and redirects. Dropping the body releases its stream.

The adapter does not discover endpoints, read environment credentials, select
models, switch funding sources, or retry requests. It uses the supplied
binding and rejects a prepared request whose binding or capabilities changed.
Request bodies have no debug projection. Failures use fixed classifications
and safe codes rather than upstream response text.

## Model requests and streams

Preparation validates the supplied model profile and request before dispatch.
The supported input consists of text messages and correlated JSON function
calls/results. Media, provider continuation state, and custom text-tool forms
require a different supported profile. Plain compatible endpoints have no
portable reasoning-input field, so assistant reasoning is not lowered into
request text.

The adapter frames SSE incrementally across byte and UTF-8 boundaries. It
bounds request bytes, response bytes, each event, tool count, and argument
bytes. A tool call is emitted only when the response declares its tool-call
finish reason and all arguments have validated JSON. The executor performs
its own schema preflight and authority checks before effects.

A completion requires an explicit finish reason and `[DONE]`. The usage
chunk can precede that final marker. An interrupted stream retains available
text, completed tool calls, usage, and observed request evidence. The adapter
returns at terminal evidence without waiting for socket EOF.

Message and call identities are scoped to the supplied attempt, including when
an endpoint reuses response-local IDs. Usage observations share that attempt
identity. An absent usage observation remains absent. Provider usage, prices,
and actual charges have separate meanings.

## Verification

The fixture transport tests exercise request lowering, fragmented streams,
complete tool calls, usage revisions, redacted failures, cancellation, and
bounded malformed input without credentials or paid execution.

```sh
cargo test -p agent-kit-providers --locked
cargo clippy -p agent-kit-providers --all-targets --locked -- -D warnings
```
