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

| Category        | What it contains                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Account         | Your Grida account and sign-out action.                                                                      |
| Appearance      | Light, Dark or System theme, remembered on this device.                                                      |
| Personalization | Suggested prompts and web search.                                                                            |
| Browser         | [Link destinations, downloads, site permissions, history and browser cleanup](../editor/desktop/browser.md). |
| Credits         | Your Grida AI credit information.                                                                            |
| LLM Providers   | ChatGPT subscription, API-key providers and compatible text-model endpoints.                                 |
| Media Providers | Connections for image, video, audio and 3D generation.                                                       |
| Hooks           | Global hook definitions, configuration diagnostics and command trust review.                                 |
| Archived chats  | Archived chats across local workspaces, with an Unarchive action.                                            |
| About           | Desktop version and platform information.                                                                    |

## Personalization

These settings apply across your Desktop workspaces. Each control also reads
and writes the user-wide `~/.grida/config.toml`. An absolute `GRIDA_HOME`
selects a different Grida home.

**Web search** is on by default. In eligible ChatGPT Subscription chats, the
agent can search the live web when a question needs current information.
You can also ask it to search in your message.

## Suggest the next prompt

Turn on **Personalization → Suggested prompts** to let Grida suggest a follow-up after a successful reply. The preview starts off. An eligible reply in an open, empty composer can trigger one additional model request using that chat’s connection and retained context. Provider rates or usage limits can apply even if you ignore the suggestion.

For hosted chats, Grida looks for its economy model on the same connection and account. For example, a ChatGPT subscription can supply the suggestion even when you have also connected OpenRouter. Your conversation keeps its selected model. If the economy model is unavailable, the composer stays empty. A local connection, including Ollama at its default `http://localhost:11434/v1` address, can use its configured model.

Press **Tab** to put the full suggestion into your draft. Edit it and press **Send** when ready, or start typing your own message to dismiss it. Turning the switch off clears suggestions across open windows and cancels requests still waiting for a model or authorization. Turning it back on applies to future replies. A request already sent to the provider can still count toward usage. Any text you already accepted stays in your draft.

To set the same preferences by hand, edit the matching keys in the existing global file:

```toml
schema_version = 1
web_search = "automatic"

[desktop]
composer-predictions-enabled = true
```

Set `web_search` to `"automatic"` or omit the key to offer search in eligible
chats. Use `"disabled"` to block hosted search. The switch writes
`"automatic"` when on and `"disabled"` when off. Disabling hosted search can
block a queued request that already includes it.

Desktop reads an existing `"live"` setting as automatic. It reads older
`"on_demand"`, `"cached"`, and `"indexed"` settings as disabled.

If you upgraded from a build with the Fast mode switch, eligible chats use
their saved speeds even when your config still contains
`[features].fast_mode = false`. Choose **Standard** in the chat’s speed picker
to use standard speed again. [Choose a response speed](./models-and-usage.md#choose-a-response-speed)

Desktop 0.7.0’s hook reader rejects the `[desktop]` table. Upgrade builds sharing this file before saving the setting, or give a concurrently used older build its own `GRIDA_HOME`. To reopen the same home with 0.7.0, remove the personalization keys and tables introduced since that build, keeping `schema_version` and any `[[hooks]]` entries.

## OpenAI API project key

On macOS or Linux, open **LLM Providers → OpenAI API**. Create an API key in
the OpenAI project you want to bill, paste it into Settings, and choose
**Save**. For a restricted key, grant **List models** read access and
**Responses API** write access.
[OpenAI project keys](https://platform.openai.com/api-keys) · [OpenAI permissions](https://developers.openai.com/api/docs/guides/rbac)

Choose a model in the **OpenAI API · Project billing** picker group to use
that project for streamed text chat and agent tool calls. The same key appears
under **Media Providers → OpenAI API** and can generate images from text for
models with a direct OpenAI badge in the catalogue. The image tool uses the
first connected provider that can serve the request in its usual provider
order. A restricted key needs write
access to the Images API for generation. Removing the key from either
Settings tab disconnects it from both. [Choose a model](./models-and-usage.md#choose-a-model)

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
