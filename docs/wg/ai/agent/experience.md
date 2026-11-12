---
title: Agent Experience
description: Proposed user experience for the rebuilt agent, including agent effort, planning, progress, control, recovery, and a final summary of every turn.
keywords: [agent, user-experience, ultra, planning, progress, recovery, summary]
format: md
sidebar_position: 1
tags: [internal, wg, ai]
---

# Agent Experience

**Proposed behavior specification.** The [feature catalog](../../../agent/features.md)
owns feature identity, minimum promises, delivery status, and supported scope.
This document expands those promises into behavior and acceptance scenarios that
a user can recognize and a reviewer can verify.

A person should be able to give the agent a task, understand what it is doing,
redirect it, and leave with an inspectable result. These expectations apply to
design, programming, research, and writing.

The [master](./master.md) owns the choices that produce this experience. The
[components](./components.md) supply the execution and recovery mechanisms.

## Give it a task

The agent accepts a request together with the material the person chooses to
provide. That material may include text, files, images, links, a selected object,
or the open document. Before sending, the person can see what will accompany the
request and remove an unintended attachment or selection.

If the selected model or environment cannot use an item, the person can see
which material will accompany the request and which requires another route.

After sending, the conversation shows the accepted request. A later edit becomes
an explicit revision or a new request so the person can understand which version
the agent acted on. A confirmed rejection stays visibly unsent and offers retry.
If the connection fails before acceptance is confirmed, the request shows that
confirmation is pending. Reconnecting or retrying resolves the same submission
without starting duplicate work.

The agent follows the requested outcome and constraints. It makes reasonable,
reversible decisions where the request leaves room for judgment. It asks a
focused question when the missing answer would materially change the result or
the authority needed to produce it.

## Work with project folders

A Project can group related directories, including several repositories, with
one primary directory. The primary supplies the default location for new work.
The person can see which directories are available and which one an action will
affect. Access can differ between directories.

Changing the primary directory affects later defaults. Work already underway
keeps its selected target. A task that only uses uploaded material can run
without adding a project directory.

## Work on uploaded files

For “add text to this PNG,” the agent can work on a temporary copy, inspect the
result, and return the edited image. It does so without adding intermediate
files to the person's project. Saving the result into a project folder is a
separate selected destination.

The conversation retains the uploaded item's identity. Its model-facing image
and the working file can be different representations of that same input.
The original, working copy, and resulting image remain distinguishable.

The product makes output availability and any expiry clear. Pausing or reconnecting
preserves required working files or restores them from retained input where that
recovery is offered. If content is no longer available, the agent explains what
must be restored before continuing.

## Use commands and select skills

The person can open the available command menu with `/` and select an action
such as `/fork` or `/compact`. The product explains each
command's effect and shows when it is unavailable. Commands that change settings
or conversation state use the same controls as the corresponding buttons.

A person can explicitly select an available skill by name through the composer's
skill picker. Each surface identifies its commands and reference kinds so that
skills and file references remain distinguishable.
The selected skill is visible with the request and is applied within its stated
scope. The composer resolves a skill reference to the actual available skill.
An unavailable or ambiguous reference asks for correction before submission.
The picker identifies which available skill will be applied.

## Work toward a persistent goal

A person can explicitly start a persistent goal with an objective and success
conditions. The agent carries it across work turns, records progress, and keeps
working within the granted permissions and resource limits. A turn's final
summary can report progress while the goal remains active.

The person can inspect, revise, pause, resume, or clear the goal. Pauses and
revisions survive restart. The agent reports completion only when the current
objective is achieved and required work is accounted for. If progress needs an
answer, an unavailable capability, or additional allowance, that condition is
visible. Exhausting an allowance produces its own outcome.

The selected agent effort and Plan or Act regime still apply. A goal can direct
an extended investigation or plan as well as execution. Continuing into another
turn preserves earlier usage and outstanding external work. Ordinary requests
remain available without starting a persistent goal.

## Agent effort

**Agent effort** controls the work the agent undertakes across the whole task.
The proposed presets are **Standard** and **Ultra**.

| Agent effort | What the person should expect                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Standard     | Direct execution with relevant investigation and checks, proportionate to the task.                                                 |
| Ultra        | Proactive delegation of useful independent work, with a larger allowance for investigation, alternatives, review, and verification. |

