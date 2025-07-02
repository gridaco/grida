import cmath from "@grida/cmath";
import type { editor } from "..";

export class NoopGeometryQuery
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
