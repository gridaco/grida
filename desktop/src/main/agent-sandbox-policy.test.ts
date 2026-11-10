// GRIDA-SEC-014 — explicit provider-root forwarding and host isolation.
import { describe, expect, it } from "vitest";
import { DesktopAgentSandboxPolicy } from "./agent-sandbox-policy";

describe("DesktopAgentSandboxPolicy", () => {
  it("is socketless and gives the sidecar tree no direct Internet hosts", () => {
    const policy = DesktopAgentSandboxPolicy.build({
      userData: "/Users/test/.grida/agent",
      providerRoot: "/isolated-grida/providers",
      mediaRoot: "/Users/test/Library/Application Support/Grida/Media",
      home: "/Users/test",
      ggHost: "grida.co",
    });

    expect(policy.filesystem.allow_read).toContain("/isolated-grida/providers");
    expect(policy.filesystem.allow_write).toContain(
      "/isolated-grida/providers"
    );
    expect(policy.network.allow_local_binding).toBe(false);
    expect(policy.network.allowed_domains).toEqual([]);
    expect(policy.filesystem.allow_read).toContain(
      "/Users/test/Library/Application Support/Grida/Media"
    );
    expect(policy.filesystem.allow_write).toContain(
      "/Users/test/Library/Application Support/Grida/Media"
    );
  });

  it("keeps the native browser profile outside retained sidecar custody", () => {
    const desktopStateRoot = "/isolated-grida/browser";
    const policy = DesktopAgentSandboxPolicy.build({
      userData: "/isolated-grida/agent",
      mediaRoot: "/isolated-grida/media",
      desktopStateRoot,
      home: "/Users/test",
      ggHost: "grida.co",
    });
    expect(policy.filesystem.deny_read).toContain(desktopStateRoot);
    expect(policy.filesystem.deny_write).toContain(desktopStateRoot);
    expect(policy.filesystem.allow_write).not.toContain(desktopStateRoot);
  });

  it("adds literal legacy-state read and write denials only when supplied", () => {
    const launch = {
      userData: "/isolated/agent",
      mediaRoot: "/isolated/media",
      home: "/Users/test",
      ggHost: "grida.co",
    };
    const root = "/Users/test/.grida";
    const ordinary = DesktopAgentSandboxPolicy.build(launch);
    const preview = DesktopAgentSandboxPolicy.build({
      ...launch,
      legacyStateRoots: [root],
    });
    expect(ordinary.filesystem.deny_read).not.toContain(root);
    expect(ordinary.filesystem.deny_write).not.toContain(root);
    expect(preview.filesystem.deny_read).toContain(root);
    expect(preview.filesystem.deny_write).toContain(root);
    expect(() =>
      DesktopAgentSandboxPolicy.build({
        ...launch,
        legacyStateRoots: [root + "[old]"],
      })
    ).toThrow("native_desktop_legacy_state_path_not_literal");
  });
});
