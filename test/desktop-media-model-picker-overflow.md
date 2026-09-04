---
id: TC-DESKTOP-MEDIA-001
title: Compact media model pickers keep long labels inside the composer
module: desktop
area: media
tags: [model-picker, responsive, sound-effects]
status: untested
severity: medium
date: 2026-09-04
updated: 2026-09-04
automatable: false
covered_by: []
---

## Behavior

Compact media model pickers may shrink inside a narrow generation composer.
A long selected model label is truncated within the trigger while the dropdown
chevron remains visible. Text must not overlap the chevron or escape the
composer boundary. The rule belongs to the shared media trigger so all media
tools retain the same responsive behavior.

## Steps

1. Connect the provider needed by SFX and open the SFX tool in Grida Desktop.
2. Select **Eleven Text to Sound v2** and narrow the Desktop window until the
   composer approaches its minimum practical width.
3. Expected: the label truncates inside its model trigger, the chevron stays
   visible, and neither text nor controls overflow the rounded composer.
4. Repeat the narrow-window check on another media tool with a long model
   label.
5. Expected: the same containment and truncation behavior applies without a
   tool-specific layout workaround.
