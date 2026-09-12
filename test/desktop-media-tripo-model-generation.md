---
id: TC-DESKTOP-MEDIA-003
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
existing local viewer and, when the host saves it, in Recents. A previous
successful model stays usable while another request runs or fails.

## Steps

1. Use a compatible Desktop build with a local media store. Sign in to an
   organization with Grida credits, leave the Tripo key unset, and open
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
6. With an approved live-test budget, generate once. Controls and navigation
   remain disabled during the request; the UI returns to an actionable state
   on success or failure without automatically starting a second task.
7. After success, rotate the GLB preview, download it, use **Show in folder**,
   and reopen its Recents entry. Confirm they refer to the same saved model.
8. Generate another model. The previous result remains visible while waiting.
   A failed attempt preserves that previous result and its download action.
   If the host reports an accepted task ID, the inline error includes it so
   the task can be checked in Tripo without submitting a replacement.
9. Narrow the window. Inputs, options, errors, and the generation button remain
   reachable without horizontal overflow.
10. The global footer shows **Grida credits** and the selected organization.
    **Generation options → Pay with** offers Grida credits and your Tripo key.
    Select the key path without a key: generation is disabled and the footer
    links to Tripo Settings. Connect the key, return and verify readiness.
    Switch back to credits and remove the key: generation remains available.
    Switching funding preserves the prompt, views, options and existing result.
11. An insufficient-credit response preserves the composer and result and
    never switches to BYOK. Sign out and confirm the footer offers sign-in.
    Funding changes are disabled while generating. An accepted-task error
    never automatically resubmits, including during token refresh.

## Notes

Text, single-image, named-view validation, option omission, and byte limits
have unit coverage. Live generation spends Tripo API credits; use the
approved test budget and avoid retrying an uncertain paid submission.

Verified on 2026-09-11 with macOS Desktop 0.0.24 and local insiders auth:
live H3.1 text and front/right multiview generation, rotation, download,
native reveal, Recents, reload, and cold restart. Downloaded and saved bytes matched.
All nine model/input combinations also passed live SDK generation. Synthetic
browser checks covered model-specific controls, failures with task IDs,
preservation of previous results, and narrow layouts.

Verified the revised composer locally on 2026-09-12 in Desktop using a previously
generated GLB. Synthetic generation checks covered busy states, failure recovery,
result retention, and narrow layouts without additional provider charges.

Verified GG-funded H3.1 text generation on 2026-09-12 through the real token
verifier, HTTP binding, SDK, Tripo provider and sandbox billing seam. The client
had no provider credentials and submitted exactly once. The resulting GLB
contained one mesh and 520 vertices; Tripo reported 10 credits ($0.10).
Metronome accepted the 100-mill usage event, and both the cached and external
credit balances decreased from 1,000 to 990 cents before cleanup. All created
local and sandbox fixtures were cleaned up. This provider/billing proof used
the SDK over local HTTP; the renderer funding controls were verified separately
with an isolated Desktop bridge.
