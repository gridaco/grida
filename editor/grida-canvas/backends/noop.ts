import cmath from "@grida/cmath";
import type grida from "@grida/schema";
import type { editor } from "..";

export class NoopGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    return [];
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

export class NoopDefaultExportInterfaceProvider
  implements editor.api.IDocumentExporterInterfaceProvider
{
  readonly formats = [];

  canExportNodeAs(
    _node_id: string,
    _format: "PNG" | "JPEG" | "PDF" | "SVG" | (string & {})
  ): boolean {
    return false;
  }

  exportNodeAs<F extends grida.program.document.NodeExportSettings["format"]>(
    _node_id: string,
    _format: F,
    _config?: editor.api.ExportConfigOf<F>
  ): Promise<F extends "SVG" ? string : Uint8Array> {
    throw new Error("Not implemented");
  }
}
