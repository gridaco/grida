import { dotcanvas } from "dotcanvas";

/**
 * The workbench's path-derived file family.
 *
 * One classifier drives both editor dispatch and tab-preview chrome so the two
 * surfaces cannot drift into disagreeing about the same path.
 */
export namespace WorkspaceFileKind {
  export type Kind = "canvas" | "svg" | "image" | "video" | "markdown" | "text";

  const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

  const IMAGE_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".avif",
    ".bmp",
    ".ico",
    ".tiff",
    ".tif",
  ]);

  const VIDEO_EXTENSIONS = new Set([
    ".mp4",
    ".m4v",
    ".webm",
    ".mov",
    ".ogv",
    ".ogg",
    ".mpg",
    ".mpeg",
    ".avi",
    ".mkv",
    ".3gp",
    ".3g2",
  ]);

  const MIME_BY_EXTENSION: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogv": "video/ogg",
    ".ogg": "video/ogg",
    ".mpg": "video/mpeg",
    ".mpeg": "video/mpeg",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".3gp": "video/3gpp",
    ".3g2": "video/3gpp2",
  };

  export function of(relPath: string): Kind {
    const ext = extension(relPath);
    if (ext === dotcanvas.BUNDLE_EXTENSION) return "canvas";
    if (ext === ".svg") return "svg";
    if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    return "text";
  }

  export function extension(relPath: string): string {
    const name = filename(relPath);
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return "";
    return name.slice(dot).toLowerCase();
  }

  export function filename(relPath: string): string {
    return relPath.split("/").pop() ?? relPath;
  }

  export function parentPath(relPath: string): string | null {
    const parts = relPath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
  }

  export function typeLabel(kind: Kind): string {
    switch (kind) {
      case "canvas":
        return "Canvas";
      case "svg":
        return "SVG";
      case "image":
        return "Image";
      case "video":
        return "Video";
      case "markdown":
        return "Markdown";
      case "text":
        return "Text";
    }
  }

  export function mimeType(relPath: string): string {
    return MIME_BY_EXTENSION[extension(relPath)] ?? "application/octet-stream";
  }
}
