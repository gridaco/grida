---
id: TC-DESKTOP-MEDIA-004
title: Tripo UI requires an explicitly compatible native host
module: desktop
area: media
tags: [tripo, desktop-bridge, compatibility]
status: untested
severity: high
date: 2026-09-11
updated: 2026-09-11
automatable: false
covered_by:
  - editor/lib/desktop/bridge.test.ts
  - editor/scaffolds/desktop/tools/media-tool-registry.test.ts
---

## Behavior

The hosted renderer can update independently of installed Desktop binaries.
Tripo key configuration and model generation appear only when the native host
advertises the Tripo media capability and exposes the matching generation
method. Existing fal 3D tools remain available on older hosts.

## Steps

1. Load the current renderer in an older Desktop build without the Tripo media
   capability. Settings must omit Tripo keys and models, and Tools must omit
   **Model generation**. The existing **3D model** tool still lists Hunyuan
   and TRELLIS.
2. Open `/desktop/tools?tool=model-generation&model=tripo%2Fp2` directly in
   that older build. An update notice replaces the generation form; no Tripo
   key check or generation request is sent.
3. Repeat with a test host that advertises the capability but lacks the method,
   and one that exposes the method without the capability. Both stay gated.
4. Use a compatible native build. Tripo appears in Settings and the three
   model links open the correct model within **Model generation**.
5. Remove the Tripo key and reopen the feature. The setup link points to the
   Tripo row in Settings and Generate is disabled. Connect the key and return;
   the feature becomes usable without requiring a fal key. Saving or removing
   the key also updates the three models' readiness labels in Settings without
   reloading the page.
6. Keep Model generation open while connecting or removing the key in a
   separate Settings window. Return to the generator; Generate must reflect
   the current connection without a reload. If a connection check fails
   temporarily, returning after recovery must clear that connection notice
   without clearing an earlier generation error or its accepted task ID.
