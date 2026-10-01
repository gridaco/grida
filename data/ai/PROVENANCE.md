# Catalogue research notes

These notes retain the source-specific qualifications and references that accompanied
the former TypeScript literals. Model values are authored in `facts.json`; the
notes explain their provenance and should be updated with the corresponding facts.
The code fragments below identify the original TypeScript declaration or card
and retain its historical field spelling. Authored domain fields now use
`lower_snake_case`; the generator maps the named text/cost fields to the existing
TypeScript API and schema-1 wire spellings. These notes do not change that
projection or establish a second source of model values.

## `const OPENAI_IMAGE_INPUT_MIMES = [`

Provider-family capabilities are kept private so catalogue entries remain
explicit while sharing one source-backed value. Do not derive these from
`multimodal`; a future model may be multimodal without a documented image
input format set.
https://developers.openai.com/api/docs/guides/images-vision#image-input-requirements

## `const ANTHROPIC_IMAGE_INPUT_MIMES = [`

https://platform.claude.com/docs/en/build-with-claude/vision#supported-formats

## `const GOOGLE_IMAGE_INPUT_MIMES = [`

https://ai.google.dev/gemini-api/docs/image-understanding#supported-image-formats

## `const OPENAI_LONG_CONTEXT_PRICING = {`

OpenAI bills the full request at these multipliers once its total input
exceeds 272K tokens. The same rule is published for GPT-5.5, every
GPT-5.6 family member, and GPT-6 Astra.
https://developers.openai.com/api/docs/models/gpt-5.5
https://developers.openai.com/api/docs/models/gpt-5.6-sol
https://developers.openai.com/api/docs/models/gpt-6-astra

## `"openai/gpt-5.6-sol": {`

Base rates; OPENAI_LONG_CONTEXT_PRICING represents the request-wide
band that applies above 272K total input tokens.

Sol is cheaper than GPT-5.5, the card directly above it. It was
introduced carrying 5.5's rates verbatim; these are OpenAI's own.
https://developers.openai.com/api/docs/models/gpt-5.6-sol

## `"openai/gpt-6-astra": {`

OpenAI's September 3 introduction remained a limited rollout. The
September 4 date below is the exact Vercel AI Gateway route's broad availability,
which is the release fact relevant to this route card.
https://openai.com/products/release-notes/
https://vercel.com/ai-gateway/models/gpt-6-astra

## `"anthropic/claude-sonnet-5": {`

$2/$10 is the standard rate, not a live discount: it launched as an
introductory rate and Anthropic made it permanent, cancelling the
announced step up to $3/$15. Do not restore the higher card.
https://platform.claude.com/docs/en/about-claude/pricing

## `"anthropic/claude-fable-5.1": {`

Same input/output/cacheWrite card as Claude Fable 5, with cache reads
cut to $0.25/MTok. Not a drop-in successor — forced tool choice
(`tool_choice` `any`/`tool`) is rejected here — which is why Fable 5
stays catalogued rather than being removed.
https://platform.claude.com/docs/en/models/fable-5-1/overview

## `"anthropic/claude-fable-5": {`

Unlike Fable 5.1, this version accepts forced tool choice.

## `"anthropic/claude-opus-5": {`

Drop-in successor to Opus 4.8 at the same rate card.

## `"google/gemini-3.8-flash": {`

Google's cache model is read + hourly storage (no one-time write
premium that matches `cacheWrite` semantics), so the field is omitted.

Steady-state rates. Google is promoting $0.75 in / $3.75 out / $0.075
cacheRead through 2026-12-31; these are the prices that apply from
2027-01-01. Checking Google's page before then will show the lower
set — that is the promotion, not a correction. Gemini 3.8 Flash is GA,
and this exact id is live on both Vercel AI Gateway and OpenRouter.
https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
https://ai.google.dev/gemini-api/docs/pricing
https://vercel.com/ai-gateway/models/gemini-3.8-flash
https://openrouter.ai/google/gemini-3.8-flash

## `"google/gemini-3.7-flash": {`

