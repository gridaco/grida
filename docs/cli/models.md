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

Find an executable operation before preparing its input. Listing and inspection
use the bundled catalogue and work offline without credentials, except for
explicit availability checks described below.

## Find models

```sh
grida models list --modality image
grida models list --provider fal --modality video --local-image
```

Rows identify provider, model, input variant, status, and accepted local-image
flags. `--local-image` selects operations accepting a local `--reference` or
`--image` file. It does not mean every model from that provider accepts files.
Use `--json` for structured rows and `--kind` for operations such as `music`,
`sound-effect`, `text-to-speech`, or `three-d`.

## Check your access route

```sh
grida models list --provider fal --available
grida models list --provider openrouter --modality image --available --json
```

`--available` requires a provider. For BYOK it checks effective key presence
after static validation, without contacting the provider. For GG it checks
cached organization eligibility online using your Grida session. Neither
guarantees provider permission, provider credit, or a successful request.
A missing provider key does not prevent offline discovery or use of another
configured provider.

## Inspect accepted inputs

```sh
grida models inspect --provider openrouter --model openai/gpt-image-2 --variant references
grida models inspect --provider fal --model google/veo-3.1-lite --variant image
grida models inspect --provider fal --model google/veo-3.1-lite --variant image --json
```

Human output shows types, required fields, limits, and an example. `--json`
returns the full schema. Inspect the intended variant: image/video inspection
defaults to text input where that variant exists. Generation's `--reference`
and `--image` flags select compatible variants automatically.

The selected operation's schema is authoritative. A provider's model page may
advertise options Grida does not expose. There is no raw provider passthrough
or automatic provider fallback.

## Find speech voices

```sh
grida voices list --provider elevenlabs
```

Voice discovery uses your ElevenLabs key and needs a connection. Pass a returned
ID through `--voice` when [generating speech](./generate.md).
