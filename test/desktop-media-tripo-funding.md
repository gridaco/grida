---
id: TC-DESKTOP-MEDIA-008
title: Tripo funding selection preserves work and uses only the selected account
module: desktop
area: media
tags: [tripo, model-generation, funding, grida-gateway, byok]
status: untested
severity: high
date: 2026-09-12
updated: 2026-09-12
automatable: false
covered_by:
  - editor/lib/desktop/gg-tripo.test.ts
---

## Behavior

Selecting Grida credits or a Tripo key changes which account authorizes model
generation. The footer identifies that choice and provides its connection action.
Changing funding preserves the current prompt, named views, options and result;
availability depends only on the selected source. Funding cannot change during
an active request.

## Steps

1. Use a compatible Desktop build with a local media store. Sign in to an
   organization with Grida credits, leave the Tripo key unset, and open
   **3D → Generate**. Select a Tripo model. The global footer shows
   **Grida credits** and the selected organization.
2. Prepare a prompt, named reference views, custom generation options and a
   previous result. Open **Generation options → Pay with**. Both Grida credits
   and your Tripo key are offered.
3. Select the key path without a key. Generation is disabled and the footer
   links to Tripo Settings. Connect the key, return, and verify readiness.
4. Switch back to Grida credits and remove the Tripo key. Generation remains
   available. Across both switches, confirm the prompt, views, options and
   existing result are unchanged.
5. Start one synthetic delayed request. Funding controls are disabled until
   it settles and the selected source remains visible in the footer.
6. With Grida credits selected, sign out. The footer offers sign-in; it does
   not select BYOK automatically.

## Notes

These checks were extracted from the previously verified generation case;
the standalone case has not been rerun. The renderer funding controls were
verified on 2026-09-12 with an isolated Desktop bridge.

The corresponding GG execution path was verified on 2026-09-12 through the real
token verifier, HTTP binding, SDK, Tripo provider and sandbox billing seam. The
client had no provider credentials and submitted exactly once. The resulting
GLB contained one mesh and 520 vertices; Tripo reported 10 credits ($0.10).
Metronome accepted the 100-mill usage event, and both the cached and external
credit balances decreased from 1,000 to 990 cents before cleanup. All created
local and sandbox fixtures were cleaned up. This provider/billing proof used
the SDK over local HTTP, separately from the renderer checks.
