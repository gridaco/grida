---
name: sdk-seam
description: >
  Discipline for the seam between two SDKs (or two sides of one
  contract) that the same hand writes. The failure mode: "we own
  both sides" produces dirty contracts no foreign reviewer would
  accept. The exercise: pretend the other side is FFI, IPC, or a
  network protocol you cannot rewrite. Spawn an adversarial subagent
  profiled as the producer's maintainer; negotiate the change as a
  feature request, not a PR. Companion to $sdk-design.
  Language-agnostic — applies to a TS package + its consumer, a Rust
  crate + its WASM binding, two services sharing a wire format, or
  any other boundary the same author writes both ends of.
---

# sdk-seam

> Companion to [`sdk-design`](../sdk-design/SKILL.md). Read that
> first; its deciding table and disciplines are the foundation this
> skill builds on. Where `sdk-design` is about a single SDK's
> surface, this skill is about the **seam** — the joint between two
> SDKs (or two sides of one contract) — and what it takes to keep
> that joint clean when the same author writes both sides.

## The failure mode

When you control both sides of a boundary, you produce dirty
contracts — **simply because you can.** A field gets added on the
producer side because the consumer needs it; the consumer reaches
into the producer's internal shape because no public view exposes
the slice; a one-off helper crosses the boundary because "we're
going to refactor it later." Six months later the contract is
unrecoverable, and the two sides can only be deployed together.

The honest test: **if we couldn't shotgun-edit both sides at once,
this design wouldn't be possible.** That's not a virtue. It's a
warning.

If the contract had been an IPC channel, an FFI ABI, a network
protocol, or a published-versus-consumed package boundary from the
start, the design would have been clean from the beginning, and it
would have evolved cleanly. Cross-boundary work inside one repo,
one workspace, or one mono-language project doesn't get that
discipline for free — you have to manufacture it.

This applies to:

- Two `packages/grida-*` packages where one consumes the other.
- A package and its host application (a `crates/*` crate + a binary that links it; an npm package + a Next.js app).
- A Rust crate and its WASM/FFI bindings (where one party can change generated code on the other side at will).
- Two services sharing a wire format you control on both ends.
- Two modules within one package that genuinely should be on opposite sides of a contract (because one is "core logic" and the other is "shell" — see $sdk-design D2).

## The exercise

Before editing, restate the work as if you only owned one side.

For every change that crosses a seam, write down:

1. **Which side initiates.** What concrete problem on side A forced you to look at side B?
2. **What contract change is being requested.** Phrase it as a feature request to side B's maintainer ("HUD: please add `down_doc` to the `translate_tangent` gesture so absolute-position commits can detect click-no-drag").
3. **What side B's maintainer would push back on.** What's the alternative shape? What invariant of side B does the requested change threaten? What test would side B add to defend it?
4. **What ships in this PR vs. follow-up.** Often the answer is: side B's contract change ships first, locked by tests, then side A is updated against the new contract.

If you can't fill in (3) credibly, you haven't designed the change
— you've just typed the diff.

## The subagent move

When the change is non-trivial, **delegate the work to a subagent
profiled as the producer's maintainer.** This is not a review
step; it is the actual implementation handoff. The subagent
defends, decides, AND ships the producer-side change. The main
agent never touches the producer's files.

This is the mechanism that keeps the contract unopinionated and
agnostic: the subagent doesn't have your consumer-side context, so
it can't be tempted to "just add the field." It has to reason from
the producer's own invariants — its README, its tests, its
anti-goals — and respond as if it were any other foreign maintainer
fielding a feature request from any other consumer.

### The flow

```
┌─────────────────────┐                  ┌──────────────────────┐
│  Main agent         │                  │  Subagent            │
│  (consumer side)    │                  │  ("you are the       │
│                     │                  │   maintainer of X")  │
│  1. Writes          │  FEEDBACKS.md →  │  3. Reads README +   │
│     FEEDBACKS.md    │                  │     FEEDBACKS.md     │
│  2. Spawns subagent │                  │  4. Defends / accepts│
│                     │                  │     / counter-       │
│                     │                  │     proposes         │
│                     │                  │  5. Implements the   │
│                     │                  │     producer change  │
│                     │  ← decision +    │  6. Writes producer  │
│  7. Reads decision  │     diff summary │     tests            │
│  8. Updates         │                  │  7. Returns          │
│     consumer side   │                  │     verdict + diff   │
│     against the     │                  │                      │
│     SHIPPED contract│                  │                      │
└─────────────────────┘                  └──────────────────────┘
```

