---
title: Change agent settings
description: Set a workspace's context input limit in its configuration file.
keywords: [agent settings, context limit, configuration, Grida Desktop]
format: md
---

# Change agent settings

The context input limit caps how much material the agent sends to the model
in one request. It is the one supported agent setting. Without it, the agent
budgets input automatically, and the ring beside the model picker shows how
full the context is.
[See how full the context is](./models-and-usage.md#see-how-full-the-context-is)

Grida Desktop has no control for this setting, and a Desktop chat cannot ask
the agent to change it. On macOS and Linux, edit the workspace's
configuration file instead.

## Set the limit for a Desktop workspace

1. Quit Desktop.
2. In Desktop's application data folder, open `native-chat/workspaces/`. Each
   workspace has its own folder there, named by a digest of the workspace
   rather than its path. Desktop does not show which folder belongs to which
   workspace, so pick the one used most recently by the workspace you mean.
3. Create or edit `config.toml` in that folder, for example:

   ```toml
   schema_version = 1

   [context]
   max_input_tokens = 64000
   ```

4. Start Desktop and open the workspace. The new limit applies to messages
   you send from then on; work that is already running, paused or queued
   keeps the value it started with.

A hard limit needs a connection that can count its requests exactly. If it
cannot, or a request is larger than the limit, the turn fails before the
model starts answering. Remove `max_input_tokens` to return to automatic
budgeting. An invalid file prevents the workspace's chat from starting.

## Change it from a client

Source-built headless runs read the same file from the state directory you
choose. ACP clients can also inspect, change and reload the limit, and can let
the agent request a reviewed change for one message.
[Agent configuration reference](../reference/agent-configuration.md)
