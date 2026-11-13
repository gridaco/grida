---
title: Schedule a follow-up
description: Let a headless or ACP task check back once at a chosen time.
keywords: [agent, check-in, follow-up, schedule]
format: md
---

# Schedule a follow-up

A check-in lets the agent wait and continue the same task later. Headless and
private ACP clients can allow one for an idle **Act** message; Desktop chat
does not offer check-ins. Tell the agent what to check and when, for example,
“Check this export in two minutes and tell me whether it’s ready.”

A client that starts a non-Ultra **Act** goal can also allow one check-in
during the first goal turn. The check-in uses the first turn's inference
allowance, and later automatic goal turns start with their own permissions.
[Ask the agent to check later](./clients.md#ask-the-agent-to-check-later)

If the agent schedules a check-in, the client can read its purpose and due time.
The task can wait for up to seven days without an open model request. When the
check-in comes due, the running host continues the task under its existing
permissions.

- Pausing the task holds delivery until it is resumed.
- Cancelling the check-in removes the scheduled follow-up. Continue the task
  explicitly to proceed without it, or resume it if it was paused.
- Stopping the task ends it and its check-in.

After a host restart, reopen the same chat and restore the schedule. If the
task is paused, resume it when you want it to continue. An overdue check-in
can then run. Each opt-in permits one check-in.
