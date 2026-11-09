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

Select an OpenAI-compatible HTTPS base URL or a numeric loopback HTTP base URL
for a local provider. The host appends `chat/completions` to the base path.
Omit `--credential-env` for a provider that accepts anonymous requests.
The credential value stays in the process environment and the outbound
authorization header. Each dispatch uses the captured host binding.

`run` reads one UTF-8 prompt from stdin or `--prompt`, with a 512 KiB
input bound. `--session SESSION_ID` continues a settled session in its
original workspace and launch configuration. `--deadline-ms` defaults to 120000. Stdout contains versioned JSON Lines, beginning with an `accepted`
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
