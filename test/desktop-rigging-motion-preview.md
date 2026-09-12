---
id: TC-DESKTOP-MEDIA-006
title: Rigging motion previews preserve the original pose and follow its skeleton
module: desktop
area: media
tags: [rigging, motion, skeleton, preview]
status: passed
severity: medium
date: 2026-09-12
updated: 2026-09-12
automatable: false
---

## Behavior

A rigged model can be inspected and animated locally, including when reopened
as a source in Rigging. Its skeleton is visible by default with legible bones
and joint markers. Preview motions adapt to a compatible humanoid skeleton;
they never overwrite the user's source, saved result, or downloaded GLB.

## Steps

1. Open a saved humanoid rig in **3D → Rigging** without an API key. The
   skeleton appears, and the bottom **Animation** picker starts at **Rest pose**.
   Only the picker and play/pause control occupy the bottom of the dark
   viewport frame. The API-key connection status and any consumed credits
   remain visible below the frame, outside both popovers. Open the
   small **Viewport settings** button at the top right to inspect the joint
   count and **Show skeleton** switch; closing it leaves the model unobstructed.
2. Select **Samba**, then **Dance**. Each plays its own motion: the mesh
   deforms, the skeleton follows it, and the character stays within the preview.
   Switching back reuses that preset's prepared clip. No provider job is created.
3. Pause each motion. The character holds its exact pose. Play resumes it.
4. Select **Rest pose**. The mesh returns to its original pose. Re-selecting
   either preset reuses its prepared clip. Open **Viewport settings** and toggle the
   skeleton while dancing; the mesh keeps moving and the markers follow when
   re-enabled. Escape closes the popover and returns focus to its trigger.
5. During motion loading, choose the other preset or Rest pose, or replace
   or clear the source. The old load must not start animating the new model
   or overwrite the latest selection/status. A failed preset must not prevent
   another from playing.
6. Reopen a rigged creature. Its skeleton remains inspectable, but the
   humanoid Dance and Samba options are unavailable. An unrigged source has neither
   skeleton nor animation controls before a rigged result is created.
7. With a generated result, play a motion and download the result. Compare
   its bytes with the saved GLB: the preview must not bake animation into it.
   Switch to **Original**. The controls stay inside the frame with disabled
   **Rest pose** and play controls. Switch back to **Rigged**; the selected motion resumes.
   Rig generation settings remain available through **Rigging options** in
   the header, including when reopening a saved rig without an API key.
8. Narrow the window to 860 × 800. Skeleton and playback controls remain
   reachable without horizontal overflow. Leave and re-enter the route;
   there must be no stale animation or WebGL errors.

## Notes

Verified with the existing live 23-joint humanoid and 21-joint creature,
headless browser interaction, and the native Desktop renderer. Paused frames
matched exactly; returning to Rest pose restored the original rendered frame.
Motion preview required no key, provider calls, or additional credits.
The bundled Dance_Loop by Quaternius is CC0. Samba Dancing comes from
Mixamo through the Three.js example and retains Adobe's terms; it is an
integrated preview asset, not a CC0 animation. Viewport settings distinguish
both sources. Provenance and license notices are recorded in
`editor/public/assets/motions/README.md`.
