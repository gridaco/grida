---
title: Models & Pricing
description: Compare Grida AI model tiers, context windows, and text, image, and music generation costs.
keywords:
  [
    AI models,
    AI pricing,
    GPT-5.6,
    GPT Image 2.5,
    Claude Fable 5.1,
    Lyria,
    Grida AI,
  ]
slug: pricing
format: md
---

# Models & Pricing

Grida uses AI models across the editor for text, image, music, and media-processing workflows. This page documents the models that are integrated and available to use, their capabilities, and pricing.

Models are available through Grida-hosted routes or a connected provider key. Models that require a specialist provider identify that provider explicitly; check provider availability before choosing a model.

## Billing

Grida-hosted AI usage is deducted from prepaid credit purchased separately for your organization. Pricing plans do not include recurring AI credit. When you use your own provider key, the provider charges your account directly. The rates below describe the provider's pricing for each operation.

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
it is not guaranteed to be strictly cheaper. GPT-5.6 Luna is currently both
the lowest-cost model considered adequate for background work and the best
value at `mini`. Expect the two tiers to separate again as new models are
released; picking `nano` is always safe for cost-sensitive work regardless.

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

| Name                                                     | Input  | Cache Write | Cache Read | Output  |
| -------------------------------------------------------- | ------ | ----------- | ---------- | ------- |
| Claude Sonnet 5 (`anthropic/claude-sonnet-5`)            | $2.00  | $2.50       | $0.20      | $10.00  |
| Claude Fable 5.1 (`anthropic/claude-fable-5.1`)          | $10.00 | $12.50      | $0.25      | $50.00  |
| Claude Fable 5 (`anthropic/claude-fable-5`) _(legacy)_   | $10.00 | $12.50      | $1.00      | $50.00  |
| Claude Opus 5 (`anthropic/claude-opus-5`)                | $5.00  | $6.25       | $0.50      | $25.00  |
| Claude Opus 4.8 (`anthropic/claude-opus-4.8`) _(legacy)_ | $5.00  | $6.25       | $0.50      | $25.00  |
| GPT-5.6 Sol (`openai/gpt-5.6-sol`)                       | $4.00  | $5.00       | $0.40      | $20.00  |
| GPT-5.6 Terra (`openai/gpt-5.6-terra`)                   | $2.00  | $2.50       | $0.20      | $12.00  |
| GPT-5.6 Luna (`openai/gpt-5.6-luna`)                     | $0.20  | $0.25       | $0.02      | $1.20   |
| GPT-5.5 (`openai/gpt-5.5`) _(legacy)_                    | $5.00  | —           | $0.50      | $30.00  |
| GPT-5.5 Pro (`openai/gpt-5.5-pro`)                       | $30.00 | —           | —          | $180.00 |
| Gemini 3.8 Flash (`google/gemini-3.8-flash`)             | $1.50  | —           | $0.15      | $7.50   |
| Gemini 3.7 Flash (`google/gemini-3.7-flash`) _(legacy)_  | $1.50  | —           | $0.15      | $7.50   |
| Gemini 3.1 Pro Preview (`google/gemini-3.1-pro-preview`) | $2.00  | —           | $0.20      | $12.00  |

GPT-5.6 and GPT-5.5 prices above are base rates. Requests with more than 272K
input tokens are billed at 2x input and 1.5x output for the full request.
`Gemini 3.1 Pro Preview` is tiered the same way at a 200K threshold ($4.00
input / $18.00 output / $0.40 cache read for the full request).

`Gemini 3.8 Flash` is the current GA Flash model. Its catalogue ID is available
through Vercel AI Gateway and OpenRouter. `Gemini 3.7 Flash` remains callable
as a legacy option for compute-efficient workloads because Google notes that
3.8 can consume more tokens. Both are listed at their steady-state rates.
Google is running a promotion through 2026-12-31 at $0.75 input / $3.75 output
/ $0.075 cache read; the table holds the price that applies from 2027-01-01 so
an expiring promotion is never a silent cost increase.

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

