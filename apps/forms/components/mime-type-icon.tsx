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

type WellknownMediaType =
  | "audio"
  | "image"
  | "font"
  | "text"
  | "video"
  | "pdf"
  | "sheet"
  | "document"
  | "presentation";
function wellkown(type: string): WellknownMediaType | undefined {
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("font/")) return "font";
  if (type.startsWith("text/")) return "text";
  if (type.startsWith("video/")) return "video";
  if (type.includes("pdf")) return "pdf";
  if (type.includes("sheet")) return "sheet";
  if (type.includes("presentation")) return "presentation";
  if (type.includes("document")) return "document";
}

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
