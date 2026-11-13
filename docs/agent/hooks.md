---
title: Automate lifecycle checks
description: Review trusted workspace checks, control when they run, and inspect their recorded results.
keywords: [agent hooks, lifecycle checks, completion checks, permissions, Grida]
format: md
---

# Automate lifecycle checks

Lifecycle checks can add project context, inspect a proposed tool action, or
require verification before a task finishes. Native Desktop workspace chats and
trusted headless hosts use the same recorded checks. A check cannot grant
access that the task did not already have.

New projects start with no registered checks. Creating their first chat does
not require an existing check definition or an earlier chat.

## Register a check in Desktop

1. Open a workspace chat and choose **Lifecycle checks…** from the chat options menu.
2. Choose **Import check…** and select its JSON definition. An agent can help
   prepare the definition; it cannot trust executable code for you.
3. Review the event, exact command and arguments, workspace, deadline and
   required/observational behavior in the native dialog. Choose **Trust and save
   check** only when those match your intent.
4. Restart Desktop to activate saved changes. Running and paused work keeps
   its captured checks. Restoring a paused task requires its original selection;
   a changed selection refuses continuation rather than silently replacing it.

Checks use a pinned canonical system executable, literal reviewed arguments,
read-only workspace access and no network. Project-local executable programs are
not accepted. Selecting a project or reading a definition does not execute it.
For example, this required completion check looks for a workspace manifest:

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

| Event               | Observable boundary                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `session_start`     | Each accepted turn begins, or its explicit Pause→Resume starts execution again. This is not once per saved chat. |
| `before_input`      | Accepted input is about to enter model/tool work.                                                                |
| `before_tool`       | Complete validated arguments are ready, before effect admission.                                                 |
| `after_tool`        | The actual tool outcome is recorded; its result remains intact.                                                  |
| `before_completion` | A successful completion candidate is ready for verification.                                                     |

Tool events can name one exact `tool`, such as `read_file`. Omitting it selects
all offered model tools. Private check execution never recursively invokes
checks. Children that inherit workspace execution scope also inherit its checks.
Text-only reviewers do not gain workspace execution access just to run a check;
parent checks can still inspect the delegation arguments. Plan still withholds model commands; trusted
read-only checks can run in either Plan or Act.

A handler can allow or deny processing and contribute bounded, attributed
context. A completion check can request further verification within the task's
original allowance. It cannot override Stop, resume a paused task, or extend the
allowance. Settlement and interruption remain observable lifecycle events;
executable cleanup handlers are not offered.

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
longer available, Stop the unfinished turn and review its replacement for future
work; the replacement does not authorize replaying the old action.

Headless hosts select the same definitions in their trusted permission profile.
[Native hook configuration](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md)
and [completion checks](./clients.md#require-a-completion-check) describe the
executable contract and the retained final-text check.
