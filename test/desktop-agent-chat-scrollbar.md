---
id: TC-DESKTOP-AGENT-CHAT-028
title: Chat scrollbar follows the operating system visibility preference
module: desktop
area: agent-chat
tags: [desktop, chat, scroll, scrollbar]
status: untested
severity: low
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by: []
---

## Behavior

The conversation uses Chromium's native scrollbar so its visibility follows the
operating system preference. On systems with automatic overlay scrollbars, it
appears during scrolling and hides after scrolling stops. Choosing to always
show scrollbars keeps it visible. The transcript's edge fade leaves the native
scrollbar unobscured and does not affect dragging its thumb.

## Steps

1. On macOS, set System Settings > Appearance > Show scroll bars to When
   scrolling. Open a Desktop workspace with enough chat history to scroll.
2. Scroll the conversation, then stop and move the pointer outside its scroll
   edge.
   - Expected: the native scrollbar appears while scrolling and hides after
     the system's normal delay.
3. While the scrollbar is visible, drag its thumb through the transcript.
   - Expected: the transcript scrolls and the edge fade does not obscure the
     scrollbar.
4. Set Show scroll bars to Always, reopening Desktop if the system requires
   it, and return to the same chat.
   - Expected: the native scrollbar stays visible and remains draggable.
5. Repeat in a standalone file window with a scrollable chat.
   - Expected: scrollbar visibility follows the same system preference.

## Notes

Other supported operating systems should retain their own native scrollbar
visibility behavior. Verify macOS with a mouse or trackpad so the configured
overlay behavior is exercised in a real Electron window.
