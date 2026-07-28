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
  type LucideIcon,
  VideoIcon,
} from "lucide-react";
import { WorkspaceFileKind } from "./workspace-file-kind";

/**
 * The shared icon for a workspace path in navigation chrome.
 *
 * The map follows the workbench's supported viewer families. Unknown and
 * generic text files deliberately keep the neutral file icon.
 */
export function WorkspaceFileIcon({
  relPath,
  className,
}: {
  relPath: string;
  className?: string;
}) {
  const Icon = WorkspaceFileIcon.forPath(relPath);
  return <Icon className={className} aria-hidden />;
}

export namespace WorkspaceFileIcon {
  export function forPath(relPath: string): LucideIcon {
    switch (WorkspaceFileKind.of(relPath)) {
      case "canvas":
        return GalleryVerticalEndIcon;
      case "svg":
        return SplineIcon;
      case "image":
        return ImageIcon;
      case "video":
        return VideoIcon;
      case "markdown":
        return TextIcon;
      case "text":
        return FileIcon;
      case "binary":
        return forBinaryFamily(WorkspaceFileKind.binaryFamily(relPath));
    }
  }

  function forBinaryFamily(family: WorkspaceFileKind.BinaryFamily): LucideIcon {
    switch (family) {
      case "archive":
        return FileArchiveIcon;
      case "audio":
        return FileAudioIcon;
      case "document":
        return FileTextIcon;
      case "spreadsheet":
        return FileSpreadsheetIcon;
      case "presentation":
        return PresentationIcon;
      case "font":
        return FileTypeIcon;
      case "package":
        return PackageIcon;
      case "database":
        return DatabaseIcon;
      case "design":
        return ShapesIcon;
      case "binary":
        return FileIcon;
    }
  }
}
