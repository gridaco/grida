# Desktop agent authority binding

This document binds the language-agnostic
[execution-authority model](https://github.com/gridaco/grida/blob/main/docs/wg/ai/agent/execution-authority.md)
to Grida Desktop. Issue
[#974](https://github.com/gridaco/grida/issues/974) lands the native provider
transport slice described below; supervisor-owned raw execution workers remain
the target architecture, not a claim about the current sidecar.

On macOS and Linux, the implementation wraps the entire AgentSidecar with
`@anthropic-ai/sandbox-runtime` (`srt`) 0.0.65 and one global destination
policy. Its direct external destination set is empty and
`allow_local_binding` is false. Electron main owns the exact loopback listener,
transfers only already-accepted connected sockets to the socketless sidecar,
and routes trusted provider HTTP through a separate private stdio channel.
BYOK/GG hosts are absent from the outer policy. The wrap remains the shipping
filesystem/process boundary until every raw-worker replacement gate in this
document exists. Removing it first would expose raw shell without an equivalent
kernel boundary; Desktop already withholds the external ACP agent.

Windows currently starts AgentSidecar unwrapped. Shell and external ACP are
withheld, but
structured local filesystem capabilities remain available; that is a known
nonconformance with the target fail-closed posture below, not a sandbox claim.
The package-level empty destination intent is not a Windows kernel egress
fence; an AgentSidecar compromise there retains ambient process networking.

## Decision

Desktop uses four authority roles:

1. **Electron main is the control supervisor.** It validates user-originated
   grants, starts principals, owns process lifetime, and owns the exact
   `127.0.0.1` ephemeral daemon listener. It does not expose a generic fetch,
   listen, connect, or spawn primitive to the renderer or model.
2. **AgentSidecar is the contained agent host.** It owns sessions, structured
   file capabilities, the model loop, and the authenticated renderer perimeter.
   It starts the daemon socketless and serves only connected sockets transferred
   by main. Its outer profile is a coarse filesystem/process backstop. Provider
   egress is not represented by its agent destination allowlist.
3. **The native provider transport runs in Electron main.** It uses a dedicated
   non-persistent Chromium network session, owns registered provider origins,
   and exposes only provider-request and credential-free provider-asset
   operation classes over the private channel. AgentSidecar still owns and
   injects BYOK/GG credentials; main can observe them in transit but never
   stores or logs them.
4. **Supervisor-owned execution workers contain raw principals.** Shell
   commands, external ACP agents, local MCP servers, install-time executables,
   and other raw runtimes are launched with a host-issued grant in an authority
   domain that cannot mutate another domain.

```text
hosted renderer
      │ path-scoped bridge + per-spawn auth
      ▼
main-owned 127.0.0.1 listener
      │ accepted connected socket (Node IPC fd 3)
      ▼
socketless contained AgentSidecar ── provider frames ─► native network service
      │                                                   │
      │ opaque grant + workload                           └─ Chromium host route
      ▼
execution supervisor
      ├─ confined shell process tree
      ├─ confined external-agent process tree
      └─ confined extension process tree
```

The roles are security boundaries, not package names. An implementation may
split them further, but it may not collapse a raw principal into the network
service or expose either service's underlying I/O primitive to model output.

## User grant ceremony

The URL-loaded renderer may request an endpoint or extension grant; it cannot
mint one. Electron main owns a native user-presence ceremony that canonicalizes
and displays the exact scheme, host, port, requested local/private address
class, and managed or unmanaged network posture. Only a positive native user
decision creates the opaque grant in the authority ledger.

Changing the endpoint invalidates the old grant. Revocation stops new requests
and tears down bound extension principals. First-party compiled origins do not
need a per-use prompt, but remain host-issued grants rather than renderer
configuration. This keeps a compromise inside `/desktop/*` from turning a
configuration write into native-service egress.

## Native provider networking

Electron's [`net`](https://www.electronjs.org/docs/latest/api/net) stack is the
host-native HTTP transport because it uses Chromium networking: system proxy
discovery and PAC/WPAD evaluation, host routing, and platform trust behavior.
The landed implementation uses a dedicated, non-persistent `Session` owned by
Electron main. It does not attach the webview partition or its cookie jar.
Moving the service into a separately confined native helper remains desirable
if steady-state credential custody ever moves out of AgentSidecar; a bare
`utilityProcess` alone would be process isolation, not authority confinement.

The provider transport uses a dedicated credential-clean network context. It
MUST NOT attach the webview's Electron session or partition, inherit its cookie
jar, or receive its durable login. Proxy authentication belongs to the host
route; provider authorization comes only from the provider grant.

The package exposes two construction-time operations: provider requests and
credential-free provider-asset downloads. The service accepts one of those
classes plus an opaque host-issued grant, validates the
method/origin/headers/body bounds, and performs the request. AgentSidecar's
provider adapter adds credentials before the private hop; the service never
invents a credential or accepts a renderer URL. The outer `srt` profile omits
BYOK/GG destinations, so the injected operation is an authority boundary rather
than a routing preference.

Every redirect is re-authorized. Credential-bearing cross-origin redirects are
rejected. Provider-asset downloads are HTTPS/default-port only, carry a small
credential-free header set, and remain inside enumerated provider-owned origin
namespaces. There is no `https://*` grant: an arbitrary CDN or input URL is
refused until it has a separately designed exact-origin ceremony and enforcing
connector.

Custom endpoints require a native exact-origin approval and receive a per-spawn
memory-only grant. The admitted set is intentionally smaller than “private
network”: `localhost`, subdomains of `.localhost`, and IP literals. Remote
hostnames, including `.local` names, remain withheld. A PAC result that happens
to select a proxy is not enough because the current connector cannot atomically
bind proxy selection, DNS resolution, and Chromium's eventual connection to one
authorization decision.

When the user's OS selects an external proxy that performs DNS, that proxy is a
trusted user-owned routing boundary. Desktop authorizes the canonical origin
and preserves it through the proxy, but does not claim visibility into the
proxy's resolved address. Streaming remains end to end; buffering a complete
model response is not an acceptable substitute for SSE.

Chromium may use proxy credentials already available through the operating
system or integrated authentication. Desktop does not collect or persist proxy
usernames/passwords; if Chromium emits an interactive proxy `login` challenge,
the request fails with a specific diagnostic. Adding a credential prompt or
credential-store contract is a separate product and security decision, not an
implicit extension of provider-key custody.

This is network-route compatibility, not a censorship-circumvention tunnel.
Built-in provider and GG requests can succeed when the machine's Chromium/system
route — direct routing, VPN, DNS, proxy/PAC, and platform trust — can reach the
authorized origin. Desktop does not manufacture a route when that environment
cannot reach it, and it never gives shell, ACP, or model-selected URLs the
provider transport as an escape hatch.

If the OS-trusted proxy terminates TLS using a user/organization-installed root,
it can observe provider authorization headers and message bodies. Desktop
reports that as the configured transport-trust posture; it does not claim
end-to-end opacity from the inspecting proxy. BYOK credentials keep their
provider scope, and the GG credential remains the short-lived, `gg:ai`-only
token, so the accepted observation boundary does not become durable account
authority.

At the routing layer, bare `utilityProcess` + `net` is sufficient only for
host-fixed HTTPS origins whose normal DNS/TLS trust is part of the host-service
contract. It still needs the credential-service containment above. A
user-supplied hostname is withheld until the enforcing connector can bind
authorization, proxy/PAC choice, resolution, and connect; an explicitly granted
IP literal or `.localhost` origin does not make a broader hostname grant.

Grida Gateway keeps its current weak-token handoff. The signed-in webview mints
the short-lived, `gg:ai`-audience token through its same-origin cookie session
and transiently pushes it to AgentSidecar through the authenticated daemon
route. AgentSidecar retains steady-state memory custody and adds the bearer to
each GG request; Electron main sees it only in the in-flight private frame and
Chromium request. The token retains the existing ≤15-minute bearer residual.
The durable webview cookie, refresh token, and Supabase access token never enter
the sidecar or provider transport. Sign-out and replacement clear the
sidecar's in-memory token.

The renderer's transient access to the already-scoped token is the existing
`GRIDA-SEC-006` posture. Electron main gains transient request visibility, not
durable account authority; disk, logs, raw workers, and the network session's
cookie jar receive no token. Moving steady-state custody to a separate
credential compartment must land atomically with its containment, handoff
tests, and the `GRIDA-SEC-006` record.

Electron's public networking API is not a transparent raw tunnel. In
particular, resolving a PAC result does not provide a Chromium-authenticated
duplex `CONNECT` socket that can be handed to an arbitrary child. The design
therefore does not promise that every opaque executable inherits Chromium's
proxy, authentication, or certificate behavior.

## Private service channels

Desktop uses two private channels with deliberately different authority.

The **provider channel** is a host capability, not a discoverable local API. It
uses inherited stdin/stdout. Main-to-sidecar and sidecar-to-main messages are
4-byte big-endian length-prefixed JSON; frames, metadata, binary chunks,
request bodies, response totals, and response credit are all bounded. Stdout is
reserved for frames and every sidecar console diagnostic is redirected to
stderr. There is no provider loopback proxy, argv/env token, or renderer
handle.

Every request is bound to the inherited process pair, channel lifetime,
operation class, opaque authority grant, request id, and chunk sequence. Grant
updates carry monotonically increasing revisions and main does not report them
published until the sidecar acknowledges application; the host re-authorizes a
completed upload against its current grant snapshot immediately before I/O.
Unknown, stale, out-of-order, oversized, or grant-mismatched messages terminate
the channel. A bounded cancellation tombstone accepts only the late response
frames that an in-flight abort can legitimately race. Channel failure exits the
sidecar so supervision restarts a fresh pair. The renderer can invoke the
existing typed product bridge, but never receives the channel or a service
credential.

The **daemon socket capability channel** is Node IPC on inherited descriptor 3.
Electron main alone binds an ephemeral port on exact `127.0.0.1` with
`pauseOnConnect`. Before sidecar readiness, at capacity, or for a non-loopback
peer, it drops the socket. Otherwise it transfers the already-connected socket
with a fixed, versioned envelope and relinquishes its copy. The sidecar injects
that socket into an unbound HTTP server and resumes it only after the parser is
installed. It receives no listener, target field, bind operation, or connect
operation; malformed trusted-IPC input is fatal. The HTTP bytes still pass
through the same Basic Auth, Origin, Referer, route, and tenant middleware.

This channel is why the sidecar can run with `allow_local_binding: false` and
why its daemon remains reachable when Linux Bubblewrap gives it a private
network namespace. It does not grant arbitrary loopback access: main chooses
the listener, accepts the peer, and transfers only that connected capability.
The macOS transfer path has an end-to-end `srt` proof. Linux descriptor
preservation and namespace behavior are source-audited; a packaged Linux
end-to-end transfer test remains a release gate.

## AgentSidecar host containment

The outer AgentSidecar boundary remains a coarse backstop for structured file
capabilities:

- reads deny user credential/configuration locations the sidecar does not own;
- writes are limited to the union of opened workspaces, sidecar state, and
  scratch roots;
- direct external networking is denied in Desktop; provider HTTP uses the
  private host service;
- generic local bind/connect authority is denied; daemon access arrives only as
  a main-accepted connected-socket capability;
- model-selected commands reach process creation only through the structured
  `run_command` and approval path; external ACP is absent; and
- fixed helpers, if any, have host-fixed executable and argument shapes.

This boundary cannot hide sidecar-owned BYOK/session data from a compromise in
the same process, and it cannot distinguish two workspace roots held by one
sidecar. A capability that must resist that compromise belongs in its own
worker or must receive capability-safe handles rather than ambient paths.

## Raw execution and extensions

The runtime never supplies `sandbox_enforced: true` as evidence of authority.
The capability is the supervisor binding itself: a workload request plus an
opaque, host-issued grant. The supervisor independently canonicalizes the
executable, arguments, environment, working directory, roots, and requested
network subset before launch.

One-shot shell, long-lived ACP stdio, and managed MCP/extension lifecycle are
separate behavioral contracts. A private launcher may serve all three, but no
public shared API is promoted until these consumers have proved the common
shape.

The installed srt `0.0.65` manager has process-global proxy and network-policy
state. Per-command custom configuration does not provide per-command network
identity. Desktop must therefore use one manager-owning worker per concurrent
authority domain, add an attributable mediator, or replace the enforcer. It
must not mutate one global allowlist as grants come and go.

Raw networking follows these postures:

| Workload                                  | Default                                                                                   | Host-route requirement                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell or script                           | Network denied                                                                            | A designed, granted HTTP capability may use the native service; arbitrary TCP remains unavailable without a conforming enforcer.                   |
| External ACP agent                        | Withheld in Desktop until its fixed endpoints and client route/trust can both be enforced | A static environment proxy is not advertised as system-PAC compatibility.                                                                          |
| Local MCP / extension                     | Confined filesystem/process with no egress grant                                          | Exact egress grants are enforced per worker. The user may separately choose a visible, revocable unmanaged-network grant for that extension alone. |
| Install-time resolver or lifecycle script | Inert acquisition only                                                                    | Any executable install step is a separate confined workload with its own egress grant.                                                             |

An unmanaged-network extension grant is not called sandboxed networking. It
means Grida does not intercept that extension's network stack; the extension is
responsible for consuming the user's OS configuration like any other installed
software. Filesystem/process containment and tool-call permission remain in
force.

## Permission modes

`accept-edits` and `auto` decide when a cleared action needs user approval.
They do not widen a kernel authority set:

- `accept-edits` keeps the supervised Allow/Deny gate for non-read-only command
  execution;
- `auto` removes that interaction gate but still uses the same host-issued
  confinement ceiling; and
- neither mode converts an unavailable enforcer into ambient execution.

The explicit CLI development posture may inject an honestly named unsandboxed
execution host. It is not available to Desktop by default and must never set or
return a `sandbox_enforced` assertion.

## Unsupported platforms

The target contract is: no containment means no model-invocable local
filesystem, raw shell, external agent, or extension runtime unless the user
deliberately enters a visibly unsandboxed posture. srt 0.0.65 contains an alpha
Windows backend, but Desktop deliberately withholds it until its argv-based
spawn, provisioning, packaging, lifecycle, and regression contract are owned.

The current Windows build is therefore nonconforming with that target: it runs
AgentSidecar unwrapped and withholds shell and external ACP, but still exposes
structured local filesystem capabilities and has no kernel network fence.
Controls at the renderer/HTTP boundary and the bounded provider transport
remain real for ordinary product calls; they must not be described as
filesystem or compromise containment. Closing this gap is a release
requirement, not a documentation exception.

Provider-only host services may still operate through a native host transport
that satisfies the credential-service boundary because they do not expose
local file or process authority to the model. Missing local-agent containment
does not authorize those local capabilities.

## Replacement gates

The current whole-sidecar boundary may be re-scoped only when all of these are
true in the same change set:

- provider and GG traffic uses the contained, credential-clean,
  destination-bound native network service;
- renderer-requested endpoints and unmanaged extension networking require the
  main-owned user-presence ceremony and revocable ledger grant;
- private service channels are process-bound, bounded, tied to peer/grant
  lifetime, and tolerate bounded late-frame races;
- AgentSidecar keeps a tested filesystem/process host-containment profile;
- shell execution uses a supervisor-owned grant rather than ambient parent
  inheritance or a boolean assertion;
- external ACP and local MCP/extension processes have independently tested
  authority domains or are withheld;
- parallel grants cannot bleed through srt's global manager state;
- redirects, directly observed private-address resolution, external-proxy trust
  boundaries, cancellation, cleanup, and SSE have deterministic regression
  coverage; and
- the `GRIDA-SEC-004` and `GRIDA-SEC-006` records describe the landed process,
  credential, and residual-risk boundaries.

Until then, the correct implementation posture is deferral, not selectively
unwrapping traffic that happens to be broken.

## Verification contract

The implementation must prove at least:

- provider SSE succeeds through a system PAC/proxy with direct egress blocked;
- a system-trusted TLS-inspection proxy succeeds and is identified as a
  credential-observing transport boundary; Grida-controlled mediators still do
  not log or persist provider credentials;
- an approved provider redirect cannot carry a bearer token to another origin;
- provider-asset downloads cannot name an origin outside the enumerated
  provider namespaces; remote custom hostnames, including `.local`, are
  refused, while `localhost`, `.localhost` subdomains, and IP literals require
  exact native approval;
- the sidecar cannot bind or connect to an arbitrary local socket, and can
  serve daemon HTTP only over main-accepted connected sockets transferred on
  the per-spawn capability channel;
- renderer configuration alone cannot mint provider or extension egress;
- the credential service cannot read workspaces/sidecar state, spawn a raw
  process, or attach the webview cookie session;
- an expired, wrong-peer, stale-revision, out-of-order, or grant-mismatched
  service request is rejected;
- a structured file-tool validation defect still hits the outer filesystem
  boundary;
- shell and ACP workers cannot read sidecar state or write outside their grant;
- two simultaneous workers cannot use each other's roots or destinations;
- unsupported route/trust clients fail with a specific diagnostic;
- Windows exposes no falsely labeled sandboxed capability; and
- GG mint preserves the renderer-transient scoped-token handoff without
  transferring the durable cookie session, and sign-out clears the memory-only
  token without main/disk persistence or logging.

Current platform evidence is intentionally narrower than this full contract.
The main-accepted socket transfer has been exercised end to end under the
macOS `srt` wrapper. The Linux descriptor path and Bubblewrap namespace behavior
have been source-audited, but a packaged Linux end-to-end transfer run is still
pending. No release or PR description may collapse those two evidence levels
into one cross-platform verification claim.

## Release impact

This is a Desktop security-boundary change. Implementation requires a normal
Desktop release audit, signed/notarized macOS verification, packaged Linux
verification, and an explicit `GRIDA-SEC-004` / `GRIDA-SEC-006` security review.
The architecture does not justify a dependency-version bump by itself; the
version decision belongs to the implementing change set.
