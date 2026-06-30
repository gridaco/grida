import { describe, expect, it, vi } from "vitest";

// `workspace-media-protocol.ts` imports `protocol` from electron and the
// main-process sidecar client. We exercise only the pure URL parser, so thin
// mocks keep the module importable outside an Electron runtime.
vi.mock("electron", () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn<(schemes: unknown[]) => void>(),
    handle: vi.fn<(scheme: string, handler: unknown) => void>(),
  },
}));
vi.mock("./agent-sidecar-client", () => ({
  agentSidecarClient: {
    fetch: vi.fn<(path: string, init?: unknown) => Promise<Response>>(),
    AgentSidecarNotReadyError: class extends Error {},
  },
}));

import { parseWorkspaceMediaUrl } from "./workspace-media-protocol";

// The `grida-workspace://workspace/<workspaceId>/<relPath>` shape is the seam
// between the preload (which builds it) and this handler (which parses it).
// Containment is re-validated by the sidecar; these pins cover the parse +
// decode contract — especially that the workspaceId survives verbatim, which is
// WHY both ids live in the path (a host-carried id would be lowercased by
// Chromium's standard-URL canonicalization and stop matching the registry).
describe("parseWorkspaceMediaUrl (#924)", () => {
  it("parses workspaceId from the first path segment and joins the rest as relPath", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws123/dir/pic.png")
    ).toEqual({ workspaceId: "ws123", relPath: "dir/pic.png" });
  });

  it("preserves workspaceId case (path is not host-canonicalized)", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/AbCdEf/x.png")
    ).toEqual({ workspaceId: "AbCdEf", relPath: "x.png" });
  });

  it("percent-decodes each segment", () => {
    expect(
      parseWorkspaceMediaUrl(
        "grida-workspace://workspace/ws/My%20Folder/a%20b.png"
      )
    ).toEqual({ workspaceId: "ws", relPath: "My Folder/a b.png" });
  });

  it("rejects a foreign scheme", () => {
    expect(parseWorkspaceMediaUrl("file:///etc/passwd")).toBeNull();
    expect(parseWorkspaceMediaUrl("https://workspace/ws/x.png")).toBeNull();
  });

  it("rejects a non-`workspace` host or any userinfo/port", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://evil/ws/x.png")
    ).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace:8080/ws/x.png")
    ).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://u:p@workspace/ws/x.png")
    ).toBeNull();
  });

  it("rejects a missing relPath", () => {
    expect(parseWorkspaceMediaUrl("grida-workspace://workspace/ws")).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws/")
    ).toBeNull();
  });

  it("rejects an encoded null byte and a malformed escape", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws/a%00b.png")
    ).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws/a%zz.png")
    ).toBeNull();
  });

  it("returns null on an unparseable URL", () => {
    expect(parseWorkspaceMediaUrl("not a url")).toBeNull();
  });
});
