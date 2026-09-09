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

> **Status: accepted direction; command specification for follow-up delivery.**
> Account infrastructure and scoped GG access precede the media commands below.
> Source study: September 6, 2026. Exporting Desktop's existing AI capabilities
> is in the [v1 scope](./v1.md); broader provider-native execution is planned.

**Discover by modality. Invoke an exact operation through a provider.** Start
with one `generate` command and discoverable input/output schemas. A provider
key should eventually also let you address endpoints outside Grida's curated
catalogue through a supported provider adapter.

## Immediate: export Desktop's existing AI tools

Expose model discovery, GG/BYOK access, and existing image, video, audio, and 3D
operations through `grida models`, `grida providers`, and `grida generate`.
These are root commands; there is no `ai` family. Their implementations have
independent owners shared with Desktop. No agent loop, Canvas integration,
or running Desktop process is required.

Start with the effective contracts already available to Desktop. Existing
music, speech, and sound effects remain distinct operations. The CLI needs
independent account access, provider credential configuration, schemas, and
local file handling to make these capabilities usable from a terminal. Speech
also needs voice discovery; model schemas alone cannot supply your provider's
current voices.

| Existing Desktop capability   | Immediate export boundary                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| GG image, video, and music    | Preserve each operation's effective hosted inputs and credit requirements.             |
| BYOK image and video          | Export currently implemented provider/model bindings and their input limits.           |
| BYOK speech and sound effects | Preserve the separate ElevenLabs contracts, including voice discovery.                 |
| BYOK 3D                       | Export the existing fal bindings, supported text/image inputs, and primary GLB output. |

These families come from Desktop's [media tool registry](https://github.com/gridaco/grida/blob/main/editor/scaffolds/desktop/tools/media-tool-registry.ts).

The immediate export does not imply support for every catalogue entry or every
endpoint a provider key can access. Unlisted endpoints and detached job
management are the planned extensions described below.

## Start from what Grida can actually execute

