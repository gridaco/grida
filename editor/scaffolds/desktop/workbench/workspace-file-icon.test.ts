import {
  FileIcon,
  GalleryVerticalEndIcon,
  ImageIcon,
  SplineIcon,
  TextIcon,
  VideoIcon,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import { WorkspaceFileIcon } from "./workspace-file-icon";

describe("WorkspaceFileIcon", () => {
  it("maps every supported viewer family to one navigation icon", () => {
    expect(WorkspaceFileIcon.forKind("canvas")).toBe(GalleryVerticalEndIcon);
    expect(WorkspaceFileIcon.forKind("svg")).toBe(SplineIcon);
    expect(WorkspaceFileIcon.forKind("image")).toBe(ImageIcon);
    expect(WorkspaceFileIcon.forKind("video")).toBe(VideoIcon);
    expect(WorkspaceFileIcon.forKind("markdown")).toBe(TextIcon);
    expect(WorkspaceFileIcon.forKind("text")).toBe(FileIcon);
  });
});
