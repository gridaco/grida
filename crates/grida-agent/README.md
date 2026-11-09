# Native Grida Agent

`grida-agent` composes the conversation master, runtime, SQLite journal, and
provider transport. It supports bounded non-interactive runs and supervised
Agent Client Protocol (ACP) v1 stdio sessions.

## Run locally

Build with `cargo build -p grida-agent --locked`. Use an absolute workspace
directory and a dedicated state directory. The host creates missing state
directories with private permissions where the platform supports them.
The state directory contains `runtime.sqlite` and has one owning process.

```sh
printf '%s' 'Explain this concept briefly.' | target/debug/grida-agent run \
  --state-dir "$GRIDA_AGENT_STATE" --cwd "$PWD" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY

target/debug/grida-agent inspect --state-dir "$GRIDA_AGENT_STATE" SESSION_ID

target/debug/grida-agent serve --stdio --state-dir "$GRIDA_AGENT_STATE" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY
```

Select a provider protocol, base URL, and model. HTTPS is accepted for remote
providers. HTTP is limited to numeric loopback addresses or `localhost`,
which resolves to loopback without DNS.

| `--provider`                  | Base URL example                                   | Request                                                           |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `openai-compatible` (default) | `https://api.openai.com/v1`                        | Chat Completions with bearer authentication                       |
| `anthropic`                   | `https://api.anthropic.com/v1`                     | Messages with API-key and version headers                         |
| `gemini`                      | `https://generativelanguage.googleapis.com/v1beta` | Stream GenerateContent with the selected model and API-key header |

Use `--credential-env NAME` to select a key from the host environment.
Anonymous endpoints work when no credential source is selected.
On macOS and Linux, `--credential-home DIRECTORY` uses the existing
private Grida provider store in an explicit absolute directory. Stored keys
are restricted to the reviewed vendor base URLs in the table and to
`https://openrouter.ai/api/v1` and `https://ai-gateway.vercel.sh/v1` for the
compatible protocol. Custom destinations can use an explicitly selected
environment key. Each dispatch revalidates the captured credential and sends
it only in the approved provider header.

Remote HTTPS uses supported host proxy settings and verifies the endpoint
with platform TLS trust. The client reads proxy configuration at startup.
Set `HTTPS_PROXY` and `NO_PROXY` for an explicit route or exclusion. The native
matcher also reads static OS proxy settings on macOS and Windows. Restart the
host to apply routing or trust changes. PAC, automatic proxy discovery, and
interactive or integrated proxy sign-in require a compatible host transport.
When the native matcher finds no supported proxy setting, it routes directly.
Numeric loopback and `localhost` endpoints always bypass proxies.

Gemini retains signed model history across restarts when its protected
credential proof still matches. A changed credential invalidates replay of
that opaque history. The replay identity is separate from the live dispatch
grant. Authenticated Gemini continuity uses the private storage supported on
macOS and Linux.

`run` reads one UTF-8 prompt from stdin or `--prompt`, with a 512 KiB
input bound. `--session SESSION_ID` continues a settled session in its
original workspace and provider selection. A changed output allowance
applies to the new input. `--deadline-ms` defaults to 120000. Stdout contains versioned JSON Lines, beginning with an `accepted`
record containing the session, turn, and input IDs. A verified terminal
result adds a `finished` record with a disposition and any completion
account. Diagnostics use stderr. A process signal after acceptance requests
Stop for that turn and reports its verified disposition. Reaching the run
deadline after acceptance requests suspension. If output is unavailable,
inspect the retained turn by its accepted IDs.

| Exit | Meaning                                              |
| ---- | ---------------------------------------------------- |
| 0    | Successful run, inspection, or clean stdio shutdown  |
| 1    | Failed request, runtime failure, or delivery failure |
| 4    | Verified suspension returned by the run              |
| 5    | Uncertain execution or unverified host shutdown      |
| 130  | Stopped run or process signal                        |

`inspect` reads the latest and current persisted turn state without provider
configuration. Use it after the process that owns the state directory exits.

## ACP stdio

The host handles `initialize`, `session/new`, `session/load`,
`session/prompt`, and `session/cancel` using the stable upstream ACP v1
SDK. Prompts accept text and resource-link descriptors. References travel as
text context and confer no file or network access. Session loading replays
committed text before its reply and leaves work ownership with the host.
The prompt response follows the last delivered update and verified outcome.

Stdout carries only newline-delimited protocol frames. The host bounds each
frame to 1 MiB, admits at most 16 unanswered requests per connection, and
bounds pending updates separately. Losing the supervising pipe initiates
bounded shutdown and requests suspension of owned work. A later process can
inspect retained state.

Process tests launch the built executable with a loopback streaming provider.
Run them with `cargo test -p grida-agent --locked` in an environment that
permits a local listener.

## Shared local service

```sh
target/debug/grida-agent serve --listen ws://127.0.0.1:8765/acp \
  --server-token-env GRIDA_AGENT_SERVER_TOKEN --state-dir "$GRIDA_AGENT_STATE" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY
```

Use a separate randomly generated 32-byte bearer token encoded as 64
hexadecimal characters. Native clients send it in the upgrade request's
`Authorization: Bearer …` header. The listener requires a numeric loopback
address, the exact local authority and `/acp` path, and an absent `Origin`
header. The bearer grants access to this host's state directory. Session
attachment still checks the selected workspace.

The binding carries one ACP JSON-RPC object per WebSocket text message and
bounds message size, outstanding requests, clients, and delivery time.
Losing one client detaches its observers. The service retains ownership of
accepted work until settlement or service shutdown.

### Negotiated operations

During `initialize`, a client puts value `1` under each supported
`clientCapabilities._meta` key. The agent advertises the same version in
`agentCapabilities._meta`. Each custom method prefixes its capability key
with an underscore.

| Capability                  | Behavior                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `co.grida/session/submit`   | Submit `sessionId`, caller-owned `inputId`, and ACP `prompt` to an attached idle session. Receive the committed input position and its queued, claimed, or completed disposition. Retry with the same input to read its retained disposition. |
| `co.grida/session/snapshot` | Read an attached session's revisions, queue count, and current or latest turn summary. Load the session for transcript replay.                                                                                                                |
| `co.grida/session/stop`     | Submit `sessionId`, `turnId`, caller-owned `requestId`, `expectedSessionRevision`, and `expectedControlRevision`. The committed operation cancels that turn and pauses session admission. The exact retry returns its receipt.                |
| `co.grida/config/inspect`   | Read the supported context setting, file revision, diagnostics, and active defaults.                                                                                                                                                          |
| `co.grida/config/update`    | Supply `expectedRevision` and one typed set or reset operation for `context.max_input_tokens`.                                                                                                                                                |
| `co.grida/config/reload`    | Validate and activate the file at `expectedRevision`.                                                                                                                                                                                         |

Standard `session/prompt` is the streaming path. The durable submit path
returns acceptance independently of completion. Each input uses one path.
An existing queued input remains queued on retry. Verified resume and queue
advancement have separate lifecycle contracts.

The host reads `config.toml` from its private state directory and retains an
immutable defaults snapshot with each accepted input. A setting change applies
to later inputs. The current compatible adapter rejects an explicit input-token
cap before dispatch when it cannot establish a hard bound.
