/** GRIDA-SEC-004 — daemon sandbox network-authority contract pins. */
import { describe, expect, it } from "vitest";

import { buildDaemonSandboxPolicy } from "./policy";

describe("buildDaemonSandboxPolicy", () => {
  it("includes the development-network baseline by default", () => {
    // Existing hosts depend on the baseline when they do not select a
    // narrower network contract.
    const policy = buildDaemonSandboxPolicy({
      user_data: "/tmp/grida",
      home: "/Users/example",
      allowed_network_hosts: ["tenant.example"],
    });
    const explicitPolicy = buildDaemonSandboxPolicy({
      user_data: "/tmp/grida",
      home: "/Users/example",
      include_dev_network_hosts: true,
      allowed_network_hosts: ["tenant.example"],
    });

    expect(policy.network.allowed_domains).toContain("registry.npmjs.org");
    expect(policy.network.allowed_domains).toContain("github.com");
    expect(policy.network.allowed_domains).toContain("tenant.example");
    expect(policy.network.allow_local_binding).toBe(true);
    expect(explicitPolicy.network.allowed_domains).toEqual(
      policy.network.allowed_domains
    );
  });

  it("omits only the development-network baseline when explicitly disabled", () => {
    // A tenant-only policy must remain useful: opting out of daemon defaults
    // cannot discard host contributions or change their stable order.
    const policy = buildDaemonSandboxPolicy({
      user_data: "/tmp/grida",
      home: "/Users/example",
      include_dev_network_hosts: false,
      allowed_network_hosts: [
        "tenant.example",
        "*.tenant.example",
        "tenant.example",
      ],
    });

    expect(policy.network.allowed_domains).toEqual([
      "tenant.example",
      "*.tenant.example",
    ]);
    expect(policy.network.allowed_domains).not.toContain("registry.npmjs.org");
    expect(policy.network.allowed_domains).not.toContain("github.com");
  });

  it("permits an empty network allowlist when both sources are absent", () => {
    // `false` is an exact omission contract, not a request for replacement
    // defaults or a hidden unrestricted-network fallback.
    const policy = buildDaemonSandboxPolicy({
      user_data: "/tmp/grida",
      home: "/Users/example",
      include_dev_network_hosts: false,
    });

    expect(policy.network.allowed_domains).toEqual([]);
  });

  it("removes local-bind authority only when explicitly disabled", () => {
    const policy = buildDaemonSandboxPolicy({
      user_data: "/tmp/grida",
      home: "/Users/example",
      allow_local_binding: false,
      allowed_network_hosts: ["tenant.example"],
    });

    expect(policy.network.allow_local_binding).toBe(false);
    expect(policy.network.allowed_domains).toContain("registry.npmjs.org");
    expect(policy.network.allowed_domains).toContain("tenant.example");
  });
});
