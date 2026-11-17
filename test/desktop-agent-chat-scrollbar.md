---
id: TC-DESKTOP-AGENT-CHAT-028
title: Chat scrollbar fades without changing native transcript scrolling
module: desktop
area: agent-chat
tags: [desktop, chat, scroll, scrollbar]
status: untested
severity: low
date: 2026-11-15
updated: 2026-11-17
automatable: false
covered_by:
  - editor/scaffolds/desktop/workbench/conversation-scrollbar.browser.tsx
---

## Behavior

The conversation uses a Radix overlay scrollbar on the same native viewport as
streaming autoscroll. Its transparent track does not gain a background on hover.
The rounded thumb appears during scrolling, remains available while interacting
with it, and fades after scrolling stops. The transcript's edge fade does not
obscure the scrollbar. This behavior is shared by the main chat, subagent
transcripts, and the composer UI demo.

## Steps

1. Open a Desktop workspace with enough chat history to scroll.
2. Scroll the conversation, then stop with the pointer over the transcript.
   - Expected: a slim rounded thumb appears, then fades after about a second.
     Hovering the transcript alone does not reveal a track background.
3. Scroll again and move the pointer onto the thumb, then drag it.
   - Expected: the thumb stays available during interaction, the transcript
     scrolls normally, and the edge fade does not obscure the thumb.
4. While a response streams, stay at the bottom, then scroll upward.
   - Expected: streaming follows the bottom initially, but respects scrolling
     upward. Scroll to bottom restores following the response.
5. Repeat in a subagent transcript and the composer conversation demo.
   - Expected: the same scrollbar appearance and fading behavior.
6. Enable reduced motion and repeat scrolling.
   - Expected: the scrollbar hides without its fade animation.

## Notes

Automated Chromium coverage checks the shared viewport, native scrollbar hiding,
transparent track, animation, eventual hiding, streaming follow, and scrolling
upward. Manual status remains untested for thumb dragging in Electron.
