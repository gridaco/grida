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
5. **Tunnel path filter at the edge** —
   [editor/scripts/billing/tunnel.sh](editor/scripts/billing/tunnel.sh)
   configures cloudflared to forward only `/webhooks/*` and reject
   everything else with 404. Defense-in-depth at the network layer:
   even if app code drifts, the tunnel cannot expose non-webhook paths.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-001 .` to enumerate.
Today:

- [editor/app/(ingest)/README.md](<editor/app/(ingest)/README.md>) — rules.
- [editor/app/(ingest)/webhooks/stripe/route.ts](<editor/app/(ingest)/webhooks/stripe/route.ts>) — Stripe receiver.
- [editor/app/(ingest)/webhooks/metronome/route.ts](<editor/app/(ingest)/webhooks/metronome/route.ts>) — Metronome receiver.
- [editor/proxy.ts](editor/proxy.ts) — path bypass.
- [editor/scripts/billing/tunnel.sh](editor/scripts/billing/tunnel.sh) — tunnel ingress filter.
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

### `GRIDA-SEC-004` — Desktop AgentHost trust boundary

**What it protects.** The Grida Desktop V1 ships a local AgentHost
sidecar (Node subprocess of the Electron app) that owns the user's BYOK
keys (OpenRouter, Vercel AI Gateway), local file paths, chat sessions,
and AI agent loops. The agent server listens
on `127.0.0.1:<random-port>` and is the canonical local capability
surface for the renderer. If anything other than the legitimate
Electron renderer reaches it — another browser tab on grida.co, a
local malware process, a same-origin XSS payload — that party can
exfiltrate secrets, read/write the user's files, and bill AI calls.
The boundary is the rule that **only requests originating from the
desktop's privileged renderer at a `/desktop/*` path, signed with
the per-spawn Basic Auth token, may reach the agent server.**

**Vulnerable scenario (prevented).** A stored XSS lands on a marketing
page or blog post served from `grida.co`. The user has the desktop app
open. Without the boundary, the XSS calls
`fetch('http://127.0.0.1:<port>/secrets/get?key=byok.openrouter')` and
ships the key to an attacker-controlled host; or
`fetch('http://127.0.0.1:<port>/files/read?docId=…')` and exfiltrates
the user's design files. A parallel local-machine attack: an
unprivileged malware process scans `127.0.0.1:49152-65535`, finds
the agent server, and hits its endpoints (a non-browser client doesn't honor
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

**How the code prevents it.** Composed of five layers; any single
layer is insufficient.

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
   for nonce CSP is a cost we already pay, so layer 5 stays
   load-bearing at zero additional maintenance.

   **For maintainers:** if you add inline scripts to a `/desktop/*`
   layout or page, they must carry the nonce. Read it via
   `(await headers()).get("x-nonce")` and pass it to whatever you're
   rendering (e.g. `<ThemeProvider nonce={nonce}>` for `next-themes`,
   `<Script nonce={nonce}>` for `next/script`). Next.js handles
   framework scripts and `<Script>` components automatically when the
   `Content-Security-Policy` header is present on the request. Inline
   `<script>` tags written by hand are your responsibility.

3. **Per-request Basic Auth** — the agent server rejects any request without
   `Authorization: Basic <base64("agent:<password>")>`. Password is a
   random 256-bit value generated per sidecar spawn. Electron main sends it
   to the sidecar over stdin and serves it to preload only through guarded IPC;
   it is never placed on argv, env, disk, or `window.grida`.

4. **Defense-in-depth `Referer` check** — the agent server rejects any request
   whose `Referer` path is not under the host-declared desktop route root. Catches a same-origin
   XSS that somehow bypasses preload scoping (e.g. a future SPA-nav
   race condition).

5. **`secrets.get` does not exist** — the bridge surface in
   [desktop/src/preload.ts](desktop/src/preload.ts) exposes only
   `secrets.has/set/delete`. Agent server code reads keys internally when calling
   the BYOK provider; key material never returns to renderer. Closes
   the exfil path even if all four layers above were bypassed.

**Electron-side hardening (mandatory; see the
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)).**
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
`webSecurity: true`, `allowRunningInsecureContent: false`; release builds
load `https://grida.co` while dev loads `http://localhost:3000`;
`will-navigate` blocks navigation off `EDITOR_BASE_URL`;
`setWindowOpenHandler` denies and routes external links through
`shell.openExternal` after validation; `will-attach-webview` rejects;
every main-process IPC handler validates `event.senderFrame.url`.

**Agent shell execution (V1.x, pre-srt).** The `run_command` agent tool
spawns child processes through `shell/runner.ts` with `shell: false` (no
shell interpolation). Three gates apply: a hardcoded command allowlist
(`permissions.ts`), a cwd-must-be-inside-an-opened-workspace check, and an
in-process secret-dir containment check (below). The OS-level outer sandbox
(`srt`, see the supervisor) confines the _whole_ sidecar; a per-command
fs/net sub-policy that would constrain each spawned child does not exist yet
and is the deferred hardening.

- **Fail-closed exposure (no sandbox ⇒ no shell).** The shell tool is not
  registered at all unless the host affirms containment. The decision is
  computed once at the HTTP-server boundary (`http/server.ts`) as
  `sandbox_enforced || allow_unsandboxed_shell` and threaded to the tool
  registry; the default is off. The desktop supervisor sets `sandbox_enforced`
  true only when it actually wrapped the sidecar spawn with `srt`, so on
  platforms `srt` cannot wrap (Windows today) the agent gets fs/todos/skills
  but **no** `run_command`. The `grida-agent` CLI — a local, user-invoked tool
  with no OS sandbox — sets the explicit `allow_unsandboxed_shell` opt-in
  instead, which logs a warning. New privileged tools added later inherit the
  same gate: a capability that needs containment is born behind this switch,
  so the system's default posture is "no containment, no capability."

- **Secret-dir containment (in-process).** The agent host's own secret dir —
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
  `userData`.

- **`git` is an accepted limitation.** `git` is on the allowlist because it is
  the single most useful dev command, but it is a known
  arbitrary-code-execution / arbitrary-file-read vector even with
  `shell: false`: `git -c core.pager=…` / `-c core.sshCommand=…`,
  `--upload-pack`, and `apply`/`clone` run attacker-chosen programs, and
  `--git-dir`, `apply`, and a `.git/config` credential read reach arbitrary
  files. This collapses the no-shell / allowlist guarantee. The risk is
  accepted for V1.x pending the `srt` per-command sub-policy that can
  constrain its fs/net reach at the kernel level.

**No hosted auth in V1.** Desktop V1 ships no `/auth/*` route group, no
PKCE handoff, no cloud session refresh, and no entitlement polling. Future
hosted-provider work must re-register its callback and hosted-model files in
this record before code lands.

**Update channel.** Release builds must be signed/notarized by platform
policy. Security-sensitive runtime deps are reviewed as part of the
desktop release checklist; do not treat broad semver ranges as acceptable
for code running inside this boundary without an explicit review note.

**Files bound by this id.** Run `grep -rn GRIDA-SEC-004 .` to enumerate.
Today:

- [editor/lib/supabase/server.ts](editor/lib/supabase/server.ts) — `createClientFromBearer` (bearer-auth shim for existing private editor routes that allow Desktop-originated calls without browser cookies).
- [editor/app/(api)/private/ai/design/chat/route.ts](<editor/app/(api)/private/ai/design/chat/route.ts>) — legacy SVG/web whole-agent route; accepts bearer auth for existing Desktop SVG callers during migration.
- [packages/grida-ai-agent/src/providers/index.ts](packages/grida-ai-agent/src/providers/index.ts) — BYOK-only provider resolver; never exposes credentials to the renderer.
- [packages/grida-ai-agent/src/runtime/index.ts](packages/grida-ai-agent/src/runtime/index.ts) — agent run orchestration; owns run / stream / abort behavior.
- [packages/grida-ai-agent/src/runtime/stream-registry.ts](packages/grida-ai-agent/src/runtime/stream-registry.ts) — in-flight run replay/abort registry.
- [packages/grida-ai-agent/src/runtime/command-backend.ts](packages/grida-ai-agent/src/runtime/command-backend.ts) — agent `run_command` adapter through shell policy.
- [packages/grida-ai-agent/src/runtime/workspace-agent-bindings.ts](packages/grida-ai-agent/src/runtime/workspace-agent-bindings.ts) — opened workspace to agent fs/todos/command bindings.
- [packages/grida-ai-agent/src/workspaces.ts](packages/grida-ai-agent/src/workspaces.ts) — opened workspace registry and root canonicalization.
- [packages/grida-ai-agent/src/workspaces/fs.ts](packages/grida-ai-agent/src/workspaces/fs.ts) — guarded workspace file operations.
- `desktop/src/preload.ts` — path-scoped `contextBridge`; password fetched through guarded IPC and held in closure.
- [packages/grida-desktop-bridge/src/index.ts](packages/grida-desktop-bridge/src/index.ts) — renderer-safe bridge protocol and DTO vocabulary.
- `desktop/src/bridge/contract.ts` — Desktop-local IPC channel vocabulary plus re-export of the renderer-safe bridge contract.
- `desktop/src/window.ts` — blocks exposed desktop windows from navigating outside `/desktop/*`; injects non-secret preload arguments.
- `desktop/src/agent-sidecar.ts` — sidecar entrypoint; constructs the BYOK-only AgentHost.
- `desktop/src/main/agent-sidecar-supervisor.ts` — generates per-spawn password; spawns/supervises the AgentHost sidecar; initializes the OS sandbox wrapper when supported (`srt` is not available on Windows yet).
- `desktop/src/main/protocol-router.ts` — deep-link protocol guard; V1 has no cloud callback route.
- `desktop/src/main/ipc-handlers.ts` — validates every native IPC sender frame before executing OS capabilities.
- `packages/grida-ai-agent/src/http/server.ts` — loopback HTTP app and route registration behind shared guards.
- `packages/grida-ai-agent/src/http/routes/secrets.ts` — BYOK key presence/set/delete route group; no key-read route.
- `packages/grida-ai-agent/src/transport.ts` — shared Basic Auth header/client transport helpers, AgentHost route methods, SSE parsing, stream resume headers, and typed HTTP errors.
- `packages/grida-ai-agent/src/http/auth.ts` — Basic Auth middleware.
- `packages/grida-ai-agent/src/http/origin.ts` — Origin allowlist and host-declared Referer-path guard.
- `packages/grida-ai-agent/src/auth/file.ts` — `auth.json` chmod 0o600 read/write.
- `packages/grida-ai-agent/src/secrets.ts` — `auth.json`-backed BYOK key store; exposes only `has`, `set`, and `delete` to routes.
- `packages/grida-ai-agent/src/sandbox/policy.ts` — AgentHost sandbox policy intent.
- [editor/proxy.ts](editor/proxy.ts) — Next.js 16 proxy that sets the CSP + `X-Robots-Tag` + `Referrer-Policy` + `X-Content-Type-Options` headers on every `/desktop/*` response.
- [editor/app/desktop/layout.tsx](editor/app/desktop/layout.tsx) — root layout for the desktop route group; gates all children through `DesktopBridgeGate`.
- [editor/scaffolds/desktop/desktop-bridge-gate.tsx](editor/scaffolds/desktop/desktop-bridge-gate.tsx) — server-rendering-safe gate that renders children only when `window.grida` is present.
- [editor/scaffolds/desktop/open-in-desktop-cta.tsx](editor/scaffolds/desktop/open-in-desktop-cta.tsx) — fallback shown to web visitors (capability boundary visible per doctrine rule 3).
- [editor/lib/desktop/bridge.ts](editor/lib/desktop/bridge.ts) — typed client of `window.grida` + SSR-safe presence detector (`useDesktopBridge`).
- [desktop/src/main/host-apps.ts](desktop/src/main/host-apps.ts) — private desktop UX registry for “Open in…” app detection/opening.
- [desktop/src/main/workspace-files.ts](desktop/src/main/workspace-files.ts) — move-to-trash for a workspace entry (file or folder); re-validates that `relPath` resolves inside the workspace root, and isn't the root itself, before `shell.trashItem`.

**What does NOT belong here.** A `secrets.get` method on the bridge.
A bridge installed unconditionally (without `pathname` scoping). A
agent server that binds `0.0.0.0`. An app that loads grida.co's
non-`(desktop)` routes inside the desktop window without revoking the
bridge first. Any IPC handler in Electron main that acts without
checking `event.senderFrame.url`. A `grida://` deep-link handler that
exchanges OAuth codes without agent-server-held PKCE state.

---

## Adding a new GRIDA-SEC entry

1. Allocate the next sequential id (`GRIDA-SEC-005` for the next one).
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
