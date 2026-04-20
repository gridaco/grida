---
title: How to get a shareable Figma design link
description: Copy a Figma link to a frame or file so you can share it or use it in Grida workflows.
keywords:
  - figma
  - share link
  - design link
  - grida
format: md
doc_tasks:
  - update
---

# How to get a shareable Figma design link

## Copy a link to a frame

1. Open the Figma file and navigate to the frame you want to share.
2. Right-click the frame.
3. Open **Copy/Paste as**.
4. Select **Copy link**.

You now have a direct link to that frame. You can share it with collaborators or use it as input in Grida workflows.

## Copy a link to the whole file

1. Open the Figma file.
2. Click **Share** in the top-right corner.
3. Click **Copy link**.

The copied URL may include a `node-id` query parameter, for example:

```txt
https://www.figma.com/file/XXXXXXX/example-file?node-id=0%3A1
```

If you want a link to the whole file instead of a specific node, remove the `?node-id=...` portion so the URL looks like:

```txt
https://www.figma.com/file/XXXXXXX/example-file
```
