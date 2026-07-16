---
title: Execution authority
format: md
tags:
  - internal
  - wg
  - agent-system
---

# Execution authority

This document decides where an agent host applies confinement. The boundary is
the authority behind an operation, not the process that happens to contain its
implementation.

The decision is:

> **Keep a host-containment boundary around the trusted agent host, but do not
> make an agent egress allowlist the host's network configuration. Give every
> raw agent-controlled runtime its own confined authority. Route mediated or
> cooperatively configured connections through the user's effective host
> network, and fail closed when an opaque client cannot consume it safely.**

This is a two-boundary model. Host containment is defense in depth for trusted
code that implements structured capabilities. Execution confinement contains
raw commands, external agents, and extension runtimes whose behavior is not
fully described by a host-owned operation. Neither boundary grants the model a
generic ambient network capability.

## Etiology

The observable fault is that product networking may work in one host surface
while agent-host networking fails on a machine that requires a system proxy,
PAC rule, proxy authentication, or custom transport trust. User-configured
provider and extension endpoints may also fail because one static destination
set is asked to represent every principal.

The proximate cause is not merely that a proxy variable was removed. Some
sandbox proxies can chain environment-configured upstream proxies, while still
failing to discover the operating system's effective, possibly per-destination
route. The defect is the assumption that one process-wide sandbox policy can
serve simultaneously as destination authorization, host route selection, and
agent execution confinement.

The contract failure is ambient inheritance and attestation. A child process
is not confined merely because its parent says a sandbox exists, and a host
service does not honor the user's network merely because it is unsandboxed.
Both properties require explicit host-owned capabilities.

The defect is therefore systemic. The design must separate:

1. **operation authority** — what the model is allowed to ask for;
2. **destination authority** — which origin a principal may contact;
3. **host routing** — how the user's machine reaches an authorized origin;
4. **transport trust** — which peer certificates and proxy credentials the
   user or organization trusts; and
5. **execution confinement** — which files, processes, destinations, and
   lifetime a raw runtime receives.

## Vocabulary

| Term                      | Meaning                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Host service**          | Trusted product code whose operation and destination are fixed by the host or approved directly by the user. Model inference, credential refresh, and provider health checks are examples.                     |
| **Structured capability** | A host-designed operation with bounded inputs and effects. The model may select valid arguments, but it does not receive the underlying file descriptor, socket, process launcher, or arbitrary URL primitive. |
| **Raw execution**         | A command, executable, script, external agent, extension runtime, unrestricted URL client, or equivalent surface whose behavior is not bounded by a host-designed operation.                                   |
| **Host containment**      | Defense-in-depth restrictions on the trusted agent host: sensitive-file denials, bounded writable roots, and no model-selectable raw child-process path. It is not an agent destination allowlist.             |
| **Execution confinement** | An isolated process tree or equivalent runtime created by a host-owned supervisor with one explicit authority set.                                                                                             |
| **Host network route**    | The effective route selected by the user's operating system, including direct routing, route-based VPNs, DNS, and system proxy or PAC decisions.                                                               |
| **Transport trust**       | The effective certificate and proxy-authentication policy the user or organization configured. It is related to routing, but is not the same property.                                                         |
| **Authority set**         | The immutable capabilities granted to one principal: operations, readable and writable roots, network destinations, process rules, credentials, delegation rules, and lifetime.                                |
| **Authority grant**       | A host-issued, opaque reference to one authority set. A runtime may request use of a grant; it cannot manufacture or widen one.                                                                                |

## The generating rule

Classify an operation by asking who chooses its authority-bearing inputs and
how completely the host-defined operation bounds its effects.

| Operation                                                                                      | Principal               | Enforcement                                                             | Network posture                                                               |
| ---------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The host fixes the operation and origin                                                        | Host service            | Host implementation + host containment                                  | Authorized origin through the host network route                              |
| The user approves an exact provider origin and the model can select only a registered model    | Host service            | User-originated grant + host containment                                | Approved origin through the host network route                                |
| The model invokes a host-designed file or data operation                                       | Structured capability   | Schema and semantic checks + watchdog + host containment                | None unless the capability explicitly owns a fixed or granted destination     |
| The model chooses a command, executable, script, unrestricted URL client, or equivalent target | Raw agent execution     | One execution-confinement domain                                        | Denied by default; explicit destinations only through a compatible host route |
| The user enables an extension runtime                                                          | Extension principal     | One extension-confinement domain + separate lifecycle and egress grants | The extension's grant only; managed route or explicit unmanaged posture       |
| An external agent owns its own loop and can choose tools or subprocesses                       | Agent runtime principal | One execution-confinement domain for the entire process tree            | Explicit runtime destinations only; withheld when route/trust is incompatible |

