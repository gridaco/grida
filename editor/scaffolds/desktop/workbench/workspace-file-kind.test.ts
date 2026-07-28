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
    expect(WorkspaceFileKind.of("schema.graphql")).toBe("text");
    expect(WorkspaceFileKind.of("content.mdx")).toBe("text");
    expect(WorkspaceFileKind.of("Dockerfile")).toBe("text");
    expect(WorkspaceFileKind.of("README")).toBe("text");
    expect(WorkspaceFileKind.of("export.ZIP")).toBe("binary");
    expect(WorkspaceFileKind.of(".DS_Store")).toBe("binary");
    expect(WorkspaceFileKind.of("unknown.custom")).toBe("binary");
  });

  it("classifies unsupported binaries only for labels and icons", () => {
    expect(WorkspaceFileKind.binaryFamily("export.ZIP")).toBe("archive");
    expect(WorkspaceFileKind.binaryFamily("brief.pdf")).toBe("document");
    expect(WorkspaceFileKind.binaryFamily("deck.pptx")).toBe("presentation");
    expect(WorkspaceFileKind.binaryFamily("design.psd")).toBe("design");
    expect(WorkspaceFileKind.binaryFamily("unknown.bin")).toBe("binary");
    expect(WorkspaceFileKind.label("export.ZIP")).toBe("Archive");
    expect(WorkspaceFileKind.label("unknown.bin")).toBe("File");
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
    expect(WorkspaceFileKind.mimeType("export.ZIP")).toBe("application/zip");
    expect(WorkspaceFileKind.mimeType("unknown.bin")).toBe(
      "application/octet-stream"
    );
  });
});
