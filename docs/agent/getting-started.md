---
title: Start an agent task with files and folders
description: Open a project, attach a PNG, or work with a selected file in private scratch.
keywords: [agent workspace, PNG attachment, project files, Grida Desktop]
format: md
---

# Start an agent task with files and folders

## Work in a project

Open a folder in Grida Desktop and open its chat pane. Name the file you
want the agent to use, or select the relevant material in an attached
editor. Use **Plan** to investigate and **Act** to carry out changes with
the tools and access available to the chat. [Understand agent permissions](./permissions.md)

On a Desktop build with native deck chat, open a `.canvas` bundle in its file
window to start or reopen its chat. Ask about files inside the bundle by name
while you work in the slide editor. A bundle opened from inside a project has
its own saved chats and access to files within that bundle.

## Attach an image

If the connection offers **Add PNG**, select one PNG up to 256 KiB and
describe what you want to do with it. The message and image enter the chat
together. If the connection loses image support before you send, the draft
stays available while you remove or replace the PNG.
[Attach a PNG to a message](./clients.md#attach-a-png-to-a-message)

On a profile with image editing, a crop uses a private working copy.
Open **Turn summary** to inspect and save a result the chat retained.
[Inspect and save results](./results.md)

If the chat offers **Attach file**, select a file up to 256 KiB and ask
the agent to inspect it. For work on project files, open the folder and
name the file in your request. Access follows the chat’s workspace grants.
[Attach a file for inspection](./clients.md#attach-a-file-for-inspection)

## Work without a project

On a Desktop build with native document chat, open an SVG directly to start a
chat for that file. Reopen the SVG and choose its saved chat from the sidebar.
Select plain text in the SVG to [ask the agent to edit it](./clients.md#edit-selected-svg-text).
The chat has no access to the surrounding folder.

On macOS and Linux, a source-built native run can take one explicitly
selected PNG with `--input-png` and keep its work in private scratch.
Omit the workspace and permission profile to work without a project grant.
[Run locally with a PNG](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#run-locally)

Use `--input-file` to inspect a selected file in the same private setting.
The agent can verify the file’s size and digest and read a short text excerpt.
[Inspect a local file headlessly](./clients.md#inspect-a-local-file-headlessly)
