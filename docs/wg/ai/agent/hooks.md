---
title: Agent Hooks
description: Configurable lifecycle automation with explicit decision points, scoped execution, and recoverable outcomes.
keywords: [agent, hooks, lifecycle, automation, permissions, durability]
format: md
tags: [internal, wg, agent-system]
---

# Agent Hooks

Hooks attach configured automation to named moments in agent work. A person
can load project context, check an impending tool action, record a result, or
require another verification pass before completion. The hook declares what
event it handles and what effect its response may have.

This is a proposed feature. The [feature catalog](../../../agent/features.md)
owns availability. The [master](./master.md) and host own the hook dispatcher and policy. The
[components](./components.md) supply ordinary execution and durability. The existing
[event channel](./events.md) remains an observational surface.

## Hook roles

| Role                 | Allowed effect                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Observation          | Record an event or contribute a diagnostic. Failure leaves the original operation's outcome intact.        |
| Context contribution | Supply bounded, attributed material for the master's next eligible context assembly.                       |
| Decision check       | Allow normal processing, reject a pending action, or request a completion recheck at a supported boundary. |

Every event defines its allowed result types. An unsupported result is an
explicit hook failure. Hook output retains its source and trust classification.
It cannot become a user instruction, grant access, or change the meaning of a
recorded result merely by claiming authority.

## Lifecycle boundaries

The initial useful surface covers the following moments. The exact public names
are fixed with the executable contract. An event is advertised only when its
behavior is supported through the selected host and backend.

| Moment                         | Meaning and allowed response                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session execution begins       | Context contribution when work first starts or explicitly resumes. Opening a view or subscribing does not trigger it.                                         |
| Accepted input is about to run | Inspect retained input before model/tool work. Contribute context or reject its execution with a reason. The accepted input and rejection remain visible.     |
| Before a tool action           | Check complete validated arguments before effect admission. Contribute context, allow, or reject that invocation.                                             |
| After a tool outcome           | Observe the actual completed, failed, or cancelled result and contribute follow-up context. The original outcome remains recorded.                            |
| Before turn completion         | Review the proposed completion and request bounded additional work. This occurs before terminal settlement.                                                   |
| After turn settlement          | Observe the committed outcome through the event channel. Executable handlers require separately admitted work and are outside the initial command-hook slice. |
| Interruption                   | Observe an explicit interruption through the event channel. Executable interruption handlers need a separate owner and are outside the initial slice.         |

Compaction and child-session start/finish events follow their owning feature's
boundaries when those slices land. Model-attempt events are observational and
retain attempt identity, including retries. Orderly session-end cleanup has a
bounded host-owned lifetime. Abrupt process loss cannot promise that cleanup ran.

A completion check and explicit user Stop have different authority. Additional
verification uses the same task limits and controls. A completion hook cannot
overrule Stop, resume a paused task, or create an unbounded continuation loop.

## Selection and execution

The host discovers definitions and records their source, revision, executable
binding, event, matcher, enabled state, limits, and allowed result types. The
master selects applicable hooks for accepted work. The selected revisions stay
fixed for that work. Changes apply at an explicit future boundary.

Start with command handlers and exact event/tool matching. Decision hooks run
in declared order. A rejection prevents the pending action and records which
later decision hooks were skipped. The first version waits for each bounded
handler. Background handlers, model-authored handlers, arbitrary expression
matching, and argument rewriting need separate contracts before exposure.

Hook commands run through the host's existing scoped execution capability.
Each has an owner, working directory, input/output bounds, deadline,
cancellation, and declared filesystem/network access. The lifecycle dispatcher
passes a versioned structured event and validates the response. Hook execution
does not recursively dispatch user hooks for its own internal operations.

Command handlers start only while their owning turn admits work. If Stop, Pause,
or shutdown closes admission before an after-action handler starts, record it
as cancelled or deferred under that control. A deferred check must complete
before normal dependent work resumes. Stop can withdraw it while preserving
the original tool outcome. Hooks have no implicit cleanup execution owner.

Before admission, recheck the target operation against current controls and
authority. Concrete tools validate their own content preconditions. Hook approval alone provides no execution
grant. A later argument-rewrite feature must validate the replacement and
invalidate approvals bound to the original action.

## Failure and recovery

A decision check declares whether successful completion is required. A required
check's error, timeout, or invalid response blocks the pending action with a
visible reason. An optional observer failure produces a diagnostic. A hook
running after an effect can prevent further work or completion when configured
as a required check, while preserving the actual effect's outcome.

Each invocation binds a stable event occurrence, selected definition revision,
and target operation or settlement. Record intent before an effect and its
outcome before dependent work. Recovery reuses a committed hook result. An
interrupted external command follows its declared reconciliation/retry rules.
An arbitrary command cannot promise exactly-once external effects.

Observation by a UI remains read-only. Reconnect and history replay do not run
hooks again. Hook-generated context and diagnostics have bounded retention and
the same access controls as their source task. Large output uses declared
truncation or a retained artifact reference.

## Configuration and trust

Users can inspect hook sources, covered events, enabled state, latest result,
and execution scope. New or changed executable hooks from projects or plugins
require explicit trust before use. Inspecting a project never executes its
hooks. Managed mandatory checks remain subject to the host's authority policy.

Conversational installation or editing uses the same validated configuration
path as the client. The agent may prepare and explain a definition. It cannot
approve newly discovered code on the user's behalf. Changes expose what will
run, where, with which access, and when the change becomes active.

## Conformance scenarios

| Situation                                               | Required observation                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A project supplies an untrusted hook                    | It is visible for review and does not execute on discovery.                      |
| A pre-tool check rejects a command                      | The command has no admitted effect, and the reason identifies the check.         |
| A required check times out                              | The target stays blocked and the timeout remains distinguishable from rejection. |
| An after-tool hook fails                                | The actual tool result remains available alongside the hook failure.             |
| A completion check asks for more work after Stop        | The task stays stopped.                                                          |
| A process restarts after a committed hook result        | Recovery consumes that result without repeating its effects.                     |
| A hook was interrupted with an unknown external outcome | Recovery reports uncertainty and follows its declared recovery policy.           |
| A client reconnects or reads history                    | No hook execution or new work occurs.                                            |

Codex provides a reference for configurable lifecycle events, command/MCP
handlers, hook review, and event-specific outcomes. Its documented error and
concurrency behavior differs from the required-check and ordered-decision
semantics selected here. Exact compatibility with its configuration is a
separate integration decision. [Codex hooks](https://learn.chatgpt.com/docs/hooks).
