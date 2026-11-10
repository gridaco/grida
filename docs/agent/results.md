---
title: Inspect and save results
description: Reopen retained chat and media results and save a copy to your computer.
keywords: [agent, Desktop, media, results, save]
format: md
---

# Inspect and save results

In native Desktop chat, open **Turn summary** to inspect the latest finished
turn’s recorded work. Supported image profiles can retain a PNG crop in the
chat. Open **Preview cropped PNG** and choose **Save PNG as…** to save it to a
new file. You can retry while the crop is available. A later crop of the same
upload can replace the working copy. Save the version you want to keep as a
separate file. [Read a turn summary](./clients.md#read-a-turn-summary)

If the summary details are unavailable, the chat keeps the recorded turn
status and transcript. Choose **Retry summary** to read the details for
that turn again.

## Generate an image from native chat

In a native workbench with a supported saved OpenRouter or Vercel AI Gateway
connection, use **Act** and describe the image you want. The tool generates
one image from text and can honor an explicit background where the connection
supports it. The selected connection uses your saved provider key for the
request.

On the reviewed OpenRouter image connection, you can ask the agent to use a
Library reference. Choose one image when prompted. The generator receives the
PNG from that choice in the same turn. [Choose a reference](./clients.md#choose-a-reference-the-agent-asks-for)

Check **Turn summary** for the result. Desktop keeps a retained image in
**Tools → Recents**. If the provider generated the image and Desktop could
not retain it, the summary explains what happened and the turn ends without
another generation.

## See an artifact while work continues

In a native workspace chat with live presentation, ask the agent to open
an existing artifact. For example, “Open the poster when the first draft
is ready.” The editor can open the artifact while the agent continues
working. Switching tabs yourself takes precedence over a pending request.
The turn summary can show an unconfirmed tool result. Check the editor tab
to see what opened.

## Save a copy from Tools

1. Generate a result in **Tools**. When Desktop retains it, the result appears
   in **Recents**.
2. Select the result in **Recents**, then choose **Save a copy** and select a
   new file on your computer.
3. If saving fails, reopen the same recent item and choose another filename
   or destination. This copies the saved result, including after you reopen
   Desktop.

If a generation result only appears in its current preview, download it
there before leaving the tool. The preview can show output even when Desktop
could not add it to **Recents**.
