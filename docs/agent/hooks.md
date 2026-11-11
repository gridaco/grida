---
title: Automate lifecycle checks
description: Run trusted checks before a headless Act command or task completion.
keywords: [agent hooks, completion checks, headless agent, Grida]
format: md
---

# Automate lifecycle checks

Source-built native clients can ask Grida to check the result of a task
before marking it complete. For example, require a final answer, or run a
reviewed read-only command that checks a workspace manifest after an **Act**
turn. Select these checks in the trusted launch configuration.

## Check a command before it runs

A source-built headless Act host can select one required `beforeTool` command
in its trusted permission profile. The check receives a bounded `before_tool`
event with the proposed command arguments, including any explicit environment
values and standard input. It can allow or deny that command;
it cannot grant permissions the command did not already have. A denial appears
as a generic check failure. The handler's diagnostic stays in its private
record.

This first version checks `run_command` only and supports Standard Act Goals.
Plan and Ultra Goals, Desktop configuration, observational pre-tool checks, and
other tool events are not available with this profile yet. An unconfirmed check blocks later admissions in the same turn after it is
observed; actions already admitted in the same step may finish.
[Configure a trusted check](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#check-a-command-before-it-runs)

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
