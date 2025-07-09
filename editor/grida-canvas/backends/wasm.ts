import cmath from "@grida/cmath";
import type { editor } from "..";
import type { Editor } from "../editor";
import type { Grida2D } from "@grida/canvas-wasm";

export class CanvasWasmGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  private dpr: number;

  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D,
    dpr: number = 1
  ) {
    this.dpr = dpr;
  }

  updateDPR(dpr: number) {
    this.dpr = dpr;
  }

  getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    // Scale the point by DPR before passing to WASM surface
    const scaledPoint: cmath.Vector2 = [point[0] * this.dpr, point[1] * this.dpr];
    return this.surface.getNodeIdsFromPoint(scaledPoint[0], scaledPoint[1]);
  }

  getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    // Scale the envelope by DPR before passing to WASM surface  
    const scaledEnvelope = {
      x: envelope.x * this.dpr,
      y: envelope.y * this.dpr,
      width: envelope.width * this.dpr,
      height: envelope.height * this.dpr,
    };
    return this.surface.getNodeIdsFromEnvelope(scaledEnvelope);
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
    const rect = this.surface.getNodeAbsoluteBoundingBox(node_id);
    if (!rect) return null;
    
    // Scale the returned rectangle back to logical coordinates
    return {
      x: rect.x / this.dpr,
      y: rect.y / this.dpr,
      width: rect.width / this.dpr,
      height: rect.height / this.dpr,
    };
  }
}