Classification follows authority, not syntax. A function named `fetch` is a
host service when it calls one host-fixed provider. It is raw execution when
the model-supplied URL becomes unrestricted authority. It remains a structured
capability when the host canonicalizes the URL and checks every connection hop
against a pre-existing destination grant. A structured file tool remains an
agent action, but its designed operation can be enforced without giving the
model a raw process.

## Normative invariants

### A1 — Host services and agent-controlled runtimes are distinct principals

An implementation MUST provide separate logical authority paths for host
services, structured capabilities, extension runtimes, and raw agent execution.
Sharing an operating-system process does not erase those contracts, but it
**does** merge memory, file-descriptor, credential, and kernel authority. The
host-containment ceiling therefore covers the union of authority held in that
process, while structured checks provide narrower operation scopes.

Credential-rich or independently distrusted principals MUST be compartmented
when the union would violate either principal's contract. Logical labels inside
one process are not isolation.

A process-wide agent destination allowlist MUST NOT become the network policy
for host services. Conversely, a host service's route or destination grant
MUST NOT become ambient authority for an agent-controlled runtime.

### A2 — The host network is a route, not a grant

Every authorized connection MUST use the effective host network route by
default. This includes the ordinary direct route when no special configuration
exists, route-based VPNs, host DNS, and system proxy or PAC decisions.

Merely removing a sandbox does not satisfy this requirement. A host-owned
transport MUST actually consult the host's route resolver. Transport trust,
including system-approved certificate authorities and proxy-authentication
state the operating system can supply without disclosing a new credential to
the application, MUST be honored by that transport. If the route instead
raises an interactive authentication challenge, the host MUST either run an
explicit, security-reviewed credential ceremony or fail closed with a specific
diagnostic; silently bypassing the proxy is forbidden.

If the user or organization installs a trust root for a TLS-inspection proxy,
that proxy is a credential-observing transport-trust principal: it can see
authorization headers and request/response bodies by design. Honoring that
system trust cannot also promise cryptographic opacity from the proxy. The host
must identify this posture honestly and keep credentials purpose-scoped so the
accepted observation boundary stays bounded.

An arbitrary child runtime may use a bundled trust store or a network stack
that cannot consume the host route. The host MUST NOT claim compatibility it
cannot provide: it either configures a cooperating client, mediates a designed
network capability, denies that runtime network, or exposes an explicit
user-chosen unmanaged-network posture with diagnostics.

The host route answers **how** to reach a destination. It never answers
**whether** that principal is authorized to reach it.

### A3 — Structured capabilities retain defense in depth

Every model-invocable in-process operation MUST be a structured capability. It
MUST validate its schema and semantic scope before performing an effect, and
the watchdog MUST evaluate the invocation where policy requires it.

The trusted agent host MUST retain a coarse host-containment envelope. Reads
deny user credential and configuration locations that no in-process host
service requires. Writes are limited to the union of active workspaces,
host-owned state, and scratch roots. The boundary MUST NOT expose a
model-selectable raw process launcher. Fixed host helpers MAY exist, but their
executable, arguments, and authority are host-owned rather than model-selected.

This envelope is deliberately not a per-tool claim. Host-owned credentials and
session data required by a service remain reachable to any code compromised
inside the same process, and one process that serves several workspaces holds
their union. When a capability must remain unable to reach that union despite a
validation defect, the host MUST move it into a narrower compartment or give it
capability-safe handles instead of ambient paths.

### A4 — Raw execution is capability-scoped and fail-closed

Every raw agent-controlled process tree MUST be launched through execution
confinement. Its immutable authority set MUST be known before it starts and
MUST cover at least:

- readable roots and mandatory sensitive-read denials;
- writable roots and protected-write denials;
- allowed network destinations, defaulting to none;
- subprocess rules;
- lifetime, cancellation, and output bounds; and
- the credentials, if any, deliberately delegated to that principal.

