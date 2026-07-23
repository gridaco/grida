import { describe, expect, it } from "vitest";
import { WorkspaceFileKind } from "./workspace-file-kind";

describe("WorkspaceFileKind", () => {
  it("matches the workbench's semantic editor families", () => {
    expect(WorkspaceFileKind.of("Deck.CANVAS")).toBe("canvas");
    expect(WorkspaceFileKind.of("art.svg")).toBe("svg");
    expect(WorkspaceFileKind.of("photo.avif")).toBe("image");
    expect(WorkspaceFileKind.of("clip.webm")).toBe("video");
    expect(WorkspaceFileKind.of("notes.markdown")).toBe("markdown");
    expect(WorkspaceFileKind.of(".env")).toBe("text");
    expect(WorkspaceFileKind.of("src/app.tsx")).toBe("text");
  });

  it("provides stable display metadata and base64 fallback MIME types", () => {
    expect(WorkspaceFileKind.filename("assets/hero image.webp")).toBe(
      "hero image.webp"
    );
    expect(WorkspaceFileKind.parentPath("assets/hero image.webp")).toBe(
      "assets"
    );
    expect(WorkspaceFileKind.parentPath("README.md")).toBeNull();
    expect(WorkspaceFileKind.mimeType("A.JPEG")).toBe("image/jpeg");
    expect(WorkspaceFileKind.mimeType("unknown.bin")).toBe(
      "application/octet-stream"
    );
  });
});
