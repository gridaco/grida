---
title: Use Your ChatGPT Subscription
description: Connect your ChatGPT account to Grida Desktop, choose a model and response speed, and use live web search in chat.
keywords:
  - chatgpt subscription
  - chatgpt sign in
  - grida desktop
  - ai agent
  - no api key
format: md
doc_tasks:
  - enhance
  - translate
---

# Use Your ChatGPT Subscription

Sign in with ChatGPT to use your existing plan in Grida Desktop without an
OpenAI API key or separate API billing. This connection is experimental.
Available models and usage limits depend on your ChatGPT plan and workspace.

## Connect during onboarding

Sign in to Grida when you first open the desktop app. Setup then introduces
Grida, offers ChatGPT sign-in, and asks you to choose a workspace.

On the **Connect ChatGPT** step, select **Continue with ChatGPT**. Grida opens
your browser for ChatGPT sign-in. Return to Grida after the browser confirms
the connection, then select **Continue**.

Select **Skip** to continue without ChatGPT and connect another provider later.
Choose a workspace, then select **Start creating**.

## Connect or sign out in Settings

Open **Settings → LLM Providers** and expand **ChatGPT Subscription** in the
provider list.

- Select **Sign in with your ChatGPT account** to connect.
- Select **Sign out** to disconnect ChatGPT from Grida Desktop.

ChatGPT sign-in is separate from your Grida account. Signing out of one does
not automatically sign out of the other.

## Choose a model

On Home or in a workspace chat, open the model picker at the bottom right of
the composer. Click the model name beneath the effort level to see the model
list. Choose a model under **ChatGPT Subscription** to use your plan. If the
list shows only your current provider, choose **Show all models** or search
for the model by name.

With ChatGPT connected, new chats start on **GPT-6.2 Sol** unless you have
already chosen a different model. An existing chat keeps its saved choice.

The picker also groups models by provider. Grida Gateway uses your
organization’s Grida AI credit. OpenRouter, Vercel AI Gateway, and compatible
endpoints such as Ollama appear when configured.

## Choose a response speed

New chats use **Standard** speed. To get faster replies, open the model picker
and click the lightning bolt in the upper-left corner of the effort panel.
Depending on your account and model, you can choose **Fast** or **Ultrafast**.
Faster speeds use more of your ChatGPT allowance. A dimmed bolt means faster
speeds are unavailable for the current selection.

Grida remembers the speed for that chat. Choosing a speed on Home applies it
to the chat you start there. Choose **Standard** in the same menu to switch
back.

## Search the web

With **GPT-6.2 Sol** on your ChatGPT subscription, you can ask “What’s the
weather in Seoul today?” directly from Home or a workspace chat. The agent can
search automatically when it needs current information. You can also ask it
to search the web explicitly.

When the agent searches, Grida shows the search activity in the chat. If the
reply cites a source, click the citation to open it.

Web search is on by default. To turn it off across your Desktop chats, open
**Settings → Personalization** and turn off **Web search**.

## Images and media generation

You can attach an image for a supported chat model to examine. Image, video,
and audio generation use the providers shown in **Settings → Media Providers**.
Grida-hosted media generation uses your organization’s Grida AI credit.

## Troubleshooting

- **The browser says sign-in is not allowed.** ChatGPT Subscription is
  unavailable for this build or account. Choose another text provider.
- **The account does not finish connecting.** Sign out in Settings, then sign
  in again.
- **A model is unavailable.** Choose another eligible model or configure a
  different provider. Access depends on your ChatGPT plan.
- **You prefer fully local inference.** See
  [Local Models (Ollama)](./local-models.md).