### Step 1 — write the FEEDBACKS.md (or equivalent artifact)

The requester writes a self-contained feature request. Name it
whatever fits the workflow — `FEEDBACKS.md`, `REQUEST.md`,
`<package>/_inbox/<date>-<topic>.md`, a GitHub-style issue draft.
The format matters less than the contents.

The artifact MUST contain:

1. **The consumer's problem in producer-neutral terms.** What
   _observable_ behavior is wrong or missing? State it without
   reference to the consumer's internal architecture.
2. **The minimal contract change being requested.** A field, a
   variant, a relaxation, a new method. Spell out the proposed
   shape, but flag it as a _proposal_, not a directive.
3. **What invariants of the producer the requester thinks are at
   risk.** Honest acknowledgment that the requester knows they're
   asking for something that touches the producer's design — and
   why they think it's worth it.
4. **What the requester has already considered and rejected.**
   Alternative shapes, consumer-side workarounds, why they don't
   fit. This is what keeps the subagent from suggesting the same
   options back.
5. **What success looks like.** A test the producer could write
   that, if it passes, satisfies the request. Phrased in
   producer-only terms.

The artifact MUST NOT contain:

- Direct file edits or diffs for the producer side. The subagent decides those.
- Pressure phrasing ("we need this by EOD," "just add the field").
- References to the consumer's internal types or call sites that wouldn't survive a refactor.

### Step 2 — profile the subagent as the maintainer

Spawn the subagent with a brief that names the producer and its
authoritative docs:

> You are the maintainer of `[package/crate X]`. Your authoritative
> doctrine is `[path/to/X/README.md]` and `[any AGENTS.md, design
docs]`. Read those before responding to any feature request.
>
> A consumer has filed `[path/to/FEEDBACKS.md]`. Process it as
> you would any external feature request:
>
> 1. Read the FEEDBACKS.md and the producer's README/AGENTS.md.
> 2. Decide: **accept**, **counter-propose**, or **refuse**.
>    - Accept: implement the requested shape, possibly with tightened naming or added invariants.
>    - Counter-propose: implement an alternative shape that solves the same observable problem but fits the producer's design better.
>    - Refuse: cite the anti-goal or invariant violated, propose how the consumer can absorb the problem differently.
> 3. If accepting or counter-proposing, **ship the change**: edit
>    the producer's source, add producer-side tests that lock the
>    new contract in producer-only terms (no naming the consumer),
>    update the producer's README/doctrine if the rule generalizes.
> 4. Return a verdict (accept / counter / refuse), a one-paragraph
>    rationale, and a summary of the diff (file paths + what
>    changed). Do NOT touch consumer-side files.

The subagent's tool access should be scoped to the producer's
files only — or, if that's not enforceable, the instruction must
be unambiguous. Consumer-side files are off-limits for this
subagent.

### Step 3 — main agent reads the verdict, then updates the consumer

The subagent returns one of three outcomes. The main agent's next
move depends on which:

- **Accept / counter-propose with diff.** The producer change has
  shipped (locally). The main agent reads the new public contract
  — from the producer's exports, not from the subagent's
  description — and updates the consumer against it. Producer
  tests run; consumer tests run.
- **Refuse.** The main agent does not edit the producer to override
  the refusal. Either absorb the problem on the consumer side per
  the subagent's suggestion, or escalate (rewrite the FEEDBACKS.md
  with better grounding, re-spawn). "I'll just edit both anyway"
  is the failure mode this whole skill exists to prevent.

### Why this is more than ceremony

Three things only this flow gets right:

