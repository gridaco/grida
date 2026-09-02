---
title: Models & Pricing
description: Compare Grida AI model tiers, context windows, and text, image, and music generation costs.
keywords: [AI models, AI pricing, GPT-5.6, Claude Fable 5.1, Lyria, Grida AI]
slug: pricing
format: md
---

# Models & Pricing

Grida uses AI models across the editor for text, image, music, and media-processing workflows. This page documents the models that are integrated and available to use, their capabilities, and pricing.

Text and image models use Grida's hosted model routes. Media models that require a specialist provider identify that provider explicitly; a catalogued compatibility contract is not the same as an integrated model.

## Billing

Grida-hosted AI usage is deducted from prepaid credit purchased separately for your organization. Pricing plans do not include recurring AI credit. The rates below show how each operation is charged against that credit balance.

## Agent Models

Agent models power chat, content generation, summarization, code, tool use, and agentic features in the editor.

Models are organized into **tiers** based on capability and cost:

| Tier   | Role            | Typical use                                             |
| ------ | --------------- | ------------------------------------------------------- |
| `nano` | Background work | Title generation, summarization, lightweight extraction |
| `mini` | General-purpose | Main agent, sub-agent, multimodal tasks                 |
| `pro`  | Higher quality  | Main agent, multimodal tasks                            |
| `max`  | Most capable    | Heaviest tasks, complex reasoning                       |

### Current Models

| Tier   | Model                                  | Context | Max Output | Input (per 1M) | Output (per 1M) |
| ------ | -------------------------------------- | ------- | ---------- | -------------- | --------------- |
| `nano` | GPT-5.6 Luna (`openai/gpt-5.6-luna`)   | 1.05M   | 128K       | $0.20          | $1.20           |
| `mini` | GPT-5.6 Luna (`openai/gpt-5.6-luna`)   | 1.05M   | 128K       | $0.20          | $1.20           |
| `pro`  | GPT-5.6 Terra (`openai/gpt-5.6-terra`) | 1.05M   | 128K       | $2.00          | $12.00          |
| `max`  | GPT-5.6 Sol (`openai/gpt-5.6-sol`)     | 1.05M   | 128K       | $4.00          | $20.00          |

All tier models support **multimodal** inputs (text + images).
Claude Fable 5.1 and Claude Opus 5 remain active, non-tiered catalogue models.

`nano` and `mini` currently resolve to the same model. `nano` is a floor —
the cheapest model still good enough for background work (title generation,
summarisation, compaction) — so it is never more expensive than `mini`, but
it is not guaranteed to be strictly cheaper. OpenAI's 2026-07-30 price cut
dropped GPT-5.6 Luna below the older GPT-5.4 Nano while giving it more
context, leaving nothing that is both cheaper and adequate. Expect the two
tiers to separate again as new models are released; picking `nano` is always
safe for cost-sensitive work regardless.

### Cache Pricing

All tiers support prompt caching, which reduces cost for repeated context:

| Tier   | Cache Read (per 1M) | Cache Write (per 1M) |
| ------ | ------------------- | -------------------- |
| `nano` | $0.02               | $0.25                |
| `mini` | $0.02               | $0.25                |
| `pro`  | $0.20               | $2.50                |
| `max`  | $0.40               | $5.00                |

### All Models

Per 1M tokens.

