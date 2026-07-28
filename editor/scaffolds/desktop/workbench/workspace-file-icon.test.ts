import {
  DatabaseIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  GalleryVerticalEndIcon,
  ImageIcon,
  PackageIcon,
  PresentationIcon,
  ShapesIcon,
  SplineIcon,
  TextIcon,
  VideoIcon,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import { WorkspaceFileIcon } from "./workspace-file-icon";

describe("WorkspaceFileIcon", () => {
  it("maps every supported viewer family to one navigation icon", () => {
    expect(WorkspaceFileIcon.forPath("deck.canvas")).toBe(
      GalleryVerticalEndIcon
    );
    expect(WorkspaceFileIcon.forPath("art.svg")).toBe(SplineIcon);
    expect(WorkspaceFileIcon.forPath("photo.png")).toBe(ImageIcon);
    expect(WorkspaceFileIcon.forPath("clip.mp4")).toBe(VideoIcon);
    expect(WorkspaceFileIcon.forPath("README.md")).toBe(TextIcon);
    expect(WorkspaceFileIcon.forPath("app.tsx")).toBe(FileIcon);
  });

  it("maps unsupported binary families without changing viewer dispatch", () => {
    expect(WorkspaceFileIcon.forPath("export.zip")).toBe(FileArchiveIcon);
    expect(WorkspaceFileIcon.forPath("song.mp3")).toBe(FileAudioIcon);
    expect(WorkspaceFileIcon.forPath("brief.pdf")).toBe(FileTextIcon);
    expect(WorkspaceFileIcon.forPath("data.xlsx")).toBe(FileSpreadsheetIcon);
    expect(WorkspaceFileIcon.forPath("deck.pptx")).toBe(PresentationIcon);
    expect(WorkspaceFileIcon.forPath("font.woff2")).toBe(FileTypeIcon);
    expect(WorkspaceFileIcon.forPath("installer.dmg")).toBe(PackageIcon);
    expect(WorkspaceFileIcon.forPath("data.sqlite")).toBe(DatabaseIcon);
    expect(WorkspaceFileIcon.forPath("design.psd")).toBe(ShapesIcon);
    expect(WorkspaceFileIcon.forPath("unknown.bin")).toBe(FileIcon);
  });
});
