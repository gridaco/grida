---
title: "GPT Image 2.5: Flare vs Sunburst, pricing and features"
description: "Compare GPT Image 2.5 Flare and Sunburst: pricing, image quality, speed, transparent backgrounds, and how they differ from GPT Image 2."
keywords:
  [
    GPT Image 2.5,
    Flare vs Sunburst,
    GPT Image 2.5 pricing,
    transparent backgrounds,
  ]
sidebar_label: GPT Image 2.5
slug: gpt-image-2.5
image: https://grida.co/brand/grida-wordmark-400.png
format: md
---

# GPT Image 2.5: Flare vs Sunburst, pricing and features

GPT Image 2.5 is OpenAI's image-generation and editing model family,
[released on September 8, 2026](https://openai.com/index/introducing-chatgpt-images-2-5/).
It comes in two variants: **Flare** for fast, everyday creation and
**Sunburst** for detailed work that needs more precise edits. Both can
generate images from text, work with reference images, and produce
transparent backgrounds.

The unusual part is the pricing: Flare and Sunburst share the same token
rates as GPT Image 2. Choosing between them is about speed, precision, and
actual usage, not a higher price for each token.

_Pricing and availability checked September 9, 2026. Provider support can change._

## GPT Image 2.5 Flare vs Sunburst

| Comparison              | Flare                                             | Sunburst                                                |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Best starting point for | Exploring ideas and everyday image generation     | Precise edits and fine-detail creative work             |
| Speed and precision     | Faster iteration                                  | Greater editing precision, with longer generation times |
| Example workflows       | Concept drafts, social images, visual exploration | Product imagery, campaign assets, controlled revisions  |
| OpenAI API model ID     | `gpt-image-2.5-flare`                             | `gpt-image-2.5-sunburst`                                |
| Token prices            | Same rate card                                    | Same rate card                                          |

Both accept text and image inputs and produce images. Each offers five
fixed quality settings—`low`, `medium`, `high`, `xhigh`, and `max`—plus
`auto`. **The variant and the quality setting are separate choices:**
Sunburst is not simply Flare with quality turned up. See OpenAI's
[Flare model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
and [Sunburst model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
for the current model specifications.

## What changed from GPT Image 2?

OpenAI's [Images 2.5 announcement](https://openai.com/index/introducing-chatgpt-images-2-5/)
describes improvements in four areas:

- **Image fidelity:** more natural lighting and texture, with better
  preservation of subjects from reference photos.
- **Targeted editing:** change the requested part of an image while
  keeping the surrounding composition and details.
- **Successive revisions:** carry earlier edits forward more consistently
  across a sequence of changes.
- **Speed:** OpenAI reports up to 50% lower generation latency compared
  with Images 2.0. This is OpenAI's claim, not a Grida benchmark.

For example, a product-image workflow might keep the same bottle and
composition while changing the background, then refine the lighting in a
second edit. This is the kind of controlled revision 2.5 is designed to
improve; it is not a guarantee that every generated detail will be correct.

## GPT Image 2.5 pricing compared with GPT Image 2

The table shows **OpenAI's standard API rates in USD per million tokens**,
not a fixed price per image or a discounted Batch rate.

| Token type         | GPT Image 2 | 2.5 Flare | 2.5 Sunburst |
| ------------------ | ----------- | --------- | ------------ |
| Text input         | $5.00       | $5.00     | $5.00        |
| Cached text input  | $1.25       | $1.25     | $1.25        |
| Image input        | $8.00       | $8.00     | $8.00        |
| Cached image input | $2.00       | $2.00     | $2.00        |
| Image output       | $30.00      | $30.00    | $30.00       |

Sources: the [GPT Image 2 model card](https://developers.openai.com/api/docs/models/gpt-image-2),
the Flare and Sunburst model cards above, and
[OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

### How much does one image cost?

Tokens are the units the API meters, not a count of pictures. The final
cost depends on the tokens consumed by the prompt, reference images, and
generated output. Model choice, quality, and dimensions can change that
usage even when the rate card is identical.

For a size-and-quality estimate, use the model selector in OpenAI's
[image-generation cost calculator](https://developers.openai.com/api/docs/guides/image-generation#gpt-image-25-and-gpt-image-2-output-tokens)
and select **GPT Image 2.5**. It groups Flare and Sunburst together and
gives these examples for a 1024 × 1024 image:

| Quality  | Estimated image-output tokens | Image-output cost |
| -------- | ----------------------------: | ----------------: |
| `medium` |                           439 |          $0.01317 |
| `high`   |                         1,756 |          $0.05268 |

These estimates exclude text and image inputs and any streaming partial
images; they are **not total request prices**. Do not reuse GPT Image 2's
per-image table for 2.5. Compare the provider's reported usage for your own
workflow; neither variant is guaranteed to cost less on every request.

## Does GPT Image 2.5 support transparent backgrounds?

**Yes.** Both variants support native transparent-background generation.
In OpenAI's API, request `background: "transparent"` with PNG or WebP
output. JPEG does not preserve transparency. See the
[OpenAI output settings guide](https://developers.openai.com/api/docs/guides/image-generation).

Native transparency creates an image with an alpha channel, which can be
placed over other artwork. It is different from generating a solid-color
background and removing it afterward. For stickers, isolated product
assets, or overlays, check that both the selected provider and the output
format expose this capability.

## Using GPT Image 2.5 in Grida

Both variants are available in Grida using purchased AI credits.
**Text-to-image generation does not require your own provider API key.**
You can also connect Vercel AI Gateway, fal, or OpenRouter keys. Native
model support and the options available in a particular application are
not always the same:

| Access in Grida       | Text-to-image | Reference-image editing | Transparent output   |
| --------------------- | ------------- | ----------------------- | -------------------- |
| Grida credits         | Yes           | No                      | Yes                  |
| Vercel AI Gateway key | Yes           | No                      | Yes                  |
| fal key               | Yes           | Yes                     | Yes                  |
| OpenRouter key        | Yes           | Yes                     | Not enabled in Grida |

Reference editing requires an agent integration that explicitly selects
one of these variants and uses a connected fal or OpenRouter key. The
desktop image playground generates from text only. Desktop users need
version 0.0.22 or later for these models. For provider-specific prices,
settings, and billing details, see [Models & Pricing](./index.md).

### Is GPT Image 2 being removed?

No. Grida marks GPT Image 2 as **deprecated**, meaning it is a legacy
choice, but keeps it listed and callable. Existing defaults and saved
model selections are unchanged. This is a Grida catalog decision, not an
announcement that OpenAI has retired GPT Image 2.
