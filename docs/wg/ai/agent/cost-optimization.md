---
title: Cost Optimization
description: Doctrine for running frontier models as agent models without burning money on waste. The agent-loop cost model (every token is re-billed every step), the ledger of measured leaks — missing prompt caching, tool-result echo, unbounded replay, window/threshold/tier decided separately — and the quality-first ordering that spends effort on quality-neutral fixes before quality-tradeoff ones.
keywords:
  [
    agent-system,
    cost,
    tokens,
    prompt-caching,
    cache,
    context-window,
    compaction,
    pruning,
    pricing,
    observability,
    doctrine,
  ]
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Cost Optimization

An agent system that runs a frontier model runs the most expensive
compute it will ever buy, in a loop, unattended. Cost is therefore a
**first-class design dimension** of the system — on par with the tool
contract and the session lifecycle, and designed in the same places.

This page is a **doctrine and case study**, not a tool spec. It names
the cost model of an agent loop, the recurring leaks that follow from
ignoring it, and the discipline that closes them. Tools and mechanisms
mentioned here may be idealized rather than as-shipped; the sibling
pages ([Session Lifecycle](./session.md), [Tools](./tools.md),
[Tool Design](./tool-design.md)) own the normative contracts this page
reasons about.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**
are used as in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Quality is still P1

Before anything else: **cost optimization MUST NOT be pursued by
degrading quality.** The reason an agent system picks a frontier model
is quality; an optimization that trades it away defeats the purchase.

The doctrine is possible because most of the money an unoptimized agent
loop burns buys **nothing** — the model sees identical bytes either
way, or sees stale bytes it no longer needs. The discipline is:

1. **Close the quality-neutral leaks first.** Prompt caching,
   tool-result echo, output truncation with a re-fetch handle. These
   change what a token _costs_, not what the model _sees_.
2. **Take quality-tradeoff measures deliberately, case by case.**
   Compaction, pruning, cheaper models, smaller windows. Each replaces
   verbatim context with less; each needs its own argument. (Often the
   argument exists — a half-million-token prompt also degrades the
   model's attention, so compacting earlier can be a quality _win_ —
   but it must be made, not assumed.)

A system that reaches for step 2 before finishing step 1 is paying for
quality loss it did not have to take.

## Provenance

