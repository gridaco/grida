---
title: "GPT Image 2.5: two variants, one rate card"
description: Why GPT Image 2.5 succeeds GPT Image 2 in Grida, how Flare and Sunburst differ, and why equal token prices do not mean equal image costs.
keywords: [GPT Image 2.5, Flare, Sunburst, image generation, AI pricing, Grida]
format: md
---

# GPT Image 2.5: two variants, one rate card

GPT Image 2.5 is the successor to GPT Image 2 in Grida's catalog. The change
is about better creative results, not a higher price per token: **Flare and
Sunburst share the same OpenAI token rates as GPT Image 2**, while offering
different speed and precision trade-offs.

## Why move to GPT Image 2.5?

In its [September 8 announcement](https://openai.com/index/introducing-chatgpt-images-2-5/),
OpenAI describes improvements to lighting, texture, reference-image fidelity,
and targeted editing. The practical benefit is keeping the parts of an image
you like while changing the part you asked to change, including across
successive edits. OpenAI reports up to 50% lower generation latency compared
with Images 2.0; this is a vendor claim, not a Grida benchmark.

The variants differ in speed and editing precision, not their per-token
rate card:

- **Flare** is the everyday starting point: fast iteration, concept
  exploration, and high-volume image generation.
- **Sunburst** is for work where precise edits and fine detail justify
  a longer wait, such as carefully controlled product or campaign imagery.

Both accept text and image inputs and offer five fixed quality levels
(`low`, `medium`, `high`, `xhigh`, `max`) plus `auto`. Model choice and quality are separate controls:
Sunburst is not simply Flare with its quality setting turned up.
See OpenAI's [Flare model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
and [Sunburst model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst).

## Same token prices, different image costs

OpenAI's standard API rates, in USD per million tokens:

| Token type         | GPT Image 2 | 2.5 Flare | 2.5 Sunburst |
| ------------------ | ----------- | --------- | ------------ |
| Text input         | $5.00       | $5.00     | $5.00        |
| Cached text input  | $1.25       | $1.25     | $1.25        |
| Image input        | $8.00       | $8.00     | $8.00        |
| Cached image input | $2.00       | $2.00     | $2.00        |
| Image output       | $30.00      | $30.00    | $30.00       |

These are **unit prices, not fixed prices per image**. The bill depends on
tokens consumed, which can vary with the model, quality, dimensions, prompt,
and reference images. For illustration, 1,000 image-output tokens cost $0.03;
3,000 cost $0.09, before input charges. Those are arithmetic examples, not
estimates for either variant.

OpenAI explicitly notes that the GPT Image 2 calculator does **not** estimate
GPT Image 2.5 token consumption. Do not carry GPT Image 2's per-image table
over to Flare or Sunburst, or assume either variant always costs less.
Compare actual usage for the quality and workflow you need. The model cards
above and the [OpenAI pricing page](https://developers.openai.com/api/docs/pricing)
are the sources for this rate comparison; individual providers can expose
different billing meters.

## What changes in Grida?

GPT Image 2 is marked **deprecated**, not removed or shut down. Its ID and
provider routes remain available for existing workflows; this is a Grida
catalog decision, not an announcement of OpenAI retiring the model. Existing
defaults and saved model selections are unchanged.

Both 2.5 variants are already available through Grida credits and connected
Vercel, fal, or OpenRouter keys. Generation with Grida credits does not require
a provider key. Reference editing remains provider-key-only, and native
transparency is currently enabled through Vercel and fal, not OpenRouter.
Desktop users need 0.0.22 or later for 2.5; this deprecation adds no new runtime
requirement. See [Models & Pricing](./index.md) for provider-specific rates
and availability.
