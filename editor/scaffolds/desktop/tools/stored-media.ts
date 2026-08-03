import type { DesktopMediaReadResult, MediaItem } from "@/lib/desktop/bridge";
import { AudioCompatibility } from "../media-formats/audio-compatibility";
import {
  DesktopMediaTool,
  type DesktopMediaToolId,
} from "./media-tool-registry";

export type StoredMediaMode = "image" | "video" | "3d" | "audio";

export type StoredMediaPreview = Readonly<{
  item: MediaItem;
  file: File;
  mode: StoredMediaMode;
}>;

/** Format-oriented adaptation from the neutral host store to Tools viewers. */
export namespace StoredMedia {
  export function mode(
    item: Pick<MediaItem, "file_name" | "media_type">
  ): StoredMediaMode | null {
    if (item.media_type.startsWith("image/")) return "image";
    if (item.media_type.startsWith("video/")) return "video";
    if (item.media_type === "model/gltf-binary") return "3d";
    if (
      item.media_type.startsWith("audio/") &&
      AudioCompatibility.infer({
        name: item.file_name,
        type: item.media_type,
      }).tier !== "unsupported"
    ) {
      return "audio";
    }
    return null;
  }

  export function isSupported(item: MediaItem): boolean {
    return mode(item) !== null;
  }

  export function preview(result: DesktopMediaReadResult): StoredMediaPreview {
    const resolvedMode = mode(result.item);
    if (!resolvedMode) {
      throw new Error("This saved format does not have a Tools viewer.");
    }
    return {
      item: result.item,
      mode: resolvedMode,
      file: new File([result.bytes], result.item.file_name, {
        type: result.item.media_type,
      }),
    };
  }

  export function href(item: MediaItem): string {
    const resolvedMode = mode(item);
    if (!resolvedMode) {
      throw new Error("This saved format does not have a Tools viewer.");
    }
    const toolId = viewerToolId(resolvedMode);
    return `${DesktopMediaTool.href(toolId)}&item=${encodeURIComponent(item.id)}`;
  }

  export function viewerToolId(
    resolvedMode: StoredMediaMode
  ): DesktopMediaToolId {
    switch (resolvedMode) {
      case "image":
        return "image-viewer";
      case "video":
        return "video-viewer";
      case "3d":
        return "3d-viewer";
      case "audio":
        return "audio-player";
    }
  }

  export function formatLabel(item: MediaItem): string {
    switch (mode(item)) {
      case "image":
        return imageFormatLabel(item.media_type);
      case "video":
        return videoFormatLabel(item.media_type);
      case "3d":
        return "GLB";
      case "audio":
        return item.media_type === "audio/mpeg" ? "MP3" : "Audio";
      case null:
        return item.media_type;
    }
  }
}

function imageFormatLabel(mediaType: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return "JPEG";
    case "image/svg+xml":
      return "SVG";
    default:
      return mediaType.slice("image/".length).toUpperCase();
  }
}

function videoFormatLabel(mediaType: string): string {
  switch (mediaType) {
    case "video/quicktime":
      return "MOV";
    case "video/x-matroska":
      return "MKV";
    case "video/x-msvideo":
      return "AVI";
    default:
      return mediaType.slice("video/".length).toUpperCase();
  }
}