1. **The producer side never sees the consumer's pressure.** The
   subagent has no investment in shipping the consumer's PR — its
   reward is a producer that stays clean. That asymmetry is what
   foreign maintainers have for free and same-hand authors lose.
2. **The producer's README becomes load-bearing.** The subagent's
   only authority is the producer's own doctrine. A vague README
   produces a vague decision; a strict README produces a strict
   one. This is real pressure to keep $sdk-design D4 (anti-goals)
   and the README sharp.
3. **The producer's diff is small and self-contained.** The
   subagent ships one change with one set of tests, written
   without naming the consumer. The next consumer of the same
   producer inherits the rule for free — see $sdk-design D1 and
   the worked example below.

### When NOT to use the subagent

- **Pure consumer-side fix.** No producer change needed. Don't spawn.
- **Producer change is mechanical** (rename, doc-only, format) and obviously doesn't touch the contract.
- **You've already filed the same FEEDBACKS once and got a refusal.** Don't re-spawn to get a different answer. Either rewrite the request with new grounding or absorb on the consumer side.

### Common subagent outcomes

- **Accept.** The subagent implements the requested shape, possibly
  with tightened naming (renames the field), added invariants
  (JSDoc/rustdoc clauses, runtime guards), or a more conservative
  default (the field is optional with a safe default, not
  required).
- **Counter-propose.** The subagent implements an alternative — e.g.
  "carry the data through the existing event stream instead of a
  new struct field," "expose a derived computed view instead of
  the raw state slice," "split the request into two narrower
  methods." The main agent reads the counter, updates the consumer
  against the actual shape.
- **Refuse.** The subagent rejects, points to the anti-goal it
  violates (see $sdk-design D4), and proposes the consumer absorb
  the problem differently. Cites the README section that grounds
  the refusal.

Each outcome produces a cleaner contract than "just add the field
because we control the file."

## Four procedural patterns

These are language-agnostic. They apply whether the boundary is a
TypeScript module export, a Rust trait, a FlatBuffers schema, a
JSON-RPC method, or a C ABI.

### Stage 1 — contract first

When the contract has to change, **change the contract first, in
its own commit (or its own logical unit of work).** Ship the
producer side with new tests against the new shape. Only after the
contract is locked do you update consumers against it.

Anti-pattern: "I added the field and the consumer that needs it in
the same hunk." The producer-side test for the field is the
consumer's test by accident, and the contract isn't really
specified — it's just whatever the consumer happened to need.

### Stage 2 — every contract change earns a test on the producer side

Every new field, every new variant, every relaxation of an existing
shape — the producer adds a test that pins the new behavior in
producer-only terms. "Given input X, the API returns Y with field
Z set" — **without naming the consumer that asked for it.**

A producer test that mentions only the consumer's use case is a
contract that breaks when the consumer leaves. The doctrine
generalizes the grep-contract idea from $sdk-design: scenario
names belong in test text, not consumer references.

### Stage 3 — never reach across a boundary in the same edit window

If you have two files open from two sides of a boundary and you're
editing them in tandem, **stop.** Either:

- Land the producer change, run its tests, commit (or stage) — then move to the consumer.
- Or revert the consumer change and re-state it as a feature request to the producer.

This is the boring procedural step that prevents the bad design.
The reason seams in foreign systems stay clean is that the deploy
boundary forces this sequencing. Manufacture the same
sequencing here by hand.

For a Rust crate ↔ WASM binding, this means: change the crate's
public function signature, regenerate bindings as a separate step,
then update the binding's callers. Not all three in one edit.

### Stage 4 — consumer side never reads producer internals

A producer that exposes "subscribe to anything" or "raw state"
surfaces is one a consumer will inevitably reach into.
$sdk-design D1 ("Subscribe to outcomes, not events") is the
prevention; this subskill is the discipline when the prevention
hasn't fully landed yet.

If the consumer wants something not in the public observation
surface, **the consumer files a feature request**, doesn't reach.
"There's no public view for [internal field X], so I'll just access
it via the internal property / via reflection / via `pub(crate)`" is
the moment a contract dies.

## A worked example (illustrative)

