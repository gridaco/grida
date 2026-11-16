---
id: TC-DESKTOP-AGENT-CHAT-027
title: Ultra review keeps the selected model connection across providers
module: desktop
area: agent-chat
tags: [agent-chat, effort, ultra, review, provider, cancellation, recovery]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-15
automatable: false
covered_by:
  - crates/grida-agent/tests/process/effort.rs
  - crates/grida-agent/tests/process/responses.rs
  - desktop/src/main/native-subscription-profiles.test.ts
  - editor/lib/agent-chat/native-chat-controller.test.ts
---

## Behavior

Ultra is a work allowance and independent-review option on every supported
native model connection. Choosing it starts no work and preserves the draft,
Plan or Act choice, model and connection. A model with configurable reasoning
also uses its highest supported reasoning level for an ordinary Ultra message.
A model without that setting still gets the larger inference-step allowance
and the option of an independent reviewer. Goal turns retain their default
reasoning while an Ultra goal shares its allowance with review work.

The reviewer receives a bounded assignment and permitted primary-project read
access through the parent's captured model connection and account. It does
not receive the parent's conversation, additional folder grants, commands,
writes or delegation. Stop, sign-out and shutdown retain control of child
work. Viewing retained work after restart starts no provider request. A
changed connection never silently takes over accepted parent or child work.

Step bounds apply on providers whose request format has no supported output
token limit. The UI does not promise a token, subscription-quota or monetary
ceiling from Ultra. Any configured Gateway spending guarantee keeps its
existing accounting and includes the goal's funded review.

## Steps

1. Run ordinary macOS or Linux Desktop against the authenticated local
   development setup. Prepare a connected ChatGPT subscription, an approved
   compatible endpoint, a saved key connection and Grida Gateway. Use a
   separate new chat for each connection.
2. Open the model popover and choose Ultra on each connection. Repeat on a
   compatible model with no reasoning control.
3. Expected: Ultra is selectable without a provider-specific warning. Selecting
   it preserves the draft and starts no turn. The reasoning description follows
   the model's capability independently of Ultra availability.
4. On each connection, send a task that calls for a separate review, for example
   “Read the project README, propose an improvement, and ask an independent
   reviewer to check the proposal's assumptions.”
5. Expected: the accepted message keeps Ultra. When review begins, turn activity
   identifies the reviewer and shows its progress or result. The parent can
   collect its finding. The reviewer uses the same connection and account as
   the parent; another configured provider receives no fallback request.
   A model completing without starting a review does not verify this step.
6. Repeat with Plan selected. Expected: review remains available and neither
   parent nor reviewer obtains write or command access from Ultra.
7. While a review is running, Stop the task. Expected: the turn records the
   interruption and the child cannot continue dispatching provider work after
   cancellation settles. Reopen the chat and restart Desktop once. The recorded
   messages, effort and review status remain available without new inference.
8. On the subscription connection, repeat while signing out of ChatGPT during
   the review. Expected: subscription work is withdrawn. Reconnecting or
   selecting another provider cannot silently continue the earlier review.
9. Start an Ultra goal on each connection. Expected: one independent review can
   share that goal's inference allowance. Goal turns keep the model's default
   reasoning. A late review result is reconciled through the existing goal
   controls; reopening it does not start another review or reset the allowance.
10. On a Gateway goal with an explicitly configured spending limit from an ACP
    client, repeat the review. Expected: its existing receipts and shared
    spending accounting include child requests. The Desktop effort panel does
    not claim that selecting Ultra creates that monetary guarantee.
11. Make the selected connection unavailable before submitting an Ultra
    message, or use a native-host fixture that lacks the negotiated Ultra
    capability. Expected: submission refuses before work begins, preserving
    the exact draft and selected effort. No ordinary-effort message is sent
    as a replacement. Restore the connection and retry explicitly.

## Verification

2026-11-15, macOS arm64: enabled native-resource tests in
`desktop/src/main/native-subscription-profiles.test.ts` passed all four cases.
The ordinary Desktop composition selected GPT-5.6 Terra and ran an Ultra
parent, a separate reviewer inference and collection of its finding through
synthetic restricted Responses. Parent and reviewer retained the exact model
and OAuth account route; the reviewer excluded the parent's conversation,
the parent requested Extra high reasoning, and every request omitted
`max_output_tokens`. The same file also exercised observational catalog
reads, High effort, token rotation, saved-chat restart, changed lineage and
sign-out. These checks used no external provider calls.

2026-11-15, ordinary development Desktop launched with `just desktop` against
local Supabase and insiders authentication: a new unsent chat offered Ultra
on OpenRouter Haiku 5.5 and Ollama `gemma4:latest`, which has no reasoning
control. The earlier provider-specific warning was absent. On Ollama, the
panel explained that the model keeps its own reasoning while Ultra extends
the work allowance. No turn was submitted. Settings showed ChatGPT signed
out, so this check did not verify subscription UI or requests. The prior
Haiku Medium connection and existing paused chat were restored before the
app was stopped.

Remaining manual verification includes subscription and other connection
pickers, live reviewer activity, Stop, sign-out, restart and Goal scenarios.
The listed automated tests provide their own bounded source and native-process
evidence; they do not establish that the full composed Desktop interaction
passed. The overall case remains untested.

## Notes

- Use a scripted local provider for deterministic review and held-response
  cancellation checks. Record which connection, adapter and steps were
  exercised. A successful parent answer alone does not prove reviewer execution.
- Live subscription and API requests can consume quota or incur charges.
- Subscription model membership stays on the existing closed compatibility
  list. Universal Ultra does not add model discovery, image input or
  provider-native compaction.
