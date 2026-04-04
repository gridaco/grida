/**
 * postMessage protocol for controlling a Grida Canvas instance from a host page.
 *
 * All messages are plain objects with a `type` field prefixed by `grida:`.
 * This file is the single source of truth — imported by both the iframe bridge
 * and the host-side SDK.
 *
 */

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
