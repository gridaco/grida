import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import type { SvgEditor } from "@grida/svg-editor";
import type { CanvasBoard } from "../canvas/board-store";
import { EditorSelectionSurface } from "../shared/editor-selection-surface";

/** The virtual path a file window's live SVG is published at. */
export const CANVAS_PATH = "/canvas.svg" as const;

/** The active SVG or board document in a file window. */
export class DocumentSurfaceHost {
  private readonly surface = new EditorSelectionSurface(() => "document");
  readonly editorSelection = this.surface.selection;
  readonly subscribeToEditorSurfaces = this.surface.subscribe;

  readonly bindEditor = (editor: SvgEditor, path: string = CANVAS_PATH) =>
    this.surface.bindSvg("document", path, editor);

  readonly bindBoardSelection = (board: CanvasBoard) =>
    this.surface.bindDocument("document", {
      read: () => board.selectedDocument("/"),
      clear: () => board.selectFrame(null),
      subscribe: board.subscribe,
    });

  readEditorSurfaces(): NativeEditorSurfaceSnapshot {
    const selection = this.editorSelection.readSubject();
    const active = selection?.kind === "svg" ? selection.path : null;
    return {
      active,
      open: active ? [active] : [],
      truncated: false,
      ...(selection && { selection }),
    };
  }
}
