/**
 * postMessage protocol for controlling a Grida Canvas instance from a host page.
 *
 * All messages are plain objects with a `type` field prefixed by `grida:`.
 * This file is the single source of truth — imported by both the iframe bridge
 * and the host-side SDK.
 *
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Export constraint applied when exporting a node as an image.
 *
 * Mirrors `@grida/canvas-wasm` `types.ExportConstraints` so the protocol
 * file stays dependency-free.
 */
export type EmbedExportConstraints =
  | { type: "none" }
  | { type: "scale"; value: number }
  | { type: "scale-to-fit-width"; value: number }
  | { type: "scale-to-fit-height"; value: number };

/** Export format descriptor. Mirrors `@grida/canvas-wasm` `types.ExportAs`. */
export type EmbedExportAs =
  | { format: "PNG"; constraints: EmbedExportConstraints }
  | {
      format: "JPEG";
      constraints: EmbedExportConstraints;
      quality?: number;
    }
  | {
      format: "WEBP";
      constraints: EmbedExportConstraints;
      quality?: number;
    }
  | { format: "BMP"; constraints: EmbedExportConstraints }
  | { format: "PDF" }
  | { format: "SVG" };

// ---------------------------------------------------------------------------
// Host → Iframe (commands)
// ---------------------------------------------------------------------------

export type EmbedCommand =
  | {
      type: "grida:select";
      nodeIds: string[];
      mode?: "reset" | "add" | "toggle";
    }
  | { type: "grida:load-scene"; sceneId: string }
  | { type: "grida:fit"; selector?: string; animate?: boolean }
  | {
      /** Load a file into the viewer via postMessage (bypasses CORS). */
      type: "grida:load";
      /** Raw file contents. */
      data: ArrayBuffer;
      /** File format. */
      format: "fig" | "json" | "json.gz" | "zip" | "grida" | "grida1";
    }
  | {
      /** Request a state snapshot. Iframe replies with `grida:pong`. */
      type: "grida:ping";
    }
  | {
      /** Resolve image refs requested via `grida:images-needed` by providing their bytes for refs requested via `grida:images-needed`. */
      type: "grida:images-resolve";
      images: Record<string, ArrayBuffer>;
    }
  | {
      /**
       * Export a node as an image, PDF, or SVG.
       * Iframe replies with `grida:export-result` carrying the same `requestId`.
       */
      type: "grida:export";
      /** Caller-chosen ID to correlate request and response. */
      requestId: string;
      nodeId: string;
      format: EmbedExportAs;
    }
  | {
      /**
       * Get the structural ancestry path from the scene root to a node.
       * Iframe replies with `grida:node-id-path-result` carrying the same `requestId`.
       */
      type: "grida:get-node-id-path";
      /** Caller-chosen ID to correlate request and response. */
      requestId: string;
      nodeId: string;
    };

// ---------------------------------------------------------------------------
// Iframe → Host (events)
// ---------------------------------------------------------------------------

export interface EmbedSceneInfo {
  id: string;
  name: string;
}

export type EmbedEvent =
  | {
      /** Fired once when the WASM canvas is mounted and the iframe accepts commands. */
      type: "grida:ready";
    }
  | {
      /** Fired each time a document is loaded (via ?file=, grida:load, or reset). */
      type: "grida:document-load";
      scenes: EmbedSceneInfo[];
    }
  | { type: "grida:selection-change"; selection: string[] }
  | { type: "grida:scene-change"; sceneId: string }
  | {
      /** Reply to `grida:ping`. Full state snapshot for sync. */
      type: "grida:pong";
      ready: boolean;
      scenes: EmbedSceneInfo[];
      sceneId: string | undefined;
      selection: string[];
    }
  | {
      /** Emitted when the renderer needs image bytes it doesn't have. */
      type: "grida:images-needed";
      refs: string[];
    }
  | {
      /** Reply to `grida:export`. Carries the exported bytes (or null on failure). */
      type: "grida:export-result";
      requestId: string;
      /** Exported bytes. `null` if the node was not found or export failed. */
      data: ArrayBuffer | null;
      /** The format that was actually produced (e.g. "PNG", "SVG"). */
      format: EmbedExportAs["format"];
    }
  | {
      /** Reply to `grida:get-node-id-path`. */
      type: "grida:node-id-path-result";
      requestId: string;
      /** Ancestry path `[root, ..., parent, nodeId]`, or `null` if the node doesn't exist. */
      path: string[] | null;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isEmbedCommand(data: unknown): data is EmbedCommand {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("grida:")
  );
}

export function isEmbedEvent(data: unknown): data is EmbedEvent {
  return isEmbedCommand(data);
}
