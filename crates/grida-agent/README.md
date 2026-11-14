# Native Grida Agent

`grida-agent` composes the conversation master, runtime, SQLite journal, and
provider transport. It supports bounded non-interactive runs and supervised
Agent Client Protocol (ACP) v1 stdio sessions.

## Reference docs

The [Agent Features catalog](../../docs/agent/features.md) records each
feature's current behavior, intended outcome, caveats, and availability.

- [Rust agent core](docs/rust-core.md) — crate map, dependency graph,
  error model, and the cross-crate contracts of the native agent.
- [Native executable and headless host](docs/rust-core.md#native-executable-and-headless-host)
  — the shared engine/server binary, its subcommands, unattended runs, and
  process-level testing.
- [Rust core pressure test](docs/rust-core-pressure-test.md) — coverage
  model, regression obligations, and minimal-master and durable-session
  walkthroughs.
- [Tool-host contract](docs/tool-host-contract.md) — Rust/Electron
  ownership, shared native/MCP capabilities, endpoint identity, domain-owned
  results, and invocation recovery.
- [Host configuration](docs/rust-config.md) — reviewed settings,
  conversational inspection and changes, and the host-owned TOML surface.
- [Client protocol](docs/rust-client-protocol.md) — ACP-first clients,
  custom presentation, negotiated durable controls, and compatibility checks.
- [Lifecycle hooks](docs/rust-core.md#configured-lifecycle-hooks) — ordered
  configured checks and context contributions through existing execution
  contracts.
- [Native sandbox](docs/rust-sandbox.md) — native command confinement, its
  launch contract, and platform boundaries.

## Run locally

Build with `cargo build -p grida-agent --locked`. Use an absolute workspace
directory and a dedicated state directory. The host creates missing state
directories with private permissions where the platform supports them.
The state directory contains the session database `agent.sqlite` and has one
owning process. The database opens only if it is empty or was created by this
host; a file from any other schema is refused rather than converted.

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

On macOS and Linux, `run --input-png FILE` can attach one local PNG up to
256 KiB on an image-capable profile. Omit `--cwd` and `--permission-profile`
to work without a project grant. The host retains the selected bytes and
keeps image edits in private scratch.

```sh
target/debug/grida-agent run --state-dir "$GRIDA_AGENT_STATE" \
  --provider responses --endpoint "$GRIDA_AGENT_ENDPOINT" --model gpt-5.4 \
  --credential-env OPENAI_API_KEY --input-png "$GRIDA_SELECTED_PNG" \
  --prompt 'Crop the image to the requested area.'
```

Direct `gemini-3.8-flash` on `https://generativelanguage.googleapis.com/v1beta`
also accepts a PNG in the prompt. Use `--provider gemini` with your Gemini API
key environment variable. This profile sends the retained PNG as input.

A private ACP client can reopen that run with the same state directory,
provider and session ID. Use the absolute path to the state directory's
`attachment-context` as the ACP working directory, then read its settled
turn summary and any listed artifacts.

Use `run --input-file FILE` on macOS or Linux to inspect one selected regular
file up to 256 KiB. With no project selected, the run uses the same private
attachment context. The host retains the exact original and creates a separate
working copy before accepting the turn. The provider sees the sanitized file
name. The turn's `inspect_retained_file` tool returns verified size and SHA-256
and can request up to 2 KiB of UTF-8 text. Binary inspection returns integrity
metadata. An unavailable original or working copy stops dependent work after
reopening and the turn account identifies which input is missing.

Select a provider protocol, base URL, and model. HTTPS is accepted for remote
providers. HTTP is limited to numeric loopback addresses or `localhost`,
which resolves to loopback without DNS.

| `--provider`                  | Base URL example                                   | Request                                                                   |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `openai-compatible` (default) | `https://api.openai.com/v1`                        | Chat Completions with bearer authentication                               |
| `responses`                   | `https://api.openai.com/v1`                        | Stateless Responses with bearer authentication and encrypted continuation |
| `anthropic`                   | `https://api.anthropic.com/v1`                     | Messages with API-key and version headers                                 |
| `gemini`                      | `https://generativelanguage.googleapis.com/v1beta` | Stream GenerateContent with the selected model and API-key header         |

Use `--credential-env NAME` to select a key from the host environment.
Anonymous endpoints work when no credential source is selected.
On macOS and Linux, `--credential-home DIRECTORY` uses the existing
private Grida provider store in an explicit absolute directory. Direct stored
keys are restricted to the reviewed vendor base URLs in the table and to
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
Numeric loopback and `localhost` endpoints always bypass proxies. For
compatible endpoints that read `max_tokens`, including Ollama, pass
`--compatible-output-limit-field max-tokens`. The default sends
`max_completion_tokens`.

A supervising host can select `serve --stdio --supervised-provider` and
negotiate `co.grida/provider/egress` version 1 during ACP initialization.
The native adapter still prepares the provider request and validates its
credential. The supervisor authorizes the exact route, dispatches it, and
streams a bounded response on the private pipe. The supervised mode has no
direct network client. Losing the pipe after dispatch leaves the attempt
interrupted.

Desktop's Gateway profile uses the same pipe. Main captures the signed-in
account and organization, and passes an opaque scope with the selected model
to the child. The child builds the fixed Gateway chat request without a
bearer. Main attaches the short-lived grant at dispatch. A restart under the
same scope can continue the chat after a grant refresh. A different scope can
read the saved transcript through the ordinary workspace boundary, but cannot
use it to start provider work under the replacement account or organization.

Responses and Gemini retain opaque model history across restarts when their
protected credential proof still matches. A changed credential invalidates replay of
that opaque history. The replay identity is separate from the live dispatch
grant. Authenticated continuity uses private storage on macOS and Linux.
Other platforms can use an explicit environment credential within the current
process. That process-local binding cannot authorize opaque replay after restart.
Direct `gemini-3.8-flash` also checks that retained function-call history has
the required thought signature before sending it to Gemini.

The Responses API adapter can count complete input before generation when an
input-token cap is configured. Counting sends the captured input to the same
provider under the same credential and deadline. Unsupported counting and
over-limit input return a persisted failure before generation.

For a local llama.cpp text server, add `--llama-cpp-input-count` with
`--provider openai-compatible` and a direct numeric loopback `/v1` endpoint
such as `http://127.0.0.1:8080/v1`. When a cap applies, the host sends the
complete prepared text and tool request to the server's count route before
generation. A missing or invalid count leaves the turn failed before
generation. This launch option keeps its own saved connection identity.

`run` reads one UTF-8 prompt from stdin or `--prompt`, with a 512 KiB
input bound. `--session SESSION_ID` continues a settled session in its
original workspace and provider selection. A changed output allowance
applies to the new input. `--deadline-ms` defaults to 120000 and accepts up to four hours, for long single turns. Stdout contains versioned JSON Lines, beginning with an `accepted`
record containing the session, turn, and input IDs. A verified terminal
result adds a `finished` record with a disposition and any completion
account. Diagnostics use stderr. A process signal after acceptance requests
Stop for that turn and reports its verified disposition. Reaching the run
deadline after acceptance requests suspension. If output is unavailable,
inspect the retained turn by its accepted IDs.

Pass `--questions` to let a tool-capable model request input. If work reaches
a question it still needs answered, `run` preserves the turn and emits a
`finished` record with `input_required` and the pending `questions`. The
process exits so an automation can hand the retained session to an ACP client.

Use `--require-completion-text` on `run` or `serve` to require a nonempty
final answer on newly accepted tasks. The host records the check and its
decision in the completion account. Keep the same launch setting when
resuming those tasks. Stop can still settle them when the check is unavailable.

On a supported native command host, a trusted `--permission-profile` may also
declare one `beforeCompletion` command for Act turns. The primary directory
must already grant `commandRead: "allow"`. Use a canonical system executable
directly under `/bin` or `/usr/bin`, covered by the declared read-only runtime
paths. The host must run unprivileged and must be able to verify ownership and
ACLs for the executable and its ancestors. The profile records the executable's
SHA-256 as 32 byte values. This is the shape of the optional profile field.

```text
beforeCompletion
  executable  { path, sha256 }
  arguments   [literal argument strings]
  mode        "required" or "observe"
  timeoutMs   1 through 30000
```

Set `command.hooksOnly` to `true` to keep general command execution out of
the model's tools while running this reviewed check. This setting requires
`beforeCompletion` or an ordered `hooks` selection and the same primary
`commandRead: "allow"` review.
Omitting it preserves the profile's ordinary command permissions.

The command receives a bounded versioned `before_completion` JSON event on
stdin. For a successful decision, it must exit zero and print one JSON object
on stdout, either `{"decision":"allow"}` or
`{"decision":"deny","reason":"Verification failed."}`. Required failures
block completion. Observational failures appear in the retained check account.
The command has read-only workspace access, private temporary storage, no
network access, and no inherited provider environment. The host passes the
configured arguments literally. Changed executable bytes or a changed profile
cannot substitute for the retained check. Pause and Stop keep ordinary command
cleanup and uncertain outcomes keep their original attempt identity.

| Exit | Meaning                                              |
| ---- | ---------------------------------------------------- |
| 0    | Successful run, inspection, or clean stdio shutdown  |
| 1    | Failed request, runtime failure, or delivery failure |
| 4    | Verified suspension returned by the run              |
| 5    | Uncertain execution or unverified host shutdown      |
| 6    | Verified suspension for a question or approval       |
| 130  | Stopped run or process signal                        |

`inspect` reads the latest and current persisted turn state without provider
configuration. Use it after the process that owns the state directory exits.

### Check a command before it runs

A trusted native permission profile can declare one required `beforeTool`
command with the same `executable`, `arguments`, and `timeoutMs` fields as
`beforeCompletion`, and `mode: "required"`. It checks each validated
`exec_command` action in Act after ordinary permission and before the action's
attempt. Its bounded `before_tool` JSON event includes the proposed command
arguments: the command line, working directory, terminal choice and access.
Input sent later to the started process through `write_stdin` is not checked
again, so a check that must see every command refuses interactive shells. It
returns the same allow or deny JSON shape as the completion
command, with read-only workspace access, private temporary storage, and no network. The action
receives a generic refusal code; the handler diagnostic remains in the private
record. Continue a retained task with the same reviewed profile.

Standard Act Goals can use this profile. Plan Goals, Ultra Goals, and
`command.hooksOnly` remain unavailable with `beforeTool`. The profile is
selected at native launch. If a check's result is unconfirmed, later admissions
in the same turn stop once the uncertainty is observed. Effects already
admitted may finish. An uncertain Goal turn retains its work reservation.

### Configure lifecycle hooks

The launch-only permission profile can select up to eight ordered `hooks`.
Each definition has this shape; `executable.sha256` is the canonical program's
SHA-256 as 32 byte values, as in the command examples above.

```text
hooks[]
  id          unique stable identifier
  source      attributed definition source, at most 256 bytes
  event       session_start | before_input | before_tool | after_tool | before_completion
  tool        optional exact tool ID, only for before_tool or after_tool
  enabled     true or false (default true)
  executable  { path, sha256 }
  arguments   [literal argument strings]
  mode        required | observe
  timeoutMs   1 through 30000
```

The trusted supervisor owns discovery, explicit review, registration, and
selection of this file. Loading a project does not discover or trust code.
The command profile supplies the pinned sandbox helper, runtime roots and
private temporary parent. The primary directory must grant read-only command
access. `command.hooksOnly: true` runs these handlers without offering
`exec_command` or `write_stdin` to the model. Ordered hooks cover Plan and Act and the corresponding
Goal work. A child that inherits the primary read profile retains its checks
under its own turn identity. Text-only reviewers without native workspace
authority do not acquire executable-hook filesystem access.
Existing `beforeTool` and `beforeCompletion` fields retain their narrower
single-check semantics. Project-local/user-owned hook executables remain unavailable: use a
canonical reviewed system program with literal arguments. Handler bytes, the
selected definitions, and the permission scope participate in the captured
revision. Changes apply to future accepted work through a newly selected launch
profile; they cannot replace handlers for an in-progress task.

A handler reads one bounded JSON object on stdin:

```text
{ hook, selection, occurrence: { version: 1, session, turn, moment } }
```

`hook` identifies this definition and `selection` retains the complete ordered
selection. `moment.event` names the event. Session start carries the control
revision; input carries the retained user message; tool events carry the exact
operation and validated invocation, with the recorded outcome for `after_tool`;
completion carries a bounded summary of the proposed outcome:

```json
{
  "event": "before_completion",
  "proposal": {
    "fingerprint": "<64 hex digits>",
    "status": "succeeded",
    "steps": 2,
    "text": "Updated the export and verified the manifest.",
    "text_truncated": false,
    "tool_activity": {
      "succeeded": 1,
      "failed": 0,
      "cancelled": 0,
      "unresolved": 0
    },
    "evidence": [
      "operation_<64 hex digits>",
      "operation_<64 hex digits>",
      "operation_<64 hex digits>"
    ],
    "evidence_total": 3
  }
}
```

`text` holds the first 4 KiB of the final answer, cut at a character boundary;
`text_truncated` reports whether more followed. `evidence` names at most 32 of
the proposal's operation identifiers in identifier order and `evidence_total`
counts all of them. `fingerprint` identifies the complete proposal, so each new
candidate after a requested step is a distinct occurrence. Earlier hook results,
usage and other accumulated account history are not repeated, so the completion
event does not grow with the turn. Events are limited to 64 KiB. A handler
must exit zero and print one of these JSON replies on stdout:

```json
{ "decision": "allow", "context": "Optional attributed contextual data." }
```

```json
{ "decision": "deny", "reason": "The verification did not pass." }
```

A `before_completion` handler may instead print
`{"decision":"continue","context":"Perform another verification pass."}`.
This requests another model step within the original task allowance. Exhaustion
fails the check rather than extending the allowance. The context limit is 4 KiB.
Other events reject this response. Observers retain diagnostics and may contribute
context, but cannot reject the original action or require another model step.
Hook output is labeled contextual data with its source and revision; it grants no
access and does not become a user instruction. At most 64 contexts enter the
next request, with an explicit omitted count when the retained set is larger.

Handlers run in order through private ordinary runtime operations, read-only
native confinement, deadlines and cancellation. They do not recursively run
hooks for internal check operations. Before-tool checks run after ordinary action
admission and revalidate that original authority afterward. An after-tool failure
preserves the actual effect and blocks only later dependent work or completion
when required. Effects already admitted in the same step may finish. Pause and
Stop prevent new handler admission. Unknown handler outcomes remain uncertain;
reopen and replay reuse recorded outcomes instead of executing code again.

Negotiate `co.grida/session/hooks: 1` and call
`_co.grida/session/hooks` with `{}` to inspect selected definitions without work.
An attached `sessionId` adds bounded results from its current or latest turn.
The response contains `supportedEvents`, `hooks`, and `results`. Results identify
hook/event/revision, status and safe reason. A skipped or unadmitted handler has
`operation: null`; it does not pretend to own an executed operation. Final
accounts retain the same lifecycle results, including bounded-event failures.
No observer subscription, history read or client reconnect executes handlers.
An unavailable or changed handler cannot prevent inspection; a required
invocation fails against its original pin. Stop uses the retained selection
without requiring that executable to be available. Resume cannot replace a
paused task's captured definitions, including tasks accepted before hooks were
registered.

### Check a workspace manifest

This example accepts a `design-manifest.txt` in the primary directory when it
contains exactly one line, `format=1`. Generate the `beforeCompletion` value
using the canonical path and digest on the host that will run it.

```sh
python3 - <<'PY'
import hashlib
import json
from pathlib import Path

program = Path("/usr/bin/awk").resolve(strict=True)
check = r'''
NR == 1 && $0 == "format=1" { valid = 1 }
END {
    if (valid && NR == 1) print "{\"decision\":\"allow\"}"
    else print "{\"decision\":\"deny\",\"reason\":\"Expected one format=1 line in design-manifest.txt.\"}"
}
'''
print(json.dumps({
    "executable": {"path": str(program), "sha256": list(hashlib.sha256(program.read_bytes()).digest())},
    "arguments": [check, "design-manifest.txt"],
    "mode": "required",
    "timeoutMs": 5000,
}, indent=2))
PY
```

Add the value to a reviewed launch profile as `beforeCompletion`. Keep the
profile owner-only and outside the workspace. Review `commandRead: "allow"`
on the primary directory and include the executable in the reviewed runtime
paths. Set `command.hooksOnly` to keep general commands unavailable to the
model. Launch the same profile with `run` or `serve`.

```sh
target/debug/grida-agent run --state-dir "$GRIDA_AGENT_STATE" \
  --permission-profile "$GRIDA_AGENT_PERMISSION_PROFILE" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY --prompt "Summarize the proposed design."
```

Use `"mode": "observe"` to record the check without requiring it to pass.
Read `account.completion_checks` in the finished JSON record. A command that
hits its deadline or output limit records that reason and preserves any
uncertainty about the command's outcome. The command's raw streams stay out
of the account.

## ACP stdio

The host handles `initialize`, `session/new`, `session/list`, `session/load`,
`session/prompt`, and `session/cancel` using the stable upstream ACP v1
SDK. Prompts accept text and resource-link descriptors. References travel as
text context and confer no file or network access. Session loading replays
committed text before its reply and leaves work ownership with the host.
The prompt response follows the last delivered update and verified outcome.

List supplies an absolute workspace `cwd` and returns up to 32 saved session
identities in newest-created order. Follow `nextCursor` with the same workspace.
Listing leaves chats detached and reads no transcripts.

On macOS and Linux, negotiate `co.grida/session/delete` version 1 on private
stdio to delete an eligible idle saved chat. A fresh request binds the
attached chat, its workspace, and its observed session and catalog revisions.
Exact retries return the persisted receipt. Chats with pending work or
dependent retained state remain available until those dependencies are resolved.

Private stdio clients can negotiate the side-chat open, ask, and close
operations. Each side chat uses temporary state and the selected model with
no tool access. Its captured background can include the parent's installed
summary. Closing it leaves the parent task under its original controls.

Clients can negotiate both `co.grida/session/questions` and
`co.grida/session/answer-question` at version `1`. Prompts accepted through the
product submit and queue extensions then capture question availability. Plain
`session/prompt` uses the portable ACP flow. A pending question is listed by
session and turn ID with its wait ID, question text, and suggested choices.
An answer uses that wait ID and the current revisions. Free text, a suggested
choice, and skipping are supported. A suspended turn can continue when its
pending answers arrive. An explicit Pause still requires Resume. Repeating an
accepted answer request returns its original receipt and can wake an answered
turn after a reconnect.

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

Each listener has one trusted authority profile. Clients using its bearer
share the host's saved chats, selected provider and applicable permission
profile. Run a separate process with its own listener, bearer, state directory,
provider credentials and permission profile for each independent principal.
The deployment owner supplies separate OS identities or equivalent filesystem
and network isolation when the host processes themselves require containment.
Native command confinement applies to the commands and their descendants.

The binding carries one ACP JSON-RPC object per WebSocket text message and
bounds message size, outstanding requests, clients, and delivery time.
Losing one client detaches its observers. The service retains ownership of
accepted work until settlement or service shutdown.

### Negotiated operations

During `initialize`, a client puts value `1` under each supported
`clientCapabilities._meta` key. The agent advertises the same version in
`agentCapabilities._meta`. Each custom method prefixes its capability key
with an underscore.

| Capability                                        | Behavior                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `co.grida/session/submit`                         | Accept an identified prompt for an idle session.                                    |
| `co.grida/session/snapshot`                       | Read revisions, ordered queue settings, and turn summaries.                         |
| `co.grida/session/enqueue`, `input`               | Accept waiting work or read an accepted input and its settings.                     |
| `co.grida/session/replace`, `withdraw`, `reorder` | Edit waiting work with revision checks and retained receipts.                       |
| `co.grida/session/pause`, `resume`, `steer`       | Pause an exact turn, claim a verified suspension, or add a correction.              |
| `co.grida/session/stop`, `resume-queue`           | Stop the current turn and pause admission, or reopen queue admission separately.    |
| `co.grida/session/history`, `fork`, `revise`      | Read message anchors, branch a committed prefix, or revise an earlier user message. |
| `co.grida/session/compact`                        | Summarize model context for future turns and retain the original transcript.        |
| `co.grida/session/skills`                         | List available named skills and their versioned prompt references.                  |
| `co.grida/config/inspect`, `update`, `reload`     | Read, change, or activate the host's reviewed defaults.                             |
| `co.grida/session/processes`                      | List or stop a chat's command processes and receive the list when it changes.       |

Standard `session/prompt` streams its response. Durable submission and enqueue
acknowledge accepted input independently of completion. Exact input retries
return retained dispositions. Exact control retries reconcile their committed
request IDs. Read the [native client protocol](docs/rust-client-protocol.md)
for field names and revision bases.

Forks capture committed context and can leave the source running. Attach the
new session through `session/load`. Earlier-message revisions require an idle
session with an empty queue. The original view remains readable, and the
replacement is accepted under the current settings. Explicit admission pause
still applies. Retained context carries portable text and provenance, with
omissions for provider continuation and restricted source material. Clients
receive categorized omission counts. The agent receives a notice when relevant
context such as media or tool data was omitted.

The negotiated command catalog offers `/compact` and `/fork` when the client
enables their corresponding controls. Manual compaction requires an idle
session, an empty queue, and open admission. New queued input is retained
while the summary runs. The host installs a useful summary only against its
captured context. A failed or interrupted summary leaves the prior context
usable. Resume and explicit recovery account for the same turn without
repeating an interrupted provider attempt.

Queue advancement follows verified settlement while admission is open.
Loading a session observes retained state. Resume Queue explicitly lets
retained waiting inputs proceed after a restart. Resume Task reuses the
accepted model and limits and revalidates the captured provider authority.
A changed provider credential blocks dispatch for that retained task.

The host reads `config.toml` from its private state directory and retains an
immutable defaults snapshot with each accepted input. A setting change applies
to later inputs. A compatible connection without exact counting rejects an
explicit input-token cap before generation.

A private stdio supervisor can give workers with separate chat stores one
workspace configuration. They share the workspace's existing `config.toml`
and writer lock. Later input captures the same activated defaults from either
worker. Manual edits stay pending until an explicit reload or the supervisor
starts a new workspace generation. An interrupted activation can leave a
newer source revision with the previous defaults still active. Inspect and
reload that revision before relying on the change.

Use repeatable `--skill NAME` options with `run` to select guidance for that
input. ACP clients can select a versioned reference from the skill catalog.
Bundled skills are available without project access. On Unix, project skills
override bundled names when the local run selects its project or the ACP host
supplies a readable primary root. Project guidance comes from that root's
`AGENTS.md`. The accepted input retains the exact versions it used. Later inputs
resolve the current files, and stale explicit references require reselection.

## Filesystem services

The private `workspace-file` process reads one span from a registered
workspace on macOS and Linux. Its owner supplies a canonical root, the
registered directory identity, protected paths, and a relative file name.
The process reports the opened descriptor's size before reading any bytes.
The owner supplies an exact offset and length, or closes the request pipe
to release the descriptor without reading. Byte output and size refer to
the same opened file.

The process accepts two bounded JSON lines on stdin. The first contains
`workspaceId`, `root`, `identity`, `protected`, and `path`. The identity
contains decimal strings `device`, `inode`, and `birthTimeNs`. Stdout reports
`{"size":"…"}` as one JSON line. A first input with `includeModified: true`
also receives `mtime`, the opened descriptor's modification time as fractional
Unix milliseconds. It matches the existing editor write precondition.
The second input contains decimal string
`offset` and `length`, followed on stdout by exactly that byte span on success.
The owning client supplies live process controls and any kernel launch profile.
The process rejects unproven hard links, mounts, and paths outside the granted
directory. Desktop owns Range and MIME handling.

A first input with `listDirectory: true` instead lists one directory. An empty
`path` selects the registered root. The worker reports immediate names and
entry kinds as one JSON line and exits. Directory entries are classified
without following child symlinks. A listing above 8,192 entries or 2 MiB
returns a limit error before writing any output. The client owns display
filtering, path presentation, and sorting.

A first input with `write: { length, expectedMtime? }` instead saves one
regular file. The optional time is decimal text for an exact floating-point
round trip. The request is followed by exactly `length` raw UTF-8 bytes and EOF. The
bound is 64 MiB. The owner launches this operation with a separate kernel
write scope. The worker creates contained parents, stages in the pinned
destination directory, and atomically renames after checking any supplied
fractional modification time. Omitting `expectedMtime` is an explicit
overwrite. A missing target with a supplied time is a conflict. An external
writer can still change the target between that last check and rename.
Success returns `{"mtime":…}` after checking the published inode.

The workspace and scratch modules provide host-owned filesystem building blocks.
Workspace membership records named roots and a primary default. Independent
grants bind to captured native directory identities. Restored targets require
current membership, grants and protected-root checks before a tool opens them.
Directory binding requires native creation identity.

Scratch retains exact input bytes separately from editable working copies.
Retry and restart validate source identity, digest and durable publication.
A recorded copy that disappears remains unavailable. Managed copy limits apply
at admission. Executors own quotas for their separate working areas and outputs.
These private-storage helpers currently support macOS and Linux. The native
host's tool composition supplies their grants and lifecycle.

Private stdio ACP can submit a single validated PNG as part of an input when
using the Responses `gpt-5.4` profile. The host keeps the original under the
private state directory and stores its immutable reference with the accepted
input. Queued input and provider context can use the original after restart.
An unsupported profile or unavailable original produces an error for the
whole request.

The native `crop_retained_image` tool receives only the most recent retained
PNG in the admitted chat's captured context. It uses the original coordinates
and atomically saves a bounded derivative in that chat's working area. The
result records the source and working-copy identities and their digests. The
copy is retained with the chat state, and an interrupted write with uncertain
publication requires inspection before a new edit. Publication to a project or
another destination is a separate operation.

An attached private stdio client can ask for a retained crop from a settled
turn on macOS or Linux. The read verifies the working copy against the saved
receipt and returns bounded PNG bytes. A later crop can replace that working
copy. The earlier result stays recorded and its preview is unavailable if the
bytes are missing or have changed. Reopening a result never starts new work.

The native library also provides the read-only `read_file`, `list_files`, and
`search_text` adapters for macOS and Linux. They use the turn's selected
directory and recheck current grants and protected roots before opening a
target and before returning results. Reads accept bounded UTF-8 text files.
Listings cover direct children, and search matches a case-sensitive literal
within a selected subtree. A truncated result covers only part of the request.
The adapters refuse symlinks, multiply linked files, special files, and
cross-device paths. Linux requires kernel support for `openat2` and also
refuses nested mounts. Cancellation and deadlines stop new filesystem work and
result delivery. An in-flight native read may finish before its worker can exit.
Native `run` and `serve` can offer these tools through a permission profile
selected with `--permission-profile PATH`. Use an absolute canonical path to
an owner-only JSON file (mode 0600) in a private directory (mode 0700). This
launch input is separate from `config.toml` and comes from the supervisor.
With a profile, `grida-agent run` can omit `--cwd` to use its canonical primary
root. An explicit working directory must match that root to use the profile's
tools. ACP clients still supply their working directory.

```json
{
  "version": 1,
  "workspace": "project",
  "revision": "permissions-v1",
  "primary": "project",
  "directories": [
    {
      "id": "project",
      "name": "Project",
      "path": "/absolute/path/to/project",
      "generation": "directory-v1",
      "read": "allow"
    },
    {
      "id": "reference",
      "name": "Reference",
      "path": "/absolute/path/to/reference",
      "generation": "directory-v1",
      "read": "ask"
    }
  ]
}
```

Each root's `read`, `commandRead`, and `commandReadWrite` rule accepts
`allow`, `ask`, or `deny`, with omitted rules defaulting to `deny`. File tools
use the primary when `directory` is omitted. Supply a named directory ID to
target another root. Each root's rules apply independently. Native
commands additionally require a trusted `command` installation with `helper`
(a canonical `path` and a 32-byte `sha256` array), `runtimePaths`, and a
private `temporaryParent`. Linux also requires `bubblewrap` with its own path
and digest. Installed executables, host state, credential homes, and the launch
profile have additional protections. This launch path supports macOS and Linux.

An action within an existing grant proceeds directly. An `ask` action creates
a retained approval for that exact command or file operation. One-shot `run`
reports pending `approvals` in its `input_required` record. An attached ACP
client can negotiate `co.grida/session/approvals` to read pending requests.
Only the private supervising stdio client can negotiate
`co.grida/session/answer-approval` and reply with `approve_once` or `decline`.
Continuation rechecks the launch profile and native identity before dispatch.
Unverified command cleanup surfaces uncertainty and stops automatic queue
advancement.

### Run commands as chat processes

With command rules, Act turns offer two tools. `exec_command` takes `cmd`,
optional absolute `workdir` (default: the selected directory's root), `tty`,
`yield_time_ms` (default 10000, 250 to 30000) and `max_output_tokens` (default
10000; four bytes per token, capped by the turn's output limit), plus the
`access` and optional `directory` the approval covers. It runs `<shell> -c cmd`,
where the shell is the profile environment's `SHELL` when that is an absolute
path to an executable `sh`, `bash`, `zsh` or `dash`, and `/bin/sh` otherwise.
It is never a login or interactive shell. The environment follows the profile.
With `tty` the command gets a pseudo-terminal; otherwise stdin is closed and
stdout and stderr share one stream. On macOS, `/bin/sh` reads
`/private/var/select/sh`; a profile without disk read should list
`/private/var/select` in `runtimePaths`.

The call collects output until the wait ends or the command ends. A command
that ends within the wait reports its exit and is not kept. One still running
is kept by the chat under the next process number, which is never reused for
that chat while the host runs. `write_stdin` takes that `session_id`, optional
`chars` (empty polls), `yield_time_ms` (writes: default 250, at most 30000;
polls: 5000 to 300000) and `max_output_tokens`. A pipe process accepts only
`"\u0003"`, delivered as an interrupt; a terminal process receives the
characters. A call's wait ends two seconds before its operation deadline. It
needs no approval of its own and reaches only the calling chat's processes.
The response text is:

```text
Wall time: 1.2345 seconds
Process exited with code 0          (or: Process running with session ID 3)
Original token count: 12            (only when output was shortened)
Output:
<output>
```

A process ended by a signal or a stop reports `Process terminated by signal N`
or `Process stopped` instead of an exit code. Long output keeps its start and
end around a `…N tokens truncated…` marker; output the process buffer dropped
is marked `[N bytes of earlier output were dropped]`. Each process keeps up to
1 MiB of unread output. Once a process's end has been reported, its number is
unknown.

Ending, stopping, pausing or restarting a turn and waiting for approval leave
processes running. A call cut short by its turn's cancellation still keeps
the process. Revoking the directory, `write_stdin` with Ctrl-C, the
`co.grida/session/processes` stop operation, deleting the chat and host
shutdown stop them; shutdown waits for verified cleanup within its deadline
and exits uncertain otherwise. A chat keeps up to 64 processes: starting
another stops the least recently used one that is not among the eight most
recently used or in use, preferring ended ones. A process ends after 24 hours,
and the native helper ends it if the host process disappears. Recovery after
a restart reports an unaccounted `exec_command` or input as uncertain; an
empty poll runs again.

### Review one configured read

A trusted launcher can add `automaticReadReview` to its permission profile
for one exact UTF-8 file read in a directory whose `read` rule is `ask`:

```json
{
  "automaticReadReview": {
    "directory": "reference",
    "relativePath": "brief.txt"
  }
}
```

The launch still asks about every other action that requires approval. An
eligible turn can use one generation from its existing step budget for review,
with up to 128 output tokens and a 10-second deadline. The reviewer receives
the latest bounded user request from the inference that proposed the read and
the relative path. It has no tools. The selected provider is the same as for
the task, and usage is recorded with the turn. The review can approve or
decline the exact pending action. The existing file authority still checks
that action at execution, and an earlier manual decision takes precedence.

An invalid or interrupted review leaves the approval available for manual
resolution. Pending approvals can report `reviewFailure` as `timed_out`,
`interrupted`, `unavailable`, or `invalid_reply`. The chat does not stream the
reviewer's reply. Keep the same trusted profile when resuming. Goal work uses
manual approval, and the Desktop permission picker does not select this profile.

Run the opt-in ACP approval fixtures on macOS with Bash and Seatbelt. On
Linux, use Bash, `setsid`, and a trusted non-setuid bubblewrap installation
with unprivileged user and PID namespaces. On Linux, set
`AGENT_KIT_TEST_BWRAP` to the bubblewrap executable's canonical path.
From the workspace root, build and select the private helper.

```sh
cargo build --locked -p agent-kit-sandbox --bin agent-kit-sandbox-helper
GRIDA_AGENT_TEST_SANDBOX_HELPER="$PWD/target/debug/agent-kit-sandbox-helper" \
  cargo test --locked -p grida-agent --test process -- approvals:: --include-ignored --test-threads=1
```

The suite retargets a folder alias into a protected root while review is
pending. The Linux cases also exercise local socket denials and stop detached
work through private ACP. The fixtures use synthetic loopback provider
responses and disposable files.

Persistent goals are available through negotiated ACP and the embedded Host.
The initial work and explicitly authorized automatic follow-ups use the same
owned scheduler. A claim and its reservation commit together. Only reserved
turns receive the goal tools. See the
[agent client guide](../../docs/agent/clients.md#work-toward-a-persistent-goal).

With `serve --stdio --subagents` and a compatible provider, a private ACP
client can negotiate effort and pass `"effort":"ultra"` on Goal Start. The
goal needs at least three inference steps. Each eligible turn reserves two
for one text-only reviewer within the goal's existing allowance. The parent
and reviewer charge their recorded attempts against that allowance. Use
the ordinary task Pause, Resume, and Stop controls while the funded turn
owns work. If the review is still unsettled when the parent finishes, Goal
Recover can account for it once its outcome is known. See the
[Goal client contract](docs/rust-client-protocol.md#persistent-goal-operations).

A private supervised Gateway client can negotiate `co.grida/goal/spending`
version 1 and add `maxCostMills` to Goal Start. This is an exact USD-mills
string, independent of inference steps: `"1000"` authorizes at most USD 1.
The positive amount supports up to eighteen integer and eighteen fractional
mill digits. The initial ceiling is divided, rounding down, across the Goal's
total inference-step allowance. Each generation receives at most that fixed
partition and the still-available task authority; parent and funded reviewer
share one retained allocation. At most 4,096 generation steps are supported by
this profile. An amount too small to give every step a positive partition is
rejected.
This equal partition is a product policy, not a price estimate: a large-context
or high-output request can be rejected even when the task has more money left.
Choose the monetary ceiling and inference-step allowance together. Settlement
releases unused authority into the shared pool but does not raise the fixed
per-request maximum or silently reduce the model's request.

Every capped generation uses the separate
`/api/v1/ai/chat/completions/capped` route and an exact
`X-GG-Max-Cost-Mills` header. The server requires Gateway execution and forwards
that ceiling under its existing workload authority. Gateway rejects an
excessive reservation before paid dispatch. A missing route never falls back
to ordinary chat, and BYOK/custom/subscription connections cannot accept this
monetary policy. This does not compute prices locally or reserve organization
credits in the agent. See the [Gateway authorization contract](https://gateway.grida.ai/llms.txt).

Capped work withholds media generation, MCP and editor tool hosts, and Library
selection. Local structured files, image inspection/cropping and confined
commands remain subject to their existing permissions; raw command and hook
networking stays denied. Paid model work, including the funded reviewer, must
pass through the same capped Gateway owner. A retained input with an unsupported
tool host is rejected rather than continuing under a narrower spend promise.

Goal inspection exposes `spending` with the maximum, per-request ceiling,
authoritatively charged amount, held partitions, remaining authority and
`unsettledAttempts`. An interrupted or pending-billing attempt retains its
entire partition. Verified failure before HTTP dispatch costs zero. An original
Gateway settlement, including an explicit billing refresh for a retained
attempt, releases only the unused partition; duplicate settlement cannot
increase authority. Stop and restart retain these records. Reopening and
inspection do not execute inference. A missing or corrupt spending record
blocks continuation and cannot be recreated by retrying Goal Start. Preserve
the complete native state directory when recovering a capped Goal.
Rejected Goal admission does not publish monetary authority, so the same input
identity can be corrected before acceptance. If durable acceptance succeeds
but monetary publication fails, the task remains accepted and cannot dispatch;
an exact retry cannot create replacement authority.
Saved-chat deletion retires only that parent's local task authority after its
owned work is excluded. Removing a child does not remove the parent's shared
authority, and deleting local records never refunds remote pending charges.

An opted-in private ACP submission can schedule one wake-up for its own task.
Goal Start can also opt in for the first Standard Act reservation. The timer
uses that same turn and its inference allowance. Automatic Goal follow-ups
receive no check-in permission from that input.
The native host owns the timer and uses the ordinary task scheduler to claim
continuation. Closing the host releases its timers while preserving their
recorded due times and delivery state. A private client explicitly recovers the
selected wake-up after restart. Inspecting or loading a chat leaves it idle.

### Verify a goal's observed file bytes

A trusted `--permission-profile` can select files and their expected SHA-256
digests. This example expects the exact UTF-8 bytes `approved` followed by a
newline in `manifest.txt` under the existing `reference` directory ID.

```json
{
  "goalReadVerification": {
    "directory": "reference",
    "relativePath": "manifest.txt",
    "sha256": [
      127, 133, 24, 247, 219, 94, 154, 85, 4, 159, 73, 196, 234, 109, 110, 143,
      80, 150, 149, 35, 30, 96, 203, 214, 7, 188, 179, 108, 136, 167, 90, 20
    ]
  }
}
```

Use the following exact criterion for that example.

```text
Observe SHA-256 7f8518f7db5e9a55049f49c4ea6d6e8f509695231e60cbd607bcb36c88a75a14 for directory "reference", path "manifest.txt".
```

For multiple criteria, use `goalReadVerifications` in place of
`goalReadVerification`. Supply an array of up to 16 distinct rules with the
same fields, and give the Goal one exact criterion per rule.

The Goal turn reads each file using `read_file` with the explicit directory ID
and relative path, then cites its retained call for that criterion in
`goal_report`. The host independently checks the complete recorded bytes at
settlement. The profile's read permissions still apply. Reopening the chat
preserves the verification for the bytes observed in that turn.

## Use headless presentation

Add `--headless-surface` to native `run` or unsupervised `serve --stdio`
to offer `surface_open` to Act prompts. It shares the standalone MCP
server's capability definition and reports that presentation was unavailable.
It grants no filesystem access. Native and explicitly selected MCP tools
can be offered together. A suspended turn keeps its captured set of tools.

## Use a trusted local MCP tool

Add the four MCP flags to a configured `run` or unsupervised `serve --stdio`
launch. Supply the peer's exact numeric loopback HTTP endpoint and a separate
environment variable for its bearer credential. Use a lowercase alphanumeric
source ID. Repeat `--mcp-tool` for each exact tool name you want to authorize.
The model sees the selected names with an `mcp_<source>_` prefix.

```sh
target/debug/grida-agent run --state-dir "$GRIDA_AGENT_STATE" --cwd "$PWD" \
  --endpoint "$GRIDA_AGENT_ENDPOINT" --model "$GRIDA_AGENT_MODEL" \
  --credential-env OPENAI_API_KEY \
  --mcp-endpoint http://127.0.0.1:8766/mcp --mcp-source grida \
  --mcp-token-env GRIDA_MCP_SERVER_TOKEN --mcp-tool surface_open
```

Choose a peer you trust with the tool arguments and any effects it can cause.
Act prompts can use the explicitly selected tools. Plan, side chats, and
goals omit them. A launch in Plan mode skips MCP discovery. A suspended input
can continue with its original lease while the host still owns it. Restart
the host after a connection loss to capture a new lease. Stop retained work
or withdraw queued input before submitting a fresh request. A queue edit
cannot change its MCP lease. An interrupted effect is uncertain. The client
never retries it.

The profile supports stateless 2026-07-28 Streamable HTTP with bounded JSON
and SSE replies. The server validates the schema and owns tool effects.
The client checks for bounded object input and captures the schema descriptor.
It excludes tools requiring parameter headers, external schema references,
and server-initiated input. It projects text and structured output and
leaves resource links unopened. Embedded callers can compose the same adapter
with `mcp_client::McpClient::connect` and `Host::with_mcp_client`.

## Run a confined external ACP peer

On macOS and Linux, a trusted launcher can select one reviewed local ACP
peer in the source-built executable. Supply an existing private state
directory and an absolute, private profile file. The profile and state
directory must be outside the peer's readable roots.

```sh
printf '%s' 'Summarize the selected workspace.' | target/debug/grida-agent run-external \
  --profile /absolute/private/external-acp.json \
  --state-dir /absolute/private/external-state
```

The profile is JSON. Store it with mode `0600` in a private directory.
The state and temporary directories use mode `0700`.

```text
version          1
cwd              absolute canonical workspace directory
executable       { path, sha256 } for the reviewed system executable
arguments        optional literal argument strings
helper           { path, sha256 } for the matching sandbox helper
bubblewrap       { path, sha256 } for non-setuid bubblewrap on Linux, omitted on macOS
runtimePaths     absolute paths required to run the selected executable
temporaryParent  absolute private directory for sandbox scratch
protectedPaths   optional additional paths to deny
```

Each digest contains 32 byte values. The workspace is read-only, and the
peer receives no inherited credentials, Grida tool grants, or network access.
The prompt is UTF-8 and limited to 64 KiB. Use `--prompt` or stdin, and
`--deadline-ms` to set the run deadline.

The launcher writes the usual `accepted` and `finished` JSON Lines with the
same session, turn, and input IDs. Both records declare the driver as a local
confined ACP process that accepts text, preserves a local receipt, and can
stop its owned process. The external account includes bounded peer text and
observed cleanup. A process signal requests Stop for the
admitted turn. An unconfirmed handoff reports `uncertain` and is not replayed.
Use `inspect --state-dir DIRECTORY SESSION_ID` to check its retained receipt.
Each new invocation opens an independent turn and peer process.

## Embed a confined ACP peer

A trusted Rust embedding running on Tokio on macOS or Linux can use
`grida_agent::acp::external::ExternalAcpDriver` with
`agent_kit_sessions::Sessions` and its existing store. This profile runs one
text turn in a fresh, owned ACP v1 stdio process. The launcher selects the
reviewed system executable, pinned digest, exact arguments, read and runtime
roots, and a deadline. The driver requires a read-only workspace scope, sends
no inherited credentials or MCP servers, and denies peer requests for
permissions, files, or terminals. The native sandbox denies networking.

Use `driver.configuration()` when creating the session and
`ExternalAcpDriver::submission` when accepting the identified prompt. The
driver rechecks the same turn grant before launch and before prompt dispatch.
Stop sends cancellation to the peer and waits for bounded local cleanup
evidence. A retained handoff without a verified receipt settles as uncertain
on recovery. A Pause before handoff can resume the same input. A new turn
opens a new peer process.

## Run named child work from a private launcher

Use `serve --stdio --subagents` with an Act launch. The trusted launcher can
use a direct provider or a bounded supervised Grida Gateway scope.
During ACP initialization, negotiate version 1 separately for
`co.grida/subagent/create`, `list`, `assign`, `send-message`, `inspect`, `pause`, `resume`,
`steer`, `stop`, `resume-queue`, and `withdraw`. Callers attach to the
parent through the ordinary session API. Children have their own stable IDs
and history and are absent from ordinary chat listing and load.

- Create supplies `parentSessionId`, `requestId`, `name`, and
  `workTurns` from 1 through 8. Repeating the creation returns its original
  `childId`. Names are display labels.
- List supplies the attached `parentSessionId` and an optional
  `afterChildId` from that parent's previous page. It returns up to 32
  `children` with `childId` and `name`, newest first, and
  `nextAfterChildId` when more remain.
- Assign supplies `parentSessionId`, `childId`, `parentTurnId`,
  `inputId`, and text `instructions`. The parent turn must have settled
  in Act. Assignments wait in acceptance order within the remaining work-turn
  allowance. A follow-up reuses the child's prior context.
- Send Message supplies `parentSessionId`, `childId`, `inputId`, and up to
  4 KiB of `text`. Up to 16 messages can wait for the next approved assignment.
  Messages are retained in order as informational context and leave the
  child's execution and allowance unchanged. An exact retry returns the
  original input position and its current disposition.
- Inspect supplies the parent and child IDs and an optional `inputId`.
  An assignment includes the original turn, retained result, and
  `messageInputIds` selected for that turn. Its `instructionPreview` is
  capped at 1024 UTF-8 bytes and `instructionTruncated` reports omissions.
  Without an input ID, `observedAssignment` identifies the current or latest
  child turn and its exact assignment. A message inspection returns its
  retained text and delivery disposition. Evidence of model input comes
  from the selected turn's inference record. Inspect also reports
  `queuedInputIds`, `pendingMessageIds`, and `admissionPaused`.
  Listing and inspection leave execution unchanged.
- Pause and Stop supply the parent and child IDs, child `turnId`, a fresh
  `requestId`, and the observed `expectedSessionRevision` and
  `expectedControlRevision`. Stop ends the active assignment and holds
  advancement of its queue.
- Resume supplies those fields under `task`, along with
  `expectedEpoch` and `expectedJournalPosition` from the suspended turn.
  It resumes the original assignment.
- Steer supplies the same `task` fields, `expectedHistoryPosition`, and
  text `instructions`. A paused assignment waits for explicit Resume.
- Resume Queue supplies the parent and child IDs, `requestId`, and
  `expectedSessionRevision`. Withdraw supplies those fields under `queue`
  and a queued `inputId`. Withdrawing a queued input releases its place
  within the allowance.

The launcher explicitly allocates the child allowance. A claim reserves one
work turn, including interrupted work. New assignments capture up to two
generation steps with the selected output-token allowance per step. The
assignment receipt exposes `maxGenerationSteps`. The child receives its
own history and the supplied instructions. It has no workspace tools, MCP, goals,
scheduled work, or model-driven delegation. The settled parent turn provides
attribution. Resuming a turn or queue, steering, new messages, and new assignments require
the original verified provider principal and scope. A launch without that
continuity can inspect, retry an existing message receipt, withdraw queued
inputs, pause, or stop retained work.
Shared funding and active parent-tree controls belong to a separate delegation
composition.
