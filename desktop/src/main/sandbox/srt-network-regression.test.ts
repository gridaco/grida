import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { describe, expect, it } from "vitest";

const describeMacOS = process.platform === "darwin" ? describe : describe.skip;

describeMacOS("sandbox-runtime macOS network profile", () => {
  it("keeps the production sidecar profile bind- and connect-free", async () => {
    await SandboxManager.initialize({
      network: {
        allowedDomains: [],
        deniedDomains: [],
        allowLocalBinding: false,
      },
      filesystem: {
        denyRead: [],
        allowRead: [],
        allowWrite: [],
        denyWrite: [],
      },
    });
    try {
      const wrapped = await SandboxManager.wrapWithSandbox("true");

      // srt <= 0.0.52 translated `allowLocalBinding` into a local-source
      // wildcard that admitted every remote destination. 0.0.65 narrows that
      // to remote loopback, but Desktop needs neither: main owns the listener
      // and transfers only accepted sockets as OS capabilities.
      expect(wrapped).toMatch(
        /\(allow network-outbound \(remote ip "localhost:\d+"\)\)/
      );
      expect(wrapped).not.toMatch(
        /\(allow network-outbound \(local ip "\*:\*"\)\)/
      );
      expect(wrapped).not.toMatch(
        /\(allow network-outbound \(remote ip "localhost:\*"\)\)/
      );
    } finally {
      await SandboxManager.reset();
    }
  });
});
