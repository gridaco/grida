# AgentHost

`AgentHost` is the Node lifecycle owner for the local agent server.

It owns long-lived agent state: HTTP routes, session storage, BYOK provider
resolution, workspace/file registries, secrets, stream registry, and the
agent run loop. Hosts construct it, call `start()`, read the bound
loopback `port`, and call `stop()` during shutdown.

Hosts must provide:

- `password` for per-request Basic Auth.
- `capabilities` describing the route groups mounted by this host.
- `userDataPath` for persistent local state.
- `httpAccess` for CORS and Referer policy.

The public lifecycle surface is intentionally small. Runtime internals
such as stores, registries, and run loops stay private so GUI, CLI, and
future hosts all use the same server/client contract.
