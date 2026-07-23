import {
  FileIcon,
  GalleryVerticalEndIcon,
  ImageIcon,
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
  const Icon = WorkspaceFileIcon.forKind(WorkspaceFileKind.of(relPath));
  return <Icon className={className} aria-hidden />;
}

export namespace WorkspaceFileIcon {
  export function forKind(kind: WorkspaceFileKind.Kind): LucideIcon {
    switch (kind) {
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
    }
  }
}
