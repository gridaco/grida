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
| Browser         | [Downloads, site permissions, shared history and browser cleanup](../editor/desktop/browser.md). |
| Credits         | Your Grida AI credit information.                                                                |
| LLM Providers   | ChatGPT subscription, API-key providers and compatible text-model endpoints.                     |
| Media Providers | Connections for image, video, audio and 3D generation.                                           |
| Hooks           | Global hook definitions, configuration diagnostics and command trust review.                     |
| Archived chats  | Archived chats across local workspaces, with an Unarchive action.                                |
| About           | Desktop version and platform information.                                                        |

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
[Reopen or organize a chat](./history.md#reopen-or-organize-a-chat)

These categories require a Desktop build with their native capabilities. An
older shell can load the new Settings layout while reporting that a category
requires a Desktop update.
