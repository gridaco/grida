---
title: Start an agent task with files and folders
description: Open a project, mention or attach files, and work with a deck, an SVG or a single file.
keywords:
  [
    agent workspace,
    PNG attachment,
    file attachment,
    project files,
    Grida Desktop,
  ]
format: md
---

# Start an agent task with files and folders

Available in Grida Desktop on macOS and Linux, and from a source-built
headless host. Windows Desktop has no agent chat.

## Work in a project

Open a folder in Grida Desktop and open its chat pane. The **Default** access
shown in the composer lets the agent read and edit files in this project and
run commands in a sandbox without asking; other folders and the internet are
off. Type `@` to mention a file, for example “Summarize @README.md and list
the open TODOs.” A mention gives the agent the file's path; it reads the
file's current contents when it needs them. To investigate without changing
anything, type `/plan` or choose **+ → Plan mode** before you send.
[Understand agent permissions](./permissions.md)

On macOS and Linux, open a `.canvas` deck in its own window to start or reopen
its chat. Ask about files inside the deck by name while you work in the slide
editor. A deck opened from inside a project has its own saved chats and can
reach only the files within the deck.
[Edit selected text](#edit-selected-text-in-an-svg-or-slide)

## Attach an image

Choose **+ → Image**, or drop or paste one PNG up to 256 KiB into the
composer, then describe what you want, for example “Crop this to the
subject.” **+ → Library** adds a Library image as a PNG. **Image** and
**Library** appear only when the selected model accepts images, such as the
default Grida model or an OpenRouter model that takes images.

The message and the image enter the chat together, also when the message
joins the queue. After you send, the message shows the attachment as a chip
with its name; the chip does not show a preview of the image. A crop appears
below the turn's answer, where you can preview and save it.
[Inspect and save results](./results.md)

## Attach a file

Choose **+ → Files**, or drop or paste one file up to 256 KiB into the
composer, and ask the agent to inspect it. The agent can check the file's
size and digest and read a short text excerpt; the chat keeps a private copy.
Dropping a folder or several files shows a message and keeps your draft. To
work on a project file instead, mention it with `@`.

## Edit selected text in an SVG or slide

Open an SVG or a slide in Desktop and select one plain text element. Without
the **Plan** badge, send a message asking the agent to read or replace it, for
example “Make this heading shorter.” The change appears in the editor and can
be undone there; use the editor's **Save** command to write it to disk. If
another program has changed the file, the save dialog handles the conflict.

Switching tabs or slides, changing the selection, or editing the document
before the agent acts makes the selected text unavailable; select it again
and send a new message. Queued messages and messages with the **Plan** badge
cannot edit the selection.

## Current limits

- A message with an attachment cannot be edited later; send a new message
  instead. To change the attachment on a queued message, remove the queued
  message and send it again.
- Attachments are unavailable while the **Goal** badge is on. Send or remove
  an attachment before choosing another model.
- The agent cannot render an SVG or HTML file it wrote into an image to check
  how it looks. Open the file in Grida to review it yourself.

## Work without a project

On macOS, open an SVG file directly to start a chat for that file. Reopen the
SVG and choose its saved chat from the sidebar. The chat cannot reach the
surrounding folder.

On macOS and Linux, a source-built `grida-agent run` can work on one PNG
without a project. Omit `--cwd` and `--permission-profile`:

```sh
target/debug/grida-agent run \
  --state-dir /absolute/path/to/agent-state \
  --endpoint https://api.openai.com/v1 --provider responses \
  --model MODEL_ID --credential-env OPENAI_API_KEY \
  --input-png ./photo.png \
  --prompt 'Crop the image to the subject.'
```

Use `--input-file` instead of `--input-png` to inspect any file up to
256 KiB. [Run a task from a script](./clients.md#run-a-task-from-a-script) ·
[Inspect a local file headlessly](./clients.md#inspect-a-local-file-headlessly)
