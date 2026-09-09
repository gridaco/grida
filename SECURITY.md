# Security

Trust-boundary tracking for Grida. Every prevented vulnerability gets a
stable id, the id appears in every file the boundary depends on, and
this document is the central registry.

## Convention: `GRIDA-SEC-<id>`

We use `GRIDA-SEC-001`, `GRIDA-SEC-002`, … as canonical ids for
**security boundaries we have prevented**. The format is deliberately
unlike CVE:

- A **CVE** describes a vulnerability that was discovered, often after
  exposure. The id implies "this was a problem."
- A **GRIDA-SEC** id describes a vulnerability that was structurally
  prevented from existing — and a contract with the codebase that it
  must stay prevented. The id is "this is a thing we keep safe."

Every GRIDA-SEC id has:

- An entry in this file with the threat model and the enforcement
  mechanism.
- A grep tag in every file bound by the contract — comments in source,
  callouts in READMEs, ingress filters in scripts.
- An auto-loaded skill ([.agents/skills/security/SKILL.md](.agents/skills/security/SKILL.md))
  that triggers when an agent encounters the tag.

> **The grep is the index.** `grep -r GRIDA-SEC-001 .` returns every
> file in that contract. `grep -r GRIDA-SEC .` returns every security
> boundary in the repo.

## Philosophy: transparent tracking

Grida is open source. The threat model is public; the URLs an attacker
might find are public; the fact that webhooks exist is public. Security
in this repo is therefore **structural**, not secret. We make every
boundary loud, named, and grep-able so that future work doesn't drift
into opening new attack surface by accident.

A developer touching tagged code can't miss the marker; a code review
of any tagged file naturally surfaces the others; an agent picks up the
[security skill](.agents/skills/security/SKILL.md) the moment it sees
"GRIDA-SEC" anywhere in context.

> If you're adding a new boundary, allocate the next sequential id, add
> an entry below, and tag the relevant files. Don't reuse ids; don't
> renumber.

---

## Active boundaries

### `GRIDA-SEC-001` — Ingest trust boundary

**What it protects.** Webhook receivers are public endpoints invoked by
external machines. Their authority is established by the provider's signed
payload, independently of browser cookies or the machine API credential
families (GRIDA-SEC-012). The boundary is the rule that **everything
reachable on `/webhooks/*` must verify a provider signature before
doing anything else.** This applies to every current provider (Stripe,
Metronome, …) and every future one (Replicate, GitHub, etc.).

**Vulnerable scenario (prevented).** A developer adds an unsigned
endpoint under the same path prefix — or removes the signature check
from an existing receiver — and that path becomes reachable from the
public internet (directly in production, via dev tunnel locally) with
no authentication. An attacker who finds the URL triggers whatever
logic lives there. State-changing endpoints (entitlement flips, record
mutations, tenant-scoped queries) become open APIs.

**Why it's specifically risky here.** Webhook URLs in an open-source
repo eventually leak — into docs, scripts, screenshots, dashboards
that get linked, examples in PRs. Local dev typically uses a tunnel
(cloudflared, ngrok, etc.) to expose the dev server so external
providers can deliver webhooks; a naïvely-configured tunnel forwards
every path on the local server. If the tunnel URL becomes public —
and on an open-source project it does — every route including
`/insiders/*` becomes reachable on whatever box is currently tunneled.
The boundary contains the blast radius even when the URL is treated
as public.

**How the code prevents it.**

1. **Dedicated route group** — `editor/app/(ingest)/`. Every webhook
   receiver lives here. Nothing else does. The route group's
   [README](<editor/app/(ingest)/README.md>) is the authoritative ruleset.
2. **Path-based proxy bypass** — [editor/proxy.ts](editor/proxy.ts)
   short-circuits `/webhooks/*` _before_ tenant routing or session
   refresh runs. This makes the receivers reachable on arbitrary hosts
   (dev tunnels, future direct routes); it also makes the trust
   boundary path-aligned with the file system.
3. **HMAC verification at the receiver** — every receiver verifies a
   provider signature before any business logic. Fails closed (5xx)
   when the signing secret is missing in production.
4. **Replay protection** — receivers dedup on event id and reject
   events older than 5 minutes (where applicable).
