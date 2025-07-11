import cmath from "@grida/cmath";
import type { editor } from "..";
import type { Editor } from "../editor";
import type { Grida2D } from "@grida/canvas-wasm";

export class CanvasWasmGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

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
    return this.surface.getNodeAbsoluteBoundingBox(node_id);
  }
}

export class CanvasWasmImageExportInterfaceProvider
  implements editor.api.IDocumentImageExportInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  async exportNodeAsImage(
    node_id: string,
    format: "PNG" | "JPEG"
  ): Promise<Uint8Array> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: format,
      constraints: {
        type: "SCALE",
        value: 1,
      },
    });
    return data.data;
  }
}

export class CanvasWasmPDFExportInterfaceProvider
  implements editor.api.IDocumentPDFExportInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  async exportNodeAsPDF(node_id: string): Promise<Uint8Array> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: "PDF",
    });
    return data.data;
  }
}
