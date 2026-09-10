---
title: AI tools — Desktop capability export and proposed extensions
description: Immediate model discovery and media generation from Desktop's existing capabilities, with planned provider-native execution beyond Grida's catalogue.
keywords: [grida, cli, models, media, generation, byok, gg, json-schema]
sidebar_label: AI tools
sidebar_position: 3
tags: [internal, wg, cli, architecture]
format: md
---

# AI tools

> **Command contract for the CLI preview.** Broader provider-native execution
> and detached jobs remain proposals below.

**Discover by modality. Invoke one exact operation through a provider.**
`models`, `providers`, `voices` and `generate` are root commands. Desktop does
not need to run, and no Grida agent or Canvas is involved.

## Immediate: list, inspect, generate

```sh
grida models list --modality image
grida models list --modality audio
grida models list --modality video --local-image
grida models inspect --provider gg --model openai/gpt-image-2 --json

grida generate --provider gg --model openai/gpt-image-2 \
  --org studio --prompt "A blue ceramic teapot" --out ./images
```

`--out` names a **new directory** under an existing parent. Inspect before
choosing inputs; a catalogue card does not promise an executable operation.

| Kind             | Current boundary                                                         |
| ---------------- | ------------------------------------------------------------------------ |
| `image`          | Existing GG/BYOK bindings; reference inputs require a supported variant. |
| `video`          | Existing GG/BYOK bindings; GG is text-to-video.                          |
| `music`          | GG Lyria operations.                                                     |
| `sound-effect`   | ElevenLabs sound effects.                                                |
| `text-to-speech` | ElevenLabs speech with an explicit voice.                                |
| `three-d`        | Exact fal text/image contracts returning a primary GLB.                  |

`models list` presents bundled executable operations. `--modality` accepts
`image`, `video`, `audio` or `3d`; `--kind` distinguishes the audio operations.
Staged models remain marked `staged`. Listing and inspection use no credentials,
network, account storage or provider probes.

Listing shows each operation's accepted local-image flags; JSON rows include
`local_image_flags` (`--reference`, `--image`, or an empty list). `--local-image`
filters to operations accepting a local image in either form and combines with
the other filters. This is derived from the selected input schema, not provider
or model names; it establishes supported input, not provider access.

Choose `--provider` and the returned **`model_id`**. For curated image/video,
this is the canonical Grida model ID; `binding_id` reports its provider route.
They are not interchangeable. The staged 3D contracts use exact endpoint IDs.
No command substitutes a provider, model or billing route after failure.

## Immediate: inspect the input contract

An operation is identified by provider, model, kind and input variant. The kind
is inferred when unambiguous. Image/video default to `text`; JSON requests
select another advertised variant explicitly. Media flags select their compatible
variant automatically and reject a conflicting explicit `--variant`:

```sh
grida models inspect --provider fal --model google/veo-3.1 \
  --variant image --json
grida generate --provider fal --model google/veo-3.1 \
  --variant image --input @video.json --out ./video
```

Human inspection shows accepted fields, required inputs, declared limits and an
example command. `--json` returns the effective input schema, model/provider
binding, status, variant and native output description. Validation and schema publication
share the execution owner's definitions. Unknown arguments fail before submission.
Local-file guidance appears only where the inspected operation accepts it.
The schema uses JSON Schema 2020-12, with `x-grida` annotations for normalization
and constraints such as UTF-16 length that ordinary schema keywords cannot express.
The operation parser is authoritative; a generic JSON Schema check is not a
substitute for it. No provider revision or remote job lifecycle is invented.

`--input @request.json` reads one UTF-8 JSON object from an explicit file;
`--input -` reads stdin. The envelope is bounded to 16 MiB. Model arguments stay
in that object. Provider keys, organization selection and output paths stay
outside it. Inspect the selected variant for accepted HTTPS or inline inputs;
local paths inside JSON are not automatically read or uploaded.

