---
title: "ACP Provider: the agent-provider class (ACP consumer)"
description: Decision/RFD on whether Grida should host an agent-provider class — driving an external ACP agent (Claude Code / Codex) the user already pays for, with Grida as ACP consumer and an MCP server of its own tools. The forever-cost ledger, the narrow delta over BYOK, and a reversible path.
keywords:
  [
    agent-system,
    acp,
    agent-provider,
    provider,
    decision,
    rfd,
    claude,
    codex,
    byok,
    subscription,
  ]
format: md
tags:
  - internal
  - wg
  - ai
---

# ACP Provider: the agent-provider class (ACP consumer)

This page is a **decision (RFD)**, not a spec. The rest of the agent WG
tree describes _what the system is_; this page argues _whether to build a
new part of it_ — the **agent-provider class**, where Grida drives an
**external** agent (Claude Code / Codex) that the user already pays for,
acting as an [ACP](./acp.md) **consumer**.

It is the umbrella that [ACP Provider: Codex](./acp-provider-codex.md)
already presumes: that profile describes how to consume one provider; this
page asks whether the host should host the _class of provider_ at all, and
what it costs to do so forever.

Tracking issue:
[gridaco/grida#813](https://github.com/gridaco/grida/issues/813).

## TL;DR

- **The decision, in one sentence.** Building this introduces a **second
  provider class that Grida maintains forever** — one where the external
  agent owns the loop and Grida is merely its client — in exchange for one
  thing the current providers cannot offer: **"run on your existing Claude
  or ChatGPT subscription, zero key, zero signup."**
- **It is a positioning bet, not an economics one.** The "costs us nothing"
  benefit is **already shipped** via BYOK and the local `endpoint` provider
  (both bypass Grida billing). The _only_ thing this class adds over those is
  reaching the **subscription** population that has no API key.
- **Recommendation.** Do not commit the class yet. Ship the multi-provider
  BYOK config UX ([#807](https://github.com/gridaco/grida/issues/807)) first
  — it captures most of the "bring your own" story with **no new
  architecture class** — then build this **only if** the data below clears.
- **The one number that should drive the call.** Does the zero-signup
  subscription on-ramp **convert materially better than BYOK-with-a-key**?
  If yes, the permanent layer is earning its keep and we should commit to it
  as identity. If we cannot articulate why it would, this waits.

## What is actually being decided

The headline pull — _"the user brings the model spend, it costs us
nothing"_ — is real, but **we already have it**. Both BYOK and the
generalized OpenAI-compatible `endpoint` provider run on the user's own
credentials and **bypass Grida's billing entirely** (no gate, no metering;
the GRIDA-SEC-003 carve-out). So this decision is **not** about whether
users can bring their own inference. They already can.

What an ACP consumer _uniquely_ adds over BYOK is narrow:

> **Ride an existing Claude Pro/Max or ChatGPT subscription — with zero
> key-paste and zero new signup.**

That delta is not nothing. BYOK serves the **API-key** population (small,
technical, willing to create an account and paste a secret). A subscription
on-ramp serves the **subscription** population (large, already paying
Anthropic/OpenAI, with no API account at all). The question is whether
reaching that second population is worth a **permanent second architecture
class**, for the slice of users who are on **desktop** and already have
**Claude Code or Codex installed and logged in**.

## Status — what exists today (June 2026)

Grounded against the current code so the cost ledger below is concrete, not
hand-waved.

- **The provider layer has exactly two _model-provider_ kinds**, `byok`
  (OpenRouter / Vercel) and `endpoint` (any OpenAI-compatible base URL,
  optional key, Ollama preset — shipped as
  [#806](https://github.com/gridaco/grida/issues/806)). In both, **Grida
  owns the loop** and injects its own locked tools. Neither is an
  agent-provider.
- **ACP code already exists — but in the opposite direction.** What shipped
  with the [local daemon](./daemon.md)
  ([#798](https://github.com/gridaco/grida/issues/798)) is Grida-as-**agent**:
  an external client like Zed drives _Grida_ over ACP. The
  [ACP Integration](./acp.md) page specs that outward wire. The **consuming**
  direction — Grida driving Claude/Codex — is a different seam and is **not
  built**.
- **So this is greenfield.** None of the consumer layer, none of the
  agent-provider class, and none of the Grida-as-MCP-server work exists yet.

## The two provider classes

The whole decision turns on **who owns the loop**.

```text
MODEL-PROVIDER class (today: byok, endpoint)        AGENT-PROVIDER class (this decision)
─────────────────────────────────────────          ─────────────────────────────────────────
Grida owns the loop.                                External agent owns the loop.
  · Grida calls the model directly.                   · Grida sends a task, receives an
  · Grida injects its locked tools                      event stream (messages, tool calls,
    (fs, todos, shell, canvas ops).                      file edits, command runs).
  · Tools tuned for design/canvas.                    · Grida CANNOT inject its locked tools;
  · One ownership model end to end.                     it must hand them over as an MCP
                                                         server the external agent calls.
                                                      · The agent brings its own fs/shell/edit
                                                         tools and its own sandbox/approvals.
```

A model provider is a _swap_: a different endpoint behind the same loop. An
agent provider is an **inversion**: Grida stops owning the loop and becomes a
client mapping someone else's event stream into its own session model. That
inversion is the source of every cost below — it is not "one more provider,"
it is a second way the whole system can be shaped, that every future feature
must then account for.

## The forever layer — what we would maintain indefinitely

| Permanent surface                                      | Why it never closes                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A second provider _class_** (external owns the loop) | Every future agent feature — [sessions](./session.md), [queue](./queue.md), [turn authority](./turn-authority.md), [lifecycle events](./events.md), tool routing, billing UX — must now design for _two_ ownership models. A standing design tax at the fork.        |
| **Grida-as-MCP-server of its own tools**               | Because Grida can't inject locked tools into a loop it doesn't own, its design/canvas tools must be re-exposed as an [MCP](./mcp.md) server and kept in sync with the in-loop tool surface — two representations of the same tools, forever.                         |
| **Per-CLI adapters chasing moving targets**            | The Claude Code and Codex CLIs ship constantly and we don't control them; the Claude bridge (`claude-code-acp`) is community-maintained. Their changes break our spawn/drive contract on their schedule.                                                             |
| **Capability / sandbox variance**                      | Tool availability depends on the external agent's surface, version, sandbox, and entitlement — "discovered, not guaranteed." A permanent "works on my machine" support surface.                                                                                      |
| **Standing Claude ToS exposure**                       | Anthropic has not blessed third parties shipping the subscription-via-CLI pattern. Not a one-time legal check — a relationship to manage indefinitely.                                                                                                               |
| **Support for quality we don't own**                   | When the external agent misbehaves, it owns the loop — but the user blames Grida. And the weakest spot is our core domain: **code-tuned agents drive design/canvas tools worst**, so the headline integration is least proven exactly where Grida is differentiated. |

## The pros — stated fairly

- **The lowest-friction on-ramp that exists.** A Claude/ChatGPT subscriber
  runs Grida's agent with nothing to configure — no account, no key. BYOK
  cannot match that for non-API-key users.
- **Reaches a population BYOK cannot.** Subscription holders vastly outnumber
  API-key holders, and they are a less technical audience.
- **Try → convert at near-zero CAC.** A curious user is in immediately;
  conversion to a Grida subscription or hosted plan comes later.
- **Ecosystem alignment, and we are half-built.** The local-server-plus-clients
  shape and ACP/MCP interop is where the ecosystem is heading, and Grida
  already built the [daemon](./daemon.md) and the ACP-_agent_ half — the
  muscle exists.
- **Codex is blessed.** OpenAI explicitly endorses using a ChatGPT
  subscription through Codex wherever the user likes — a safe primary pitch
  with no ToS cloud. (Claude only works _de facto_, via a community bridge,
  unblessed.)

## The narrow question, and the recommendation

This is a **bet on identity, not on cost** — the cost play is already won by
BYOK. Decide by answering what Grida is:

- **"A design tool that plugs into the agent ecosystem."** Then the
  agent-provider class is **core identity**, the forever layer is justified,
  and the half we already built (daemon + ACP-agent) is the down payment.
  Build it.
- **"A design tool that needs an LLM."** Then BYOK plus a hosted Grida plan
  is sufficient, and this class is **scope creep** dressed as a GTM win.
  Don't build it.

**Recommendation: do not commit the class yet.** Sequence it:

1. Ship [#807](https://github.com/gridaco/grida/issues/807) (multi-provider
   BYOK + a real config UX). It delivers most of the "bring your own" GTM
   story with **zero new architecture class**.
2. **Measure** whether the zero-signup subscription on-ramp would convert
   better than BYOK. If we cannot make that case, the forever layer is not
   earning its keep, and this remains a documented option, not a build.

## A reversible path — if the answer is yes

If the data clears, keep "forever" reversible until the bet is proven:

- **Codex-first; gate Claude.** Ship only the blessed path. Hold the
  unblessed Claude bridge until Anthropic clarifies — this removes the
  standing legal liability from v1.
- **Desktop-only, behind a flag, labeled experimental.** The forever cost
  only locks in when the class is load-bearing for many users. Keep it
  kill-switchable.
- **Contain the inversion.** Build the consumer as a bounded adapter on the
  [transport](./acp.md) and [daemon](./daemon.md) Grida already has. Do
  **not** let "external owns the loop" leak into the core session/tool model
  until conversion data justifies hardening the class.
- **Modality split is mandatory.** ACP covers the agentic/text modality only;
  it does not cover image/video generation. Image/video stays on BYOK or a
  Grida subscription — make that cost boundary obvious in the config UX
  before the user hits it (see the Codex profile's image-generation section).

## Decision checklist / open questions

- [ ] Decide identity: plug-into-the-ecosystem vs. needs-an-LLM (the section
      above).
- [ ] Ship [#807](https://github.com/gridaco/grida/issues/807) and instrument
      the conversion comparison (subscription on-ramp vs. BYOK).
- [ ] If yes: provider registry models an **agent-provider class** alongside
      the two model-provider kinds; how the picker presents them.
- [ ] Grida-as-MCP-server: which design/canvas/workspace tools to expose, and
      the trust/scope boundary.
- [ ] PATH auto-detection of an installed, logged-in Claude/Codex;
      zero-config first run.
- [ ] Session-identity mapping (host session ↔ provider thread/session id),
      per the [Codex profile](./acp-provider-codex.md).
- [ ] Get Anthropic clarification before shipping the Claude path broadly.
- [ ] Write `acp-provider-claude.md` (the Claude profile — the de-facto
      bridge, the auth boundary, the ToS gate).

## References

- **Grida WG:** [ACP Integration](./acp.md),
  [ACP Provider: Codex](./acp-provider-codex.md),
  [MCP and Connectors](./mcp.md), [Local Daemon](./daemon.md),
  [Session Lifecycle](./session.md), [Turn Queue](./queue.md),
  [index](./index.md).
- **Issues:** [#813](https://github.com/gridaco/grida/issues/813) (this
  decision), [#806](https://github.com/gridaco/grida/issues/806) (local LLMs —
  shipped), [#807](https://github.com/gridaco/grida/issues/807) (multi-provider
  BYOK config UX), [#798](https://github.com/gridaco/grida/issues/798) (local
  daemon).
- **External (auth/ToS facts):** the [Agent Client
  Protocol](https://agentclientprotocol.com/); OpenAI endorses Codex on a
  ChatGPT subscription; Claude works _de facto_ via the community
  `claude-code-acp` bridge but is **not** formally blessed for third-party
  shipping.