An external agent that owns its own tool loop is raw execution even when its
binary is first-party or user-installed. The entire process tree, not merely
the commands it later launches, receives the confined authority.

### A5 — One principal, one attributable authority set

Authority MUST be bound to a principal instance through a host-issued grant,
not accepted as caller-supplied policy or stored as one mutable process-global
agent policy. Shared enforcement infrastructure is conforming only when it
preserves the identity and authority set of every connection and filesystem
operation.

Changing a workspace, extension, or subagent grant MUST NOT widen another
running principal. An in-process subagent receives a derived permission grant,
not a new isolation claim. The derived grant is the intersection of the
parent's explicitly delegable permissions and the child's declared
requirements. Credentials, endpoint grants, and user-presence permissions are
non-delegable by default. Any raw process the subagent launches receives its own
execution-confinement domain.

An enforcement library with one global network policy cannot, by itself,
conform for concurrent principals with different grants. A host must isolate
such an enforcer per authority domain, add attributable mediation, or use a
different primitive.

### A6 — Destination authorization precedes host routing

This section governs **managed egress**. It does not apply after the user
explicitly grants the unmanaged-network extension posture defined in A7: in
that posture Grida neither selects nor attests the route and makes no
host-route compatibility or destination-enforcement claim. Only the separately
enforced filesystem and process grants remain.

For a confined principal, destination authorization MUST complete before a
request is forwarded to the host route. Every redirect, proxy tunnel target,
and other connection hop MUST be authorized again before transmission.
Cross-origin redirects MUST strip credentials unless a separate grant binds
them to the new origin.

A destination grant binds the canonical scheme, host, and port. When the host
or a Grida-controlled intermediary resolves the destination, it also enforces
the permitted address class: loopback, link-local, and private-network targets
require an explicit grant, and the authorized resolution is pinned for that
connection.

An operating-system-selected external proxy may perform DNS and open the
upstream connection itself. In that posture, the proxy is a user-selected
trusted routing boundary: Grida authorizes the canonical destination but cannot
truthfully attest the proxy's resolved address. A host that requires
address-class enforcement MUST use a managed intermediary that can attest it or
reject that route with a diagnostic. It MUST NOT claim local-address protection
it cannot observe.

The route resolver may choose a proxy, PAC result, VPN path, or direct
connection, but the principal may not choose or rewrite that route.
An OS-selected proxy is route infrastructure, not an agent destination, and
does not require an agent egress grant. The destination carried through that
proxy still does.

A routing intermediary MUST preserve the caller's destination identity and
MUST NOT expose a generic URL-and-headers request surface to the model. A
Grida-controlled routing-only intermediary SHOULD forward an opaque transport
so credentials remain with their owner. A user-selected TLS-inspection proxy is
the explicit transport-trust exception described by A2, not a
Grida-controlled credential broker.

### A7 — Extension grants are independent

Extension **installation**, **enablement**, **egress**, and **tool invocation**
are separate grants:

- installation acquires inert code or metadata but does not run extension code;
- enablement starts or registers one extension principal;
- egress grants exact destinations or an explicit user-chosen unrestricted
  network posture to that extension principal alone; and
- invocation authorizes a published tool call and its arguments.

No one grant implies another. Package lifecycle scripts and other install-time
execution are not installation; they require a separately confined execution
grant before they run. Tool schema validation cannot contain hidden
startup behavior or private network activity inside an extension process, so
the process retains its own confinement even when individual tool calls are
well-designed. An extension that publishes arbitrary shell or arbitrary URL
access exposes raw execution for that surface.

### A8 — Credentials stay with their owning principal

Separating routing from confinement MUST NOT move durable user credentials
into an agent-controlled process. Host-service credentials remain in their
credential-owning host service. An extension or confined runtime receives a
credential only when its audience, lifetime, and storage rules are explicit in
that principal's authority set.

A Grida-controlled routing-only intermediary that is not the credential owner
MUST NOT persist, log, inspect, or broaden a purpose-scoped token. A
credential-owning network service MAY attach its own token to its fixed
operation, but it remains subject to the same audience, lifetime,
non-persistence, and non-logging contract.

