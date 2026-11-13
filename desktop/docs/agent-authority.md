# Desktop agent authority binding

This document binds the language-agnostic
[execution-authority model](https://github.com/gridaco/grida/blob/main/docs/wg/ai/agent/execution-authority.md)
to Grida Desktop. Issue
[#974](https://github.com/gridaco/grida/issues/974) lands the native provider
transport slice described below. Model commands run in the native host and its
sandbox helper; see [Raw execution and extensions](#raw-execution-and-extensions).

## Current enforcement

Private sidecar bootstrap and local service readiness are independent of provider
network configuration. Chromium's system-proxy setup runs only for an authorized
provider request. While it is pending, control and shutdown remain available;
failure never selects a direct or unconfined network fallback. The request must
still hold its current destination grant when dispatch becomes possible.

Ordinary macOS and Linux Desktop chat runs in the Rust host over private ACP
pipes. The shared master owns conversation behavior and durable execution.
Electron owns user presence, editor tool hosting, provider networking and worker
lifetime. Native finite commands use their own scoped sandbox helpers.

A socketless service sidecar retains files, workspaces, recents, provider
settings and media. Main owns its authenticated loopback listener and transfers
accepted sockets. Native Seatbelt or bubblewrap/seccomp confines this retained
composition without direct destinations or socket creation.

The historical TypeScript chat runtime is absent from distributed entrypoints.
Main is the retained sidecar's only spawner and selects only retained services.
Native startup failure never selects another chat engine. Windows starts retained services with chat unavailable
until native private storage is supported. Its retained filesystem routes have
no kernel containment; HTTP admission does not establish that boundary.

## Decision

Desktop keeps these authority roles separate:

1. **Electron main supervises control and user presence.** It validates grants,
   pins the selected workspace or editor connection, owns worker lifetime and
   the exact loopback listener. It exposes purpose-specific actions.
2. **The Rust chat host owns durable execution.** It uses the shared master,
   records accepted work and invokes registered capabilities. Native command
   helpers enforce captured filesystem, process and network scope.
3. **Electron hosts editor tools and provider transport.** The editor decides
   document semantics. A dedicated Chromium network session handles approved
   provider requests and credential-free asset downloads on private channels.
   Credential owners supply execution-time credentials. The renderer and model
   receive no generic network or process primitive.
4. **The retained service sidecar owns existing non-chat services.** Its
   authenticated interface keeps file, workspace, settings and media callers
   available without opening the old chat database or sweeping chat scratch.
   It keeps its existing containment until separately replaced.

```text
Desktop renderer
      │ path-scoped preload / sender-checked IPC
      ▼
Electron main ─── private ACP ───► Rust host + shared master
      │                              │
      │ editor tools / provider I/O  └──► scoped native execution helper
      │
      └── authenticated accepted sockets ───► retained non-chat services
```

These roles define authority rather than requiring a language or package for
every capability. Raw execution cannot inherit provider-service authority.

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

The provider context identifies requests as `Grida/<version> NativeProviderClient`,
independently of the renderer browser identity. Explicit provider SDK headers
remain intact. A missing SDK identity must not make native API calls look like
browser navigations that can complete cookie-based sign-in.

The provider transport uses a dedicated credential-clean network context. It
MUST NOT attach the webview's Electron session or partition, inherit its cookie
jar, or receive its durable login. Proxy authentication belongs to the host
route; provider authorization comes only from the provider grant.

The native ChatGPT-subscription provider is a narrow instance of this split:
a Main-owned subscription host owns OAuth persistence, refresh, account scoping,
and request credential injection; Electron main also owns the system-browser
launch, temporary dual-stack loopback callback, and the exact
`auth.openai.com` / `chatgpt.com` network route. That route is a Main-only grant
the retained sidecar never receives. The renderer receives only a reconstructed secret-free status
DTO. The experimental binding defaults to the public Codex native OAuth client
id with a host override; it never starts Codex or ACP. Account/display claims
are parsed only from the exact TLS-authenticated token response, without an
OIDC nonce or independent JWT/JWKS/issuer/audience verification. The complete
ceremony and cancel/sign-out races are bound in
[chatgpt-subscription-oauth.md](./chatgpt-subscription-oauth.md).

The package exposes two construction-time operations: provider requests and
credential-free provider-asset downloads. The service accepts one of those
classes plus an opaque host-issued grant, validates the
method/origin/headers/body bounds, and performs the request. AgentSidecar's
provider adapter adds credentials before the private hop; the service never
invents a credential or accepts a renderer URL. The outer native profile omits
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
the channel. A bounded network-cancellation tombstone accepts only the late
response frames that an in-flight abort can legitimately race. The channel has
no command lane. Channel failure exits
the sidecar so supervision restarts a fresh pair. The renderer can invoke the
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
Actual native macOS and unprivileged Linux ARM64 fixtures verify private IPC,
Main-transferred paused sockets, file access, protected-state denial and blocked
bind/connect. The built ordinary macOS sidecar also verifies its authenticated
workspace catalog and media/custody services. Linux installer and signed
Desktop delivery remain separate qualification gates.

## Retained-service containment

The retained file/media sidecar keeps its existing outer sandbox and Main-owned
provider transport. It does not construct a chat scheduler, session database,
skill loader or model command executor. Its process can read only through the
existing secret-path exclusions and has no direct provider networking or local
binding. Human-selected file/workspace operations keep their established owner.
The native retained-service launcher uses Seatbelt on macOS and bubblewrap with
a native-ABI seccomp filter on Linux. It rechecks the executable identity and
never uses a shell or provider proxy. Linux receives its bounded compiled filter
on descriptor 4, which bubblewrap consumes before executing the service;
descriptor 3 remains the sole Node IPC capability channel. The filter rejects
new sockets, namespace changes and out-of-process descriptor acquisition. A
missing or unsupported native boundary fails startup closed.

On macOS, exact protected roots and their ancestors retain only the metadata
needed to revalidate canonical path identities. Private contents, directory
listings and other descendant metadata remain denied. File/workspace admission
can therefore reject protected paths without disabling ordinary fresh workspace
creation.

Linux user namespaces do not preserve root-owned host ancestor identities.
The launcher therefore builds a private root view and binds the existing
settings, provider directory and media library beneath `/retained-service`.
It validates the actual host directories before binding; strict credential
ownership, ACL, path and migration checks are unchanged. These are views of the
same files and SQLite lock inodes, not copies or replacement stores. The host's
normal top-level entries and selected file/workspace paths stay available;
the namespace does not take over `/media` or removable-drive paths. Both the
physical private roots and their namespace prefix are excluded from file and
workspace admission. Existing native/legacy exclusions also apply inside bound
directories. Internal temporary work uses a namespace-local tmpfs.

Linux bind masks for absent protected paths use exclusively created owned
mountpoints. Concurrent generations retain them until the last child closes.
Cleanup checks identity, removes only empty unchanged nodes and leaves changed
or pre-existing data alone. Abrupt host loss can leave empty mask nodes; they
are never adopted as removable user data by a later launch.

## Raw execution and extensions

Model commands run through the Rust host and native sandbox helper. The host
captures explicit directory permissions, protected paths, trusted executable
identity, deadlines and bounded output. Plan withholds command execution. A
profile denies the shared provider credential root (GRIDA-SEC-014) alongside
host state and other protected paths; additional access cannot override it. A
failed or unavailable boundary refuses the command rather than selecting an
unconfined executor. Native macOS/Linux confinement, cancellation and trusted
checks have built-process coverage.

The retained service supervisor supplies no command executor, scratch sweep or
skills root, and its private channel has no command lane. The native master retains operation identity and uncertain outcomes independently
of provider networking and editor semantics. Shutdown and Stop join the work
owned by each process; platform-specific descendant revocation limits still
follow the native sandbox contract.

One-shot commands, external ACP stdio and managed MCP/extension lifecycles keep
their own contracts. Capability discovery does not grant authority or turn an
unqualified platform into a supported execution environment.

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

## Unsupported platforms

The target contract is: no containment means no model-invocable local
filesystem, raw shell, external agent, or extension runtime unless the user
deliberately enters a visibly unsandboxed posture. A Windows confinement
backend requires its own provisioning, lifecycle and regression contract.

The current Windows build starts retained file and media services unwrapped.
It does not start either chat engine, so it provides no model-invocable local
capabilities. Retained structured filesystem routes still have no kernel network
fence.
Controls at the renderer/HTTP boundary and the bounded provider transport
remain real for ordinary product calls; they must not be described as
filesystem or compromise containment. Closing this gap is a release
requirement, not a documentation exception.

Provider-only host services may still operate through a native host transport
that satisfies the credential-service boundary because they do not expose
local file or process authority to the model. Missing local-agent containment
does not authorize those local capabilities.

## Earlier chat data

Ordinary macOS and Linux Desktop keeps chat material from earlier releases in
place and starts fresh native history in a separate store. The retained
service sandbox denies the earlier chat database and session scratch. Desktop
claims neither custody nor retirement of other installed versions. Current
builds cannot start the earlier writer, and native startup failure never
selects another chat engine.

## Retained services

Desktop uses the native retained-service launcher for ordinary
services. Compatibility profiles use the sidecar for standalone document
and workspace registration, file I/O, recents, and ranged workspace media.
Main's workspace Trash helper covers one path-checked native operation.
Moving file I/O out of the compatibility process requires equivalent
per-workspace containment and the existing exact registered-handle checks.

The private selected-document worker on macOS uses a separate Seatbelt
scope. The caller supplies a canonical file and the captured native
identities of the file and parent. The worker can traverse the parent
without listing it. A read exposes only the selected regular file. A save
can replace that file through one private sibling created for the request.
It checks the captured identity and modification time before replacement
and returns the new identity after verifying the write. Document bytes
stream in bounded chunks without the workspace text writer's size limit.
On the packaged macOS arm64 native profile, Main registers the exact file
opened through a trusted Desktop action and issues an opaque document ID.
The standalone window's preload sends that ID over native IPC. Main checks
the originating window and current top-level document route before work and
before returning results. Navigation clears the read basis for saving. A
changed file stops the save and leaves the editor's dirty content open.

The native workspace reader can open one registered directory's file and
stream an exact byte span from the descriptor used for metadata. It checks
the registered directory's native identity and protected roots, then
confirms the open file remains in scope before delivering each chunk.
In-root symbolic aliases can resolve to regular files. Hard links without
proven scope and cross-device targets are refused. On the packaged macOS
arm64 native chat profile, Main captures the directory identity when the user
opens a workspace through a trusted Desktop action. After restarting Desktop,
selecting **Open Recent** or a recent project reopens the exact registered
folder for media previews. If the folder changed, select it through the native
**Open Folder** picker to admit its current identity. The native media route
requires a current registration and streams through a bounded pool of
read-only Seatbelt workers. It preserves Range seeking and cancels the
corresponding worker when the viewer cancels a request. A refused native read
ends the request.

Set `GRIDA_DESKTOP_TEST_NATIVE_RESOURCES` to the canonical packaged Resources
directory containing `native-agent/grida-agent` and run
`pnpm --dir desktop exec vitest run src/main/workspace-media-protocol.test.ts`
to exercise the route with real Seatbelt workers on macOS arm64.

Linux arm64 Node has a separate feasibility check for Node IPC and socket
transfer under bubblewrap and native seccomp. A Linux Electron package and
Windows launch require their own qualification.

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
- captured native launch scopes do not share mutable process-global policy;
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
- two simultaneous workers cannot write through each other's grants or use
  each other's scratch/network destinations;
- unsupported route/trust clients fail with a specific diagnostic;
- Windows exposes no falsely labeled sandboxed capability; and
- GG mint preserves the renderer-transient scoped-token handoff without
  transferring the durable cookie session, and sign-out clears the memory-only
  token without main/disk persistence or logging; and
- the ChatGPT callback admits only the fixed localhost
  address/ports/Host/method/path, keeps code/tokens out of the renderer, and
  prevents late callback, exchange, refresh, cancel, sign-out, or
  reauthentication work from resurrecting stale credentials.

Current platform evidence is intentionally narrower than this full contract.
Main-accepted socket transfer has native macOS and unprivileged Linux ARM64
process evidence. The built ordinary macOS service has authenticated workspace,
provider/custody and durable media evidence. The current Linux installer and
signed delivery paths still require their own qualification. No release or PR description may collapse those two evidence levels
into one cross-platform verification claim.

## Release impact

This is a Desktop security-boundary change. Implementation requires a normal
Desktop release audit, signed/notarized macOS verification, packaged Linux
verification, and explicit daemon, hosted-AI, and ChatGPT OAuth security
reviews. The architecture does not justify a dependency-version bump by
itself; the version decision belongs to the implementing change set.

Shared provider credentials also remain outside structured file access: the
daemon refuses overlapping file/workspace grants and rechecks saved IDs. This
covers ancestor selections and resolved aliases without granting the worker
access to the shared provider directory.
