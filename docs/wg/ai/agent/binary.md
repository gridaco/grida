---
title: Binary file handling
description: Glossary and reference for how an agent handles binary attachments the model cannot natively read. Three resolution paths (provider-native multimodal, skill-per-format, shell-based conversion), a format matrix, the scratch-space pattern for archive extraction, and the boundary between protocol and implementor.
keywords:
  [
    agent-system,
    binary,
    attachments,
    mime,
    pdf,
    zip,
    pptx,
    docx,
    psd,
    fig,
    skills,
    provider-native,
    multimodal,
    sandbox,
    scratch,
    tempdir,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Binary file handling

A user attaches a `.zip`, a `.pptx`, a `.psd`, a `.fig`, a `.pdf`.
The model has no opinion about most of these bytes. The agent has
to bridge the gap.

This page is a **glossary and reference**: the routes an agent takes
to make binary attachments useful, the format matrix that drives the
choice, the scratch-space pattern for archive extraction, and the
line between what the protocol fixes and what the implementor
chooses.

> **Not the same as [`visual perception`](./vision.md).** This page is
> about content the model **cannot read at all** (a `.psd`, a `.zip`).
> Perception is about a source the model _could_ read as text but where
> the agent wants the **rendering** — an svg, a code file as a
> screenshot — reached by path through the `view_image` tool. A raster
> bitmap is the overlap: handled here as a native-multimodal attachment,
> reached there by path on demand. For the entry-point handling (the `file-attachment` part,
> the descriptor fallback, the storage threshold), see
> [`compositor / attachments`](./compositor.md#attachments-the-long-tail).
> For the broader skill discovery and loading flow, see
> [`skills`](./skills.md).

## The three resolution paths

When a binary attachment lands in a user message, the lowering layer
([`compositor / templating`](./compositor.md#templating-user-view-vs-model-view))
picks one of three paths:

| Path                       | What happens                                                                                                   | When it's right                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Provider-native multimodal | The compositor passes the file part through as a provider-native multimodal block; the provider does the rest. | Provider advertises native support for this mime type (e.g. PDF on Anthropic / Gemini). |
| Skill-per-format           | The host ships a `skill` that teaches the agent how to handle this mime type; the agent calls tools / shell.   | Most binary formats. The dominant convention.                                           |
| Shell-based conversion     | The agent calls `bash` with a host-allowlisted converter (libreoffice, ghostscript, ffmpeg, …).                | When no skill is registered and the host environment has the converter installed.       |

The paths are tried **in order**. If the provider supports the
format natively, use that — it's free for the agent. Otherwise, if a
skill is registered, the agent loads it and follows its instructions.
Otherwise, the agent reaches for shell, if shell is available.

The compositor's job is to mark the attachment with its mime type
and a path or content-id; the lowering layer's job is to pick the
path; the agent's job is to act on it.

## Format matrix

| Format                 | Mime                                                        | Provider-native?                    | Skill                | Shell?    | Notes                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------- | -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pdf**                | `application/pdf`                                           | **Yes** — Anthropic, Gemini, others | Optional fallback    | Optional  | When the provider takes it, treat as multimodal. Otherwise convert pages → images, or run OCR.                                                                                                                                                                                                                                                             |
| **png/jpg/webp/gif**   | `image/*`                                                   | **Yes** — most modern providers     | —                    | —         | Native multimodal. The straightforward case.                                                                                                                                                                                                                                                                                                               |
| **zip**                | `application/zip`                                           | No                                  | **Recommended**      | Often yes | Extract to [scratch](#scratch-space-for-extraction); re-resolve each entry as its own attachment.                                                                                                                                                                                                                                                          |
| **tar / gz / 7z**      | `application/x-tar`, `application/gzip`, …                  | No                                  | Recommended          | Often yes | Same shape as zip.                                                                                                                                                                                                                                                                                                                                         |
| **docx / pptx / xlsx** | `application/vnd.openxmlformats-officedocument.*`           | No                                  | **Recommended**      | **Yes**   | Office formats. Skill teaches `libreoffice --headless --convert-to pdf <file>` or Python with `python-docx` / `python-pptx` / `openpyxl`.                                                                                                                                                                                                                  |
| **odt / odp / ods**    | OpenDocument family                                         | No                                  | Recommended          | Yes       | Same as Office — libreoffice handles natively.                                                                                                                                                                                                                                                                                                             |
| **psd / ai**           | `image/vnd.adobe.photoshop`, `application/postscript`       | No                                  | Recommended          | Optional  | Convert to flat image via skill (`psd_to_png`-style tool) or shell (`convert` from ImageMagick).                                                                                                                                                                                                                                                           |
| **fig**                | `application/vnd.figma`                                     | No                                  | Recommended          | Optional  | Render to image via a host-supplied tool (e.g. [`@grida/refig`](https://www.npmjs.com/package/@grida/refig)) and feed the image as multimodal — or parse the kiwi-encoded archive natively (e.g. [`@grida/io-figma`](https://github.com/gridaco/grida/tree/main/packages/grida-canvas-io-figma)) when the task needs the structured node tree, not pixels. |
| **mp4 / mov / mkv**    | `video/*`                                                   | **Sometimes** — Gemini, others      | Recommended fallback | Sometimes | Native multimodal where supported. Otherwise frame extraction + per-frame analysis.                                                                                                                                                                                                                                                                        |
| **mp3 / wav / m4a**    | `audio/*`                                                   | **Sometimes** — Gemini, others      | Recommended fallback | Sometimes | Native multimodal where supported. Otherwise transcription via a tool / API.                                                                                                                                                                                                                                                                               |
| **csv / tsv / json**   | `text/csv`, `text/tab-separated-values`, `application/json` | No (treat as text)                  | Optional             | —         | Inline as text when small; reference and tool-driven read when large.                                                                                                                                                                                                                                                                                      |
| Binary unknown         | unknown / generic `application/octet-stream`                | No                                  | —                    | —         | Always a descriptor part. Model sees `{ name, mime, size }`, never the bytes.                                                                                                                                                                                                                                                                              |

The "Provider-native?" column is the **compositor's capability
check**, not a fixed answer — providers add formats over time. A
conforming lowering layer SHOULD consult a per-provider capability
map at the time of the user message, not hard-code the answer.

## Provider-native shortcuts

Some providers treat selected binary formats as **first-class file
parts**. The most common case today: PDF on Anthropic and on Google
Gemini. The compositor passes the file through; the provider parses
it; the model sees the text and the page images without the agent
ever calling a tool.

What's happening behind the scenes — OCR, PDF-to-image, native
parser, embedding lookup — is **provider territory**. The protocol
does not require the agent or the host to know. From the agent's
perspective, the attachment is a multimodal part it can reference in
prose the way it references an inline image.

The lowering rule:

1. Check the provider's advertised capability for the attachment's
   mime type.
2. If native, emit the attachment as a provider-native multimodal
   block. Do not load a skill, do not pre-convert.
3. If not native, fall through to the next path (skill, then shell).

The same pattern applies to video and audio on multimodal-capable
providers — Gemini, for instance, accepts video URIs and audio
samples directly. The contract is the same: capability-first, not
type-first.

Implementor caveat: capability changes over time. A conforming
implementation SHOULD treat the capability map as runtime data
(refreshable per provider release), not as a build-time constant.

## The skill-per-format pattern

For formats with no provider-native support, the dominant convention
is **one skill per format**. A skill is the agent's how-to for that
format: when to use it (descriptor at load time), what tool / shell
to invoke, how to interpret the output, and how to feed the result
back into context.

This pattern is well-established — see
[`anthropics/skills`](https://github.com/anthropics/skills/tree/main/skills)
for a public set of reference skills covering common formats. A
project SHOULD ship the skills it expects users to attach against
(its file-format inbox) the way it ships the tools agents call.

Why per-format rather than per-tool: a format like `.pptx` has many
possible conversion paths (libreoffice, python-pptx, an online
service). Centralizing the choice in a **skill** keeps the agent's
behavior consistent regardless of which tool happens to be
installed. The skill body owns the "if libreoffice then X else
python then Y" branching; the agent's manifest just declares it has
access to a skill named `pptx`.

Skill discipline for binary handling:

- **Descriptor names the format and the trigger.** "Load when the
  user attaches a `.pptx` file or asks to convert one." Vague
  descriptors don't fire.
- **Body teaches the route.** Step-by-step: detect the file, call
  the converter, route the output (text inline, image as
  multimodal attachment, or both).
- **Output discipline.** When the skill produces an intermediate
  file (PDF from PPTX, PNG from PSD), the agent attaches the
  intermediate the way the user attached the original — through the
  normal compositor / attachment path — so the model sees the
  result, not the raw conversion stdout.
- **Failure modes.** When the converter is missing or fails, the
  skill SHOULD have the agent surface a useful error ("libreoffice
  not installed; please install via `apt install libreoffice` or
  attach the file as a PDF") rather than retrying blindly.

See [`skills`](./skills.md) for the general skill contract (manifest
shape, discovery, body loading).

## Shell-based conversion

For formats with no provider-native support and no registered skill,
the agent's fallback is `bash` ([`tools / bash`](./tools.md)) — call
an allowlisted converter directly. This works for office formats
(`libreoffice --headless --convert-to pdf foo.pptx`), images
(`convert`, `magick`, `vipsthumbnail`), archives (`unzip`, `tar -xf`),
PDFs (`pdftotext`, `pdftoppm`, `pdftohtml`, `qpdf`), audio
(`ffmpeg -i in.m4a out.wav`), and many others.

Shell is the **least preferred** of the three paths because:

- It requires the converter to be installed in the agent's
  environment (not portable across hosts).
- It requires `shell.run` in the agent's manifest (a meaningful
  capability grant).
- It requires the watchdog ([`foundations / watchdog`](./foundations.md#watchdog))
  to approve the specific command shape.
- It produces unstructured stdout the agent has to parse.

A skill that wraps the same conversion offers structure (typed
return), error handling (the skill knows what failure looks like),
and portability (the skill names the converter; the host installs
it). When a skill exists, the agent should use the skill, not the
shell directly.

That said, for one-off conversions or environments where shipping a
skill is overkill, direct shell is fine. The format matrix above
flags which formats _typically_ benefit from shell.

## Scratch space for extraction

> The scratch concept — per-session, ephemeral, host-owned, distinct from the
> workspace — is specified in [`scratch`](./scratch.md). This section is its
> **archive-extraction application**: the location and contract notes below are
> that page's bindings seen from the extraction use case.

Archives, multi-part documents, and conversion intermediates need
**writable scratch space**: somewhere on disk the agent can unpack
into and read from, distinct from the user's workspace.

The protocol does not specify the path. It specifies the contract
the host's filesystem MUST provide:

- A **writable, agent-scoped directory** that is inside the
  sandbox's `fs.write` allow-list.
- A **lifecycle** the agent can rely on: contents live at least for
  the current session, and the host owns cleanup.
- **Sandbox-aware**: the directory is bounded by whatever sandbox
  primitive the environment uses
  ([`environments`](./environments.md), [`srt`](./srt.md)). Writes
  outside it fail with the sandbox's usual `EPERM`.

Two reasonable locations, each with trade-offs (the
[`scratch` bindings](./scratch.md#bindings) seen from the extraction case —
note neither is workspace-resident: that would violate scratch's
[S2 / S5](./scratch.md#the-scratch-contract)):

| Location                 | Where                                        | Pros                                                          | Cons                                                                               |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| OS tempdir               | `$TMPDIR` / `/tmp/agent-<session>/`          | Standard, OS-managed lifetime, never confused with workspace. | Cleaned up by the OS at unpredictable intervals; multi-session caching is fragile. |
| Sandbox-provided scratch | A tmpfs mount the sandbox primitive supplies | Fully isolated; cleanup tied to sandbox lifecycle.            | Requires sandbox cooperation; opaque to the user when debugging.                   |

A conforming implementation MAY pick any of these. The agent does
not need to know which: it asks the runtime for a scratch path
(`runtime.scratch_dir()` or equivalent — surface is implementor's
call), gets back an absolute path, writes there, reads back from
there, and trusts the host to clean up.

### Extracting an archive

The default sequence for a zip / tar attachment:

1. The compositor emits a `file-attachment` for the archive (or a
   `file-ref` if the archive is already in the workspace).
2. The lowering layer sees no provider-native handling; the
   archive skill (if one exists) is loaded, or the agent reaches
   for shell.
3. The agent asks for scratch (`runtime.scratch_dir()`), calls
   `unzip <archive> -d <scratch>` (or library equivalent).
4. The agent calls `glob` / `list_files` on the scratch dir to
   discover entries.
5. Each entry is re-resolved through the normal handling — text
   files inline, images as multimodal, sub-archives recursively, and
   so on.

Two cross-cutting concerns:

- **Capability gating.** Extraction requires `fs.write` (to the
  scratch dir) and either a `bash` capability or a host-supplied
  archive tool. Agents without these capabilities cannot extract;
  the lowering layer SHOULD short-circuit to a descriptor part
  ("archive with N entries; agent cannot extract in this
  environment") instead of failing mid-task.
- **Bomb defense.** A small zip can decompress to gigabytes. The
  host's filesystem and sandbox MUST cap scratch disk usage
  (default ~100 MB unless the agent declares otherwise). The
  protocol does not fix the number; the host does.

## Implementor checklist

A conforming implementation SHOULD:

- Maintain a per-provider capability map for mime types; consult it
  before falling through to skill or shell.
- Ship the skill catalog the project expects users to attach
  against. Format-by-format coverage scales linearly; the user
  should not need to teach the agent.
- Provide scratch space via a runtime API rather than hard-coding a
  path the agent must guess.
- Bound scratch disk usage at the sandbox layer to defend against
  decompression bombs.
- Treat the conversion intermediate (PDF from PPTX, PNG from PSD)
  as a real attachment that flows through the normal compositor
  path, not as transient shell output.

## What this guide does not specify

- **Which formats a host MUST support.** Hosts vary. A code-only
  agent can refuse `.pptx`; a design-tool agent might refuse `.docx`.
  Both are conformant.
- **The scratch directory path.** OS tempdir, workspace dotfile,
  sandbox tmpfs — implementor's choice.
- **Provider capability detection.** Static config, runtime probe,
  out-of-band lookup — all fine.
- **Skill content.** What goes inside the `pptx` skill — which
  converter, which fallback, what prompt — is the skill author's
  call.
- **Resource limits.** Decompression size caps, per-attachment
  byte limits, scratch-disk quota — host policy.

## See also

- [Compositor / attachments](./compositor.md#attachments-the-long-tail) —
  the entry-point handling for any attachment, including the
  storage threshold.
- [Compositor / templating](./compositor.md#templating-user-view-vs-model-view) —
  the lowering chain that picks one of the three paths.
- [Skills](./skills.md) — the general contract for skill discovery,
  loading, and the descriptor-first index. The skill-per-format
  pattern is the same machinery applied to binary handling.
- [Tools / bash](./tools.md) — the capability that backs
  shell-based conversion.
- [Visual perception](./vision.md) — the adjacent problem: perceiving a
  path-resident or text-shaped source as pixels via `view_image`.
- [Environments](./environments.md) — which environments offer
  writable scratch, and how the sandbox bounds it.
- [`anthropics/skills`](https://github.com/anthropics/skills/tree/main/skills) —
  reference catalog of format-handling skills.