The session that produced this skill added a `down_doc` field to a
gesture struct on one side of a boundary to fix a click-no-drag
mutation on the other. The fix was correct, but the way it landed
was clean only because the procedural steps were followed:

| Step                    | What happened                                                                                                                                                                                                 | If it had gone wrong                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Diagnose                | $etiology ladder: symptom is "control moves on bare press." Proximate: absolute-position commit writes pointer position even when pointer didn't move. **API contract:** absolute vs delta gesture asymmetry. | Skipping the ladder, we'd have added `if (dx === 0 && dy === 0)` in the consumer — bandaid that leaks. |
| Decide who owns the fix | Producer owns gesture state; the no-drag guard belongs in the producer's commit handler. Field is added to the producer's gesture struct, with doc explaining why it's distinct from existing fields.         | We could have written the guard on the consumer side. The next consumer would re-trigger.              |
| Lock the contract       | New test on the producer side: click-no-drag does NOT emit the commit intent. **Producer-only — doesn't name the consumer.**                                                                                  | Test on the consumer only — producer could regress silently.                                           |
| Update the doctrine     | Spec amendment added a Conformance rule: "Absolute-gesture click-no-drag is mute." Future consumers (other applications of the same producer) inherit the rule for free.                                      | Rule lives in someone's head; the next consumer re-discovers the bug.                                  |

The work that produced these clean outcomes was procedural. None of
it required new tooling.

**The trap avoided** — and that this skill exists to prevent — was
the version where, because we controlled both files, we silently
muted the commit on the consumer side and moved on. That version
would have shipped, the test suite would have stayed green, and
the next consumer of the same producer would have re-hit the bug
with no breadcrumb back.

## Smells that mean you're losing the discipline

- The diff touches two sides of a boundary in the same hunk and the producer-side test references the consumer's call site by name.
- A producer field carries documentation that says "used by `<consumer>` for `<feature>`" — the field is leaking the consumer's concern into the contract.
- The consumer imports a type or path from the producer that isn't in the producer's public entry (`index.*`, `lib.rs`'s `pub use`, the schema's `public` namespace, etc.).
- The producer's tests pass even when the consumer is broken (or vice versa) — i.e., the two sides have no independently verifiable invariants.
- You hesitate to ship the producer change without the consumer change because "it would be unused" — that's the contract-first sequencing speaking.
- The phrase "we control both sides" appears in your reasoning for skipping a step.

Any one of these is a stop-and-reset. Two or more is a redesign
signal.

## When the discipline gets relaxed (and why it's rare)

- **Contract is genuinely private.** Two files in the same package with no public re-export. Treat as one boundary — but if you want one boundary in two files because "the file is too big," extract first.
- **Hot loop ships together always.** A producer + adapter released as a single unit with byte-equal version locks. Even then, contract-first sequencing pays — it's the only way the producer becomes reusable later.

If neither applies, you're inside the boundary and the discipline
holds.

## Critique partners

- **`$pedantic`** — when defending a contract change, pedantic probes catch unfalsifiable rationale ("this field will be useful for future flexibility") and leaked-uncertainty ("we might need to extend this later" — quarantine and ship the minimum that's clear).
- **`$etiology`** — most cross-seam bandaids are API-contract bugs (rung 3 of the diagnostic ladder). The temptation to "just patch the consumer" almost always means the producer's contract is the real defect.

## The short version

- If we couldn't shotgun-edit both sides, this design wouldn't be possible — that's a warning, not a virtue.
- Restate the change as a feature request: which side initiates, what's the contract change, what would the other side's maintainer push back on?
- **Delegate the defense.** When non-trivial, spawn a subagent that owns one side and pushes back. Don't bypass it by editing both files in the same turn.
- **Contract first.** Ship the producer change with producer-side tests, lock it, then update consumers.
- **No producer test names the consumer.** No consumer reaches past the producer's public surface.
- **No edit-in-tandem across two sides of a boundary.** Sequence by hand what foreign deployment would sequence for free.
- Smells (cross-side hunks, doc naming consumers, hesitancy to ship the producer alone) are stop-and-reset signals.