In Ultra, the agent looks for work that can benefit from parallel investigation,
implementation, or independent review and starts suitable subagents without
requiring the person to request each one. It gives them bounded tasks, continues
useful work itself, and integrates their findings. Standard can also use subagents
when appropriate. Neither mode requires a fixed agent count.

Ultra may take longer and use more paid capacity. The agent can finish early
when the result already meets the request.

The selected agent effort, effective limits, and any spending authorization are visible
before work begins. A person can inspect the current numeric limits and how usage
counts against them. Enforced limits are distinguished from estimates of spending
or duration. These values belong to the selected product configuration
and available service capacity. An increase that needs further authorization
waits for the person's decision.

Ultra must have an observable effect on relevant work. For a complex design task,
that might mean inspecting the result at several sizes and correcting discovered
problems. For a small factual answer, a concise response may still be appropriate.
Extra output length alone provides no evidence of deeper work.

If the requested agent effort is unavailable, the product explains the reason
and lets the person choose an available option. The active setting remains
visible during the task.

Model reasoning effort controls an individual model request. The master selects
that setting as part of its strategy for fulfilling the chosen agent effort.

## Change how the agent works

The person can ask the agent to explain a supported setting, change a default,
or restore automatic behavior. For example, “use a smaller context budget for
future tasks” or “show which settings applied to this answer.” The agent knows
the supported settings through the same descriptions and validation used by
the product's controls.

A change shows its scope, previous and resulting values, and when it takes
effect. A default change applies to later accepted requests. Already accepted
work keeps its recorded settings unless the person explicitly changes that work.
An unsupported or invalid value has a clear explanation. Missing information
about model capacity remains visible.

The model is chosen in the composer and can change between turns. Choosing
another model keeps the conversation and its history in place; the next request
uses the new model with the earlier turns as context. A turn already running
finishes with the model that started it. Without a usable default model, the
conversation still opens and its composer asks the person to choose one.

Using this feature requires no knowledge of a configuration file or field names.
An advanced file-editing path can expose the same reviewed settings. The compact
catalog identifies which settings and scopes the product currently supports.

## Automate lifecycle checks

The person can configure hooks to load context, check a proposed command,
record a result, or request verification before the agent finishes. They can
inspect which hooks are enabled, where each came from, what it can access,
and why one blocked or delayed work. Project-provided executable hooks require
review before they run.

A required check that fails or times out stops the action it guards and explains
the cause. A failed follow-up check preserves the actual result of any action
already performed. Completion checks stay within the task's limits and respect
Stop and Pause. Reopening a chat does not run hooks again. Available events and
handler types are explicit for each execution host. [Hook behavior](./hooks.md).

## Understand usage and cost

The person can inspect context use, recorded usage, and available cost information.
Estimates are labeled, with unavailable prices shown as unknown. Actual charges
and enforced allowances are distinguishable from estimates. An exhausted
allowance or credit balance explains which work stopped and what is needed to
continue.

## Plan before acting

**Plan** and **Act** describe what the agent may do. Agent effort describes how
thoroughly it approaches that work. A person can therefore request an Ultra plan
or a Standard execution.

In Plan, the agent can inspect permitted material, ask questions, and prepare a
reviewable proposal. It explains the intended result, important decisions, and
how success will be checked. Changes to the task's target files or documents
begin after the person authorizes Act. Any separate place where the plan itself
can be saved is identified as such.

In Act, the agent carries out the authorized task within the person's permissions.
It can still investigate and adjust its approach as it learns. If a discovered
condition would substantially change the agreed outcome, it asks before taking
that new direction.

The current regime is visible. The person can inspect the plan and authorize the
transition directly. Choosing Ultra preserves the current regime and permissions.

## See useful progress

An active task shows whether the agent is working, waiting for a response, waiting
for a service, stopping, or finished. Progress updates explain meaningful activity
and findings in ordinary language.

Useful updates include “I found the overlap at the narrow layout and am adjusting
the card spacing.” Timing claims come from an observed deadline or an identified
estimate.

The person can inspect relevant actions and outputs behind those updates. Long
tool output and repeated progress stay collapsed by default, with details
available on demand. A quiet period still has an accurate activity state.

When work is delegated, the main task remains responsible for integrating the
results. The person can see outstanding delegated work and any part that needs
attention. A completed task has accounted for the work required by its request.

If a provider is temporarily unavailable, the agent shows that it is waiting or
retrying and remains interruptible. Retries are bounded. Sign-in, quota, refusal,
and invalid-configuration problems explain their specific recovery path. Any
fallback follows the selected provider policy and is visible. A retry preserves
the work already performed and its known usage.

