# @grida/ai

Private, experimental SDK for shared model-driven operations. Catalogue-backed
image and video generation use BYOK OpenRouter, Vercel, fal, or scoped Grida
Gateway credentials. Music generation uses the existing GG-only Lyria route;
sound effects and speech use their existing ElevenLabs BYOK operations. Three
existing fal 3D endpoints return a primary GLB asset.

## Ownership

This is the broad AI domain owner for Grida applications and independent hosts.
Model/provider binding, execution, and reusable application-agnostic agent
primitives belong here when a concrete consumer establishes their contract.
Future primitives must earn their API through a complete operation and independent
producer tests; there are no reserved executors or empty future subpaths.

The configured [`@grida/agent`](../grida-ai-agent), its prompts/tools/skills, chat storage, workspace
policy, HTTP routes, application defaults, and external-agent runtimes belong to
their hosts. This package must not import their source, types, manifests, or test
setup. `@grida/ai-models` supplies canonical facts; its explicit
`@grida/ai-models/grida` entry supplies this SDK's existing bundled service
catalogue and schema-1 defaults. The SDK retains those Grida defaults and does
not promise service-policy neutrality. A result contains bytes
and a media type, never a host persistence receipt, workspace path, or `MediaItem`.

### Anti-goals and admission

Being AI-related or convenient to import is insufficient for admission. Shared
code must own a tested, application-independent capability. Configured agents,
host/framework adapters, and credential persistence stay outside. Service model
defaults remain owned by `@grida/ai-models/grida` and are consumed explicitly here.
Do not duplicate catalogue data, add a plugin registry, or invent universal schema
or executor scaffolding to anticipate future operations.

## Discovery and JSON inputs

`MediaOperations` describes the existing executable media operations without
constructing a client, reading credentials, refreshing a catalogue, or making
network requests. Its descriptors and schemas are deeply immutable and JSON
serializable. They describe route support, not account access, credits, pricing,
or a promise that an upstream provider will accept a request.

```ts
import { MediaOperations, ImageClient } from "@grida/ai";

const operations = new MediaOperations();
const choices = operations.list({ kind: "image", provider: "openrouter" });
const selector = {
  kind: "image",
  model_id: choices[0].model_id,
  provider: "openrouter",
  variant: "text",
} as const;
const descriptor = operations.inspect(selector);
// descriptor.input_schema describes this route's serializable input contract.
const parsed = operations.parseInput(selector, {
  prompt: "A pine forest",
  n: 1,
});
if (parsed.kind === "image") {
  const client = new ImageClient({ keys, http });
  const operation = await client.resolve(parsed.selection);
  const result = await operation.generate({ ...parsed.input, signal });
}
```

`list` optionally filters by `kind`, canonical `model_id`, and concrete `provider`.
The kinds are `image`, `video`, `music`, `sound-effect`, `text-to-speech`, and
`three-d`. Discovery excludes `auto` and custom endpoints: each descriptor names
one provider, binding, and input variant. Existing staged SFX, speech, and 3D
operations remain discoverable with their actual `status`; discovery does not
change catalogue publication policy. A retained deprecated image or video card
remains callable and carries `deprecated: true`; removal of its binding still
withholds that route.

`inspect` takes those three selector fields and an optional `variant`. Image
variants are `text` and, where supported, `references`; video variants are `text`
and `image`. The default is `text`, so an image-only video binding requires
`variant: "image"`. Each exact 3D model has one inferred variant and its own input
signature. Other current operations use `text`. Unsupported combinations fail
with `operation_unavailable`; malformed options, selectors, and inputs fail with
`invalid_input`. `MediaOperations.Failure` exposes only that code as its message
and JSON representation.

Pass `{ snapshot }` to pin an explicitly supplied catalogue. The constructor owns
a validated copy; later caller mutations cannot alter descriptors. Image and video
use that view's bindings and capability facts, including explicit removals and
the catalogue's exact-match legacy video fallback. Absent snapshot sections retain
the existing bundled-section behavior. Audio and 3D use their existing fixed
bundled contracts. There is no implicit refresh or provider discovery.

The input schema uses JSON Schema 2020-12 plus the following `x-grida-*` rules.
**`parseInput` is normative**: a general JSON Schema validator alone does not
perform these normalizations or all JavaScript numeric/URI checks. Native clients
and this parser use the same field definitions and route eligibility checks.

