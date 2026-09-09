---
id: TC-DESKTOP-MEDIA-003
title: Generated image previews keep long prompts inside the window
module: desktop
area: media
tags: [image-generation, preview, responsive, clipboard]
status: untested
severity: high
date: 2026-09-09
updated: 2026-09-09
automatable: false
covered_by: []
---

## Behavior

Opening a generated image keeps the entire image fitted inside the Desktop
window. The image and its prompt share a bounded dialog, so the length of the
prompt cannot push the image or close button beyond the viewport. The prompt
initially shows at most three lines. Expanding it exposes the full text in a
bounded scroll area while leaving the image visible. Line breaks are preserved,
and long unbroken text wraps within the dialog. Copying always copies the full
original prompt, including when its preview is collapsed.

## Steps

1. Open Desktop → Tools → Images. Use an existing generated tile or a mocked
   generation response containing a local test image, so this check needs no
   paid generation.
2. Open a tile with a prompt of at least 10,000 characters and multiple paragraphs.
3. Expected: the whole image fits in the preview, the close button is visible,
   and the prompt shows at most three lines.
4. Click **Show full prompt**, focus the prompt area with the keyboard, and
   scroll through to the final paragraph.
5. Expected: every paragraph is reachable, line breaks remain intact, and the
   image and dialog controls remain visible while only the prompt scrolls.
6. Click **Copy prompt** and paste into a plain-text field. Compare with the
   original prompt. Repeat after clicking **Show less**.
7. Expected: both copies contain the complete original text. A failed clipboard
   write offers **Retry copy** instead of reporting success.
8. Repeat with a 10,000-character unbroken word, a short one-line prompt, and
   portrait and landscape images. Resize the window to 800 × 600 and 640 × 480;
   also inspect a 360 × 640 viewport.
9. Expected: no horizontal overflow or cropping of the fitted image. Expanding
   the prompt never moves the dialog beyond the viewport.
10. Close using **Escape**, reopen, and then close using the close button.
11. Expected: both dismissal methods work, and reopening starts with the prompt
    collapsed and fresh clipboard feedback.
