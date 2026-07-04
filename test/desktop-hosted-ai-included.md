---
id: TC-DESKTOP-HOSTED-AI-001
title: Signed-in desktop runs AI without BYOK, billed to org credits (grida provider)
module: desktop
area: agent
tags: [hosted-ai, no-byok, billing, credits, token, degraded-mode, sandbox]
status: untested
severity: high
date: 2026-07-03
updated: 2026-07-03
automatable: false
covered_by:
  - editor/lib/desktop/grida-cloud-session.test.ts
  - editor/app/(api)/(public)/api/v1/ai/chat/completions/route.test.ts
  - packages/grida-ai-agent/src/providers/grida-resolution.test.ts
  - packages/grida-ai-agent/src/providers/grida.test.ts
  - packages/grida-ai-agent/src/http/routes/grida-auth.test.ts
---

## Behavior

A **signed-in** desktop user with **no BYOK key** can run the workspace
agent (and the image/video playgrounds) on Grida-hosted models, gated
and metered against their organization's AI credits (GRIDA-SEC-006).
The renderer mints a 15-minute scoped token from the webview session
(`POST /desktop/auth/token`) before every send and pushes it to the
sidecar, which holds it **in memory only** and spends it as the Bearer
credential of the `grida` provider against
`{origin}/api/v1/ai/*`. Provider precedence is: explicit pick wins;
implicitly **BYOK keys → grida (signed in) → endpoints** — existing
BYOK users keep exactly their current behavior.

Failure states are actionable, never raw: a mid-run token lapse surfaces
as a session-refresh banner (a background re-mint has already run — the
next send just works); an out-of-credits 402 surfaces with an "add
credits" affordance that opens the org's web billing page in the **OS
browser** (the webview never navigates). Hosted AI degrading (signed
out, no org, editor unreachable) NEVER breaks BYOK or local-endpoint
runs. Sign-out clears the sidecar session; the 15-minute expiry is the
backstop for anything in flight.

## Steps

1. Local stack up (supabase + editor :3000 with `GRIDA_AI_TOKEN_SECRET`
   set). Remove all BYOK keys in desktop Settings. Sign in. Seed org
   credits (web `/insiders/billing`, complimentary commit).
2. In the workspace agent pane, pick a catalog model (e.g. GPT-5.4
   Mini — the model picker shows "Grida — included") and send a prompt.
3. Expected: the reply streams; the sidecar log shows
   `providerId=grida kind=grida`; the settings Credits card balance
   drops after the run.
4. Add an OpenRouter key and send again. Expected: the run uses
   `providerId=openrouter` (BYOK wins implicitly).
5. Remove the key; generate in the Images playground. Expected: hosted
   generation succeeds keylessly (grida provider), billed.
6. Drain the balance below $0.25 (insiders ingest) and send a chat.
   Expected: the out-of-credits banner with "add credits" → OS browser
   opens `/organizations/{slug}/settings/billing`; webview unchanged.
7. Sign out mid-session; send again. Expected: run fails cleanly to a
   sign-in state (no hosted provider resolution), BYOK/endpoints (if
   configured) still work.
8. Kill the sidecar (Activity Monitor) mid-session; after it respawns,
   send again. Expected: the pre-send `ensureFresh` re-pushes the token;
   the run succeeds without re-signing-in.
9. **Packaged (srt) build**: repeat step 2 in a packaged app against the
   configured editor origin — pins the sandbox egress allowlist
   (`grida_cloud_host`), the one thing dev mode can't prove. Also
   verify dev (`localhost:3000`) egress under srt once.
10. Old-binary posture: with a renderer newer than the installed binary
    (no `bridge.cloud`), no hosted-AI affordances appear and everything
    else behaves exactly as before.

## Notes

- Mid-run token expiry on a single >15-min agent turn is bounded, not
  closed: per-request token reads + refresh-on-send shrink the window;
  the banner + background re-mint is the v1 answer (a daemon-initiated
  refresh is impossible by design — the webview owns the session).
- Hosted image/video are t2i/t2v-only in v1: reference images and
  image-to-video route to BYOK providers.
- Part 2a's card: test/desktop-settings-billing-credits.md.
