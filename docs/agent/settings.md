---
title: Set the context input limit
description: Set a workspace's context input limit in its configuration file.
keywords: [agent settings, context limit, configuration, Grida Desktop]
format: md
---

# Set the context input limit

The context input limit caps how much material the agent sends to the model
in one request. Without it, the agent
budgets input automatically, and the ring beside the model picker shows how
full the context is.
[See how full the context is](./models-and-usage.md#see-how-full-the-context-is)

The context budget lives in the workspace's `config.toml`. Edit the file
while Desktop is closed. The host loads it when you reopen the workspace.
Changes apply to new messages. Previously accepted work keeps the settings
it started with.

Global hooks use a separate user-wide `~/.grida/config.toml` and appear in
**Settings → Hooks**. [Configure hooks](./hooks.md) · [Desktop settings](./desktop-settings.md)

## Edit the file yourself

1. Quit Desktop.
2. In Desktop's application data folder, open `chats/workspaces/`. Each
   workspace has its own folder there, named by a digest of the workspace
   rather than its path. Desktop does not show which folder belongs to which
   workspace, so pick the one used most recently by the workspace you mean.

   | Platform | Application data folder                                       |
   | -------- | ------------------------------------------------------------- |
   | macOS    | `~/Library/Application Support/Grida`                         |
   | Linux    | `~/.config/Grida`, or `Grida` under `$XDG_CONFIG_HOME` if set |

   Grida Insiders uses a `Grida Insiders` folder in the same place.

3. Create or edit `config.toml` in that folder, for example:

   ```toml
   schema_version = 1

   [context]
   max_input_tokens = 64000
   ```

4. Start Desktop and open the workspace. The new limit applies to messages
   you send from then on.

A hard limit needs a connection that can count its requests exactly. If it
cannot, or a request is larger than the limit, the turn fails before the
model starts answering. Remove `max_input_tokens` to return to automatic
budgeting. An invalid file prevents the workspace's chat from starting, and
the error names the problem.

## Change it from a client

Source-built headless runs read the file from the state directory you choose.
A trusted ACP client with the configuration capability can inspect, set,
reset, and reload the limit.
[Agent configuration reference](../reference/agent-configuration.md)
