---
title: Grida Agent from the CLI
description: Run a Grida Gateway task, connect an ACP client, or run one confined local ACP peer.
keywords: [agent, cli, gateway, ACP]
tags: [cli]
format: md
---

# Grida Agent from the CLI

The source-built native CLI supports `grida agent run` for scripts and
`grida agent serve --stdio` for Agent Client Protocol clients. Select a Gateway
model and, when needed, a funding organization. Use a private state directory
to keep your chats across launches.

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
