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

**What it protects.** Webhook receivers — endpoints invoked by external
machines on a publicly-reachable URL — are the only HTTP surface in
this app intentionally exposed to the public internet without
cookie-based authentication. Authority is established via the
provider's signed payload. The boundary is the rule that **everything
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
anything that authenticates via cookie/session/bearer-token — those go
under `(api)/private/**`. Anything user-facing goes under
`(api)/(public)/v1/**`. Mixing categories breaks the trust contract.

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
keys (OpenRouter, Vercel AI Gateway), local file paths, chat sessions,
and AI agent loops. Electron main listens on an ephemeral
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
`/images`, `/video`, the run loop and tools) is a **tenant** —
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
   environment credential. When this transport is enabled, the outer `srt`
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

- `accept-edits` (default): only read-only/inspection commands auto-run
  (`permissions.ts` `isReadOnlyCommand`); a mutating/executing command **pauses
  for a supervised Allow/Deny approval** before it runs. The gate is the AI
  SDK's native `needsApproval` on the tool (`tools/run-command.ts`), wired from
  the session mode at `workspace-agent-bindings.ts` (`needs_approval =
!isReadOnlyCommand` in `accept-edits`, absent in `auto`). The gate is the
  tool's, NOT the backend's: by the time the command backend's `execute` runs,
  the call is already cleared (auto, or user-approved), so the backend cannot
  re-gate on mode without refusing an approved command.
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
(`runtime/run-input.ts`) routes it through `store.answerApproval`, which flips a
persisted part to `approval-responded` **only if** it is currently
`approval-requested` with a matching approval id and session. A forged client
request therefore cannot inject a tool call, approve something never asked, or
rewrite assistant history — it can only supply the boolean the host is already
waiting on. The recorder persists the `approval-requested` state and the
model-view rebuild (`message-view.ts`) lowers `approval-responded`/`output-denied`
parts so the SDK resumes (runs) or skips (denies) the call. Symmetrically, a send
that does **not** answer the pending approval cannot run _ahead_ of it: the run
handler (`runtime/index.ts`) refuses to start a new turn while an approval is
unanswered (HTTP 409 `approval-pending`) — the same fail-closed invariant the
queue drain enforces (`session-scheduler.ts` `has_pending_approval`). So neither a
forged answer nor a typed-ahead follow-up can bypass or orphan the block.

Three structural checks hold regardless of mode: the
cwd-must-be-inside-an-opened-workspace check, the in-process secret-arg
containment check (below), and a no-clobber protected-path guard on the
fs-edit tools (`fs/scope.ts`: `.git`, rc/env files, lockfiles, agent config).
The OS-level outer sandbox confines the _whole_ sidecar; a per-command fs/net
sub-policy that would constrain each spawned child (the kernel-level finish of
the secret-dir guard below) does not exist yet and is the deferred hardening.

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

- **Fail-closed exposure (no sandbox ⇒ no shell).** The shell tool is not
  registered at all unless the host affirms containment. The decision is
  computed once at the tenant boundary (`createAgentTenant`,
  `packages/grida-ai-agent/src/server.ts`) as
  `sandbox_enforced || allow_unsandboxed_shell` and threaded to the tool
  registry; the default is off. The desktop supervisor sets `sandbox_enforced`
  true only when it actually wrapped the sidecar spawn with `srt`, so on
  platforms where Desktop does not enable the wrapper (Windows today) the agent
  gets fs/todos/skills but **no** `run_command` and no external ACP agent. The
  `grida-agent` CLI — a local, user-invoked tool
  with no OS sandbox — sets the explicit `allow_unsandboxed_shell` opt-in
  instead, which logs a warning. New privileged tools added later inherit the
  same gate: a capability that needs containment is born behind this switch,
  so the system's default posture is "no containment, no capability."

