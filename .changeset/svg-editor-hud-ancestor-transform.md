---
"@grida/svg-editor": patch
---

Fix HUD selection chrome double-scaling when the editor is embedded inside a
CSS-transformed ancestor (#892).

The HUD overlay canvas is a child of the editor container, so an ancestor
`transform: scale(z)` scaled it a second time on top of chrome positions already
projected to screen px via `getScreenCTM()` — handles and the size badge drifted
toward the top-left and shrank by ~z². `sync_canvas_size` now counter-scales the
canvas by `1/z` (derived as transformed-box ÷ layout-box) so its drawing space
stays 1:1 with screen px. Identity at 1:1, with a sub-pixel snap so a
fractional-width container (flex/percentage panes) does not get a spurious
counter-scale that would blur the otherwise pixel-sharp chrome.

The pixel grid is drawn in the camera frame (not the `getScreenCTM` screen-px
frame the chrome uses), so the ancestor scale is folded back into its transform
to keep it aligned with content on the counter-scaled canvas.
