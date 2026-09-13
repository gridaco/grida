---
id: TC-DESKTOP-MEDIA-007
title: Tripo model generation preserves named views and durable results
module: desktop
area: media
tags: [tripo, model-generation, multiview, media-library]
status: verified
severity: high
date: 2026-09-11
updated: 2026-09-12
automatable: false
covered_by:
  - editor/scaffolds/desktop/3d-gen/model-generation-form.test.ts
  - packages/grida-ai-agent/src/http/routes/model-generation.test.ts
---

## Behavior

Model generation presents each Tripo model once, with text, image, and
multiview inputs inside that feature. Multiview slots retain their named
front, left, back, and right positions. A generated GLB appears in the
existing local viewer and, when the host saves it, in Recents.

## Steps

1. Use a compatible Desktop build with a local media store and an available
   Tripo funding source. Open
   **3D → Generate** in Tools, then select a Tripo model
   from the bottom composer. The preview stays wide, with input-mode tabs in
   the header and advanced controls hidden behind **Generation options**.
2. Select H3.1, P1, and P2 Preview in turn. Each appears once. H3.1 offers
   geometry quality under **Generation options**; P1/P2 omit it. P2's preview
   label remains visible. Switching Tripo models preserves the prompt.
3. Select **Multiview** and add the front view only. Generate. An inline
   message asks for another view and no provider task starts.
4. Add the right view, leaving left/back empty. Confirm the thumbnail is in
   the right slot. Remove and replace it; its filename and thumbnail update.
5. Open **Generation options** and turn texture off. PBR and texture-quality controls disappear and the
   displayed credit estimate decreases. Set a valid face limit and seed.
6. With an approved live-test budget, generate once and wait for the result.
7. After success, rotate the GLB preview, download it, use **Show in folder**,
   and reopen its Recents entry. Confirm they refer to the same saved model.
8. Narrow the window. Inputs, options, and the generation button remain
   reachable without horizontal overflow.

## Notes

Text, single-image, named-view validation, option omission, and byte limits
have unit coverage. Live generation spends Tripo API credits; use the
approved test budget and avoid retrying an uncertain paid submission.

Verified on 2026-09-11 with macOS Desktop 0.0.24 and local insiders auth:
live H3.1 text and front/right multiview generation, rotation, download,
native reveal, Recents, reload, and cold restart. Downloaded and saved bytes matched.
All nine model/input combinations also passed live SDK generation. Synthetic
browser checks covered model-specific controls and narrow layouts.

Verified the revised composer locally on 2026-09-12 in Desktop using a previously
generated GLB, including narrow layouts without additional provider charges.

Funding selection is covered by [TC-DESKTOP-MEDIA-008](./desktop-media-tripo-funding.md).
Pending requests and failure recovery are covered by
[TC-DESKTOP-MEDIA-009](./desktop-media-tripo-failure-recovery.md).
This case was renumbered from TC-DESKTOP-MEDIA-003 to avoid colliding with the
existing image-preview test.
