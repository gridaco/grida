---
title: Configure hooks
description: Define global Desktop hooks in config.toml, review their commands, and inspect configuration in Settings.
keywords: [agent hooks, global config, config.toml, Grida Desktop, automation]
format: md
---

# Configure hooks

Hooks run a configured command at a named point in the agent's work. They can
supply context, inspect a tool action, or verify a proposed completion.

Grida Desktop on macOS and Linux reads hook definitions from one user-wide file:

```text
~/.grida/config.toml
```

An absolute `GRIDA_HOME` override changes that location to
`$GRIDA_HOME/config.toml`. Hooks apply across Desktop workspaces. This first
version does not discover project files, plugin hooks, or separate JSON hook
configuration. Existing workspace `hooks.json` files are not loaded or copied
into the global file.

Headless sessions read context settings from the same file. Headless hook
execution requires a trusted launch permission profile.

## Add a hook

Open **Settings → Hooks**, then open the configuration file. Add an ordered
`[[hooks]]` table for each command. For example, this observational hook supplies
context when a turn starts:

```toml
schema_version = 1

[[hooks]]
id = "team-context"
event = "session_start"
executable = "/bin/bash"
arguments = ["-c", 'printf "%s" "$1"', "hook", '{"decision":"allow","context":"Team conventions: prefer small changes and include verification results."}']
mode = "observe"
timeout_ms = 2000
enabled = true
```

Use a system executable whose resolved path is in `/bin` or `/usr/bin`. Aliases
that resolve elsewhere are refused. In this example, Bash interprets the fixed
script and receives the JSON as a separate argument. Grida passes arguments
literally and does not expand a command string, environment variables, or `~` in
an executable path. Programs must meet the native host's system-executable
ownership and integrity checks. Arbitrary project-local or user-owned executables
are not supported in this initial version.

Save the file, reload it in **Settings → Hooks**, and review the command before
trusting it. Configuration is the source of definitions; review records permission
to execute the exact definition and executable. Editing the file does not grant
trust to a new or changed command. A stale review cannot approve newer contents.
An enabled hook awaiting trust, or invalid configuration, prevents new workspace
connections from starting. Review the command, fix the configuration or disable
the hook, then retry the connection. Existing work keeps its captured selection.

Fresh workspace connections capture the current trusted definitions. Existing
connections keep their captured hooks; restart Desktop to update all connections.
Running and paused tasks retain their captured selection. Changing hooks cannot
replace checks for unfinished work or authorize replay of an earlier action.
After a restart, resuming a paused task can be refused if its captured hook
selection no longer matches; restore that selection or end the task explicitly.

## Definition fields

The file requires `schema_version = 1` at the top level. Its `hooks` array
contains these fields for each command:

| Field        | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `id`         | Unique stable hook identifier.                             |
| `event`      | One of the five supported events below.                    |
| `executable` | Absolute path to a supported system executable.            |
| `arguments`  | Array of literal argument strings.                         |
| `mode`       | `required` or `observe`.                                   |
| `timeout_ms` | Deadline in milliseconds, from 1 through 30000.            |
| `enabled`    | Defaults to `true`; set `false` to disable the definition. |
| `tool`       | Optional exact tool ID for `before_tool` or `after_tool`.  |

At most eight hooks are supported. They run in configured order, with bounded
input, output and execution time. There are no regex matchers, background hooks,
MCP handlers, or model-based handlers in this version. Translate hooks from
other tools to the schema above before adding them.

## Events and results

| Event               | When it runs                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- |
| `session_start`     | A turn starts or a paused turn explicitly resumes; not merely when a chat view opens. |
| `before_input`      | The accepted message is about to reach the model.                                     |
| `before_tool`       | A tool call's complete arguments are ready, before execution.                         |
| `after_tool`        | A tool call has finished; its recorded result remains unchanged.                      |
| `before_completion` | The agent proposes finishing successfully.                                            |

A command reads a bounded JSON event on stdin, exits zero, and prints one JSON
reply on stdout. The smallest successful reply is:

```json
{ "decision": "allow" }
```

An allow reply can include a `context` string attributed to the hook. A required
check can refuse an action with a reason:

```json
{ "decision": "deny", "reason": "The expected manifest is missing." }
```

A completion hook can request another bounded verification step with
`{"decision":"continue","context":"Verify the generated manifest."}`. It cannot
extend task allowances, override Stop, or resume a paused task.

A required denial, timeout, malformed reply or unavailable handler blocks its
dependent action. Observational failures are recorded without blocking it.
An after-tool failure cannot undo or conceal effects that already happened.

Hooks run with the task's read-only workspace scope, private temporary storage
and no network. Global configuration does not grant access to other projects or
credentials. Subagents with inherited workspace access inherit the selected
hooks; text-only reviewers do not gain filesystem access to run them.

## Inspect, change or remove hooks

**Settings → Hooks** shows the configuration path, configured definitions,
trust state and configuration diagnostics. Opening Settings or reloading the
configuration does not execute the hooks. Resolve reported errors and review
new or changed commands before opening a fresh workspace connection.

Edit the TOML to change, disable or remove a hook, then reload and review as
needed. There is no import workflow or separate workspace hook configuration.
Removing a definition does not withdraw the selection held by running work.

For the native command event and result protocol, see
[Configure lifecycle hooks](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#configure-lifecycle-hooks).
