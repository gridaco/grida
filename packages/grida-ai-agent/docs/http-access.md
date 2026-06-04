# HTTP Access

`AgentHost` protects every HTTP route with three host-configured layers:

- CORS allows only `httpAccess.allowedOrigins`.
- Referer checks allow only those origins and the declared
  `httpAccess.allowedRefererPaths`.
- Basic Auth requires the host-provided per-process password.

The package defines the contract; the host supplies policy. For example,
a GUI host may allow its app route root, while the CLI harness may allow
`/cli`. The agent package must not hardcode either host.

Node host adapters and CLI clients should use `AgentTransport.Client` from
`@grida/agent/transport` so the Authorization, Origin, Referer, route strings,
JSON parsing, stream headers, SSE frames (including the in-band
`grida-session` id frame), and `last-event-id` handling are constructed
consistently. Browser renderers
should normally consume a host-owned bridge instead of constructing these
headers or route paths directly.
