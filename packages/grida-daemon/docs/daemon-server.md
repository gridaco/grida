# DaemonServer

> **GRIDA-SEC-004:** This lifecycle owns both listener and direct-Request
> shutdown relative to tenant state.

`DaemonServer` is the Node lifecycle owner for the local daemon.

It owns the request perimeter and the daemon's long-lived host state:
workspace/file registries, recents, and the secrets store. Hosts construct it
(usually through a composed factory), start it, and call `stop()` during
shutdown.

The default `start()` binds the Node HTTP adapter to loopback. Once startup
resolves, `port` reports the bound port. A host that already owns a private
transport can instead call `start({ listen: false })`: the daemon builds the
same Hono app, perimeter, stores, and tenants without creating any socket. The
host then delivers standard `Request` objects through
`fetch(request): Promise<Response>`.

`fetch` refuses before startup, once shutdown begins, and after shutdown.
`port` refuses whenever no listener is bound. The first start fixes the mode
for that instance: repeated starts in the same mode are idempotent, while a
conflicting mode refuses. `stop()` closes a listener when present, then drains
tenant work in either mode. For standard Request delivery, the daemon keeps a
request active through the returned Response body's end: shutdown aborts the
Request signal, cancels an unconsumed/streaming body, waits for handler and body
settlement, and only then cleans tenant stores. Repeated stops are idempotent.

A handler that never returns and ignores its Request's abort signal can delay
shutdown; the daemon deliberately waits instead of racing that handler against
store cleanup. Tenant handlers with unbounded work must therefore honor the
Request signal or implement that cancellation in their tenant `drain` hook.

The caller of `fetch` owns the transport and serialization outside the daemon.
It does not receive the Hono app or bypass middleware: every delivered Request
passes through the same CORS, Referer, Basic Auth, route, and tenant stack as
the loopback adapter.

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

The public lifecycle surface is intentionally small. Internals such as stores
and route registrars stay private so GUI, CLI, and future hosts all use the
same request contract.
