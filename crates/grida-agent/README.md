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