3.8 improves accuracy and reliability at the same rate, but Google
still recommends 3.7 when compute efficiency matters because 3.8 can
consume more tokens.
https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash

## `longContext: {`

Google bills the full request at $4 in / $18 out / $0.40
cacheRead above 200K tokens. `inputMultiplier` covers every
input bucket, so cacheRead 0.2 x 2 lands on $0.40 without a
separate field.
https://ai.google.dev/gemini-api/docs/pricing

## `const GPT_IMAGE_2_5_FAL_PRICING: PerTokenPricing = {`

Both 2.5 variants use this fal meter. Keep the separate text-output
rate: fal publishes it even though its result schema exposes only images.
https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image
https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image

## `const GPT_IMAGE_2_5_VERCEL_AI_GATEWAY_PRICING: PerTokenPricing = {`

Each serving provider publishes its own meter; do not copy fal's extra
image-cache/text-output rates into providers that do not advertise them.
https://ai-gateway.vercel.sh/v1/models (verified 2026-09-09 KST)

## `const GPT_IMAGE_2_5_OPENROUTER_PRICING: PerTokenPricing = {`

Both variants' /api/v1/images/models/{id}/endpoints publish this meter.
https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.5-flare/endpoints
https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.5-sunburst/endpoints

## `"openai/gpt-image-2": {`

-----------------------------------------------------------------
OpenAI
-----------------------------------------------------------------
https://developers.openai.com/api/docs/models/gpt-image-2

## `transparent_background: true,`

Native transparency added 2026-08-20; provider exposure differs.
https://developers.openai.com/api/docs/changelog

## `providers: {`

ids/prices verified 2026-06-29, see github.com/gridaco/grida/issues/908

## `transparent_background: null,`

This provider's page does not establish background support.
https://vercel.com/ai-gateway/models/gpt-image-2 (2026-09-09)

## `transparent_background: false,`

Published background enum is auto | opaque (2026-09-09).
https://openrouter.ai/api/v1/images/models/openai/gpt-image-2/endpoints

## `references: { id: "openai/gpt-image-2", max: 16 },`

input_references advertised by OpenRouter (0–16), 2026-07-01.

## `},`

Inherits native transparency: fal-ai/gpt-image-2's published
background enum includes transparent (verified 2026-09-09).

## `"openai/gpt-image-2.5-flare": {`

Released as two distinct models. All three providers now list both
variants; fal separates generation and edit endpoint ids, while
OpenRouter advertises input_references on the same id (2026-09-09 KST).

## `transparent_background: true,`

Both fal generation and edit schemas expose background=transparent.
https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api
https://fal.ai/models/openai/gpt-image-2.5/flare/edit/api

## `url: "https://vercel.com/ai-gateway/models/gpt-image-2.5-flare",`

The model page exposes background=transparent; reference input
is not established by the Vercel AI Gateway feed (2026-09-09 KST).

## `transparent_background: false,`

Endpoint schema's background enum is auto | opaque.

## `constraints: {`

Model-specific fal documentation overrides its generic ImageSize
component's wider bounds. The API also accepts auto-sized output.
https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image/api

## `avg_cost_usd: 0.055,`

High 1024² output estimate is $0.05268, plus a small input allowance.
Not a fixed per-image price: actual cost depends on all billed tokens.
https://developers.openai.com/api/docs/guides/image-generation

## `transparent_background: true,`

Both fal generation and edit schemas expose background=transparent.
https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image/api
https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/api

## `url: "https://vercel.com/ai-gateway/models/gpt-image-2.5-sunburst",`

The model page exposes background=transparent; reference input
is not established by the Vercel AI Gateway feed (2026-09-09 KST).

## `transparent_background: false,`

Endpoint schema's background enum is auto | opaque.

## `constraints: {`

https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image/api

## `"openai/gpt-image-1.5": {`

https://developers.openai.com/api/docs/models/gpt-image-1.5

## `constraints: null,`

Preset-only — provider rejects arbitrary sizes.

## `pricing: {`

https://developers.openai.com/api/docs/models/gpt-image-1.5

## `"openai/gpt-image-1-mini": {`

