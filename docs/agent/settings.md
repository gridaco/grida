---
title: Change agent settings
description: Set the workspace context limit in its configuration file and see when changes take effect.
keywords: [agent settings, context limit, configuration, Grida Desktop]
format: md
---

# Change agent settings

The context input limit controls how much material the agent can send to the
model as input. It is the one supported agent setting. By default the agent
budgets input automatically.

## Change the limit for a Desktop workspace

Desktop has no control for this setting, and a Desktop chat cannot ask the
agent to change it. Edit the workspace's configuration file instead:

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
   sent from then on.

The connection must be able to count its requests exactly for a hard limit. If
it cannot, or a request is larger than the limit, the turn reports a failure
before generation. Remove `max_input_tokens` to return to automatic budgeting.
An invalid file prevents the workspace's chat from starting.

## Check when a change applies

New defaults apply when Grida accepts a message. Active, paused and queued work
keep the values they already captured.

Headless and ACP clients can inspect, change and reload the same setting, and
can let the agent request a reviewed change for one message. The reference
covers supported values, scope and reloading.
[Agent configuration reference](../reference/agent-configuration.md)
