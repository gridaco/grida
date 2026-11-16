import { describe, expect, it, vi } from "vitest";
import { NativeAgentPermissionModes } from "./native-agent-permission-mode";

const state = {
  sessionId: "chat",
  revision: 0,
  mode: "restricted",
  available: ["restricted", "full_access"],
};

describe("NativeAgentPermissionModes", () => {
  it("keeps authority in the native owner and binds updates to exact revision and request", async () => {
    const request = vi.fn<
      ConstructorParameters<typeof NativeAgentPermissionModes>[0]
    >(async () => ({
      ...state,
      revision: 1,
      mode: "full_access",
      requestId: "request",
    }));
    const modes = new NativeAgentPermissionModes(request, "/project");
    expect(await modes.update("chat", 0, "request", "full_access")).toEqual({
      ...state,
      revision: 1,
      mode: "full_access",
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      "_co.grida/session/permission-mode/update",
      {
        cwd: "/project",
        sessionId: "chat",
        expectedRevision: 0,
        requestId: "request",
        mode: "full_access",
      }
    );
  });

  it("keeps a committed selection successful if its receipt acknowledgment fails", async () => {
    const request = vi.fn<
      ConstructorParameters<typeof NativeAgentPermissionModes>[0]
    >(async (method) => {
      if (method.endsWith("/ack")) throw new Error("lost ack");
      return {
        ...state,
        revision: 1,
        mode: "full_access",
        requestId: "request",
      };
    });
    const modes = new NativeAgentPermissionModes(request, "/project");
    expect((await modes.update("chat", 0, "request", "full_access")).mode).toBe(
      "full_access"
    );
    expect(request).toHaveBeenLastCalledWith(
      "_co.grida/session/permission-mode/ack",
      { cwd: "/project", sessionId: "chat", requestId: "request" }
    );
  });

  it.each([
    { ...state, sessionId: "other" },
    { ...state, revision: -1 },
    { ...state, mode: "unknown" },
    { ...state, mode: "full_access", available: ["restricted"] },
    { ...state, available: ["restricted", "restricted"] },
  ])("refuses an invalid or foreign native state %#", async (value) => {
    const modes = new NativeAgentPermissionModes(async () => value, "/project");
    await expect(modes.inspect("chat")).rejects.toThrow("invalid_response");
  });

  it("refuses an update receipt belonging to another action", async () => {
    const modes = new NativeAgentPermissionModes(
      async () => ({ ...state, requestId: "other" }),
      "/project"
    );
    await expect(
      modes.update("chat", 0, "request", "restricted")
    ).rejects.toThrow("invalid_response");
  });
});