| Rule                                             | Meaning                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-grida-trim`                                   | Apply JavaScript string trimming before further checks.                                                                                                             |
| `x-grida-nonblank`                               | The trimmed value must contain a character, even when the original text is preserved.                                                                               |
| `x-grida-max-length`, `x-grida-length-unit`      | Bound the normalized string in Unicode code points or UTF-16 code units as specified. Standard `maxLength` applies where no trimming or UTF-16 exception is needed. |
| `x-grida-uri-segment`, `x-grida-excluded-values` | The normalized voice ID must be URI-encodable and must not equal the excluded values.                                                                               |
| `x-grida-positive-pair`                          | Both numeric components matched by `pattern` must be positive finite numbers or positive safe integers, as specified.                                               |
| `x-grida-url`                                    | Apply the stated scheme, userinfo, and fragment restrictions using URL parsing; `image-data` means an inline image data URL.                                        |
| `x-grida-decoded-max-bytes`                      | Decode nonempty, padded, whitespace-free base64 into a fresh byte array within the stated byte limit.                                                               |

Objects reject extra fields. Optional fields may be omitted; explicit `null` and
`undefined` are not omissions in this JSON contract. Image `n` defaults to 1 and
is capped at 16 before generation can acquire authority or submit batches. Text
normalization remains operation-specific: music uses trimmed UTF-16 length;
SFX and 3D use trimmed code-point length; image, video, and speech preserve input
text. Direct Vercel video rejects `seed: 0` because its pinned upstream serializer
drops zero. The inspected schema describes accepted SDK fields, not every option
or value advertised by a provider's model card.

`parseInput` returns a `kind`-discriminated native `{ selection, input }` pair.
Speech JSON includes `voice_id` and `text`; the normalized voice ID moves into the
selection. Image-input 3D JSON and the exact inline-capable video route use
`{ "image": { "data": "AQID", "media_type": "image/png" } }`, with base64 data
decoded to `Uint8Array`. Local paths are not inputs to this package. `AbortSignal`
is a separate native execution control and is never accepted from JSON.

`descriptor.output` describes the existing native result field, cardinality,
MIME types or families (`image/*`, `video/*`), and decoded byte/item bounds. It is
not a JSON output schema: results contain `Uint8Array`, and hosts choose their
serialization, filenames, persistence, and receipts. Image output has at most the
accepted `n` items. Discovery neither executes nor adds a universal media executor;
callers dispatch to the existing typed clients, including the exact 3D model union.

## Image operation

```ts
import { ImageClient, ProviderHttp } from "@grida/ai";

const images = new ImageClient({
  keys: { get: readAuthorizedProviderKey },
  http: new ProviderHttp({
    request: authorizedProviderRequest,
    download: authorizedAssetDownload,
  }),
});

const operation = await images.resolve({
  model_id: chosenCatalogId,
  provider: "openrouter",
  references: true,
});

// The host authorizes and reads its inputs only after learning this route's cap.
const references = await resolveAuthorizedReferences(operation.references_max!);
const { images: generated } = await operation.generate({
  prompt: "A small house among pine trees",
  references,
  size: "1024x1024",
  quality: "medium",
});
// generated: { data: Uint8Array; media_type: string }[]
```

`resolve` requires both a catalogue model ID and a provider. `provider: "auto"`
explicitly adopts the existing order: connected OpenRouter, Vercel, fal, then GG.
Explicit choices check only that provider. The operation freezes the selected
model, binding, provider, and reference cap. Generation reads the selected
provider's key again; losing that credential fails without switching providers.
No default model, filesystem read, or provider call occurs during resolution.
A configured catalogue can refresh once on a model lookup miss.

References must be host-resolved HTTPS or inline image data URLs within the
advertised cap. Reference resolution selects the catalogue's edit binding;
generation without references on that binding, or references on a text-only
binding, fails before submission. The package does not read local files. The
caller trims or rejects excess references before loading assets.

Native `background` intent (`auto`, `opaque`, `transparent`) can participate in
resolution before the host reads references. Explicit non-auto modes require a
verified catalogue capability on that exact provider; unknown or unsupported
routes are rejected without fallback. The resolved operation captures that
requirement, and generation cannot weaken it. Transparent generation forces PNG.
JSON schemas expose only supported background choices and pass the same intent
to native resolution. This does not promise that every returned pixel is transparent.

Generation accepts an integer `n` from 1 through 16, positive integer `size`, positive
numeric `aspect_ratio`, integer `seed`, optional `quality`, and `signal`, subject
to the selected endpoint's input schema. GPT Image 2.5's OpenRouter and fal routes
do not accept seed; fal also rejects aspect ratio and uses explicit dimensions or
auto size. fal edits use the distinct catalogue edit binding with 1–16 references.
Explicit quality values, including `auto`, are forwarded; Vercel's OpenAI models
use the `openai` namespace. Provider batch limits remain authoritative: a requested count may
require multiple submissions. Every batch sets **`maxRetries: 0`**. Failed
generation is never automatically resubmitted; fal status polling is separate.
Cancellation cannot undo an accepted provider job or its charge.

Only generated bytes and media types leave a successful operation. Provider
metadata, headers, URLs, warnings, and bodies are discarded. `ImageClient.Failure`
contains a stable code and a code-only message/JSON representation, with no
arbitrary cause or prompt. Codes are `invalid_input`, `model_unavailable`,
`provider_unavailable`, `references_unsupported`, `gg_token_expired`,
`insufficient_credits`, `aborted`, `invalid_response`, and `generation_failed`.
Catalogue/key presence is a routing decision, not proof of provider account
readiness, entitlement, affordability, or eventual generation success.

## Video operation

```ts
import { VideoClient } from "@grida/ai";

const videos = new VideoClient({ keys, http, catalog, gg, gg_base_url });
const operation = await videos.resolve({
  model_id: chosenCatalogId,
  provider: "fal",
  image: true,
});
const result = await operation.generate({
  prompt: "Clouds moving over a mountain lake",
  image_url: authorizedHttpsStartFrame,
  duration: 4,
  signal,
});
// result.videos: { data: Uint8Array; media_type: string }[]
```

Selection is explicit, with the same opt-in `auto` precedence as images.
The frozen descriptor includes `input: "text" | "image" | "text-or-image"` from
the selected catalogue binding. `image: true` selects a start-frame operation;
its generation requires an authorized HTTPS `image_url`, or bounded image bytes
where that exact operation's input schema declares `image`. A text selection rejects
image inputs. Capability facts are owned by `@grida/ai-models`; absent facts in old
snapshots use only exact canonical/provider/binding matches to bundled facts.
Changed, removed, or explicitly unknown bindings do not inherit capabilities.
GG remains text-only and requires a text-eligible Vercel binding. The current fal
bindings and Vercel Grok require a start frame. OpenRouter uses `frame_images` with
`first_frame`; the exact fal Wan binding uses `start_image_url`.

The exact fal `fal-ai/veo3.1/lite/image-to-video` binding (bundled as
`google/veo-3.1-lite`) also accepts `image: { data: Uint8Array, media_type }`.
Its JSON equivalent is `{ "image": { "data": "AQID", "media_type": "image/png" } }`.
Supply exactly one of `image` or `image_url`; `image_url` remains HTTPS-only.
The same exact route accepts optional boolean `generate_audio`; explicit `false`
requests silent video and is forwarded unchanged. Omission leaves the serving
route's default (`true`) in effect. Native callers and JSON use the same schema;
other bindings do not inherit this field. See the
[serving contract](https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video/api).
The SDK admits nonempty PNG, JPEG, or WebP bytes up to **8,000,000 bytes** and
copies them before awaiting credentials. Base64 JSON is bounded before decoding;
native bytes become a bounded data URL on the existing authenticated fal request.
The [fal API documents inline file inputs and an 8 MB image limit](https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video/api),
and the [model input form lists the admitted formats](https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video).
The SDK uses this conservative format subset and decimal byte ceiling; it does
not decode image pixels, resize frames, or promise upstream content acceptance.
Other video bindings remain HTTPS-only, including OpenRouter and Vercel.

`MediaOperations.inspect(...).input_schema.properties.image` is present only
when bytes are supported. Its nested `data` schema states the base64 and decoded
byte bounds, and `media_type.enum` lists accepted MIME types. Root `oneOf` states
the exclusive input choice. Hosts can inspect these facts before authorizing or
loading an image; filenames, paths, uploads, and storage remain host concerns.

For this exact fal Lite binding, numeric `duration` is limited to `4`, `6`, or `8`
and maps to `"4s"`, `"6s"`, or `"8s"`. Resolution stays in the SDK's `WxH` shape:
`1280x720` / `720x1280` map to `"720p"`, and `1920x1080` / `1080x1920` to
`"1080p"`, with the matching `16:9` / `9:16` aspect ratio. A conflicting explicit
aspect ratio fails; omitted options retain provider defaults. Unsupported
dimensions, durations, aspect ratios, and `fps` fail before the generation key
lookup. These route-specific constraints are part of the inspected schema and
the same native/JSON parser that owns serialization eligibility.

Other routes accept `aspect_ratio` as positive integer `W:H`, `resolution` as
positive integer `WxH` (not a catalogue price label such as `720p`), positive finite
`duration`/`fps`, and a safe-integer `seed`. The pinned Vercel adapter silently omits
zero upstream, so direct Vercel `seed: 0` is rejected as `invalid_input` before key
lookup or submission; the other adapters preserve zero. It requests **one video once**. There
is no arbitrary provider-options object, raw SDK model, or retry setting. Queue
status reads do not resubmit the job. Multiple returned videos remain supported
within a 16-item, 64 MiB decoded aggregate bound. Submission/poll JSON, GG/SSE
encoded envelopes, inline data, authenticated OpenRouter content, and result
download streams are bounded before retention or decoding. Vercel result URLs
must use its exact gateway origin or inline data; fal queue/result URLs stay on
its allowed hosts. OpenRouter's authenticated content endpoint is used instead of
provider-advertised unsigned URLs. Hosts still authorize DNS and redirect hops.

A generation has one five-minute deadline covering credential lookup, submission,
polling, and result reads. The deadline settles the caller even when an injected
async operation ignores cancellation; checks after awaits prevent an abandoned
lookup from later submitting a paid job. Readers and waits are released on
completion, cancellation, and limits. Synchronous host work cannot be preempted;
a monotonic deadline refuses its late continuation.

Resolution retains no key. Generation reads the selected BYOK key once and keeps
that private snapshot through the submitted job's polls/content. Key rotation or
removal never silently switches that job's account or provider. GG uses a live
scoped token for its single POST. Cancellation, timeout, or clearing custody cannot
undo an accepted job or its charge, and this operation does not retry or mint.

Only byte arrays and video media types are returned; warnings, URLs, job handles,
and provider metadata are discarded without logging. `VideoClient.Failure` has
the same code-only error shape as images. Codes are `invalid_input`,
`model_unavailable`, `provider_unavailable`, `input_unsupported`,
`gg_token_expired`, `insufficient_credits`, `aborted`, `timeout`,
`invalid_response`, `generation_failed`, and `unsupported_untrusted_result_origin`.
The host owns persistence, receipts, HTTP status mapping, and GG acquisition.

## Music operation

```ts
import { MusicClient } from "@grida/ai";

const music = new MusicClient({ http, gg, gg_base_url });
const operation = await music.resolve({
  model_id: "google/lyria-3",
  provider: "gg",
});
const result = await operation.generate({
  prompt: "Quiet ambient piano",
  seed: 0,
  signal,
});
// result.audio: { data: Uint8Array; media_type: "audio/mpeg" }
```

This operation serves exactly the bundled `google/lyria-3` and
`google/lyria-3-pro` models through GG. It requires an explicit host transport,
scoped-token source, and GG origin. It has no BYOK key capability, `auto` provider,
audio catalogue refresh, or direct Replicate path. Broader image-input metadata
on the upstream model cards does not make that input available through this
text-only hosted contract. Sound effects and speech remain separate operations.

`resolve` returns an immutable model/provider/binding selection without network
work. Generation trims the prompt and accepts 1–4096 **UTF-16 code units**, matching
the hosted parser, plus an optional safe-integer seed (including zero) and abort
signal. Extra input fields are rejected. The live scoped token is read for the
single fixed `POST /api/v1/ai/music/generations`; no retries, refresh, or provider
fallback occur. Video and music share one internal five-minute invocation
lifecycle, including monotonic deadline checks, bounded stream reads, cancellation,
and late-result cleanup. There is no public generic executor.

The response must match the selected model and GG provider and contain the
existing inline MP3 wire fields. Encoded response size and a 32 MiB decoded ceiling
are checked before decoding. Only a fresh byte array and `audio/mpeg` leave the
operation; filenames, URLs, warnings, metadata, and persistence receipts are
discarded without logging. No result URL is followed. The host derives its
filename and owns persistence. The hosted server owns provider execution, output
download/MP3 materialization, and metering. A supplied seed does not promise
deterministic output.

`MusicClient.Failure` has the same code-only error shape as the other operations:
`invalid_input`, `model_unavailable`, `gg_token_expired`, `insufficient_credits`,
`aborted`, `timeout`, `invalid_response`, or `generation_failed`. Clearing scoped
custody prevents a later submission; cancellation, timeout, or sign-out cannot
recall an accepted job or its charge.

## Sound-effect operation

```ts
import { SoundEffectClient } from "@grida/ai";

const sounds = new SoundEffectClient({ keys, http });
const operation = await sounds.resolve({
  model_id: "eleven_text_to_sound_v2",
  provider: "elevenlabs",
});
const result = await operation.generate({
  prompt: "A door creaking slowly",
  duration_seconds: 4,
  loop: false,
  prompt_influence: 0,
  signal,
});
// result.audio: { data: Uint8Array; media_type: "audio/mpeg" }
```

The key capability reads only `elevenlabs`, synchronously or asynchronously.
Resolution checks that key's presence and retains no credential; generation reads
the current key again. Missing or blank keys fail as `provider_key_required`.
Only the existing `eleven_text_to_sound_v2` binding is executable, including its
current **staged** catalogue status. That publication status is unchanged and is
not a new runtime eligibility requirement. There is no `auto`, GG, custom origin,
format selector, voice, or arbitrary provider-options input.

Generation trims its prompt and applies Grida's existing 450 **Unicode code point**
limit. This is a Grida operation policy, not an API Unicode-counting guarantee.
Optional duration uses the bundled binding's current 0.5–30 second range; prompt
influence is finite from 0–1 and loop is boolean. Omitted options stay omitted,
preserving provider defaults; explicit `false` and zero stay present. Null values
and unrequested fields are rejected before generation's key lookup.

One POST goes to the fixed ElevenLabs sound-generation endpoint with
`output_format=mp3_44100_128` and `xi-api-key`. There are no result URL downloads
or retries. The shared internal lifecycle bounds generation, including key lookup
and the response stream, to five minutes; resolution's separate key check is also
bounded. Late key lookup completion cannot submit after timeout/cancellation.
Success requires nonempty `audio/mpeg` bytes within 16 MiB and returns only a fresh
byte array and that media type. The host owns `sound-effect.mp3`, base64 wire
encoding, and persistence receipts.

`SoundEffectClient.Failure` codes are `invalid_input`, `model_unavailable`,
`provider_key_required`, `aborted`, `timeout`, `invalid_response`, and
`generation_failed`. Provider HTTP failures, including 401/403, stay generic safe
failures without upstream bodies or GG error remapping. Token/key presence does
not establish provider readiness or affordability. Cancellation cannot undo an
accepted paid request.

## Text-to-speech and voice discovery

```ts
import { TextToSpeechClient } from "@grida/ai";

const speech = new TextToSpeechClient({ keys, http });
const voices = await speech.listVoices({ provider: "elevenlabs", signal });
// voices: readonly { voice_id: string; name: string }[]
const operation = await speech.resolve({
  model_id: "eleven_v3",
  provider: "elevenlabs",
  voice_id: selectedVoiceId,
});
const result = await operation.generate({
  text: "[whispers] Hello there.",
  signal,
});
// result.audio: { data: Uint8Array; media_type: "audio/mpeg" }
```

Speech admits the existing staged `eleven_v3` model and an explicit voice; listing
voices is optional. The frozen descriptor includes the trimmed `voice_id`.
Voice IDs are limited to 256 Unicode code points, must be URI-encodable, and cannot
be the literal navigation segments `.` or `..`. An opaque ID is encoded as one
path segment under the fixed ElevenLabs speech endpoint.

Original text, whitespace, and audio tags are preserved. Blank text is rejected;
the bundled 5,000-character limit uses Grida's existing Unicode code point
counting, including whitespace. That counting policy does not claim a provider
Unicode specification. Generation accepts only text and signal: no voice settings,
seed, format selector, or application defaults. One POST with `eleven_v3` requests
`mp3_44100_128`; nonempty `audio/mpeg` output is limited to 16 MiB. The host owns
`speech.mp3`, base64 encoding, and persistence receipts.

Voice discovery reads `/v2/voices` at the fixed provider origin with `page_size=100`.
The first page may include more than 100 default voices. The invocation reads at
most ten pages, each bounded to 2 MiB, and retains at most 2,000 unique voices.
Only trimmed IDs/names of up to 256 code points are returned. The first duplicate
ID wins; ordering is deterministic by name, then ID. This is a bounded picker aid,
not a complete account inventory, and caps do not grant a raw pagination API.

The existing local cursor policy trims a nonblank token, bounds it to 1,024 code
points, and encodes it with `URLSearchParams`; it assumes no token alphabet and
never follows a returned URL. Missing, malformed, or repeated required cursors
fail the invocation, including on a capped page. Invalid JSON/pages and later-page
provider denial do not return a misleading partial success.

The narrow key capability reads only `elevenlabs`. Resolution's key check,
voice listing, and generation have separately bounded invocations. Each listing
keeps one private key snapshot through its pages; each new invocation reads the
current key. The shared five-minute lifecycle covers key lookup, requests, and
body reads. There are no retries, GG authority, custom origins, result downloads,
raw voice metadata, or credential outputs. Cancellation cannot undo accepted speech.

`TextToSpeechClient.Failure` codes are `invalid_input`, `model_unavailable`,
`provider_key_required`, `provider_access_denied`, `aborted`, `timeout`,
`invalid_response`, and `generation_failed`. Both listing and speech preserve
provider HTTP 401/403 as access-denied failures; other failures have safe code-only
messages without provider bodies. Presence of a key does not establish voice
access, account readiness, or affordability.

## Current 3D operations

```ts
import { ThreeDClient } from "@grida/ai";

const threeD = new ThreeDClient({ keys, http });
const text = await threeD.resolve({
  model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
  provider: "fal",
});
const result = await text.generate({ prompt: "A small brass robot", signal });
// result.glb: { data: Uint8Array; media_type: "model/gltf-binary" }

const image = await threeD.resolve({
  model_id: "fal-ai/trellis-2",
  provider: "fal",
});
await image.generate({
  image: { data: authorizedImageBytes, media_type: "image/png" },
  signal,
});
```

The public `Operations` type maps each exact endpoint to its own input and result.
Literal selection infers that endpoint's `generate` signature; dynamic selection
returns an operation union that narrows by `model_id`. A frozen descriptor contains
only model, binding and provider IDs plus that method. The currently executable,
staged bindings are Hunyuan v3.1 Pro text-to-3D, Hunyuan v3.1 Pro image-to-3D, and
TRELLIS.2. Catalogue publication is unchanged. There is no `auto`, GG, custom
endpoint, raw provider object or option passthrough.

Hunyuan text accepts only a trimmed nonblank prompt and signal, with the existing
1,024 Unicode code point limit. This is Grida's interpretation of the provider's
"UTF-8 characters" wording, not a claimed byte limit. Both current image operations
accept exactly one PNG, JPEG or WebP byte array and signal. The SDK copies its
nonempty, at-most-8-MiB contents before awaiting credentials. The host owns image
decoding and preparation; this local cap does not prove upstream dimensions,
decodability or account eligibility. Mixed prompt/image inputs and unrequested
fields are rejected, including an otherwise empty extra prompt.

The exact provider fields remain distinct: `prompt`, `input_image_url`, and
`image_url`, respectively. Broader Hunyuan catalogue capabilities such as eight
views, optional formats or paid options do not become executable here. Neither do
TRELLIS resolution or texture options. Each current operation guarantees only its
primary GLB; this is not a universal promise about future 3D operations. A future
SAM3D or Tripo operation must earn its own proven input/result shape. There are no
reserved fields or capability registry, and exhaustive internal dispatch forces a
new endpoint to choose its semantics rather than inherit an existing model's wire.

Resolution checks the live `fal` key under a separate five-minute bound and retains
no credential. Generation reads one private key snapshot for its single submission,
polls and result request. Its ten-minute deadline covers lookup, submission, polling
and download; the old adapter bounded only polling. Other media deadlines remain
unchanged. Grida does not resubmit a failed operation; this makes no claim about
fal's internal execution retries. Cancellation or timeout cannot recall accepted
remote work or its charge, and no remote cancellation endpoint is invoked.

Authenticated queue requests use the fixed HTTPS `queue.fal.run` origin. Public
GLB downloads use the credential-free lane and the existing fal.run/fal.media
host families; URL credentials, nondefault ports and fragments are refused.
The host still authorizes DNS, routes and redirect hops. Each queue/result JSON
body is bounded to 1 MiB. An error-bearing `COMPLETED` status fails the operation.
Only the primary GLB is downloaded, bounded to 64 MiB; its magic, version 2 and
declared total length are checked. This is header validation, not a complete glTF
parser. Provider filenames, MIME claims, optional assets, URLs and metadata are
discarded. Hosts own `model.glb`, base64 wire encoding, persistence and concurrency.

`ThreeDClient.Failure` codes are `invalid_input`, `model_unavailable`,
`provider_key_required`, `aborted`, `timeout`, `invalid_response` and
`generation_failed`. Errors contain only safe codes and messages, with no provider
bodies, credentials or arbitrary causes. Key presence is not proof of readiness.

## Authority and construction foundations

<!-- GRIDA-SEC-004 / GRIDA-SEC-006: explicit host transport and scoped memory custody. -->
<!-- GRIDA-GG: token — no account credentials or persistence in this package. -->

`ProviderHttp` separates credential-bearing provider requests from credential-free
result downloads. The host must authorize the concrete URL, method, headers,
resolved address, and every redirect hop. Built-in URL checks and byte bounds
cannot establish DNS or host routing policy. Downloads never receive provider
credentials; data URLs are decoded locally. Automatic downloads are limited to
16 assets and 64 MiB in aggregate; a separately requested single asset has a
256 MiB ceiling that its owning adapter can lower.

Media operation clients require an explicit `ProviderHttp`. The lower-level constructor's
legacy omitted-transport behavior permits ambient provider requests but refuses
remote downloads; supplying both host operations is the intended independent-host
integration. Private methods and fields use runtime private slots: the client
and resolved operation expose no credential getter or SDK model.

`ModelCatalogStore()` uses the bundled Grida catalogue by default. Image and video
clients accept an optional store and use that bundled view when omitted.
`ModelCatalogStore({ base_url, fetch })` uses the existing
`/api/v1/models/catalog` schema-1 refresh path; every option remains optional.
`ModelCatalogStore` keeps the bundled catalogue or a validated published snapshot
in memory. Construction has no network or timer work. A supplied snapshot pins
it; the host explicitly calls `start`/`dispose` for background refresh. A missing
model may cause `resolve` to request its bounded, rate-limited refresh. Failed
refresh keeps the last good catalogue. Optional direct catalogue fetch is a
separate public-data capability.

`GridaGatewaySessionStore` is memory-only scoped-token custody. Its host supplies
`{access_token, expires_at, organization?}`, where expiry is epoch milliseconds,
and calls `clear` when appropriate. `status` projects only active/expiry/org
metadata; input and returned organization objects do not alias custody. Tokens
expiring within 30 seconds are unavailable. `GgTokenSource` is the narrower
trusted `getAccessToken` capability: custom implementations must return only a
live scoped GG credential. Neither form authenticates an account, mints, refreshes,
persists, or verifies the token's signature. Account credentials must never enter
it. GG is rechecked at resolution and each submission. Clearing custody blocks
later submissions, but cannot recall a token already sent or cancel accepted
work; server expiry and entitlement policy remain authoritative.

GG text/image/video/music share one URL admission policy: HTTPS is required,
except HTTP to exact URL-parsed loopback hosts `localhost`, `127.0.0.1`, or `[::1]`
for local development. URL userinfo, query strings and fragments are rejected.
Clients normalize the configured base to its origin; the shared provider helpers
apply the same policy before reading a scoped token or making a request. This
prevents a custom host from accidentally configuring cleartext remote GG traffic.
It does not authorize that origin or prove its resolved address: the host still
owns destination grants, DNS/routing and redirect enforcement. The CLI's fixed
registration and Desktop's approved editor origin remain narrower host policies.

## Shared provider implementation entry

### First-party provider credential admission

`ProviderCredentials` owns reusable, application-independent BYOK input policy.
It is experimental, like this package, and keeps no credential store or history.

```ts
import { ProviderHttp } from "@grida/ai";
import { ProviderCredentials } from "@grida/ai/providers";

const key = ProviderCredentials.normalize("openrouter", enteredKey);
// key is still a secret: only the host's authorized custody should receive it.
const credentials = new ProviderCredentials({
  http: new ProviderHttp({
    request: authorizedRequest,
    download: authorizedDownload,
  }),
});
const result = await credentials.check({ provider: "openrouter", key, signal });
// result: { status: "accepted" } or { status: "not_supported" }
```

Construction and `normalize` are synchronous and perform no I/O. Normalization
bounds the original UTF-8 input to 4 KiB, trims outer whitespace, requires a
nonempty ASCII token (0x21–0x7e), and rejects case-insensitive
`PASTE_*_KEY_HERE` templates. Those framing limits are Grida policy. The returned
string is explicitly the normalized secret; it is not safe display metadata.

The following provider rules and read-only checks were reviewed against official
documentation on 2026-09-08. No suffix lengths or alphabets are inferred from
example keys.

| Provider          | Static admission                                                                                                                                                                                                                        | Explicit check and acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenRouter        | Documented `sk-or-` prefix with a nonempty suffix.                                                                                                                                                                                      | `GET https://openrouter.ai/api/v1/key`, Bearer authorization; HTTP 200 and boolean `data.is_management_key: false`. Management keys are rejected. [Key prefix](https://openrouter.ai/blog/tutorials/any-coding-agent/), [current-key API](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [required SDK field](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/operations/getcurrentkey.ts).                                 |
| Vercel AI Gateway | Current `vck_` keys require a nonempty suffix. Opaque legacy keys remain admissible: the new-format announcement does not retire them or specify a legacy grammar. Static acceptance cannot establish provider identity for those keys. | `GET https://ai-gateway.vercel.sh/v1/credits`, Bearer authorization; HTTP 200 and finite decimal numeric strings `balance` and `total_used`. Zero or negative balance does not deny authentication. [New formats](https://vercel.com/changelog/new-token-formats-and-secret-scanning), [key documentation](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys), [REST API](https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api#check-credit-balance).   |
| fal               | Full `key_id:key_secret` with exactly one separator and two nonempty components.                                                                                                                                                        | `GET https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev`, `Key` authorization; HTTP 200 and a `prices` entry for that endpoint with finite numeric `unit_price` and nonblank string `unit`/`currency`. Ordinary API scope suffices. [Key contract](https://fal.ai/docs/platform-apis/v1/keys/create), [pricing API](https://fal.ai/docs/platform-apis/v1/models/pricing), [scope documentation](https://fal.ai/docs/api-reference/platform-apis/authentication). |
| ElevenLabs        | Opaque token; no inferred prefix.                                                                                                                                                                                                       | `not_supported`, with no request. `/v1/user` requires extra User Read permission, while `/v1/models` allows unauthenticated access. Neither proves acceptance without imposing an unrelated permission. [Authentication](https://elevenlabs.io/docs/api-reference/authentication), [official setup skill](https://github.com/elevenlabs/skills/blob/main/setup-api-key/SKILL.md), [models API](https://elevenlabs.io/docs/api-reference/models/list).                          |

`check` reuses normalization and makes at most one request. It requires an explicit
host `ProviderHttp`, sends only the fixed GET and provider authorization header,
omits cookies, refuses redirects, disables caching, and uses a ten-second deadline
covering transport and body reads. JSON is limited to 64 KiB and must decode as
valid UTF-8. A late response is cancelled; cancellation is never awaited at the
expense of completion. Repeated ready stream chunks yield to deadline timers.
There is no ambient fetch in this owner, retry, generation, pagination, automatic
refresh, or preflight added to existing generation/listing operations.

Only frozen status metadata is returned. Provider account, key, balance, pricing,
and response metadata are discarded. An accepted read is transient evidence for
that read, not future model access, credit availability, or generation readiness.
The checks submit no inference; the cited references do not establish a separate
universal billing guarantee for metadata reads. Hosts choose whether and when to
check and own persistence; this package never records verification state.

`ProviderCredentials.Failure` has code-only messages: `invalid_input`,
`credential_rejected` (401 or an OpenRouter management key), `access_denied`
(403, which may be scope or account policy), `unavailable` (other HTTP/transport
failures), `invalid_response`, `aborted`, or `timeout`. Raw upstream errors and
caller-supplied abort reasons never become messages or causes.

These rules identify first-party provider connections. A future custom `base_url`
must bind its own validation and check to that connection; an OpenAI-compatible
wire protocol cannot grant first-party prefixes or endpoints. There is no custom
endpoint or configurable probe API. The host still authorizes DNS, resolved
addresses, routes and transport behavior; a fetch-shaped capability cannot make
those decisions on the host's behalf.

### Trusted implementation helpers

`@grida/ai/providers` supplies trusted provider implementations with
the promoted catalogue gates, provider identity/precedence, scoped GG request and
error helpers, and fal queue/URL/error-prefix helpers. These are trusted provider
building blocks, not the safe media operation facades. `safeText` bounds text; it
does **not** redact it. Direct helper failures can carry upstream details and must
be handled by the calling operation's safe error boundary. `postHosted` does not
authorize its caller-provided URL: the provider implementation and host transport
own that decision. Raw image/video SDK adapters are internal and are not package exports.

## Runtime and verification

Grida source and public declarations use ECMAScript/Web APIs without Node globals,
filesystem imports, or application/agent/daemon dependencies. The normal typecheck
also compiles tests; the neutral typecheck compiles both public entries without
ambient Node types. This is source neutrality, not blanket runtime certification.

The declared AI SDK dependency closure uses its normal runtime conditions. In
Node, `ai`/`@ai-sdk/gateway` import an upstream OIDC branch with dormant filesystem
helpers. Explicit provider keys bypass credential discovery; this package does
not promise that third-party modules have no Node built-in imports. Node 24 is the
verified runtime. No browser-condition alias or vendor fork hides that closure.
Production dependencies remain external and must accompany the built package.
This starts as a private workspace package; a standalone npm release is deferred.
Built exports work unbundled when their declared dependencies are supplied. A
distributed host must package that private dependency closure; a public CLI cannot
ship an unresolved `workspace:*` dependency and expect npm to supply it.

Producer tests exercise synthetic authorized transports, each supported media route,
reference/option preservation, selected-provider stability, safe failures,
no retry of failed submissions, bounded invocation/results, and scoped-token expiry. Promoted helper tests
cover catalogue refresh and bounded downloads. No test calls a real provider,
opens a real credential store, or starts a Grida host. Packaging and host consumers
must use public exports; source aliases are not a substitute for that proof.
