---
title: Plan Mode
description: The Plan operating regime as a host-owned property of each accepted input. The regime pair, the transition invariants (the host owns the regime, the agent recommends but never effects a change, a person authorizes execution, the plan is reviewed before Act), capability-layer enforcement, and the narrow plan-artifact carve-out.
keywords:
  [
    agent-system,
    plan-mode,
    operating-regime,
    plan,
    act,
    transition,
    read-only,
    capture,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Plan Mode

Some work should be proposed before it is done. A person who cannot yet state
exactly what they want can still recognize a good plan, and an agent about to
change many files is safer if it lays out the change and waits. **Plan** is the
operating regime that serves both: the agent investigates under a narrow grant,
produces a reviewable plan, and nothing in the task's target changes until a
person authorizes **Act**.

[Master](./master.md#agent-effort-and-operating-regime) defines Plan and Act as
the operating regime and keeps it independent of agent effort.
[Experience](./experience.md#plan-before-acting) owns what a person sees. This
page owns the transition invariants and the enforcement requirement.

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## The regimes

| Regime | Purpose                                                  | Changes to the task's target                                   |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| Plan   | Investigate permitted material, ask, and produce a plan. | None. One narrow carve-out for the plan itself (see below).    |
| Act    | Carry out the request.                                   | Permitted under the person's grants and the permission policy. |

- **The plan** is a reviewable, decision-complete proposal: the intended result,
  the important decisions, and how success will be checked. Approving it is a
  real decision, not a formality.
- A **transition** changes the regime that later work runs under.

## Transition invariants

### P1 — The regime is host-owned and captured with each input

Accepting an input captures its regime with its other choices
([Master / input during work and stopping](./master.md#input-during-work-and-stopping)).
The host tells the agent which regime applies to every step it prepares. The
agent holds no regime state of its own that could drift from the host's.
Queue edits that keep the input's identity keep its regime unless the person
explicitly changes it, and recovery after interruption or restart resumes under
the captured regime.

### P2 — The agent may recommend a transition; it never effects one

The agent can say that a plan is ready or that a request would benefit from
planning. It cannot grant itself the capability of another regime: work in Plan
cannot reach Act's tools, and work in Act cannot move itself into Plan. A
regime that the agent could leave on its own would make Plan advisory.

### P3 — A person authorizes execution

Moving from a plan to its execution requires a person's act — sending new input
under Act, or an equivalent explicit control. Steering into a running Plan turn
stays in Plan. Entering Plan can be a person's choice or a host default for a
class of task, set before the work is admitted; a host classifier MAY also set
the regime before admission. None of these is the model choosing its own
authority.

### P4 — The plan is reviewed before Act begins

There is a plan the agent produced, and the person has the opportunity to read
it before authorizing execution. A Plan turn can also end with questions or a
decision that no change is needed; the person then chooses what to do next.

## Enforcement

Plan MUST be unable to change the task's target, and that guarantee MUST NOT
depend on the model's compliance. The host enforces it at the capability layer:
commands, file mutation, editor mutation, generation that writes results,
settings changes, and timers are absent from the turn's offered tools, and the
host rejects them if requested anyway. Investigation tools run under the
existing read grants.

Delegation cannot widen the boundary: work started from a Plan turn receives no
capability Plan withholds. A Plan turn can observe or stop retained Act work but
cannot resume it.

**The single carve-out.** A host MAY permit one write: saving the plan to a
location identified as the plan's own, separate from the task's target. The
grant covers that location alone. Without it, the plan is the turn's reply.

## Not specified here

- Regimes beyond Plan and Act. Any further regime pair follows the same
  invariants.
- The representation of the plan: a reply, a saved document, or both.
- The control surface: a badge, a command, a toggle, or a protocol field.

## See also

- [Permission policy](./permissions.md) — the grants Act runs under.
- [Tools](./tools.md) — how a turn's offered set is selected.
