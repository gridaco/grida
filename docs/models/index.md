---
slug: pricing
format: md
---

# Models & Pricing

Grida uses AI models across the editor for text generation, image generation, and image processing. This page documents the available models, their capabilities, and pricing.

All models are routed through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).

## Budget

Free users receive a **$1.00 monthly budget** (rolling 30-day window). Each AI operation deducts the model's cost from the budget.

## Agent Models

Agent models power chat, content generation, summarization, code, tool use, and agentic features in the editor.

Models are organized into **tiers** based on capability and cost:

| Tier   | Audience          | Typical use                                             |
| ------ | ----------------- | ------------------------------------------------------- |
| `nano` | Free users / misc | Title generation, summarization, lightweight extraction |
| `mini` | Free users        | Main agent, sub-agent, multimodal tasks                 |
| `pro`  | Paid users        | Main agent, multimodal tasks                            |
| `max`  | Paid users        | Heaviest tasks, complex reasoning                       |

### Current Models

| Tier   | Model                                             | Context | Max Output | Input (per 1M) | Output (per 1M) |
| ------ | ------------------------------------------------- | ------- | ---------- | -------------- | --------------- |
| `nano` | GPT-5.4 Nano (`openai/gpt-5.4-nano`)              | 400K    | 128K       | $0.20          | $1.25           |
| `mini` | GPT-5.4 Mini (`openai/gpt-5.4-mini`)              | 400K    | 128K       | $0.75          | $4.50           |
| `pro`  | Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`) | 1M      | 128K       | $3.00          | $15.00          |
| `max`  | Claude Opus 4.8 (`anthropic/claude-opus-4.8`)     | 1M      | 128K       | $5.00          | $25.00          |

All tier models support **multimodal** inputs (text + images).

### Cache Pricing

All tiers support prompt caching, which reduces cost for repeated context:

| Tier   | Cache Read (per 1M) | Cache Write (per 1M) |
| ------ | ------------------- | -------------------- |
| `nano` | $0.02               | —                    |
| `mini` | $0.075              | —                    |
| `pro`  | $0.30               | $3.75                |
| `max`  | $0.50               | $6.25                |

### All Models

Per 1M tokens.

| Name                                                     | Input  | Cache Write | Cache Read | Output  |
| -------------------------------------------------------- | ------ | ----------- | ---------- | ------- |
| GPT-5.4 Nano (`openai/gpt-5.4-nano`)                     | $0.20  | —           | $0.02      | $1.25   |
| GPT-5.4 Mini (`openai/gpt-5.4-mini`)                     | $0.75  | —           | $0.075     | $4.50   |
| Claude Sonnet 4.6 (`anthropic/claude-sonnet-4.6`)        | $3.00  | $3.75       | $0.30      | $15.00  |
| Claude Opus 4.8 (`anthropic/claude-opus-4.8`)            | $5.00  | $6.25       | $0.50      | $25.00  |
| Claude Opus 4.7 (`anthropic/claude-opus-4.7`) _(legacy)_ | $5.00  | $6.25       | $0.50      | $25.00  |
| GPT-5.5 (`openai/gpt-5.5`)                               | $5.00  | —           | $0.50      | $30.00  |
| GPT-5.5 Pro (`openai/gpt-5.5-pro`)                       | $30.00 | —           | —          | $180.00 |
| Gemini 3.5 Flash (`google/gemini-3.5-flash`)             | $1.50  | —           | $0.15      | $9.00   |

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

| Model                                                            | Input (per 1M) | Output (per 1M) |
| ---------------------------------------------------------------- | -------------- | --------------- |
| Gemini 3.1 Flash Image (`google/gemini-3.1-flash-image-preview`) | $0.50          | $3.00           |
| Gemini 3 Pro Image (`google/gemini-3-pro-image`)                 | $2.00          | $12.00          |

### Black Forest Labs

Flat per-image pricing.

| Model                                     | Price/Image |
| ----------------------------------------- | ----------- |
| Flux 2 Pro (`bfl/flux-2-pro`)             | $0.060      |
| Flux Kontext Max (`bfl/flux-kontext-max`) | $0.080      |
| Flux Kontext Pro (`bfl/flux-kontext-pro`) | $0.050      |
| Flux Pro 1.1 (`bfl/flux-pro-1.1`)         | $0.040      |

### Image Sizes

| Model              | Min Size  | Max Size                         | Aspect Ratios |
| ------------------ | --------- | -------------------------------- | ------------- |
| GPT Image 2        | —         | edges ≤ 3840 px, ≤ 8.3M px total | up to 3:1     |
| GPT Image 1.5      | 1024x1024 | 1536x1536                        | 1:1, 2:3, 3:2 |
| GPT Image Mini     | 1024x1024 | 1536x1536                        | 1:1, 2:3, 3:2 |
| Gemini Flash Image | —         | 1536x1536                        | Flexible      |
| Gemini Pro Image   | —         | 1536x1536                        | Flexible      |
| Flux 2 Pro         | 256x256   | 1440x1440                        | Flexible      |
| Flux Kontext Max   | —         | 1820x1820                        | Flexible      |
| Flux Kontext Pro   | —         | 1820x1820                        | Flexible      |
| Flux Pro 1.1       | 256x256   | 1440x1440                        | Flexible      |

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

## Tier Selection Guide

- **`nano`** — Best for high-volume, low-complexity tasks. Titles, summaries, simple extraction.
- **`mini`** — Good balance of capability and cost. Suitable for most interactive agent tasks.
- **`pro`** — Higher quality reasoning and generation. Use when output quality matters.
- **`max`** — Maximum capability for demanding tasks. Complex multi-step reasoning, nuanced analysis.

---

_Pricing sourced from provider documentation. Prices reflect direct provider pricing and may change when models are updated._
