---
id: TC-DESKTOP-CANVAS-002
title: Switch slides without blanking the canvas or toolbar
module: desktop
area: canvas
tags: [deck, navigation, camera, toolbar]
status: untested
severity: medium
date: 2026-11-21
updated: 2026-11-21
automatable: true
covered_by: []
---

## Behavior

While the next slide loads, the deck keeps the outgoing frame and floating
toolbar visible. The toolbar keeps its appearance while slide commands pause.
The destination appears at its fitted size on the first frame. When several
slide requests are pending, the last request determines the slide that opens.

## Steps

1. Open a Desktop deck with at least three slides. Include a slide with a large
   local image and use different slide dimensions so a framing change is easy
   to see.
2. On the first slide, select an object and click the thumbnail of the slide
   with the large image. Verify the floating toolbar stays visible at its usual
   opacity and the outgoing slide remains in view until the new slide can be
   shown.
3. Verify the destination appears once, at its final size. Select one of its
   objects and verify the Layers pane and composer identify that selection.
4. Repeat with quick Up and Down key presses while the slide list has focus.
   Verify the final requested slide remains open after slower reads finish.
5. Repeat in a dedicated deck window.
