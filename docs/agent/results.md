---
title: Inspect and save results
description: Read what a turn did, save images the agent produced, and keep copies of generated results.
keywords: [agent, Desktop, media, results, save]
format: md
---

# Inspect and save results

Turn activity and image previews are available in Grida Desktop on macOS and
Linux. Headless and ACP clients read the same record through the
[turn summary](./clients.md#use-durable-client-operations).

## Read what a turn did

While a turn runs, its commentary and actions appear as they happen. When it
finishes, they fold under a header such as **Worked for 1m 12s**, and the
answer stays visible below it. Select the header to see the work in order.
Select a line such as “Read files, ran commands” to list each action and its
outcome. A turn that only answered, without tools or commentary, shows just
its answer.

A turn you stopped shows **You stopped** and keeps its partial work in view. A
failed turn shows **Failed after …**. A turn whose outcome Grida could not
confirm shows **Worked for … · result uncertain**; review its partial work
before asking again, because an action may already have happened. Opening a
turn only shows what was recorded; it never repeats work or asks the model
again.

## Save a cropped image

When the agent crops an image you attached, the cropped PNG appears below its
answer while that is the latest finished turn. Choose **Preview cropped PNG
(W × H)** to inspect it, then **Save PNG as…** to save it to a new file. If
saving fails, choose **Retry save**. Existing files at the destination are
never replaced. A later crop of the same image can replace the earlier one, so
save each version you want to keep.

## Generate an image from chat

With a saved OpenRouter or Vercel AI Gateway key, describe the image you want
in a Desktop project chat, without the **Plan** badge. The agent generates one
image from text and can honor an explicit background where the provider
supports it. The request uses your saved provider key.

On an OpenRouter model that takes images, you can ask the agent to use a
Library reference. The agent pauses its turn and asks for one: choose
**Choose reference** to see the suggested search, refine it if needed, select
one image and choose **Use reference**. The generator receives it in the same
turn, and your composer draft stays separate. Choose **Skip** to continue
without an image; closing the picker leaves the request open. If Grida cannot
confirm your answer, open it again and choose **Retry answer**.

On such a model, you can also attach one PNG and ask the agent to generate an
image using it. Desktop asks before sending the attachment to OpenRouter for
generation. If you cancel, nothing is sent to the image provider; attach the
PNG again to use it in a later turn.

You can also ask the agent to use a PNG in the workspace, for example
“Generate an image using `assets/reference.png`.” Use a regular PNG of at most
256 KiB. Desktop shows the source path before sending the PNG. If the file
changes while the task is paused, continuing uses the version captured
earlier; ask again to use the updated file.

The result appears below the turn's answer while that is the latest finished
turn; once another turn starts, it leaves the chat. Desktop keeps a retained
image in **Tools → Recents**, where you can find it later. If the provider
generated the image and Desktop could not keep it, the turn's answer explains
what happened and no second image is generated.

The agent cannot turn an SVG or HTML file it made into an image. Open the file
in its editor to see it.

### Place a generated image in the workspace

On Apple silicon Macs where Desktop offers it, keep the workbench open and in
focus. Ask the agent to place a generated image at a path such as
`assets/banner.png`. Choose an existing folder and a filename extension that
matches the image. Desktop asks you to confirm the full destination before it
writes.

If a different file is already there, Desktop leaves it intact. You can ask
the same chat to retry placement or choose another destination. The retry
uses the kept image, including after you reopen the chat.

## See an artifact while work continues

In a Desktop project chat, ask the agent to open an existing artifact, for
example “Open the poster when the first draft is ready.” The editor can open
the artifact while the agent continues working. Switching tabs yourself takes
precedence over a pending request. If the activity does not confirm the tab
opened, check the editor.

## Save a copy from Tools

1. Generate a result in **Tools**. When Desktop keeps it, the result appears
   in **Recents**.
2. Select the result in **Recents**, then choose **Save a copy** and select a
   new file on your computer.
3. If saving fails, reopen the same recent item and choose another filename
   or destination. This copies the saved result, including after you reopen
   Desktop.

If a generation result only appears in its current preview, download it there
before leaving the tool. The preview can show output even when Desktop could
not add it to **Recents**.
