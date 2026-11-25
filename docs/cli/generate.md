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

## Generate through Grida Gateway

Select `--provider gg` and configure a [Gateway API key](./providers.md).
List the current operations before choosing a model.

```sh
grida ai models list --provider gg --modality video
```

For a listed image-to-video operation, use `grida ai generate` with
`--provider gg`, the listed `--model`, a `--prompt`, a local `--image`, and a new
`--out` directory. Inspect the model and variant for the exact input contract.

Use local `--reference` files for image edits, `--image` for an image input to
video or 3D, and `--mesh` in `ai rigging check` or `ai rigging run`. When an
operation exposes named multipart fields, pass `--file FIELD=PATH` alongside
`--input`. For a supported multiview operation, use `--variant multiview` and
supply each view explicitly, for example with `--file images.front=front.png`.
Omit those fields from the JSON. Paths resolve from your working directory.

Video and specialized operations return a job ID. To check status or retrieve
an available result, use the job ID from the command output or `job.json`.

```sh
grida ai jobs get --provider gg --job-id JOB_ID --out ./recovered
```

If the connection dropped before you received a job ID, rerun the same
`ai generate` or `ai rigging run` command with the original API key secret and
input, a new `--out` directory, and
`--retry-submission @./video/submission.json`. The receipt preserves the original
request identity and operation schema, so Gateway can return an accepted job
even if the operation has since been withdrawn. Rig eligibility checks can be
recovered by job ID when you have it. A synchronous image response that Gateway
already delivered cannot be retrieved again. Use the request ID from the replay
error to look up its charge in Console. A pending charge may settle after result
delivery, and the job or an individual download link may expire independently.
[Gateway recovery and billing](https://gateway.grida.ai/llms.txt)

## Generate an image from a reference

Place your own PNG, JPEG, or static WebP at `./reference.png`:

```sh
grida ai generate --provider openrouter --model openai/gpt-image-2 \
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
grida ai generate --provider fal --model google/veo-3.1-lite \
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
`ai voices list`. Sound effects use a prompt:

```sh
grida ai generate --provider elevenlabs --model eleven_v3 \
  --text "Welcome to the studio." --voice YOUR_VOICE_ID --out ./speech
grida ai generate --provider elevenlabs --model eleven_text_to_sound_v2 \
  --prompt "A soft mechanical click" --param duration_seconds=2 \
  --param loop=false --out ./sound-effect
```

Use `ai models list --kind music` or `ai models list --kind three-d` for other
operations. Inspect their signatures: 3D capabilities vary by model, and input
or output formats are not interchangeable.

## Longer prompts and structured inputs

Save this as `prompt.txt`:

```text title="prompt.txt"
A calm abstract composition with charcoal textures and a violet rim light.
```

```sh
grida ai generate --provider openrouter --model openai/gpt-image-2 \
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
grida ai generate --provider openrouter --model openai/gpt-image-2 \
  --input @request.json --out ./structured --json
```

`--input -` accepts JSON from stdin. Use full JSON or request-building
flags. Direct Gateway multipart files can accompany JSON through `--file`. Use
explicit file flags or the model's inline-data schema for local inputs.

## File limits and failures

Paths resolve from the working directory. The CLI accepts regular UTF-8 text
files and PNG/JPEG/static WebP images, using content-based header checks. It
does not resize or transcode. Local images are capped at 8 MiB each, aggregate
image reads at 16 MiB, and assembled input at 16 MiB including base64 overhead.
Direct Gateway multipart uploads allow images up to 20,000,000 bytes and GLB
files up to 60,000,000 bytes within a total request limit of 81 MiB. An operation
may impose a lower limit.

Input and output checks precede generation credentials. A later provider or
saving failure may occur after a paid request was accepted. The CLI reports
saved paths when available and never automatically retries a possibly accepted
generation. Cancellation does not guarantee the provider stopped processing or
charging. Review the result before retrying.

`--json` changes terminal output, not saved artifacts. See [scripting conventions](./index.md)
for stdout, error, and exit-code behavior.
