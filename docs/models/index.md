---
slug: pricing
---

# Models & Pricing

Grida uses AI models across the editor for text generation, image generation, and image processing. This page documents the available models, their capabilities, and pricing.

## Credits

Grida uses a **credit** system for AI operations. 1 credit = $0.0016 USD.

Credits provide a unified billing unit across all AI features regardless of the underlying model or provider.

## Text Models

Text models power chat, content generation, summarization, and agentic features in the editor.

Models are organized into **tiers** based on capability and cost:

| Tier   | Audience          | Typical use                                             |
| ------ | ----------------- | ------------------------------------------------------- |
| `nano` | Free users / misc | Title generation, summarization, lightweight extraction |
| `mini` | Free users        | Main agent, sub-agent, multimodal tasks                 |
| `pro`  | Paid users        | Main agent, multimodal tasks                            |
| `max`  | Paid users        | Heaviest tasks, complex reasoning                       |

### Current Models

| Tier   | Model                                         | Context Window | Max Output | Input (per 1M tokens) | Output (per 1M tokens) |
| ------ | --------------------------------------------- | -------------- | ---------- | --------------------- | ---------------------- |
| `nano` | GPT-5 Nano (`openai/gpt-5-nano`)              | 400K           | 128K       | $0.05                 | $0.40                  |
| `mini` | GPT-5 Mini (`openai/gpt-5-mini`)              | 400K           | 128K       | $0.25                 | $2.00                  |
| `pro`  | Claude Sonnet 4 (`anthropic/claude-sonnet-4`) | 200K           | 64K        | $3.00                 | $15.00                 |
| `max`  | Claude Opus 4 (`anthropic/claude-opus-4`)     | 200K           | 32K        | $15.00                | $75.00                 |

All text models support **multimodal** inputs (text + images).

### Cache Pricing

The `pro` and `max` tiers support prompt caching, which reduces cost for repeated context:

| Tier  | Cache Read (per 1M tokens) | Cache Write (per 1M tokens) |
| ----- | -------------------------- | --------------------------- |
| `pro` | $0.30                      | $3.75                       |
| `max` | $1.50                      | $18.75                      |

## Image Generation Models

Image models power the image generation features in the editor. Pricing is per image.

| Model                                                   | Provider  | Speed   | Avg. Cost/Image | Credits | Status     |
| ------------------------------------------------------- | --------- | ------- | --------------- | ------- | ---------- |
| GPT Image 1.5 (`gpt-image-1.5`)                         | OpenAI    | Medium  | $0.026          | 50      | Active     |
| Flux Kontext Max (`black-forest-labs/flux-kontext-max`) | Replicate | Fastest | $0.080          | 50      | Active     |
| Flux Pro 1.1 (`black-forest-labs/flux-1.1-pro`)         | Replicate | Slow    | $0.040          | 25      | Active     |
| GPT Image 1 (`gpt-image-1`)                             | OpenAI    | Slowest | $0.098          | 62      | Deprecated |
| Recraft V3 (`recraft-ai/recraft-v3`)                    | Replicate | Slow    | $0.040          | 25      | Deprecated |
| Flux Schnell (`black-forest-labs/flux-schnell`)         | Replicate | Fastest | $0.003          | 2       | Deprecated |

### Image Sizes

Each model supports different output sizes. Default output is 1024x1024 (1:1).

| Model            | Min Size  | Max Size  | Supported Aspect Ratios |
| ---------------- | --------- | --------- | ----------------------- |
| GPT Image 1.5    | 1024x1024 | 1536x1536 | 1:1, 2:3, 3:2           |
| Flux Kontext Max | —         | 1820x1820 | Any (freeform)          |
| Flux Pro 1.1     | 256x256   | 1440x1440 | Any (freeform)          |

## Image Tools

Image tools provide processing capabilities like upscaling and background removal.

### Background Removal

| Model                                                              | Provider  | Avg. Cost/Image | Credits |
| ------------------------------------------------------------------ | --------- | --------------- | ------- |
| 851 Labs Background Remover (`851-labs/background-remover`)        | Replicate | $0.00048        | 1       |
| Recraft Remove Background (`recraft-ai/recraft-remove-background`) | Replicate | $0.010          | 7       |
| Bria Remove Background (`bria/remove-background`)                  | Replicate | $0.018          | 12      |

### Upscale

| Model                                   | Provider  | Avg. Cost/Image | Credits |
| --------------------------------------- | --------- | --------------- | ------- |
| Real-ESRGAN (`nightmareai/real-esrgan`) | Replicate | $0.002          | 2       |

## Tier Selection Guide

Choose the right tier for your use case:

- **`nano`** — Best for high-volume, low-complexity tasks where cost efficiency matters. Titles, summaries, simple extraction.
- **`mini`** — Good balance of capability and cost. Suitable for most interactive agent tasks.
- **`pro`** — Higher quality reasoning and generation. Use when output quality matters more than cost.
- **`max`** — Maximum capability for the most demanding tasks. Complex multi-step reasoning, large codebases, nuanced analysis.

---

_Pricing data sourced from [models.dev](https://models.dev). Prices reflect direct provider pricing and may change when models are updated._
