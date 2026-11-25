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
- **Grida Gateway**, under your Grida account or through a saved Gateway API key;
- a saved **OpenAI API**, **OpenRouter**, or **Vercel AI Gateway** key;
- an approved compatible endpoint, which can use a key saved under its own ID.

For a new chat with no saved or explicit model choice, Desktop prefers a ready
ChatGPT subscription. It recommends Grida’s preferred model when your account
offers it, or another available subscription model. Your saved or explicit
choice takes precedence, including a saved model that has become unavailable.

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

You can choose a different model, provider or account while a turn is running.
The next message you send uses that selection, even if it joins the queue.
A message already in the queue uses the settings it had when you sent it.
For example, if you send two messages on Model A, switch to Model B, then
send a third, only the third uses Model B.

The chat keeps its visible history. A different connection receives the
earlier conversation as context. Private provider continuation and reasoning
stay with their original connection. Accepted work keeps its model, account,
effort and funding through Pause, Resume, retries and restart, subject to
continued access to the connection. Older Desktop builds can require accepted
work to finish before sending on a different connection.

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

The list groups models by the connection that runs them. A model offered by
two connections appears in both groups. Choose the account or key you want
to use. ChatGPT Subscription lists compatible models offered by your signed-in
account. **Grida Gateway · API key** uses the Gateway organization attached to
the saved key. A Gateway model offered through your signed-in Grida account can
also appear in that group. **OpenAI API · Project billing** lists compatible models available to
your OpenAI project key and supports streamed text and agent tool calls.
OpenRouter and Vercel AI Gateway list compatible models for that provider once
you add its key. Grida Gateway and your configured endpoints supply their own
model lists. [Set up an OpenAI project key](./desktop-settings.md#openai-api-project-key)

Desktop checks for new model data in the background. You can open the picker
using the last verified catalog, or the copy included with Desktop on first
launch. A compatible model can therefore appear without a Desktop update.
ChatGPT still needs a recent model list from your signed-in account. If that
check fails, new subscription choices are unavailable until it succeeds.
OpenAI project models appear when their availability check finishes. You can
choose another connection while the check runs.
Your provider checks access, available credits and quota when you send.

Chats belong to the workspace: every model connection shares its chat list.
Connecting a provider or refreshing the list leaves your selected connection
in place. Removing a key or changing an endpoint can make its saved selection
unavailable. Restore the connection to continue its accepted work, or resolve
that work before explicitly choosing another connection for future messages.

Previously saved llama.cpp connections appear as **legacy** in their workspace.
They keep their saved endpoint and model identity.

## Use your ChatGPT subscription

Open **Settings → LLM Providers → ChatGPT Subscription**, sign in with your
ChatGPT account, and return to Grida. When the card shows **Connected**, its
compatible models appear in the model pickers on Welcome and in a project.
Choose a model in the **ChatGPT Subscription** group to use your plan for a
new chat or an eligible next turn in an existing chat.

This integration is experimental. Model access depends on your ChatGPT plan,
workspace and the subscription service. Desktop matches models offered by your
account with the models Grida can run. OpenAI API model availability is
separate from subscription access. If a saved choice becomes unavailable, its
name stays visible and you can choose a replacement. A refreshed listing
affects future messages. Queued and paused messages still require the provider
model and connection they had when you sent them.

Subscription chats support text, tools and the model's available reasoning
settings. **Ultra** can run an independent reviewer on that same subscription
connection. Supported image attachments also send prepared pixels on the first
request, together with their verified source path when picked from disk.
Work accepted before a Desktop update keeps its earlier captured tools and
limits; use a new message for the expanded image workflow.
[Attach an image](./getting-started.md#attach-an-image)
[Choose how much effort to use](./effort-and-goals.md#choose-how-much-effort-to-use)

### Choose a response speed

On Home or in a workspace chat using **ChatGPT Subscription**, open the model
picker and click the lightning bolt in the upper-left corner of the effort
panel. If you’re viewing the model list, select **Back to effort**. New chats use
**Standard** by default. Select **Fast** or **Ultrafast** when your account
and the selected model offer them. The lightning bolt is disabled when no
faster speed is available. Faster speeds use more of your ChatGPT allowance.
You can set effort separately.

Grida remembers the speed for that chat, including an unsent draft. A message
already in the queue keeps the speed and model it had when you sent it.
Choosing a speed on Home applies it to the new chat that opens in the project.
If Grida can’t check available speeds, choose **Retry availability** below the
effort controls. If your saved speed is unavailable, select **Standard** from
the speed menu or choose **Use Standard** if the lightning bolt is disabled.
If your subscription needs a new sign-in, reconnect it in Settings.

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
- If the OpenAI model list is temporarily unavailable, choose **Retry** in the
  picker. If the key was rejected or cannot list models, check its permissions
  and key in **Settings → LLM Providers → OpenAI API**, then refresh the picker.
  Accepted messages still require the project key and model that accepted them.
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

The ring beside the model picker shows context usage. It uses the working
window captured for the turn, or the selected model’s known window before
that capture is available. If the provider supplies no measurement, the ring
estimates usage from the visible conversation. The default working window is
272,000 tokens, or the model’s capacity if it is smaller. [Set context size and compaction](./settings.md)
The tooltip and breakdown say whether the value is **Estimated** or
**Reported by provider**. Hover for the percentage and token count. Open the
breakdown to see how the visible content accounts for the measured request.
When the visible transcript is larger than the reported request, such as
after compaction, the provider total is shown as **Other**.

Grida can summarize earlier conversation before the next message or earlier
tool exchanges while a turn runs. The current user messages and full
transcript stay visible. Open **Context compacted** to read the summary
when available. To compact an idle chat with nothing queued, send `/compact` on
its own. [Continue a long conversation](./history.md#continue-a-long-conversation)

## Usage and charges

Desktop does not show per-request charges in the chat. Use the connection's
billing record for totals and individual charges. Desktop goals have no
spending limit; a client that starts a goal on a Grida connection can set one.
[Set a goal's spending limit](./clients.md#set-a-goals-spending-limit)
