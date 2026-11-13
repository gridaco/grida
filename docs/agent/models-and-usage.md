---
title: Choose models and understand usage
description: Pick a model for a Desktop chat, recover a connection, and see how full the context is.
keywords:
  [agent models, model providers, API keys, context usage, Grida Desktop]
format: md
---

# Choose models and understand usage

Available in Grida Desktop on macOS and Linux. Headless and ACP clients choose
their provider and model when they start the host.
[Connect an agent client](./clients.md#build-the-host)

The model connection decides which inputs and tools a Desktop chat offers.
Desktop can run chat on:

- **Grida Gateway**, the default, under your Grida account;
- a saved **OpenRouter** or **Vercel AI Gateway** key;
- an approved compatible endpoint, which can use a key saved under its own ID.

A Desktop build started from source or an Insiders build can also use your
**ChatGPT subscription**, which takes text only.

An endpoint on another device must use HTTPS; plain HTTP works only for
`localhost` or `127.0.0.1`. A saved HTTP endpoint on another device stays in
Desktop settings but cannot run chat.

## Choose a model

1. Select the model button at the bottom right of the composer. It shows the
   current model followed by its effort.
2. In the panel that opens, select the model name above the **Effort**
   slider.
3. Choose a model under **Select model**. **Default** is Grida's recommended
   model. Use **Refresh models** after adding a key or endpoint.

You can change the model between turns: the chat and its history stay in
place, and your next message uses the new model with the earlier turns as
context. A running or paused turn keeps the model that started it, so change
the model after the turn ends; resuming a paused turn continues on its
original model. Send or remove any pending attachment before changing the
model.

Desktop reopens a workspace with the model you chose there last, including
after a restart. If that model can no longer run, the workspace opens with the
default model. If the default Gateway connection cannot start, Desktop
continues with a saved OpenRouter or Vercel AI Gateway key, using Grida's
default model when that key offers it. Only when no connection can run does
the composer show **Choose model** with a prompt to add a provider.

Grida lists its current Gateway models that can use tools. Add an OpenRouter or
Vercel AI Gateway key, or save and approve a compatible endpoint in Desktop
settings, to see those models too. A model in the list is not a promise that
your key, credits or model access work; send a short message to check.

Chats belong to the workspace, not to a model: every model in the workspace
shares its chat list. A chat started under your Grida account continues with
models from that account, and a chat started with a locally saved key or
endpoint continues with local keys. Removing a key or changing an endpoint
makes that model unavailable until you restore it; choose another model to
continue.

A local llama.cpp endpoint can also appear as a separate **llama.cpp
counting** connection. Choose it when the workspace has a context input limit
and you want the endpoint to count each request against it.
[Change agent settings](./settings.md) ·
[Configure local request counting](../reference/agent-configuration.md#configure-local-request-counting)

## Known limits

- A reply on a Grida Gateway model is limited to at most 4,096 output tokens.
  A very long reply, such as a large file written in one step, can stop at
  that limit, and the turn says it reached its output limit. Split the request,
  or use your own OpenRouter or Vercel AI Gateway key: models listed in Grida's
  model catalogue then use their own, larger output limit.
- If the model sends a tool request Grida cannot read, the turn ends and shows
  **Worked for … · result uncertain**. Send a new message to continue, or
  choose another model.

## Recover a connection

- If chat asks for an API key, add a key for that provider in Desktop
  settings, then open the model picker, choose **Refresh models**, and pick
  the model again or choose another one.
- If an endpoint needs approval, save it in Desktop settings and approve its
  address in the dialog, then refresh models and pick it.
- If chat requires HTTPS for an endpoint on another device, change its saved
  address to an HTTPS endpoint and approve the new address.
- If the selected model is unavailable, choose another model under
  **Select model**.
- If chat says it is already running in as many projects as Desktop keeps
  open at once, quit and reopen Grida Desktop, then choose **Retry**.

A network sign-in page that redirects requests can block provider access.
Grida does not forward your provider API key to another destination, and
provider requests stay separate from browser sign-in cookies.

If the provider rejects a request because of a rate limit and gives a short
delay, Grida can try once more on the same model. The turn keeps running while
it waits; use the composer's Pause button if you don't want to wait. To use
another provider, choose a different model after the turn ends.

If a connection's reply ends without a clear finish, the turn shows
**Worked for … · result uncertain**. Reopening the chat does not send the
request again; review any partial work before asking again.

## See how full the context is

The ring beside the model picker shows how much of the selected model's
context window the chat uses. After a reply, it uses the size the model's
provider reported for the latest request: the agent's instructions, its tool
definitions and results, and the conversation. Before then, it estimates from
the visible conversation. The tooltip and breakdown say whether the value is
**Estimated** or **Reported by provider**. Hover it for the percentage and
token count; open it for a breakdown by user, assistant, tools and other
content, where other covers instructions and tool work you don't see in the
chat. The ring appears once the model's window is known.

When the earlier conversation grows large, Grida summarizes it before the next
message and shows **Conversation auto-compacted** in the chat; open the note
to read the summary. To do this yourself in an idle chat with nothing queued,
type `/compact` and send it on its own. The full transcript stays visible
either way. [Continue a long conversation](./history.md#continue-a-long-conversation)

## Usage and charges

Desktop does not show per-request charges in the chat. Use the connection's
billing record for totals and individual charges. Desktop goals have no
spending limit; a client that starts a goal on a Grida connection can set one.
[Set a goal's spending limit](./clients.md#set-a-goals-spending-limit)
