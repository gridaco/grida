---
title: Schedule a follow-up
description: Let a task check back once at a chosen time from a private ACP client.
keywords: [agent, check-in, follow-up, schedule]
format: md
---

# Schedule a follow-up

A check-in lets a task wait and then continue later under its existing
permissions. Grida Desktop does not offer check-ins, and headless
`grida-agent run` has no check-in option. On macOS and Linux, a private ACP
client connected to a source-built host can allow one check-in on an idle
**Act** message, or on the first turn of a goal started without **Ultra**.
[Ask the agent to check later](./clients.md#ask-the-agent-to-check-later)

Tell the agent what to check and when, for example “Check this export in two
minutes and tell me whether it's ready.” If the agent schedules a check-in,
the client can read its purpose and due time. The task can wait for up to
seven days without an open model request. When the check-in comes due, the
running host continues the task.

- Pausing the task holds the check-in until the task is resumed.
- Cancelling the check-in removes the follow-up. Continue the task explicitly
  to go on without it, or resume it if it was paused.
- Stopping the task ends it and its check-in.

A goal's check-in uses the first turn's inference allowance; later automatic
goal turns start with their own permissions.

After a host restart, reopen the same chat and restore the schedule. If the
task is paused, resume it when you want it to continue; an overdue check-in
can then run. Each opt-in permits one check-in.
