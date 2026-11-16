---
id: TC-DESKTOP-AGENT-CHAT-030
title: Code snippet copy control stays inside its header
module: desktop
area: agent-chat
tags: [chat, markdown, clipboard, layout]
status: untested
severity: low
date: 2026-11-15
updated: 2026-11-15
automatable: true
covered_by: []
---

## Behavior

A fenced code snippet's Copy button is fully visible inside its compact
header. The language label and copy control share the header without clipping
against the snippet's rounded border, including for a one-line snippet.

## Steps

1. Open a Desktop chat containing a one-line fenced text snippet and a
   multiline code snippet.
2. Confirm each Copy icon is fully visible, vertically centered beside the
   language label, with space between it and the top and right borders.
3. Copy each snippet and paste into an unsent draft. Confirm the code is
   copied without the language label or line numbers, then clear the draft.
4. Narrow the chat pane and scroll the transcript. Confirm the Copy control
   stays inside its snippet and remains usable.
