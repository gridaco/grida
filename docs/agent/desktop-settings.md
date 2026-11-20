---
title: Desktop settings
description: Find account and provider settings, inspect global hooks, and restore archived chats in Grida Desktop.
keywords: [Grida Desktop, settings, hooks, archived chats, providers]
format: md
---

# Desktop settings

Open Settings from the application menu, or press **Command+,** on macOS.
Settings opens in its own window; opening it again focuses that window.
Select a category in its sidebar:

| Category        | What it contains                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Account         | Your Grida account and sign-out action.                                                          |
| Appearance      | Light, Dark or System theme, remembered on this device.                                          |
| Chat            | Next-prompt suggestions for the empty chat composer.                                             |
| Browser         | [Downloads, site permissions, shared history and browser cleanup](../editor/desktop/browser.md). |
| Credits         | Your Grida AI credit information.                                                                |
| LLM Providers   | ChatGPT subscription, API-key providers and compatible text-model endpoints.                     |
| Media Providers | Connections for image, video, audio and 3D generation.                                           |
| Hooks           | Global hook definitions, configuration diagnostics and command trust review.                     |
| Archived chats  | Archived chats across local workspaces, with an Unarchive action.                                |
| About           | Desktop version and platform information.                                                        |

## Suggest the next prompt

Turn on **Chat → Suggest the next prompt** to let Grida suggest a follow-up after a successful reply. The preview starts off. An eligible reply in an open, empty composer can trigger one additional model request using that chat’s connection and retained context. Provider rates or usage limits can apply even if you ignore the suggestion.

For hosted chats, Grida looks for its economy model on the same connection and account. For example, a ChatGPT subscription can supply the suggestion even when you have also connected OpenRouter. Your conversation keeps its selected model. If the economy model is unavailable, the composer stays empty. A local connection, including Ollama at its default `http://localhost:11434/v1` address, can use its configured model.

Press **Tab** to put the full suggestion into your draft. Edit it and press **Send** when ready, or start typing your own message to dismiss it. Turning the switch off clears suggestions across open windows and cancels requests still waiting for a model or authorization. Turning it back on applies to future replies. A request already sent to the provider can still count toward usage. Any text you already accepted stays in your draft.

The switch reads and writes the user-wide `~/.grida/config.toml`. An absolute `GRIDA_HOME` selects a different Grida home. To enable the feature by hand, set this boolean in the global file:

```toml
schema_version = 1

[desktop]
composer-predictions-enabled = true
```

Set the value to `false` to disable predictions. When editing an existing file, keep the single top-level `schema_version` and add the key to its Desktop table.

Desktop 0.7.0’s hook reader rejects the `[desktop]` table. Upgrade builds sharing this file before saving the setting, or give a concurrently used older build its own `GRIDA_HOME`. To reopen the same home with 0.7.0, remove the Desktop table and its fields, keeping `schema_version` and any `[[hooks]]` entries.

## Compatible endpoints and Ollama

In **LLM Providers → Ollama**, choose **Set up Ollama**, check the Base URL,
then choose **Connect**. Saving an edited address authorizes that address.
Grida remembers the connection on this device, including after you quit and
reopen Desktop. Model discovery and opening Settings reuse the connection
without another approval dialog.

If a saved endpoint needs to be connected again, choose **Connect** beside
its configuration. An address changed outside Settings needs this explicit
action before Desktop uses it. Choose **Remove** to disconnect the endpoint.

## Hooks

Hook definitions come from the user-wide `~/.grida/config.toml`, or
`$GRIDA_HOME/config.toml` when that absolute override is set. The Hooks category
shows the source path and configured commands, lets you review their trust,
and opens or reloads the configuration. Define, disable and remove hooks by
editing the TOML file. Workspace hook configuration and JSON imports are not
supported by this Desktop feature.
[Configure hooks](./hooks.md)

## Archived chats

Each row identifies a chat and its workspace. Choose **Unarchive** to return it
to that workspace's active chat list. This does not open the chat, start model
work or resume an unfinished turn. Archiving a chat still happens through that
chat's options menu. Archive browsing and restoration live in Settings.
Compatible builds also show the last turn's activity date, with the full local
date and time on hover. This is when work last finished or, while unfinished,
started; it is not the archive date. A chat without a recorded turn shows no
date.
[Reopen or organize a chat](./history.md#reopen-or-organize-a-chat)

These categories require a Desktop build with their native capabilities. An
older shell can load the new Settings layout while reporting that a category
requires a Desktop update.