The [model catalogue](https://github.com/gridaco/grida/blob/main/packages/grida-ai-models/README.md)
is descriptive data; it does not decide access. Audio already has separate
music, speech, and sound-effect contracts. A single audio input schema would
hide meaningful differences.

Current execution also differs from broad catalogue capabilities:

- GG images accept text prompts, while reference-image support exists in
  deeper BYOK adapters and is absent from the direct image HTTP request.
- GG video execution rejects start images even though its HTTP parser accepts
  the field. The effective operation is text-to-video.
- The public catalogue snapshot distributes text/image/video; it does not yet
  distribute the bundled audio families. GG music execution nevertheless exists.
- Direct media routes wait for final bytes. They do not expose a general,
  durable Grida run/status/cancel service.
- Current image/video resolvers reject unknown catalogue IDs. Their internal
  fal adapters also impose media-specific inputs and outputs; removing the
  catalogue check would not produce a generic endpoint runner.

These are implementation observations, grounded in the
[image protocol](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/protocol/images.ts),
[hosted execution](https://github.com/gridaco/grida/blob/main/editor/lib/ai/server.ts),
[snapshot definition](https://github.com/gridaco/grida/blob/main/packages/grida-ai-models/src/models.ts),
[music protocol](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/protocol/music.ts),
and [image adapter](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/src/providers/image-byok.ts).
Presence in a catalogue or request parser is insufficient evidence of support.

## Immediate: list, inspect, generate

Proposed discovery:

```sh
grida models list --modality image
grida models list --provider gg --org studio --available
grida models inspect --provider gg --model openai/gpt-image-2 --json
```

`list` presents Grida's curated catalogue and its execution routes. Modality
filters describe outputs; each result also identifies input modalities and
operations. `inspect` reports the callable contract and its input/output
schemas where available. Missing or inaccessible schemas and unknown operation
metadata remain explicit. Addressing an endpoint without a catalogue entry is
part of the planned provider-native extension.

The same submission shape handles image, music, and video. These illustrative
JSON files contain arguments for the inspected operation:

```sh
grida generate --provider gg --model openai/gpt-image-2 \
  --org studio --input @image.json --out ./images

grida generate --provider gg --model google/lyria-3 \
  --org studio --input @music.json --out ./music

grida generate --provider fal --model fal-ai/veo3.1/image-to-video \
  --input @video.json --out ./video
```

`--provider` is required initially. IDs are scoped to it: GG uses Grida's
supported model IDs; fal uses exact fal endpoint IDs. No command silently
changes provider, substitutes a model, or moves between provider billing and
Grida credits. Catalogue cards can associate equivalent models across routes
without pretending their IDs or inputs are interchangeable.

## Immediate: inspect the callable contract

The identity is **provider + model/endpoint + operation**, with a contract
revision when the owner supplies one. Never invent a revision for an
unversioned provider alias.
An endpoint may encode the operation in its path. If a model has several
operations, require `--operation` unless its descriptor names a single one.

The descriptor carries known values, with explicit unknowns for native
endpoints that do not publish them:

- Input and output schemas, their dialect/version, and any provider revision.
- Required fields, defaults, enums, ranges, and accepted file representations.
- The actual operation: text-to-image, image-to-video, speech, music, and so on.
- Lifecycle support: submit, status, result, and cancellation where available.

GG and curated BYOK schemas describe what the selected executor accepts,
including its narrower constraints. The planned native provider path describes
that endpoint's own payload.
For Grida-owned contracts, validation and schema publication share an owner;
the CLI must not maintain a second hand-written model schema.

`--input @request.json` reads a JSON object; `--input -` reads stdin. Model
arguments stay inside that object. Credentials, organization selection, output
paths, and waiting policy are invocation options outside it.

Modality-specific convenience commands can later translate into this contract.
We do not need separate image/video/audio implementations or a giant union of
all their flags. Speech, music, sound effects, and video-with-audio remain
distinct operations even when their outputs overlap.

## Immediate: report availability

Availability belongs to the selected **operation and route**, evaluated
against this installation and the relevant account. Report the underlying
facts as well as a summary:

| Fact        | What can be claimed                                                           |
| ----------- | ----------------------------------------------------------------------------- |
| Support     | The installed executor can address this operation and contract revision.      |
| Credentials | Missing, configured, verified, or rejected. A stored key is only configured.  |
| Eligibility | GG organization entitlement, or provider access information where observable. |
| Observation | When the check ran, whether it used cached data, and what remains unknown.    |

Use summary states such as `ready`, `configured`, `blocked`, `unsupported`, and
`unknown`. `--available` includes only `ready`: observable required checks have
passed. Configured-but-unverified routes remain visible in the unfiltered list.
Inspection explains missing keys, login, credit, permission, unsupported
operations, or unavailable checks. Readiness is not a guarantee of capacity or
successful generation, and no paid generation is used as an availability probe.

GG checks use the selected organization's session and credit eligibility.
BYOK calls require only that provider's credential and access rules, without
Grida login. Shared TOML custody is accepted for the subsequent CLI/media
delivery; see the [custody design](./credential-custody.md#planned-provider-custody).
Grida credit balance is irrelevant to BYOK calls. Offline catalogue inspection
still works from cached data; current access may be unknown.

## Immediate: save results locally

The CLI reads local inputs and explicitly uploads files selected for a remote
operation. Provider adapters handle file transport; a schema alone does not
make a local path usable by a remote API.

`generate` initially waits and saves results under `--out`, with the same
behavior in a terminal and with `--json`. Keep a receipt identifying provider,
endpoint, operation, and any known contract revision or provider request ID.
Save result metadata and media files; retain raw provider JSON when available.
Report generation success separately from a failed download or local write.

## Immediate: shared execution foundations

Keep ownership under the [CLI doctrine](./index.md): catalogue data, provider
execution, and the branded command are separate concerns. Existing media
adapters currently housed in the agent package need an independent owner before
the CLI can reuse them without importing the agent runtime. Both Desktop and
CLI must consume the same domain validation and execution contracts.

Scoped GG access belongs to the account infrastructure. Media delivery adds
discovery and effective schemas, shared provider credential configuration,
then complete generation with artifact saving. A GG image call and an existing
BYOK call are the first proofs of the two access paths. Extend the same contract across existing audio/video/3D
operations as their adapters become independently usable. This is immediate
CLI work; integrating the Grida agent and rendering remain deferred.

The planned native endpoint mode needs a generic provider executor; extraction
of the existing modality adapters alone is insufficient.

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