https://developers.openai.com/api/docs/models/gpt-image-1-mini

## `constraints: null,`

Preset-only — provider rejects arbitrary sizes.

## `pricing: {`

https://developers.openai.com/api/docs/models/gpt-image-1-mini

## `"google/gemini-3.1-flash-image-preview": {`

-----------------------------------------------------------------
Google (multimodal LLMs with native image output)
-----------------------------------------------------------------
python .tools/model_info.py --image gemini-3.1-flash-image
Vercel AI Gateway pricing: $0.50/MTok input, $3.00/MTok output

## `providers: {`

"Nano Banana 2"; ids/prices verified 2026-06-29, see issues/908

## `vercel: {`

Vercel AI Gateway serves the graduated `google/gemini-3.1-flash-image`
and the `-preview` alias at identical rates (feed, 2026-09-02).
Bindings call the graduated id; the canonical key above stays
`-preview` because it is persisted in selections and published
in the catalogue snapshot — renaming it is a separate change.

## `references: { id: "google/gemini-3.1-flash-image", max: 14 },`

input_references advertised by OpenRouter (0–14), 2026-07-01.

## `fal: {`

fal's graduated endpoint is `fal-ai/nano-banana-2`; same $0.08
per 1K image as the `-preview` endpoint (2K ×1.5, 4K ×2).

## `"google/gemini-3-pro-image": {`

python .tools/model_info.py --image gemini-3-pro-image
Vercel AI Gateway pricing: $2.00/MTok input, $12.00/MTok output

## `providers: {`

"Nano Banana Pro"; ids/prices verified 2026-06-29, see issues/908

## `references: { id: "google/gemini-3-pro-image-preview", max: 14 },`

input_references advertised by OpenRouter (0–14), 2026-07-01.

## `"google/gemini-3.1-flash-lite-image": {`

"Nano Banana 2 Lite" — GA 2026-06-30. The cost/speed tier of the 3.1
Flash family: ~half of Nano Banana 2's meter, and 1K-only output
(2K/4K unsupported — the differentiator). Vercel AI Gateway + OpenRouter both
meter it at $0.25/$1.50 (verified 2026-07-01); fal id not verified,
so left out. OpenRouter doesn't advertise input_references for the
Lite (t2i only per its model page), so no `references` (TOOL-DESIGN:
no unverified capability).

## `avg_cost_usd: 0.034,`

Published 1K per-image cost (the card default): $0.034 = 1120 tokens
× $30/1M image-output (Google/Vercel AI Gateway changelog, 2026-07-01). The
budget meter charges this per image, so it must be the real cost.

## `"bfl/flux-2-pro": {`

-----------------------------------------------------------------
Black Forest Labs (via Vercel AI Gateway)
-----------------------------------------------------------------
https://vercel.com/docs/ai-gateway/capabilities/image-generation/ai-sdk
https://docs.bfl.ml/pricing

## `providers: {`

All three providers meter $0.03 per megapixel (Vercel AI Gateway model page,
OpenRouter endpoint `cost_usd`/megapixel, fal "first megapixel");
represented as flat at the 1MP baseline. The Vercel AI Gateway binding shipped
at $0.06 — a 2x hosted over-billing — corrected 2026-09-02. The
Vercel AI Gateway feed carries no `pricing` for BFL cards, so the page is the
source.

## `references: { id: "black-forest-labs/flux.2-pro", max: 8 },`

input_references advertised by OpenRouter (0–8), 2026-07-01.

## `"bfl/flux-2-max": {`

-----------------------------------------------------------------
Black Forest Labs — Flux 2 Max
-----------------------------------------------------------------
BFL's top Flux 2 line (2025-12-16). $0.07 per megapixel on all three
(Vercel AI Gateway model page — the feed carries no BFL pricing; OpenRouter
`cost_usd`/megapixel; fal "first megapixel", +$0.03 each additional).
Represented as flat at the 1MP baseline. Verified 2026-09-02.

## `references: { id: "black-forest-labs/flux.2-max", max: 8 },`

