---
id: TC-DESKTOP-MEDIA-010
title: Hosted image and video readiness matches the installed Desktop runtime
module: desktop
area: media
tags: [image-generation, video-generation, grida-gateway, compatibility]
status: untested
severity: high
date: 2026-09-17
updated: 2026-09-17
automatable: false
covered_by:
  - editor/scaffolds/desktop/shared/media-model-availability.test.ts
  - editor/app/desktop/settings/_components/media-model-readiness.test.ts
---

## Behavior

The hosted renderer can be newer than the installed native app. Model pickers,
generation submission, and Settings readiness must agree about which routes
the installed runtime can execute. A refreshed catalogue or active GG session
must not unlock an unsupported route. Updating the native client enables the
new fal GG operations without changing explicit model or BYOK preferences.

## Steps

1. Use local Supabase and insiders auth. Load the current hosted renderer in
   Desktop 0.0.24 with an active GG session and no connected provider keys.
   Use a controlled local provider response for submission checks; these steps
   do not require a paid generation.
2. Open Video. Verify Gemini Omni 1.1 Flash and Seedance 2.0/2.5 are disabled
   with an update message. Open a direct model link for each; submit stays
   disabled and no generation request is sent.
3. Verify an existing Vercel-compatible model such as Veo 3.1 remains available.
   Check Settings → Media models: its readiness agrees with the playground,
   while the newly gated models do not claim to be ready.
4. Relaunch with Desktop 0.0.25. Verify Gemini Omni 1.1 Flash and Seedance
   2.0/2.5 become available with the same GG session and no BYOK key.
5. Open Image. Verify an existing image selection remains selected, and its
   supported transparency and quality controls remain usable. Compare Settings
   readiness with the image picker.
6. Disconnect GG and connect only a fal BYOK key. Verify supported text-to-video
   routes remain available in Desktop 0.0.25. Remove the key from Settings,
   then return focus to the playground: readiness must refresh and submission
   must become unavailable.
7. Repeat a provider change while a readiness request is pending. A late response
   must not restore the removed key or re-enable generation.
8. Cold-reload each playground. Verify the temporary checking state settles,
   unavailable model labels remain readable, and keyboard navigation cannot
   select a disabled model.

## Notes

Hosted image and video generation still accept text prompts only. Explicit
BYOK image-to-video operations are a separate route; a starting-image endpoint
must never be considered a text-to-video route merely because its key exists.
