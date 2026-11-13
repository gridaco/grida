---
title: Automate lifecycle checks
description: Review trusted workspace checks, control when they run, and inspect their recorded results.
keywords: [agent hooks, lifecycle checks, completion checks, permissions, Grida]
format: md
---

# Automate lifecycle checks

Lifecycle checks can add project context, inspect a proposed tool action, or
require verification before a task finishes. They are available on macOS and
Linux, in Grida Desktop workspace chats and in source-built headless hosts. A
check cannot grant access that the task did not already have.

New projects start with no registered checks. Creating their first chat does
not require an existing check definition or an earlier chat.

## Register a check in Desktop

1. Open a workspace chat and choose **Lifecycle checks…** from the chat options menu.
2. Choose **Import check…** and select its JSON definition. An agent can help
   prepare the definition; it cannot trust executable code for you.
3. Review the event, exact command and arguments, workspace, deadline and
   required/observational behavior in the dialog. Choose **Trust and save
   check** only when those match your intent.
4. Restart Desktop to activate saved changes. Running and paused work keeps
   its captured checks. Restoring a paused task requires its original selection;
   a changed selection refuses continuation rather than silently replacing it.

Checks use a pinned canonical system executable, literal reviewed arguments,
read-only workspace access and no network. Project-local executable programs are
not accepted. Selecting a project or reading a definition does not execute it.
For example, this Desktop check definition requires a workspace manifest before
the agent finishes:

```json
{
  "id": "require-manifest",
  "event": "before_completion",
  "executable": "/bin/sh",
  "arguments": [
    "-c",
    "if test -f manifest.json; then printf '%s' '{\"decision\":\"allow\"}'; else printf '%s' '{\"decision\":\"deny\",\"reason\":\"Manifest missing\"}'; fi"
  ],
  "mode": "required",
  "timeoutMs": 2000
}
```

Use a system executable available on the host. The reviewed executable's bytes
are pinned; a changed executable must be reviewed again. At most eight ordered
checks can be selected. **Remove** reviews the exact saved revision and applies
on the next restart. It does not withdraw an active task's checks.

## Choose when a check runs

| Event               | When the check runs                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `session_start`     | Each turn begins, and again when a paused turn resumes. This is not once per saved chat.      |
| `before_input`      | Your message is about to reach the model.                                                     |
| `before_tool`       | The agent has prepared a tool call with complete arguments, before it runs.                   |
| `after_tool`        | A tool call has finished; the check sees its result, and the result itself is kept unchanged. |
| `before_completion` | The agent is about to finish successfully, so the check can verify the result.                |

Tool events can name one exact `tool`, such as `read_file`. Omitting it selects
every tool the model can use. Checks do not trigger other checks. Subagents
that work in the project run the parent's checks too; a text-only reviewer
does not gain project access to run one, but the parent's checks can inspect
what it was asked to do. Read-only checks run with or without the **Plan**
badge.

A check can allow or deny the step and add short context that names its
source. A completion check can ask for more verification within the task's
original allowance. It cannot override Stop, resume a paused task, or extend
the allowance. Grida offers no check that runs when a task ends or is
interrupted.

## Inspect outcomes and recover

**Lifecycle checks** shows how many checks are active and saved, and each saved
check's event, tool, mode, source, executable and deadline. Choose **Refresh
checks** with a chat selected to see that task's latest check results. A required denial,
invalid reply, timeout or unavailable handler blocks dependent work. Later
ordered checks are identified as skipped. Observational failures remain
recorded without changing the original tool result. An after-tool failure never
conceals an effect that already happened.

Pause and Stop still apply. Reconnect, inspection and history reads execute no
checks. Restart reuses recorded outcomes; an interrupted command remains
uncertain until its existing recovery rules permit continuation. Earlier work
and the check diagnostic stay available for review. If the old executable is no
longer available, end the unfinished turn (in Desktop, pause it and send a new
message) and review its replacement for future work; the replacement does not
authorize replaying the old action.

## Add a check to a headless launch

Source-built headless hosts declare up to eight ordered checks in their trusted
permission profile, pinning each system executable by path and SHA-256, and
select it with `--permission-profile` on `run` or `serve`. The Desktop import
format above does not apply there.
[Configure lifecycle hooks](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#configure-lifecycle-hooks) ·
[Check a workspace manifest](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#check-a-workspace-manifest) ·
[Require a completion check](./clients.md#require-a-completion-check)