| Name                                                         | Input  | Cache Write | Cache Read | Output  |
| ------------------------------------------------------------ | ------ | ----------- | ---------- | ------- |
| GPT-5.4 Nano (`openai/gpt-5.4-nano`)                         | $0.20  | —           | $0.02      | $1.25   |
| GPT-5.4 Mini (`openai/gpt-5.4-mini`)                         | $0.75  | —           | $0.075     | $4.50   |
| Claude Sonnet 5 (`anthropic/claude-sonnet-5`)                | $2.00  | $2.50       | $0.20      | $10.00  |
| Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`) _(legacy)_ | $3.00  | $3.75       | $0.30      | $15.00  |
| Claude Fable 5.1 (`anthropic/claude-fable-5.1`)              | $10.00 | $12.50      | $0.25      | $50.00  |
| Claude Fable 5 (`anthropic/claude-fable-5`) _(legacy)_       | $10.00 | $12.50      | $1.00      | $50.00  |
| Claude Opus 5 (`anthropic/claude-opus-5`)                    | $5.00  | $6.25       | $0.50      | $25.00  |
| Claude Opus 4.8 (`anthropic/claude-opus-4.8`) _(legacy)_     | $5.00  | $6.25       | $0.50      | $25.00  |
| Claude Opus 4.7 (`anthropic/claude-opus-4.7`) _(legacy)_     | $5.00  | $6.25       | $0.50      | $25.00  |
| GPT-5.6 Sol (`openai/gpt-5.6-sol`)                           | $4.00  | $5.00       | $0.40      | $20.00  |
| GPT-5.6 Terra (`openai/gpt-5.6-terra`)                       | $2.00  | $2.50       | $0.20      | $12.00  |
| GPT-5.6 Luna (`openai/gpt-5.6-luna`)                         | $0.20  | $0.25       | $0.02      | $1.20   |
| GPT-5.5 (`openai/gpt-5.5`) _(legacy)_                        | $5.00  | —           | $0.50      | $30.00  |
| GPT-5.5 Pro (`openai/gpt-5.5-pro`)                           | $30.00 | —           | —          | $180.00 |
| Gemini 3.7 Flash (`google/gemini-3.7-flash`)                 | $1.50  | —           | $0.15      | $7.50   |
| Gemini 3.1 Pro Preview (`google/gemini-3.1-pro-preview`)     | $2.00  | —           | $0.20      | $12.00  |

GPT-5.6 and GPT-5.5 prices above are base rates. Requests with more than 272K
input tokens are billed at 2x input and 1.5x output for the full request.
`Gemini 3.1 Pro Preview` is tiered the same way at a 200K threshold ($4.00
input / $18.00 output / $0.40 cache read for the full request).

`Gemini 3.7 Flash` is listed at its steady-state rate. Google is running a
promotion through 2026-12-31 at $0.75 input / $3.75 output / $0.075 cache
read; the table holds the price that applies from 2027-01-01 so an expiring
promotion is never a silent cost increase.

`GPT-5.5` is deprecated in Grida's catalogue in favor of `GPT-5.6 Sol`;
this is not an upstream OpenAI retirement. `GPT-5.5 Pro` remains active.

`Claude Opus 4.8` is deprecated in Grida's catalogue in favor of
`Claude Opus 5`, its drop-in successor at the same rate card; this is not an
upstream Anthropic retirement.

`Claude Fable 5` is deprecated in Grida's catalogue in favor of
`Claude Fable 5.1`, which carries the same input, output, and cache-write
rates at a quarter of the cache-read price. It is kept rather than dropped
because `Claude Fable 5.1` rejects forced tool choice, so `Claude Fable 5`
remains the only Fable that serves it. Neither is an upstream Anthropic
retirement.

## Image Generation Models

Image models power the image generation features in the editor. Pricing varies by provider — some charge per image (flat or tiered by quality/size), others charge per token.

### OpenAI

OpenAI image models are billed per output token. The tables below show the published per-image equivalents for popular sizes; arbitrary in-envelope sizes are billed by the underlying token rates.

**GPT Image 2** (`openai/gpt-image-2`)

Per 1M tokens: `text input $5.00 · text cached $1.25 · image input $8.00 · image cached $2.00 · output $30.00`

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | $0.006    | $0.005    | $0.005    |
| Medium  | $0.053    | $0.041    | $0.041    |
| High    | $0.211    | $0.165    | $0.165    |

GPT Image 2 also accepts arbitrary resolutions (multiples of 16, edges ≤ 3840 px, aspect ratio ≤ 3:1, total pixels in 655,360 – 8,294,400). Cost for non-standard sizes is computed from output token count.

**GPT Image Mini** (`openai/gpt-image-1-mini`)

Per 1M tokens: `text input $2.00 · text cached $0.20 · image input $2.50 · image cached $0.25 · output $8.00`

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | $0.005    | $0.006    | $0.006    |
| Medium  | $0.011    | $0.015    | $0.015    |
| High    | $0.036    | $0.052    | $0.052    |

**GPT Image 1.5** (`openai/gpt-image-1.5`) — _deprecated, superseded by GPT Image 2_

Per 1M tokens: `text input $5.00 · text cached $1.25 · image input $8.00 · image cached $2.00 · output $32.00`

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | $0.009    | $0.013    | $0.013    |
| Medium  | $0.034    | $0.050    | $0.050    |
| High    | $0.133    | $0.200    | $0.200    |

### Google

Per-token pricing (same model as text, with image output).

| Model                                                              | Input (per 1M) | Output (per 1M) |
| ------------------------------------------------------------------ | -------------- | --------------- |
| Gemini 3.1 Flash Image (`google/gemini-3.1-flash-image-preview`)   | $0.50          | $3.00           |
| Gemini 3.1 Flash Lite Image (`google/gemini-3.1-flash-lite-image`) | $0.25          | $1.50           |
| Gemini 3 Pro Image (`google/gemini-3-pro-image`)                   | $2.00          | $12.00          |

### Black Forest Labs

Metered per megapixel by every provider; the table shows the 1-megapixel (1024x1024) baseline.

| Model                                     | Price/Image |
| ----------------------------------------- | ----------- |
| Flux 2 Max (`bfl/flux-2-max`)             | $0.070      |
| Flux 2 Pro (`bfl/flux-2-pro`)             | $0.030      |
| Flux Kontext Max (`bfl/flux-kontext-max`) | $0.080      |
| Flux Kontext Pro (`bfl/flux-kontext-pro`) | $0.040      |
| Flux Pro 1.1 (`bfl/flux-pro-1.1`)         | $0.040      |

### ByteDance

Flat per-image pricing.

| Model                                              | Price/Image |
| -------------------------------------------------- | ----------- |
| Seedream 5.0 Pro (`bytedance/seedream-5.0-pro`)    | $0.035      |
| Seedream 5.0 Lite (`bytedance/seedream-5.0-lite`)  | $0.035      |
| Seedream 4.5 (`bytedance/seedream-4.5`) _(legacy)_ | $0.040      |

`Seedream 4.5` is deprecated in Grida's catalogue in favor of the 5.0 models,
which are cheaper on every provider; this is not an upstream retirement.

### SpaceXAI

Tiered by quality and size.

| Model                                                 | 1K low | 1K medium | 2K low | 2K medium |
| ----------------------------------------------------- | ------ | --------- | ------ | --------- |
| Grok Imagine Image 2.0 (`xai/grok-imagine-image-2.0`) | $0.04  | $0.06     | $0.06  | $0.08     |

### Meta

| Model                                  | Price/Image |
| -------------------------------------- | ----------- |
| Muse Image 1.0 (`meta/muse-image-1.0`) | $0.010      |

`Muse Image 1.0` is catalogued but not offered in the default picker: OpenRouter
lists it without a serving endpoint, so it is not available on every provider.

### Recraft

Flat per-image pricing for raster output. Vector styles are a separate route at $0.08 and are not offered.

| Model                                        | Price/Image |
| -------------------------------------------- | ----------- |
| Recraft V4.1 (`recraft/recraft-v4.1`)        | $0.035      |
| Recraft V3 (`recraft/recraft-v3`) _(legacy)_ | $0.040      |

`Recraft V3` is deprecated in Grida's catalogue in favor of `Recraft V4.1`,
which is cheaper on every provider; this is not an upstream Recraft retirement.

### Image Sizes

| Model                  | Min Size  | Max Size                         | Aspect Ratios |
| ---------------------- | --------- | -------------------------------- | ------------- |
| GPT Image 2            | —         | edges ≤ 3840 px, ≤ 8.3M px total | up to 3:1     |
| GPT Image 1.5          | 1024x1024 | 1536x1536                        | 1:1, 2:3, 3:2 |
| GPT Image Mini         | 1024x1024 | 1536x1536                        | 1:1, 2:3, 3:2 |
| Gemini Flash Image     | —         | 1536x1536                        | Flexible      |
| Gemini Flash Lite      | —         | 1024x1024 (1K only)              | Flexible      |
| Gemini Pro Image       | —         | 1536x1536                        | Flexible      |
| Flux 2 Max             | 256x256   | 1440x1440                        | Flexible      |
| Flux 2 Pro             | 256x256   | 1440x1440                        | Flexible      |
| Flux Kontext Max       | —         | 1820x1820                        | Flexible      |
| Flux Kontext Pro       | —         | 1820x1820                        | Flexible      |
| Flux Pro 1.1           | 256x256   | 1440x1440                        | Flexible      |
| Recraft V4.1           | —         | 2048x2048                        | Flexible      |
| Recraft V3             | —         | 2048x2048                        | Flexible      |
| Seedream 5.0 Pro       | 1.0 MP    | 4.2 MP (1024² to 2048² total px) | up to 16:1    |
| Seedream 5.0 Lite      | 3.7 MP    | 16.8 MP (2560x1440 to 4096²)     | Flexible      |
| Grok Imagine Image 2.0 | —         | 2048x2048 (1K or 2K)             | Flexible      |
| Muse Image 1.0         | —         | chosen by the model              | 21:9 to 9:21  |

## Video Generation Models

Video models are billed per second of generated output, by resolution and
whether audio is generated. The rates below are the Grida-hosted (Vercel
gateway) rates; the hosted route always generates the model's default audio
mode, so the silent rates are informational until the request can carry an
audio mode.

| Model                                                 | 480p  | 720p          | 1080p         | 4K            | Duration |
| ----------------------------------------------------- | ----- | ------------- | ------------- | ------------- | -------- |
| Veo 3.1 (`google/veo-3.1`)                            | —     | $0.40 ($0.20) | $0.40 ($0.20) | $0.60 ($0.40) | 4–8s     |
| Veo 3.1 Fast (`google/veo-3.1-fast`)                  | —     | $0.15 ($0.10) | $0.15 ($0.10) | $0.35 ($0.30) | 4–8s     |
| Veo 3.1 Lite (`google/veo-3.1-lite`)                  | —     | $0.05 ($0.03) | $0.08 ($0.05) | —             | 4–8s     |
| Wan 3.0 (`alibaba/wan-3.0`)                           | $0.05 | $0.10         | $0.20         | —             | 2–30s    |
| Grok Imagine Video 1.5 (`xai/grok-imagine-video-1.5`) | $0.08 | $0.14         | $0.25         | —             | 1–15s    |

Per second of output; the figure in parentheses is the silent rate where the
provider meters one. Wan and Grok bundle audio into a single rate.

`Seedance 2.0` and `Seedance 2.5` (`bytedance/seedance-2.0`, `-2.5`) are
catalogued for bring-your-own-key use through fal, but are **not available on
the hosted route**: the gateway meters them per video token rather than per
second, and there is no honest per-second conversion, so Grida cannot
pre-price a hosted request. This will change when hosted video is metered
after generation. `Seedance 2.5` is the newer generation but not a cheaper
one — on fal it costs $0.47/s at 720p and $1.16/s at 1080p against 2.0's
$0.30/s and $0.68/s, and it does not offer 4K — so both are kept: 2.0 for
price and 4K, 2.5 for clips up to 30 seconds and editing.

## Image Tools

Image tools provide processing capabilities like upscaling and background removal. These run on [Replicate](https://replicate.com).

### Background Removal

| Model                                                              | Cost/Image |
| ------------------------------------------------------------------ | ---------- |
| 851 Labs Background Remover (`851-labs/background-remover`)        | $0.00048   |
| Recraft Remove Background (`recraft-ai/recraft-remove-background`) | $0.010     |
| Bria Remove Background (`bria/remove-background`)                  | $0.018     |

### Upscale

| Model                                   | Cost/Image |
| --------------------------------------- | ---------- |
| Real-ESRGAN (`nightmareai/real-esrgan`) | $0.002     |

## Music Generation Models

The current music playground uses Google Lyria through Replicate. Both models
accept a text prompt, up to 10 optional reference images, and an optional seed.

| Model                              | Output                       | Price/Generation |
| ---------------------------------- | ---------------------------- | ---------------- |
| Lyria 3 (`google/lyria-3`)         | 30s, 48 kHz stereo MP3       | $0.040           |
| Lyria 3 Pro (`google/lyria-3-pro`) | Up to ~3m, 48 kHz stereo MP3 | $0.080           |

Provider output URLs are transport locations, not durable assets. An integrated
workflow must copy generated audio into durable, application-owned storage
before presenting it as complete.

## Tier Selection Guide

- **`nano`** — Best for high-volume, low-complexity tasks. Titles, summaries, simple extraction.
- **`mini`** — Good balance of capability and cost. Suitable for most interactive agent tasks.
- **`pro`** — Higher quality reasoning and generation. Use when output quality matters.
- **`max`** — Maximum capability for demanding tasks. Complex multi-step reasoning, nuanced analysis.

---

_Pricing sourced from provider documentation. Prices reflect direct provider pricing and may change when models are updated._
