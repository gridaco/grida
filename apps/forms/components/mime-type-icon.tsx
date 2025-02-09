import { wellkown } from "@/utils/mimetype";
import {
  FileIcon,
  FolderIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
  FileTypeIcon,
  FileSpreadsheetIcon,
  PresentationIcon,
} from "lucide-react";

export function MimeTypeIcon({
  type,
  className,
}: {
  type: string | ("folder" & {});
  className?: string;
}) {
  if (type === "folder") return <FolderIcon className={className} />;
  const w = wellkown(type);
  if (w) {
    switch (w) {
      case "image":
        return <ImageIcon className={className} />;
      case "audio":
        return <MusicIcon className={className} />;
      case "video":
        return <VideoIcon className={className} />;
      case "font":
        return <FileTypeIcon className={className} />;
      case "text":
        return <FileTextIcon className={className} />;
      case "pdf":
        return <FileTextIcon className={className} />;
      case "sheet":
        return <FileSpreadsheetIcon className={className} />;
      case "document":
        return <FileTextIcon className={className} />;
      case "presentation":
        return <PresentationIcon className={className} />;
      default:
        return <FileIcon className={className} />;
    }
  }

  return <FileIcon className={className} />;
}
