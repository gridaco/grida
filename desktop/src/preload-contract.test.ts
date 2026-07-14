import fs from "node:fs";
import { describe, expect, it } from "vitest";

const preloadSource = fs.readFileSync(
  new URL("./preload.ts", import.meta.url),
  "utf8"
);

describe("Desktop preload agent seam", () => {
  it("delegates AgentHost HTTP routes to AgentTransport.Client", () => {
    expect(preloadSource).toContain("new AgentTransport.Client");
    expect(preloadSource).not.toContain('"/agent/run"');
    expect(preloadSource).not.toContain('"/secrets/has"');
    expect(preloadSource).not.toContain('"/sessions"');
    expect(preloadSource).not.toContain('"/workspaces/list"');
  });

  it("exposes a versioned Electron-specific bridge protocol", () => {
    expect(preloadSource).toContain("protocol: DESKTOP_BRIDGE_PROTOCOL");
    expect(preloadSource).toContain("native:");
    expect(preloadSource).toContain("scratch_seed_base64: true");
    expect(preloadSource).not.toContain("agentServer:");
  });
});
