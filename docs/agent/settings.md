---
title: Set context size and compaction
description: Set a workspace's model context window and automatic compaction threshold.
keywords:
  [agent settings, context window, compaction, configuration, Grida Desktop]
format: md
---

# Set context size and compaction

Grida uses a model's known context window to track context usage and decide
when to summarize earlier work. You can set a smaller context window or ask
Grida to summarize sooner. The context ring shows recent usage.
[See how full the context is](./models-and-usage.md#see-how-full-the-context-is)

The context settings live in the workspace's `config.toml`. Edit the file
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

   model_auto_compact_token_limit = 4096
   ```

4. Start Desktop and open the workspace. The settings apply to messages
   you send from then on.

Both settings are optional. The model window limits the assumed capacity.
The compaction threshold controls when Grida tries to summarize the context.
For a known window, the default threshold is 90% of that window and a
configured threshold is capped there. The provider still enforces its
own limits. An invalid settings file prevents the workspace's chat from
starting, and the error describes the problem.

The example lowers the threshold for trying automatic compaction in a real
chat. Complete two turns with enough text to reach the threshold, then send
another message. Grida can summarize the older turn and keeps the most
recent turn intact. The transcript shows **Context compacted**.

## Change it from a client

Source-built headless runs read the file from the state directory you choose.
A trusted ACP client with the configuration capability can inspect, set,
reset, and reload both settings.
[Agent configuration reference](../reference/agent-configuration.md)
