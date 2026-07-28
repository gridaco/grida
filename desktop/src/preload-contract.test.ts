import fs from "node:fs";
import { describe, expect, it } from "vitest";

// GRIDA-SEC-004 / GRIDA-SEC-008 — renderer bridge source contract pins.
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

  it("forwards the native ChatGPT connect result without translating errors", () => {
    expect(preloadSource).toMatch(
      /chatgpt:\s*{\s*connect:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(IPC_CHANNELS\.CHATGPT_CONNECT\)/
    );
  });
});
