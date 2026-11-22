---
title: Permission policy
description: How an agent host decides whether an action runs, asks, or is refused — effects declared by tools, a policy of sandbox level, approval mode and reviewer, named presets, defaults, and configuration as a file.
keywords: [agent-system, permissions, approval, sandbox, presets, configuration]
format: md
tags: [internal, wg, agent-system]
---

# Permission policy

This spec is for contributors implementing agent permissions or consuming
approval requests in a client. It defines when an action runs, who can decide
a request for additional access, and what that decision authorizes.
[Execution authority](./execution-authority.md) defines where the host enforces
access. [Tools](./tools.md) defines the operations.

Opening a project gives the agent a workspace. The turn’s captured permissions
determine which files a command can read and where it can write. For example,
a Desktop command can read an ordinary file outside the project when its
existing disk-read grant covers that file. A request for additional access
goes to the selected reviewer only if the host can grant it.

## Availability and unresolved requirements

This policy states the intended behavior. The
[feature catalog](../../../agent/features.md) records which parts each product
surface provides. The following requirements are unresolved; each names the
decision it awaits and the owner of that decision:

| Requirement                                   | Unresolved decision                                                                                                           | Owner                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Destination-scoped network escalation         | Which additional destinations and protocols can an execution backend enforce for one approved connection?                     | Execution authority and sandbox contracts |
| Layered configuration (user, project, launch) | How user-level profiles and trusted project files combine with the host's launch-scoped permission profile and settings file. | Host configuration contract               |

## Vocabulary

| Term            | Meaning                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Action          | One requested tool invocation with its exact arguments.                                                                           |
| Effect          | What an action would do, declared by its tool: read paths, write paths, run a program with read or write access, use the network. |
| Workspace roots | The directories the session was given, plus private temporary storage.                                                            |
| Protected paths | Locations where the host restricts writes, reads, or both, including inside a writable root.                                      |
| Sandbox level   | What the operating system permits: read-only, workspace-write, or full access.                                                    |
| Approval mode   | When an action needs a decision from the selected reviewer.                                                                       |
| Reviewer        | The person or automatic reviewer selected to decide an eligible request within the host’s limits.                                 |
| Preset          | A named combination of sandbox level, approval mode and reviewer.                                                                 |
| Escalation      | A request to run one action with more access than the sandbox level grants.                                                       |

## The generating rule

Each tool declares the effect of an action from its arguments and how to
present it. The tool knows nothing else about policy. The host then applies
one pure decision to every action in the same way:

```
decide(effect, sandbox level, approval mode, grants) → run | ask | refuse
```

An action that runs is executed through an enforcement point bound to exactly
the access that was decided. An action that asks waits for the reviewer; the
answer is bound to that exact action. An action that is refused returns a typed
denial the model can act on.

### Layering invariants

- **L1 — Tools declare, never decide.** A tool maps arguments to an effect and a
  presentation. It contains no policy logic and is unaware of presets. Adding a
  tool never requires changing the policy.
- **L2 — The decision is pure and uniform.** The same effect under the same
  policy and grants yields the same decision, whichever tool requested it.
- **L3 — Enforcement does not trust the decision alone.** Every effect is
  carried out through an enforcement point bound to the decided access:
  restricted processes run inside the operating-system sandbox, and file reads and writes
  go through one workspace file service that refuses anything outside the
  decided roots and protected paths. A bug in a tool or in the decision cannot
  widen access. Approval can lift a default restriction for an exact command
  within the host's permission ceiling. An explicit Full access grant
  authorizes unconfined execution and broad filesystem access.
- **L4 — Approvals are exact and durable.** An answer authorizes one action's
  effect, survives restart, and is invalid for any other action.