A malformed tool request can be corrected without losing the conversation.
Repeated failed corrections eventually produce a clear limitation or request
for help. They do not run indefinitely.

## Ask in a side chat

A side chat lets the person ask a focused question using context from the main
conversation while its work continues. It starts a separate conversation from
an identifiable context snapshot, including any earlier compaction already
represented there. The side chat's later discussion stays separate.

The agent is explicitly told that it is answering a side question. Inherited
history supplies background, and the person's new messages supply the current
request. It does not continue the main task merely because that task appears
in the inherited context.

The normal purpose is questions and lightweight exploration. An explicitly
requested action still follows the side chat's available tools and permissions.
The product shows its retention and closing behavior. A temporary conversation
can have lasting external effects, which retain their actual outcome records.

Opening or closing the side chat preserves the main task's independent controls.
Returning to the main chat changes the view. Bringing back an answer or using it
to steer the main task is an explicit action. A side chat can use a snapshot for
background and request a fresh observation when it needs current task status.

## Work with subagents

A subagent is a reusable conversation with its own identity, readable name,
context, and work history. The main agent gives it a bounded assignment and
remains responsible for integrating the result. Finishing a work turn leaves
the subagent available for follow-up work within its retained lifetime.

The person can ask the main agent to manage a particular subagent, and can
inspect its status, current assignment, history, and results.

| Action              | Expected behavior                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Create and name     | Start a child with a clear assignment. Names help identify it, while controls resolve to its stable identity. |
| Give follow-up work | Reuse its existing context. Start a new turn when idle, or explicitly steer or queue work when busy.          |
| Send information    | Deliver context without starting an idle child.                                                               |
| Pause and resume    | Suspend and continue the child's unfinished work under its current permissions and limits.                    |
| Stop                | Interrupt its current work and retain the partial result for later follow-up.                                 |
| Close               | Release its execution resources while preserving history for the stated retention period.                     |

Waiting for a child leaves that child working. Explicitly pausing the main task
pauses its owned children as well. Pausing one child leaves independent work
available to the main agent and other children. Resuming the main task preserves
any separate pause the person applied to a child.

Results identify the work turn and instructions they account for. Reusing or
renaming a child cannot turn an older result into evidence that a newer
assignment has finished.
Closing and reopening a child does not reset its granted limits or create new
permission. External agents expose the controls their backend can actually honor.

## Correct the current task or send the next one

The product distinguishes **updating the current task** from **sending a task to
run next**.

A queued request is immediately visible as waiting. It retains its place until
the current task has settled and the queue is allowed to continue. The person can
inspect, edit, reorder, or cancel waiting requests. Editing a request whose execution has
already begun requires a visible choice to update that task or send another one.
The person can see the model, effort, and operating settings captured when a
queued request was accepted. Editing the queued request can change those
settings explicitly. Current access restrictions and available allowance still
apply when it starts. A failed attempt to queue preserves the unsent draft.

An update to the current task receives an acknowledgment when it has been
accepted. The agent applies it at the next safe opportunity and reports any work
already completed that affects the correction. A late correction remains visible
even when it arrives as the task is finishing, with its resulting disposition.

A question or approval remains attached to the action that needs it. Sending
another task while one is pending adds a queued request. The person answers or
dismisses the open interaction through its own controls.

## Pause, resume, and stop deliberately

**Pause** suspends the current task at a recorded continuation point. While the
task is pausing, the product shows any work that must settle first. A confirmed
pause prevents new agent work and automatic queue advancement. It survives a
restart and preserves the task's outstanding questions, results, and remaining
allowance. Already accepted external jobs retain their visible status.

**Resume task** continues that unfinished task from its recorded state. It can
still need an answer or reconciliation of an external operation. Resuming does
not invent that answer or repeat completed work.

**Stop** requests an end to the current task and pauses automatic execution of
waiting requests. The queue remains available for inspection, editing, and
resumption. This queue pause survives an execution restart. **Resume queue** is
the person's explicit choice to allow waiting requests to proceed.

While stopping, the product explains any operation that is still settling. An
external service may already have accepted work. Its known status remains visible
until the product can report a result or explain the uncertainty.

The stopped task receives a summary of completed work, partial changes, remaining
work, and any external operation that still needs attention. Continuing a stopped
task starts from this recorded outcome through a new request.

