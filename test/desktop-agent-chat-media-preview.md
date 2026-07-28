---
id: TC-DESKTOP-AGENT-CHAT-007
title: Inspect and save a chat image in the fullscreen preview
module: desktop
area: agent-chat
tags: [agent-chat, image, preview, zoom, pan, clipboard, download]
status: verified
severity: medium
date: 2026-07-28
updated: 2026-07-28
automatable: false
covered_by: []
---

## Behavior

Clicking an image in the agent transcript opens it over a dark translucent
backdrop for close inspection. The image fits initially, zooms around the
pointer, and pans once enlarged. Image gestures must not dismiss the preview;
clicking the empty backdrop, pressing Escape, or using Close must dismiss it.
Copy and Download act on the original image bytes rather than the transformed
viewport.

## Steps

1. Open a Desktop workspace with a viewed or generated image in its agent
   transcript, then click the image.
   - Expected: the image opens fitted in a fullscreen dark translucent preview
     with Copy, Download, and Close actions.
2. Pinch or hold **⌘** while scrolling over the image, then double-click it.
   - Expected: zoom stays anchored near the pointer; double-click toggles
     between fitted and magnified views.
3. While magnified, drag the image and use two-finger scrolling.
   - Expected: the image pans without dismissing the preview.
4. Click directly on the image.
   - Expected: the preview remains open.
5. Click an empty part of the backdrop.
   - Expected: the preview closes.
6. Reopen it, choose Copy, and paste into an image-aware app.
   - Expected: the original image is pasted, and the Copy action briefly
     confirms success.
7. Choose Download and save the file.
   - Expected: the original image downloads with an image extension and opens
     normally.
8. Reopen it and verify both Escape and Close.
   - Expected: either action closes the preview.

## Notes

- The pan/zoom surface is shared with the Files-tab image viewer.
- Remote reference images can only be copied or downloaded when their server
  allows the browser to read the image bytes.
