---
title: Work with subagents
description: Delegate independent work, follow subagent activity, and open child conversations in Grida Desktop.
keywords: [agent, subagent, assignment, delegation]
format: md
---

# Work with subagents

A subagent is a separate conversation with its own assignment, tools and
recorded result. The main agent remains responsible for integrating its work.

## Ask the agent to delegate

In a supported native Desktop build, ask the agent to split independent work
among subagents. For example: “Use five subagents to investigate these five
questions, then combine their findings.” Ordinary **Act** work can delegate
at every effort level; choosing Ultra is not required. A headless client
opts in with `--subagents`.

Each worker has a stable identity and appears in the parent's Subagents view.
It receives its assignment and captured project guidance and skills, rather
than an automatic copy of the parent conversation. It uses the parent's
captured model, reasoning setting and connection; changing the parent's
selection later does not move accepted child work to another connection.

Workers can use the native file and command capabilities explicitly delegated
from the parent's accepted permission profile. They cannot gain wider access,
change agent settings, inherit live editor connections, or delegate again. An
action needing additional permission is refused in the worker and must be
reported to the main agent; it does not create an invisible approval wait.

One parent turn can create up to eight workers, each with up to eight model
requests. This reserves a separate bounded allowance of 64 child requests
beside the parent's work allowance; it is not a token or monetary spending
limit. Waiting observes the assigned work and returns its recorded result.
Information sent to an active worker joins its current assignment and becomes
available to its next model request. The receipt confirms that the information
was recorded, not that the model has read or acted on it. Sending refuses paused
or finished work and never restarts an idle child. The main agent must
collect the assignments' results before reporting successful completion.
General workers belong to the parent turn that creates them and receive one
bounded assignment. The model cannot reuse them for follow-up work; its
messaging, waiting and stopping tools address only workers from that same
parent turn. A new assignment requires a new worker, while earlier child
conversations remain available to inspect. The main chat's Stop also stops its
owned workers.

Processes a worker starts belong to its assignment. The native host
automatically stops any remaining processes before its successful result is
collected. A worker can leave a bounded process running when the assignment
requires it and report its session and last observed state; work intended to keep running must be
started by the main agent. Waiting observes this cleanup rather than causing
it. A missing or unverified cleanup record remains explicit uncertainty,
including after restart. The assignment's result and resource retirement are
reported separately.

General workers are available for ordinary Act turns on connections supporting
JSON tools. Plan, persistent Goals, temporary side chats and children retain
their separate capability limits. Goals keep their existing funded reviewer
without acquiring an additional general-worker allowance.

## Open subagent activity

In a supported Grida Desktop build on macOS or Linux, click the subagent
indicator in the parent transcript or a named start/finish event. In a
workspace, this opens **Subagents** in the main content tabs, beside your
documents. Requesting it again brings the same tab forward. A standalone file
window shows it within the chat instead.

The view belongs to the selected parent chat. **Active** includes ready,
queued, running, paused and uncertain work; **Done** keeps completed, failed
and stopped work when no assignment is still waiting.

The view is read-only. It shows subagent status, activity and conversations;
creation, assignment, steering and other execution controls belong to the main
agent. Give further instructions in the parent chat.

Select a child to read its conversation and activity. **Back** returns to the
list in the same tab. The parent chat and composer remain visible and usable,
with the unsent draft intact. The child's name
and visual identity match its links in the parent's activity. Start and finish
events belong to the parent turn that sponsored the assignment. On compatible
native builds, they appear between the parent's commentary and tool activity
where the host recorded them, rather than collecting at the bottom. Placement
stays consistent during live updates and after reopening. Reading an event or
reopening a child starts no model request.

Older history or an unavailable ordering record can leave the relative
position unknown. Those events stay in **Subagent events — relative order
unavailable**.

The child view shows its captured model and reasoning effort when retained.
Those facts describe the child's work, even if you have since selected a
different model for the parent. A model default or unavailable legacy value
stays identified as such. Visible conversation and work update while the child
runs. Earlier pages load retained history; interrupted live output or bounded
history is labeled when it is incomplete. Assignment and result previews are
separate from the actual conversation.

Counts, timestamps and history come from the host. A bounded scan can report
lower-bound counts instead of exact totals. Child pages follow creation order;
use **Show more** to reach older children, including older children working on
a new assignment. Parent lifecycle activity covers the children loaded by the
view and identifies bounded or incomplete history. The view keeps a bounded
window of loaded children; **Newest subagents** returns to the newest page
after older paging has moved earlier rows out of that window. Older connections
can expose assignment/result inspection without the richer live conversation;
the view explains that limitation and remains read-only.

Closing the tab hides the view; a transcript indicator can open it again.
It stops neither the child nor its background processes. Switching parent chats
withdraws the previous chat's view. Live updates do not bring an inactive tab
forward. The main chat's Stop and the **Processes** tab's Stop controls have different
targets. **Processes** is in the workspace's bottom **Workspace utilities**
panel beside **Terminal**, separate from the Subagents view.

## See independent reviews

In Grida Desktop on macOS and Linux, choose **Ultra** effort in the model
picker and send your request, for example “Compare the two layout drafts and
tell me which assumptions matter.” Ultra work may include one independent
reviewer, which the agent decides whether to start. The reviewer can read the
project but does not see your chat, and its work appears in the turn's
activity. Ultra is available on every supported native model connection,
including subscriptions and compatible endpoints. The reviewer uses the
parent's selected connection and account, with its own bounded assignment;
connecting another provider does not move that work. An Ultra goal shares
its inference allowance with the review.
[Choose how much effort to use](./effort-and-goals.md#choose-how-much-effort-to-use)

The reviewer gets only its assignment and permitted project-read access. It
does not inherit additional folder grants, commands, writes or permission to
delegate. Stop and connection shutdown also stop the review. Reopening its
recorded activity starts no new request. A model's reasoning controls and
provider token limits are separate from this review allowance.

Deleting a chat also deletes its subagents.

## Named subagents in private clients

A private ACP client connected to a source-built host started with
`--subagents` can create named children and submit bounded text assignments.
These client operations are separate from Desktop's read-only Subagents view.
See [Assign work to a named subagent](./clients.md#assign-work-to-a-named-subagent)
for the client contract and its controls.
