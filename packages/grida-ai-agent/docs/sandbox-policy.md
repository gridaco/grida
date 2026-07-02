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
