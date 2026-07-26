---
id: TC-DESKTOP-AGENT-CHAT-006
title: A follow-up queues while an agent approval is pending
module: desktop
area: agent-chat
tags: [agent-chat, approval, queue, composer, session-status]
status: untested
severity: high
date: 2026-07-26
updated: 2026-07-26
automatable: false
covered_by:
  - editor/lib/agent-chat/turn-queue.test.ts
  - editor/lib/agent-chat/use-turn-queue-controller.test.ts
  - packages/grida-ai-agent/src/runtime/session-scheduler.test.ts
---

## Behavior

A pending approval or question is an incomplete current turn, even though no
model response is streaming. Ordinary text submitted in that state must enter
the durable turn queue; it must not answer, cancel, or run ahead of the pending
interaction. The approval/question remains visible and actionable. Once the
person resolves it and the original turn truly finishes, the queued follow-up
fires exactly once.

Because the queue is text-only, attachments attempted while waiting remain in
the composer instead of being silently discarded.

## Steps

1. Open a workspace in Grida Desktop and set the agent to Accept Edits mode.
2. Ask the agent to make an edit that causes it to request approval for a
   command.
   - Expected: the Allow/Deny bar appears and the round composer control shows
     Send, not Stop.
3. Without choosing Allow or Deny, type a plain-text follow-up and submit it.
   - Expected: the follow-up appears in the queued tray.
   - Expected: the Allow/Deny bar remains visible and actionable.
   - Expected: no `human-input-pending` error banner appears.
4. Choose Allow or Deny.
   - Expected: the original turn resumes and settles normally.
   - Expected: only after that true finish, the queued follow-up moves into the
     transcript and runs exactly once.
5. Repeat through step 2, attach an image or operable file, add text, and try to
   submit while approval is pending.
   - Expected: the composer explains that attachments cannot be queued.
   - Expected: the attachment and text remain in the composer.
6. Open the same session in a second Desktop window. Leave the approval visible
   there, then resolve it in the first window.
   - Expected: the second window removes its stale approval control when the
     authoritative status advances.
   - Expected: a follow-up submitted from either window is shown once, runs
     once, and both windows reconcile to the same transcript and queue.

## Notes

This covers the incident where a direct send received
`409 human-input-pending`, the optimistic user message hid the approval
control, and every later send repeated the same failure. Questions and other
human-input tools share the same admission state and queue policy.
