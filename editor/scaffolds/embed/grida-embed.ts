/**
 * Host-side SDK for controlling a Grida embed iframe.
 *
 * Usage:
 * ```ts
 * const iframe = document.querySelector("iframe");
 * const embed = new GridaEmbed(iframe);
 *
 * embed.on("ready", () => {
 *   console.log("Viewer ready");
 * });
 *
 * embed.on("document-load", ({ scenes }) => {
 *   console.log("Scenes:", scenes);
 * });
 *
 * embed.on("selection-change", ({ selection }) => {
 *   console.log("Selected:", selection);
 * });
 *
 * // Cleanup when done
 * embed.dispose();
 * ```
 */

import type {
  EmbedCommand,
  EmbedEvent,
  EmbedExportAs,
  EmbedSceneInfo,
} from "@/grida-canvas/embed-protocol";

// ---------------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------------

type EmbedEventMap = {
  ready: {};
  "document-load": { scenes: EmbedSceneInfo[] };
  "selection-change": { selection: string[] };
  "scene-change": { sceneId: string };
  "images-needed": { refs: string[] };
  pong: {
    ready: boolean;
    scenes: EmbedSceneInfo[];
    sceneId: string | undefined;
    selection: string[];
  };
  "export-result": {
    requestId: string;
    data: ArrayBuffer | null;
    format: string;
  };
  "node-id-path-result": {
    requestId: string;
    path: string[] | null;
  };
};

type EmbedEventType = keyof EmbedEventMap;

// Map from short event name to wire type
const EVENT_TYPE_MAP: Record<EmbedEventType, EmbedEvent["type"]> = {
  ready: "grida:ready",
  "document-load": "grida:document-load",
  "selection-change": "grida:selection-change",
  "scene-change": "grida:scene-change",
  "images-needed": "grida:images-needed",
  pong: "grida:pong",
  "export-result": "grida:export-result",
  "node-id-path-result": "grida:node-id-path-result",
};

// ---------------------------------------------------------------------------
// SDK
// ---------------------------------------------------------------------------

export class GridaEmbed {
  private iframe: HTMLIFrameElement;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private ready = false;
  private queue: EmbedCommand[] = [];
  private handleMessage: (e: MessageEvent) => void;
  private nextRequestId = 0;

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;

    this.handleMessage = (e: MessageEvent) => {
      // Only accept messages from our iframe.
      if (e.source !== iframe.contentWindow) return;

      const data = e.data;
      if (
        typeof data !== "object" ||
        data === null ||
        typeof data.type !== "string" ||
        !data.type.startsWith("grida:")
      ) {
        return;
      }

      const event = data as EmbedEvent;

      if (event.type === "grida:ready") {
        this.ready = true;
        this.flush();
      }

      // Dispatch to listeners.
      for (const [name, wireType] of Object.entries(EVENT_TYPE_MAP)) {
        if (event.type === wireType) {
          const cbs = this.listeners.get(name);
          if (cbs) {
            // Strip the `type` field — listeners get the payload only.
            const { type: _, ...payload } = event;
            for (const cb of cbs) cb(payload);
          }
        }
      }
    };

    window.addEventListener("message", this.handleMessage);
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  select(nodeIds: string[], mode?: "reset" | "add" | "toggle"): void {
    this.send({ type: "grida:select", nodeIds, mode });
  }

  loadScene(sceneId: string): void {
    this.send({ type: "grida:load-scene", sceneId });
  }

  fit(options?: { selector?: string; animate?: boolean }): void {
    this.send({ type: "grida:fit", ...options });
  }

  /**
   * Send a ping to the iframe. It replies with a `pong` event containing
   * the full current state. Useful to verify connectivity or re-sync
   * after the host may have missed events.
   *
   * Bypasses the ready queue — can be called at any time.
   */
  ping(): void {
    this.iframe.contentWindow?.postMessage({ type: "grida:ping" }, "*");
  }

  /**
   * Resolve image refs requested via the `images-needed` event by providing their bytes.
   *
   * @param images - Map of RID to raw image bytes.
   */
  resolveImages(images: Record<string, ArrayBuffer>): void {
    this.send({ type: "grida:images-resolve", images });
  }

  /**
   * Load a file into the viewer via postMessage.
   *
   * Useful when the file is on localhost or otherwise inaccessible to the
   * hosted embed due to CORS. The host reads the file and sends the raw
   * bytes — no network request from the iframe.
   *
   * @param data - Raw file contents (ArrayBuffer, Uint8Array, or Blob).
   * @param format - File format.
   */
  async load(
    data: ArrayBuffer | Uint8Array | Blob,
    format: "fig" | "json" | "json.gz" | "zip" | "grida" | "grida1"
  ): Promise<void> {
    let buf: ArrayBuffer;
    if (data instanceof Blob) {
      buf = await data.arrayBuffer();
    } else if (data instanceof Uint8Array) {
      buf = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      ) as ArrayBuffer;
    } else {
      buf = data;
    }
    this.send({ type: "grida:load", data: buf, format });
  }

  /**
   * Export a single node as an image, PDF, or SVG.
   *
   * Returns the raw exported bytes, or `null` if the node was not found or
   * the export failed.
   *
   * @param nodeId - The node to export.
   * @param format - Export format descriptor (PNG, JPEG, WEBP, BMP, PDF, SVG).
   * @param requestId - Optional caller-chosen ID for correlating the response.
   *                    Auto-generated when omitted.
   */
  exportNode(
    nodeId: string,
    format: EmbedExportAs,
    requestId?: string,
    timeoutMs = 30_000
  ): Promise<ArrayBuffer | null> {
    const rid = requestId ?? this.generateRequestId();
    return new Promise<ArrayBuffer | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`exportNode timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const unsub = this.on("export-result", (evt) => {
        if (evt.requestId !== rid) return;
        clearTimeout(timer);
        unsub();
        resolve(evt.data);
      });
      this.send({ type: "grida:export", requestId: rid, nodeId, format });
    });
  }

  /**
   * Get the structural ancestry path from the scene root to a node.
   *
   * Returns an array `[root, ..., parent, nodeId]`, or `null` if the node
   * does not exist in the current scene.
   *
   * @param nodeId - The target node.
   * @param requestId - Optional caller-chosen ID for correlating the response.
   *                    Auto-generated when omitted.
   */
  getNodeIdPath(
    nodeId: string,
    requestId?: string,
    timeoutMs = 10_000
  ): Promise<string[] | null> {
    const rid = requestId ?? this.generateRequestId();
    return new Promise<string[] | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`getNodeIdPath timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const unsub = this.on("node-id-path-result", (evt) => {
        if (evt.requestId !== rid) return;
        clearTimeout(timer);
        unsub();
        resolve(evt.path);
      });
      this.send({
        type: "grida:get-node-id-path",
        requestId: rid,
        nodeId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  on<K extends EmbedEventType>(
    event: K,
    cb: (data: EmbedEventMap[K]) => void
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as (data: unknown) => void);
    return () => set!.delete(cb as (data: unknown) => void);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  dispose(): void {
    window.removeEventListener("message", this.handleMessage);
    this.listeners.clear();
    this.queue.length = 0;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private generateRequestId(): string {
    return `__embed_${++this.nextRequestId}`;
  }

  private send(cmd: EmbedCommand): void {
    if (!this.ready) {
      this.queue.push(cmd);
      return;
    }
    this.iframe.contentWindow?.postMessage(cmd, "*");
  }

  private flush(): void {
    for (const cmd of this.queue) {
      this.iframe.contentWindow?.postMessage(cmd, "*");
    }
    this.queue.length = 0;
  }
}
