---
title: Choose models and understand usage
description: Use a configured Grida Agent model, recover a connection, and interpret reported token counts.
keywords: [agent models, model providers, API keys, token usage, Grida Desktop]
format: md
---

# Choose models and understand usage

The model connection determines which inputs and tools are available in a
native workspace chat. A managed Desktop profile uses the Grida Gateway.
The isolated native preview can use a saved OpenRouter or Vercel key on
macOS and Linux, or an approved compatible endpoint that needs no key.
[Configure a native Desktop profile](https://github.com/gridaco/grida/blob/main/desktop/README.md#distributions)

## Recover a connection

- If chat asks for an API key, add a key for the selected provider in
  Desktop settings, then choose **Retry** in chat.
- If an endpoint needs approval, save it in Desktop settings and approve
  its address in the native dialog, then choose **Retry**.
- If the selected model is unavailable, check the model configured for
  the profile. A saved endpoint uses its default or first registered
  model when no model is specified.

An unavailable explicit selection leaves the workspace chat closed until
the connection is ready. A supported rate-limit response during a turn can
schedule one more attempt on the same connection. Use **Pause** or **Stop**
while it waits. [Follow a provider retry](./clients.md#follow-a-provider-retry)

## Read the usage for a turn

Open **Turn summary** after a turn ends to see the token counts reported
by the provider. A partial count covers only the requests with known usage.
Cached input and reasoning output can overlap other counts. Use the
connection's billing record for charges. [Read a turn summary](./clients.md#read-a-turn-summary)