OpenRouter `supported_parameters.input_references` 0–8
(2026-09-02). As on Flux 2 Pro.

## `constraints: { min_edge: 256, max_edge: 1440 },`

Same envelope as Flux 2 Pro pending a vendor spec for Max.

## `providers: {`

$0.04 on both providers: Vercel AI Gateway feed `pricing.image` + fal's model
page ("Fixed $0.04 cost per image edit"), verified 2026-09-02.

## `"bytedance/seedream-5.0-pro": {`

-----------------------------------------------------------------
ByteDance — Seedream 5.0 Pro
-----------------------------------------------------------------
Vercel AI Gateway feed `pricing.image` $0.035 (the model page's rate table shows
$0.04 while its copy says $0.035 — the feed is the billing contract);
OpenRouter `cost_usd` $0.045 at 1K ($0.09 high-res, +$0.003 per
input image, not modelled); fal $0.0675 for ≤1536² area, $0.135 up
to 2048². Represented at the 1024² baseline. Verified 2026-09-02.

## `references: { id: "bytedance-seed/seedream-5-0-pro", max: 14 },`

OpenRouter `supported_parameters.input_references` 0–14
(2026-09-02). Same endpoint as t2i, as on 4.5.

## `constraints: {`

fal: total pixels between 1024x1024 and 2048x2048, aspect ratio
between 1:16 and 16:1 — an area bound, not a per-edge one, so a
512x2048 request is in-envelope and a 2048x2048 one is the ceiling.

## `"bytedance/seedream-5.0-lite": {`

-----------------------------------------------------------------
ByteDance — Seedream 5.0 Lite
-----------------------------------------------------------------
Universal: $0.035/img on all three (Vercel AI Gateway feed `pricing.image`,
OpenRouter `cost_usd`, fal page payload), verified 2026-09-02. A
2K–4K model: fal scales requests below 2560x1440 up to its floor.

## `references: { id: "bytedance-seed/seedream-5-0-lite", max: 14 },`

OpenRouter `supported_parameters.input_references` 0–14
(2026-09-02).

## `constraints: { min_pixels: 3_686_400, max_pixels: 16_777_216 },`

fal: total pixels between 2560x1440 and 4096x4096 (requests below
the floor are scaled up to it); Vercel AI Gateway and OpenRouter serve 2K/4K
only. An area envelope, so the default is a 2K request.

## `"bytedance/seedream-4.5": {`

-----------------------------------------------------------------
ByteDance — Seedream 4.5
-----------------------------------------------------------------
$0.04/img on all three providers (re-verified 2026-09-02).

## `references: { id: "bytedance-seed/seedream-4.5", max: 14 },`

i2i verified live 2026-07-01 (OpenRouter /api/v1/images
input_references; same endpoint as t2i). max from
supported_parameters.input_references.

## `"xai/grok-imagine-image-2.0": {`

-----------------------------------------------------------------
SpaceXAI — Grok Imagine Image 2.0
-----------------------------------------------------------------
Tiered by quality (low/medium) × resolution (1K/2K); the same four
rates on all three providers (Vercel AI Gateway feed
`image_dimension_quality_pricing`, OpenRouter `cost_usd` variants,
fal page). OpenRouter also bills $0.01 per input image (not
modelled). Verified 2026-09-02.

## `references: { id: "x-ai/grok-imagine-image-2.0", max: 3 },`

OpenRouter `supported_parameters.input_references` 0–3
(2026-09-02). OR bills $0.01 per input image on top (not modelled).

## `"meta/muse-image-1.0": {`

-----------------------------------------------------------------
Meta — Muse Image 1.0
-----------------------------------------------------------------
Meta's agentic image model (2026-08-26): $0.01/img on Vercel AI Gateway (feed
`pricing.image`) and fal (page payload). OpenRouter lists it but
exposes no serving endpoint.
fal exposes aspect ratio only (no size control). Verified 2026-09-02.

## `constraints: null,`

Muse picks output dimensions from the aspect ratio; neither
provider exposes a size envelope, so none is claimed.

## `"recraft/recraft-v4.1": {`

