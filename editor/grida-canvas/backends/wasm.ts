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
    const node_id = this.surface.getNodeIdFromPoint(point[0], point[1]);
    return node_id ? [node_id] : [];
  }
  getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    return [];
  }
  getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null {
    return null;
  }
  getNodeIdsFromPointerEvent(event: {
    clientX: number;
    clientY: number;
  }): string[] {
    return [];
  }
}
