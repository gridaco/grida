# DaemonServer

`DaemonServer` is the Node lifecycle owner for the local daemon.

It owns the loopback HTTP perimeter and the daemon's long-lived host
state: workspace/file registries, recents, and the secrets store. Hosts
construct it (usually through a composed factory such as
`@grida/agent/server`'s `createAgentDaemon`), call `start()`, read the
bound loopback `port`, and call `stop()` during shutdown.

Hosts must provide:

- `password` for per-request Basic Auth.
- `user_data_path` for persistent local state.
- `http_access` for CORS and Referer policy.
- `tenants` — the static, typed list of capability tenants to mount
  (an empty list is a valid, bare daemon).

Everything AI is a tenant (#927): a `DaemonTenant` registers its route
groups against `DaemonServices` and reports its capability flags, a
`drain` (abort in-flight work), and a `cleanup` (close tenant stores).
The daemon depends on nothing tenant-specific.

The public lifecycle surface is intentionally small. Internals such as
stores and route registrars stay private so GUI, CLI, and future hosts
all use the same server/client contract.
