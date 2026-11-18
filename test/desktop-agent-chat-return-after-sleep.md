---
id: TC-DESKTOP-AGENT-CHAT-035
title: Return to the same chat after the device sleeps
module: desktop
area: agent-chat
tags: [chat, recovery, progress, history]
status: untested
severity: high
date: 2026-11-19
updated: 2026-11-19
automatable: partial
covered_by:
  [
    editor/scaffolds/desktop/workbench/native-chat-recovery.browser.tsx,
    desktop/src/main/native-chat-store.test.ts,
  ]
---

## Behavior

Returning to a Desktop chat after device sleep keeps its history and draft.
If the observation connection is lost, the pane tries to restore it. If that
attempt ends, **Reconnect** restores the same chat when it becomes reachable.
Checking the chat never repeats a model request, a tool action, or a held queue.
The next action reflects the state recovered from the agent.

## Steps

1. In a test workspace, use a scripted local provider that records requests
   and can hold a response after text begins streaming. Open a chat, send a
   message, and type a follow-up without sending it.
2. Put the device to sleep with the chat visible. Wake it and return to Desktop.
   Record the operating system and whether the original native process survived.
3. If the chat reports that it is disconnected, choose **Reconnect**. Check that
   the same chat, its saved messages and the draft are still present. The
   provider should still have one request for the original message.
4. If the original request is still running, release the response and verify
   its settlement appears. If the turn is interrupted, review the partial work
   and choose **End interrupted turn**. Confirm that ending it adds no request.
5. Send the saved follow-up. If the queue is held, choose **Resume queue**.
   Confirm that the reply succeeds in the original chat and that the provider
   records one new request.