For 3D image input, `image.data` is a base64 string and `image.media_type` is an
accepted image MIME type. It becomes bytes for the native operation. Each 3D
endpoint retains its own schema; new capabilities do not inherit a universal
3D signature. Native outputs are described as bytes and media types; the CLI's
result is a local file receipt, not JSON pretending to contain native bytes.

## Immediate: text and local media inputs

Simple requests need no JSON file:

```sh
grida generate --provider openrouter --model openai/gpt-image-2 \
  --prompt "Restyle the header while preserving the supplied mark" \
  --reference ./header.png --reference ./mark.png \
  --param quality=high --out ./header

grida generate --provider fal --model fal-ai/trellis-2 \
  --image ./object.png --out ./object-3d

grida generate --provider fal --model google/veo-3.1-lite \
  --prompt "A gentle camera move" --image ./scene.png \
  --param duration=4 --param resolution=1280x720 \
  --param generate_audio=false --out ./clip

grida generate --provider elevenlabs --model eleven_v3 \
  --text-file ./narration.txt --voice YOUR_VOICE_ID --out ./speech
```

`--prompt` supplies generation instructions; `--text` supplies speech text.
Their `--prompt-file` and `--text-file` alternatives read UTF-8 without trimming;
`-` explicitly reads stdin. Paths are relative to the current working directory.
Literal text is never interpreted as a filename, even if it starts with `@`.

`--reference` accepts an image file or HTTPS URL and can repeat; order is preserved.
`--image` selects a single video or 3D image input. The selected operation must
support the supplied representation. Inspect the selected reference variant or
filter with `--local-image` to discover local image support. Local video frames
currently work on fal's Veo 3.1 Lite binding; other video bindings retain their
HTTPS-only input. The existing
image-to-3D contracts accept local files. Unsupported modes fail locally without
changing model/provider or dropping an image.

The fal Veo 3.1 Lite operation exposes the boolean `generate_audio` option.
`--param generate_audio=false` requests silent video; omission keeps the serving
route's audio-enabled default. Other operations reject this field unless their
own schema advertises it. Audio controls are model inputs, not another command.

Local images must be PNG, JPEG or static WebP, at most 8 MiB each; individual
operations can impose lower limits. The CLI identifies the format from structural
headers, not the filename; it does not fully decode pixels. Aggregate image reads
are bounded to 16 MiB, and assembled input is bounded to 16 MiB **including base64
expansion**. Text files and JSON input are also bounded to 16 MiB. File reads have
a 30-second limit and snapshot a regular file once. No image is resized or transcoded.

The CLI sends selected files inline to the selected provider. It neither creates
Grida storage objects nor downloads arbitrary input URLs. HTTPS inputs pass to
the provider where supported. File selection and all local validation finish
before credentials are opened or generation is submitted.

`--param FIELD=VALUE` supplies an advertised top-level scalar field, for example
`--param seed=0` or `--param loop=false`. Its schema determines whether the value
is a string, number or boolean; a numeric-looking string stays a string. It does
not admit undeclared provider options. Complex values use `--input @file|-`.
JSON mode cannot mix with request-building flags. Duplicate fields and competing
stdin readers fail; nothing silently overrides another input. Both modes use the
same normative operation parser.

## Immediate: supply access explicitly

