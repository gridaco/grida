---
title: Generate media with Grida CLI
description: Generate images, video, audio, and 3D with Grida CLI, pass local reference files, and save results for your next step.
keywords: [grida, cli, image generation, video generation, audio, local files]
sidebar_label: Generate
sidebar_position: 6
tags: [cli]
format: md
---

# Generate media with Grida CLI

Choose a provider and model explicitly, prepare supported inputs, and save into
a new directory. Configure [provider keys](./providers.md) first. Generation
uses the selected provider account and may incur charges.

## Generate an image from a reference

Place your own PNG, JPEG, or static WebP at `./reference.png`:

```sh
grida generate --provider openrouter --model openai/gpt-image-2 \
  --prompt "An abstract graphite sculpture inspired by the reference, no text" \
  --reference ./reference.png --param size=1536x864 --out ./image
```

Repeat `--reference` for ordered references where supported. HTTPS URLs are also
accepted. Local bytes are sent inline to the selected provider; no preliminary
Grida storage upload is needed.

`--out` must name a new directory whose parent exists. The command waits, saves
artifacts and `receipt.json`, and prints their paths. Existing files are never
replaced. Use the printed path for your next step.

## Make a short video from that image

When the first step saved `./image/output-1.png`, pass it directly:

```sh
grida generate --provider fal --model google/veo-3.1-lite \
  --prompt "Slow camera drift and a gentle moving light, preserve the composition" \
  --image ./image/output-1.png --param duration=4 --param resolution=1280x720 \
  --param generate_audio=false --out ./video
```

This operation accepts a local image and explicit audio control. Omitting
`generate_audio` leaves the provider's default in effect. Other operations may
require an HTTPS image URL or expose different options; [inspect the model](./models.md)
rather than assuming equivalent inputs.

## Audio and 3D

Speech uses text and a voice ID. Replace `YOUR_VOICE_ID` with a result from
`voices list`. Sound effects use a prompt:

```sh
grida generate --provider elevenlabs --model eleven_v3 \
  --text "Welcome to the studio." --voice YOUR_VOICE_ID --out ./speech
grida generate --provider elevenlabs --model eleven_text_to_sound_v2 \
  --prompt "A soft mechanical click" --param duration_seconds=2 \
  --param loop=false --out ./sound-effect
```

Use `models list --kind music` or `models list --kind three-d` for other
operations. Inspect their signatures: 3D capabilities vary by model, and input
or output formats are not interchangeable.

## Longer prompts and structured inputs

Save this as `prompt.txt`:

```text title="prompt.txt"
A calm abstract composition with charcoal textures and a violet rim light.
```

```sh
grida generate --provider openrouter --model openai/gpt-image-2 \
  --prompt-file ./prompt.txt --out ./long-prompt
```

`--prompt-file -` reads UTF-8 text from stdin; `--text-file` supplies speech text.
Only one input can read stdin, so prompt input cannot share it with
`--key-stdin`. `--param FIELD=VALUE` sets advertised scalar inputs, preserving
numbers and booleans such as `0` and `false`.

For complex input, save the full object as `request.json`:

```json title="request.json"
{
  "prompt": "A blue ceramic teapot",
  "size": "1536x864"
}
```

```sh
grida generate --provider openrouter --model openai/gpt-image-2 \
  --input @request.json --out ./structured --json
```

`--input -` accepts JSON from stdin. Full JSON is exclusive with request-building
flags. JSON strings are never expanded into local files; use file flags or the
model's explicit inline-data schema.

## File limits and failures

Paths resolve from the working directory. The CLI accepts regular UTF-8 text
files and PNG/JPEG/static WebP images, using content-based header checks. It
does not resize or transcode. Local images are capped at 8 MiB each, aggregate
image reads at 16 MiB, and assembled input at 16 MiB including base64 overhead.
An operation may impose a lower limit.

Input and output checks precede generation credentials. A later provider or
saving failure may occur after a paid request was accepted. The CLI reports
saved paths when available and never automatically retries a possibly accepted
generation. Cancellation does not guarantee the provider stopped processing or
charging. Review the result before retrying.

`--json` changes terminal output, not saved artifacts. See [scripting conventions](./index.md)
for stdout, error, and exit-code behavior.
