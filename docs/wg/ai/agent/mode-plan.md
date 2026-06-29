---
title: Plan Mode
description: Plan mode as a host-owned operating regime, not a model state. The plan/build pair, the four-invariant transition contract (mode is injected context; the agent proposes but never effects a switch; a transition is a human-gated re-injection; the plan is a reviewed artifact), the symmetry between entering and exiting, who may initiate a transition, and the read-only harness with its single carve-out.
keywords:
  [
    agent-system,
    plan-mode,
    mode,
    plan,
    build,
    transition,
    approval,
    read-only,
    agent-override,
    regime,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Plan Mode

Some work wants to be **proposed before it is done**. A user who cannot
yet articulate what they want can still recognize a good plan when they
read one; an agent that is about to touch many files is safer if it lays
out the change first and waits. Plan mode is the discipline that serves
both: the agent **explores read-only, produces a reviewable plan, and
executes only after a human approves it.**

This page specifies plan mode as a **mode** — a named operating regime —
and the contract that governs moving between regimes. It is the dedicated
treatment of the plan/build pattern introduced as an opinionated subagent
shape in [`subagents`](./subagents.md#plan--build-mode); that page says
plan mode is a pattern hosts MAY layer, and this page says **what that
pattern is** when a host chooses to ship it.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used as in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## What a mode is

An **operating mode** is a named regime that does two things, and only
these two: it **scopes the agent's capability** (which tools and writes
are reachable), and it is **communicated to the agent as injected
instruction** (the agent is told which regime is active).

The load-bearing claim of this page follows from the second half:

> **A mode is conversation context, not model state.** The host owns the
> active mode. The agent _reads_ its mode from injected instruction; it
> never _holds_ a mode bit it can set. There is no hidden mode engine the
> model flips.

Everything below is a consequence of taking that claim seriously.

Plan mode is the first such regime, and it is really a **pair** plus the
discipline of crossing between them: a `plan` regime that proposes and a
`build` regime that executes. The two are ordinary
[agents-as-data](./index.md#vocabulary) — same loop, different system
prompt and different permitted capability — and "plan mode" names the
contract that connects them.

## The two regimes

| Regime  | Purpose                                         | World-mutating capability                                       |
| ------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `plan`  | Read, explore, reason, ask, and produce a plan. | Denied (one carve-out — see [Harness](#the-read-only-harness)). |
| `build` | Execute the approved plan.                      | Allowed, under the session's normal permissions.                |

Vocabulary used throughout:

- **The plan** — a reviewable, _decision-complete_ proposal: detailed
  enough that an implementer (a person or the `build` agent) needs to make
  no further decisions. It is the artifact a human reviews at the gate.
- **Transition** — a change of active regime (`plan`→`build` or
  `build`→`plan`).
- **Propose** — the agent _signals_ that a transition is warranted (it
  has a plan ready, or the request would benefit from planning).
- **Gate** — the human act that authorizes a transition.

## The transition contract

Four invariants govern plan mode and the transitions between its regimes.
They are the normative core of this page; a conforming plan-mode
implementation MUST honor all four.

### I1 — Mode is host-owned injected context, not model state

The active regime MUST be carried to the agent as **injected instruction**
the host owns, and SHOULD be **re-asserted** as long as the regime holds,
so a long conversation cannot drift out of the regime it is nominally in.
The host owns the regime; the agent is _told_ it, not left to remember it.

A consequence: the agent's belief about its mode can never diverge from
the host's, because the agent has no independent store of it.

### I2 — The agent MAY propose a transition; it MUST NOT effect one

The agent can _signal_ that a transition is warranted, but it MUST NOT be
able to grant itself the capability the next regime carries. An agent in
`plan` cannot promote itself to writing; an agent in `build` cannot move
itself into `plan` unilaterally. **The agent proposes; the host disposes.**

This is what makes the read-only guarantee trustworthy: if the agent
could effect its own transition, "read-only" would be advisory.

### I3 — A transition is a host-injected, human-gated re-scoping message

A transition MUST be effected by the **host writing a fresh instruction
into the conversation** that (a) re-scopes the agent to the new regime
and (b) **states the regime change** to the agent ("you are no longer
read-only; you may now make changes," or its inverse). The transition MUST
be **gated on a human act** — no transition originates from the model's
own decision alone.

In this guide's session schema the carrier is the
[per-message agent override](./persistency.md#chat_messages): the new
regime's agent id is written onto the **next user message**
(`metadata_json.agent`), and the loop runs that agent for that turn and
onward; the opened-with `chat_sessions.agent` is left immutable. A
human's approval — whether a button or a typed "looks good, go" — is the
**same wire event**: a user message carrying the override. See
[`faq` / approve-and-auto](./faq.md) for why a click and a typed approval
are not different cases.

### I4 — The plan is an artifact the agent produces and a human reviews before execution

There MUST be a **plan** — a concrete proposal the agent produced — and a
human MUST have the opportunity to review it **before** `build` begins.
The gate in I3 is exercised _against_ this artifact. A transition to
`build` with no produced plan, or with no review opportunity, violates
the contract.

## Entry and exit are symmetric

Entering plan mode and leaving it are **the same mechanism in opposite
directions** — both are host-injected, human-gated re-scoping messages
(I3), and both may be agent-proposed but never agent-effected (I2). Only
the target regime differs.

| Transition      | Carrier                                          |
| --------------- | ------------------------------------------------ |
| enter `plan`    | next user message overrides the agent to `plan`  |
| exit to `build` | next user message overrides the agent to `build` |

A corollary worth stating because it is easy to get wrong: the **approve**
act is **not exit-specific**. The same "human authorizes, host re-scopes"
shape that confirms `plan`→`build` also confirms an agent's _proposal_ to
enter `plan`. There is one transition contract, used both ways.

## Who may initiate a transition

The contract fixes _how_ a transition happens (I2/I3); it leaves _who
initiates_ it as a set of host degrees of freedom. All of these preserve
the invariants — none is the model flipping its own bit:

1. **User-initiated.** The user enters or leaves a regime directly (a
   toggle, a command). The baseline; always available.
2. **Mode-default.** A class of task _opens_ in a regime. A scenario whose
   value is mostly in the planning (a design brief, a multi-file change)
   can begin in `plan` by default, so the first turn is already scoped.
   The default is a host/scenario decision, set before the turn runs.
3. **Agent-proposed, human-gated.** The agent recognizes that the request
   would benefit from planning (or that its plan is ready) and **proposes**
   the transition; the human confirms. The proposal MAY ride a
   host-shipped tool (a sibling of the [`question`](./tools.md) tool, in
   the proposing agent's agent-specific set — never the locked set) or the
   assistant's prose; either way the gate of I3 is mandatory.
4. **Host-routed.** A host classifier reads the incoming message and sets
   the regime _before_ the turn runs. This can feel automatic — "it
   switched to planning when I asked for a plan" — but the decision is the
   host's, not the model's, and so it does not violate I2.

A note on the phrase "automatically switch to plan mode when asked": the
trustworthy realizations of it are (3) and (4). A design that lets the
**model** read its own request and silently re-scope itself is a violation
of I2, however convenient it looks — it dissolves the guarantee that an
agent cannot grant itself capability.

## The read-only harness

The `plan` regime MUST be **unable to mutate the world** — the guarantee
in I2 is only as strong as its enforcement. _How_ a host enforces it is a
[binding](#bindings); the **requirement** is normative.

Hosts SHOULD enforce read-only at the **capability layer** — the
world-mutating tools are simply not reachable in `plan`, consistent with
this guide's rule that [deny is unconditional](./index.md#cross-cutting-invariants). A
prompt-only harness ("you are in plan mode, do not edit") is leaky: it
relies on the model's compliance for a safety property, and I2 asks for a
property that does not depend on compliance. Where a host cannot remove
capability, it SHOULD back the prompt with a sandbox that denies writes,
so the guarantee still does not rest on the model.

**The single carve-out.** The one mutation a `plan` regime MAY be
permitted is **writing the plan artifact itself** — and nothing else. This
lets the agent draft and revise the plan as a durable artifact without
opening a hole in the read-only guarantee. The carve-out MUST be scoped to
the plan artifact alone.

## The plan artifact

The plan is what the human reviews at the gate (I4). Two properties matter
at the spec level:

- **It is reviewable and decision-complete.** It states intent and the
  shape of the change in enough detail that approving it is a real
  decision, not a rubber stamp.
- **It is revisable while in `plan`.** Revision is **conversational**
  (the user steers, the agent refines) and MAY also be **direct** (the
  human edits the artifact). Re-proposing supersedes the prior proposal;
  a regime that stays in `plan` after a proposal simply keeps refining.

Whether the artifact is a **durable, named document** or a **transient
proposal** that lives only in the turn is a binding. A durable artifact is
SHOULD-preferred when the plan is meant to be re-opened, edited, or handed
off, because review, hand-off, and the write carve-out all assume
something concrete to point at.

## Bindings

These vary legitimately between hosts; a WG-conformant plan mode fixes the
contract above and leaves these open. The recommended lean is given, but
the alternative is conformant.

| Binding                 | The choice                                                        | Lean                                                           |
| ----------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Read-only enforcement   | Capability removal vs. prompt-plus-sandbox                        | Capability removal (the guarantee must not rest on compliance) |
| Plan representation     | Durable named artifact vs. transient in-turn proposal             | Durable, when the plan is reviewed / handed off                |
| Transition signal       | Host-shipped propose/exit tool vs. user toggle vs. prose proposal | Host's call; all preserve I2/I3                                |
| Mode-awareness carriage | One injected instruction at change vs. a per-turn re-assertion    | Re-assert (I1 asks the regime to hold against drift)           |

## Implementor checklist

A conforming plan-mode implementation MUST:

- Carry the active regime as injected instruction the host owns and the
  agent cannot set (I1).
- Prevent the agent from effecting its own transition; allow it only to
  propose one (I2).
- Effect every transition as a host-injected, human-gated re-scoping
  message that states the regime change (I3).
- Produce a plan and give a human the chance to review it before `build`
  (I4).
- Make `plan` unable to mutate anything except, at most, the plan artifact
  (Harness).

It SHOULD re-assert the active regime for as long as it holds (so it
survives compaction and long threads), and SHOULD enforce read-only at the
capability layer rather than by prompt alone.

## What this guide does not specify

- **The set of modes beyond `plan`/`build`.** A host MAY define further
  regimes; this page specifies the plan/build pair and the transition
  contract any mode pair would share.
- **The enforcement mechanism.** Capability removal, sandbox, or both —
  host territory, subject to the read-only requirement.
- **The plan artifact's representation and storage.** Durable document,
  transient proposal, where it lives — all conformant.
- **The approval UI.** A dialog, a command, a typed confirmation; the
  guide requires the gate, not its surface.
- **Mode-awareness carriage details.** Which injected message carries the
  regime, and at what cadence beyond "re-asserted while it holds."

## See also

- [Subagents](./subagents.md#plan--build-mode) — the opinionated pattern
  this page is the dedicated treatment of; agents-as-data with different
  permission sets.
- [FAQ](./faq.md) — approve-and-continue as a user message; the
  structured-pick paths; the "plan mode is not a protocol primitive"
  framing.
- [Persistency](./persistency.md#chat_messages) — the per-message agent
  override (`metadata_json.agent`) that carries a transition.
- [Skills and Project Instructions](./skills.md) — a scenario carried as a
  skill is a natural home for a mode-default and for the agent-proposed
  "when to suggest planning" instruction.
- [Tools](./tools.md) — the locked-vs-host-shipped boundary a
  propose/exit tool sits on; the `question` tool it is a sibling of.
- [Compositor](./compositor.md) — injected instruction and the
  user-view-vs-model-view lowering a re-scoping message rides on.