-----------------------------------------------------------------
Recraft — V4.1
-----------------------------------------------------------------
Universal: $0.035/img raster on every provider (Vercel AI Gateway feed
`pricing.image`, OpenRouter endpoint `cost_usd`, fal page payload),
verified 2026-09-02. Vector styles are $0.08 and a separate route on
fal/OpenRouter (`.../text-to-vector`, `recraft-v4.1-vector`) — not
catalogued; `styles: null` here means the raster route only.
OpenRouter org slug is `recraft`, not `recraft-ai`.

## `references: { id: "recraft/recraft-v4.1", max: 1 },`

OpenRouter `supported_parameters.input_references` 0–1
(2026-09-02).

## `"recraft/recraft-v3": {`

-----------------------------------------------------------------
Recraft — V3
-----------------------------------------------------------------
$0.04/img raster on every provider (re-verified 2026-09-02; Recraft's
own pricing table agrees).

## `pricing: { type: "per_run_flat", usd: 0.04 },`

Source: replicate.com/google/lyria-3 — "$0.04 per output audio file"

## `pricing: { type: "per_run_flat", usd: 0.08 },`

Source: replicate.com/google/lyria-3-pro — "$0.08 per output audio file"

## `pricing: {`

API: 100 credits when duration is automatic, or 11 credits/s when set.

## `pricing: { type: "per_1000_characters", usd: 0.1 },`

Source: elevenlabs.io/pricing/api — $0.10 per 1,000 characters.

## `"tripo/rig-v2.5": {`

Follow the documented compatibility table, not its contradictory biped example.

## `"google/veo-3.1": {`

-----------------------------------------------------------------
Google — Veo 3.1
-----------------------------------------------------------------

## `vercel: {`

Vercel AI Gateway — vercelAiGateway.videoModel(id), image-to-video. The
Vercel AI Gateway meters both audio modes and sells 4K; the matrix is
identical to fal's. Verified against Vercel AI Gateway's own
/v1/models feed (`video_duration_pricing`) on 2026-09-02 — the
previous card claimed "audio-on only, ≤1080p", which the feed
contradicts.

`silent` is catalogued as provider truth but is not yet
reachable on Grida's hosted route: the video wire carries no
audio-mode field, so `generateVideo` prices the card's default
mode (`editor/lib/ai/server.ts`). `"4k"` IS reachable — the
request path maps a 2160 short edge to that label and today
rejects it for want of a rate.
https://vercel.com/ai-gateway/models/veo-3.1-generate-001

## `fal: {`

fal.ai — image-to-video endpoint (capability is keyed into the id;
t2v is a separate `fal-ai/veo3.1` endpoint, not catalogued). Rate
matrix is identical to the Vercel AI Gateway's: $0.40/s audio and
$0.20/s silent at 720p/1080p, $0.60/$0.40 at 4K.
https://fal.ai/models/fal-ai/veo3.1/image-to-video

## `openrouter: {`

