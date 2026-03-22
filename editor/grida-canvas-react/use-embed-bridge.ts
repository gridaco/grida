"use client";

import { useEffect, useRef } from "react";
import type { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas";
import type { EmbedCommand, EmbedSceneInfo } from "@/grida-canvas/embed-protocol";
import { isEmbedCommand } from "@/grida-canvas/embed-protocol";

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function scenesFromState(state: editor.state.IEditorState): EmbedSceneInfo[] {
  return state.document.scenes_ref.map((id) => {
    const n = state.document.nodes[id];
    const name =
      n && "name" in n && typeof n.name === "string" ? n.name : id;
    return { id, name };
  });
}

/**
 * Opt-in postMessage bridge between a Grida Canvas iframe and its host page.
 *
 * - Listens for {@link EmbedCommand} messages and forwards them to the editor.
 * - Subscribes to editor state and posts events to `window.parent`.
 * - Posts `grida:ready` once `documentLoaded` becomes true.
 *
 * Can be used in any surface — embed, playground, workbench — just call the hook.
 */
export interface EmbedBridgeOptions {
  documentLoaded: boolean;
  /** Handler for `grida:load` — receives a File constructed from the posted ArrayBuffer. */
  onFile?: (file: File) => void;
}

export function useEmbedBridge(
  ed: Editor,
  { documentLoaded, onFile }: EmbedBridgeOptions
): void {
  const readySent = useRef(false);

  // Post grida:ready once document is loaded.
  useEffect(() => {
    if (!documentLoaded || readySent.current) return;
    readySent.current = true;
    window.parent.postMessage(
      {
        type: "grida:ready",
        scenes: scenesFromState(ed.state),
      },
      "*"
    );
  }, [documentLoaded, ed]);

  // Listen for commands from host.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!isEmbedCommand(e.data)) return;
      const cmd = e.data as EmbedCommand;
      switch (cmd.type) {
        case "grida:select":
          if (cmd.nodeIds.length === 0) {
            ed.commands.blur();
          } else {
            ed.commands.select(cmd.nodeIds, cmd.mode ?? "reset");
          }
          break;
        case "grida:load-scene":
          ed.commands.loadScene(cmd.sceneId);
          break;
        case "grida:fit":
          ed.camera.fit((cmd.selector ?? "*") as "*", {
            animate: cmd.animate,
          });
          break;
        case "grida:load":
          if (onFile) {
            const file = new File([cmd.data], `file.${cmd.format}`, {
              type: "application/octet-stream",
            });
            onFile(file);
          }
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [ed, onFile]);

  // Emit selection-change and scene-change events.
  useEffect(() => {
    let prevSelection = ed.state.selection;
    let prevSceneId = ed.state.scene_id;

    const unsub = ed.subscribe(() => {
      const state = ed.state;

      if (!arraysEqual(prevSelection, state.selection)) {
        prevSelection = state.selection;
        window.parent.postMessage(
          { type: "grida:selection-change", selection: state.selection },
          "*"
        );
      }

      if (prevSceneId !== state.scene_id) {
        prevSceneId = state.scene_id;
        if (state.scene_id) {
          window.parent.postMessage(
            { type: "grida:scene-change", sceneId: state.scene_id },
            "*"
          );
        }
      }
    });
    return () => { unsub(); };
  }, [ed]);
}
