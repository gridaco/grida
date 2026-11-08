---
title: Grida CLI models and voices
description: Discover executable models, check BYOK or GG availability, inspect input schemas, and list speech voices.
keywords: [grida, cli, models, schemas, local images, voices]
sidebar_label: Models
sidebar_position: 5
tags: [cli]
format: md
---

# Grida CLI models and voices

Find a supported operation before preparing its input. GG listing and inspection
read the current public Gateway catalogue and operation schemas without
credentials. Explicit BYOK listing and inspection use the installed adapter
inventory and work offline. An unfiltered list combines both, so it needs a
connection; select a BYOK provider to browse offline.

A model is shown only when this CLI supports its interface and transport.
New GG models using an existing supported interface do not need a CLI update.
A new protocol or result format can require one.

## Find models

```sh
grida ai models list --modality image
grida ai models list --provider fal --modality video --local-image
```

Rows identify provider, model, input variant, status, and accepted local-image
flags. `--local-image` selects operations accepting a local `--reference` or
`--image` file. It does not mean every model from that provider accepts files.
Use `--json` for structured rows and `--kind` for operations such as `music`,
`sound-effect`, `text-to-speech`, or `three-d`.

## Check your access route

```sh
grida ai models list --provider fal --available
grida ai models list --provider openrouter --modality image --available --json
```

`--available` requires a provider. For BYOK it checks effective key presence
after static validation, without contacting the provider. For GG it checks
cached organization eligibility online using your Grida session. Neither
guarantees provider permission, provider credit, or a successful request.
A missing provider key does not prevent offline discovery or use of another
configured provider.

## Inspect accepted inputs

```sh
grida ai models inspect --provider openrouter --model openai/gpt-image-2 --variant references
grida ai models inspect --provider fal --model google/veo-3.1-lite --variant image
grida ai models inspect --provider fal --model google/veo-3.1-lite --variant image --json
```

Human output shows types, required fields, limits, and an example. `--json`
returns the full schema. GG JSON operations also include the current published
usage tariff and its units, rather than an installed provider-cost estimate.
The selected `--model` supplies the canonical request's model field; do not repeat
it in the input JSON. Inspect the intended variant: image/video inspection
defaults to text input where that variant exists. Generation's `--reference`
and `--image` flags select compatible variants automatically.

GG's generic adapter supports JSON image generation, video, music and 3D
operations. Multipart-only image editing is not advertised by that adapter;
existing native Tripo file and rigging operations retain their separate contracts.
GG discovery does not require a separate Gateway API key. Generation uses your
Grida session and selected organization.

The selected operation's schema is authoritative. A provider's model page may
advertise options Grida does not expose. There is no raw provider passthrough
or automatic provider fallback.

## Find speech voices

```sh
grida ai voices list --provider elevenlabs
```

Voice discovery uses your ElevenLabs key and needs a connection. Pass a returned
ID through `--voice` when [generating speech](./generate.md).
