---
id: TC-DESKTOP-MEDIA-002
title: Transparent image intent survives a provider disconnect
module: desktop
area: media
tags: [image-generation, transparency, provider-readiness]
status: untested
severity: high
date: 2026-09-09
updated: 2026-09-09
automatable: false
covered_by:
  - editor/scaffolds/desktop/shared/media-model-availability.test.ts
---

## Behavior

An explicitly selected transparent background remains selected when its
connected provider disappears. Returning from Settings refreshes provider
readiness and blocks generation until a verified transparent route is
available again. An ordinary route must not silently replace the requested
transparent output. Reconnecting the provider restores readiness without
requiring the user to reselect transparency.

## Steps

1. Use Grida Desktop 0.0.22 or newer with fal and OpenRouter keys connected.
   Open Images and select GPT Image 2.
2. Open the settings menu beside the prompt and check **Transparent
   background**. Enter a prompt but do not submit it.
3. Open Desktop Settings and disconnect fal, leaving OpenRouter connected.
   Return focus to Images and allow the provider readiness check to finish.
4. Expected: **Transparent background** remains checked, the submit button is
   disabled, and the page asks for a fal key for transparent backgrounds.
   The remaining ordinary provider must not make this request executable.
5. Reconnect fal in Desktop Settings and return focus to Images.
6. Expected: **Transparent background** remains checked, the submit button
   becomes enabled, and the missing-provider message disappears.

## Notes

Do not submit a generation during this case; key presence and control state
are enough to verify the behavior. Automated tests cover provider eligibility
and stale refresh results; this case covers the real cross-window interaction
and preservation of the user's checked setting.
