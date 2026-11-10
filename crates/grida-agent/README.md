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

| `--provider`                  | Base URL example                                   | Request                                                                   |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `openai-compatible` (default) | `https://api.openai.com/v1`                        | Chat Completions with bearer authentication                               |
| `responses`                   | `https://api.openai.com/v1`                        | Stateless Responses with bearer authentication and encrypted continuation |
| `anthropic`                   | `https://api.anthropic.com/v1`                     | Messages with API-key and version headers                                 |
| `gemini`                      | `https://generativelanguage.googleapis.com/v1beta` | Stream GenerateContent with the selected model and API-key header         |

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

The Responses API adapter can count complete input before generation when an
input-token cap is configured. Counting sends the captured input to the same
provider under the same credential and deadline. Unsupported counting and
over-limit input return a persisted failure before generation.

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
`beforeCompletion` and the same primary `commandRead: "allow"` review.
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

Standard `session/prompt` streams its response. Durable submission and enqueue
acknowledge accepted input independently of completion. Exact input retries
return retained dispositions. Exact control retries reconcile their committed
request IDs. Read the [native client protocol](../../packages/grida-ai-agent/docs/rust-client-protocol.md)
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
to later inputs. The current compatible adapter rejects an explicit input-token
cap before generation when it cannot establish a hard bound.

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
`{"size":"…"}` as one JSON line. The second input contains decimal string
`offset` and `length`, followed on stdout by exactly that byte span on success.
The owning client supplies live process controls and any kernel launch profile.
The process rejects unproven hard links, mounts, and paths outside the granted
directory. The existing Desktop HTTP route still owns Range and MIME handling.

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

An opted-in private ACP submission can schedule one wake-up for its own task.
The native host owns the timer and uses the ordinary task scheduler to claim
continuation. Closing the host releases its timers while preserving their
recorded due times and delivery state. A private client explicitly recovers the
selected wake-up after restart. Inspecting or loading a chat leaves it idle.

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
