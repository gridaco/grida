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

Describe what you want in the Welcome composer and press **Send**. The composer
clears so you can start typing your next message while Grida opens the selected
project. Your first message and its attachment appear in the project chat while
it starts. Reloading during the handoff preserves the follow-up as a separate
draft. If that chat already has an unsent draft, the text you typed during
opening stays on Home.

If the connection cannot start, the workspace keeps your Welcome message.
Choose **Retry** once the original connection is ready. If you choose another
model, review the outgoing message with **Edit**, then send it explicitly.

The model picker on Welcome lists **Default**, models from a connected
**ChatGPT Subscription**, and models available through your saved provider
keys and endpoints. New chats use your last explicitly chosen model and
effort together. With no saved choice, a new chat prefers a ready subscription.
The chat in the project uses the model you choose; more
Grida models appear in the project's own picker once its chat is running.
[Choose a model](./models-and-usage.md#choose-a-model)

To start from a slides template, choose **Slides** on the left, pick a
template and send, with or without a description. Grida copies the template
into the project as its own deck and asks the agent to adapt that copy. The
chat shows the template as a separate chip beside your words. Add a description
when starting a Goal or sending a non-image file or folder with the template.
References you add from the gallery are sent as links in the first message.

To start from an FX example, choose **Workflows** and click one or more cards.
Use the pill numbers to refer to the examples in your request. Send with a
description or with the picks alone. The chat shows your words and the
selected examples as separate chips. The agent can use the public showcase
and source links to inspect the parts your request calls for.

To create an image, choose **Images**. You can type a request, select Library
images as references, or do both. The chat shows a thumbnail for each selected
image beside your words. The agent receives the image links and image creation
guidance as context.

## Work in a project

Open a folder in Grida Desktop and open its chat pane. A new chat starts in
**Auto** when available. The agent reads and edits files in the project and
runs commands in a sandbox. The chat’s model reviews eligible requests for
extra access. Choose **Ask for approval** in the access picker to review them
yourself. Choose **Full access** and confirm the dialog to allow ordinary-user
filesystem and network access for commands.
Type `@` to mention a file, for example “Summarize @README.md and list
the open TODOs.” A mention gives the agent the file's path; it reads the
file's current contents when it needs them. To investigate without changing
anything, type `/plan` or choose **+ → Plan mode** before you send.
[Understand agent permissions](./permissions.md)

On macOS and Linux, open a `.canvas` deck in its own window to start or reopen
its chat. Ask about files inside the deck by name while you work in the slide
editor. A deck opened from inside a project has its own saved chats and can
reach only the files within the deck.
[Edit selected text](#edit-selected-text-in-an-svg-or-slide)
[Work with an SVG selection](#work-with-an-svg-selection)

## Continue from a suggested prompt

With **Settings → Personalization → Suggested prompts** enabled, a follow-up may appear in faint text in your empty composer after a reply. Press **Tab** to accept it, edit the draft, and send it when ready. If you clear the draft before sending, the same suggestion reappears while it still applies to the chat. You can start typing immediately, including while Grida is generating a suggestion. [Costs and configuration](./desktop-settings.md#suggest-the-next-prompt)

## Open a local web preview

In a Desktop project chat, a finished reply that gives you one local web
address with a port can show a **Web preview** card. Click the card or **Open**
to use your local-link preference in **Settings → Browser**. If you use
Grida and that exact address is already open in the workbench, Grida switches
to its tab. The menu beside **Open** offers **Open in default browser** and
**Copy link**. If the local server is stopped, start it and reload the page.

When the card is visible, Desktop can fill in the page title, description and
icon. Recognized products such as FX Viewer can also show their name. The
second line shows the description, or the host and port if no description is
available. Hover over the local link in the reply to see its preview and
product label when available. Cards and inline links for the same address
share preview details. If you stop or restart a local server, hover the link
again or bring a card into view to recheck it. **Open** is available while
Desktop reads the preview.

## Preview a public link

Hover over a public link in a Desktop project chat to see its domain and
**Open** action. After a short delay, the card can show the page title,
description, favicon, and preview image when available. It can also label a
recognized product such as FX Viewer. Desktop requests the metadata and images
before you open the link. Both the link and **Open**
follow your web-link preference in **Settings → Browser**, even if the
preview is unavailable.

## Attach an image

Choose **+ → Image**, or drop or paste one PNG, JPEG, WebP or GIF into the
composer, then describe what you want. In a project chat, **+ → Library**
can attach one selected Library image. A message accepts one attachment.

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

The agent uses its existing permissions to inspect the folder. In Plan it
can run confined commands to find or search files within its read scope.
A folder reference grants no additional access. Grida refuses attachments of its
private folders, folders containing that private data, and aliases to either.
[Understand agent permissions](./permissions.md)

The folder reference stays with a queued or saved message. Reopening the chat
shows it without inspecting the folder or sending another model request.
The agent sees the current contents when it uses a permitted tool; a reference
is not a saved copy, so moving or deleting the folder can make it unavailable.
If your installed Desktop build cannot accept folder references, the drop
shows an update message and keeps the draft and current attachment.

## Work with an SVG selection

Open an SVG or a deck in Desktop, then select objects or points on a path in
the editable view. On a freeform board, click an SVG pin to select the whole
SVG and its placement. Send an **Act** message that refers to the selection.
The chip above the composer names the selected layer, such as **Group** or
**Rectangle**, or previews the selected text. Select **×** on the chip to clear
the selection. The sent message shows a **Selection** marker.

The agent can inspect the selected objects or path points in the live editor.
Opacity edits apply to the selected objects in one Undo step. Use **Save** in
the editor to write the change to disk.

For a board pin, ask “Which SVG is selected?” or “Where is this pin on the
board?” Chat can inspect the file and placement, including which pin you
selected when several use the same file. Open the source SVG to select and
edit its contents.

A queued message keeps the selection you sent. Switching tabs, slides, or
pins, or changing the captured content or placement, can make that capture
stale. Select the target again and send a new message. **Plan** messages omit
the selection.

## Edit selected text in an SVG or slide

Select one plain text element and send an **Act** message such as “Make this
heading shorter.” The agent uses the SVG selection attached to that message
to read and replace the text. The change appears in the editor and can be
undone there. Use **Save** to write it to disk. If another program has changed
the file, the save dialog handles the conflict.

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
