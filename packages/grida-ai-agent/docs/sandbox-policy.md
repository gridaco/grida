# Sandbox Policy

`buildAgentDaemonSandboxPolicy()` returns the composed sandbox intent for
an agent-daemon process.

The frame — denied secret paths, read/write shape, local binding, and the
baseline dev-network allowlist — is owned by `@grida/daemon/sandbox`
(`buildDaemonSandboxPolicy`, which accepts tenant-contributed
`allowed_network_hosts`). This module contributes what only the agent
tenant knows: the AI upstream hosts (BYOK providers, external-agent
vendors). Neither starts or wraps processes. Host adapters own
platform-specific sandbox setup, process spawning, fallback behavior, and
host facts such as `userData` and `home`.

This keeps each package responsible for what its layer needs — the daemon
for the host frame, the agent tenant for its providers — while each host
remains responsible for how that intent is enforced on the operating
system.

When a host supplies `provider_http`, it should also build the policy with
`host_routed_provider_http: true`. That strict mode omits direct BYOK and GG
destinations so an ambient or missed provider call is denied by the outer
sandbox. It retains the daemon's baseline development hosts and external-agent
vendor hosts: ACP subprocesses own their network stack and remain confined by
the same policy. The option defaults to false for CLI and standalone hosts that
still intentionally use ambient provider requests; remote asset downloads
remain unavailable without a host transport.

For a process tree that must have no direct outbound destinations at all, pass
`direct_network_access: "none"`. This removes the daemon development baseline,
in-process provider/GG hosts, and external-agent vendor hosts, yielding an empty
`allowed_domains` list. Local socket binding is an independent authority:
`allow_local_binding` defaults to `true` for CLI/standalone compatibility, but
a host with a listener-independent request transport can set it to `false`.
The default `"allowlisted"` outbound mode preserves the existing
CLI/standalone policy.