Image models power the image generation features in the editor. Pricing varies by provider — some charge per image (flat or tiered by quality/size), others charge per token. The model list shows available providers; a listed model needs at least one supported provider, and a single key may not cover every model.

### OpenAI

OpenAI image models are billed by token usage, including text and image inputs. Image output cost depends on the model, quality, and dimensions.

**GPT Image 2.5 Flare** (`openai/gpt-image-2.5-flare`) and **GPT Image 2.5 Sunburst** (`openai/gpt-image-2.5-sunburst`)

[Released September 8, 2026](https://openai.com/index/introducing-chatgpt-images-2-5/), Flare is the faster everyday option; Sunburst prioritizes precise edits and intricate detail, with longer generation times. Both are available through Grida-hosted credit and connected **fal**, **OpenRouter**, or **Vercel AI Gateway** keys. Desktop requires version 0.0.22 or later, including when the hosted model catalog has already refreshed.

Read [GPT Image 2.5: Flare vs Sunburst, pricing and features](./gpt-image-2-5.md)
for a model comparison, transparent-background support, and an explanation
of why equal token prices can produce different per-image costs.

Both variants support generation and, through fal or OpenRouter, editing with up to 16 reference images. Grida accepts 1–4 outputs per request. Quality options are `auto`, `low`, `medium`, `high`, `xhigh`, and `max`; Grida selects `high` initially. Dimensions must be multiples of 16, neither edge may exceed 3840 px, the aspect ratio must be at most 3:1, and total area must be 655,360–8,294,400 pixels. Transparent backgrounds require PNG or WebP output. See the [Flare API](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api) and [Sunburst editing API](https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api).

The Desktop image playground generates from text. This update does not add a
reference-image editing control there; the editing bindings are available to
agent hosts that explicitly select one of these variants.

Both variants have the same [fal token rates](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image), in USD per 1M tokens:

| Token type | Input | Cached input | Output |
| ---------- | ----- | ------------ | ------ |
| Text       | $5.00 | $1.25        | $10.00 |
| Image      | $8.00 | $2.00        | $30.00 |

Equal token rates do not imply equal per-image costs: model choice, quality,
dimensions, and inputs affect token usage. OpenAI's [Flare model card](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
explicitly says that the GPT Image 2 calculator does not estimate GPT Image
2.5 token consumption. OpenAI's [image-generation guide](https://developers.openai.com/api/docs/guides/image-generation)
now has a model-specific output-cost calculator: select GPT Image 2.5 rather
than applying GPT Image 2's per-image table. Its estimate excludes input
charges; use actual provider usage when comparing total costs. fal rounds
the total charge up to the nearest $0.0001.

[Vercel AI Gateway](https://vercel.com/ai-gateway/models/gpt-image-2.5-flare) publishes $5/M input tokens, $1.25/M cached input tokens, and $30/M output tokens. [OpenRouter](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.5-flare/endpoints) publishes $5/M text input, $8/M image input, and $30/M image output tokens. Grida keeps each provider's published meter separately. Hosted image billing uses Gateway's reported response cost when available. Without that receipt, it falls back to the catalog's coarse per-image estimate ($0.055 for these variants), which can differ from actual token cost across quality levels and dimensions.

**GPT Image 2** (`openai/gpt-image-2`) — _deprecated in Grida, superseded by GPT Image 2.5_

Per 1M tokens: `text input $5.00 · text cached $1.25 · image input $8.00 · image cached $2.00 · output $30.00`

| Quality | 1024x1024 | 1024x1536 | 1536x1024 |
| ------- | --------- | --------- | --------- |
| Low     | $0.006    | $0.005    | $0.005    |
| Medium  | $0.053    | $0.041    | $0.041    |
| High    | $0.211    | $0.165    | $0.165    |

GPT Image 2 also accepts arbitrary resolutions (multiples of 16, edges ≤ 3840 px, aspect ratio ≤ 3:1, total pixels in 655,360 – 8,294,400). Cost for non-standard sizes is computed from output token count.

GPT Image 2 remains available through Vercel AI Gateway, fal, and OpenRouter,
including Grida's hosted route. Deprecation marks it as a legacy choice; it is
not an upstream OpenAI retirement and does not remove its ID, change existing
defaults, or replace saved model selections.

**Transparent backgrounds**

In Grida Desktop 0.0.22 or later, GPT Image 2 offers native transparent
backgrounds with a connected fal key. Both GPT Image 2.5 variants additionally
support transparency through Vercel AI Gateway, including Grida-hosted credit.
Select
**Transparent background** in the image playground settings; Grida requests
PNG output and preserves the original image bytes when saving or downloading.
This does not run a background-removal model afterward.

Provider support is checked separately from the model's native capability.
OpenAI added GPT Image 2 transparency in its [August 20 update](https://developers.openai.com/api/docs/changelog),
and fal exposes it. OpenRouter's [GPT Image 2 endpoint](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2/endpoints)
and current GPT Image 2.5 endpoints still accept only `auto` or `opaque`.
Vercel transparency for GPT Image 2 remains unverified, although its
[Flare](https://vercel.com/ai-gateway/models/gpt-image-2.5-flare) and
[Sunburst](https://vercel.com/ai-gateway/models/gpt-image-2.5-sunburst) pages
explicitly support it. Grida only offers transparency on verified routes.
If a required provider is disconnected, generation is blocked rather than
silently producing an opaque image. Older Desktop versions do not send the
new background setting.

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

`Muse Image 1.0` remains outside the default picker. Its OpenRouter listing has
no serving endpoint.

### Recraft

Flat per-image pricing for raster output. Vector styles are a separate route at $0.08 and are not offered.

| Model                                        | Price/Image |
| -------------------------------------------- | ----------- |
| Recraft V4.1 (`recraft/recraft-v4.1`)        | $0.035      |
| Recraft V3 (`recraft/recraft-v3`) _(legacy)_ | $0.040      |

`Recraft V3` is deprecated in Grida's catalogue in favor of `Recraft V4.1`,
which is cheaper on every provider; this is not an upstream Recraft retirement.

### Image Sizes

| Model                          | Min Size         | Max Size                         | Aspect Ratios |
| ------------------------------ | ---------------- | -------------------------------- | ------------- |
| GPT Image 2.5 Flare / Sunburst | 655,360 total px | edges ≤ 3840 px, ≤ 8.3M px total | up to 3:1     |
| GPT Image 2                    | —                | edges ≤ 3840 px, ≤ 8.3M px total | up to 3:1     |
| GPT Image 1.5                  | 1024x1024        | 1536x1536                        | 1:1, 2:3, 3:2 |
| GPT Image Mini                 | 1024x1024        | 1536x1536                        | 1:1, 2:3, 3:2 |
| Gemini Flash Image             | —                | 1536x1536                        | Flexible      |
| Gemini Flash Lite              | —                | 1024x1024 (1K only)              | Flexible      |
| Gemini Pro Image               | —                | 1536x1536                        | Flexible      |
| Flux 2 Max                     | 256x256          | 1440x1440                        | Flexible      |
| Flux 2 Pro                     | 256x256          | 1440x1440                        | Flexible      |
| Flux Kontext Max               | —                | 1820x1820                        | Flexible      |
| Flux Kontext Pro               | —                | 1820x1820                        | Flexible      |
| Flux Pro 1.1                   | 256x256          | 1440x1440                        | Flexible      |
| Recraft V4.1                   | —                | 2048x2048                        | Flexible      |
| Recraft V3                     | —                | 2048x2048                        | Flexible      |
| Seedream 5.0 Pro               | 1.0 MP           | 4.2 MP (1024² to 2048² total px) | up to 16:1    |
| Seedream 5.0 Lite              | 3.7 MP           | 16.8 MP (2560x1440 to 4096²)     | Flexible      |
| Grok Imagine Image 2.0         | —                | 2048x2048 (1K or 2K)             | Flexible      |
| Muse Image 1.0                 | —                | chosen by the model              | 21:9 to 9:21  |

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
