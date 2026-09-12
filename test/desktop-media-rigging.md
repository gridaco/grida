---
id: TC-DESKTOP-MEDIA-005
title: Rigging keeps the source model and exposes an inspectable skeleton
module: desktop
area: media
tags: [rigging, tripo, media-library, sidebar]
status: passed
severity: high
date: 2026-09-12
updated: 2026-09-12
automatable: false
---

## Behavior

Rigging is an operation on an existing model, separate from mesh generation.
The 3D sidebar group links to Generate and Rigging as distinct routes. A user
can inspect a local GLB before checking eligibility, explicitly start rigging,
and compare the source with the rigged result. Failed checks or operations
preserve the source and any previous successful output.

## Steps

1. Open Desktop Tools. Expand **3D** and navigate between **Generate** and
   **Rigging**. Each has its own URL and selected submenu entry. Existing
   generation deep links still open Generate.
2. On Rigging, open an unrigged humanoid GLB. Rotate it locally. The file is
   not submitted to a provider until **Check compatibility** is selected.
3. Sign in to an organization with Grida credits, leaving the Tripo key unset.
   Confirm the global footer shows **Grida credits** and the organization.
   Check compatibility. Confirm the detected
   body type and compatible rigging model appear. This does not start rigging.
4. Open a non-riggable model and check it. The negative result explains that
   rigging cannot proceed, and no paid rigging request starts.
5. Open the humanoid again, check it, and choose a bone naming convention.
   With an approved live-test budget, select **Rig model** once. File changes
   and tool navigation are disabled while the request runs.
6. After success, switch between **Original** and **Rigged**. The original
   remains unchanged. Open **Viewport settings** at the top right, toggle
   **Show skeleton**, and confirm joints overlay the rigged model. The popover
   reports a nonzero joint count and skinned mesh. Close it with Escape.
7. Download the rigged model, reveal it in its folder, and open its Recents
   entry. Confirm the saved and downloaded GLBs refer to the same result.
8. Open **Rigging options** in the header to rig again using the original
   source. Close the popover while the request runs; progress remains visible
   and source/navigation controls stay locked. Simulate a provider failure
   after an accepted task. The error and task ID remain visible with the
   popover closed, and the previous source/result stay usable. The UI must
   not automatically retry a paid request.
9. Open an invalid, empty, or oversized file. Confirm admission fails before
   a provider request. Narrow the window and verify all controls remain
   reachable without horizontal overflow.
10. Use an older Desktop bridge without rigging. The Rigging route explains
    that an update is required; generation remains usable.
11. In **Rigging options**, change **Pay with** to **Your Tripo API key**.
    Without a key, the global footer offers connection through Settings.
    Connect the key and verify readiness updates on returning to the tool.
    Switch back to **Grida credits** and remove the key: eligibility and rigging
    remain available through the selected organization. Funding controls stay
    locked while either operation runs.
12. With no organization credit, an attempted rig shows the actionable credit
    error and preserves the source and previous result. It does not switch to
    the connected Tripo key. Sign out: the footer offers Grida sign-in. On a
    host supporting BYOK rigging but not funded rigging, only the key path is
    offered; no unsupported GG request is sent.

## Notes

The live-test assertion includes GLB skins, valid joint references, and
JOINTS_0/WEIGHTS_0 attributes. A successful download alone is insufficient.
Source files and live credentials stay outside the repository.

Verified on 2026-09-12 with a native Desktop BYOK humanoid rig and isolated
browser checks for failure recovery, negative eligibility, old-host gating,
and an 860 × 800 window. The live result contained 23 joints and one skinned
mesh; changing an arm bone deformed 1,228 vertices with finite positions.
The downloaded and persisted GLBs matched by SHA-256. Compatibility checks
and paid rigging remained separate actions throughout verification.
The built CLI also completed a v2.5 quadruped check and rig: one skin,
21 joints, 7,131 weighted vertices, and matching output and receipt hashes.

The Grida-credit path was verified separately on 2026-09-12 through the real
GG token verifier, HTTP binding, SDK, Tripo provider, and sandbox billing seam.
A client with no provider credentials completed one free compatibility check
and one humanoid rig costing $0.25. The original SHA-256 stayed unchanged;
the result contained one skin and 23 joints. The ephemeral local organization's
cached credit balance decreased from 1,000 to 975 cents, and both real
Metronome ingest requests returned HTTP 200. The harness's event-payload
observer expected the wrong JSON shape and failed its final assertion; the
external live balance was not confirmed before fixture cleanup. No paid
request was repeated. All created local and sandbox fixtures were cleaned up.

Keyless funding selection, busy locks, accepted-task failure retention,
old-host gating, and the viewport toolbar/global footer layout were checked
with an isolated mocked Desktop bridge at 860 × 800 and 640 × 720. Those
renderer checks did not call a provider; the funded live proof above used
the public SDK over local HTTP rather than the Electron UI.
