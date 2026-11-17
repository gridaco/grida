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

- your connected **ChatGPT subscription**;
- **Grida Gateway**, under your Grida account;
- a saved **OpenRouter** or **Vercel AI Gateway** key;
- an approved compatible endpoint, which can use a key saved under its own ID.

For a new chat with no saved or explicit model choice, Desktop prefers a ready
ChatGPT subscription, currently with **GPT-6.2 Sol** as its default. Your saved
or explicit choice takes precedence, including a saved model that has become
unavailable.

An endpoint on another device must use HTTPS; plain HTTP works only for
`localhost` or `127.0.0.1`. A saved HTTP endpoint on another device stays in
Desktop settings but cannot run chat.

## Choose a model

1. Select the model button at the bottom right of the composer. It shows the
   current model followed by its effort. While the effort panel is open,
   the button reads **Select effort**; entering the model list shows the model
   and effort again.
2. In the panel that opens, select the model name above the **Effort**
   slider.
3. Choose a model from your current connection's shortlist. **Show all models**
   reveals models grouped by connection and **Default**, Grida's recommended model.
   Search finds models across every connection. Without a known current
   connection, the full list opens. The list reloads when you open it and when
   you return to the window after changing a connection in Settings. Your current choice stays selected.
   If reloading fails, the previous choices stay visible with **Retry**.

You can change the model or connection between turns, including choosing a
different provider or account. The chat and its visible history stay in place.
Your next message uses the selected connection with earlier conversation as
context; private provider continuation and reasoning stay with their original
connection.

A selection change prepares future messages. Work already accepted keeps its
model, account, effort and funding through queueing, Pause, Resume, retries and
restart. If sending on your new choice needs a different shared connection,
Desktop explains which running, paused, queued or Goal work must finish or be
resolved first. Your saved choice and draft remain available; changing a
selection does not silently stop another chat's work. An older Desktop build
may require an update before using these controls.

Each chat remembers its own model connection and effort, including changes
made before sending. Switching to another chat or restarting Desktop restores
that chat's pair. Opening an older chat does not change the preference for new
chats. A new chat takes the complete pair from your last valid explicit change:
if you open a chat on Model A and change only effort to Medium, the next new
chat starts on Model A with Medium too.

If an interrupted first send left chat setup pending, changing model or effort
first finishes that setup without sending your message. The draft stays in
place. If setup still cannot be confirmed, the requested change waits rather
than creating another chat or guessing whether the message was accepted.

When a selected connection is unavailable, its choice stays visible until you
restore it or explicitly choose another one. A saved ChatGPT choice requires
the same subscription connection; signing out and reconnecting requires a new
choice. An older chat whose original connection cannot be identified asks you
to choose one rather than borrowing another chat's settings.

A selected file or nested deck window keeps its fixed model and inherits the
last chosen effort when starting a new chat. This does not change the saved
preference for ordinary project chats.

Grida lists its current Gateway models that can use tools. Connecting ChatGPT
adds its compatible models in a **ChatGPT Subscription** group. Add an
OpenRouter or Vercel AI Gateway key, or connect a compatible endpoint
in Desktop settings, to see those models too. A model in the list is not a
promise that your subscription, key, credits or model access work; send a
short message to check.

Chats belong to the workspace: every model connection shares its chat list.
Connecting a provider or refreshing the list leaves your selected connection
in place. Removing a key or changing an endpoint can make its saved selection
unavailable. Restore the connection to continue its accepted work, or resolve
that work before explicitly choosing another connection for future messages.

A local llama.cpp endpoint can also appear as a separate **llama.cpp
counting** connection. Choose it when the workspace has a context input limit
and you want the endpoint to count each request against it.
[Change agent settings](./settings.md) ·
[Configure local request counting](../reference/agent-configuration.md#configure-local-request-counting)

## Use your ChatGPT subscription

Open **Settings → LLM Providers → ChatGPT Subscription**, sign in with your
ChatGPT account, and return to Grida. When the card shows **Connected**, its
compatible models appear in the model pickers on Welcome and in a project.
Choose a model in the **ChatGPT Subscription** group to use your plan for a
new chat or an eligible next turn in an existing chat.

This integration is experimental. Model access depends on your ChatGPT plan,
workspace and the subscription service. The listed models come from Grida's
compatibility list; reloading the picker checks connection readiness rather
than discovering models from your account.

GPT-5.5 and GPT-5.4 have been withdrawn from subscription offerings. A saved
choice of either remains visible as unavailable. Choose an available model
explicitly; a refresh or changed default does not replace your saved choice.
OpenAI API model availability is separate from subscription access.

Subscription chats support text, tools and the model's available reasoning
settings. **Ultra** can run an independent reviewer on that same subscription
connection. Supported image attachments also send prepared pixels on the first
request, together with their verified source path when picked from disk.
Work accepted before a Desktop update keeps its earlier captured tools and
limits; use a new message for the expanded image workflow.
[Attach an image](./getting-started.md#attach-an-image)
[Choose how much effort to use](./effort-and-goals.md#choose-how-much-effort-to-use)

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

- If a paused turn needs its original connection and the model picker cannot
  restore it, send a new message to move on. Desktop stops the paused turn
  first, then sends your new message on the currently selected connection.
  A Goal can instead be ended with **Clear goal**. Finish any new work and
  run or remove waiting messages before choosing another connection. Work
  already done stays visible, and stopping does not refund provider charges.
  [Pause, resume, or move on](./controls.md#pause-resume-or-move-on)
- If a subscription chat asks you to sign in again, reconnect in **Settings →
  LLM Providers → ChatGPT Subscription**. Open the model list and select the
  subscription again. A new sign-in does not transfer accepted work to the
  new connection. Resolve any retained work before choosing it for a future
  message in the same chat.
- If chat asks for an API key, add a key for that provider in Desktop
  settings, then open the model list and pick
  the model again or choose another one.
- If an endpoint needs a connection, open **Settings → LLM Providers →
  Ollama**, check its address and choose **Connect**. Then open the model
  list and pick it. Desktop remembers the saved address across restarts.
- If chat requires HTTPS for an endpoint on another device, change its saved
  address to an HTTPS endpoint and choose **Save**.
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
