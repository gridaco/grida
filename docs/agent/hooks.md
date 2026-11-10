---
title: Automate lifecycle checks
description: Require a final answer or run a reviewed read-only command before a headless Act task completes.
keywords: [agent hooks, completion checks, headless agent, Grida]
format: md
---

# Automate lifecycle checks

Source-built native clients can ask Grida to check the result of a task
before marking it complete. For example, require a final answer, or run a
reviewed read-only command that checks a workspace manifest after an **Act**
turn. Select these checks in the trusted launch configuration.

## Choose what counts as complete

- Use `--require-completion-text` to require a nonblank final answer.
- Configure one completion command in the native permission profile.
  Choose a **required** check to block completion when the command
  rejects or fails. Choose an **observational** check to record the result
  while leaving the completion decision in place.

A completion command runs with its reviewed executable and read-only
workspace scope. You can keep general command tools out of the chat while
using the check. [Configure a workspace manifest check](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#check-a-workspace-manifest)

## Read a check result

The completion account distinguishes a rejected result from an execution
failure, such as an exceeded deadline or output limit. A failed required
check keeps the agent's earlier reply and recorded work available for
review. **Pause** and **Stop** still apply. Continue with the same launch
configuration when resuming a task that retained a check.
[Require a completion check](./clients.md#require-a-completion-check)