BYOK needs no Grida login. Configure a shared key with
`grida providers configure fal`, or supply an invocation-only environment key
or `--key-stdin`. Desktop and CLI share `providers/credentials.toml` under Grida
home; the [custody contract](./credential-custody.md#provider-credentials) owns
configuration, removal, platform support and migration. GG requires a separate
native CLI login and organization.

| Provider     | Explicit environment slot |
| ------------ | ------------------------- |
| `openrouter` | `OPENROUTER_API_KEY`      |
| `vercel`     | `AI_GATEWAY_API_KEY`      |
| `fal`        | `FAL_KEY`                 |
| `elevenlabs` | `ELEVENLABS_API_KEY`      |

`providers list` reports key presence and source after cheap static validation,
never contents. It does not verify provider access. Precedence is stdin, environment,
then the shared file. An explicit key bypasses file access and never persists;
a blank or malformed override fails.
`--key-stdin` cannot share stdin with `--input -`, `--prompt-file -` or
`--text-file -`. Keys are never literal command
arguments. `providers remove <provider>` removes the shared stored key for both
clients; environment overrides remain effective. Grida logout leaves provider
keys intact. `configure` performs the custody contract's supported registration
check once before saving; ordinary reads and generation never add a key-check
request. Provider formats and probes have one owner in the shared AI layer.

Speech needs a provider voice in addition to its model:

```sh
grida voices list --provider elevenlabs --json
grida models inspect --provider elevenlabs --model eleven_v3 --json
grida generate --provider elevenlabs --model eleven_v3 \
  --input @speech.json --out ./speech
```

`speech.json` includes `voice_id` and `text`. Voice listing is an authenticated,
bounded provider read. It does not start a generation.

## Immediate: distinguish configured access from readiness

Unfiltered discovery reports `access.checked: false`. An explicit availability
filter requires a provider:

```sh
grida models list --provider fal --available
grida models list --provider gg --org studio --available
```

For BYOK, `--available` includes routes with a configured key. For GG, it reads
the selected organization's cached credit eligibility and includes routes when
the existing gate allows them. Results report the basis and keep provider access
`unverified`. Missing keys or a blocked gate produce an empty filtered list;
failed account reads remain errors rather than a claim of no access.

These are configuration and cached eligibility filters. They do not establish
model entitlement, provider capacity or generation success. Listing neither
mints a GG grant nor spends a generation to probe access. Grida credits have no
bearing on BYOK. Full provider readiness checks are outside this preview.

## Immediate: save results locally

Generation validates the operation and JSON, then reserves the new output
directory and checks its file-publication mechanism before opening credentials
or submitting work. Existing directories are refused. Results use the same
persistence behavior in terminal and JSON modes.

The directory contains media artifacts and `receipt.json`. The receipt records
local paths, byte sizes, SHA-256 hashes, model/provider/binding, kind, variant,
and a local result ID/time. It contains no prompt, credential, remote result URL
or raw provider response. The ID is a local receipt identity, not a resumable
provider job ID. Provider filenames never choose local paths.

Writes do not overwrite existing files. If saving fails after generation,
`save_failed` identifies the directory and files already published. Keep those
files and inspect them before retrying. Disk space or a later filesystem failure
can still prevent saving despite preflight.

The CLI waits for bounded completion; it never automatically retries a possibly
accepted paid submission. An image count can require several provider batches,
so one command is not necessarily one provider request. Image count is bounded
to 16. Interrupting or timing out a request does not prove upstream cancellation
or prevent a charge. Once complete result bytes arrive, saving is allowed to
finish even after an interrupt.

## Shared foundations

The [CLI doctrine](./index.md) assigns the branded command only composition,
process interaction and local files. The shared AI owner supplies descriptors,
input parsing and execution for both Desktop and CLI. Account custody and
scoped GG access retain their separate authorities. No agent runtime, server
framework or Desktop process is needed to execute these operations.

## Planned: provider-native endpoints

After exporting existing Desktop operations, extend the same command to an
explicit provider-native path:

```sh
grida models inspect --provider fal --model your-team/custom-app --json
grida generate --provider fal --model your-team/custom-app \
  --input @request.json --out ./result
```

Adding native execution must preserve the input contract of every already
exported operation; catalogue changes cannot silently reinterpret a request.

Here `--model` is an exact provider endpoint, including any operation subpath.
Grida catalogue membership is not a whitelist for provider-native BYOK.
The provider adapter owns authentication, endpoint addressing, submission,
status, and results; the endpoint owner owns its inputs and outputs.
The first native fal adapter targets JSON queue operations. Other provider
protocols, such as streaming or administrative APIs, need their own support;
the key alone does not make them operations of `generate`.

fal explicitly supports calling custom deployed apps through the same client
and queue interface as marketplace models. It also documents direct OpenAPI
retrieval for custom endpoints. Public model discovery need not enumerate
every private deployment. See [calling endpoints](https://fal.ai/docs/documentation/development/calling-your-endpoints),
[queue operations](https://fal.ai/docs/documentation/model-apis/inference/queue),
and [endpoint schema discovery](https://fal.ai/docs/documentation/development/document-your-model).

Native execution follows these rules:

- Use the configured provider key and exact endpoint. Provider access rules
  still apply; possessing a key does not grant access to every deployment.
- Preserve provider-native JSON. Do not coerce it into Grida's curated media
  argument shape or silently drop unfamiliar fields.
- Inspect the provider schema when available. If it is unavailable or omits a
  valid provider field, explicit `--raw` submits JSON with provider validation;
  report that local schema validation was skipped. This changes validation,
  never authentication or transport authority.
- Accept endpoint IDs within a supported provider adapter, not arbitrary URLs
  to which the CLI forwards credentials.
- Preserve raw response JSON. Do not invent Grida price estimates, normalized
  media fields, or resumability for an unknown response contract. Unknown
  output shapes need explicit file selection rather than guessed artifact URLs.

fal permits hidden API fields and has private/shared/public deployment access
and billing modes; native execution therefore follows the endpoint's provider
billing rules. It never spends Grida credits. See [input definitions](https://fal.ai/docs/documentation/development/handle-inputs-and-outputs)
and [deployment modes](https://fal.ai/docs/documentation/deployment/deploy-to-production).

**GG remains curated.** An unknown GG model fails. Native provider execution is
selected by the user, not triggered automatically by a GG failure. A failed
native request never retries through GG.

## Planned: detached jobs and lifecycle commands

Job IDs remain useful after a command exits. Expose later status/result/cancel
commands only where the adapter supports them. Timing out or stopping a local
wait does not prove upstream cancellation; never automatically resubmit a
possibly accepted paid request. Current GG routes need additional lifecycle
support before detached execution can be promised. None of this requires
Grida Desktop or a local agent loop.

## Choices to ratify

- Define explicit selection of the native contract when an endpoint also has
  an exported Grida contract. Validation failure must never switch contracts.
- For the planned provider-native extension, allow explicit raw JSON when
  schema-based validation is unavailable or insufficient.

## What the other CLIs establish

| Surface    | Observed design                                                                                                                                                                | Useful distinction                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Higgsfield | `model list` and `model get` discover model parameters; `generate create <job_set_type>` submits image, video, and audio work. Get/wait/list operate on jobs.                  | Generation uses a common command, while model and workflow schemas describe different operations. [CLI reference](https://github.com/higgsfield-ai/cli), [generation skill](https://github.com/higgsfield-ai/skills/blob/main/higgsfield-generate/SKILL.md).                            |
| Replicate  | `model schema OWNER/MODEL[:VERSION] --json` exposes the version's OpenAPI schema, including inputs and outputs. Generic `run` creates a prediction with model-specific inputs. | The executable unit has a schema and version; modality does not determine its arguments. [Schema command](https://github.com/replicate/cli/blob/main/internal/cmd/model/schema.go), [run implementation](https://github.com/replicate/cli/blob/main/internal/cmd/prediction/create.go). |

Higgsfield documents automatic uploads for local media paths, with permitted
roles and counts determined by the selected model. Its schema representation
is structured, but the reviewed documentation does not establish a particular
JSON Schema dialect. Its public repository exposes documentation and binary
releases rather than the CLI's generation implementation. See its
[media input reference](https://github.com/higgsfield-ai/skills/blob/main/higgsfield-generate/references/media-inputs.md).

Replicate's inspected CLI source accepts `key=value` inputs and `@file`
uploads. Its HTTP API has capabilities, including cancellation, that are not
registered CLI commands. Its save handling also differs between interactive
and JSON/non-TTY execution. Grida should define the same persistence behavior
for both. See the [input parser](https://github.com/replicate/cli/blob/main/internal/util/optparse.go)
and [prediction implementation](https://github.com/replicate/cli/blob/main/internal/cmd/prediction/create.go).

Neither comparison establishes Grida's GG/BYOK availability contract. That
requires an explicit serving route and account context.
