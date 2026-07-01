---
title: Tool Design
description: The design discipline for shaping an agent tool before it is written — the doctrine behind the tool contract. A tool is a contract authored for a consumer that cannot be renegotiated with and cannot be migrated. Minimal surface, host config off the arguments, grounded and honest knobs, auto-resolved inputs, context-frugal and clearly-failing results, and when to reach for a tool versus a connector versus a skill.
keywords:
  [
    agent-system,
    tools,
    tool-design,
    minimalism,
    honesty,
    context-window,
    permissions,
    mcp,
    skills,
    ergonomics,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Tool Design

[Tools](./tools.md) defines the **contract** every tool obeys — what it
self-describes, the capability it declares, the result envelope it
returns. This page is the **discipline**: how to decide a tool's _shape_
before it is written, and how to choose whether a capability should be a
tool at all.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**
are used as in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## The job

The job of a tool is to let an agent work **confidently** and **easily**.

- _Confidently_ — the agent can predict what the tool will do, trust that
  the result says what actually happened, and recover from failure on its
  own.
- _Easily_ — the agent expresses intent in the fewest terms it already
  has, and the system does the rest.

Everything below serves those two words.

## The consumer you cannot change

A tool is a contract, and its consumer is a language model. That consumer
differs from an ordinary API's in two ways that shape the discipline:

- **You cannot supervise it.** You cannot file a migration ticket against
  a model or hand it your release notes. It takes the surface literally,
  fills every argument you expose, and forms habits on what it sees.
- **Changing the surface is costly — most costly where the model is most
  fluent.** A name the model was trained on, it calls well; rename it and
  quality drops, which is why the
  [locked fundamental set](./tools.md#locked-fundamental-tools) is locked.
  For a tool the model never trained on, the cost is narrower — keeping
  live and resumed sessions consistent with the calls already in their
  transcripts — but it points the same way: a shape is easier to grow
  than to take back.

From this follows the **retraction asymmetry**: growing a tool later — a
new optional argument, a richer result — is cheap and backward-safe.
_Retracting_ an argument is not, because the model has already learned to
pass it (from training, or from earlier turns in a live session).
Therefore: **when in doubt, leave it out.** A surface you cannot take back
costs more than one you can grow. A tool SHOULD ship as the smallest thing
that lets the agent express the intent.

This is the same discipline that governs designing a software
development kit for a developer you cannot supervise — default to _core,
not customizable_, and make customization the exception you defend case by
case. The consumer differs (a model, not a developer), so the failure
modes differ, but the stance is identical: **the surface's job is to
refuse the wrong shape.**

## The five lenses

Every decision about a tool — whether it should exist, what it accepts,
what it returns, what it may touch — is read through five lenses. A good
tool answers all five; a bad tool fails one and the model pays for it.

### 1. Awareness — can the agent ground and express this?

The agent can only use a parameter whose valid values it can _know_, and
can only express intent in terms it already _has_.

- A parameter the agent cannot enumerate or ground (an opaque id, a
  provider-internal handle) is noise it will fill with a guess.
- Prefer one natural-language argument over many typed knobs. A model is
  fluent in prose; it is not fluent in your enum. Composition cues
  ("a wide landscape", "more muted") ride better _inside_ a prompt than as
  separate parameters.
- The tool's `description` is the agent's entire onboarding. It MUST state
  what the tool does, what it does _not_ do, and when to reach for it.

### 2. Honesty — does it do what it says and say what it did?

A tool that lies corrupts every decision the agent makes downstream,
because the agent has no independent way to check.

- **No parameter the system silently ignores.** A knob the provider drops
  on the floor is a lie the model will trust and reason from. Verify a
  knob works against the real backend before exposing it; if it does not
  reliably work, it MUST NOT be a parameter.
- **Results report the real outcome**, in the terms of what the tool
  actually did — not what was hoped for.
- **Never promise what the channel cannot carry.** If the transport
  between tool result and model cannot deliver a payload (for example,
  pixels cannot ride a text-only tool result on every model), the tool
  MUST NOT pretend to; it returns a faithful descriptor instead, and a
  separate surface delivers the payload where the channel allows. The
  read-versus-perceive split is the worked instance of this — see
  [Visual perception](./vision.md).

### 3. Context economy — every token is rent

The context window is the agent's working memory and a finite budget. A
tool spends that budget three ways, and all three are design choices:

- **Its existence.** Every tool's name and description sit in context
  whether or not it is called. A rarely-needed capability that is always
  loaded is rent paid every turn — that is the argument for skills and
  lazy connector discovery (below), not more tools.
- **Its inputs.** Large inputs inflate the call. Prefer a reference the
  system can resolve (a path, a URL) over an inlined blob the agent must
  carry in context.
- **Its outputs.** A result SHOULD return the _least_ that carries the
  outcome. Heavy payloads (bytes, long file bodies) SHOULD be deferred
  behind a handle the agent can re-fetch on demand, not inlined by
  default. A perception that can be re-viewed SHOULD be evictable so it
  does not re-fill context every turn (see [Visual perception](./vision.md)).

### 4. Permission and security — a tool is a trust boundary

A tool is the agent's reach into the world, and the place that reach is
bounded.

- **Least privilege.** A tool declares the capability surface it needs and
  no more; the runtime grants exactly that (see
  [Tools / capability requirements](./tools.md#capability-requirements)).
- **Host config is injected, never an argument — for two different
  reasons.** _Security-bearing_ config (credentials, root paths, the
  capability surface) MUST stay off the arguments because an agent that
  could name it could widen its own reach; this is the trust boundary.
  _Policy_ config (model, provider, locale) is injected for a different
  reason: the agent cannot ground valid values, and these are the user's
  settings — decided by the host at construction or per turn. Both are
  injected; only the first is a security boundary, and defending one on
  the other's grounds gets the reason wrong even when the conclusion is
  right.
- **Effects that are outward-facing or hard to reverse gate through
  review.** The pre-execute watchdog can refuse any call with a reason the
  model reads (see [Tools / the watchdog](./tools.md#the-watchdog)); a
  destructive or outward action SHOULD pass through it rather than fire
  unsupervised.

### 5. Ergonomics — the agent passes the dumbest sufficient input

"Easily" means the agent hands over the simplest thing that names its
intent, and the **system resolves the rest**.

- **Auto-resolve simple inputs.** If a tool needs an image, let the agent
  pass a path _or_ a URL and resolve it inside the system — read the
  bytes, fetch the URL, encode as needed. Do not make the agent pre-encode
  a blob or pre-fetch a URL; that is system work masquerading as a tool
  argument. The agent should not have to know the wire format the backend
  wants.
- **Defaults over required knobs.** Anything with a sensible default
  SHOULD have one. A required argument is a question the agent must answer
  every call; make it answer only the questions that carry intent.
- **Fall into the pit of success.** The shortest correct call should be
  the obvious one.

## Clear failure is part of the contract

A tool that fails MUST fail in a way the agent can act on. Confidence
depends as much on good failures as on good successes.

- A failure is a **typed result the agent reads**, not an exception that
  ends the run. The agent reacts to a tool result; an unhandled throw
  denies it that chance.
- The message states **what was wrong and what to do next**, naming the
  offending input. "reference _X_ was not found — pass a workspace path, a
  URL, or inline data" lets the agent self-correct on the next turn;
  "internal error" does not.
- Distinguish the **kinds** of failure the agent should treat differently
  — invalid input (the agent's call was wrong), unavailable (a capability
  is missing), and a backend error (nothing the agent did) lead to
  different recoveries. Collapsing them into one opaque error throws that
  signal away.

This is the same envelope every tool returns (see
[Tools / result envelope](./tools.md#tool-result-envelope)); the design
obligation is to populate it with something _actionable_.

## Tool, connector, or skill

Not every capability should be a tool. Three surfaces extend what an agent
can do, and they answer three different questions. The
surface-selection matrix is canonical in
[Skills / decision matrix](./skills.md); this is the _design reasoning_
behind it.

- A **tool** is a capability you **own and shape**. It is part of the
  always-reachable vocabulary, so it pays context rent every turn — which
  is exactly why it MUST be held minimal. Reach for a tool when the
  capability is core, frequent, and yours to keep small.
- A **connector** (an MCP server or other user-plugged source) is a
  capability you **bridge but do not own**. Its shape is foreign, it is
  untrusted by default, and it is discovered lazily rather than sitting in
  the base vocabulary (see [MCP and Connectors](./mcp.md)). Reach for a
  connector when the capability lives in someone else's system and you do
  not control its surface.
- A **skill** is **not a capability at all** — it is procedural knowledge,
  a recipe for _using_ capabilities, loaded on demand and free until
  invoked (see [Skills](./skills.md)). Reach for a skill when the thing is
  a procedure (prose, deletable without breaking the agent), not a new
  callable.

Two failure modes follow from confusing them:

- **A procedure smuggled into a tool** bloats the always-loaded surface
  with what should have been a load-on-demand skill.
- **A foreign API transcribed knob-for-knob as hand-written tools**
  re-imports that API's entire parameter surface into the always-loaded
  vocabulary — the opposite of minimal. Wrapping a foreign capability is
  fine, even good, when you curate it _down_ to the one minimal operation
  the agent needs; the anti-pattern is mirroring the whole surface. When
  you would not curate it — many operations, a shape you do not control —
  it belongs behind a connector, discovered when needed.

The deciding questions, in order: _Is it a capability or a procedure? Can
I curate it to a minimal, stable shape worth keeping always-loaded? Must
it be always reachable, or can it load on demand?_

## The test

Before shipping a tool, read it as the model will:

> Given only this tool's description and its parameter schema, would the
> model call it correctly on the first try — and could it trust the
> result and recover from the failure without help?

This is a thought experiment first and a measurement second: when a tool's
shape is genuinely contested, the resolution is to run it against real
calls, not to argue it. But most of the time the thought experiment is
enough — and when it says no, the surface is wrong, not the model. Cut the
argument, default the knob, resolve the input, return a reason. The
smallest honest tool is the one the agent uses best.
