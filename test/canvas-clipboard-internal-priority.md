---
id: TC-CANVAS-CLIPBOARD-001
title: Grida Clipboard Must Take Priority Over External Clipboard Payloads
module: canvas
area: clipboard
tags: [clipboard, copy-paste, priority, external-payload, trust]
status: verified
severity: critical
date: 2025-12-24
updated: 2025-12-24
automatable: false
covered_by: []
---

## Behavior

Grida's internal clipboard format must take priority over external clipboard payloads. Copy/paste is a core trust primitive: users expect the most recent copy action inside Grida to deterministically control what "paste" does, regardless of what was previously copied in other tools.

The OS/browser clipboard is a multi-format, potentially multi-item channel. External tools may place opaque `text/html` payloads with tool-specific markers that can linger, be reordered, or be surfaced unexpectedly. Without explicit priority, Grida's internal copy/paste can be "poisoned" by stale external payloads, causing surprising pastes and data loss.

## Steps

1. Copy a node inside Grida (Cmd+C)
2. Switch to an external app and copy something (e.g. formatted HTML from a browser)
3. Switch back to Grida, do NOT copy anything new inside Grida
4. Paste (Cmd+V)
5. Expected: the external content is pasted (Grida clipboard is stale)
6. Now copy a node inside Grida again (Cmd+C)
7. Paste (Cmd+V)
8. Expected: the Grida node is pasted, not the external content

## Notes

This assertion exists to keep the priority invariant documented and manually verifiable during refactors of clipboard encoding/decoding and paste routing.
