---
title: Permission policy
description: How an agent host decides whether an action runs, asks, or is refused — effects declared by tools, a policy of sandbox level, approval mode and reviewer, named presets, defaults, and configuration as a file.
keywords: [agent-system, permissions, approval, sandbox, presets, configuration]
format: md
tags: [internal, wg, agent-system]
---

# Permission policy

This document is the canonical permission policy for the agent. It defines how
the host decides, for each action the model requests, whether the action runs,
waits for a decision, or is refused. [Execution authority](./execution-authority.md)
decides where confinement applies; [Tools](./tools.md) defines what each
operation does. This document owns the decision between them.

The policy places the boundary where the person's intent is clearest: by
opening a project, the person has already decided the agent may work on it.
An agent therefore works freely inside the project it was given, and asks
before reaching beyond it. Asking for every in-project step would cost more
attention than it protects, while anything beyond the project is a decision
the person has not yet made.

## Availability and unresolved requirements

This policy states the intended behavior. The
[feature catalog](../../../agent/features.md) records which parts each product
surface provides. The following requirements are unresolved; each names the
decision it awaits and the owner of that decision:

| Requirement                                                 | Unresolved decision                                                                                                           | Owner                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Network escalation (on request, or after a sandbox refusal) | Raw execution currently has no network; reaching the network needs an attributable, enforceable network grant per action.     | Execution authority and sandbox contracts |
| The Full access preset                                      | Whether an unconfined, network-enabled preset is offered at all, and under what trust signal.                                 | Product policy (master)                   |
| Layered configuration (user, project, launch)               | How user-level profiles and trusted project files combine with the host's launch-scoped permission profile and settings file. | Host configuration contract               |

## Vocabulary

| Term            | Meaning                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Action          | One requested tool invocation with its exact arguments.                                                                           |
| Effect          | What an action would do, declared by its tool: read paths, write paths, run a program with read or write access, use the network. |
| Workspace roots | The directories the session was given, plus private temporary storage.                                                            |
| Protected paths | Locations that stay read-only even inside a writable root.                                                                        |
| Sandbox level   | What the operating system permits: read-only, workspace-write, or full access.                                                    |
| Approval mode   | When a person is asked: untrusted, on request, or never.                                                                          |
| Reviewer        | Who answers an approval request: the person, or an automatic reviewer acting within the same limits.                              |
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
  processes run inside the operating-system sandbox, and file reads and writes
  go through one workspace file service that refuses anything outside the
  decided roots and protected paths. A bug in a tool or in the decision cannot
  widen access.
- **L4 — Approvals are exact and durable.** An answer authorizes one action's
  effect, survives restart, and is invalid for any other action.
- **L5 — Unsupported enforcement fails closed.** Where a sandbox level cannot be
  enforced on the platform, actions needing it are refused, not run loosely.
  See [Execution authority](./execution-authority.md#a9--unsupported-enforcement-fails-closed).

## Sandbox levels

| Level           | Files                                                          | Programs                                      | Network |
| --------------- | -------------------------------------------------------------- | --------------------------------------------- | ------- |
| Read-only       | Read within workspace roots.                                   | Run with read-only access to workspace roots. | Off     |
| Workspace-write | Read and write within workspace roots, except protected paths. | Run with the same access, confined by the OS. | Off     |
| Full access     | Anywhere the user can.                                         | Unconfined.                                   | On      |

Protected paths under a writable root: version-control metadata, agent
configuration directories, cloud credential directories, and the host's own
state and credential stores. They stay readable where the level allows reads.

Protection is decided when a program starts. Version-control metadata, the
shared agent directory and cloud credential directories are protected once they
exist, so a program can initialize a new repository but a later program cannot
rewrite it. The agent's own configuration directories are protected even before
they exist, so creating one always needs the person's approval. The host's own
stores are always protected. The agent's file tools never write any of these
names, in any letter case, since a case-insensitive volume resolves `.GIT` to
`.git`.

## What a program sees

A program the agent runs should behave as it does in the person's terminal,
minus the access the sandbox level withholds:

- **Environment.** It inherits the person's environment, including the search
  path, so ordinary tools resolve by name. The host removes its own internal
  variables and every secret it was launched with: the provider credential and
  the bearer tokens of its listeners and tool peers. Provider credentials are
  never placed in the environment by the host.
- **Reads.** Under read-only and workspace-write it may read anywhere the person
  can, except the host's own state and credential stores. Toolchains,
  interpreters and shell startup files therefore work without listing them.
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

| Mode       | Behavior                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Untrusted  | Ask before any action that writes or runs a program, unless a configured rule allows it.                                           |
| On request | Run actions the sandbox level allows without asking. Ask when the model requests escalation or when the sandbox refused an action. |
| Never      | Never ask. Actions beyond the sandbox level are refused.                                                                           |

Under **on request**, an action the sandbox refused can be retried with more
access after a fresh approval of that retry. The model may also request
escalation up front, for example to reach the network, with a justification
shown to the reviewer.

## Presets

| Preset         | Sandbox level   | Approval mode | Reviewer           | Summary                                                                         |
| -------------- | --------------- | ------------- | ------------------ | ------------------------------------------------------------------------------- |
| Read only      | Read-only       | On request    | Person             | Reads the project; asks to edit files or use the network.                       |
| Default        | Workspace-write | On request    | Person             | Reads, edits and runs commands in the project; asks for network or other files. |
| Approve for me | Workspace-write | On request    | Automatic reviewer | As Default; an automatic reviewer answers approval requests within limits.      |
| Full access    | Full access     | Never         | —                  | No sandbox and no questions.                                                    |

**Default is the default** for a project the person opened. Models handle
editing and running commands inside a project well, and asking for each step
costs more attention than it protects. A project the person has not marked as
trusted starts as Read only.

The automatic reviewer never widens limits: it can approve only what the person
could approve, and when it cannot decide, the request goes to the person.

## Configuration

Policy is configuration, not interface. It is set in plain configuration files
that the person and their tools can read, version and diff:

- a **user-level** file with personal defaults and named profiles;
- a **project-level** file in the project, honored only for a trusted project;
- **launch options** that override both for one session.

Each layer can set the preset or the individual sandbox level, approval mode,
reviewer, additional writable roots, and network access. More specific layers
win. A changed configuration applies to the next session or turn; a running
action keeps the access it was decided with. A product may show which preset is
active and switch between presets; it does not need settings screens for the
individual fields.

## Conformance scenarios

| Situation                                            | Default preset                                      |
| ---------------------------------------------------- | --------------------------------------------------- |
| Edit a file in the project                           | Runs.                                               |
| Initialize a repository in a project without one     | Runs, confined.                                     |
| Write inside existing version-control metadata       | Refused by the sandbox; may ask to retry.           |
| Create the agent's configuration directory           | Refused by the sandbox; may ask to retry.           |
| Run a build or test command in the project           | Runs, confined.                                     |
| A command needs the network                          | Refused by the sandbox; asks to retry with network. |
| Read or write a path outside the project             | Asks.                                               |
| The person is unavailable and approval mode is never | Refused with a typed denial; the turn continues.    |
| The host cannot enforce the sandbox on this platform | Commands are refused; file tools still apply L3.    |

## See also

[Execution authority](./execution-authority.md) ·
[Tools](./tools.md) · [Hooks](./hooks.md) ·
[Runtime environments](./environments.md)
