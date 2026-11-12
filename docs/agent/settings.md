---
title: Change agent settings
description: Inspect the context limit, ask the agent to change it, and see when changes take effect.
keywords: [agent settings, context limit, configuration, Grida Desktop]
format: md
---

# Change agent settings

Open **Workspace settings…** from the chat options menu in a native Desktop workspace chat to see the
default for new messages. The limit controls how much material the agent
can send to the model as input. The current connection determines whether
you can set a custom token limit.

## Ask the agent to change a setting

1. Remove the **Plan** badge, open **Workspace settings…**, and enable **Review settings permission on next Act send**.
2. Ask for a specific change, such as “Set the workspace context limit to
   12,000 tokens for future messages.” Approve the request when Desktop asks.
3. Open **Workspace settings…** again to check the reported default.

The permission applies to that message and covers the context limit. The
agent can explain what is active and what the current task already captured.
If the connection cannot count requests exactly, Desktop can still show the
current limit and can return an existing valid override to **Automatic**.
[Set the context input limit](./clients.md#set-the-context-input-limit)

## Check when a change applies

New defaults apply when Grida accepts a message. Active, paused, and
queued work keep the values they already captured. To replace a queued
settings request, withdraw it and send a new request for review.

Source-built clients can inspect and change the same setting. The reference
covers supported values, scope, and how to reload a manually edited file.
[Agent configuration reference](../reference/agent-configuration.md)