OpenRouter — async `/api/v1/videos` (job → poll → unsigned url).
Text-to-video + image-to-video; native audio. "from $0.40/s"
(verified 2026-06-29, https://openrouter.ai/google/veo-3.1).

## `"google/veo-3.1-fast": {`

-----------------------------------------------------------------
Google — Veo 3.1 Fast
-----------------------------------------------------------------
Same envelope as Veo 3.1 (16:9/9:16, 4/6/8s, native audio, ≤4K) at
~2.7x lower cost. Rate matrix is identical on Vercel AI Gateway and fal —
Vercel AI Gateway feed `video_duration_pricing` and fal's stated per-second
rates, verified 2026-09-02.

## `"google/veo-3.1-lite": {`

-----------------------------------------------------------------
Google — Veo 3.1 Lite
-----------------------------------------------------------------
The budget Veo: 720p/1080p only, 4/6/8s, native audio. Rates
identical on Vercel AI Gateway and fal (verified 2026-09-02). Vercel AI Gateway
supports both text and image input (FAQ verified 2026-09-07); the fal binding
below requires an image. Hosted GG's narrower wire is a host concern.

## `"alibaba/wan-3.0": {`

-----------------------------------------------------------------
Alibaba — Wan 3.0
-----------------------------------------------------------------
Per-second by resolution, audio bundled into the rate (Vercel AI Gateway
feed has no audio axis; fal exposes an `audio` toggle but bills the
same). Identical on Vercel AI Gateway and fal, verified 2026-09-02. 2–30s.

## `"bytedance/seedance-2.0": {`

ByteDance — Seedance 2.0
-----------------------------------------------------------------

## `providers: {`

NO Vercel AI Gateway binding, deliberately. Vercel AI Gateway serves
`bytedance/seedance-2.0` but meters it PER TOKEN
(`video_token_pricing`: $7.00/MTok at 480p/720p, $7.70 at 1080p,
$4.00 at 4K; reduced with video input; "minimum token floors based
on output duration"). `PerSecondPricing` cannot express that, the
hosted route pre-prices rate×duration, and ByteDance publishes no
tokens-per-second figure — so there is no honest per-second rate,
and the per-second Vercel AI Gateway binding this card shipped with was
invented. Withheld until the hosted path can meter post-flight;
hosted requests fail with "not available on the hosted provider".
See gridaco/grida#1019 (Blocker A). Feed checked 2026-09-02.

## `fal: {`

fal — image-to-video. fal also meters tokens underneath
($0.014/1K), but states a per-second price for the two
resolutions it prices: $0.3034/s @720p, $0.682/s @1080p, audio
bundled. Those are fal's own figures, not a conversion of ours.
https://fal.ai/models/bytedance/seedance-2.0/image-to-video

## `openrouter: {`

OpenRouter — async `/api/v1/videos`. Flat $0.06726/s (verified
2026-06-29, https://openrouter.ai/bytedance/seedance-2.0) — far
below Vercel AI Gateway's per-resolution rate (the proprietary-pricing-
diverges finding, #908). No separate silent meter surfaced.

## `"bytedance/seedance-2.5": {`

-----------------------------------------------------------------
ByteDance — Seedance 2.5
-----------------------------------------------------------------
Newer generation (2026-07-31), NOT a drop-in successor: ~55% more
per token on Vercel AI Gateway ($10.70/MTok at 480p/720p, $11.70 at 1080p
vs 2.0's $7.00/$7.70), ~56–71% more per second on fal, and no 4K.
It buys 4–30s clips, video-editing and extend-video. 2.0 is cheaper
and serves 4K. Vercel AI Gateway bills tokens, so there is no comparable
per-second Vercel AI Gateway meter here. fal states per-second prices, audio bundled.

## `fal: {`

fal's stated rates: $0.2205/s @480p, $0.4730/s @720p, $1.164/s
@1080p (fal meters $0.0214/1K tokens underneath). 2026-09-02.
https://fal.ai/models/bytedance/seedance-2.5/image-to-video

## `"xai/grok-imagine-video-1.5": {`

-----------------------------------------------------------------
SpaceXAI — Grok Imagine Video 1.5
-----------------------------------------------------------------
Image-to-video only (no t2v, per SpaceXAI docs); native lip-synced audio
bundled into the rate. Per-second by resolution, identical on Vercel AI Gateway
(no markup) and fal: $0.08/s @480p, $0.14/s @720p, $0.25/s @1080p.
Both also bill $0.01 per input image, captured separately from the
output meter.

## `vercel: {`

Vercel AI Gateway — image-to-video; mirrors SpaceXAI's list price (no markup).
Vercel AI Gateway namespaces every SpaceXAI model under `spacexai/`, so the
call id deliberately differs from this card's canonical `xai/` id.
https://vercel.com/changelog/grok-imagine-video-1-5-on-ai-gateway

## `fal: {`

fal.ai — image-to-video endpoint; same per-second rate.
https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video

## `pricing: { type: "per_token_input", input: 0.15 },`

VERIFY before prod: models.dev lists no per-1M price for
gemini-embedding-2 yet; using the gemini-embedding-001 family
input rate ($0.15 / 1M) as a conservative stand-in.