## Understand permissions and questions

Before a sensitive action needs authorization, the agent explains the proposed
action, its target, and the scope of the requested permission. The person can
allow or decline it and see whether a choice applies once or more broadly.

The product distinguishes what the agent can access from who reviews approval
requests. If automatic review is offered, the person can see when it is active,
which scope it covers, and which decisions still require them. Changing the
reviewer preserves the selected file, network, and execution limits. Wider
access requires its own explicit permission change.

Permission requests preserve enough detail to make the decision meaningful. A
change to the target or material action requires a decision covering that change.
After a refusal, the agent can use the remaining authority to pursue the request,
or explain the dependency that prevents completion.

An automatic denial or unavailable reviewer has a visible reason and a clear
next action. The product follows its declared fallback, which may ask the person
or stop the affected work. An unanswered or failed review cannot silently permit
the action.

Questions explain what decision the answer will affect. Suggested answers are
short and the person can supply their own. An unanswered question stays visible
across reconnects. Where dismissal is possible, its effect on the task is clear.

A question can either pause dependent work until its answer arrives or leave
independent work running. In the latter case, the answer updates the ongoing
task at its next decision point. The product shows which work needs the answer.
Waiting for a person does not require an open model request or a continuously
running worker. An answer received after Stop or a history change retains its
original question and has an explicit follow-up disposition.

An unattended task follows the permissions and limits already granted. When it
needs a fresh human decision, it waits in an inspectable state.

## Use the material I gave it

The agent distinguishes the current document or live file from a supplied copy.
It can identify which material informed a result and when a relevant observation
was made. If the target changes during work, the agent refreshes the affected
observation before applying work that depends on it.

For visual work, the agent inspects the visible result when a viewing capability
is available. A claim about layout, overlap, or appearance names the checks that
actually took place. For file work, the result identifies the files and checks
that matter to the request.

An image can be available to view while its original working file is unavailable.
The agent checks which operations the supplied material supports. Requested
output properties, including transparency and reference images, remain explicit
when a provider or tool is unavailable.

A Library reference picker lets the person refine the search while retaining
earlier selections. Only submitting or skipping the selection resolves the
request, and late search responses preserve the person's latest search.

Long conversations retain the user's objective, corrections, decisions, and
unresolved work. When some earlier detail must be retrieved again, the agent does
so through available history and sources. If a source is unavailable, it explains
which part of the task is affected.

Compaction preserves the original conversation and pending work. If summarizing
fails, the previous context remains available. If the task still cannot fit,
the agent explains the limit and the material that needs narrowing. Newly sent
messages remain part of the conversation while this happens.

Project instructions and selected skills influence the task within their stated
scope. The person can inspect the instructions and skills being applied. Reusable
personal memory, where offered, has visible scope and controls for inspection,
correction, and removal.

If a required instruction source becomes unavailable, the agent identifies the
affected work. A restart preserves which instructions informed earlier actions.
A refresh that changes the instructions for subsequent work is inspectable.

## Schedule a wake-up

The agent can register a future wake-up for its task, such as “check the render
job again in five minutes.” The wake-up records when to return and what to check.
The person can inspect or cancel it. Waiting for that time needs no open model
request or continuously running worker.

When due, the wake-up makes the task eligible to continue in its session under
the current permissions and limits. An explicit Pause or Stop remains effective.
The agent can then report a meaningful result or request a decision. User-facing
notifications are a separate delivery choice.

## Return to ongoing work

Closing a conversation view or losing its connection preserves accepted work
under the execution environment's stated lifetime. Reopening the conversation
shows the latest task state, pending questions, queue, and available results.

The product tells the person where the work runs and what keeps it alive. A local
task depends on its local execution environment. A task offered as remote work
can continue under the remote service's displayed limits.

After an execution restart, the conversation identifies work recovered, work
interrupted, and operations whose outcome still needs checking. The next action
uses that information. Repeating an external action requires evidence that doing
so is safe or a fresh decision from the person.

If a generation service accepted a job before the connection failed, returning
to the task should first recover that job's result or status. The person should
be able to distinguish recovering existing work from purchasing another attempt.

## Read each finished turn

A turn is the work associated with one accepted request, including its tools,
questions, and relevant delegated work. A finished conversation reads as a
sequence of requests and answers. The work behind each answer stays one step
away instead of filling the conversation.

