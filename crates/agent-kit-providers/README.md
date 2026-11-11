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
| `OpenAiResponses`             | `responses`                                    |
| `OpenAiResponsesInputTokens`  | `responses/input_tokens`                       |
| `AnthropicMessages`           | `messages`                                     |
| `GeminiStreamGenerateContent` | `models/{model}:streamGenerateContent?alt=sse` |

The host applies current authority, deadlines and cancellation, injects
credentials, and bounds the response. It validates Gemini's model against
its registry and encodes it as a single path segment. Transport must disable
automatic retries and redirects. Dropping the body releases its stream.

Preparation performs no I/O. The adapters validate input and tool history
before dispatch. A prepared request captures the binding and model
capabilities. Change the supplied capability revision when wire profile
settings change. The host owns endpoint discovery, credential custody, model
selection, and funding. Request bodies have no debug projection. Failures
expose a classification and a fixed code.

Inference distinguishes a transport failure known to precede dispatch from an
interrupted attempt. HTTP timeouts and server errors preserve dispatch
uncertainty. Recognized provider codes distinguish unavailable models, quota,
rate limits, and context limits. An HTTP retry delay is advisory. Each adapter
issues a single transport request per inference attempt.

The Responses API profile records an admission rejection when generation
returns a complete HTTP 429 body with the explicit `rate_limit_exceeded`
error code. An OpenAI-compatible endpoint can supply the same evidence when
the host opts in to a reviewed contract that guarantees both the error code
and the `rate_limit_error` type precede execution. Other rate-limit responses
on that opt-in endpoint retain uncertainty. The evidence applies only to
complete HTTP rejection bodies from the reviewed generation route. The master
decides whether to make another attempt.

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
  history. A terminal accounting chunk may have no choices, or one content-free
  choice repeating index zero and the exact normalized/native finish reasons.
  A repeated choice must report at least one supported token counter. It cannot
  add text, reasoning, refusal, tool deltas or non-null unrecognized output
  fields. Accounting updates the same attempt's final counters without emitting
  another call or replacing the original terminal receipt. `[DONE]` remains
  required; malformed late frames preserve the valid prefix and interrupt the
  attempt. [Compatible terminal usage](https://openrouter.ai/docs/api_reference/streaming)
  The Ollama profile uses the `max_tokens` field. [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility) · [Chat Completions streaming](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)
- `Responses` uses stateless SSE with top-level instructions, `store: false`,
  and explicitly requested encrypted reasoning. It keeps completed output
  item order and remote function call IDs for replay. Tool calls become
  eligible after the verified terminal response. The API profile accepts an
  explicit output-token bound. The subscription profile rejects that field,
  so a host using it must select an effective output policy before preparing
  the request. The API profile can also accept image references when the host
  supplies an immutable image resolver. The resolver reads bounded bytes only
  during authorized counting or generation. Both operations send the same
  image content, while the prepared request keeps just the references. The
  adapter provides protocol fixtures for both profiles.
  Subscription account setup and native host activation are separate.
  [Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)
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

Gemini and Responses use an opaque replay binding for each endpoint and
provider-account lineage. Recreating live execution authority can reuse that
replay binding when lineage is verified. Rotate the replay binding when
lineage cannot be established. The adapters check the replay binding, model,
and original assistant message content before using stored parts. Responses
also checks the selected endpoint profile and wire model. Replay state is
trusted history from the host. Fingerprints detect mismatches with that history.
The adapters check the fresh execution binding independently before dispatch.

Responses streams reasoning summaries separately from answer text. It retains
completed encrypted reasoning in the provider-state envelope for replay. When a
stream ends without verified completion, the visible prefix and available
usage survive without publishing a tool call from that stream. Stopping the
local reader closes its stream. Remote execution and charges follow the
provider's contract. An identified `response.failed` can report a terminal
failure. A general `error` event can classify the fault while leaving the
attempt interrupted. [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events)

The Responses API profile can measure the prepared input before generation.
It sends the same model, input items, instructions, tool definitions, and
reasoning settings to the input token count endpoint. Generation controls such
as streaming and the output limit are separate. The adapter reads a bounded
JSON response and preserves the provider's failure classification. A host must
authorize this operation at the approved API destination. The subscription
profile leaves this measurement unavailable. [Token counting guide](https://developers.openai.com/api/docs/guides/token-counting) · [Count endpoint reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)

Completed calls still require executor schema preflight and authority checks.
A stream failure retains the valid prefix and available usage and request
evidence. The host can present the supported content independently from
opaque continuation state.

## Verification

The fixture transport covers lowering, fragmented streams, terminal and partial
outcomes, attempt-scoped usage, redacted failures, cancellation and limits,
and opaque tool-history continuation across live authority generations.

```sh
cargo test -p agent-kit-providers --locked
cargo clippy -p agent-kit-providers --all-targets --locked -- -D warnings
```
