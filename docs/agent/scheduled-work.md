---
title: Schedule a follow-up
description: Let a task check back once at a chosen time in native Desktop chat.
keywords: [agent, check-in, follow-up, schedule]
format: md
---

# Schedule a follow-up

A check-in lets the agent wait and continue the same task later. Ordinary
native Desktop chat messages do not offer a check-in; the capability remains
available to headless and ACP clients that request it for an idle **Act**
message. Tell the agent what to check and when, for example, “Check this
export in two minutes and tell me whether it’s ready.”

A client that starts a goal can also request one check-in during the first
goal turn; Desktop's goal composer does not offer it. The check-in uses the
first turn's inference allowance, and later automatic goal turns start with
their own permissions.

If the agent schedules a check-in, the chat shows its purpose and due time.
The task can wait for up to seven days without an open model request. When the
check-in comes due, the running host continues the task under its existing
permissions.

- **Pause** holds delivery until you choose **Resume**.
- **Cancel check-in** removes the scheduled follow-up. Choose **Continue** to
  proceed without it, or **Resume** if you already paused the task.
- **Stop** ends the task and its check-in.

After restarting Desktop, reopen the same chat and choose **Restore schedule**.
If the task is paused, choose **Resume** when you want it to continue. An
overdue check-in can then run.

Each opt-in permits one check-in. A check-in that already exists stays
visible in Desktop, which can cancel it or restore its schedule.
