---
title: Choose models and understand usage
description: Use a configured Grida Agent model, recover a connection, and interpret reported token counts.
keywords: [agent models, model providers, API keys, token usage, Grida Desktop]
format: md
---

# Choose models and understand usage

The model connection determines which inputs and tools are available in a
native workspace chat. Grida Gateway is the default in a managed Desktop profile.
Native Desktop can use a saved OpenRouter or Vercel key on
macOS and Linux, or an approved compatible endpoint. On macOS and Linux,
the endpoint can use a key saved under its own ID.
[Configure a native Desktop profile](https://github.com/gridaco/grida/blob/main/desktop/README.md#distributions)

Native chat accepts plain HTTP on `localhost` and numeric loopback addresses.
Use HTTPS for an endpoint on another device, even if you approved its HTTP
address in an earlier Desktop version. The saved HTTP setting stays in Desktop
settings, but the endpoint is unavailable for new native chats.

## Choose a model

Open **Model connection** in the composer of a native workspace chat and choose
a model under **Models**. You can change the model between turns: the chat and
its history stay in place, and your next message uses the new model with the
earlier turns as context. A turn that is already running finishes with the
model that started it; wait for it or choose **Stop** before changing models.

If the default Gateway connection cannot start, Desktop continues with a saved
OpenRouter or Vercel AI Gateway key, using Grida's default model when that key
offers it. A model you chose earlier for the workspace still takes priority. Only
when no connection can run does the composer show **Choose model** with a
prompt to add a provider. Listing models does not open a chat or run a
model. Grida lists its current tool-capable Gateway text models when discovery
is available. Add an OpenRouter or Vercel AI Gateway key, or save and approve a
compatible endpoint in Desktop settings, to see those models too. Use
**Refresh models** after changing a connection.

A configured compatible endpoint uses `max_tokens`, including for Ollama.

A supported local llama.cpp endpoint can offer a separate **llama.cpp counting**
connection. Select it when you need a hard context input limit.
[Configure local request counting](../reference/agent-configuration.md#configure-local-request-counting)

Chats belong to the workspace, not to a model. All models in the workspace
share its chat list and context-limit setting. A chat started under your Grida
account continues with models from that account; a locally saved key or
endpoint continues chats started with local keys. Send or remove any pending
attachment before changing the model. Removing a key or changing an endpoint
makes that model unavailable until you restore it; choose another model to
continue.

## Provider availability

The optimized macOS Apple Silicon headless host has bounded live checks with
OpenRouter and `openai/gpt-4.1-mini`: text and permission-checked file reads in
Plan/Act and Standard/Ultra. These checks verify the selected connection and
retained accounting; they are not a broad model-quality comparison. Other live
providers and operating systems remain unqualified. The development macOS
Desktop host also has live OpenRouter `google/gemini-3.8-flash` checks for a reply,
a workspace-file read, follow-up context and transcript restoration without
repeating inference. These do not qualify a signed distribution. Connection
discovery alone does not verify credentials, credits, generation or model access.

Compatible streaming keeps a valid completed answer when the provider sends its
final usage record. Additional content or changed completion identity still
leaves an uncertain result. An earlier uncertain turn remains in history;
reopening it does not retry generation.

## Recover a connection

- If chat asks for an API key, add a key for the selected provider in
  Desktop settings, then choose **Retry** in chat.
- If an endpoint needs approval, save it in Desktop settings and approve
  its address in the native dialog, then choose **Retry**.
- If chat requires HTTPS for an endpoint on another device, update its saved
  address to an HTTPS endpoint and approve the new address before retrying.
- If the selected model is unavailable, check the model configured for
  the profile. A saved endpoint uses its default or first registered
  model when no model is specified.

A network authentication redirect can prevent provider access. Grida does not
forward the provider API key to another destination. Provider API requests use
Grida's own client identity and remain separate from browser sign-in cookies.

An unavailable explicit selection leaves the workspace chat closed until
the connection is ready. A supported rate-limit response during a turn can
schedule one more attempt on the same connection. Use **Stop**
while it waits. [Follow a provider retry](./clients.md#follow-a-provider-retry)

## Read the usage for a turn

Open **Execution details** after a turn ends to see the token counts reported
by the provider. A partial count covers only the requests with known usage.
Cached input and reasoning output can overlap other counts.
[Read execution details](./clients.md#read-execution-details)

For Grida Gateway, the summary can also show exact charges in mills for
individual model requests from that turn. A funded independent review appears
separately when its recorded charges belong to the same connection. The
summary can also list [assigned subagent work](./clients.md#read-execution-details),
with a notice when attribution is incomplete. Pending or
unavailable amounts stay unknown. Use **Refresh billing** when offered to check
that request's current settlement. Reopening the chat shows the original recorded
evidence and leaves refresh to you. Use the connection's billing record for
totals and for charges from other providers or work outside the displayed turn.

Supported Gateway Goals can also have a maximum spend. The Goal panel shows
charged, held and remaining amounts, including funded child work. An uncertain
request keeps its hold until its settlement is known; stopping work does not
refund a request. This is separate from the reported usage in execution details.
[Set a maximum spend](./effort-and-goals.md#set-a-maximum-spend)
