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

## Start a chat with a saved model

Open **Model connection** in a native workspace and choose a model under **New chat
with…**. The connection picker also remains available when the default Gateway
connection cannot start. Choose another configured connection, or retry the
default once it is available. Listing choices does not open a chat or run a model.
Grida lists its current tool-capable Gateway text models when discovery
is available. Add an OpenRouter or Vercel AI Gateway key, or save and approve a
compatible endpoint in Desktop settings, to see those models too. Use
**Refresh models** after changing a connection.

When you select a configured compatible endpoint under **New chat with…**,
the request uses `max_tokens`, including for Ollama. The saved **earlier chats**
entry keeps the previous request format.

A supported local llama.cpp endpoint can offer a separate **llama.cpp counting**
connection. Select it for a new chat when you need a hard context input limit.
[Configure local request counting](../reference/agent-configuration.md#configure-local-request-counting)

Each chat keeps its original model connection. **Saved chats by model** reopens
the chat list for that connection, and **Default connection** returns to the default
list. Switching lists leaves existing work and pending questions in their
original chats. Reconnecting the pane restores its selected connection before
opening that connection's history. All connections in the workspace share its context-limit setting.
Send or remove any pending attachment before choosing a different model
connection. The draft stays in its current chat until then.
Removing a key, changing an endpoint, or losing access to the original Gateway
organization can make its saved chats unavailable. A Gateway model must also
remain available for chat. Restore access to the original connection to reopen
its chats.

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
schedule one more attempt on the same connection. Use **Pause** or **Stop**
while it waits. [Follow a provider retry](./clients.md#follow-a-provider-retry)

## Read the usage for a turn

Open **Turn summary** after a turn ends to see the token counts reported
by the provider. A partial count covers only the requests with known usage.
Cached input and reasoning output can overlap other counts.
[Read a turn summary](./clients.md#read-a-turn-summary)

For Grida Gateway, the summary can also show exact charges in mills for
individual model requests from that turn. A funded independent review appears
separately when its recorded charges belong to the same connection. The
summary can also list [assigned subagent work](./clients.md#read-a-turn-summary),
with a notice when attribution is incomplete. Pending or
unavailable amounts stay unknown. Use **Refresh billing** when offered to check
that request's current settlement. Reopening the chat shows the original recorded
evidence and leaves refresh to you. Use the connection's billing record for
totals and for charges from other providers or work outside the displayed turn.

Supported Gateway Goals can also have a maximum spend. The Goal panel shows
charged, held and remaining amounts, including funded child work. An uncertain
request keeps its hold until its settlement is known; stopping work does not
refund a request. This is separate from a turn summary's reported usage.
[Set a maximum spend](./effort-and-goals.md#set-a-maximum-spend)
