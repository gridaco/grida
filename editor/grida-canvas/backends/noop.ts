import cmath from "@grida/cmath";
import type grida from "@grida/schema";
import type { editor } from "..";

export class NoopGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  getNodeIdsFromPoint(_point: cmath.Vector2): string[] {
    return [];
  }
  getNodeIdsFromEnvelope(_envelope: cmath.Rectangle): string[] {
    return [];
  }
  getNodeAbsoluteBoundingRect(_node_id: string): cmath.Rectangle | null {
    return null;
  }
  getNodeIdsFromPointerEvent(
    _event: editor.api.events.IPointerEvent
  ): string[] {
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

/**
 * No-op properties query provider for headless / test use.
 */
export class NoopPropertiesQueryProvider
  implements editor.api.IDocumentPropertiesQueryProvider
{
  queryPaintGroups(
    _ids: string[],
    _target: "fill" | "stroke",
    _options?: { recursive?: boolean; limit?: number }
  ): editor.api.PaintGroup[] {
    return [];
  }
}
