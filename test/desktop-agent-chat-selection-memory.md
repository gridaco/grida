---
id: TC-DESKTOP-AGENT-CHAT-033
title: Each chat remembers its model and effort without changing other chats
module: desktop
area: agent-chat
tags: [agent-chat, models, effort, draft, history, recovery]
status: untested
severity: high
date: 2026-11-16
updated: 2026-11-16
automatable: partial
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - editor/lib/agent-chat/native-chat-selection-controller.test.ts
  - desktop/src/main/native-chat-selections.test.ts
  - crates/grida-agent/tests/process/selection.rs
---

## Behavior

Each logical chat owns a model connection and effort pair before its first
message. Switching chats or restarting restores that chat's pair without
mutating the next-chat default. An explicit model or effort change saves the
complete resulting pair for the next new chat. Accepted work keeps its own
captured settings. An unavailable choice remains identifiable; it does not
silently borrow another conversation's selection.

## Steps

1. Start two saved chats, A and B, with one completed message each. In A,
   select Model A and Low and leave an unsent draft. In B, choose Model B and
   High and leave another draft. Switch between them and restart Desktop.
   Expected: each restores its own pair and text. Also leave a new chat
   selected without sending its first message, then restart: its pair and
   draft should restore too.
2. From chat A, change only effort to Medium. Create chat C. Expected: C starts
   on Model A + Medium. Reopen B, then create D without changing anything.
   Expected: D also starts on Model A + Medium; opening B changed no default.
3. Start work in A, then change its future pair. Expected: running, queued or
   Goal work keeps its accepted settings. A new request that needs a busy
   shared connection shows its blocker and keeps the draft. Reading another
   chat's selection does not stop the work.
4. Make a saved connection unavailable, then reopen its chat. Expected: the
   requested choice remains visible and sending asks for resolution. If a
   legacy chat's connection cannot be verified, it asks for an explicit choice.
5. Open a fixed-model selected-file or nested-deck window and start a new chat.
   Expected: its fixed model remains available and inherits the last selected
   effort; creating it does not change the ordinary-project default.

## Verification

Deterministic native, Main and controller cases cover their exercised
persistence, selection and retry boundaries. Picker rendering, navigation,
restart and shared-worker interaction remain pending human QA. After the user
finishes, inspect the latest chat read-only to compare captured execution with
the selection shown for future messages.
