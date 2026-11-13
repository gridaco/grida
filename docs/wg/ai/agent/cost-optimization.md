---
title: Cost Optimization
description: Doctrine for running frontier models in an agent loop without paying for waste. The loop's cost model (every token is re-sent every step, at one of several price tiers), the recurring failure classes — missing prompt caching, tool results that echo their input, unbounded and stale tool output, window and compaction decided apart from pricing, rewrite-heavy revision, an unaudited baseline — and the quality-first order for addressing them.
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

An agent that runs a frontier model runs the most expensive compute the product
buys, in a loop, often unattended. Cost is therefore a design dimension of the
agent system, decided in the same places as the tool contract and the session
model. This page is doctrine: it states the cost model of an agent loop, the
failure classes that follow from ignoring it, and the order in which to address
them. The normative mechanisms it relies on belong to
[Master / context and tool design](./master.md#context-and-tool-design),
[Tools](./tools.md), and [Tool design](./tool-design.md).

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
used as in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Quality comes first

Cost optimization MUST NOT degrade task quality. A frontier model is chosen for
quality; trading quality for cost defeats the choice.

The doctrine works because much of what an unoptimized loop spends buys nothing:
the model sees identical bytes at a higher price, or sees stale bytes it no
longer needs. The discipline is:

1. **Close quality-neutral waste first.** Prompt caching, acknowledgment-only
   tool results, and output bounds with a retrieval handle change what a token
   costs, not what the model sees.
2. **Take quality tradeoffs deliberately, one at a time.** Compaction, pruning,
   smaller windows, and cheaper models replace verbatim context with less. Each
   needs its own argument. That argument often exists — very long prompts also
   dilute attention — but it is made, not assumed.

## The cost model of an agent loop

**1. The transcript is re-sent every step.** A turn alternates model calls and
tool results, and each model call carries the whole conversation so far. A token
that enters at step 3 is paid again at every later step. With roughly constant
growth per step, input cost grows with the square of the step count. Every byte
in the transcript is rent, the same framing as
[Tool design / context economy](./tool-design.md#3-context-economy--every-token-is-rent)
seen from the billing side.

**2. Input tokens have several prices.** The same token costs differently by how
it arrives:

| Kind                 | Typical price relative to uncached input |
| -------------------- | ---------------------------------------- |
| Cache read           | about 0.1×                               |
| Uncached input       | 1×                                       |
| Cache write          | about 1.25×                              |
| Long-context premium | about 2× above a provider threshold      |

The spread between the cheapest and most expensive way to send one prompt is
roughly twentyfold. Which tier tokens land in matters more than how many there
are.

**3. Caching regimes differ by provider.** Some providers cache repeated
prefixes implicitly. Others cache only where the request marks cache
breakpoints. A routing gateway passes the underlying provider's caching options
through; routing through one does not remove the need to mark them. A loop that
works with both kinds pays full price on the explicit kind while looking cheap
on the implicit kind.

**4. Output is expensive per token but small in volume.** Output rates are
several times input rates, but output is usually one to two percent of input
volume in an agent session. Input volume times input tier is where the money
is.

## Failure classes

Ordered by typical impact. The first three are quality-neutral, the fourth is
the one genuine tradeoff, and the last two are steering concerns.

### 1. No prompt caching where the provider requires it

Without breakpoints on an explicit-caching provider, the entire re-sent
transcript pays the uncached rate every step. With them, everything before the
last breakpoint is a cache read, and only each step's new suffix pays the write
surcharge. In long sessions most input moves to the cheapest tier while the
model sees identical bytes.

- The loop MUST mark cache breakpoints where the provider requires them,
  covering the stable instructions and the most recent messages so the cached
  prefix spans everything already sent.
- The prefix MUST stay stable. Instruction assembly order is fixed, history is
  append-only, and replayed history MUST NOT be rewritten between steps. Any
  rewrite of earlier content invalidates the cache from that point. Rewrites
  belong at compaction boundaries, where the prefix is rebuilt anyway.
- A session-stable cache key SHOULD be sent where the provider supports one.

Implicit caching on one provider can hide the absence of caching on another.
Cost MUST be evaluated per provider, not as a blended average.

### 2. Tool results that echo their input

A tool result is appended to the transcript and paid on every later step. A
mutation tool that returns the content it was just given stores that content
twice for the rest of the session.

- A mutation result MUST be an acknowledgment: what changed, where, and the
  state needed to proceed, such as a size, a revision, or a change summary.
  Never the content the agent just sent.
- A result field nobody reads has a per-step price. The
  [retraction asymmetry](./tool-design.md#the-consumer-you-cannot-change)
  applies to result fields as much as to parameters.

### 3. Unbounded and stale tool output

- **Unbounded output.** A command or search can return megabytes. Each tool
  bounds its output and returns a head plus a retrieval handle for the rest, as
  [Tools / truncation](./tools.md#truncation) defines. Nothing is lost; it
  moves behind a handle.
- **Stale output.** A file read forty steps ago, of a file since rewritten, is
  both waste and a source of error. Older outputs can be replaced with a stub
  that keeps the call and its arguments while dropping the bytes.

Pruning MUST respect prefix stability. Rewriting replayed history mid-session
invalidates the cache and can cost more than it saves. Prune at compaction
boundaries, or only behind a freshly established breakpoint.

### 4. Window, compaction threshold, and price tier decided separately

A larger context window is not free headroom. Three quantities are coupled:

- the window the loop requests;
- the compaction threshold, which follows the window; and
- the price tier, where input above a provider threshold pays a premium.

Raising the window alone moves the compaction threshold past where sessions
actually live, so compaction stops running, while every token above the premium
line pays more. The larger window disables the system's own hygiene and raises
the price of the traffic that hygiene would have removed.

These three MUST be decided together:

- Long-context windows SHOULD be selected per task that needs verbatim long
  history, not by default.
- The default compaction threshold SHOULD sit below the provider's premium
  line.
- Compaction trades verbatim history for a summary, so the tradeoff is argued
  per product; a session compacted early often performs better than one
  carrying hundreds of thousands of stale tokens.

### 5. Rewrite-heavy revision

A whole-file rewrite and a targeted edit can produce the same result at very
different cost: the rewrite pays the full artifact size as input on that step
and every later one. When the tool set already offers the targeted path, this is
a steering problem. Tool descriptions SHOULD position creation and revision
separately, and task guidance SHOULD prefer targeted edits where revision is the
common case — the
[awareness lens](./tool-design.md#1-awareness--can-the-agent-ground-and-express-this)
applied to cost.

### 6. An unaudited baseline

Every session's first step pays the baseline: instructions, project guidance,
the skill index, environment context, the offered tools, and anything the host
injects. The baseline is the prefix of every later step.

- Fix caching first. A cached baseline is cheap per step, though it still
  occupies the window and attention. Auditing before caching optimizes the
  wrong number.
- Keep deferred material deferred. Skills advertise short descriptions and load
  their bodies on selection; large tool catalogs sit behind discovery
  ([MCP and connectors](./mcp.md)). A baseline that inlines what those layers
  defer reintroduces the cost they remove.

## Observability

Per-step usage by tier is recorded with the session, as
[Master / usage and cost presentation](./master.md#usage-and-cost-presentation)
requires. Recording makes a cost failure reconstructible after the fact. Two
obligations follow:

- **A zero cache-read rate on a caching-capable provider is an alarm**, not a
  statistic. The system SHOULD surface it where a person will see it.
- **Cost regressions are evaluated per provider**, never only as a blended or
  per-feature view.

Prices stay with the model catalogue, not in the usage record. The record holds
tokens by tier; the catalogue turns tiers into money.

## The order

| Order | Measure                                                 | Quality impact                   |
| ----- | ------------------------------------------------------- | -------------------------------- |
| 1     | Prompt caching: breakpoints, stable prefix, session key | None — identical bytes           |
| 2     | Acknowledgment-only tool results                        | None — removes unread bytes      |
| 3     | Output bounds with a retrieval handle                   | None — content moves to a handle |
| 4     | Stale-output pruning at compaction boundaries           | Near none — removes stale bytes  |
| 5     | Window, threshold, and tier as one decision             | Tradeoff, argued per product     |
| 6     | Steering: targeted edits, baseline audit, model tiering | None to positive                 |

Model tiering — the cheapest sufficient model for auxiliary work such as titles
and summaries — extends to any specialized child task that does not need the
frontier tier.

## The test

Before shipping a tool, a result field, an instruction section, or a window
default, ask the billing-side twin of [Tool design's test](./tool-design.md#the-test):

> What does this cost on step 40? Every byte it adds to the transcript is paid
> on every remaining step — at which price tier, and who sees the number?

## See also

- [Tool design](./tool-design.md) — the context economy lens this page prices.
- [Tools](./tools.md) — the result envelope and truncation contract.
