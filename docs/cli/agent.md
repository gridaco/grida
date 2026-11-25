---
title: Grida Agent from the CLI
description: Run a Grida Gateway task, connect an ACP client, or run one confined local ACP peer.
keywords: [agent, cli, gateway, ACP]
tags: [cli]
format: md
---

# Grida Agent from the CLI

The source-built native CLI supports `grida agent run` for scripts and
`grida agent serve --stdio` for Agent Client Protocol clients. For both commands,
use `--provider grida` with a Gateway model and, when needed, a funding
organization. Use a private state directory
to keep your chats across launches.

Pass `--initial-title "Draft comparison"` to `grida agent run` to give the
chat a provisional title when its first message is accepted. ACP clients
can read the saved title with `session/list` for that workspace.

## Choose a question format

Pass one of the question flags per run.

- `grida agent run --questions` enables single-question requests. The command
  writes JSON Lines with `schema_version` 1. Pending question entries have
  top-level `question` and `options` fields.
- `grida agent run --questions-v2` enables question batches. The command writes
  JSON Lines with `schema_version` 2. Each pending batch contains a nested
  `questions` array. If your script reads batch output from Grida 0.8.0, switch
  to `--questions-v2` and accept schema version 2.

In either format, a required question returns `input_required` and exit code 6.
The result identifies the session, turn, and pending questions.
An unanswered optional question expires when the turn ends.

An ACP client can reopen the session and answer pending questions using the
matching methods. [Connect an ACP client](../agent/clients.md#connect-an-acp-client)

For setup, commands, exit codes, and the available client controls, see
[Connect an agent client](../agent/clients.md#use-your-grida-login).

## Run a local ACP peer

On macOS and Linux, `grida agent run-external --profile FILE --state-dir DIRECTORY`
gives one text prompt to a reviewed ACP v1 stdio peer. Supply an existing
private state directory and a matching native sandbox helper. The private
profile selects a system executable under administrator control, its digest,
the helper's path and digest, and the workspace and runtime paths. Linux
also requires compatible bubblewrap. The peer can read the selected workspace
and runs with networking denied.

Supply `--prompt` or close stdin after sending the text. Stdout carries JSON
Lines for acceptance and the final outcome, including the local receipt ID.
Each invocation starts a fresh peer process. See the
[confined peer profile and recovery reference](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-a-confined-external-acp-peer).
