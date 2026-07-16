# HTTP Access

> **GRIDA-SEC-004:** Listener and private-transport requests cross the same
> authenticated perimeter.

The daemon protects every HTTP route with three host-configured layers:

- CORS allows only `httpAccess.allowedOrigins`.
- Referer checks allow only those origins and the declared
  `httpAccess.allowedRefererPaths`.
- Basic Auth requires the host-provided per-process password.

The package defines the contract; the host supplies policy. For example,
a GUI host may allow its app route root, while the CLI harness may allow
`/cli`. The daemon package must not hardcode either host.

A host-owned private transport may use `start({ listen: false })` and deliver
standard Requests through `DaemonServer.fetch`. That path runs this same
middleware stack; it does not synthesize credentials or relax a guard. The
transport is responsible for preserving the complete method, URL, headers,
and body when it reconstructs the Request. The daemon retains lifecycle
ownership after headers are returned: a streaming body stays active until it
ends or is canceled, and shutdown joins it before tenant cleanup.

Node host adapters and CLI clients should use `DaemonTransport.Client` from
`@grida/daemon/transport` — or `AgentTransport.Client` from
`@grida/agent/transport`, which extends it with the agent tenant's routes —
so the Authorization, Origin, Referer, route strings,
JSON parsing, stream headers, SSE frames (including the in-band
`grida-session` id frame), and `last-event-id` handling are constructed
consistently. Browser renderers
should normally consume a host-owned bridge instead of constructing these
headers or route paths directly.
