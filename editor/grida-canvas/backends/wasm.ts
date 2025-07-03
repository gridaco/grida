import cmath from "@grida/cmath";
import type { editor } from "..";
import type { Editor } from "../editor";
import type { Grida2D } from "@grida/canvas-wasm";

export class CanvasWasmGeometryQuery
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {
    //
  }

  getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    return this.surface.getNodeIdsFromPoint(point[0], point[1]);
  }

  getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    return this.surface.getNodeIdsFromEnvelope(envelope);
  }

  getNodeIdsFromPointerEvent(event: {
    clientX: number;
    clientY: number;
  }): string[] {
    const p = this.editor.clientPointToCanvasPoint([
      event.clientX,
      event.clientY,
    ]);
    return this.getNodeIdsFromPoint(p);
  }

  getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null {
    return null;
  }
}