An OS-trusted TLS-inspection proxy may observe the token because the user or
organization deliberately placed it in the transport-trust boundary. That
accepted external observation does not widen the token's audience or lifetime
and does not permit Grida-controlled components to persist or expose it. Network
routing and credential custody remain independent contracts.

### A9 — Unsupported enforcement fails closed

When the host cannot enforce an execution authority set on the current
platform, it MUST withhold the affected raw execution or extension capability.
When host containment is unavailable, it MUST also withhold model-invocable
local filesystem and process capabilities, or place the entire local-agent
surface in the explicit unsandboxed posture below. It MUST NOT label ambient
execution as sandboxed.

An explicit human-operated development escape hatch MAY provide ambient raw
execution, but it is a distinct, visibly unsandboxed posture and is never the
default consequence of an unavailable enforcer.

## Authority topology

The model is a control plane plus isolated authority domains:

```text
user control ───────► authority ledger
                           │
                 ┌─────────┴─────────┐
                 │                   │
trusted agent host              execution supervisor
  ├─ host services ─────────► host route ◄──────── destination filter
  └─ structured capabilities                         │
         │                                           ├─ raw command
         └─ host containment                         ├─ external agent
                                                     └─ extension runtime
```

The authority ledger records user-originated endpoint, extension, and
delegation grants. Model output may request use of a recorded grant; it cannot
create or widen one.

A content or renderer process that can be influenced by untrusted data may
request a grant but cannot record user presence. The trusted host ceremony
canonicalizes and displays the exact destination and posture before issuing the
opaque grant, and keeps revocation in the same authority ledger.

Host containment and execution confinement solve different failures:

| Boundary              | Protects against                                                            | Must not do                                                          |
| --------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Host containment      | A bug in a structured capability escaping filesystem or process scope       | Replace the user's network route with an agent destination policy    |
| Execution confinement | Unbounded behavior of raw commands, external agents, and extension runtimes | Inherit host destinations, credentials, or another principal's grant |
| Host route            | Network incompatibility with the user's machine or organization             | Decide destination authority or expose generic fetch to the model    |

## Host-owned execution boundary

The runtime does not receive an ambient process launcher or a caller-supplied
claim that confinement exists. It requests a host-owned execution boundary
whose presence is the capability.

That boundary accepts a workload request and a host-issued opaque grant, never
a caller-authored authority set. The supervisor canonicalizes the workload,
validates it as a subset of the bound authority, and applies cancellation and
lifetime limits.

Finite commands, long-lived bidirectional agents, and managed extension
lifecycles are separate behavioral contracts. They may share a private
lower-level launcher only after each contract keeps its own lifecycle and
outcome semantics. None exposes the host's raw process handle to the model.
Platform setup, route mediation, process-tree termination, violation reporting,
and cleanup remain host responsibilities.

This is a behavioral contract, not a commitment to one public SDK shape. A
concrete interface should be promoted only after the finite-command and
long-lived-runtime consumers have both shaped it.

## Endpoint classes

### Host and user-approved providers

A first-party provider origin is host-fixed. A custom provider origin becomes
a host-service destination only after a user-originated control path records
that exact origin. Selecting a registered model does not give the model a URL
field and does not create generic egress.

Persisted endpoint configuration is not itself the grant. Where untrusted
content can write or influence configuration, a trusted host-controlled
user-presence ceremony must confirm the canonical origin before it becomes
network authority.

Provider health checks, authentication, and inference use the host route and
transport trust. Their credentials remain with the provider principal.

### Extensions and connectors

An extension runs as its own principal. Enabling it does not widen the agent
host or any other runtime. Its declared or user-approved egress uses the host
route; its tool invocations remain subject to schema checks, runtime permission
rules, and the watchdog.

The user may explicitly choose unrestricted network egress for one extension,
just as they may run other user-installed software. That choice is visible,
revocable, and scoped to the extension process rather than represented by a
global agent allowlist.

### Raw URL and shell surfaces

A model-selected command, executable, script, or unrestricted URL client is
never a host service. It receives no network by default and only explicit
destinations when policy grants them. A bounded `web_fetch`-style capability
may accept a model URL only when it canonicalizes and authorizes every hop
against a host-issued grant. An allowed destination still uses the host route.

## Conformance scenarios

An implementation conforms only if it can demonstrate all of these:

1. **Host inference is independent of raw-execution grants.** Removing every
   destination from a shell's authority does not prevent a host-fixed provider
   call.
