export type WellknownMediaType =
  | "audio"
  | "image"
  | "font"
  | "text"
  | "video"
  | "pdf"
  | "sheet"
  | "document"
  | "presentation"
  | "zip";

export function wellkown(type: string): WellknownMediaType | undefined {
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("font/")) return "font";
  if (type.startsWith("text/")) return "text";
  if (type.startsWith("video/")) return "video";
  if (type.includes("pdf")) return "pdf";
  if (type.includes("sheet")) return "sheet";
  if (type.includes("presentation")) return "presentation";
  if (type.includes("document")) return "document";
  if (type.includes("zip")) return "zip";
}
