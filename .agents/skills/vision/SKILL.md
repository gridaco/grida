---
name: vision
description: >
  Query images with a local Ollama vision model without loading the image
  into the main agent context. Use when you need to describe a screenshot,
  check whether rendered content is present, detect overlapping elements, or
  ask any visual question about a PNG/JPEG/WebP file. Requires Ollama running
  locally with the Gemma 4 multimodal model (`gemma4` on Ollama).
  Script: .agents/skills/vision/scripts/ask.py.
  Trigger phrases: "describe image", "what does this screenshot show",
  "does the canvas contain content", "check screenshot visually",
  "look at this image", "any overlapping elements", "vision query".
---

# Vision — Local Image Querying via Ollama

Ask natural-language questions about images without passing them to the main
agent as visual input. Useful for verifying screenshots, annotating assets,
or building automated checks around visual output.

## When to Use This Skill

- Describing a screenshot for a PR description or user-facing document
- Checking whether an automated browser run produced visible canvas content
- Asking "do any elements overlap?" on a rendered output
- Any question where the answer is in the pixels but you don't want to use
  vision tokens in the main context

---

## Quick Reference

All commands use `uv run` — dependencies are installed automatically.

```sh
SCRIPT=.agents/skills/vision/scripts/ask.py

# health check (fast, no image, confirms Ollama + model respond)
uv run $SCRIPT --ping

# system info — memory, storage, installed models
uv run $SCRIPT --info
uv run $SCRIPT --memory
uv run $SCRIPT --storage

# describe an image (default prompt)
uv run $SCRIPT path/to/image.png

# explicit shortcut
uv run $SCRIPT path/to/image.png describe

# custom question
uv run $SCRIPT path/to/image.png \
  --prompt "Do you see any overlapping UI elements?"

uv run $SCRIPT canvas.png \
  --prompt "Does this canvas contain any designed content, or is it empty?"

# optional: pin a specific Gemma 4 tag (default is any installed gemma4)
uv run $SCRIPT image.png --model gemma4:e4b

# list installed Gemma 4 vision models
uv run $SCRIPT --list-models
```

---

## Prerequisites

Ollama must be running locally. The script connects to `http://localhost:11434`
and fails immediately if it cannot reach it.

```sh
# start Ollama (if not already running)
ollama serve

# install Gemma 4 (multimodal — required for this skill)
ollama pull gemma4
```

The script **does not install models**. If Gemma 4 is not installed it prints
the list of installed models and a `pull` suggestion, then exits.

**`uv` is required** to run the script (handles dependency installation
automatically). No `requirements.txt` or manual `pip install` needed.

---

## Model Selection

This skill uses **only** [Gemma 4](https://ollama.com/library/gemma4) on
Ollama (`gemma4` and tags such as `gemma4:latest`, `gemma4:e4b`). Other
multimodal models are ignored so agents do not silently fall back to a
different family.

When `--model` is omitted, the script picks any installed `gemma4` tag (for
example `gemma4:latest`). Use `--model gemma4:e4b` (or another tag) to pin a
specific variant.

---

## System Info

Before running a heavy query, check whether the machine has enough resources.
This is optional — the script does not enforce limits — but useful context
for deciding whether to proceed or skip.

```sh
uv run $SCRIPT --info      # memory + storage + model list
uv run $SCRIPT --memory    # just memory
uv run $SCRIPT --storage   # just storage
```

Tip: on machines with ≤8 GB RAM, large vision models may cause swapping or
OOM. Consider a smaller Gemma 4 variant (for example `gemma4:e2b`) or skip
the query.

---

## Behavior

- **Fails fast** if Ollama is unreachable or Gemma 4 is not installed.
  Exit code is non-zero; the error message includes a `hint` or `pull` command.
- **Sequential only** — Ollama is a single-worker process. Never call `ask.py`
  in parallel (e.g. two concurrent tool calls). Queue calls one at a time.
- **No side effects** beyond the local Ollama process.
- **Auto-installs deps** via `uv` inline script metadata (PEP 723). Only
  dependency is the `ollama` Python package.
- Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`.

---

## Typical Agent Workflow

1. A tool (browser automation, screenshot capture, golden renderer) writes
   an image to disk.
2. Call `ask.py` with a targeted prompt suited to the task.
3. Parse the text response to decide the next action.

```sh
# Quick sanity check first
uv run $SCRIPT --ping

# Verify a browser screenshot has content before including it in a doc
uv run $SCRIPT /tmp/preview.png \
  --prompt "Answer with YES or NO: does this screenshot show any visible UI content, shapes, or text?"

# Describe a golden render for a PR description
uv run $SCRIPT crates/grida-canvas/goldens/progressive_blur.png \
  --prompt "Describe what visual effect is shown. Be specific about blur, colors, and shapes."
```

---

## Troubleshooting

| Symptom                         | Cause                            | Fix                                     |
| ------------------------------- | -------------------------------- | --------------------------------------- |
| `cannot reach Ollama`           | Ollama not running               | `ollama serve`                          |
| `no Gemma 4 vision model found` | Gemma 4 not installed            | `ollama pull gemma4`                    |
| `model 'X' is not available`    | Model name typo or not installed | `--list-models` to see what's installed |
| Slow response                   | Large model on CPU               | Try a smaller tag (e.g. `gemma4:e2b`)   |
| Vague or wrong answer           | Generic prompt                   | Write a more specific `--prompt`        |
| `'ollama' package not found`    | Not using `uv run`               | Run with `uv run ask.py` instead        |