While a turn runs, its commentary and actions appear as they happen. When it
finishes, the work before the final answer collapses beneath a header such as
“Worked for 2m 30s”. The final answer stays visible below that header. Each
turn keeps its own header, including turns reopened later or read from an
earlier page.

Expanding the header shows the retained commentary and work in their original
order. Consecutive actions read as one short activity line, such as “Read files,
ran commands, used the Docs integration”, and can be expanded to their individual
calls and outcomes. Expanding, collapsing, or reopening only reads what was
recorded. It never repeats an action or requests another model response.

Several distinct things can appear around a turn. They keep distinct names.

| Element             | What it is                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Final answer        | The agent's concluding response to the request. It remains visible.                          |
| Turn activity       | Commentary and actions that preceded the final answer, grouped under the turn's header.      |
| Execution details   | Technical accounting: tool outcomes, checks, token usage, billing, and retained artifacts.   |
| Reasoning summaries | Provider-supplied summaries of model reasoning. Hidden reasoning is never reconstructed.     |
| Context compaction  | A replacement of older model context. It changes what the model reads, never the transcript. |

The final answer is identified by the provider's explicit classification when
it supplies one. Otherwise, it is the turn's concluding response that requested
no further action. A stopped turn keeps its partial text with its work. Text is
never labelled final merely because it arrived last.

The answer addresses the questions that apply to the turn.

- What was accomplished, and what is the result?
- What changed, and where can I inspect or open it?
- What checks were performed, and what did they establish?
- What remains incomplete, uncertain, or dependent on my decision?

The length follows the work. A simple answer is complete by itself. A task that
changes several artifacts needs direct links and a compact account of the
important changes. Each verification claim is limited to the checks actually
performed.

For example, a design task might end with “Updated the three pricing cards and
checked the layout at desktop and mobile widths. The revised page is ready to
review. Publishing still needs your approval,” accompanied by the result link.

Completion, interruption, and failure remain distinct visible outcomes. A
stopped or failed turn says so in its header and keeps the work it performed.
Partial work can still be opened and used. If the agent cannot generate its
normal final response, the product provides a factual account from the recorded
actions and outcomes. A question or approval that is still pending stays
outside the collapsed work and remains actionable. Recovering the same turn
presents one coherent result.

The elapsed time comes from recorded start and finish times. A turn recorded
without them omits the duration rather than estimating it.

## Keep useful results and history

The person can find, rename, archive, reopen, and delete saved chats. Renaming
preserves conversation identity. Archiving changes organization and keeps the
history available to reopen. Execution status and controls remain distinct from
these presentation changes.

Deletion identifies the history, owned working data, children, and scheduled
continuations it covers. The system accounts for active work before reclaiming
its state. Independently retained or shared artifacts follow their own ownership
and retention rules. Deleting authored project files or published results is a
separate selected action.

Created artifacts have identifiable names and can be opened, inspected, or
downloaded through the capabilities of the host. The final result distinguishes
a saved deliverable from temporary material and explains any relevant lifetime.

Useful intermediate artifacts can be inspected while work continues. The agent
identifies them as work in progress and continues refinement from the available
result. Opening a preview respects the person's navigation, and closing its
viewer leaves the underlying work under its existing controls.

If generation succeeds but saving or presentation fails, the conversation shows
which part succeeded and whether the result is still available. Recovery uses
the existing result or job when possible. A new paid generation is identified
as a new attempt.

The person can return to a conversation and understand what was requested,
attempted, completed, and left pending. A branch starts a separate conversation
from an identifiable point. Revisiting or branching conversation history
preserves an accurate account of external changes already made.

The person can edit and resubmit an earlier user message, including one before
the most recent turn. The revised conversation continues from that point and
keeps the later original history inspectable. The edit shows what subsequent
conversation will be replaced in the active view and settles affected running
work and open questions before continuing.

Changing conversation history preserves the record of files changed, messages
sent, and paid operations already accepted. Restoring those effects requires
separate actions with their own results.

Restoring a file or document is a separate action with its own target and result.
If a restore capability is offered, the person can review what it will affect.
Paid operations and already delivered external actions retain their real outcome
when conversation history changes.

## Use Grida from another agent

The person can connect an external agent to Grida's MCP interface and grant it
specific document or editor access. That agent can discover supported Grida
operations, inspect permitted state, and perform edits through the same product
contracts used by the built-in agent. Using the interface does not require a
Grida-hosted conversation or model connection.

