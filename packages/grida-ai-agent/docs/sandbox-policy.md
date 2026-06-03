# Sandbox Policy

`buildAgentHostSandboxPolicy()` returns package-owned sandbox intent for
an AgentHost process.

The policy describes allowed BYOK provider hosts, denied secret paths,
read/write shape, and whether local binding is required. It does not start
or wrap processes. Host adapters own platform-specific sandbox setup,
process spawning, fallback behavior, and host facts such as `userData` and
`home`.

This keeps the agent package responsible for what the agent needs, while
each host remains responsible for how that intent is enforced on the
operating system.
