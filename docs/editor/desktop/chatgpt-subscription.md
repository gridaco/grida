---
title: Use Your ChatGPT Subscription
description: Connect your ChatGPT account and use supported text models in Grida Desktop.
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

Connect ChatGPT to use supported text models in Grida with your existing plan.
You do not need an API key or separate OpenAI API billing. Available models and
usage depend on your ChatGPT plan.

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

Open the text-model picker in a new conversation. When your ChatGPT connection
is ready, **ChatGPT Subscription** appears first with the supported models.
When no model or provider has already been chosen, new conversations start on
**GPT-5.6 Sol**.

Choosing a provider/model option changes both for that conversation. Existing
conversations keep their previous provider until you choose another
provider/model option.

The model picker organizes other text models by provider:

- **Grida** is always shown. Its hosted models are metered against your
  organization's prepaid Grida AI credit.
- **OpenRouter** and **Vercel** appear after their keys are configured.
- **Ollama** appears after it is configured with at least one model.

Other provider groups appear when they are configured and available.

## Images and media generation

ChatGPT Subscription is a text-model provider. Image, video, and audio
generation continue to use the providers shown under
**Settings → Image/Video/Audio Providers** or Grida-hosted models metered
against your organization's prepaid Grida AI credit.

## Troubleshooting

- **The browser says sign-in is not allowed.** ChatGPT Subscription is
  unavailable for this build or account. Choose another text provider.
- **The account does not finish connecting.** Sign out in Settings, then sign
  in again.
- **A model is unavailable.** Choose another eligible model or configure a
  different provider. Access depends on your ChatGPT plan.
- **You prefer fully local inference.** See
  [Local Models (Ollama)](./local-models.md).