- **L5 — Unsupported enforcement fails closed.** Where a sandbox level cannot be
  enforced on the platform, actions needing it are refused, not run loosely.
  See [Execution authority](./execution-authority.md#a9--unsupported-enforcement-fails-closed).

## Sandbox levels

| Level           | Files                                                          | Programs                                                       | Network |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| Read-only       | Read within granted roots.                                     | Run with the host's read scope and private temporary storage.  | Off     |
| Workspace-write | Read and write within workspace roots, except protected paths. | Run with the host's read and write scopes, confined by the OS. | Off     |
| Full access     | Anywhere the user can.                                         | Unconfined, under the ordinary OS user.                        | On      |

Full access is a deliberate user grant. The host must identify the affected
chat and explain that commands can reach user-accessible files, local services
and the internet, including readable credentials and application state. It is
never selected by a project file, model request, new-chat preference or failed
sandbox setup. A trusted unattended launcher may select it explicitly.

This posture relinquishes the restricted levels' filesystem and network
isolation. It retains operation identity, captured authority, process ownership,
cancellation and honest lifecycle evidence. It does not grant elevated OS
privileges or inject host credentials into command environments. Automatic
approval review is independent and is not required for Full access.

Under a restricted level, the host protects its own state and credential
stores from reads and writes. A workspace-write command also has write
exclusions for agent configuration, cloud credentials and existing
version-control metadata. The host applies these exclusions when the command
starts. A command can initialize a new repository. Updating its existing
metadata requires an eligible, separately reviewed offline workspace write.
Agent configuration protections still apply to that retry, including
directories reserved before they exist. The person manages host settings
through a separate trusted configuration surface.
File tools apply the metadata restrictions in any letter case, since a
case-insensitive volume resolves `.GIT` to `.git`.

## What a program sees

A program the agent runs should behave as it does in the person's terminal,
minus the access the sandbox level withholds:

- **Environment.** It inherits the person's environment, including the search
  path, so ordinary tools resolve by name. The host removes its own internal
  variables and every secret it was launched with: the provider credential and
  the bearer tokens of its listeners and tool peers. Provider credentials are
  never placed in the environment by the host.
- **Reads.** In read-only and workspace-write, the host can allow ordinary files
  readable by the person while protecting its own state and credential stores.
  A narrower profile limits reads to granted roots and runtime paths.
- **Writes.** Only within the writable roots allowed by the level, minus
  protected paths, plus private temporary storage. Under workspace-write a
  program may also write the system's shared temporary directory, so files it
  stages there survive into the next command, as in a terminal.
- **Network.** Off unless the level or an approved escalation allows it.
- **Duration.** Each program runs under a bounded deadline and can be cancelled.

A turn has no fixed cap on the number of tool steps. Work ends when the model
answers, the person interrupts, or a budget the person set is exhausted; a
generous runaway guard may exist, but it is not a product limit.

## Approval modes

| Mode       | Behavior                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| Untrusted  | Ask before any action that writes or runs a program, unless a configured rule allows it.    |
| On request | Run permitted actions. Request a decision for reviewable effects or an eligible escalation. |
| Never      | Never ask. Actions beyond the sandbox level are refused.                                    |

Under **on request**, a sandbox refusal can lead to a fresh request for a
broader, enforceable scope. On a managed profile, an ordinary confined
process can request an outbound destination through its authenticated proxy.
A workspace or listener retry also carries a justification for the reviewer.

A broader retry is a distinct action with a fresh decision. The host can offer
a confined grant for one outbound destination, admit a TCP listener on a
reviewed port, or relax a reviewable filesystem restriction for one command.
Mandatory host exclusions and the filesystem read ceiling continue to apply.
The executor enforces the captured scope for the life of the process.

A command request identifies the command, arguments, working directory and
effective scope. The reviewer assesses its effects against
the person's instructions. An authorized command can justify connecting to
an exact destination even when the person did not name that endpoint. Sharing
sensitive data requires authority for the data and destination. The chat
retains its sandbox level for subsequent commands. Available scopes depend
on the host and execution platform. [Feature catalog](../../../agent/features.md).

## Presets

| Preset           | Sandbox level   | Approval mode | Reviewer           | Summary                                                                      |
| ---------------- | --------------- | ------------- | ------------------ | ---------------------------------------------------------------------------- |
| Read only        | Read-only       | On request    | Person             | Reads the project and asks to edit files or use the network.                 |
| Ask for approval | Workspace-write | On request    | Person             | Runs within the project and asks the person to approve extra access.         |
| Auto             | Workspace-write | On request    | Automatic reviewer | Runs within the project and delegates eligible requests to a bounded review. |
| Full access      | Full access     | Never         | —                  | No sandbox and no questions.                                                 |

New Desktop project chats start in **Auto** when the host supports it and
**Ask for approval** otherwise. A prior chat retains its saved selection.
An older chat without a saved selection starts in **Ask for approval**.
Project reads, edits, and confined commands can run without a review in
either mode. A project awaiting trust starts as Read only.

## Automatic review

**Auto** delegates an eligible approval request to the chat’s captured model
and connection. The master defines eligibility and assessment policy. The
host supervises the private review and records the decision for the pending
request. The originating turn accounts for the reviewer’s model calls and
can interrupt the work. The executor checks the grant before performing
the action. Clients show review activity and offer approval controls only
when the host requests a human decision.

### What the reviewer decides

The unit of review is one proposed effect under its captured permissions.
A forced deletion can require review even when the target is already
writable. For a command, the reviewer receives the executable, arguments,
working directory, filesystem and network scope, and environment variable names.
A managed connection identifies the requesting process and the exact host
and port. For example, allowing an installer to start leaves its registry
connection subject to review. Allowing that destination covers repeat
connections by that process. A new destination or broader retry needs its
own decision.

Under an exact-file policy, Auto can review disclosure of an outside text
file the person named in the originating request or an answer to a question
for that action. Applicable earlier instructions, including restrictions,
still govern. Workspace guidance and tool output can explain an action’s
effects. Authority comes from the person and the host’s grants.

| Outcome               | Effect                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allow                 | Routine low- and medium-risk actions can proceed within policy. High-risk actions require substantive user authorization and a narrowly bounded effect. The host verifies the action, scope and current authority before applying the decision. |
| Deny                  | A policy prohibition or critical risk blocks the action. A person may request reconsideration of an eligible denial. This records their instruction for a fresh assessment if the agent proposes the same action and scope again.               |
| Human decision needed | Manual-only requests, such as an agent settings edit, go to the person. An eligible request can also reach the person when required evidence is known to be incomplete or exceeds the available context.                                        |
| Review failed         | A timeout or exhausted technical retries block the action. The client reports the failure. Pausing or stopping the turn interrupts the review.                                                                                                  |

Repeated policy denials can interrupt the turn. If the person changes their
instructions during review, the host must recheck the evidence before
accepting an answer.

After a denial, the agent may explain the target and risk in chat and ask
whether to try again. On a fresh review, the preceding visible explanation
gives context to a short reply such as “yes.” The host must establish that
the explanation preceded submission. If that order is unknown, the reviewer
cannot use the explanation to interpret the reply. A reply queued before the
explanation appeared cannot authorize it. Only the person can supply consent.
It covers the target and effects they agreed to, subject to current policy. A refusal
remains a restriction. An open human approval can grant the action only
through a decision submitted for that request.

A pending connection belongs to the original process. A human handoff must
still reach that process if the foreground model has finished answering.
When the process exits, the host withdraws its pending request.

### What the reviewer can inspect

When a decision depends on local state, such as which script a preview
command would run, an eligible reviewer can run a short, offline command.
Its reads are limited to the turn’s captured read permissions, including
permitted files outside the project. Protected read exclusions and
revocations still apply. It can write only to private temporary storage and
has no escalation or foreground terminal access. A file-only grant retains
its narrower reader.

The host sends bounded observations to the selected model provider. Raw
output, including output from a failed check, stays in the private review.
The foreground model and public transcript receive only the public outcome
and any sanitized explanation. This boundary also applies after reopening
the chat.

### What survives a restart

A **checkpoint** preserves completed private assessments for one chat and its
active history view. Each pending review starts from a fixed snapshot.
Only one review at a time owns the shared checkpoint. It may advance it
after the host records the decision for its exact action. Other reviews
started concurrently keep their original snapshots across restart and
cannot overwrite the shared history. The decision receipt remains valid if
saving the checkpoint fails.

Reuse requires compatible reviewer settings, provider account, model, and
effective read permissions. Changing those settings or replacing the history
view retires incompatible evidence. Deleting the chat removes its checkpoint.
A later review receives historical observations as quoted, untrusted data
and assesses the new action independently. If the provider reports a context
limit, the host can drop prior exchanges and retry once within its review
budget, keeping the current action, applicable instructions and observations together.

## Configuration

Policy is configuration, not interface. It is set in plain configuration files
that the person and their tools can read, version and diff:

- a **user-level** file with personal defaults and named profiles;
- a **project-level** file in the project, honored only for a trusted project;
- **launch options** that override both for one session.

Within the host's authorized restricted profiles, each layer can set the preset or the individual sandbox level, approval mode,
reviewer, additional writable roots, and network access. More specific layers
win. A changed configuration applies to the next session or turn; a running
action keeps the access it was decided with. A product may show which preset is
active and switch between presets; it does not need settings screens for the
individual fields.

Full access requires the separate explicit user or trusted-launch choice
defined above. A project configuration or inherited new-chat preference cannot
authorize it. The composer shows the access for newly accepted messages.
A change can commit during a running turn or with inputs waiting in the queue.
Each accepted input and each running command keeps its captured authority.
A restricted turn cannot drive a terminal started with Full access. The person
can still stop that process. Exact change receipts and retained authority must
remain recoverable without new model work.

## Conformance scenarios

| Situation                                            | Ask for approval                                       |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Edit a file in the project                           | Runs.                                                  |
| Initialize a repository in a project without one     | Runs, confined.                                        |
| Write inside existing version-control metadata       | Refused by the sandbox; may ask to retry.              |
| Create a reserved agent configuration directory      | Refused by the sandbox, including on a reviewed retry. |
| Open the host's settings from a restricted tool      | Refused.                                               |
| Run a build or test command in the project           | Runs, confined.                                        |
| A command needs the network                          | Managed profile asks on first use of a destination.    |
| Read an ordinary path covered by the disk-read grant | Runs, confined.                                        |
| Read an outside text file under an exact-file policy | Asks for that file and version.                        |
| Write a path outside the project                     | Asks.                                                  |
| The person is unavailable and approval mode is never | Refused with a typed denial; the turn continues.       |
| The host cannot enforce the sandbox on this platform | Commands are refused; file tools still apply L3.       |

The table states the target policy. A host that cannot enforce the requested scope refuses the action.

## See also

[Execution authority](./execution-authority.md) ·
[Tools](./tools.md) · [Hooks](./hooks.md) ·
[Runtime environments](./environments.md)
