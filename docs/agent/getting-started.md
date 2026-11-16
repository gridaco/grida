---
title: Start an agent task with files and folders
description: Start from Welcome or a project, mention files, attach files or folder references, and work with a deck or an SVG.
keywords:
  [
    agent workspace,
    Welcome,
    slides template,
    PNG attachment,
    file attachment,
    folder reference,
    project files,
    Grida Desktop,
  ]
format: md
---

# Start an agent task with files and folders

Available in Grida Desktop on macOS and Linux, and from a source-built
headless host. Windows Desktop has no agent chat.

## Start from Welcome

Describe what you want in the Welcome composer and send. Grida opens the
default project folder, or the project chosen at the top left, and sends your
message as the first message of a new chat there. Your message is sent once:
reloading the window does not send it again.

The model picker on Welcome lists **Default**, models from a connected
**ChatGPT Subscription**, and models available through your saved provider
keys and endpoints. New chats use your last explicitly chosen model and
effort together. With no saved choice, a new chat prefers a ready subscription.
The chat in the project uses the model you choose; more
Grida models appear in the project's own picker once its chat is running. If
the chosen model cannot start, or the project needs a model choice first,
the chat says your message wasn't sent and puts it in the composer so you
can send it yourself. [Choose a model](./models-and-usage.md#choose-a-model)

To start from a slides template, choose **Slides** on the left, pick a
template and send, with or without a description. Grida copies the template
into the project as its own deck, named after the template, and asks the agent
to adapt that deck. References you add from the gallery are sent as links in
the first message.

## Work in a project

Open a folder in Grida Desktop and open its chat pane. The **Default** access
shown in the composer lets the agent read and edit files in this project and
run commands in a sandbox without asking; other folders and the internet are
off. To let this chat use user-accessible files and the internet, open
**Default**, choose **Full access**, and confirm the in-app dialog. New chats
still begin with Default. Type `@` to mention a file, for example “Summarize @README.md and list
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

Choose **+ → Image**, or drop or paste one PNG, JPEG, WebP or GIF into the
composer, then describe what you want. **+ → Library** adds a selected Library
image. A message accepts one attachment.

On a model that takes images, the first request includes actual prepared
pixels. An image picked from disk also includes its verified original path;
a pasted image without a disk origin has a retained snapshot identity instead.
You can ask what the image shows without first asking the agent to open it.
An incompatible model or older host keeps the entire draft unsent so you can
choose a compatible model or remove the image.

Raster sources can be up to 20 MiB, within decoded-image limits. Grida keeps
the exact original and prepares a bounded PNG for the model, up to 2,048 pixels
on either side, 2 megapixels and 384 KiB. Larger images may be resized. An
animated image supplies one still frame, not the whole animation. Seeing the
prepared image does not promise inspection of every original pixel.

Images appear on their own outside the message's text bubble, without a card
frame or caption. Select one to preview the retained original, including after
reopening the chat; previewing starts no model request. A crop uses the image
the model saw, so its resolution can be lower than the original.
[Inspect and save results](./results.md)

## Attach a file

Choose **+ → Files**, or drop or paste one file into the composer. A file from
disk is a reference: the agent receives its verified path, name, type and size
and inspects its contents on demand with its existing tools and permissions.
Small disk files follow the same rule. No text extraction or file read happens
just because you attached it. Mention a project file with `@` for the same
on-demand workflow.

A reference is not a copy. The agent sees the current file when a permitted
tool reads it; moving or deleting the source can make it unavailable. A video
can show a poster frame and duration on its card, but its contents are still
inspected on demand. The poster does not become automatic video perception or
playback. PDF, SVG and HTML keep file cards without an invented rendering.

Pasted ordinary files with no usable disk path can use the bounded retained
file workflow when available. This retains a private copy and leaves content
inspection to tools. It never invents an original path.

Dropping several files or folders keeps the existing draft and attachment.
Files in Grida's own protected data cannot be attached.

## Attach a folder

Drop one folder from your file manager onto the chat pane or composer. Grida
attaches a reference with the folder's name, location and type. Its card has
no total size or media preview. Attaching it does not copy, list or archive
its contents.

The agent uses its existing permissions to inspect the folder. Within an
already permitted project, its file tools can list or search it. A reference
to another folder does not extend those tools' access. Plan cannot run a
command to inspect it; Act keeps the command access already allowed for that
chat. Grida's private folders, folders containing that private data, and
filesystem aliases to either cannot be attached.
[Understand agent permissions](./permissions.md)

The folder reference stays with a queued or saved message. Reopening the chat
shows it without inspecting the folder or sending another model request.
The agent sees the current contents when it uses a permitted tool; a reference
is not a saved copy, so moving or deleting the folder can make it unavailable.
If your installed Desktop build cannot accept folder references, the drop
shows an update message and keeps the draft and current attachment.

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