The person sees which client performed an operation and the result reported by
the document tool, including any save status or edit failure it exposes. Each
document implementation defines these behaviors for both built-in and external
agents. An interrupted connection preserves uncertainty about an unconfirmed
result. External agents retain their own prompts, controls, and reasoning behavior.

Headless document and media operations advertise their actual support. Optional
presentation can report that no editor is attached while preserving the produced
artifact. The [tool-host contract](https://github.com/gridaco/grida/blob/main/packages/grida-ai-agent/docs/tool-host-contract.md)
owns these capability and result guarantees.

## Know which features are available

The common experience comprises task acceptance, agent effort selection, visible
execution permissions, progress, queue and update controls, stop and resume,
recovery status, inspectable history, and final summaries.

The available environment determines which work can be performed. File editing,
canvas editing, visual inspection, web access, connectors, media generation,
delegation, remote execution, scheduled wake-ups, and reusable memory are advertised
with their scope and requirements. An unavailable capability is identified before
the agent promises work that depends on it.

Where tool servers are supported, the product shows the tools available from
each configured server and their current availability. Enabling a server and
authorizing a particular tool action remain separate decisions. Connection or
tool-discovery failure is visible before the agent relies on that capability.

Changing the model or environment shows any resulting capability differences.
When a requested capability disappears during a task, the agent explains the
affected work and offers an available path or waits for the dependency to return.

The person can configure and remove provider connections and inspect their
readiness. Removing a connection prevents further use under that configuration.
Already accepted external operations retain their known receipts and status.
The agent explains when recovering them needs renewed access or another explicit
decision.

Command execution initially runs finite programs such as Git, test runners,
and scripts, with bounded output, a deadline, and cancellation. The product
identifies its supported environment and network scope. Interactive input,
reusable terminal sessions, and persistent development servers require an
explicit additional capability before the agent promises them.
An environment can support structured file or model operations while raw command
execution is unavailable. Approving an action still requires an environment
capable of enforcing its requested permissions.

If the product offers a choice of agents, each choice identifies its available
controls and where its work runs. Effort settings, tools, approval behavior,
history, and recovery may differ between agents. The person can see those
differences before handing over a task.

## Judge the experience by outcomes

A product review should be able to observe all of these situations. These are
intended outcomes. The feature catalog records current availability and caveats.
Each scenario explains what the person can rely on independently of its test
method or implementation.

| Situation                                              | Expected experience                                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A complex request is run with Ultra                    | The agent initiates useful independent subagent work when available, integrates it, and stays within the visible limits.                           |
| A person asks for an Ultra plan                        | The agent produces a reviewable plan while preserving Plan's execution limits.                                                                     |
| A person corrects work in progress                     | The correction is acknowledged and the resulting work accounts for it.                                                                             |
| A person stops with several requests queued            | The current work settles, its summary appears, and the queue waits for Resume.                                                                     |
| A connection drops during an approval                  | Reconnection restores the pending decision and the action it concerns.                                                                             |
| A person reopens a chat with work waiting in its queue | Opening the chat preserves the queue's run or pause state. Any continuation follows its existing authorization.                                    |
| A person sends a follow-up while an answer is needed   | The original question stays answerable. The follow-up waits, then runs once. Unsupported queued attachments stay in the draft with an explanation. |
| A person switches from chat A to chat B while A works  | A's later output remains in A. B keeps its own progress and controls.                                                                              |
| Two uploaded images have the same filename             | Each retains its identity. Editing the selected image uses that image's original bytes.                                                            |
| A person changes models after attaching an image       | Submission checks the newly selected model and available file tools. It uses a supported route or explains which input cannot be accepted.         |
| A person switches documents after requesting an edit   | The invocation keeps its addressed endpoint and supplied document arguments, or reports that endpoint unavailable.                                 |
| A required working file is unavailable after restart   | The agent restores the correct retained input or identifies what the person must supply before dependent work continues.                           |
| Generation succeeds but saving the result fails        | The result or its recovery record remains available. Retrying the save preserves the completed generation.                                         |
| An image used by an open canvas changes                | The canvas and previews refresh. Unsaved edits survive, with any delayed refresh explained.                                                        |
| An external operation outlives an execution restart    | The product explains the known outcome or remaining uncertainty before another attempt.                                                            |
| A visual task reaches completion                       | The result can be inspected and the summary accurately names the visual checks performed.                                                          |
| Final response generation fails                        | A factual account still exposes the available work and remaining problem.                                                                          |
