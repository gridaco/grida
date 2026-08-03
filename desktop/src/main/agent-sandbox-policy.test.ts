import { describe, expect, it } from "vitest";
import { DesktopAgentSandboxPolicy } from "./agent-sandbox-policy";

describe("DesktopAgentSandboxPolicy", () => {
  it("is socketless and gives the sidecar tree no direct Internet hosts", () => {
    const policy = DesktopAgentSandboxPolicy.build({
      userData: "/Users/test/.grida/agent",
      mediaRoot: "/Users/test/Library/Application Support/Grida/Media",
      home: "/Users/test",
      ggHost: "grida.co",
    });

    expect(policy.network.allow_local_binding).toBe(false);
    expect(policy.network.allowed_domains).toEqual([]);
    expect(policy.filesystem.allow_read).toContain(
      "/Users/test/Library/Application Support/Grida/Media"
    );
    expect(policy.filesystem.allow_write).toContain(
      "/Users/test/Library/Application Support/Grida/Media"
    );
  });
});
