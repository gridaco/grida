---
id: TC-DESKTOP-MEDIA-009
title: Tripo generation failures preserve work without repeating accepted tasks
module: desktop
area: media
tags: [tripo, model-generation, failure-recovery, task-receipts]
status: untested
severity: high
date: 2026-09-12
updated: 2026-09-12
automatable: false
covered_by:
  - editor/scaffolds/desktop/3d-gen/model-generation-form.test.ts
  - packages/grida-ai-agent/src/http/routes/model-generation.test.ts
---

## Behavior

A pending or failed generation keeps the previous successful model and the
composer intact. After the request settles, the controls become actionable
again. A reported accepted task remains visible and fences automatic retries;
failure never switches the selected funding source.

## Steps

1. Open **3D → Generate** with a Tripo model, populated composer and an existing
   successful result. Use an isolated Desktop bridge to count submissions and
   return delayed success or failure responses without paid provider calls.
2. Submit another generation and hold its response. The previous result remains
   visible. Generation controls and navigation are disabled during the request.
3. Return a failure. The prompt, views, options and previous result remain
   available, including its download action. Controls become actionable and
   no second task starts automatically. Repeat with a successful response;
   controls become actionable and the new result replaces the old one.
4. Return a failure containing an accepted task ID. The inline error includes
   that ID so the task can be checked in Tripo without submitting a replacement.
   Simulate expired GG authority together with an accepted-task error. Token
   refresh must not automatically resubmit that accepted operation.
5. With Grida credits selected, return an insufficient-credit response. The
   composer and previous result remain intact, and funding never switches to
   BYOK. The user can choose a later action explicitly.
6. Narrow the window while the error is visible. Inputs, options, errors and
   the generation button remain reachable without horizontal overflow.

## Notes

These checks were extracted from the previously verified generation case;
the standalone case has not been rerun. Synthetic browser checks covered
failure task IDs and previous-result preservation on 2026-09-11. The revised
composer's busy states, failure recovery, result retention and narrow layouts
were verified on 2026-09-12 without additional provider charges.

Use synthetic failures for recovery testing. Any live generation requires an
approved test budget; never retry an uncertain paid submission automatically.