5. **Tunnel path filter at the edge** — cloudflared is configured to
   forward only `/webhooks/*` and reject everything else with 404.
   Defense-in-depth at the network layer: even if app code drifts, the
   tunnel cannot expose non-webhook paths. The tunnel config is
   **deliberately not git-tracked** (it lives in the operator's
   `~/.cloudflared/`); setup is documented in
   [docs/contributing/billing.md](docs/contributing/billing.md) §7.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-001 .` to enumerate.
Today:

- [editor/app/(ingest)/README.md](<editor/app/(ingest)/README.md>) — rules.
- [editor/app/(ingest)/webhooks/stripe/route.ts](<editor/app/(ingest)/webhooks/stripe/route.ts>) — Stripe receiver.
- [editor/app/(ingest)/webhooks/metronome/route.ts](<editor/app/(ingest)/webhooks/metronome/route.ts>) — Metronome receiver.
- [editor/proxy.ts](editor/proxy.ts) — path bypass.
- [docs/contributing/billing.md](docs/contributing/billing.md) — tunnel ingress filter setup (the config itself is untracked by design).
- [editor/scripts/billing/README.md](editor/scripts/billing/README.md) — dev docs.

**What does NOT belong under `(ingest)/`.** Admin tools, internal RPC,
anything that authenticates via cookie/session/bearer-token — those use their
own browser/private or registered `/api/v1` boundary. Legacy public endpoints
live under `(api)/(public)/v1/**`. Mixing categories breaks the trust contract.

---

### `GRIDA-SEC-002` — Insiders dev harness is local-only

**What it protects.** The `(insiders)` route group hosts a developer
harness — pages and server actions used to drive Metronome/Stripe
lifecycle steps manually during development and QA. The actions there
intentionally **omit org-membership / ownership checks** and accept an
attacker-supplied `organizationId` as the first argument. That shape is
fine for a local-only debug surface; it would be a cross-org
compromise vector in any non-local environment. The boundary is the
rule that **`/insiders/*` is reachable if and only if
`NODE_ENV === "development"`.**

**Vulnerable scenario (prevented).** A developer ships the
`(insiders)` route group as part of the production bundle without
gating it. Server actions like `actionAddStripeChargedCommit(orgId,
amountCents)`, `actionIngest(orgId, costMills)`, and
`actionGetInvoicePdf(orgId, invoiceId)` become reachable on the public
internet. An attacker enumerates `organization_id` (sequential bigint),
then calls these actions to charge any org's saved Stripe card, zero
out any org's AI-credit balance via the optimistic-debit RPC (which
also flips `customer_entitled = false`), or read any org's billing
state and invoice PDFs.

**Why it's specifically risky here.** Next.js server actions are
**HTTP RPC endpoints addressable from any browser** via the
`Next-Action` header — the action hash is shipped in the client
bundle of any page that imports it. They are _not_ protected by
"the page UI isn't linked anywhere"; whatever URL group the action
lives under is the only structural gate. An open-source repo means
the action source is public, so the hashes are too. Without a
proxy-level gate, a single accidentally-deployed harness action is a
production cross-org vulnerability.

**How the code prevents it.**

1. **Proxy-level gate** — [editor/proxy.ts](editor/proxy.ts) returns
   404 for `/insiders` and `/insiders/*` whenever `NODE_ENV !==
"development"`. The proxy runs _before_ any handler, so this also
   stops `Next-Action` POSTs to `/insiders/*` URLs.
2. **Layout-level `notFound()`** —
   [editor/app/(insiders)/layout.tsx](<editor/app/(insiders)/layout.tsx>)
   throws `notFound()` when not in dev. Defense-in-depth: even if a
   future change accidentally weakens the proxy gate, the layout still
   renders 404 for every page in the group.
3. **No imports across the boundary** —
   [editor/app/(insiders)/insiders/billing/actions.ts](<editor/app/(insiders)/insiders/billing/actions.ts>)
   carries a `GRIDA-SEC-002` header documenting that these actions
   must NOT be imported from production code paths. Importing them
   from a `(site)` page would re-emit the action hashes against that
   page's URL and bypass the proxy gate.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-002 .` to enumerate.
Today:

- [editor/proxy.ts](editor/proxy.ts) — proxy gate.
- [editor/app/(insiders)/layout.tsx](<editor/app/(insiders)/layout.tsx>) — layout `notFound()` fallback.
- [editor/app/(insiders)/insiders/billing/actions.ts](<editor/app/(insiders)/insiders/billing/actions.ts>) — header callout, "no import from prod code".

**What does NOT belong under `(insiders)/`.** Anything that needs to
ship to production. If a feature in development outgrows the dev
harness, move it to `(site)/...` (with proper auth) or `(api)/...`
(with proper auth) — never relax the `(insiders)/` gate to host it.

---

### `GRIDA-SEC-003` — AI seam org-id trust boundary

**What it protects.** Every call into the AI provider SDKs (Vercel AI
SDK, Replicate, OpenAI, Anthropic) is gated and billed against an
`organizationId`. If that id reaches the seam unverified, an attacker
who can choose the id drains another org's credit balance. The
boundary is the rule that **every `organizationId` reaching
`editor/lib/ai/server.ts` has been verified as a member-org for the
calling user.**

**Vulnerable scenario (prevented).** A developer adds a new AI route
handler that reads `organizationId` from the request body and forwards
it straight into the seam. An attacker enumerates `organization_id`
(sequential bigint) and submits requests with `organizationId =
<victim>`. Each request bills the victim's balance, eventually flips
their `customer_entitled = false`, and locks them out of AI until
they top up. Worse, the attacker's free-tier user enjoys the victim's
credit for as long as it lasts. Mass automation makes this an
asymmetric DoS-by-billing attack.

**Why it's specifically risky here.** AI route handlers and server
actions sit on internal/private surfaces, but they are still HTTP
endpoints reachable by any authenticated user. Org membership is
checked by RLS on data reads, **not** on AI-seam writes — the seam
calls Metronome (an external service), not our own DB, so no RLS
gate fires. Without a structural producer-side rule, every new AI
endpoint is a fresh chance to forget the membership check.

**How the code prevents it.**

1. **One verified producer** —
   [editor/lib/auth/organization.ts](editor/lib/auth/organization.ts)
   exports `requireOrganizationId({ user_id, request, routeParams,
inputOrgId })`. It resolves from: route param slug → request
   header `X-Grida-Organization-Id` → explicit input. Every resolved
   id is verified via `assertOrgMember(user_id, org_id)` before
   return. No "current org" is read from session blob / cookie.
2. **Runtime contract in the seam** —
   [editor/lib/ai/server.ts](editor/lib/ai/server.ts)
   `withTransaction` (and the AI SDK middleware that wraps it) throw
   `MissingOrgIdError` if `organizationId` is missing, non-integer,
   or non-positive. This is **unconditional** on the billed path: the
   former `NEXT_PUBLIC_GRIDA_LOCALDEV_SUPERUSER` exception (synthetic
   `organizationId:0`, gate/ingest/auth skip) has been **removed** —
   no code path skips this check while billing. The only intentional
   bypass is the BYOK carve-out below, and it does not bill.
3. **Single seam entry point** —
   [editor/lib/ai/server.ts](editor/lib/ai/server.ts) is the ONLY
   file allowed to import `replicate`, `openai`, `@ai-sdk/*`,
   `@anthropic-ai/sdk`. Enforced by oxlint
   `no-restricted-imports` ([editor/.oxlintrc.jsonc](editor/.oxlintrc.jsonc))
   and the CI audit script
   ([editor/scripts/audit-ai-seam.ts](editor/scripts/audit-ai-seam.ts)).
   A new file that bypasses the seam fails at lint or CI.

**BYOK carve-out (intentional).** When a contributor sets a `BYOK_*`
key ([editor/lib/ai/models.ts](editor/lib/ai/models.ts) —
`BYOK_OPENROUTER_API_KEY`, `BYOK_AI_GATEWAY_API_KEY`), `grida`/`model`
return a **bare** provider so the **AI-SDK text/chat path** bypasses
the billing seam: no gate, no Metronome ingest, **and** the
`MissingOrgIdError` runtime contract above does not fire (a bare
provider has no middleware). The contributor's own provider key is
charged directly — there is no Grida balance, hence no victim to
drain, so the billing trust boundary is moot for that path. **Scope —
AI-SDK path only.** BYOK only swaps the AI-SDK provider; Replicate-
backed actions (`runPrediction`/`withTransaction` — audio, image) are
**not** bypassed and still gate + ingest under BYOK. Accordingly the
`withAiAuth` `balanceCents:0` short-circuit is opt-gated
(`byokBypass`, default `false`): only AI-SDK actions set it, so billed
actions still read the real balance and cannot silently drain credit
while reporting `0`. **BYOK bypasses billing only — never auth.** `requireOrganizationId` and
route/action auth always run, so a logged-in user with no resolvable
org is still rejected. Gated solely by server-only, non-`NEXT_PUBLIC_`
env vars never set in the hosted product (same trust model as
`OPENAI_API_KEY` / `REPLICATE_API_TOKEN`). Fail-closed: `byok` is
`null` unless a key env var is a non-empty string, so any ambiguity
falls back to the billed path. **Residual risk:** `byok` is resolved
once at module load with no per-request guard — an accidental `BYOK_*`
on a hosted/preview deploy would make every org bypass billing and the
org-id sanity gate (auth still holds). Acceptable only because it is a
contributor/self-host switch under the existing server-env trust model.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-003 .` to enumerate.
Today:

- [editor/lib/auth/organization.ts](editor/lib/auth/organization.ts) — `requireOrganizationId`.
- [editor/lib/ai/server.ts](editor/lib/ai/server.ts) — single seam entry; unconditional runtime gate; BYOK layer switch.
- [editor/lib/ai/models.ts](editor/lib/ai/models.ts) — BYOK layer (bare provider, bypasses billing).
- [editor/.oxlintrc.jsonc](editor/.oxlintrc.jsonc) — import lint rule.
- [editor/scripts/audit-ai-seam.ts](editor/scripts/audit-ai-seam.ts) — CI audit.

**What does NOT belong here.** Reading `organizationId` directly off a
request body in any AI-adjacent code. Even if you think you "trust"
the body — Next.js server-action hashes ship in the client bundle and
become public the moment they're shipped. Always go through
`requireOrganizationId`.

---

### `GRIDA-SEC-004` — Desktop daemon trust boundary

**What it protects.** The Grida Desktop V1 ships a local daemon
sidecar (Node subprocess of the Electron app) that owns the user's BYOK
keys (OpenRouter, Vercel AI Gateway, fal, ElevenLabs), native-provider
OAuth credentials (GRIDA-SEC-008), local file paths, chat sessions, and AI
agent loops.
Electron main listens on an ephemeral
`127.0.0.1` port and transfers only accepted connected sockets to the
socketless sidecar, whose authenticated daemon protocol is the canonical local
capability surface for the renderer. If anything other than the legitimate
Electron renderer reaches it — another browser tab on grida.co, a
local malware process, a same-origin XSS payload — that party can
exfiltrate secrets, read/write the user's files, and bill AI calls.
The boundary is the rule that **only requests originating from the
desktop's privileged renderer at a `/desktop/*` path, signed with
the per-spawn Basic Auth token, may reach the daemon, and only the
main-owned provider transport may carry the daemon's provider HTTP outside
its sandbox. Electron main owns the exact loopback listener; AgentSidecar
receives no listener, and the macOS/Linux sandbox grants it no generic
bind/connect authority. Windows does not yet satisfy that containment
clause; its current nonconformance is recorded below.**

**Package shape (#927).** The perimeter and the host capability routes
(files, recents, workspaces, the secrets store) are owned by
[`packages/grida-daemon`](packages/grida-daemon) (`@grida/daemon` —
`DaemonServer`, `http/auth.ts`, `http/origin.ts`, `http/server.ts`).
The AI surface (`/agent`, `/sessions`, `/secrets`, `/providers`,
`/images`, `/video`, `/three-d`, `/audio/music`, `/audio/sound-effects`,
`/audio/text-to-speech`, the run loop and tools) is a **tenant** —
[`packages/grida-ai-agent`](packages/grida-ai-agent)'s
`createAgentTenant` — mounted behind that perimeter through the typed
`DaemonTenant` seam. Everything in this record applies to the composed
server (`createAgentDaemon`) that desktop and the CLI actually run;
the split moves code, not the wire contract.

**Vulnerable scenario (prevented).** A stored XSS lands on a marketing
page or blog post served from `grida.co`. The user has the desktop app
open. Without the boundary, the XSS calls
`fetch('http://127.0.0.1:<port>/secrets/get?key=byok.openrouter')` and
ships the key to an attacker-controlled host; or
`fetch('http://127.0.0.1:<port>/files/read?docId=…')` and exfiltrates
the user's design files. A parallel local-machine attack: an
unprivileged malware process scans `127.0.0.1:49152-65535`, finds
the daemon, and hits its endpoints (a non-browser client doesn't honor
`Origin` checks). Both attacks defeat the "secrets in keychain"
intuition because the local network is a trust shortcut.

**Why it's specifically risky here.** The desktop V1 renderer URL-loads
`https://grida.co/desktop/...` (a literal path, distinct from the
universal-routing `/_/...` system).
That puts the privileged preload bridge on the same Chromium origin
as every other grida.co page. Without per-path preload scoping and
per-request agent-server auth, "XSS on grida.co" becomes "RCE-equivalent in
the desktop app" (the same failure class as the Discord 2021 Sketchfab
embed → context-isolation-disabled → RCE chain). Industry precedent
(Figma's `FigmaAgent` allowlisting only figma.com + Local Network
Access permission) confirms the threat is real and the mitigation
shape is standard.

**How the code prevents it.** Composed of mutually reinforcing controls; any
single control is insufficient.

1. **Path-scoped preload** — the bridge in
   [desktop/src/preload.ts](desktop/src/preload.ts) installs
   `window.grida` only when `location.pathname` is `/desktop` or starts
   with `/desktop/` at preload-run time. The preload fails closed when
   the current document is not a desktop route.
   A fresh document load that doesn't match the prefix gets no bridge,
   so XSS on `/blog/foo` cannot see it. SPA navigation within an
   already-loaded document is constrained by preload's history guard and
   the `will-navigate` / `did-navigate-in-page` allowlist in
   `desktop/src/window.ts` — `contextBridge.exposeInMainWorld` has no
   revocation API, so the navigation guards defend the post-mount surface.
   Path eligibility is not capability admission by itself:
   `desktop/src/main/desktop-entry-window.ts` resolves an exact sender window
   to its current native role only while that role is stable, and
   `desktop/src/main/ipc-admission.ts` applies a closed role + pathname +
   channel policy inside the common guarded-IPC wrapper. Main rejects auth and
   onboarding paths even before a navigation observer runs; sign-in receives
   only browser launch + read-only title-bar state. Onboarding receives only
   ChatGPT controls, completion, and two purpose-scoped main-owned workspace
   operations (read the default or choose/register one folder). It never
   receives the daemon connection tuple or a generic filesystem dialog. A
   transitioning, stale, foreign, or post-sign-out auxiliary renderer resolves
   to no role and receives no IPC capability.

2. **CSP-strict `/desktop/*` routes** — [`editor/proxy.ts`](editor/proxy.ts)
   sets a per-request nonce-based CSP on every `/desktop/*` response,
   following the canonical Next.js pattern (nonce + `'strict-dynamic'`).
   Concretely:
   `default-src 'self'; script-src 'self' 'nonce-<random>' 'strict-dynamic'
'wasm-unsafe-eval'; connect-src 'self' http://127.0.0.1:*
http://localhost:*`. The nonce is generated in the proxy, exposed
   to SSR via the `x-nonce` request header, and Next.js attaches it
   to its own framework scripts automatically. No third-party
   analytics, Sentry, or marketing scripts run on these routes —
   eliminates the "Sentry input masking is fragile" exfil for BYOK
   keys. We chose nonce + `'strict-dynamic'` over `'unsafe-inline'`
   because `/desktop/*` was already dynamic-rendered (bridge gate is
   client-only) — the dynamic-rendering cost most Next.js teams pay
   for nonce CSP is a cost we already pay, so this control stays
   load-bearing at zero additional maintenance.

   **For maintainers:** if you add inline scripts to a `/desktop/*`
   layout or page, they must carry the nonce. Read it via
   `(await headers()).get("x-nonce")` and pass it to whatever you're
   rendering (e.g. `<ThemeProvider nonce={nonce}>` for `next-themes`,
   `<Script nonce={nonce}>` for `next/script`). Next.js handles
   framework scripts and `<Script>` components automatically when the
   `Content-Security-Policy` header is present on the request. Inline
   `<script>` tags written by hand are your responsibility.

3. **Per-request Basic Auth** — the daemon rejects any request without
   `Authorization: Basic <base64("agent:<password>")>`. Password is a
   random 256-bit value generated per sidecar spawn. Electron main sends it in
   the private, versioned stdin bootstrap frame and serves it to preload only
   through guarded IPC; it is never placed on argv, env, disk, or
   `window.grida`.

   Electron main owns the exact `127.0.0.1:<ephemeral>` listener. Each
   loopback connection is accepted paused and transferred as an
   already-connected socket over the per-spawn Node IPC descriptor.
   AgentSidecar starts `DaemonServer` without a listener and can serve only
   that transferred connection: it receives no listener, destination field,
   bind operation, or connect operation. The descriptor is therefore a socket
   capability channel, not a second daemon protocol. This keeps
   `allow_local_binding: false` in the sidecar's `srt` profile and preserves
   the main-owned loopback port across Bubblewrap's private Linux network
   namespace.

   **Daemon mode (#798).** When the daemon runs as a registered local
   daemon (`grida-agent serve --register`; WG spec
   [docs/wg/ai/agent/daemon.md](docs/wg/ai/agent/daemon.md)), the per-spawn
   password gives way to a **persistent** credential stored owner-only
   (0600) at `<state-dir>/daemon.credential`, alongside the `daemon.json`
   registration record (also 0600, atomic temp+rename write;
   `Daemon.read` refuses non-loopback URLs so a tampered record cannot
   redirect a credential-bearing client off-machine —
   [packages/grida-daemon/src/daemon.ts](packages/grida-daemon/src/daemon.ts)).
   Liveness probing is the **authenticated** `/handshake`; there is
   deliberately no unauthenticated health route for local malware to
   port-scan against. Two carriages, one credential: the
   `Authorization: Basic` header everywhere, plus an `auth_token` query
   parameter accepted ONLY on GET event-stream routes
   (`/agent/stream/:id`, `/sessions/:id/status`) for header-less
   `EventSource` attach (`@grida/daemon`'s `http/auth.ts`; the route set
   is declared BY the agent tenant via `sse_query_token_paths` on the
   `DaemonTenant` seam — `packages/grida-ai-agent/src/server.ts`).
   A present header always wins — a wrong header never falls back to the
   token — and the token is never accepted on mutating routes, so a URL
   leak (proxy logs, history) can at worst read stream frames for the
   leaked session id; it cannot mutate state, run the agent, or touch
   secrets. CORS/Referer layers still apply unchanged to token-authed
   requests.

4. **Defense-in-depth `Referer` check** — the daemon rejects any request
   whose `Referer` path is not under the host-declared desktop route root. Catches a same-origin
   XSS that somehow bypasses preload scoping (e.g. a future SPA-nav
   race condition).

5. **`secrets.get` does not exist** — the bridge surface in
   [desktop/src/preload.ts](desktop/src/preload.ts) exposes only
   `secrets.has/set/delete`. Agent server code reads keys internally when calling
   the BYOK provider; key material never returns to renderer. Closes
   the exfil path even if all preceding controls were bypassed.

6. **Host-routed provider HTTP (#974)** — `@grida/agent` accepts two explicit,
   construction-time HTTP operations: authenticated provider requests and
   credential-free provider-asset downloads. Desktop implements them over the
   sidecar's inherited stdin/stdout using a strict length-prefixed protocol;
   stdout is protocol-only and stderr is logs. Electron main executes requests
   through a dedicated, non-persistent Chromium `Session` in system-proxy mode.
   It revalidates the host-issued grant, method, exact/suffix origin, headers,
   body bounds, and every redirect; response bytes move only against explicit
   credit and aborts propagate both ways. The download lane contains only
   enumerated provider-owned namespaces — there is no arbitrary public-URL
   grant.
   There is no renderer broker method, loopback proxy, socket path, or
   environment credential. The ChatGPT-subscription lane registered by
   GRIDA-SEC-008 adds only exact `auth.openai.com` token and `chatgpt.com`
   Responses destinations; those grants are never eligible for the asset lane.
   When this transport is enabled, the outer `srt`
   policy omits BYOK/GG destinations, so missing provider wiring cannot fall
   back to direct sidecar egress. Electron main transiently observes provider
   request headers and bodies while transporting them, but never persists,
   returns, or logs credentials or bodies; credential ownership and injection
   remain in the sidecar's provider layer.

   Chromium supplies the operating system's effective proxy/PAC, VPN, DNS, and
   platform-trust behavior. Cached or integrated proxy authentication remains
   eligible; Desktop does not collect proxy usernames/passwords, so an
   interactive proxy challenge fails closed with a specific diagnostic. This
   is route compatibility, not a censorship-circumvention tunnel: no route is
   created when Chromium and the operating system have none.

**Endpoint providers (local LLMs, #806).** The agent tenant additionally
serves `/providers/endpoints/*` — CRUD over user-configured
OpenAI-compatible endpoints (Ollama preset, self-hosted gateways),
persisted at `${userData}/endpoints.json`. The split that keeps the secrets
discipline intact: an endpoint **config** (base URL + registered model list) is
plain readable config the renderer may list back, while an endpoint's
optional **API key** rides the `/secrets/*` surface under the endpoint's
id (the secrets-route allowlist admits configured endpoint ids) and is
never readable. The config validator
(`packages/grida-ai-agent/src/protocol/endpoints.ts`) pins the shape —
http(s) URL with no URL userinfo, bounded sizes, unknown fields dropped — so a
config write cannot smuggle credentials or blobs into the readable store.
`base_url` is user-owned egress by design, but renderer configuration is not
network authority: Desktop routes set/delete/probe through guarded main IPC,
shows the canonical exact origin and route posture in a native confirmation,
and mints a memory-only grant only after approval. Only `localhost`, subdomains
of `.localhost`, and IP literals are currently eligible, always as exact
origins. Remote hostnames — including `.local` names — remain withheld because
the current Chromium connector cannot atomically bind proxy/PAC selection and
DNS resolution to one authorization decision. Existing configured endpoints
require the same approval on each
launch; changing or deleting an endpoint revokes its old grant. The routes sit
behind the same CORS/Referer/Basic-Auth stack as everything else. The
`/providers/endpoints/probe` route makes the host GET a
user-supplied URL's model listing (the renderer's grida.co origin cannot
reach a local Ollama itself) — the same egress a configured run already
performs; responses are parsed and reduced to
`{id, tool_call, contextWindow}` rows with bounded reads (timeout + size
cap), never proxied raw. The host transport permits an eligible local endpoint
only through that explicit exact-origin grant; it does not turn endpoint
config into a generic proxy.

**Agent providers (external agents, #813).** The reusable agent package can
drive an
EXTERNAL agent that owns its own loop (Claude Code via
`@anthropic-ai/claude-agent-sdk`), that agent makes its own outbound auth +
inference calls to its vendor. Those vendor hosts (Anthropic:
`api.anthropic.com` incl. `/api/oauth/claude_cli/*`, `*.anthropic.com`,
`claude.ai`) are added to the same enumerated `allowed_domains` allowlist as
the BYOK provider hosts (`sandbox/policy.ts` `AGENT_PROVIDER_NETWORK_HOSTS`) —
NOT a `*` opening. Desktop explicitly sets `external_agent_execution:
"disabled"`: the ACP subprocess cannot consume the host-routed provider
transport or prove system-route compatibility, so it is unavailable even on a
sandboxed macOS/Linux launch. Reusable-package hosts choose an explicit
`external_agent_execution` posture: `"sandboxed"` requires
`sandbox_enforced === true` at HTTP preflight and immediately before spawn;
`"enabled"` makes no containment claim; and `"disabled"` withholds ACP.
Omission resolves to `"disabled"`, so reusable hosts must explicitly select
`"enabled"` or `"sandboxed"` to permit external-agent execution.

**Electron-side hardening (mandatory; see the
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)).**
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
`webSecurity: true`, `allowRunningInsecureContent: false`; release builds
load `https://grida.co` while dev loads `http://localhost:3000`;
`will-navigate` blocks navigation off `EDITOR_BASE_URL`;
`setWindowOpenHandler` denies and routes external links through
`shell.openExternal` after validation; `will-attach-webview` rejects;
every main-process IPC handler validates `event.senderFrame.url`.

**Agent shell execution.** The `run_command` agent tool spawns child
processes through `@grida/daemon`'s `shell/runner.ts` with `shell: false` (no shell
interpolation). There is **no command allowlist** — the OS sandbox (`srt`,
see the supervisor) is the structural boundary, and a per-session
**permission mode** governs the surface (`protocol/mode.ts`):

- `accept-edits` (default): read-only/inspection commands auto-run
  (`permissions.ts` `isReadOnlyCommand`). The only mutating exception is a
  plain, two-path `cp` or `mv` whose existing regular-file source and absent
  destination both canonicalize inside the same session scratch root; flags,
  symlinks, overwrites, missing parents, or any path outside scratch fail closed
  to the ordinary supervised Allow/Deny approval. This exception lets the agent
  organize pre-authorized ephemeral working bytes without treating promotion
  into the workspace as pre-authorized. Every other mutating/executing command
  **pauses for approval** before it runs. The gate is the AI SDK's native
  `needsApproval` on the tool (`tools/run-command.ts`), wired from the session
  mode at `workspace-agent-bindings.ts` (`needs_approval = !isReadOnlyCommand &&
!isScratchLocalCopyOrMove` in `accept-edits`, absent in `auto`). The gate is
  the tool's, NOT the backend's: by the time the command backend's `execute`
  runs, the call is already cleared (auto, pre-authorized scratch-local
  operation, or user-approved), so the backend cannot re-gate on mode without
  refusing an approved command.
- `auto`: every command runs; the OS sandbox is the sole guard. The semantic
  safety classifier that would judge intent is **deferred** — `auto` is an
  opt-in, informed-consent posture.

**Supervised-approval answer boundary.** The approval pause/resume crosses the
trust boundary, so the answer is server-validated. The host owns message state
(it rebuilds the model view from the DB each turn), so the answer does NOT ride a
client-mutated assistant message — it travels as an explicit `approval_answer`
field on the run-request body (`{tool_call_id, approval_id, approved}`), exactly
like `mode`/`model_id`. `parseRunBody` shape-gates it (`coerceApprovalAnswer`;
malformed ⇒ no resume, never a 400), then `applyApprovalAnswer`
(`runtime/run-input.ts`) routes it through
`store.commitApprovalContinuation`, which atomically flips a persisted part to
`approval-responded` and binds its exact consuming run **only if** it is
currently `approval-requested` with a matching approval id and session. A
forged client request therefore cannot inject a tool call, approve something
never asked, or rewrite assistant history — it can only supply the boolean the
host is already waiting on. The recorder persists the `approval-requested` state and the
model-view rebuild (`message-view.ts`) lowers `approval-responded`/`output-denied`
parts so the SDK resumes (runs) or skips (denies) the call. Symmetrically, a send
that does **not** answer the pending approval cannot run _ahead_ of it: the run
handler (`runtime/index.ts`) refuses to start a new turn while an approval or
other human-input tool is unanswered (HTTP 409 `human-input-pending`) — the same
fail-closed invariant the queue drain enforces through the persisted
`pending_human_input_kind` classifier. Before filling a client-resolved
human-input result, the handler requires the exact visible message, tool-call
id, and persisted tool type and rejects any request that carries an unpersisted
caller-owned user or system message, so a forged result type or an
answer-plus-follow-up cannot bypass queue order in one body. A client-carried
human-input continuation resolves exactly one correlated block; a batch naming
multiple pending blocks is rejected before mutation rather than partially
consumed, conflicting duplicate copies fail closed, and a question or
design-search result must satisfy that tool's canonical output schema before
the pending block can be consumed. Approval/question resolution is a two-phase
commit: the read-only match happens first, but the conditional persisted-state
mutation waits until scratch staging and incoming persistence succeed. A
rejected resume therefore leaves the human interaction actionable and safely
retryable. For an approval or question/design-search result, that conditional
mutation atomically stamps a host-only `continuation_run_id` on the exact
session/message/tool-call row. The marker remains through the resumed turn and
is cleared only after the recorder settles inside the stream's
finish/error/abort barrier, before the scheduler can observe the terminal edge.
A synchronous failure before stream reservation rolls that exact run's answer
back to `approval-requested` or `input-available`; a failed rollback or
settlement leaves the marker fail-closed in the human-input classifier, so
queued work cannot overtake it. On host restart, marked continuations are
converted to `output-error` and cleared before queue recovery because replaying
their model/tool side effects would be unsafe. Historical completed
human-interaction outputs have a null marker and are never selected by that
repair.
Ordinary desktop submissions use
queue-aware admission while this state is open; if a stale client races the
low-level run endpoint, it preserves the same user-message id through durable
queue admission and rehydrates rather than converting text into an approval
answer. So neither a forged answer nor a typed-ahead follow-up can bypass or
orphan the block. On host restart, an `approval-responded` call with no terminal
output is converted to `output-error` before queue recovery: the host cannot
prove whether its side effect completed before the crash, so it must not replay
the approved operation.

Three structural checks hold regardless of mode: cwd must be inside the exact
current workspace or the current session's scratch (never another registered
workspace or session), command args receive a defense-in-depth secret-root
check, and fs-edit tools retain their no-clobber protected-path guard
(`fs/scope.ts`: `.git`, rc/env files, lockfiles, agent config).

The long-lived sidecar's outer sandbox is only a coarse backstop. It does not
raw-spawn model commands: `@grida/agent` calls a host-injected `ShellExecutor`,
the sidecar sends one bounded `command.request` over its inherited private
channel, and Electron main independently canonicalizes the exact workspace,
session scratch, cwd, and host-owned scratch base. Main then asks `srt` for a
fresh kernel profile for that finite command. The profile denies the entire
shared scratch base and the daemon's secret `userData`, re-allows only this
session's scratch, and grants writes only to the exact workspace, exact
scratch, and a private per-command temp directory. It also denies SRT's shared
compatibility temp/log write defaults and gives the command no direct network
destination or local-bind authority. An interpreter that computes a sibling
scratch or `userData` path at runtime is therefore denied by the kernel, not
merely by argv inspection.

- **Abort is a cleanup barrier, not just a UI edge.** A turn abort propagates
  through the AI SDK tool signal as `command.abort`. Main keeps that command
  active until the executor has terminated the ordinary process group and
  `AgentCommandHost` has removed its private temp and released SRT bookkeeping;
  only then does it return the terminal `command.aborted` acknowledgement.
  The agent runtime tracks both that command promise and the model-stream pump
  in the turn's settlement barrier, so replacement admission and session
  deletion remain HTTP 409 until the acknowledgement has been consumed and
  the aborted pump has settled. This orders cleanup for the authority the host
  actually owns; it does not strengthen the macOS `setsid(2)` limitation below.

- **Network (allow-only, enumerated).** `srt` denies all outbound except a
  host-set domain allowlist and **forbids `*` / broad patterns by design** —
  its structural sandbox is also its network sandbox, so there is no "open
  network." Desktop passes `direct_network_access: "none"` plus
  `host_routed_provider_http: true`. The first omits the daemon development
  baseline and agent/external-vendor destinations; the second documents that
  in-process provider/GG traffic uses the host transport. In the enforced
  macOS/Linux profile, pinned srt 0.0.65 receives an empty direct external
  allowlist and `allow_local_binding` is false. The daemon remains reachable because Electron
  main owns the loopback listener and transfers only accepted connected
  sockets; the wrapped sidecar receives no generic local-connect authority.
  Windows currently lacks that kernel egress fence. CLI and other hosts retain
  the package's allowlisted defaults unless they explicitly choose the same
  strict construction mode.

- **Fail-closed exposure (no executor ⇒ no shell).** `sandbox_enforced` is an
  attestation about the coarse sidecar boundary, not command authority. The
  tenant registers `run_command` only when its host injects a `ShellExecutor`;
  omission is the default. Desktop injects the private main-owned executor only
  on platforms where SRT is enabled, so Windows gets fs/todos/skills but **no**
  `run_command` and no external ACP agent. The `grida-agent` CLI — a local,
  user-invoked tool with no OS sandbox — uses the separately named
  `allow_unsandboxed_shell` opt-in, which explicitly injects the raw runner and
  logs a warning. A boolean claim alone can never cause raw execution.

- **Secret-dir containment (per command).** The daemon's own secret dir —
  its `userData`, where BYOK `auth.json`, `workspaces.json`, `recent.json`,
  and the sessions db live — is deliberately **not** in the `srt`
  **outer** policy, because the sidecar itself must read `auth.json` for
  provider calls. Electron main does not need that authority to execute a
  command, so every finite-command profile adds a kernel `deny_read` and
  `deny_write` for `userData`. `validateShellRequest` still rejects an explicit
  arg resolving there as defense in depth, but computed interpreter paths are
  covered as well. HOME secrets (`~/.ssh`, `~/.aws`, shell rc files) remain
  denied in both outer and command profiles. The fs-edit tools (`read_file`)
  remain workspace/scratch-scoped and never serve `userData`.

- **`auto` is informed-consent.** `auto` removes command-identity gating; the
  sandbox still bounds the blast radius (writes confined to writable roots,
  direct external network denied), but it does not judge _intent_ — an injected or confused
  agent can read broadly and run anything within those bounds. Restoring intent
  judgment is the classifier/watchdog layer, named and deferred. `auto` is
  opt-in; the default `accept-edits` requires approval for mutations except
  the narrow scratch-local copy/move operation described above.

**Human terminal (deliberate contrast to the agent shell).** The
workbench's Terminal pane (`bridge.terminal.*`) is a real, **unsandboxed**
login PTY — arbitrary code execution by design, accepted under the same
trust model as VSCode's integrated terminal: the human runs commands as
themselves, on their own machine, with their own privileges (no
escalation). It is deliberately NOT wrapped in `srt` and deliberately NOT
part of the agent's tool surface — the agent's `run_command` stays
confined behind the sandbox gates above, and no code path hands the agent
a handle to a human terminal. What makes the surface acceptable is that
only the legitimate desktop renderer can reach it: the four terminal IPC
channels are registered through the same sender-frame `guarded()` wrapper
as every other native capability (editor origin + `/desktop/*` path), the
preload exposes them only on desktop routes, and the PTY host
(`desktop/src/main/terminal-host.ts`) additionally (a) resolves the spawn
cwd from a workspace **id** through the sidecar registry — the renderer
never passes a raw path, (b) binds each terminal to the WebContents that
created it so one window cannot drive another window's shell, (c) caps
PTYs per window, and (d) kills every PTY on window close and app quit.
A contract test (`desktop/src/main/terminal-host.test.ts`) fails if a
terminal channel is ever registered outside `guarded()`.

**Hosted auth + hosted AI.** The desktop signs the webview into a
first-class Supabase cookie session via the system browser + PKCE +
`grida://auth/callback` deep link — that flow is its own boundary,
`GRIDA-SEC-005` below. The hosted "included" AI provider — **Grida
Gateway (GG)**, the `gg` provider, GRIDA-SEC-006 — amends the old
"sidecar holds no cloud credentials" invariant to its precise form:
**the sidecar may hold ONLY the purpose-scoped, short-lived AI token**
(memory-only, pushed by the renderer over `/auth/gg/set`, never
`auth.json`, never a refresh token) — the durable session stays in the
webview cookie jar. Files registered under this record for that work
(all marked `GRIDA-GG`):
`packages/grida-ai-agent/src/providers/{gg-session,gg,gg-media}.ts`,
`src/http/routes/gg-auth.ts`, the `gg` arms in
`src/providers/{index,resolve-image,resolve-video}.ts`, and the
`gg_host` egress option in `src/sandbox/policy.ts` (used only by hosts without
host-routed provider HTTP). Electron main transports GG requests and can
transiently observe the scoped bearer header, but does not retain, persist,
return, or log it; steady-state token custody remains in the sidecar.
Entitlement enforcement stays server-side (the hosted endpoints gate + meter).

**Update channel.** Release builds must be signed/notarized by platform
policy. Security-sensitive runtime deps are reviewed as part of the
desktop release checklist; do not treat broad semver ranges as acceptable
for code running inside this boundary without an explicit review note.

**Workspace media streaming (#924).** The desktop media viewer renders
workspace images/videos from a custom privileged scheme,
`grida-workspace://workspace/<workspaceId>/<relPath>`, instead of inlining
bytes as base64 (which capped the viewer at 1 MiB). This adds a new
renderer-reachable file-read **origin**, so it is recorded here. The trust
model keeps the boundary intact: the Electron main-process handler
(`desktop/src/main/workspace-media-protocol.ts`) gains **no** filesystem
authority of its own — it only **proxies** the request to the sidecar's
streamed `GET /workspaces/file` route, injecting the same Basic-Auth the
renderer never sees and forwarding the `Range` header. Path containment is the
sidecar's existing `workspaceFs.resolveInside` realpath check, identical to
every other workspace read; the scheme is a transport for an already-exposed
capability, not a new reachable root. The renderer builds the URL as a pure
string (no credential crosses into it), and CSP scopes the scheme to
`img-src`/`media-src` only — it is **not** registered `bypassCSP`. A constant
host (`workspace`) carries no data so standard-URL host canonicalization can't
corrupt the id; both ids live in the path.

**First-party library images (reference-first artwork).** The artwork-station
gather step (`design_search`) shows the user images from the Grida **Library** —
the app's OWN Supabase storage bucket — and the picked references are kept as
URLs and rendered directly (never downloaded). So the desktop CSP allowlists the
**one first-party library origin** (`NEXT_PUBLIC_SUPABASE_URL`) in `img-src`,
image-only. This is distinct from the generated-media rule above: generation
provider CDNs (fal/openrouter/…) stay excluded — generated media is sidecar
bytes via `data:`/`blob:`/`grida-workspace:`. The origin is derived from env at
module load and omitted when unset (a malformed value cannot widen the policy);
`proxy.test.ts` pins both the allow (library origin in `img-src` only) and the
deny (provider CDNs still excluded). The alternative — proxying library images
through `grida-workspace:` like generated media — was rejected: the library is
first-party public read-only storage, and the product keeps its pins as URLs.

**Auto-created projects (managed root).** The reference-first home lets a
newcomer start without choosing a folder: it posts to `POST /workspaces/create`,
which mints a new **empty** project directory (just the folder — no `.canvas`,
no manifest, no document of any kind). This adds a new renderer-reachable
**write** authority (previously the renderer could only register a folder the
user had already picked through the OS dialog), so it is recorded here. The
boundary holds by three rules, none of which trust the caller for a path: (a)
the managed root is **host-injected** — the supervisor passes
`--projects-root=<~/Documents/Grida Projects>` (`desktop/src/main/agent-sidecar-supervisor.ts`),
never derived from the request; a host that wired no root refuses with a 400.
(b) The request's `name` is **slugified to a single filesystem segment**
(`WorkspaceRegistry.createProject` / `slugifyProjectName`): path separators,
`..`, NUL, and control chars cannot survive, so it can never be a path. (c) The
minted directory's realpath is **asserted strictly under the managed root** via
the shared `containsPath` (`path-contains.ts` — the same prefix+sep discipline
as the shell runner's root gates); an escape is removed and rejected. There is
**no `seed` field** anymore: the route body is `{ name? }` only, and the
registry writes nothing but the directory, so the earlier manifest-injection
surface is removed outright rather than field-constrained — whatever document
the workspace eventually holds is created by the AGENT through its own
already-bound (and separately-gated) fs write capability, not by this route.
The sidecar's structured `fs` writes remain inside its coarse outer `srt`
profile. A created project becomes an in-process workspace root for structured
tools; a shell command receives that exact canonical root again through the
main-owned per-command SRT profile rather than inheriting the union of every
opened workspace.
`workspaces.create.test.ts` pins traversal-name containment,
that the created project is empty (an unexpected `seed` body is inert), and the
no-managed-root refusal.

**Read-only directory references.** A native folder drop adds a deliberately
narrow host capability without registering the folder as a workspace or copying
its descendants into session scratch. Preload accepts only an OS-backed `File`
whose path Electron can resolve, and sends that raw path once to the authenticated
`POST /directory-scopes` route; the renderer receives only an opaque descriptor
with a virtual `/__references__/dir_<uuid>` path. The in-memory registry
canonicalizes the selected root, rejects either-direction overlap with the
daemon secret root and every sensitive-read root in the outer sandbox policy,
and bounds unclaimed grants by count and TTL. A run can atomically claim an exact
descriptor for one session only, before any incoming message or scratch mutation
is persisted. Persisted descriptors, copied/forked messages, expired grants, and
host restarts therefore cannot recreate authority; session deletion revokes the
live grant.

The agent filesystem exposes each claimed root only through lazy
`list_files`/`read_file`/`grep_files` traversal. It never hydrates the tree, adds
the root to shell cwd authority, or admits it to scratch/workspace writes;
`write_file` and `edit_file` return `read_only`. Every descendant operation uses
the daemon filesystem scope's realpath containment, so an escaping symlink is
rejected. Raw host paths never enter chat IR, model context, logs, or transport
responses. `directory-scopes.test.ts`, `run-input.test.ts`,
`workspace-agent-bindings.test.ts`, and `agent.test.ts` pin acquisition,
descriptor/session ownership, claim-before-persistence, no-path-persistence,
lazy reads, read-only mutation, and symlink escape refusal.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-004 .` to enumerate.
Today:

- [editor/lib/supabase/server.ts](editor/lib/supabase/server.ts) — `createClientFromBearer` (bearer-auth shim for existing private editor routes that allow Desktop-originated calls without browser cookies).
- [editor/app/(api)/private/ai/design/chat/route.ts](<editor/app/(api)/private/ai/design/chat/route.ts>) — legacy SVG/web whole-agent route; accepts bearer auth for existing Desktop SVG callers during migration.
- [packages/grida-ai-agent/src/providers/index.ts](packages/grida-ai-agent/src/providers/index.ts) — native/BYOK/hosted/endpoint provider resolver; never exposes credentials to the renderer. The ChatGPT arm is additionally bound by GRIDA-SEC-008.
- [packages/grida-daemon/src/daemon.ts](packages/grida-daemon/src/daemon.ts) — daemon discovery contract: owner-only atomic registration + persistent credential, loopback-only records, authenticated probe.
- [packages/grida-ai-agent/src/runtime/index.ts](packages/grida-ai-agent/src/runtime/index.ts) — agent run orchestration; owns run / stream / abort behavior and binds a consumed human-input result to the exact resumed run through terminal recorder settlement.
- [packages/grida-ai-agent/src/runtime/stream-registry.ts](packages/grida-ai-agent/src/runtime/stream-registry.ts) — in-flight run replay/abort registry; async model producers append and finish only through their exact `StreamEntry` generation, so a late response or error from aborted turn A cannot mutate queued replacement B under the same session id. Explicit human abort remains session-keyed so it targets whichever turn is current.
- [packages/grida-ai-agent/src/runtime/session-scheduler.ts](packages/grida-ai-agent/src/runtime/session-scheduler.ts), [status-sse.ts](packages/grida-ai-agent/src/runtime/status-sse.ts), and [the scheduler contract tests](packages/grida-ai-agent/src/runtime/session-scheduler.test.ts) — authoritative per-session run-state machine and its observation channel; classifies persisted approvals/questions, projects explicit waiting states after restart, and pauses/rechecks queue drain so an ordinary queued turn cannot run ahead of unresolved human input. Status-SSE hydration is deliberately read-only: only trusted lifecycle/mutation edges, host-start recovery, and provider-ready retries can schedule a queued turn.
- [packages/grida-ai-agent/src/runtime/command-backend.ts](packages/grida-ai-agent/src/runtime/command-backend.ts) — agent `run_command` adapter: validates cwd against only the current canonical workspace/own scratch, flushes structured writes, and delegates the exact immutable scope to a host-injected executor. It never raw-spawns.
- [packages/grida-ai-agent/src/tools/run-command.ts](packages/grida-ai-agent/src/tools/run-command.ts) — the supervised-approval gate itself: the AI SDK `needsApproval` predicate that pauses a mutating command before `execute` in `accept-edits` (absent in `auto`). The decision lives on the tool, not the backend.
- [packages/grida-ai-agent/src/runtime/workspace-agent-bindings.ts](packages/grida-ai-agent/src/runtime/workspace-agent-bindings.ts) — opened workspace to agent fs/todos/command bindings; wires the `accept-edits` supervised-approval predicate. The session scratch dir is wired into BOTH surfaces from one source (`deps.scratch_dir`): the shell executor's exact scope and the fs backend's reachable roots (so `view_image`/`read_file`/`write_file` reach scratch, not just the shell). Containment is preserved per root — a path under no reachable root falls back contained to the workspace, and the secrets root is never a reachable root. Also builds the `generate_image` binding: it reads BYOK keys via `SecretsStore` to call the image provider in-process and returns the saved scratch path + metadata + base64 `data` (the bytes are for the CLIENT to render; `AgentGen.toModelOutput` is text-only, so they are NEVER lowered to the model — no context bloat, no perception claim). The complementary `view_image` perception path DOES deliver bytes to the model, but only ones already read under the agent's existing fs read capability: `agent/hoist-tool-result-images.ts` (wired at `agent/index.ts` `prepareStep`, #923) relocates an image tool-result into a synthetic user-message image part so the model can actually see it on the openai-compatible wire — a model-view lowering that moves bytes already inside the prompt, never persisted, with no new read, no new egress, and no boundary change. The key never leaves the host, and the call omits `providerOptions.grida` so it is BYOK-paid, never Grida-billed (mirrors the `/images/generate` route).
- [packages/grida-ai-agent/src/session/scratch.ts](packages/grida-ai-agent/src/session/scratch.ts) — per-session ephemeral scratch dir (WG `scratch.md`): derives a host-namespaced base under a host-injected temp root and rejects lexical or physical overlap with `userData` in either direction before mutation. Authority creation is non-recursive; every predictable base/session level must be a non-symlink current-uid-owned directory and is tightened/verified to `0700` on POSIX, while an unsafe parent fails closed. Reclamation holds session admission, revalidates the authority before listing, and unlinks child symlinks rather than following them (per-session delete + synchronous host-start sweep). Desktop resolves that temp root in main before SRT can replace the sidecar's `TMPDIR` with a shared compatibility directory. `writeScratchFile` lands produced bytes (e.g. `generate_image`) owner-only (`0600`) within the session tree, rejecting any filename that is not a single safe path segment AND opening `O_NOFOLLOW` so a symlink planted at the basename (e.g. by an auto-approved scratch-cwd `run_command`) fails the write instead of redirecting it outside the tree — closing the lexical-check TOCTOU.
- [packages/grida-daemon/src/path-contains.ts](packages/grida-daemon/src/path-contains.ts) — shared `path.sep`-prefix containment used by the shell runner's workspace/secret-root gates, the scratch containment assert, and `createProject`'s managed-root assert (one source so the discipline can't drift).
- [packages/grida-daemon/src/media.ts](packages/grida-daemon/src/media.ts) and [protocol/resources.ts](packages/grida-daemon/src/protocol/resources.ts) — host-rooted durable binary-media store and its path-free DTO vocabulary. Entries use opaque UUID directories, validated single-segment filenames and MIME types, owner-only atomic writes with metadata committed last, bounded whole-file reads (64 MiB), descriptor-relative realpath containment, exact-root symlink refusal, and `O_NOFOLLOW` file handles. Save admission is serialized per store instance and refuses new items past 512 committed records or 4 GiB logical bytes; it never evicts published media. Corrupt or incomplete entries fail independently. Native path resolution exists only on the Node-only server export and is omitted from the tenant's persistence-only `DaemonServices.media` view; there is no media HTTP route or generic renderer filesystem capability.
- [packages/grida-ai-agent/src/runtime/run-input.ts](packages/grida-ai-agent/src/runtime/run-input.ts) and [tools/human-input-result.ts](packages/grida-ai-agent/src/tools/human-input-result.ts) — wire-message normalization + `coerceApprovalAnswer`/`applyApprovalAnswer` (shape-gates the explicit `approval_answer` body field and atomically binds a valid answer to its exact consuming run), plus exact correlation and canonical output-schema validation before a renderer-authored question/design-search result can consume a pending interaction.
- [packages/grida-ai-agent/src/protocol/context.ts](packages/grida-ai-agent/src/protocol/context.ts) — renderer-safe, persistable directory-reference descriptor vocabulary; the virtual path and read-only access are fixed by the host contract, while the descriptor itself carries no authority.
- [packages/grida-ai-agent/src/session/directory-scopes.ts](packages/grida-ai-agent/src/session/directory-scopes.ts) and [its contract tests](packages/grida-ai-agent/src/session/directory-scopes.test.ts) — in-memory pending/session grant registry: realpath canonicalization, protected-root overlap refusal, bounded one-shot acquisition, exact atomic claim, exclusive session ownership, and lifecycle revocation.
- [packages/grida-ai-agent/src/http/routes/directory-scopes.ts](packages/grida-ai-agent/src/http/routes/directory-scopes.ts) and [its perimeter tests](packages/grida-ai-agent/src/http/routes/directory-scopes.test.ts) — sole raw-path ingress, mounted behind the composed daemon's Auth/Origin/Referer perimeter; returns only an opaque descriptor.
- [packages/grida-ai-agent/src/http/routes/generated-media-persistence.ts](packages/grida-ai-agent/src/http/routes/generated-media-persistence.ts), [images.ts](packages/grida-ai-agent/src/http/routes/images.ts), [video.ts](packages/grida-ai-agent/src/http/routes/video.ts), [three-d.ts](packages/grida-ai-agent/src/http/routes/three-d.ts), [music.ts](packages/grida-ai-agent/src/http/routes/music.ts), [sound-effects.ts](packages/grida-ai-agent/src/http/routes/sound-effects.ts), and [text-to-speech.ts](packages/grida-ai-agent/src/http/routes/text-to-speech.ts) — generated image/video/3D/music/sound-effect/speech bytes are best-effort persisted through the optional host media service. Only a neutral filename, MIME type, and bytes enter the store: prompts, provider/model identity, credentials, and native paths do not. Text-to-speech voice discovery additionally projects upstream rows to bounded `{ voice_id, name }` values. A persistence failure is reduced to a generic warning and cannot discard or replace the already-generated response.
- [packages/grida-ai-agent/src/providers/elevenlabs-text-to-speech.ts](packages/grida-ai-agent/src/providers/elevenlabs-text-to-speech.ts) — exact-origin ElevenLabs adapter: injects the BYOK key only inside provider requests, bounds voice pagination/JSON and MP3 response bytes, projects voice metadata to ids/names, discards every non-success body, and emits only status/code-safe provider errors.
- [packages/grida-ai-agent/src/session/store.ts](packages/grida-ai-agent/src/session/store.ts), [schema.ts](packages/grida-ai-agent/src/session/schema.ts), and [db.ts](packages/grida-ai-agent/src/session/db.ts) — sessions store and durable schema; supervised approvals and client-resolved question/design-search results atomically receive an exact-run continuation marker only after exact server-authoritative correlation, and the startup-only orphan repair terminalizes abandoned non-human/answered approval calls and marked human interactions before queue recovery while preserving unanswered waits and unmarked completed history.
- [packages/grida-daemon/src/workspaces.ts](packages/grida-daemon/src/workspaces.ts) — opened workspace registry and root canonicalization.
- [packages/grida-daemon/src/workspaces/fs.ts](packages/grida-daemon/src/workspaces/fs.ts) — guarded file operations over a containment **scope** (a `{ id, root }`: the workspace, or the session scratch dir — NOT tied to the workspace registry). Every read/write realpath-checks containment to that scope's root, so a symlink escaping the scope is rejected regardless of which scope it is. The streamed-media export (`openFile`, #924) goes through the same `resolveInside` containment (resolved once per request) and then pins the read to a contained file descriptor: it opens the realpath'd target `O_NOFOLLOW` and fstat-streams from that handle, so a symlink swapped in after the check (the realpath→read TOCTOU) fails the open instead of escaping — the same defense as scratch writes. It is deliberately uncapped because streaming has constant memory; whole-file reads remain bounded separately at 1 MiB for source text/default byte reads and 8 MiB for the buffered workspace-resource route. This is also why the TOCTOU hardening matters more here.
- [packages/grida-daemon/src/http/routes/workspaces.ts](packages/grida-daemon/src/http/routes/workspaces.ts) — `/workspaces/*` registry + fs routes, including the streamed, Range-aware `GET /workspaces/file` (#924) that the `grida-workspace://` scheme proxies to. Same Auth/Origin/Referer guards as the base64 readers; containment via `workspaceFs`.
- [desktop/src/main/workspace-media-protocol.ts](desktop/src/main/workspace-media-protocol.ts) — the `grida-workspace://` privileged-scheme handler (#924): proxies to the sidecar's `/workspaces/file` with main-held Basic-Auth + forwarded Range; no independent fs authority; 503 before the sidecar is up.
- `desktop/src/preload.ts` — path-scoped `contextBridge`; password fetched through guarded IPC and held in closure. The optional media namespace uses native IPC only and accepts opaque ids, returning path-free descriptors and bounded structured-clone bytes.
- [packages/grida-desktop-bridge/src/index.ts](packages/grida-desktop-bridge/src/index.ts) — renderer-safe bridge protocol and DTO vocabulary, including the optional path-free media library contract.
- `desktop/src/bridge/contract.ts` — Desktop-local IPC channel vocabulary plus re-export of the renderer-safe bridge contract.
- `desktop/src/window.ts` — blocks exposed desktop windows from navigating outside `/desktop/*`; injects non-secret preload arguments.
- `desktop/src/agent-sidecar.ts` — sidecar entrypoint; constructs the composed agent daemon (`createAgentDaemon`) in socketless mode and accepts only main-transferred daemon sockets.
- `desktop/src/agent-sidecar-daemon-sockets.ts` — injects only validated, already-connected socket capabilities into the unbound HTTP server; it exposes no listen, bind, connect, or target-selection operation.
- `desktop/src/agent-sidecar-channel.ts`, `agent-network-policy.ts`, and `agent-sidecar-network.ts` — strict private stdio framing, destination/header policy, the sidecar's explicit provider/provider-asset transport client, and the bounded finite-command request/result client. Command output is sequenced and capped; abort remains pending until main returns `command.aborted` after worker cleanup; malformed or unknown frames fail the channel.
- `desktop/src/main/agent-daemon-socket-host.ts` — owns the exact loopback listener, pauses accepted sockets, rejects non-loopback peers, and transfers the bounded connected capability over per-spawn Node IPC.
- `desktop/src/main/agent-network-host.ts` and `agent-network-authority.ts` — main-owned Chromium network execution, bounded response streaming, redirect/route reauthorization, per-spawn built-in/custom grant state, and the capped private dispatch seam into the command host.
- `desktop/src/main/agent-command-host.ts` and `main/sandbox/manager.ts` — main-owned finite-command execution: canonical exact-root validation, shared-scratch/secret/media-root denies, own-scratch/workspace/private-temp grants, a fixed no-network policy, fresh per-command SRT wrapping, raw spawn only after the wrapper succeeds, and terminal cleanup before abort acknowledgement. The long-lived sidecar may persist generated media; an individual model-authored command cannot read or mutate that library.
- `desktop/src/main/agent-sandbox-policy.ts` — binds Desktop's strict sandbox posture: empty direct external egress, host-routed provider HTTP, no generic local bind/connect authority, and an exact read/write grant for the long-lived sidecar's app-managed media root.
- `desktop/src/main/agent-sidecar-supervisor.ts` — generates the per-spawn password; spawns/supervises the daemon sidecar; initializes the OS sandbox wrapper when supported; owns both private channels, forwards the one main-owned media-root fact, and removes direct provider hosts from the sidecar policy (Desktop deliberately withholds srt's alpha Windows backend pending a supported lifecycle).
- `desktop/src/main/desktop-entry-window.ts` — owns the exact bridge-attached entry window and admits auxiliary native windows only while the authenticated main role is active; the Grida-account transition is additionally bound by GRIDA-SEC-005.
- `desktop/src/main/protocol-router.ts` — deep-link protocol guard; the auth callback arm is bound by GRIDA-SEC-005.
- `desktop/src/main/media-root.ts` and `desktop/src/main/media-host.ts` — one main-owned app media-root fact plus its purpose-scoped native adapter. The renderer can list/read/reveal an opaque item id or open the fixed library folder; raw paths and path-bearing native failures stay in main, whole-file reads are serialized, and the recent view is capped at 20 records.
- `desktop/src/main/ipc-handlers.ts`, `desktop/src/main/ipc-sender.ts`, and `desktop/src/main/ipc-admission.ts` — validate every native IPC sender frame, exact controller-owned window role, pathname, and channel before executing OS capabilities; redact query/fragment/userinfo from denied-sender diagnostics; and give sign-in/onboarding only their closed entry-role allowlists. Media list/read/reveal/open-folder channels are additionally admitted only from the exact main-role `/desktop/tools` route. Custom endpoint set/probe/delete additionally owns the native exact-origin grant ceremony.
- `packages/grida-daemon/src/daemon-server.ts` — lifecycle owner for the same guarded Hono app in either loopback-listening or socketless host-delivered `fetch(Request)` mode; shutdown cancels and joins active response streams.
- `packages/grida-daemon/src/http/server.ts` — daemon route registration and the `DaemonTenant` seam behind shared guards; `packages/grida-ai-agent/src/server.ts` — the agent tenant that mounts the AI route groups through it.
- `packages/grida-ai-agent/src/http/routes/secrets.ts` — BYOK key presence/set/delete route group; no key-read route.
- `packages/grida-daemon/src/transport.ts` — Basic Auth signing, fetch/SSE plumbing, typed HTTP errors, and the daemon route methods; `packages/grida-ai-agent/src/transport.ts` — the agent tenant client extending it (run/stream/sessions/events, stream resume headers).
- `packages/grida-daemon/src/http/auth.ts` — Basic Auth middleware.
- `packages/grida-daemon/src/http/origin.ts` — Origin allowlist and host-declared Referer-path guard.
- `packages/grida-daemon/src/auth/file.ts` — `auth.json` chmod 0o600 read/write.
- `packages/grida-daemon/src/secrets.ts` — `auth.json`-backed BYOK key store; exposes only `has`, `set`, and `delete` to routes.
- `packages/grida-daemon/src/sandbox/policy.ts` — daemon sandbox policy frame (secret-path denies and an optional development-network baseline); `packages/grida-ai-agent/src/sandbox/policy.ts` — the agent tenant's external-agent/provider policy and the Desktop construction switches that remove direct external networking.
- [editor/proxy.ts](editor/proxy.ts) — Next.js 16 proxy that sets the CSP + `X-Robots-Tag` + `Referrer-Policy` + `X-Content-Type-Options` headers on every `/desktop/*` response.
- [editor/lib/desktop/csp.ts](editor/lib/desktop/csp.ts) — the desktop CSP template (`buildDesktopCsp`), kept out of `proxy.ts` per Next.js 16 route-export rules. Owns the directive set, the `grida-workspace:` img/media scope (#924), and the first-party library `img-src` carve-out. Pinned by `proxy.test.ts`.
- [editor/app/desktop/layout.tsx](editor/app/desktop/layout.tsx) — root layout for the desktop route group; gates all children through `DesktopBridgeGate`.
- [editor/scaffolds/desktop/desktop-bridge-gate.tsx](editor/scaffolds/desktop/desktop-bridge-gate.tsx) — server-rendering-safe gate that renders children only when `window.grida` is present.
- [editor/scaffolds/desktop/open-in-desktop-cta.tsx](editor/scaffolds/desktop/open-in-desktop-cta.tsx) — fallback shown to web visitors (capability boundary visible per doctrine rule 3).
- [editor/lib/desktop/bridge.ts](editor/lib/desktop/bridge.ts) — typed client of `window.grida` + SSR-safe presence detector (`useDesktopBridge`).
- [desktop/src/main/host-apps.ts](desktop/src/main/host-apps.ts) — private desktop UX registry for “Open in…” app detection/opening.
- [desktop/src/main/workspace-files.ts](desktop/src/main/workspace-files.ts) — move-to-trash for a workspace entry (file or folder); re-validates that `relPath` resolves inside the workspace root, and isn't the root itself, before `shell.trashItem`.
- [desktop/src/main/terminal-host.ts](desktop/src/main/terminal-host.ts) — human-terminal PTY host: workspace-id-resolved cwd, per-WebContents terminal ownership, per-window PTY cap, kill-on-close; the unsandboxed-by-design surface described under "Human terminal" above.
- [editor/scaffolds/desktop/workbench/terminal-pane.tsx](editor/scaffolds/desktop/workbench/terminal-pane.tsx) — xterm.js view over the `terminal` bridge namespace; renderer side of the human terminal.
- `desktop/src/main.ts` — Electron main entry; acquires the single-instance lock (deferred to `ready` so a secondary instance can forward a macOS `open-file` path via `additionalData` before quitting — before any sidecar/window/IPC is created, preserving the one-sidecar invariant); routes `open-file`/`open-url`/`second-instance` opens.
- [desktop/src/main/open-handoff.ts](desktop/src/main/open-handoff.ts) — pure codec for the secondary→primary "open" forward; tolerant `decode` so a foreign or legacy `second-instance` payload is never mistaken for an open.

**What does NOT belong here.** A `secrets.get` method on the bridge.
A bridge installed unconditionally (without `pathname` scoping). A
daemon that binds `0.0.0.0`. An app that loads grida.co's
non-`(desktop)` routes inside the desktop window without revoking the
bridge first. Any IPC handler in Electron main that acts without
checking `event.senderFrame.url`. A `grida://` deep-link handler that
exchanges OAuth codes itself — the exchange belongs to the same-origin
`/desktop/auth/callback` route against the webview-held PKCE verifier
cookie (GRIDA-SEC-005). The fixed `http://localhost` callback for the native
ChatGPT model provider is a separate main-owned ceremony registered under
GRIDA-SEC-008; it must not reuse or widen this Grida-account deep-link arm.

---

### `GRIDA-SEC-005` — Desktop sign-in deep-link boundary

**What it protects.** Desktop sign-in gives the Electron webview a
first-class Supabase **cookie session** — the same session shape as a
browser tab, so every existing cookie-gated route and middleware works
unchanged. The ceremony runs in the system browser (RFC 8252; embedded
webviews are blocked by providers) and returns through the
`grida://auth/callback` deep link. The boundary is the rule that **a
`grida://` deep link is untrusted, world-invokable input: it must never
be able to create, steal, or redirect a session by itself. Its only
deep-link-controlled navigation is the fixed same-origin
`/desktop/auth/callback` handoff to the one controller-owned entry window;
the cookie-held PKCE verifier remains the authority for exchange.**

**Vulnerable scenario (prevented).** Custom-protocol URLs are invokable
by any webpage and any local process (`open "grida://…"`). Without the
boundary: (a) login-CSRF — an attacker mints their OWN authorization
code and fires `grida://auth/callback?code=<attacker-code>` at the
victim's app, silently signing the victim into the attacker's account so
later work is saved where the attacker can read it; (b) a phished or
replayed single-use code is redeemed by a party other than the app that
started the flow; (c) the deep link is used as a navigation primitive to
walk the privileged (bridge-attached) window to an attacker-chosen URL.

**Why it's specifically risky here.** The desktop window carries the
`window.grida` bridge (GRIDA-SEC-004), so a navigation primitive fed by
an unauthenticated OS-level input lands directly on the app's most
privileged surface. And the repo is open source — the exact flow shape,
paths, and params are public, so the design must not rely on obscurity.

**How the code prevents it.**

1. **PKCE verifier confined to the Electron cookie jar** —
   [editor/app/desktop/auth/start/route.ts](editor/app/desktop/auth/start/route.ts)
   mints the `@supabase/ssr` code-verifier cookie on a route-handler
   response (the supabase/ssr#55-safe shape) and returns the same-origin
   `/desktop-auth` launch-page URL carrying the `code_challenge`. The
   sign-in method is chosen on that web page
   ([editor/app/(untracked)/desktop-auth/](<editor/app/(untracked)/desktop-auth/page.tsx>)),
   and every method binds its GoTrue flow to the forwarded challenge
   (`host/auth/desktop-auth-flow.ts`, pinned by its test) — so the
   desktop never names a provider, and whatever the method, the
   resulting `code` is exchangeable ONLY with the jar-held verifier: a
   code minted against a _different_ verifier is rejected by GoTrue
   (closes the naive login-CSRF); a phished victim code is single-use,
   expires in 5 minutes, and is useless off-machine without the jar.
2. **The challenge is confidentiality-sensitive in transit** — in this
   design the `code_challenge` doubles as the binding token between "the
   desktop that started this flow" and an acceptable code: an attacker
   who learns a victim's challenge can mint a code bound to it _for the
   attacker's own account_ and fire the deep link at the victim, logging
   the victim into the attacker's account (login-CSRF via challenge
   replay — a _random_ attacker challenge is harmless, but the victim's
   is not). It is unguessable (256-bit) and must not be disclosed, so the
   launch page lives in the analytics-free `(untracked)` route group
   ([editor/app/(untracked)/layout.tsx](<editor/app/(untracked)/layout.tsx>))
   — no Google/Vercel pageview script ever sees its URL — with
   `Referrer-Policy: no-referrer` so the challenge never leaks via a
   `Referer` header either. The insiders redirect target is likewise
   analytics-free (and dev-only). Address-bar / history exposure is
   inherent to any browser OAuth handoff and bounded by the 5-min,
   single-use code; the systematic third-party beacon is what is closed
   here.
3. **Pure, stateless, fixed-target parser** —
   [desktop/src/main/protocol-router.ts](desktop/src/main/protocol-router.ts)
   has no Electron dependency, performs no code exchange, holds no auth state,
   and never searches for or navigates a window. It reduces untrusted protocol
   input to a closed native intent whose target is the constant
   `/desktop/auth/callback` path on the configured editor origin, forwarding
   only the known `code`/`error*` params. Main then adds exactly one fixed
   `native_entry=1` provenance marker so the hosted callback can distinguish
   the current entry controller from legacy Desktop 0.0.13; custom-scheme
   input cannot supply, clear, or duplicate it. The marker is compatibility
   routing only, never authentication authority. Nothing else from the deep
   link crosses the boundary, and every branch consumes the URL (no re-queue
   loop).
4. **Exact entry-window ownership** —
   [desktop/src/main/desktop-entry-window.ts](desktop/src/main/desktop-entry-window.ts)
   owns the one canonical sign-in → onboarding → main `BrowserWindow`.
   [desktop/src/main.ts](desktop/src/main.ts) gives the parser's closed callback
   intent only to that controller—never a focused-window, first-window, or
   URL-matched fallback. The controller re-checks the exact configured origin
   and `/desktop/auth/callback` path before it hides and navigates its own
   window. Auth callbacks are control-plane events: while the entry role is
   booting or sign-in they bypass onboarding and work-file admission. Once
   onboarding or main is active, stale/world-invokable account callbacks are
   ignored so they cannot navigate a live workstation away from user work.
5. **Exchange only at the same-origin callback; fixed compatibility handoff** —
   [editor/app/desktop/auth/callback/route.ts](editor/app/desktop/auth/callback/route.ts)
   runs `exchangeCodeForSession` with the cookie client (identical
   mechanism to the web `(auth)/auth/callback`). A successful marked callback
   redirects to the inert
   [fixed completion route](editor/app/desktop/auth/complete/page.tsx), while
   an unmarked callback preserves Desktop 0.0.13's fixed
   `/desktop/welcome` handoff. Malformed markers fail to the legacy handoff;
   failure always redirects to the fixed desktop sign-in route. These are the
   only success destinations: neither route chooses onboarding, a workspace,
   or a caller-supplied destination. After a current-client exchange, the
   controller re-probes the cookie session through
   [desktop/src/main/account-session.ts](desktop/src/main/account-session.ts)
   and [the fixed `/desktop/auth/me` route](editor/app/desktop/auth/me/route.ts),
   combines only the resulting `signed-in` / `signed-out` state with native
   non-secret Desktop preferences, and chooses the next role. Before its first
   authenticated role decision, the current controller may load the fixed,
   hidden
   [legacy onboarding migration surface](editor/app/desktop/auth/migrate-onboarding/page.tsx)
   once, read only the exact former onboarding boolean, persist that result
   and a durable migration marker in native preferences, and remove the
   renderer key best-effort. Renderer storage is never ongoing authority and
   is never consulted again. A transport, redirect, migration-probe,
   upstream-availability, or schema failure fails closed; none is evidence
   that the user is signed out or that migration completed.
6. **Redirect containment; non-navigating sign-out** — the `will-redirect` guard in
   [desktop/src/window.ts](desktop/src/window.ts) holds server 302s to
   the same same-origin `/desktop/*` allowlist as user navigations
   (`will-navigate` does not fire for server redirects, so without the
   hook a redirect chain could walk the bridge-attached window
   off-surface). Blocked redirects are NOT handed to the OS browser.
   Sign-out is the same-origin
   [editor/app/desktop/auth/sign-out/route.ts](editor/app/desktop/auth/sign-out/route.ts):
   navigating the webview to the web `/sign-out` would be blocked and
   `shell.openExternal`'d — logging the user out of their OS browser. The
   desktop route accepts only Electron main's explicit
   `Sec-Grida-Desktop-Account-Session: sign-out` intent accompanied by
   browserless Fetch Metadata (`Sec-Fetch-Site: none`,
   `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Dest: empty`, and no `Origin`).
   Those `Sec-` headers cannot be authored by renderer fetch/XHR/form/service
   worker code, so a renderer cannot mutate the shared cookie around the
   controller. The route returns only a non-redirecting `204` on success; an
   HTTP response never selects the next native role.
7. **One serialized global sign-out** —
   [desktop/src/main/ipc-handlers.ts](desktop/src/main/ipc-handlers.ts)
   accepts the account sign-out capability only from the exact Settings path,
   then delegates to the entry controller. The controller requires the main
   role and closes every other registered auxiliary window before mutating the
   shared cookie session. If an existing dirty-window close handler keeps any
   auxiliary window alive, sign-out aborts while credentials are still intact.
   Before the cookie mutation starts, the controller synchronously revokes IPC
   admission from every sender. Only after that close phase succeeds does
   [desktop/src/main/account-session.ts](desktop/src/main/account-session.ts)
   POST to the fixed sign-out endpoint, reject redirects or non-success,
   treat that success as the irreversible cookie-mutation authority, and
   transition the same entry window to sign-in. An auxiliary Settings sender
   may stay hidden only long enough for Electron to serialize its successful
   invoke reply; it has no admitted IPC role in that interval and main then
   destroys it. A later account probe cannot roll back cookie deletion or
   leave the UI presenting a confirmed main role.
   Reconciliation that independently discovers signed-out state also clears
   the sidecar's short-lived hosted-account capacity before it hides auxiliary
   surfaces and presents sign-in.
8. **Ceremony in the system browser only** — the launch URL travels
   renderer → `shell.open_external` (http/https-validated IPC); the
   webview never loads a provider page, and the `…://auth/callback`
   redirect is allowlisted in Supabase
   ([supabase/config.toml](supabase/config.toml) locally; the hosted
   project's dashboard in production). The scheme is **per-environment**
   (#955): production returns to `grida://`, while local dev/insiders
   builds register and return to `grida-dev://` — so a machine running
   BOTH a dev build and the installed production Grida never has the two
   fight over one OS handler. The target is chosen from the build channel
   (`process.env.NODE_ENV` in the editor's
   [auth-deeplink.ts](editor/lib/desktop/auth-deeplink.ts);
   `app.isPackaged`/insiders in the desktop's `env.ts`), **never from
   request input**, so it stays a fixed, non-attacker-controllable
   constant. The router
   ([protocol-router.ts](desktop/src/main/protocol-router.ts)) accepts
   either scheme with byte-identical fixed-target behavior; the OS only
   ever delivers a build its own declared scheme.

Electron main holds no durable desktop account or provider credential.
Chromium's default session owns the HttpOnly cookie jar;
the entry account client invokes `session.defaultSession.fetch` only for the
two fixed same-origin account routes. Main never reads or exports cookie/token
material, and `DesktopAccountSession` returns only the three-state projection
needed by the entry controller—not the route's account payload. Main persists
only non-secret Desktop preferences separately from every credential store.
Its provider
broker does transiently route BYOK/GG request headers and bodies; the sidecar
owns persisted BYOK material and may hold the purpose-scoped, short-lived
hosted-AI token (GRIDA-SEC-006 — memory-only, renderer-pushed, never a refresh
token). The durable Grida account session is refreshed by the same
`@supabase/ssr` middleware machinery as the web app. The `/desktop/*` CSP keeps
`connect-src` closed, so renderer session reads go through the same-origin
`/desktop/auth/me` route rather than direct supabase-js calls.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-005 .` to enumerate.
Today:

- [supabase/config.toml](supabase/config.toml) — redirect allowlist entries: `grida://auth/callback` (production) + `grida-dev://auth/callback` (local dev/insiders, #955). The hosted dashboard allowlists only the production `grida://` target.
- [editor/lib/desktop/auth-deeplink.ts](editor/lib/desktop/auth-deeplink.ts) — the single, per-environment `…://auth/callback` redirect-target constant (build-time, never request input). Must stay aligned with the desktop's `DEEP_LINK_SCHEME` (`desktop/src/env.ts`).
- [editor/app/desktop/auth/start/route.ts](editor/app/desktop/auth/start/route.ts) — PKCE start; verifier cookie + launch-page URL (method-neutral; the desktop never names a provider).
- [editor/app/(untracked)/desktop-auth/page.tsx](<editor/app/(untracked)/desktop-auth/page.tsx>) + [editor/app/(untracked)/layout.tsx](<editor/app/(untracked)/layout.tsx>) — the web launch page and its analytics-free root layout. Shares the sign-in shell ([editor/components/auth/sign-in-shell.tsx](editor/components/auth/sign-in-shell.tsx)) and Google button (`authorize_url` mode); validates the challenge, binds the offered method's GoTrue flow to it, mirrors the web sign-in's insiders routing (`NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH` → redirect to the insiders page with the challenge forwarded). Deliberately NOT a `(site)` sibling: `(site)` loads Google/Vercel analytics that would beacon the challenge-bearing URL. The `(untracked)` group must never gain a URL-reporting script.
- [editor/host/auth/desktop-auth-flow.ts](editor/host/auth/desktop-auth-flow.ts) — the flow vocabulary shared by the launch page and the insiders route: challenge validation, challenge-bound authorize/OTP builders, verify-link extraction pinned to the Supabase origin (pinned by `desktop-auth-flow.test.ts`).
- [editor/app/(insiders)/insiders/auth/basic/sign-in/route.ts](<editor/app/(insiders)/insiders/auth/basic/sign-in/route.ts>) (+ the hidden `challenge` passthrough in [basic/page.tsx](<editor/app/(insiders)/insiders/auth/basic/page.tsx>)) — the insiders **email+password** desktop branch: verifies the password exactly like the web insiders flow, then mints the challenge-bound code by firing the GoTrue OTP and consuming the emailed verify link straight from the local Mailpit capture, so the developer keeps email+password and still traverses the production verify → `grida://` → exchange path. A password grant alone can never produce a challenge-bound code (GoTrue returns sessions directly for passwords), which is why the mint rides the OTP-link machinery. Local-only by GRIDA-SEC-002 (`/insiders/*` 404s outside development), which is what makes the Mailpit coupling acceptable (pinned by its `route.test.ts`).
- [editor/app/desktop/auth/callback/route.ts](editor/app/desktop/auth/callback/route.ts) — the only code-exchange point; routes the fixed native-owned provenance marker to completion and preserves the fixed unmarked Desktop 0.0.13 welcome handoff, always within `/desktop/*` (pinned by its `route.test.ts`).
- [editor/app/desktop/auth/complete/page.tsx](editor/app/desktop/auth/complete/page.tsx) — inert, fixed success handoff; contains no routing choice.
- [editor/app/desktop/auth/migrate-onboarding/page.tsx](editor/app/desktop/auth/migrate-onboarding/page.tsx) — inert, fixed hidden surface on which main performs the one-time exact-key renderer-to-native onboarding migration; contains no migration logic or native capability.
- [editor/app/desktop/auth/me/route.ts](editor/app/desktop/auth/me/route.ts) — no-store, same-origin account projection; distinguishes upstream unavailability from signed-out state (pinned by `route.test.ts`).
- [editor/lib/desktop/account-session-state.ts](editor/lib/desktop/account-session-state.ts) — shared signed-in/signed-out/unavailable classification for the account projection and protected Desktop server routes; retryable or unclassified auth failures fail closed instead of rendering sign-in (pinned by `account-session-state.test.ts`).
- [editor/app/desktop/\_components/account-required.tsx](editor/app/desktop/_components/account-required.tsx) — defense-in-depth projection of that classification onto authenticated Desktop routes; unavailable fails closed instead of rendering an extra sign-in surface (pinned by `account-required.test.tsx`).
- [editor/app/desktop/auth/sign-out/route.ts](editor/app/desktop/auth/sign-out/route.ts) — native-Fetch-Metadata-gated, non-redirecting sign-out (never renderer-callable and never the web `/sign-out`; pinned by `route.test.ts`).
- [desktop/src/deep-link.ts](desktop/src/deep-link.ts), [desktop/src/env.ts](desktop/src/env.ts), [desktop/forge.config.ts](desktop/forge.config.ts), and [desktop/scripts/prepare-dev-electron-branding.mjs](desktop/scripts/prepare-dev-electron-branding.mjs) — closed per-environment scheme vocabulary and registration; production and local/insiders never contend for one handler.
- [desktop/src/main/open-handoff.ts](desktop/src/main/open-handoff.ts) + [desktop/src/main.ts](desktop/src/main.ts) — collect OS/secondary-instance callback URLs, re-validate them through the parser, and deliver the closed intent only to the canonical entry controller.
- [desktop/src/main/protocol-router.ts](desktop/src/main/protocol-router.ts) — stateless fixed-target auth arm; forwards only the closed callback allowlist and then adds the constant native-entry provenance marker (pinned by `protocol-router.test.ts`).
- [desktop/src/main/account-session.ts](desktop/src/main/account-session.ts) — fixed-route, redirect-refusing account projection and native-intent sign-out over Chromium's cookie-owning session (pinned by `account-session.test.ts`).
- [desktop/src/main/desktop-preferences.ts](desktop/src/main/desktop-preferences.ts) — non-secret, versioned native onboarding authority; owns the durable one-time renderer-migration marker, writes are serialized and atomic, future schemas are read-only, and no generic renderer preferences capability exists (pinned by `desktop-preferences.test.ts`).
- [desktop/src/main/desktop-entry-window.ts](desktop/src/main/desktop-entry-window.ts) — exact entry-window ownership, serialized role transitions, one-time fixed-surface onboarding migration, callback re-probe, role-aware blocked-navigation recovery, auxiliary-window admission, and close-before-sign-out ordering (pinned by `desktop-entry-window.test.ts`).
- [desktop/src/main/ipc-handlers.ts](desktop/src/main/ipc-handlers.ts) + [desktop/src/main/ipc-admission.ts](desktop/src/main/ipc-admission.ts) — exact sender/role/path/channel validation for the one native account-sign-out transition and narrow sign-in/onboarding IPC capability sets (pinned by `ipc-admission.test.ts`).
- [desktop/src/window.ts](desktop/src/window.ts) — `will-redirect` guard; `isAllowedNavigation` predicate (pinned by `window.test.ts`).

**What does NOT belong here.** A code exchange in the Electron main
process. A PKCE verifier carried on the deep link, the bridge, or argv.
A router that navigates to a path taken from deep-link input, forwards params
beyond `code`/`error*`, or treats the native-added provenance marker as
authentication authority. A desktop webview navigation to
`(auth)` routes or the web `/sign-out`. Sidecar- or main-held SESSION
tokens (the scoped hosted-AI token is the one sanctioned exception,
registered under GRIDA-SEC-006 and the GRIDA-SEC-004 hosted-AI
paragraph). The launch page in a route group that loads Google/Vercel
analytics (or any URL-reporting script) — the challenge in its URL is
confidentiality-sensitive, so it stays in `(untracked)`. Provider OAuth for
the native ChatGPT model provider: its fixed localhost callback, sidecar-held
credential, and model egress are the distinct GRIDA-SEC-008 boundary and never
produce a Grida webview cookie session.

---

### `GRIDA-SEC-006` — Hosted-AI scoped-token boundary

> **Surface.** This is the **security half of Grida Gateway (GG)** — the
> `token` surface. Every file here carries **both** `GRIDA-SEC-006` and
> `GRIDA-GG: token`; touching it runs the [`security`](.agents/skills/security/SKILL.md)
> review first, then the [`gg`](.agents/skills/gg/SKILL.md) surface skill.
> The gateway endpoints, the `gg` client provider, and the desktop token
> wiring are the other GG surfaces (`GRIDA-GG: gateway|provider|desktop`),
> governed by the same skill. Domain spec:
> [Hosted AI](https://grida.co/docs/wg/platform/hosted-ai).

**What it protects.** Hosted ("no-BYOK") AI calls from Desktop or an independent native host are
authenticated by a **purpose-scoped, short-lived, org-bound JWT** — and
by nothing else. The `/api/v1/ai/*` endpoints never accept a Supabase
access token, a cookie session, or an API key. Desktop's `/desktop/auth/token`
and native `/api/v1/auth/gg` use one shared mint owner; each requires its own
live account authentication and verified org membership. The
boundary is the rule that **the credential a native process holds for
AI grants only a 15-minute window (with 60 seconds of clock tolerance) of AI calls billed to an org the
user was a member of — and nothing more.**

**Vulnerable scenario (prevented).** A desktop process credential leaks
— a log line, a crash dump, a local proxy, an exfiltrated memory
snapshot. If that credential were the user's Supabase access token, the
attacker gets the user's whole API surface: RLS-scoped database reads,
storage, profile — the account, for up to an hour, renewable if the
refresh token ever traveled with it. With the scoped token the blast
radius is: AI calls, on one org's credit, for the 900-second signed window
plus the accepted 60-second clock tolerance, and the
token is structurally useless everywhere else (audience check) —
Supabase never even sees it.

**Why it's specifically risky here.** The sidecar is a long-lived local
daemon that makes third-party network calls with credentials in memory;
it is exactly the process class where credentials leak. And the desktop
webview session (GRIDA-SEC-005) is a full first-class login — handing
_that_ to the daemon would collapse two carefully separated trust
levels into one.

**How the code prevents it.**

1. **Two authenticated adapters, one mint policy** —
   [editor/app/desktop/auth/token/route.ts](editor/app/desktop/auth/token/route.ts)
   requires `auth.getUser()` and resolves the org through the
   GRIDA-SEC-003 verified resolver (session fallback, or explicit
   `org_id` through `requireOrganizationId` → `assertOrgMember`). The
   route accepts no org header — no new org-id trust input. CSRF is
   bounded by SameSite=Lax auth cookies + same-origin-only readability
   (no CORS on `/desktop/*`). Native `/api/v1/auth/gg` instead uses GRIDA-SEC-010's
   live OAuth verification and an explicit positive safe-integer organization ID.
   Its fixed membership query retains that exact bearer and filters the verified
   user and organization in the same statement. Unknown/invisible membership is
   denied without a service-role read or browser fallback. Both adapters call
   `gg.mint`: per-user quota → host-owned member lookup → one signer. Neither
   mint reads credits or performs provider/billing work.
2. **Scope is cryptographic, not conventional** —
   [the GG token policy](editor/lib/gg/tokens.ts) signs
   HS256 with a dedicated server-only secret (`GG_TOKEN_SECRET`),
   pins `algorithms: ["HS256"]` (no alg-swap) and `aud: "gg:ai"`.
   A Supabase token fails verification structurally (different keys),
   and this token fails everywhere Supabase tokens are accepted.
3. **15-minute expiry, 60s clock tolerance** — verification requires integer
   issue/expiry claims, a positive window no longer than 900 seconds, and no
   issue time beyond the tolerance. Expiry is the unit of revocation; abandoning
   a leaked token requires no server state.
4. **Fail-closed secret handling** — unset or <32-byte secret →
   `not_configured` → 503. There is no fallback path to a weaker
   credential. Rotation via `GG_TOKEN_SECRET_PREVIOUS`
   is verify-only; signing always uses current. Retire the previous key only
   after the last old-key token's 900-second lifetime plus 60-second tolerance.
5. **Verification is local and exclusive** — every `/api/v1/ai/*`
   handler authenticates via `verifyGgToken` only; none construct a
   Supabase client from the bearer value (`createClientFromBearer` is
   the _other_ pattern, for first-party Supabase tokens on
   `/private/*` routes — grep-able invariant).
6. **Custody doctrine (client half)** — the daemon holds the token in
   memory only: never `auth.json`, never disk, never a refresh token.
   The webview session remains the only durable credential
   (GRIDA-SEC-005); the renderer re-mints and re-pushes. Provider requests use
   the GRIDA-SEC-004 host transport: Electron main necessarily observes the
   scoped bearer header and request body in transit, but does not retain,
   persist, return, or log them and never receives the durable webview session.
   Independent native hosts keep their own account custody under GRIDA-SEC-010.
   The fixed exchange delivers a frozen GG grant only to a construction-time
   trusted synchronous memory sink; its public result contains only org/expiry
   metadata. The sink invocation is acceptance under profile authority: logout
   before it prevents handoff, while later logout cannot recall a grant. A sink
   failure cannot undo a token it already retained. The initial local consumer
   uses one fixed model-list request and discards the grant; reusable native GG
   custody and paid execution remain a later contract.
7. **Mint rate limit** — `rl:v1-ai:mint` per-user sliding window
   (fail-open when Upstash is unconfigured; the billing gate on the AI
   endpoints is the actual spend control). Both mint routes use the same
   `rl:v1-ai:mint` key space and 10/user/60s quota, not separate host allowances.
   When configured, the shared owner rejects the SDK's five-second timeout
   allowance and upstream failures before membership lookup or signing. Both
   hosts return a safe 503; actual quota exhaustion remains 429. The deadline
   bounds the quota decision, not Redis work, which may finish later and consume
   quota. Late completion cannot resume minting, and no automatic remint occurs.

**Residual risks (accepted, documented).** Org-membership revocation is
not re-checked within a token's 900-second window plus clock tolerance. The mint rate
limit fails open without Upstash. In-flight AI requests at sign-out
complete on their token rather than being aborted — expiry is the
revocation mechanism. Electron main and any OS-trusted TLS-inspection proxy can
observe the short-lived bearer while transporting a request; neither is a
durable account-credential holder.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-006 .` to enumerate.
Today:

Every file below also carries the `GRIDA-GG` surface marker (`token` /
`gateway` / `provider`); the [`gg`](.agents/skills/gg/SKILL.md) skill
governs the surface, this record governs its security half.

- [GG owner](editor/lib/gg/gg.ts), [policy](editor/lib/gg/tokens.ts),
  [configuration](editor/lib/gg/config.ts), and [contract](editor/lib/gg/README.md)
  — one policy with injected clock/key/quota capabilities, one configured server
  binding, one environment reader. Tests pin the
  [binding](editor/lib/gg/gg.test.ts), [policy](editor/lib/gg/tokens.test.ts)
  and [configuration](editor/lib/gg/config.test.ts).
- [editor/lib/auth/gg-token.ts](editor/lib/auth/gg-token.ts) — compatibility exports only;
  [existing compatibility tests](editor/lib/auth/gg-token.test.ts) still test those exports.
- [Native mint route](<editor/app/(api)/(public)/api/v1/auth/gg/route.ts>),
  [binding](editor/lib/api/gg.ts) and [tests](editor/lib/api/gg.test.ts),
  [member query](editor/lib/supabase/gg-data.ts) and [tests](editor/lib/supabase/gg-data.test.ts)
  — live native account authority and explicit current membership; also GRIDA-SEC-010/012.
- [Native auth lifecycle](packages/grida-auth/src/auth-client.ts),
  [Node factories](packages/grida-auth/src/node.ts),
  [public export](packages/grida-auth/src/index.ts),
  [lifecycle tests](packages/grida-auth/src/auth-client.test.ts),
  [Node tests](packages/grida-auth/src/node.test.ts), and
  [contract](packages/grida-auth/README.md) — fixed mint transport and guarded memory handoff;
  independent account custody remains GRIDA-SEC-010.
  [Credential-store tests](packages/grida-auth/src/credential-store.test.ts)
  also pin invalid sink configuration before durable I/O.
- [Local fixture bootstrap](scripts/auth-local/stack.mjs),
  [native probe](scripts/auth-local/native-probe.mjs),
  [browser consumer proof](editor/e2e/auth-oauth.spec.mts), and
  [production HTTP proof](scripts/api-local/proof.mjs), with the
  [fixture guide](scripts/auth-local/README.md) — fresh test-only GG
  authority and bounded, memory-only access verification. Their infrastructure
  isolation remains GRIDA-SEC-011/012; no generation or provider call is required.
- [editor/app/desktop/auth/token/route.ts](editor/app/desktop/auth/token/route.ts) — the mint route (pinned by its `route.test.ts`).
- `editor/app/(api)/(public)/api/v1/ai/**` — the hosted GG endpoints: OpenAI-compat chat/completions + models, Grida-native image/video/music generation. Verify with `verifyGgToken` EXCLUSIVELY; billed through the seam (pinned by route and seam contract tests).
- `editor/app/(api)/(public)/api/v1/models/catalog/route.ts` — deliberately OUTSIDE the glob above, and deliberately unauthenticated: an agent host fetches the published model catalogue at boot, before any session token exists. It accepts NO credential (strictly stronger than accepting the wrong one), spends nothing, and returns only catalogue data already public on the models page. Listed here so it is not "fixed" into the token-gated family, which would break the boot fetch. See [catalogue distribution](docs/wg/platform/hosted-ai.md).
- [editor/lib/ai/openai-compat/](editor/lib/ai/openai-compat/codec.ts) — the wire codec + error envelope + allowlist + rate limits.
  The [allowlist test](editor/lib/ai/openai-compat/hosted-models.test.ts) pins direct
  catalogue consumption without importing provider factories for a model-list read.
- [packages/grida-ai-agent/src/providers/gg-session.ts](packages/grida-ai-agent/src/providers/gg-session.ts) — the daemon's in-memory custody (30s expiry slack; `status()` never returns the token; pinned by its test).
- [packages/grida-ai-agent/src/http/routes/gg-auth.ts](packages/grida-ai-agent/src/http/routes/gg-auth.ts) — `/auth/gg/set|clear|status` behind the daemon perimeter; token never logged (pinned by its test).
- [packages/grida-ai-agent/src/providers/gg.ts](packages/grida-ai-agent/src/providers/gg.ts) + [gg-media.ts](packages/grida-ai-agent/src/providers/gg-media.ts) — hosted text/image/video/music adapters: per-request token reads, editor-origin-only egress, code-led typed errors (401→`gg_token_expired`, 402→`insufficient_credits`), no upstream body text in thrown messages.
- The `gg` resolver arms ([providers/index.ts](packages/grida-ai-agent/src/providers/index.ts), resolve-image, resolve-video) — precedence: explicit wins; implicit BYOK → `gg` → endpoints. The `/secrets/*` allowlist keeps REJECTING the `gg` id (no key may be stored under it; pinned by `gg-auth.test.ts`).
- [packages/grida-ai-agent/src/sandbox/policy.ts](packages/grida-ai-agent/src/sandbox/policy.ts) — `gg_host` egress for ambient-fetch hosts and its omission when provider HTTP is host-routed.
- [desktop/src/main/agent-network-host.ts](desktop/src/main/agent-network-host.ts) — destination-bound Chromium transport; transiently carries the scoped Authorization header without persistence or renderer exposure.

**What does NOT belong here.** An AI endpoint that accepts Supabase
access tokens or cookies. A mint path without a live session or without
membership verification. The token (or a refresh token) persisted by
the daemon, main process, or `auth.json`. A signing fallback when the
secret is unset. A parallel mint policy or signer behind a new host adapter.

---

### `GRIDA-SEC-007` — Agent skill filesystem boundary

**What it protects.** The agent discovers skills by scanning directories
that may be attacker-controlled — a checked-out repo's `.claude/skills` /
`.agents/skills`, the user home, and the host-bundled `skills/` tree — and
the `skill` tool then MATERIALIZES a chosen skill's directory into the
per-session scratch so its files are reachable by the workspace-scoped fs and
shell. The boundary is the rule that **a skill lookup or load can only ever
touch files inside a skill directory it legitimately resolved, and can only
ever write into the already-sanctioned scratch root — never anywhere else on
disk, no matter what a hostile skill dir names or links to.**

**Vulnerable scenario (prevented).** A user opens (or clones) a repo whose
`.claude/skills/` contains a directory named to escape (`../../../etc`), or a
skill dir that is a symlink to `/`, or a `SKILL.md` symlinked to
`~/.ssh/id_rsa`, or a `metadata.also_in_load: ["../../../../etc/passwd"]`, or a
skill tree with a symlink pointing at the user's home. Without the boundary,
discovery or `load_skill` would read those files into the model's context, or
the materialize copy would follow a link out of the tree and duplicate secrets
into scratch (where the shell can then exfiltrate them).

**How the code prevents it.**

1. **Name validation before any path is built** —
   [packages/grida-ai-agent/src/skills/discovery.ts](packages/grida-ai-agent/src/skills/discovery.ts)
   rejects any directory/file entry whose basename is not
   `/^[a-z][a-z0-9-]*$/` (the agentskills.io name grammar), so `..`, absolute
   paths, and path separators never become a skill name.
2. **Realpath containment on every resolved `SKILL.md`** — `isContained`
   canonicalises the resolved path and the layer root and rejects anything that
   escapes the root, so a symlinked skill dir/file that points outside its
   layer is dropped from the listing (never read).
3. **Materialize copies into scratch only, and never follows symlinks** —
   [packages/grida-ai-agent/src/skills/materialize.ts](packages/grida-ai-agent/src/skills/materialize.ts)
   copies into `<scratch>/skills/<name>/` (already the only sanctioned writable
   root) and its `copyTree` handles ONLY regular files and directories —
   symlinks, sockets, and fifos are skipped by omission, so a link inside a
   skill tree cannot smuggle an out-of-tree file into scratch.
4. **`also_in_load` companions are containment-checked** — a declared companion
   path that resolves outside the materialized dir (`..`, absolute) is skipped,
   not inlined.
5. **Re-validation at LOAD time (discovery→load TOCTOU)** — rule 2 runs when
   the index is built, but the `skill` tool loads a body later, and the
   filesystem can change in between (a checkout or a shell command swaps
   `.agents/skills/foo`, or the `.agents/skills` layer itself, for a symlink).
   `resolveSkillLoadPaths`
   ([discovery.ts](packages/grida-ai-agent/src/skills/discovery.ts))
   re-realpaths the skill dir + its `SKILL.md` (or a flat `<name>.md`) and
   re-contains them against the **discovery-time** layer root (`layer_root`,
   captured + realpath'd when the index was built) — not a root recomputed at
   load, which a layer-dir swap would move in lockstep with the target. Throws
   `SkillPathEscapeError` on escape and returns the canonical paths to
   read/copy. BOTH load paths — the materializing loader and
   `nodeSkillBodyLoader` — go through it, so no loader trusts a stale
   discovered string path.

**Files bound by this id.**

- [packages/grida-ai-agent/src/skills/frontmatter.ts](packages/grida-ai-agent/src/skills/frontmatter.ts)
  — `SKILL_NAME_RE` (rule 1's name grammar), imported by discovery.
- [packages/grida-ai-agent/src/skills/discovery.ts](packages/grida-ai-agent/src/skills/discovery.ts)
- [packages/grida-ai-agent/src/skills/materialize.ts](packages/grida-ai-agent/src/skills/materialize.ts)
- [packages/grida-ai-agent/src/skills/skills-fs.test.ts](packages/grida-ai-agent/src/skills/skills-fs.test.ts)
- [packages/grida-ai-agent/src/skills/materialize.test.ts](packages/grida-ai-agent/src/skills/materialize.test.ts)

**What does NOT belong here.** Following a symlink out of a skill tree.
Accepting a skill name with a path separator. Materializing anywhere but the
session scratch. Reading a `SKILL.md` whose realpath escapes its layer root.

---

### `GRIDA-SEC-008` — ChatGPT subscription OAuth credential boundary

**What it protects.** Grida Desktop can use an eligible ChatGPT subscription
as a native text-model provider. Grida still owns the agent loop, prompts,
tools, approvals, sessions, and persistence; this path does not launch Codex,
Codex app-server, or an ACP agent. The boundary is the rule that **the
world-invokable localhost OAuth callback can complete only the exact
main/sidecar attempt that opened it, ChatGPT credentials never cross into the
renderer, provider traffic can reach only its fixed auth/inference
destinations, and a stored conversation never changes provider merely because
ambient provider readiness changed.**

**Vulnerable scenario (prevented).** A webpage or local process races a forged
request into the fixed callback port and consumes the legitimate user's
one-time attempt; a compromised renderer asks the bridge for access/refresh
tokens; a late refresh for account A overwrites a newly connected account B;
sign-out loses a race and a late exchange resurrects the deleted credential;
an upstream error body containing provider details is serialized into the
agent stream; or connecting ChatGPT silently moves an existing BYOK
conversation onto a different cost/privacy boundary.

**Why it is specifically risky here.** Native-app OAuth client ids and
loopback redirect URLs are public, localhost HTTP endpoints are reachable by
webpages and local processes, the refresh token is long-lived, and the
privileged renderer is hosted at a web origin. Electron main must also
transiently transport token and inference bytes because the sandboxed sidecar
has no direct provider egress. None of those components may be treated as
trusted merely because it is “local.”

**How the code prevents it.**

1. **Two-owner OAuth ceremony.** Electron main binds the callback before
   browser navigation, on only the approved ports (`1455`, then `1457`) and
   both available loopback families. The sidecar independently generates the
   one-use attempt id, random state, and PKCE S256 verifier/challenge for that
   exact redirect URI. Main accepts only bounded `GET` requests for the exact
   `/auth/callback` path and `localhost:<bound-port>` Host, constant-time
   compares state, leaves the attempt usable after a mismatched callback,
   atomically claims one valid callback, and closes every listener/socket on
   success, denial, timeout, cancellation, or failure. Browser success is not
   rendered until token exchange and durable persistence complete.
2. **Exact browser-open validation.** Before `shell.openExternal`, main
   requires the exact `https://auth.openai.com/oauth/authorize` origin/path,
   client, scope, response type, S256 challenge shape, configured product
   parameters, and the state and redirect URI of the currently bound attempt.
   Reserved parameters must occur exactly once; credentials, fragments, an
   alternate approved port, unknown query keys, and lookalike origins fail
   closed.
3. **Secret custody and race-safe persistence.** The sidecar alone owns code
   exchange, access/refresh lifecycle, account metadata, and request-time
   credential injection. One daemon `AuthStore` instance serializes BYOK and
   OAuth writes into owner-readable `auth.json` (`0600`, atomic replacement).
   Refresh is single-flight and rotating refresh tokens are persisted before
   use. Compare-and-replace/remove guards prevent a late refresh or cancelled
   exchange from overwriting/removing a newer account. Exact attempt
   cancellation and a generation invalidation make sign-out win over
   in-flight exchange/refresh work.
4. **Narrow renderer capability.** Guarded IPC and the optional
   `window.grida.chatgpt` namespace expose only connect, cancel, status, and
   sign-out. Electron main reconstructs the returned status DTO field by field;
   authorization URLs, codes, PKCE material, access tokens, refresh tokens,
   and raw token claims have no renderer type or route. Renderer status reads
   are epoch-ordered so an old read cannot visually restore a signed-out or
   previous account.
5. **Pinned provider traffic.** Desktop grants only the exact OpenAI token
   endpoint and ChatGPT Responses endpoint to the authenticated provider lane;
   neither is a provider-asset/download grant. The model adapter rejects any
   other URL, injects bearer/account/product headers only at request time,
   forces stateless Responses posture, performs at most one refresh/replay
   after `401`, consumes every non-success body, and maps it to a bounded
   code-led error before the AI SDK or agent stream can observe it.
6. **Session/provider identity is sticky.** A new provider-unqualified
   compatible conversation may prefer a ready ChatGPT connection. Once
   persisted, the provider/model pair is reused for continuations and queued
   turns. Titling and compaction stay on that provider and credential/cost
   boundary but may use its lower-cost auxiliary model tier; unavailability
   returns `provider_down` rather than falling through. An explicit provider,
   or a request-supplied different model, is the intentional switch seam.
7. **No credential borrowing and no ACP fallback.** Grida never reads
   `~/.codex/auth.json`, browser cookies, or another app's credential store.
   ChatGPT auth failure never launches or selects Codex ACP.

**Current experimental trust posture.** The implementation follows the public
Codex/Zed-compatible native flow: unless
`GRIDA_CHATGPT_OAUTH_CLIENT_ID` supplies a replacement, Desktop uses the
public Codex native client id, with `originator=grida`, and exposes a closed
static model allowlist. That client/backend identity and the allowlist are not
a documented general third-party OpenAI contract; support, terms, model
availability, and a stable Grida registration remain release gates outside
this repository.

Account metadata is accepted only from the successful response of the exact
pinned HTTPS token endpoint (or from a token payload delivered in that
response), after state, PKCE, and code exchange. Token payload parsing checks
shape and expiry but does **not** independently perform JOSE signature,
issuer, audience, or nonce validation. The security claim therefore rests on
the authenticated token-endpoint response, not on generic OIDC JWT
verification. A future claim source outside that response must add full
cryptographic OIDC validation before use.

Long-lived OAuth material currently uses the daemon's owner-only atomic file
store, not an operating-system keychain. This prevents renderer/network
exposure and cross-write races but does not protect against another process
already running as the same OS user. Moving refresh-token at-rest custody to a
platform credential store is a separate hardening step.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-008 .` to enumerate.
The load-bearing groups are:

- `desktop/src/chatgpt-configuration.ts`,
  `desktop/src/main/{oauth-loopback-callback,chatgpt-oauth}.ts`,
  `desktop/src/{agent-network-policy,agent-sidecar,preload}.ts`,
  `desktop/src/bridge/contract.ts`, `desktop/src/main/ipc-handlers.ts`, and
  `desktop/src/main.ts` — fixed configuration, callback/orchestration,
  exact network grants, sidecar construction, guarded bridge, and shutdown.
- `packages/grida-ai-agent/src/protocol/{chatgpt,provider-ids,endpoints}.ts`,
  `providers/{chatgpt-credentials,chatgpt,index}.ts`,
  `http/routes/chatgpt-auth.ts`, `server.ts`, `runtime/{index,run-input}.ts`,
  and `src/index.ts` — safe vocabulary, OAuth lifecycle, model adapter,
  private route, provider/session resolution, and public type projection.
- `packages/grida-daemon/src/auth/file.ts` and
  `packages/grida-daemon/src/http/server.ts` — shared race-safe credential
  persistence.
- `packages/grida-desktop-bridge/src/index.ts`,
  `editor/lib/desktop/{bridge,chatgpt-subscription}.ts`, and
  `editor/lib/agent-chat/bridge-transport.ts` — secret-free renderer contract,
  ordered status cache, and explicit provider carriage.
- The adjacent `*.test.ts` files tagged with this id pin callback replay and
  bounds, authorization correlation, cancellation/sign-out races, credential
  rotation/reauth races, safe error mapping, model wire shape and tool loops,
  provider stickiness/compaction, bridge DTOs, and renderer ordering.
- `docs/wg/ai/agent/chatgpt-subscription-provider.md`,
  `docs/wg/desktop/{agent-security,process-model}.md`,
  `desktop/docs/chatgpt-subscription-oauth.md`, and
  `packages/grida-ai-agent/docs/chatgpt-subscription-provider.md` — normative
  and implementation bindings.

**What does NOT belong here.** A renderer method that accepts or returns token,
code, verifier, raw claim, or authorization-URL material. A generic localhost
listener, callback path, redirect, provider origin, download grant, or
arbitrary fetch. Cookie scraping, importing Codex credentials, direct
sidecar egress, silent provider fallback, unbounded/replayed callbacks,
upstream response bodies in errors, or treating ChatGPT sign-in as Grida
account sign-in, an OpenAI API key, Codex app-server, or ACP.

### `GRIDA-SEC-009` — Optional Library seed local-destination boundary

**What it protects.** The optional Library importer holds a Supabase
service-role key and executes SQL through `psql`. It may target only the
Supabase stack started for this checkout: exact host `127.0.0.1`, the API and
database ports declared in `supabase/config.toml`, and each endpoint's expected
scheme and shape. Environment variables, command-line URLs, and caller-supplied
keys are never destination authority.

**Vulnerable scenario (prevented).** A developer has production Supabase
values in the shell or copies a hosted DSN and key into a seed command. The
fixture importer then writes hundreds of assets and catalog/vector rows into
production with RLS-bypassing authority.

**Why it's specifically risky here.** This is a bulk,
idempotent-by-content-hash fixture importer, not an application request. It
uses service-role Storage calls and direct SQL, so an accidental remote
destination would have a large blast radius and ordinary RLS would not contain
it.

**How the code prevents it.**

1. Destination credentials and endpoints come only from `supabase status -o
json`, run at the discovered repository root.
2. The expected API and database ports come from that checkout's
   `supabase/config.toml`; missing or malformed configuration fails closed.
3. API and database URLs are validated independently against canonical
   `127.0.0.1` endpoint shapes. `localhost`, IPv6 and alternate loopback
   addresses, wrong schemes/ports/paths, URL overrides, queries/fragments, and
   remote or lookalike hosts are rejected.
4. Local service-role HTTP requests use a proxy-disabled opener and reject
   redirects. Direct SQL strips inherited libpq `PG*` connection settings, so
   neither environment can redirect a validated loopback URL.
5. The destination is validated before archive resolution or download and
   before the Storage/SQL writer accepts it.
6. Adjacent tests pin the accepted local shape, negative cases, write-layer
   revalidation, transport isolation, and fail-before-download ordering.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-009 .` to enumerate.
Today:

- [.agents/skills/opt-library/SKILL.md](.agents/skills/opt-library/SKILL.md) —
  operator contract.
- [.agents/skills/opt-library/scripts/seed.py](.agents/skills/opt-library/scripts/seed.py)
  — configuration parsing, exact endpoint checks, command ordering,
  proxy/redirect isolation, libpq environment isolation, and write-layer
  revalidation.
- [.agents/skills/opt-library/scripts/test_seed.py](.agents/skills/opt-library/scripts/test_seed.py)
  — positive, negative, and ordering regression tests.

---

### `GRIDA-SEC-010` — Registered native OAuth account boundary

**What it protects.** A registered first-party native application obtains its
own Supabase OAuth account session. Browser consent does not export the
browser's session, and a loopback callback cannot establish identity by itself.
Native identity/account reads and `/api/v1/auth/gg` accept only configured OAuth
clients through the configured issuer. Desktop cookie custody (GRIDA-SEC-005)
stays separate. Native minting exchanges this account authority for GG's scoped
AI credential (GRIDA-SEC-006); gateway endpoints never accept the account token.

**Vulnerable scenario (prevented).** A callback substitutes another account or
destination; a forged consent POST approves an unseen client or scope; or a
cookie, GG token, ordinary browser token, or forged JWT is treated as native
account authority. Sharing Desktop credentials or using global logout would
also let the independent native client disturb another application's session.

**Why it's specifically risky here.** A public OAuth client ID identifies a
registration, not a trustworthy binary. The native host deliberately holds an
account credential with the user's existing permissions. Identity scopes are
not an account-data sandbox, and this credential must not become an agent/GG
credential through reuse of an existing browser or daemon bridge.

**How the code prevents it.**

1. **Server-owned authority.** Issuer, allowed client IDs, web origin, and exact
   callback URIs come from server configuration. Bearer preflight requires the
   exact issuer, `authenticated` audience, expiry, user/session IDs, and an
   allowed client ID. Decoded JWT claims are not identity: the same token must
   then succeed at the fixed issuer's `/oauth/userinfo`, whose subject must
   match. Cookies are never a fallback. Issuer calls reject redirects, bound
   response size/time, and return safe errors.
2. **Bound browser intent.** Consent requires the configured incoming HTTP Host
   before reading the browser session or issuer authorization. GET navigation
   need not carry Origin. A decision additionally requires the configured browser
   Origin, a bounded form, and a ten-minute signed proof binding user,
   authorization, client, callback, and scope. The pending details are read
   again before mutation. Supabase owns approval, denial, and one-use code
   issuance; Grida issues no account token. Existing-consent redirects may
   omit details, but must still target an exact configured native callback;
   native exchange and bearer APIs independently enforce client identity.
3. **Contained ceremony.** Consent stays in the analytics-free layout, with
   configured no-store, frame denial, and `strict-origin` referrers: authorization paths
   and query values are excluded, while same-origin form POSTs retain their
   Origin header. `no-referrer` can turn that Origin into `null` under the
   [Fetch Origin-header algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header).
   The decision redirect and native callback retain `no-referrer`.
   Native login binds a registered
   `127.0.0.1` port before browser launch, uses fresh state and S256 PKCE, and
   accepts one exact callback. Wrong state, path, host, method, or duplicate
   parameters cannot consume the pending ceremony. Cancellation, denial,
   timeout, and completion close the listener. Code and refresh grants use
   the fixed OAuth token endpoint; credential-bearing requests never follow
   redirects or acquire browser cookies.
4. **Independent native custody.** `@grida/auth` returns safe metadata; only
   the injected custody/transport capabilities receive account tokens. The package
   reads no Desktop, browser, provider, or daemon credential store. Its
   single-writer lifecycle serializes mutations, rejects overlapping login
   and refresh, and invalidates stale work on logout/cancellation. Accepted
   refresh rotations survive a later identity-check failure; the access token
   and identity remain the last verified values until that check succeeds. Logout
   clears this custody and requests only `scope=local`; failed remote
   revocation is reported rather than changing to global/grant revocation.
5. **Durable profile authority.** The Node factory binds a private profile to
   canonical home, issuer, client ID, and API origin. Keyring is the initial
   default; explicit file selection is remembered. Backend failure never
   selects another store. Keyring writes require exact read-back, established
   entries cannot disappear into a signed-out result, and logout retains a
   secret-free revision. File custody validates ownership, permissions, links,
   and macOS ACL grants; atomic replacement never publishes partial JSON.
   Backend migration records intent before copying credentials and blocks auth
   until old-backend cleanup completes. Pending migration resumes explicitly.
6. **Cross-process mutation authority.** Every coordinated lifecycle mutation,
   including verification and empty logout, shares one profile lock and advances
   its durable revision. Login captures a revision before consent and compares
   it on commit, without holding a lock during browser interaction. SQLite OS
   locks release on process exit; acquisition times out without stealing a
   running lock. The lock carries no credentials and never rolls back completed
   custody writes. Accepted rotation survives later identity failure. Unpublished
   temporary credential files are cleaned under authority, never adopted.
7. **Fixed native account transport.** `requestAccount` owns credential-bearing
   requests to the configured API origin: `organizations.list` accepts only an
   optional positive safe-integer cursor; `credits.read` requires a positive
   safe-integer organization ID. There is no arbitrary URL, method,
   header, user selector, token getter, or caller-installed operation. The
   package validates bounded ordered pages and credits with a matching organization,
   explicit cache states, safe integer amounts, valid timestamps and consistent
   gate fields. Extra fields are discarded; failures expose safe codes. Billing
   policy remains server-owned. Near-expiry refresh and result acceptance share
   coordinated custody; accepted rotations survive read failure. HTTP failures are never replayed.
   Same-instance logout fences pending reads; another process's logout is
   ordered after any read already accepted under the profile lock. Accepted
   data and already-sent remote work cannot be retracted.
8. **Membership-scoped organization reads.** The enforcing account adapter
   verifies the live native bearer before creating a database source with that
   exact Authorization value and the same configured project's publishable key.
   The fixed GET selects only `id,name,display_name` from `public.organization`;
   existing membership RLS decides visibility. No cookie client, service role,
   RPC, browser organization preference, or caller-selected user is involved.
   Exact RLS-visible counts and validated ascending IDs preserve page continuation
   despite a lower database row cap. Zero visible rows succeed explicitly;
   database failures and malformed/incomplete results never become empty accounts.
9. **Passive credits retain membership authority.** The fixed credits GET uses
   the same live-verified bearer for `public.v_billing_credits`. The view runs as
   the caller and combines existing RLS with an explicit current-user membership
   predicate in the read statement. Its organization anchor distinguishes denied
   access from missing billing data. SELECT-only grants and a safe column list
   expose no provider identifiers or new billing write operation. The query
   requires an explicit org ID and exact zero/one-row count; a truncated or
   malformed result never becomes a balance. The billing owner shares the existing
   pure cached gate and performs no provider call, provisioning or refresh. An
   already-authorized read may finish after removal; client selection is not
   authority or an instantaneous revocation mechanism.
10. **Fixed scoped-GG exchange.** `requestGgAccess` accepts only an explicit
    positive safe-integer organization ID and posts to the configured API origin's
    `/api/v1/auth/gg`. A missing construction-time memory sink fails before custody
    or I/O. The package validates and freezes a bounded grant matching that org,
    with expiry in the future and at most 960 seconds from its clock. It rechecks
    expiry before invoking the captured synchronous sink under the same custody
    and generation authority as account reads. Only the sink receives the GG
    token; the public result contains organization/expiry metadata. Neither
    account custody nor storage gains a GG token. Logout before invocation fences
    delivery; a later logout or throwing sink cannot recall an accepted grant.
    There is no automatic replay, remint or weaker credential fallback. The
    server independently verifies the live OAuth bearer and explicit current-user
    membership before the shared GG mint policy signs a token.

**Limits and adoption gates.** Producer tests are not deployment certification.
The real local Auth 2.196.0 consumer proof has passed login/denial/consent reuse,
code replay rejection, bearer credential rejection, rotating refresh, seeded
organization RLS, and session-local, grant-wide, and account-wide revocation.
The public native organization-page operation also passed the real local API/RLS
proof: separate users see their own organizations, a temporary non-owner
membership becomes visible and then disappears with the same native token, and
the copied package lists organizations across process restarts.
The credits extension passed member/outsider/removal reads, direct REST isolation,
unprovisioned and unobserved cache versus zero, the shared gate's boundary cases,
and unchanged cache snapshots around each read. The account client and copied
auth/account packages also passed explicit/sole-member selection and credits
across process restarts. Subscription billing remains outside this milestone.
The GG extension also passed against local Auth 2.196.0 and PostgreSQL
15.8.1.085: native OAuth mint, GG-only model-list access, cross-user and
removed-membership denial, revocation, and copied-package restart/remint with
unchanged billing snapshots and no persisted GG grant. An accepted grant retained
its documented expiry window. Neither this local result nor offline checks
substitute for hosted routing verification and the ingress assumptions under GRIDA-SEC-012. A model-list
result establishes access, not credit eligibility or provider readiness.
It also passed separate-process restart using a copied package and disposable
test custody. This verifies the local fixture and that test adapter; separate
durable custody tests exercise the Node storage and cross-process contract.
The local proof uses Next.js development mode, whose page renderer replaces
HTML Cache-Control with `no-cache, must-revalidate`. Consent remains
`force-dynamic` with configured `no-store`; the actual hosted HTML header must
be verified before deployment. JSON identity and consent decision responses
retain `no-store` and are asserted by the local proof.
The deployed issuer must enforce signature verification and live-session
rejection on userinfo, with session-local logout proved against its actual
version and gateway. Client registration remains administrative; dynamic
registration is outside this boundary. Durable custody currently supports local
macOS/Linux filesystems and main-thread Node hosts. Windows ACLs and worker-thread
custody fail closed. The OS, dependencies, and same-user process are trusted;
keyring storage does not isolate credentials from authorized same-user code.
Native keyring access may prompt and cannot safely be cancelled mid-write. A
crash between issuer rotation and saving can require login. Post-rename sync
failure may report failure after a complete write; it never rolls back a spent
token. Filesystem backups/snapshots are outside local cleanup guarantees.
Explicit file recovery of uninitialized metadata cannot clean untracked keyring
entries after manual metadata loss; deleting profile files is not logout.
Existing web/Desktop global logout may revoke native
sessions, and other APIs may accept already-issued JWTs until expiry. Native
OAuth retains the user's existing account authority beyond the CLI command
vocabulary; neither identity scopes nor client-side transport restrict existing
database/API permissions. Organization listing uses existing RLS. Other account,
billing, and GG operations still need their own server authorization; identity
verification supplies none implicitly. Organization pages observe current
membership separately, without a snapshot guarantee across page requests.

**Files bound by this id.**

- [editor/lib/auth/oauth-server.ts](editor/lib/auth/oauth-server.ts),
  [bearer.ts](editor/lib/auth/bearer.ts), and
  [oauth-consent.ts](editor/lib/auth/oauth-consent.ts) — configured authority,
  issuer verification, consent proof, and callback policy.
- [Consent page](<editor/app/(untracked)/oauth/consent/page.tsx>),
  [decision route](<editor/app/(api)/private/oauth/decision/route.ts>), and
  [identity route](<editor/app/(api)/(public)/api/v1/auth/me/route.ts>) — browser
  and native entry points. Their producer tests are
  [oauth-bearer.test.ts](editor/lib/auth/__tests__/oauth-bearer.test.ts),
  [oauth-consent.test.ts](editor/lib/auth/__tests__/oauth-consent.test.ts), and
  [oauth-web.test.tsx](editor/lib/auth/__tests__/oauth-web.test.tsx).
- [Shared native HTTP owner](editor/lib/api/native.ts) and
  [shared bearer data transport](editor/lib/supabase/native-data.ts) — one live
  authenticator, safe HTTP envelope and bounded public-schema REST reader for
  the fixed account/GG adapters; covered by their adapter and data-source tests.
- [Account HTTP adapter](editor/lib/api/account.ts) and its
  [tests](editor/lib/api/account.test.ts) — the identity binding owns live bearer
  verification, input/output validation, bodyless HEAD/OPTIONS, and safe errors.
  Machine request dispatch is separately governed by GRIDA-SEC-012.
- [Native GG route](<editor/app/(api)/(public)/api/v1/auth/gg/route.ts>),
  [GG adapter](editor/lib/api/gg.ts) and [tests](editor/lib/api/gg.test.ts),
  [member query](editor/lib/supabase/gg-data.ts) and
  [tests](editor/lib/supabase/gg-data.test.ts) — fixed account-to-GG exchange,
  shared live verification and explicit same-user membership; also GRIDA-SEC-006/012.
- [Organization route](<editor/app/(api)/(public)/api/v1/account/organizations/route.ts>)
  and [route tests](editor/lib/api/organizations.test.ts),
  [account projection](editor/lib/account/account.ts) and
  [projection tests](editor/lib/account/account.test.ts),
  [RLS data source](editor/lib/supabase/account-data.ts) and
  [data-source tests](editor/lib/supabase/account-data.test.ts) — native authority
  reaches fixed user-scoped reads without cookie or privileged-client dependencies.
- [Credits route](<editor/app/(api)/(public)/api/v1/account/credits/route.ts>) and
  [route tests](editor/lib/api/credits.test.ts),
  [passive credit owner](editor/lib/billing/credits.ts) and
  [tests](editor/lib/billing/credits.test.ts),
  [credit query](editor/lib/supabase/credits-data.ts) and
  [tests](editor/lib/supabase/credits-data.test.ts) — fixed read-only credit access
  with explicit unknown data and no provider or privileged dependency.
- [Credits view migration](supabase/migrations/20260909103531_grida_billing_credits.sql),
  [schema reference](supabase/schemas/grida_billing.sql), and
  [pgTAP contract](supabase/tests/test_grida_billing_credits_test.sql) — narrow
  columns, member RLS and SELECT-only grants; also GRIDA-SEC-012.
- [Analytics-free layout](<editor/app/(untracked)/layout.tsx>) and
  [response headers](editor/next.config.ts) — retain GRIDA-SEC-005 while also
  protecting this consent ceremony.
- [Native lifecycle](packages/grida-auth/src/auth-client.ts),
  [Node adapter](packages/grida-auth/src/node.ts), and
  [public export](packages/grida-auth/src/index.ts) — independent host contract,
  loopback, transport, and secret custody; pinned by
  [lifecycle tests](packages/grida-auth/src/auth-client.test.ts) and
  [Node tests](packages/grida-auth/src/node.test.ts). The
  [package contract](packages/grida-auth/README.md) records both custody modes
  and their limits.
- [Credential store](packages/grida-auth/src/credential-store.ts),
  [keyring adapter](packages/grida-auth/src/keyring.ts),
  [private files](packages/grida-auth/src/private-files.ts), and
  [profile lock](packages/grida-auth/src/profile-lock.ts) — durable custody,
  backend transitions, file protection, and crash-released authority. Adjacent
  tests are [store](packages/grida-auth/src/credential-store.test.ts),
  [keyring](packages/grida-auth/src/keyring.test.ts),
  [files](packages/grida-auth/src/private-files.test.ts), and
  [lock](packages/grida-auth/src/profile-lock.test.ts).
- [Persistent native consumer](packages/grida-auth/src/persistent-auth.test.ts)
  exercises the public package from isolated subprocesses. The
  [build configuration](packages/grida-auth/tsdown.config.mts) retains standalone
  file-mode consumption and leaves native keyring loading lazy.
- The [local auth workflow](.github/workflows/auth-local.yml) also runs the
  native custody suite on macOS/Linux, with an owned-entry macOS keyring smoke.
- The [local consumer proof](editor/e2e/auth-oauth.spec.mts) and
  [copied-package probe](scripts/auth-local/native-probe.mjs) also obey the
  separate local provisioning boundary, GRIDA-SEC-011.

---

### `GRIDA-SEC-011` — Local Supabase OAuth provisioning boundary

**What it protects.** The OAuth proof provisions and stops only its owned,
disposable `grida_auth_test` fixture. Its tooling does not inherit hosted
credentials, linked-project state, or the ordinary editor environment.
GRIDA-SEC-010 separately governs the account authority exercised by the proof.

**Vulnerable scenario (prevented).** A developer or CI run accidentally uses
an inherited Supabase token, linked project, Docker context, or dotenv file to
provision against the wrong infrastructure; cleanup stops another local stack;
or a test emits credentials through browser artifacts. This harness exercises
administrative OAuth registration and real account sessions, so ordinary test
defaults would cross those boundaries.

**How the code prevents it.**

1. **Fixed fixture authority.** Configuration pins project, origins, callback
   allowlist, and tool versions. State validation checks canonical private
   paths and the reviewed TOML hash. CLI calls use an explicit workdir and Unix
   Docker socket, with no login, link, hosted management, or stop-all operation.
2. **No ambient credentials.** Child environments are constructed from scratch
   with a private home. Only allowlisted repository migrations and seed are
   copied; linked metadata and ancestor dotenv files are refused before CLI
   use. Editor snapshots exclude dotenv and generated files and load only
   fixture settings. Outputs use a `0700` directory and `0600` secret files.
3. **Owned lifecycle.** A fixture lock and state identity gate inspection and
   cleanup. Start refuses occupied fixture ports, containers, or volumes;
   stop names only the owned project and uses `--no-backup`.
4. **Explicit local registration.** Bootstrap uses only the fixed local API
   and does not follow redirects. It checks the actual Auth image/version,
   issuer discovery, and disabled dynamic registration, then creates or reuses
   a fixture public client with `token_endpoint_auth_method=none` and exact
   callbacks. Public client configuration excludes administrative credentials.
   Bootstrap creates fresh independent consent and GG signing secrets in the
   private fixture output; neither is inherited from the developer environment.
5. **Contained proof execution.** The dedicated editor uses Node fetch/TCP
   guards; the consumer restricts browser and fetch destinations to exact
   fixture origins. Its dedicated runner disables traces, video, screenshots,
   and service workers; the ordinary runner excludes this test. The standalone
   probe uses private disposable custody and safe IPC results. Its scoped GG
   recipient holds the grant in memory for one fixed same-origin model-list
   request and discards it; it exports no account/GG token through IPC. Fresh
   fixture signing authority is separately governed by GRIDA-SEC-006. Offline configs
   skip env loading. CI verifies the downloaded CLI checksum, supplies no hosted
   credentials, cleans up only its fixture, and uploads no credential artifacts.

**Limits.** This is local provisioning, not hosted deployment certification.
The executable, repository, dependencies, Docker engine, and same-user process
environment are trusted. Node guards are not an OS network sandbox: they allow
other loopback ports and Unix sockets. The harness checks executable versions;
checksum verification belongs to release acquisition and CI. Public container
image downloads remain necessary. Disposable file custody proves no product
storage, hostile-local-user protection, or cross-process coordination contract.

**Files bound by this id.**

- [guards.mjs](scripts/auth-local/guards.mjs),
  [stack.mjs](scripts/auth-local/stack.mjs), and
  [config.toml](scripts/auth-local/config.toml) — destinations, ownership,
  environment, lifecycle, and registration.
- [editor.mjs](scripts/auth-local/editor.mjs),
  [network.cjs](scripts/auth-local/network.cjs), and
  [native-probe.mjs](scripts/auth-local/native-probe.mjs) — isolated hosts.
- [guards.test.mjs](scripts/auth-local/guards.test.mjs),
  [network.test.mjs](scripts/auth-local/network.test.mjs), and
  [consumer proof](editor/e2e/auth-oauth.spec.mts) — adjacent verification.
- [Dedicated Playwright config](editor/playwright.auth.config.ts),
  [ordinary Playwright config](editor/playwright.config.ts),
  [offline Vitest config](editor/vitest.oauth.config.ts),
  [CI workflow](.github/workflows/auth-local.yml), and
  [harness contract](scripts/auth-local/README.md) — execution and adoption.

---

### `GRIDA-SEC-012` — Machine API request isolation

**What it protects.** `/api/v1` requests cannot acquire browser authority or be
handled as tenant pages through the shared Next.js web pipeline. Newly bound
account routes select an operation whose adapter supplies authentication and
HTTP policy; declaring a route does not let its author silently omit those rules.
Native account credentials remain GRIDA-SEC-010; GG credentials remain GRIDA-SEC-006.

**Vulnerable scenario (prevented).** A web redirect or maintenance page replaces
an API response; cookie refresh mutates a machine caller's session; host-based
tenant routing intercepts an API path; or a route declares account authentication
but exports its own unguarded handler. A shared helper can also accidentally pull
browser cookies, UI code or request-global state into account operations.

**How the code prevents it.**

1. **Early, explicit machine dispatch.** `proxy.ts` classifies the reserved
   namespace before importing browser maintenance, cookie, tenant or Desktop
   dependencies. `policy.ts` accepts configured Host authorities only, ignores
   forwarded host claims, and admits registered paths only. Unknown paths,
   unsupported hosts, encoded aliases and noncanonical casing receive safe 404s.
   Invalid configuration and explicit API maintenance receive safe 503s. These
   responses are uncached, carry no cookies or redirects, and grant no identity.
2. **Pre-proxy routing is part of the boundary.** `next.config.ts` replaces
   automatic trailing-slash redirection with its web-only equivalent and excludes
   the reserved namespace from the existing generic web connect redirect. The
   shared namespace pattern covers percent-encoded ASCII aliases too. Config
   tests match actual header/redirect/rewrite rules against API paths; the local
   production-mode proof also exercises real Next routing and web positive controls.
3. **Bindings enforce authority.** `operations.ts` is the complete inventory.
   `account.ts` and `gg.ts` accept only their implemented operations. The shared
   `native.ts` owner validates the declared credential/response policy and
   verifies the live OAuth bearer,
   validates and projects identity fields, rejects input on the input-free identity
   operation, and owns all seven method exports. HEAD retains authentication;
   OPTIONS discloses only allowed methods. Rejected methods and input never call
   the issuer. Empty-body inspection has a deadline and rejects actual payloads.
   Organization listing accepts only a canonical cursor and projects bounded pages.
   Credits require a canonical org ID, query a fixed membership-scoped view and
   return a passive projection. Both create the RLS source only after verification,
   preserve that exact bearer and ignore browser defaults.
   Native GG mint accepts only POST with one explicit JSON organization ID;
   bodyless OPTIONS declares its methods, while GET/HEAD and other methods are 405. The parser rejects extra/duplicate fields, query input, malformed UTF-8,
   invalid media/encoding/length declarations and noncanonical IDs before issuer
   work. It bounds route-entry body reads to 1024 bytes and one second. The shared
   REST transport retains the verified bearer; the mint's member query filters
   that user and organization together before the GG owner signs. Authentication,
   parsing, membership and signing failures keep the native no-store envelope.
4. **Source checks reject drift.** `audit-api.ts` compares real App/Pages route
   placements with the inventory and verifies the complete native binding AST.
   New handlers cannot use the six pinned legacy GG/catalogue exceptions.
   Resolved import traversal checks API/account/GG owners, including aliases,
   re-exports and installed package runtime entries, for Next/React, browser/UI,
   dynamic-loader and environment-ownership violations. Invalid fixture trees
   prove the checks fail. The API workflow runs on every PR without path filters.
5. **Runtime proof stays local.** `scripts/api-local` builds a private production
   Next snapshot from the real API, proxy and config sources. Its synthetic
   loopback issuer and web tripwires verify two-user identity/cache separation,
   credential rejection, method/input errors, configured hosts, API maintenance,
   organization pagination and failure semantics, and production insiders gating.
   The GG extension uses a fresh synthetic signing key with the real mint and
   model-list implementations, including credential-family separation and
   missing-signing-configuration cases, without a credit query or provider call.
   Its synthetic database exposes rows for the exact bearer only; this exercises
   request wiring, while real Supabase RLS is proved separately. It constructs the child environment, copies
   no dotenv/session files, bounds requests/process waits and removes owned
   source/build/listeners. Application network guards reject unowned destinations;
   no hosted credentials or uploaded artifacts are required.

**Limits.** This protects the managed namespace and binding conventions; source
checks are not a sandbox against malicious repository authors. Existing GG and
catalogue handlers remain explicit legacy bindings with their own credential,
streaming, error and cache contracts. Fixed native operations currently cover
identity, organization listing, cached credits and GG access; billing mutations
and generation lifecycle are outside this contract. Next may normalize malformed repeated
slashes or backslashes with a redirect before proxy; the machine response
contract applies to paths admitted by that framework parsing layer.
Next.js 16.2.6's Node proxy clones POST bodies in `next-server.js` and awaits
`requestData.body.finalize()` before route entry. In `body-streams.js`, that
finalizer awaits the original stream's `endPromise`. The application's
1024-byte/one-second mint parser therefore does not bound pre-route upload
buffering or upload time. Managed Vercel deployments rely on the platform's
request-size limits and slow-client protections for this shared ingress layer:
Vercel documents a [4 MB Routing Middleware body limit](https://vercel.com/docs/routing-middleware#limits-on-requests),
a [4.5 MB Function payload limit](https://vercel.com/docs/functions/limitations#request-body-size),
and [pre-routing Slowloris defenses](https://vercel.com/blog/life-of-a-vercel-request-what-happens-when-a-user-presses-enter).
These are hosting assumptions, not guarantees implemented by the mint parser.
The application promises no particular network upload deadline; a function's
execution timeout does not establish one. Deployment checks must confirm the
intended hosting/routing path. Self-hosted deployments must supply their own
ingress size and slow-client controls before exposing the application.
The local HTTP proof replaces unrelated web services with tripwires and uses a
synthetic issuer. It does not certify the full web build, actual Supabase
cryptography/RLS, those web modules' import side effects, or deployment routing.
GRIDA-SEC-011's real local OAuth proof remains separate. The runtime, repository,
installed dependencies, native build tools and same-user host are trusted;
application network hooks are not an OS sandbox. Hosted verification remains a
release requirement.

**Files bound by this id.**

- [API guide](editor/lib/api/README.md), [inventory](editor/lib/api/operations.ts),
  [policy](editor/lib/api/policy.ts), and [policy tests](editor/lib/api/policy.test.ts).
- [Account adapter](editor/lib/api/account.ts), [adapter tests](editor/lib/api/account.test.ts),
  and [identity binding](<editor/app/(api)/(public)/api/v1/auth/me/route.ts>) — also GRIDA-SEC-010.
- [Shared native HTTP owner](editor/lib/api/native.ts) and
  [shared bearer REST transport](editor/lib/supabase/native-data.ts) — fixed
  bindings share authentication, response policy and bounded reads; also GRIDA-SEC-010.
- [Native GG binding](<editor/app/(api)/(public)/api/v1/auth/gg/route.ts>),
  [adapter](editor/lib/api/gg.ts) and [tests](editor/lib/api/gg.test.ts),
  [member source](editor/lib/supabase/gg-data.ts) and
  [tests](editor/lib/supabase/gg-data.test.ts) — explicit native authority and
  member lookup before the shared GRIDA-SEC-006 token owner; also GRIDA-SEC-010.
- [Organization binding](<editor/app/(api)/(public)/api/v1/account/organizations/route.ts>),
  [operation tests](editor/lib/api/organizations.test.ts),
  [account projection](editor/lib/account/account.ts) and
  [tests](editor/lib/account/account.test.ts), and
  [RLS data source](editor/lib/supabase/account-data.ts) and
  [tests](editor/lib/supabase/account-data.test.ts) — also GRIDA-SEC-010.
- [Credits binding](<editor/app/(api)/(public)/api/v1/account/credits/route.ts>) and
  [operation tests](editor/lib/api/credits.test.ts),
  [credit owner](editor/lib/billing/credits.ts) and [tests](editor/lib/billing/credits.test.ts),
  [credit query](editor/lib/supabase/credits-data.ts) and [tests](editor/lib/supabase/credits-data.test.ts),
  [view migration](supabase/migrations/20260909103531_grida_billing_credits.sql),
  [schema reference](supabase/schemas/grida_billing.sql), and
  [pgTAP tests](supabase/tests/test_grida_billing_credits_test.sql) — also GRIDA-SEC-010.
- [Proxy](editor/proxy.ts), [dispatch tests](editor/lib/api/proxy.test.ts),
  [Next config](editor/next.config.ts), and [routing tests](editor/lib/api/routing.test.ts).
- [Source audit](editor/scripts/audit-api.ts), [audit tests](editor/scripts/audit-api.test.ts),
  [offline configuration](editor/vitest.api.config.ts), and [CI workflow](.github/workflows/api.yml).
- [HTTP proof](scripts/api-local/proof.mjs), [network guards](scripts/api-local/network.cjs),
  [guard tests](scripts/api-local/network.test.mjs), and [proof guide](scripts/api-local/README.md).

---

## Adding a new GRIDA-SEC entry

1. Allocate the next sequential id (`GRIDA-SEC-013` for the next one).
2. Add an "Active boundaries" subsection here with the same shape as
   GRIDA-SEC-001: what it protects, vulnerable scenario, why it's risky
   here, how the code prevents it, files bound.
3. Tag every relevant file with the new id (header comment for source,
   callout block for docs, comment in scripts).
4. The skill at [.agents/skills/security/SKILL.md](.agents/skills/security/SKILL.md)
   auto-loads on any "GRIDA-SEC" mention; no need to register
   per-id with the skill.

## Reporting a vulnerability

Please email security@grida.co. We respond within 48 hours.

If you find a way to reach a non-webhook route via the cloudflared
tunnel, that is in scope and considered a real bug — the tunnel filter
is supposed to block it.
