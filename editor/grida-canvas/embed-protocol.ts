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
      format: "fig" | "json" | "json.gz" | "zip";
    };

// ---------------------------------------------------------------------------
// Iframe → Host (events)
// ---------------------------------------------------------------------------

export interface EmbedSceneInfo {
  id: string;
  name: string;
}

export type EmbedEvent =
  | { type: "grida:ready"; scenes: EmbedSceneInfo[] }
  | { type: "grida:selection-change"; selection: string[] }
  | { type: "grida:scene-change"; sceneId: string };

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