- **Secret-dir containment (in-process).** The daemon's own secret dir —
  its `userData`, where BYOK `auth.json`, `workspaces.json`, `recent.json`,
  and the sessions db live — is deliberately **not** in the `srt`
  `deny_read` policy, because the host process itself must read `auth.json`
  for provider calls. Denying it at the kernel level would break host auth.
  Instead the shell _child_ is kept out of it in-process: `validateShellRequest`
  rejects any command arg that resolves (after realpath of the nearest
  existing ancestor, mirroring the cwd discipline so a symlink can't bypass it)
  inside that protected root. HOME secrets (`~/.ssh`, `~/.aws`, shell rc files)
  remain denied for the entire tree by the `srt` policy, where the host has no
  legitimate read. This ownership split is the responsibility-and-reconciliation
  rule: `srt` owns HOME secrets, the in-process runner owns the host's own
  `userData`. **Caveat (`auto`):** the in-process arg check only inspects
  top-level argv, so an interpreter or shell (`bash -c`, `python3 -c`) reachable
  in `auto` can read `userData` by a computed path. Closing that for the shell
  _child_ needs the kernel-level per-call `deny_read` (the deferred per-command
  sub-policy). Desktop's empty direct external allowlist blocks network
  exfiltration from that child, but does not make the in-process read itself
  acceptable. The fs-edit tools (`read_file`) remain workspace-scoped and never
  serve `userData`.

- **`auto` is informed-consent.** `auto` removes command-identity gating; the
  sandbox still bounds the blast radius (writes confined to writable roots,
  direct external network denied), but it does not judge _intent_ — an injected or confused
  agent can read broadly and run anything within those bounds. Restoring intent
  judgment is the classifier/watchdog layer, named and deferred. `auto` is
  opt-in; the default `accept-edits` keeps a read-only-only shell.

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
`--projects-root=<~/Documents/Grida>` (`desktop/src/main/agent-sidecar-supervisor.ts`),
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
The sidecar's own `fs` writes and every child process are inside the same coarse
whole-sidecar `srt` profile; no narrower per-command filesystem profile exists
yet. A created project becomes an in-process workspace root for structured
tools, while shell cwd authorization is checked separately by the runner.
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
- [packages/grida-ai-agent/src/providers/index.ts](packages/grida-ai-agent/src/providers/index.ts) — BYOK-only provider resolver; never exposes credentials to the renderer.
- [packages/grida-daemon/src/daemon.ts](packages/grida-daemon/src/daemon.ts) — daemon discovery contract: owner-only atomic registration + persistent credential, loopback-only records, authenticated probe.
- [packages/grida-ai-agent/src/runtime/index.ts](packages/grida-ai-agent/src/runtime/index.ts) — agent run orchestration; owns run / stream / abort behavior.
- [packages/grida-ai-agent/src/runtime/stream-registry.ts](packages/grida-ai-agent/src/runtime/stream-registry.ts) — in-flight run replay/abort registry.
- [packages/grida-ai-agent/src/runtime/command-backend.ts](packages/grida-ai-agent/src/runtime/command-backend.ts) — agent `run_command` adapter through shell policy (structural gates only; the supervised mode gate is the tool's `needsApproval`).
- [packages/grida-ai-agent/src/tools/run-command.ts](packages/grida-ai-agent/src/tools/run-command.ts) — the supervised-approval gate itself: the AI SDK `needsApproval` predicate that pauses a mutating command before `execute` in `accept-edits` (absent in `auto`). The decision lives on the tool, not the backend.
- [packages/grida-ai-agent/src/runtime/workspace-agent-bindings.ts](packages/grida-ai-agent/src/runtime/workspace-agent-bindings.ts) — opened workspace to agent fs/todos/command bindings; wires the `accept-edits` supervised-approval predicate. The session scratch dir is wired as an additional sanctioned root for BOTH surfaces from one source (`deps.scratch_dir`): the shell's allowed cwd roots AND the fs backend's reachable roots (so `view_image`/`read_file`/`write_file` reach scratch, not just the shell). Containment is preserved per root — a path under no reachable root falls back contained to the workspace, and the secrets root is never a reachable root. Also builds the `generate_image` binding: it reads BYOK keys via `SecretsStore` to call the image provider in-process and returns the saved scratch path + metadata + base64 `data` (the bytes are for the CLIENT to render; `AgentGen.toModelOutput` is text-only, so they are NEVER lowered to the model — no context bloat, no perception claim). The complementary `view_image` perception path DOES deliver bytes to the model, but only ones already read under the agent's existing fs read capability: `agent/hoist-tool-result-images.ts` (wired at `agent/index.ts` `prepareStep`, #923) relocates an image tool-result into a synthetic user-message image part so the model can actually see it on the openai-compatible wire — a model-view lowering that moves bytes already inside the prompt, never persisted, with no new read, no new egress, and no boundary change. The key never leaves the host, and the call omits `providerOptions.grida` so it is BYOK-paid, never Grida-billed (mirrors the `/images/generate` route).
- [packages/grida-ai-agent/src/session/scratch.ts](packages/grida-ai-agent/src/session/scratch.ts) — per-session ephemeral scratch dir (WG `scratch.md`): asserts the shell-writable scratch tree sits OUTSIDE `userData` (the secret root), creates it owner-only (`0700`), and reclaims it (per-session delete + synchronous host-start sweep). `writeScratchFile` lands produced bytes (e.g. `generate_image`) owner-only (`0600`) within the session tree, rejecting any filename that is not a single safe path segment AND opening `O_NOFOLLOW` so a symlink planted at the basename (e.g. by an auto-approved scratch-cwd `run_command`) fails the write instead of redirecting it outside the tree — closing the lexical-check TOCTOU.
- [packages/grida-daemon/src/path-contains.ts](packages/grida-daemon/src/path-contains.ts) — shared `path.sep`-prefix containment used by the shell runner's workspace/secret-root gates, the scratch containment assert, and `createProject`'s managed-root assert (one source so the discipline can't drift).
- [packages/grida-ai-agent/src/runtime/run-input.ts](packages/grida-ai-agent/src/runtime/run-input.ts) — wire-message normalization + `coerceApprovalAnswer`/`applyApprovalAnswer` (shape-gates the explicit `approval_answer` body field and routes it to `store.answerApproval`).
- [packages/grida-ai-agent/src/protocol/context.ts](packages/grida-ai-agent/src/protocol/context.ts) — renderer-safe, persistable directory-reference descriptor vocabulary; the virtual path and read-only access are fixed by the host contract, while the descriptor itself carries no authority.
- [packages/grida-ai-agent/src/session/directory-scopes.ts](packages/grida-ai-agent/src/session/directory-scopes.ts) and [its contract tests](packages/grida-ai-agent/src/session/directory-scopes.test.ts) — in-memory pending/session grant registry: realpath canonicalization, protected-root overlap refusal, bounded one-shot acquisition, exact atomic claim, exclusive session ownership, and lifecycle revocation.
- [packages/grida-ai-agent/src/http/routes/directory-scopes.ts](packages/grida-ai-agent/src/http/routes/directory-scopes.ts) and [its perimeter tests](packages/grida-ai-agent/src/http/routes/directory-scopes.test.ts) — sole raw-path ingress, mounted behind the composed daemon's Auth/Origin/Referer perimeter; returns only an opaque descriptor.
- [packages/grida-ai-agent/src/session/store.ts](packages/grida-ai-agent/src/session/store.ts) — sessions store; `answerApproval` is the server-authoritative supervised-approval gate (answers only a real pending approval, never forges a call).
- [packages/grida-daemon/src/workspaces.ts](packages/grida-daemon/src/workspaces.ts) — opened workspace registry and root canonicalization.
- [packages/grida-daemon/src/workspaces/fs.ts](packages/grida-daemon/src/workspaces/fs.ts) — guarded file operations over a containment **scope** (a `{ id, root }`: the workspace, or the session scratch dir — NOT tied to the workspace registry). Every read/write realpath-checks containment to that scope's root, so a symlink escaping the scope is rejected regardless of which scope it is. The streamed-media export (`openFile`, #924) goes through the same `resolveInside` containment (resolved once per request) and then pins the read to a contained file descriptor: it opens the realpath'd target `O_NOFOLLOW` and fstat-streams from that handle, so a symlink swapped in after the check (the realpath→read TOCTOU) fails the open instead of escaping — the same defense as scratch writes. It is deliberately uncapped because streaming has constant memory (the 1 MiB cap exists only to bound the buffered text/base64 readers), which is also why the TOCTOU hardening matters more here.
- [packages/grida-daemon/src/http/routes/workspaces.ts](packages/grida-daemon/src/http/routes/workspaces.ts) — `/workspaces/*` registry + fs routes, including the streamed, Range-aware `GET /workspaces/file` (#924) that the `grida-workspace://` scheme proxies to. Same Auth/Origin/Referer guards as the base64 readers; containment via `workspaceFs`.
- [desktop/src/main/workspace-media-protocol.ts](desktop/src/main/workspace-media-protocol.ts) — the `grida-workspace://` privileged-scheme handler (#924): proxies to the sidecar's `/workspaces/file` with main-held Basic-Auth + forwarded Range; no independent fs authority; 503 before the sidecar is up.
- `desktop/src/preload.ts` — path-scoped `contextBridge`; password fetched through guarded IPC and held in closure.
- [packages/grida-desktop-bridge/src/index.ts](packages/grida-desktop-bridge/src/index.ts) — renderer-safe bridge protocol and DTO vocabulary.
- `desktop/src/bridge/contract.ts` — Desktop-local IPC channel vocabulary plus re-export of the renderer-safe bridge contract.
- `desktop/src/window.ts` — blocks exposed desktop windows from navigating outside `/desktop/*`; injects non-secret preload arguments.
- `desktop/src/agent-sidecar.ts` — sidecar entrypoint; constructs the composed agent daemon (`createAgentDaemon`) in socketless mode and accepts only main-transferred daemon sockets.
- `desktop/src/agent-sidecar-daemon-sockets.ts` — injects only validated, already-connected socket capabilities into the unbound HTTP server; it exposes no listen, bind, connect, or target-selection operation.
- `desktop/src/agent-sidecar-channel.ts`, `agent-network-policy.ts`, and `agent-sidecar-network.ts` — strict private stdio framing, destination/header policy, and the sidecar's explicit provider/provider-asset transport client.
- `desktop/src/main/agent-daemon-socket-host.ts` — owns the exact loopback listener, pauses accepted sockets, rejects non-loopback peers, and transfers the bounded connected capability over per-spawn Node IPC.
- `desktop/src/main/agent-network-host.ts` and `agent-network-authority.ts` — main-owned Chromium network execution, bounded response streaming, redirect/route reauthorization, and per-spawn built-in/custom grant state.
- `desktop/src/main/agent-sandbox-policy.ts` — binds Desktop's strict sandbox posture: empty direct external egress, host-routed provider HTTP, and no generic local bind/connect authority.
- `desktop/src/main/agent-sidecar-supervisor.ts` — generates the per-spawn password; spawns/supervises the daemon sidecar; initializes the OS sandbox wrapper when supported; owns both private channels and removes direct provider hosts from the sidecar policy (Desktop deliberately withholds srt's alpha Windows backend pending a supported lifecycle).
- `desktop/src/main/protocol-router.ts` — deep-link protocol guard; the auth callback arm is bound by GRIDA-SEC-005.
- `desktop/src/main/ipc-handlers.ts` — validates every native IPC sender frame before executing OS capabilities; custom endpoint set/probe/delete additionally owns the native exact-origin grant ceremony.
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
cookie (GRIDA-SEC-005).

---

### `GRIDA-SEC-005` — Desktop sign-in deep-link boundary

**What it protects.** Desktop sign-in gives the Electron webview a
first-class Supabase **cookie session** — the same session shape as a
browser tab, so every existing cookie-gated route and middleware works
unchanged. The ceremony runs in the system browser (RFC 8252; embedded
webviews are blocked by providers) and returns through the
`grida://auth/callback` deep link. The boundary is the rule that **a
`grida://` deep link is untrusted, world-invokable input: it must never
be able to create, steal, or redirect a session. The only thing a deep
link may cause is a navigation of a desktop window to the fixed
same-origin `/desktop/auth/callback` route.**

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
3. **Stateless, fixed-target router** —
   [desktop/src/main/protocol-router.ts](desktop/src/main/protocol-router.ts)
   performs no code exchange and holds no auth state. It navigates a
   desktop window to the constant `/desktop/auth/callback` path on the
   configured editor origin, forwarding only the known
   `code`/`error*` params; nothing else from the deep link crosses the
   boundary, and every branch consumes the URL (no re-queue loop).
4. **Exchange only at the same-origin callback route** —
   [editor/app/desktop/auth/callback/route.ts](editor/app/desktop/auth/callback/route.ts)
   runs `exchangeCodeForSession` with the cookie client (identical
   mechanism to the web `(auth)/auth/callback`); success and failure
   both redirect inside `/desktop/*`.
5. **Redirect containment** — the `will-redirect` guard in
   [desktop/src/window.ts](desktop/src/window.ts) holds server 302s to
   the same same-origin `/desktop/*` allowlist as user navigations
   (`will-navigate` does not fire for server redirects, so without the
   hook a redirect chain could walk the bridge-attached window
   off-surface). Blocked redirects are NOT handed to the OS browser.
   Sign-out is the same-origin
   [editor/app/desktop/auth/sign-out/route.ts](editor/app/desktop/auth/sign-out/route.ts):
   navigating the webview to the web `/sign-out` would be blocked and
   `shell.openExternal`'d — logging the user out of their OS browser.
6. **Ceremony in the system browser only** — the launch URL travels
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

Electron main holds no durable desktop account or provider credential. Its
provider broker does transiently route BYOK/GG request headers and bodies; the
sidecar owns persisted BYOK material and may hold the purpose-scoped,
short-lived hosted-AI token (GRIDA-SEC-006 — memory-only, renderer-pushed,
never a refresh token). The durable Grida account session lives in the
webview's cookie jar and is refreshed by the same `@supabase/ssr` middleware
machinery as the web app. The `/desktop/*`
CSP keeps `connect-src` closed, so session reads go through the
same-origin `/desktop/auth/me` route rather than direct supabase-js
calls.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-005 .` to enumerate.
Today:

- [supabase/config.toml](supabase/config.toml) — redirect allowlist entries: `grida://auth/callback` (production) + `grida-dev://auth/callback` (local dev/insiders, #955). The hosted dashboard allowlists only the production `grida://` target.
- [editor/lib/desktop/auth-deeplink.ts](editor/lib/desktop/auth-deeplink.ts) — the single, per-environment `…://auth/callback` redirect-target constant (build-time, never request input). Must stay aligned with the desktop's `DEEP_LINK_SCHEME` (`desktop/src/env.ts`).
- [editor/app/desktop/auth/start/route.ts](editor/app/desktop/auth/start/route.ts) — PKCE start; verifier cookie + launch-page URL (method-neutral; the desktop never names a provider).
- [editor/app/(untracked)/desktop-auth/page.tsx](<editor/app/(untracked)/desktop-auth/page.tsx>) + [editor/app/(untracked)/layout.tsx](<editor/app/(untracked)/layout.tsx>) — the web launch page and its analytics-free root layout. Shares the sign-in shell ([editor/components/auth/sign-in-shell.tsx](editor/components/auth/sign-in-shell.tsx)) and Google button (`authorize_url` mode); validates the challenge, binds the offered method's GoTrue flow to it, mirrors the web sign-in's insiders routing (`NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH` → redirect to the insiders page with the challenge forwarded). Deliberately NOT a `(site)` sibling: `(site)` loads Google/Vercel analytics that would beacon the challenge-bearing URL. The `(untracked)` group must never gain a URL-reporting script.
- [editor/host/auth/desktop-auth-flow.ts](editor/host/auth/desktop-auth-flow.ts) — the flow vocabulary shared by the launch page and the insiders route: challenge validation, challenge-bound authorize/OTP builders, verify-link extraction pinned to the Supabase origin (pinned by `desktop-auth-flow.test.ts`).
- [editor/app/(insiders)/insiders/auth/basic/sign-in/route.ts](<editor/app/(insiders)/insiders/auth/basic/sign-in/route.ts>) (+ the hidden `challenge` passthrough in [basic/page.tsx](<editor/app/(insiders)/insiders/auth/basic/page.tsx>)) — the insiders **email+password** desktop branch: verifies the password exactly like the web insiders flow, then mints the challenge-bound code by firing the GoTrue OTP and consuming the emailed verify link straight from the local Mailpit capture, so the developer keeps email+password and still traverses the production verify → `grida://` → exchange path. A password grant alone can never produce a challenge-bound code (GoTrue returns sessions directly for passwords), which is why the mint rides the OTP-link machinery. Local-only by GRIDA-SEC-002 (`/insiders/*` 404s outside development), which is what makes the Mailpit coupling acceptable (pinned by its `route.test.ts`).
- [editor/app/desktop/auth/callback/route.ts](editor/app/desktop/auth/callback/route.ts) — the only code-exchange point; `/desktop/*`-contained redirects (pinned by its `route.test.ts`).
- [editor/app/desktop/auth/sign-out/route.ts](editor/app/desktop/auth/sign-out/route.ts) — same-origin sign-out (never the web `/sign-out`).
- [desktop/src/main/protocol-router.ts](desktop/src/main/protocol-router.ts) — stateless fixed-target auth arm (pinned by `protocol-router.test.ts`).
- [desktop/src/window.ts](desktop/src/window.ts) — `will-redirect` guard; `isAllowedNavigation` predicate (pinned by `window.test.ts`).

**What does NOT belong here.** A code exchange in the Electron main
process. A PKCE verifier carried on the deep link, the bridge, or argv.
A router that navigates to a path taken from deep-link input, or that
forwards params beyond `code`/`error*`. A desktop webview navigation to
`(auth)` routes or the web `/sign-out`. Sidecar- or main-held SESSION
tokens (the scoped hosted-AI token is the one sanctioned exception,
registered under GRIDA-SEC-006 and the GRIDA-SEC-004 hosted-AI
paragraph). The launch page in a route group that loads Google/Vercel
analytics (or any URL-reporting script) — the challenge in its URL is
confidentiality-sensitive, so it stays in `(untracked)`.

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

**What it protects.** The desktop app's hosted ("no-BYOK") AI calls are
authenticated by a **purpose-scoped, short-lived, org-bound JWT** — and
by nothing else. The `/api/v1/ai/*` endpoints never accept a Supabase
access token, a cookie session, or an API key; the mint route
(`/desktop/auth/token`) is the only place the token is created, and it
requires a live cookie session with verified org membership. The
boundary is the rule that **the credential a native process holds for
AI must be worth at most 15 minutes of AI calls billed to an org the
user was a member of — and nothing more.**

**Vulnerable scenario (prevented).** A desktop process credential leaks
— a log line, a crash dump, a local proxy, an exfiltrated memory
snapshot. If that credential were the user's Supabase access token, the
attacker gets the user's whole API surface: RLS-scoped database reads,
storage, profile — the account, for up to an hour, renewable if the
refresh token ever traveled with it. With the scoped token the blast
radius is: AI calls, on one org's credit, for ≤15 minutes, and the
token is structurally useless everywhere else (audience check) —
Supabase never even sees it.

**Why it's specifically risky here.** The sidecar is a long-lived local
daemon that makes third-party network calls with credentials in memory;
it is exactly the process class where credentials leak. And the desktop
webview session (GRIDA-SEC-005) is a full first-class login — handing
_that_ to the daemon would collapse two carefully separated trust
levels into one.

**How the code prevents it.**

1. **Mint only from a live cookie session, same-origin** —
   [editor/app/desktop/auth/token/route.ts](editor/app/desktop/auth/token/route.ts)
   requires `auth.getUser()` and resolves the org through the
   GRIDA-SEC-003 verified resolver (session fallback, or explicit
   `org_id` through `requireOrganizationId` → `assertOrgMember`). The
   route accepts no org header — no new org-id trust input. CSRF is
   bounded by SameSite=Lax auth cookies + same-origin-only readability
   (no CORS on `/desktop/*`).
2. **Scope is cryptographic, not conventional** —
   [editor/lib/auth/gg-token.ts](editor/lib/auth/gg-token.ts) signs
   HS256 with a dedicated server-only secret (`GG_TOKEN_SECRET`),
   pins `algorithms: ["HS256"]` (no alg-swap) and `aud: "gg:ai"`.
   A Supabase token fails verification structurally (different keys),
   and this token fails everywhere Supabase tokens are accepted.
3. **15-minute expiry, 60s clock tolerance** — the token is the unit of
   revocation; abandoning a leaked token requires no server state.
4. **Fail-closed secret handling** — unset or <32-byte secret →
   `not_configured` → 503. There is no fallback path to a weaker
   credential. Rotation via `GG_TOKEN_SECRET_PREVIOUS`
   (verify-only; signing always uses current; drop previous after
   > 15 min).
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
7. **Mint rate limit** — `rl:v1-ai:mint` per-user sliding window
   (fail-open when Upstash is unconfigured; the billing gate on the AI
   endpoints is the actual spend control).

**Residual risks (accepted, documented).** Org-membership revocation is
not re-checked within a token's ≤15-minute lifetime. The mint rate
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

- [editor/lib/auth/gg-token.ts](editor/lib/auth/gg-token.ts) — sign/verify + secret handling (`GG_TOKEN_SECRET`; pinned by `gg-token.test.ts`).
- [editor/app/desktop/auth/token/route.ts](editor/app/desktop/auth/token/route.ts) — the mint route (pinned by its `route.test.ts`).
- `editor/app/(api)/(public)/api/v1/ai/**` — the hosted GG endpoints: OpenAI-compat chat/completions + models, Grida-native images/videos generations. Verify with `verifyGgToken` EXCLUSIVELY; billed through the seam (pinned by contract tests driving the real `@ai-sdk/openai-compatible` client).
- [editor/lib/ai/openai-compat/](editor/lib/ai/openai-compat/codec.ts) — the wire codec + error envelope + allowlist + rate limits.
- [packages/grida-ai-agent/src/providers/gg-session.ts](packages/grida-ai-agent/src/providers/gg-session.ts) — the daemon's in-memory custody (30s expiry slack; `status()` never returns the token; pinned by its test).
- [packages/grida-ai-agent/src/http/routes/gg-auth.ts](packages/grida-ai-agent/src/http/routes/gg-auth.ts) — `/auth/gg/set|clear|status` behind the daemon perimeter; token never logged (pinned by its test).
- [packages/grida-ai-agent/src/providers/gg.ts](packages/grida-ai-agent/src/providers/gg.ts) + [gg-media.ts](packages/grida-ai-agent/src/providers/gg-media.ts) — hosted text/image/video adapters: per-request token reads, editor-origin-only egress, code-led typed errors (401→`gg_token_expired`, 402→`insufficient_credits`), no upstream body text in thrown messages.
- The `gg` resolver arms ([providers/index.ts](packages/grida-ai-agent/src/providers/index.ts), resolve-image, resolve-video) — precedence: explicit wins; implicit BYOK → `gg` → endpoints. The `/secrets/*` allowlist keeps REJECTING the `gg` id (no key may be stored under it; pinned by `gg-auth.test.ts`).
- [packages/grida-ai-agent/src/sandbox/policy.ts](packages/grida-ai-agent/src/sandbox/policy.ts) — `gg_host` egress for ambient-fetch hosts and its omission when provider HTTP is host-routed.
- [desktop/src/main/agent-network-host.ts](desktop/src/main/agent-network-host.ts) — destination-bound Chromium transport; transiently carries the scoped Authorization header without persistence or renderer exposure.

**What does NOT belong here.** An AI endpoint that accepts Supabase
access tokens or cookies. A mint path without a live session or without
membership verification. The token (or a refresh token) persisted by
the daemon, main process, or `auth.json`. A signing fallback when the
secret is unset. A second minting location.

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

## Adding a new GRIDA-SEC entry

1. Allocate the next sequential id (`GRIDA-SEC-008` for the next one).
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
