import type { Editor } from "./editor";
import type { EmbedCommand, EmbedSceneInfo } from "./embed-protocol";
import { isEmbedCommand } from "./embed-protocol";

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function scenesFromEditor(ed: Editor): EmbedSceneInfo[] {
  const state = ed.state;
  return state.document.scenes_ref.map((id) => {
    const n = state.document.nodes[id];
    const name = n && "name" in n && typeof n.name === "string" ? n.name : id;
    return { id, name };
  });
}

export interface EmbedBridgeOptions {
  /** Handler for `grida:load` command. */
  onFile?: (file: File) => void;
  /**
   * Optional transform applied to every node ID before it is emitted to the
   * host via postMessage. Use this to decode synthetic/internal IDs back to
   * the original source IDs (e.g. Figma node IDs).
   *
   * The transform receives a single Grida node ID and must return the ID
   * string that should appear in the outgoing event. Return the input
   * unchanged for IDs that need no mapping.
   */
  __dangerously_transform_node_id?: (id: string) => string;
}

/**
 * postMessage bridge between a Grida Canvas iframe and its host page.
 *
 * Subscribes to editor actions (not derived state) so it can:
 * - Suppress `selection-change` and `scene-change` during document resets
 * - Emit `document-load` after the reset is fully settled
 * - Guarantee correct event ordering
 *
 * ```ts
 * const bridge = new EmbedBridge(editor, { onFile });
 * bridge.notifyReady();
 * bridge.dispose();
 * ```
 */
export class EmbedBridge {
  private ed: Editor;
  private onFile?: (file: File) => void;
  private transformId: ((id: string) => string) | undefined;
  private messageHandler: (e: MessageEvent) => void;
  private unsubscribe: (() => void) | null = null;
  private readySent = false;

  /**
   * When true, selection-change and scene-change events are suppressed.
   * Set on `document/reset`, cleared after emitting `document-load`.
   */
  private loading = false;
  private prevSelection: string[] = [];
  private prevSceneId: string | undefined = undefined;

  constructor(ed: Editor, options: EmbedBridgeOptions = {}) {
    this.ed = ed;
    this.onFile = options.onFile;
    this.transformId = options.__dangerously_transform_node_id;

    this.prevSelection = ed.state.selection;
    this.prevSceneId = ed.state.scene_id;

    // Listen for commands from host.
    this.messageHandler = (e: MessageEvent) => {
      if (e.source === window) return;
      if (!isEmbedCommand(e.data)) return;
      this.handleCommand(e.data as EmbedCommand);
    };
    window.addEventListener("message", this.messageHandler);

    // Subscribe to editor actions.
    this.unsubscribe = ed.subscribe((_editor, action) => {
      this.onAction(action);
    }) as unknown as () => void;
  }

  /** Call once when WASM canvas is mounted. Posts `grida:ready`. */
  notifyReady(): void {
    if (this.readySent) return;
    this.readySent = true;
    this.post({ type: "grida:ready" });

    // Hook into the editor's image poll — emit unresolved refs to host.
    this.ed.onUnresolvedImages = (refs) => {
      this.post({ type: "grida:images-needed", refs });
    };
  }

  /** Remove all listeners and subscriptions. */
  dispose(): void {
    window.removeEventListener("message", this.messageHandler);
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.ed.onUnresolvedImages) {
      this.ed.onUnresolvedImages = null;
    }
  }

  // ---------------------------------------------------------------------------
  // ID mapping helpers
  // ---------------------------------------------------------------------------

  /** Map a single node ID through the optional transform. */
  private mapId(id: string): string {
    return this.transformId ? this.transformId(id) : id;
  }

  /** Map an array of node IDs through the optional transform (deduplicated). */
  private mapIds(ids: string[]): string[] {
    if (!this.transformId) return ids;
    return [...new Set(ids.map(this.transformId))];
  }

  /** Map scene info IDs through the optional transform. */
  private mapScenes(scenes: EmbedSceneInfo[]): EmbedSceneInfo[] {
    if (!this.transformId) return scenes;
    return scenes.map((s) => ({ ...s, id: this.transformId!(s.id) }));
  }

  // ---------------------------------------------------------------------------
  // Action handler — drives all outgoing events
  // ---------------------------------------------------------------------------

  private onAction(action: { type: string } | undefined): void {
    if (!action) return;
    const state = this.ed.state;

    // Document reset: suppress intermediate events, emit document-load.
    if (action.type === "document/reset") {
      this.loading = true;
      // Snapshot state after reset — these are the "settled" values.
      this.prevSelection = state.selection;
      this.prevSceneId = state.scene_id;
      // Use queueMicrotask so document-load fires after all synchronous
      // post-reset work (loadImages, etc.) completes in the same tick.
      queueMicrotask(() => {
        this.loading = false;
        this.post({
          type: "grida:document-load",
          scenes: this.mapScenes(scenesFromEditor(this.ed)),
        });
      });
      return;
    }

    // While loading, suppress all change events.
    if (this.loading) return;

    // Selection change.
    if (!arraysEqual(this.prevSelection, state.selection)) {
      this.prevSelection = state.selection;
      this.post({
        type: "grida:selection-change",
        selection: this.mapIds(state.selection),
      });
    }

    // Scene change.
    if (this.prevSceneId !== state.scene_id) {
      this.prevSceneId = state.scene_id;
      if (state.scene_id) {
        this.post({
          type: "grida:scene-change",
          sceneId: this.mapId(state.scene_id),
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Command handler — incoming from host
  // ---------------------------------------------------------------------------

  private handleCommand(cmd: EmbedCommand): void {
    switch (cmd.type) {
      case "grida:select":
        if (cmd.nodeIds.length === 0) {
          this.ed.commands.blur();
        } else {
          this.ed.commands.select(cmd.nodeIds, cmd.mode ?? "reset");
        }
        break;
      case "grida:load-scene":
        this.ed.commands.loadScene(cmd.sceneId);
        break;
      case "grida:fit":
        this.ed.camera.fit((cmd.selector ?? "*") as "*", {
          animate: cmd.animate,
        });
        break;
      case "grida:load":
        if (this.onFile) {
          const ext = cmd.format === "grida1" ? "grida1" : cmd.format;
          const file = new File([cmd.data], `file.${ext}`, {
            type: "application/octet-stream",
          });
          this.onFile(file);
        }
        break;
      case "grida:ping":
        this.post({
          type: "grida:pong",
          ready: this.readySent,
          scenes: this.mapScenes(scenesFromEditor(this.ed)),
          sceneId: this.ed.state.scene_id
            ? this.mapId(this.ed.state.scene_id)
            : undefined,
          selection: this.mapIds(this.ed.state.selection),
        });
        break;
      case "grida:images-resolve": {
        const surface = this.ed.wasmScene;
        if (!surface) break;
        for (const [rid, buf] of Object.entries(cmd.images)) {
          surface.resolveImage(rid, new Uint8Array(buf));
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  private post(event: Record<string, unknown>): void {
    window.parent.postMessage(event, "*");
  }
}