This doctrine was sharpened by a **measured incident in a peer agent
system** — a different product, with a different design, sharing this
guide's DNA (a universal LLM loop over a persisted session, streaming
AI-SDK-shaped chunks, replaying the transcript each step). The
specifics below are that system's, not this one's; the failure classes
are the domain's. Because the peer persisted per-step token usage
(see [Observability](#observability-no-invisible-spend)), the numbers
are forensic, not estimated:

- A single build session on a frontier model cost **hundreds of
  dollars in under an hour**.
- The session totaled **millions of input tokens over a few dozen
  steps**, with single steps carrying over half a million input
  tokens each.
- Across **every** session ever run against a provider whose prompt
  cache is opt-in, cache reads were **zero**. Sessions on a provider
  with implicit caching had the large majority of their input served
  from cache for free — which is precisely why the leak went
  unnoticed.

Reference systems in this domain (opencode and Codex were the ones
studied) ship the countermeasures below as **core loop behavior, not
optimizations** — cache breakpoints, output caps, history pruning are
table stakes in a production agent loop. It is easy to adopt a
reference system's visible tool semantics and miss its invisible cost
hygiene; the peer system had done exactly that.

## The cost model of an agent loop

Everything in this page follows from four facts about how an agent
loop is billed. None of them is exotic; the leaks come from designing
as if they weren't true.

**1. The transcript is re-sent on every step.** A turn is a loop:
model call → tool call → tool result → model call again. Each model
call carries the _entire_ conversation so far — system prompt, every
message, every tool input, every tool result. A token that enters the
transcript at step 3 is billed again at steps 4, 5, … N. Input cost is
therefore **quadratic** in the number of steps: an N-step session
whose steps append roughly constant-size content pays on the order of
N²/2 token-sends. Every byte in the transcript is **rent**, paid every
remaining step of the session — the same rent framing as
[Tool Design's context economy lens](./tool-design.md#3-context-economy--every-token-is-rent),
seen from the billing side.

**2. Input tokens have four prices.** Providers price the same token
differently depending on how it arrives:

| Kind                 | Typical price (relative to uncached input) |
| -------------------- | ------------------------------------------ |
| Cache read           | ~0.1×                                      |
| Uncached input       | 1×                                         |
| Cache write          | ~1.25×                                     |
| Long-context premium | ~2× on the portion above a threshold       |

The spread between the cheapest and the most expensive way to send the
same prompt is roughly **20×**. An agent loop's dominant cost driver is
not _how many_ tokens it sends but **which price tier they land in**.

**3. Caching regimes differ by provider.** Some providers cache
implicitly (repeated prefixes are served from cache with no request
changes); others require **opt-in cache breakpoints** stamped onto the
request. A loop that works on both will silently pay full price on the
opt-in provider while looking cheap on the implicit one. Gateways
(OpenRouter is the common case) carry the underlying provider's cache
options through provider-specific request fields — routing through a
gateway does not exempt the loop from stamping them.

**4. Output is expensive per token but small in volume.** Output rates
run several times the input rate, but an agent session's output is
typically 1–2% of its input volume. In the measured incident, input
volume outweighed output by roughly two orders of magnitude. **Input
volume × input tier is where the money is**; output-side tuning is a
second-order concern.

## The ledger of leaks

Each leak below was observed, measured, and closed (or scoped) in the
peer incident. They are ordered by measured impact. The first three are
quality-neutral; the fourth is the one genuine tradeoff; the last two
are steering concerns.

### Leak 1 — no prompt caching on an opt-in provider (~90% of input cost)

On a provider with opt-in caching, a loop that never stamps cache
breakpoints pays the full uncached rate for the entire re-sent
transcript, every step. With breakpoints, everything up to the last
breakpoint is a ~0.1× cache read; only each step's new suffix pays the
~1.25× write surcharge. In a long session that converts roughly **90%+
of input volume to the 0.1× tier** — the single largest lever in the
entire doctrine, and a strictly quality-neutral one: the model sees
identical bytes.

The discipline:

- **The loop MUST stamp cache breakpoints when the provider requires
  them.** The recurring placement (used by the reference systems): a
  breakpoint on the system prompt and on the last message(s) of each
  request, so the cacheable prefix covers everything already sent.
- **The prefix MUST be stable.** Caching is prefix-matching. The
  system-prompt assembly order is fixed
  ([Session / system prompt assembly](./session.md#system-prompt-assembly)),
  history is append-only, and — critically — **replayed history MUST
  NOT be mutated between steps**. Any transformation of past messages
  (pruning, placeholder substitution, re-serialization that reorders
  keys) invalidates the cached prefix from the mutation point onward.
  Mutations are legal only at **compaction boundaries**, where the
  prefix is being rebuilt anyway.
- **A session-stable cache key SHOULD be sent where the provider or
  gateway supports one** (a per-session `prompt_cache_key` or
  equivalent), so the provider's cache routing sees one continuous
  conversation rather than accidental prefix collisions.

The cross-provider disparity deserves its own warning: **implicit
caching on one provider masks the absence of caching on another.** A
cost dashboard that aggregates across providers will show the blended
average and hide the leak. Cost MUST be evaluated **per provider**,
not per feature.

### Leak 2 — tool results that echo their inputs (~25% of transcript volume)

A tool's result envelope is not a return value that gets consumed and
dropped — it is **appended to the transcript and re-billed every
subsequent step**. Envelope design _is_ prompt design.

The measured instance: a file-write tool that returned the full
written content back in its success envelope. Every produced artifact
therefore sat in the transcript **twice** — once as the tool call's
input, once as the result's echo — for the rest of the session. In a
build-heavy session the echo alone was ~25% of all tool bytes. No
consumer of the field existed; it was a convenience nobody used, billed
on every step of every session.

The discipline is [Tool Design's context economy
lens](./tool-design.md#3-context-economy--every-token-is-rent) with
teeth:

- A mutation tool's result MUST be an **acknowledgment, not an echo**
  — what changed, where, and the state the agent needs to proceed
  (a diff stat, a byte count, a version stamp). Never the content the
  agent just sent.
- A result field nobody consumes is not harmless — it has a **per-step
  price**. When in doubt, leave it out; the retraction asymmetry
  ([Tool Design](./tool-design.md#the-consumer-you-cannot-change))
  applies to result fields exactly as it does to parameters.

### Leak 3 — unbounded and unpruned tool outputs

Two related failures:

- **No output cap at execution time.** A shell command or a search
  over a large tree can return megabytes; returned verbatim, that
  volume is rent forever. The contract answer is
  [truncation with a re-fetch handle](./tools.md#truncation): a
  per-tool max output size, head + `truncated` flag in the result, full
  payload spilled to a file the agent can `read` on demand. Quality-
  neutral by construction — nothing is lost, it moves behind a handle.
- **No pruning of stale outputs at replay time.** A file read from
  forty steps ago — of a file since rewritten — is not just dead
  weight; it is _stale_ context that can mislead. The contract answer
  is [tool-output pruning](./session.md#tool-output-pruning-vs-compaction):
  protect a recent-output budget, replace older outputs with a stub
  that preserves the call + arguments ("I read file X" survives; X's
  old bytes do not).

The cost-specific addition to those contracts: **pruning MUST compose
with Leak 1's prefix stability.** A prune pass that rewrites replayed
history mid-session invalidates the cache prefix and can cost more
than it saves. Prune at compaction boundaries (or apply stubs only to
messages already behind a fresh breakpoint), never on a live cached
prefix.

### Leak 4 — window, threshold, and price tier decided separately

The one leak that is a genuine design tradeoff rather than pure waste.

A bigger context window is **not free headroom**. Three quantities are
coupled, and the measured incident showed what happens when they are
configured independently:

- The **window** the loop requests (some providers gate a long-context
  window behind an opt-in request flag).
- The **compaction threshold**, which
  [derives from the window](./session.md#threshold) — raise the window
  and the threshold rises with it.
- The **price tier**: the portion of input above the provider's
  long-context threshold bills at a premium (~2×).

In the incident, unconditionally enabling a 1M-token window moved the
compaction trigger to just under the window — past where any real
session lived, so **compaction never fired** — while every token
above the provider's premium line billed at the premium rate. The larger window did not buy
capability; it silently disabled the system's own hygiene and doubled
the marginal price of exactly the traffic that hygiene would have
removed.

The discipline: **window size, compaction threshold, and pricing tier
MUST be decided together, as one decision.**

- Long-context windows SHOULD be **opt-in per session or per task**,
  reserved for tasks that demonstrably need verbatim long history —
  never a default.
- The default compaction threshold SHOULD sit **below the provider's
  premium-tier line**, so ordinary sessions never enter premium
  pricing at all.
- This is the one measure with a quality dimension: compaction
  replaces verbatim history with a summary. The counter-argument is
  also real — extreme prompts degrade attention, and a session that
  compacts at 150k often _outperforms_ one dragging 500k of stale tool
  output. Make the argument per product shape; do not default into
  premium pricing by omission.

### Leak 5 — full-rewrite bias in revision loops

When an agent revises an artifact, a whole-file rewrite and a targeted
string-replace edit produce the same outcome at wildly different token
cost — the rewrite pays the full artifact size in tool input (and, per
Leak 2, possibly again in the result), on that step and every step
after. The measured incident showed a revision loop calling
whole-file writes nearly an order of magnitude more often than
targeted edits, on artifacts in the tens of kilobytes.

This is a **steering problem, not a contract problem**: the tool set
already contains the cheap path; the model defaults to the expensive
one. The fix lives in tool descriptions and skills — the write tool's
description SHOULD position it for creation, the edit tool's for
revision, and task-domain skills SHOULD say "revise with targeted
edits" where revisions are the common case. This is the
[awareness lens](./tool-design.md#1-awareness--can-the-agent-ground-and-express-this):
the agent can only take the cheap path it has been told exists and
told when to prefer.

### Leak 6 — an unaudited baseline prompt

The first step of every session pays the **baseline**: system prompt,
project instructions, skill index, environment context, tool catalog
([Session / system prompt assembly](./session.md#system-prompt-assembly))
— plus whatever a host injects (workspace listings, template
catalogs, upload manifests). In the measured incident the baseline
alone approached 100k tokens before the user's first word.

The baseline is rent with a multiplier: it is the **prefix of every
step of every session**. The discipline:

- With Leak 1 closed, a large baseline is cheap-ish (cached after step
  one) — but it still occupies window and still degrades attention.
  Fix caching first, then audit; an audit before caching optimizes the
  wrong number.
- The lazy-loading machinery exists to keep the baseline small: skills
  advertise one-line descriptions and load bodies on demand
  ([Skills](./skills.md)); bulk tool catalogs sit behind search
  ([MCP / lazy materialization](./mcp.md)). A baseline that inlines
  what those layers were built to defer is re-importing the cost they
  were built to remove.

## Observability: no invisible spend

The entire incident above was reconstructible **weeks later, offline,
with SQL** — because the peer system persisted per-step usage into the
session store. That is the contract this guide already pins
([Session / context-window tracking](./session.md#context-window-tracking),
with the [cache normalization rule](./ai-sdk/index.md#token-usage--the-cache-normalization-rule)),
and the incident is the argument for it: **usage persistence is the
flight recorder that pays for itself the first time cost goes wrong.**

The doctrine adds two obligations on top of recording:

- **A zero cache-hit rate on a caching-capable provider is an alarm,
  not a statistic.** The per-turn breakdown already carries
  `cache_read`; a session whose `cache_read` stays at zero across
  steps, on a provider that supports caching, is leaking (Leak 1) and
  the system SHOULD surface it — in the session's context indicator,
  in a dashboard, anywhere a human will actually see it. In the
  incident, the zero sat in the database for months, silent.
- **Cost regressions are evaluated per provider** (Leak 1's
  disparity). A per-feature or blended view hides a full-price
  provider behind an implicitly-cached one.

Pricing itself stays where the guide put it: next to the model
catalog, not inside the recorder
([Session / cost](./session.md#cost)). Observability records tokens by
tier; the catalog turns tiers into money.

## The ordering

The doctrine compressed to a decision rule — when spending effort on
agent cost, spend it in this order:

| Order | Measure                                                | Quality impact                       | Typical lever             |
| ----- | ------------------------------------------------------ | ------------------------------------ | ------------------------- |
| 1     | Prompt caching (breakpoints, stable prefix, cache key) | None — identical bytes               | ~90% of input cost        |
| 2     | Tool-result envelopes (no echo, ack not payload)       | None — removes unread bytes          | ~25% of transcript volume |
| 3     | Output truncation with re-fetch handle                 | None — content moves behind a handle | Bounds the worst case     |
| 4     | Stale-output pruning at compaction boundaries          | Near-none — removes stale bytes      | Grows with session length |
| 5     | Window / threshold / tier as one decision              | Tradeoff — argued per product        | Avoids ~2× premium tier   |
| 6     | Steering (edit-over-rewrite, baseline audit, tiering)  | None to positive                     | Task-shape dependent      |

Model tiering — the cheapest sufficient model for auxiliary work — is
already normative where it matters most
([Session / summarizer cost discipline](./session.md#summarizer-cost-discipline));
the same reasoning extends to any specialized subagent whose task does
not need the frontier tier.

## The test

Before shipping any agent-system surface — a tool, an envelope field,
a prompt section, a window default — ask the billing-side twin of
[Tool Design's test](./tool-design.md#the-test):

> What does this cost on step 40? Every byte this surface puts into
> the transcript is re-billed on every remaining step of the session —
> at which price tier, and who is watching the number?

If the answer is "full price, nobody" — that is this page's incident,
waiting to be measured.

## See also

- [Tool Design](./tool-design.md) — the context economy lens this page
  prices; the retraction asymmetry that applies to result fields.
- [Tools](./tools.md) — the result envelope and the truncation
  contract.
- [Session Lifecycle](./session.md) — compaction, tool-output pruning,
  context-window tracking, the summarizer's cost discipline.
- [AI SDK annex](./ai-sdk/index.md) — the cache normalization rule
  that keeps recorded usage honest.
- [Skills](./skills.md) and [MCP](./mcp.md) — the lazy-loading layers
  that keep the baseline small.
