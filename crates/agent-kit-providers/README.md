# Agent Kit Providers

Provider protocol adapters over a host-owned streaming transport. Each adapter
accepts an explicit model registry and supports text with client-executed JSON
function tools. The host selects and configures the adapter for each approved
provider binding.

## Host transport

`StreamingTransport` receives a binding, a finite `TransportOperation`, and an
encoded JSON request. It returns selected response metadata and a stream of
nonempty byte chunks. The host checks that the operation belongs to the binding
and resolves it to the approved destination.

| Operation                     | Relative route for the corresponding API       |
| ----------------------------- | ---------------------------------------------- |
| `ChatCompletions`             | `chat/completions`                             |
| `AnthropicMessages`           | `messages`                                     |
| `GeminiStreamGenerateContent` | `models/{model}:streamGenerateContent?alt=sse` |

The host applies current authority, deadlines and cancellation, injects
credentials, and bounds the response. It validates Gemini's model against
its registry and encodes it as a single path segment. Transport must disable
automatic retries and redirects. Dropping the body releases its stream.

Preparation performs no I/O. The adapters validate text and tool history
before dispatch. A prepared request captures the binding and model
capabilities. Change the supplied capability revision when wire profile
settings change. The host owns endpoint discovery, credential custody, model
selection, and funding. Request bodies have no debug projection. Failures
expose a classification and a fixed code.

## Model requests and streams

The shared SSE framer handles fragmented bytes and UTF-8. Each adapter bounds
request bytes, response bytes, event bytes, tool count, and argument bytes.
Message and call identities are scoped to the supplied inference attempt.
Usage observations share that attempt identity. Missing usage stays absent.
Cache-related counters retain their provider-specific meanings.

- `OpenAiCompatible` validates the configured output-token field and usage
  option. Completion requires a finish reason and `[DONE]`. It emits calls
  after the tool-call finish reason and JSON validation. Compatible reasoning
  deltas remain separate from answer text and are omitted from portable request
  history. The Ollama profile uses the `max_tokens` field. [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility) · [Chat Completions streaming](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)
- `Anthropic` requires an explicit output-token limit and lowers leading
  instructions to the system field. It emits a call after its complete
  tool-use block. Completion requires a stop reason and `message_stop`.
  Extended thinking blocks and server-side tools require a different adapter
  profile. [Anthropic Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)
- `Gemini` preserves original part order, thought signatures and remote call
  IDs in opaque continuation state. It emits calls only with a completed
  response and a clean stream end. Results are sent in original call order,
  with the provider ID when available. Streamed function arguments and media
  parts require a different profile. [Gemini thought signatures](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures)

The Gemini host persists an opaque replay binding for each endpoint and
provider-account lineage. Recreating live execution authority can reuse that
replay binding when lineage is verified. Rotate the replay binding when
lineage cannot be established. The adapter checks the replay binding, model,
and original assistant message content before using stored parts. It checks
the fresh execution binding independently before starting a request.

Completed calls still require executor schema preflight and authority checks.
A stream failure retains the valid prefix and available usage and request
evidence. The host can present the supported content independently from
opaque continuation state.

## Verification

The fixture transport covers lowering, fragmented streams, terminal and partial
outcomes, attempt-scoped usage, redacted failures, cancellation and limits,
and signed tool-history continuation across live authority generations.

```sh
cargo test -p agent-kit-providers --locked
cargo clippy -p agent-kit-providers --all-targets --locked -- -D warnings
```