2. **The effective host route is honored.** A provider call succeeds through a
   per-destination system proxy or PAC decision when direct egress is blocked,
   and succeeds directly when no proxy is configured.
3. **Transport trust is honest about credential observation.** A host-owned or
   cooperatively configured client honors a user-approved enterprise trust
   root. A Grida-controlled routing-only mediator remains opaque and
   non-persistent. When that root enables an external TLS-inspection proxy, the
   proxy is identified as a user/organization-approved credential-observing
   principal and the credential's audience and lifetime remain bounded. An
   incompatible child fails closed with a diagnostic rather than silently
   bypassing policy.
4. **Structured file tools retain defense in depth.** A validation defect
   still cannot read sensitive paths outside the coarse host envelope or write
   outside its union of roots. A capability claiming narrower isolation runs
   in a separate compartment.
5. **Raw shell is confined.** A model-selected command cannot read protected
   host data, write outside writable roots, spawn beyond its process rules, or
   reach an ungranted destination.
6. **Allowed confined egress preserves routing.** An allowed destination uses
   the configured host route; a disallowed destination is rejected before any
   upstream request.
7. **Redirects and observed resolutions do not widen authority.** A
   cross-origin redirect is re-authorized with credentials stripped. A direct
   or managed resolution cannot enter loopback or a private network without an
   explicit grant. An external OS-selected proxy is identified as a trusted
   routing boundary rather than falsely reported as address-pinned.
8. **Extension grants remain separate.** Installing or enabling an extension
   does not grant egress or approve a tool call. Revoking one extension's
   egress does not affect another principal.
9. **Parallel authority does not bleed.** Two simultaneous runtimes with
   different roots or destination grants cannot use each other's authority.
10. **Unsupported enforcement fails closed.** Raw shell and external-agent
    runtimes are absent when the host cannot enforce their authority sets.
    Model-invocable local file capabilities are also absent when host containment
    is unavailable, unless the user entered the explicit unsandboxed posture.

## Rejected alternatives

### Chain one whole-host sandbox through one upstream proxy

Proxy chaining is necessary for confined egress, but one process-global
destination set keeps the wrong authority boundary. Host services, extensions,
commands, and parallel agents still share mutable authority. A single static
upstream proxy also cannot represent per-destination PAC decisions in general.

### Remove the host sandbox and confine only shell commands

This restores some networking but discards filesystem defense in depth for
structured capabilities. It also leaves long-lived external agents and
extensions unconfined. Host containment and execution confinement are both
required.

### Add every configured destination to one global allowlist

This turns one user grant into ambient authority for every concurrent
principal and creates revocation races. Authority belongs to principal
instances, not to a process-global set.

### Treat extension installation as blanket consent

Tool schemas cannot describe hidden extension startup or network behavior.
Installation, enablement, egress, and invocation remain distinct even when the
user may deliberately grant one extension unrestricted networking.

### Delegate networking through a generic host fetch broker

A model-addressable URL-and-headers broker recreates unbounded egress outside
the confinement boundary and may move bearer credentials into the wrong
principal. Route mediation must preserve destination authorization and
credential custody.

### Offer a “disable sandbox” switch as the solution

Skipping confinement may be an explicit development posture, but it drops
filesystem, process, and network protection together. It does not solve host
routing while keeping agent authority confined.

## Consequences

- The trusted agent host keeps filesystem and process defense in depth without
  using an agent allowlist as its network configuration.
- Host services and approved provider endpoints use the effective host route.
- Structured tools stay narrow and do not expose raw OS handles.
- Raw commands, external agents, and extension runtimes receive attributable
  authority domains that can coexist safely. In-process subagents receive
  derived permission grants; only their raw runtimes require new isolation
  domains.
- Confinement and route implementations remain replaceable. Conformance rests
  on the authority model and scenarios above, not on one library's topology.

## See also

- [Runtime environments](./environments.md) — how the authority model lands in
  web, cloud, and computer hosts.
- [Sandbox Runtime (`srt`)](./srt.md) — one reference implementation of
  confinement primitives.
- [Tools](./tools.md) — structured capability checks and the watchdog.
- [MCP and Connectors](./mcp.md) — extension trust and per-tool permission
  policy.
- [Subagents](./subagents.md) — permission intersection for child agents.
