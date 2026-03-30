import grida from "@grida/schema";
import cmath from "@grida/cmath";
import type cg from "@grida/cg";
import type { Editor } from "../editor";
import { editor } from "..";
import { domapi } from "./dom";
import { dq } from "../query";
import { editor as editorUtils } from "../editor.i";
import equal from "fast-deep-equal";

class DOMContentApi {
  constructor(readonly containerId: string) {}

  private getContainerElement() {
    return window.document.getElementById(this.containerId);
  }

  /**
   * All elements with the `data-grida-node-id` attribute.
   * @deprecated Expensive
   */
  getElements(): NodeListOf<Element> | undefined {
    const content = this.getContainerElement();
    return content?.querySelectorAll(
      `[${grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY}]`
    );
  }

  getBoundingClientRect(): DOMRect | null {
    const el = this.getContainerElement();
    return el?.getBoundingClientRect() ?? null;
  }
}

export class DOMGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  private content: DOMContentApi;

  constructor(readonly editor: Editor) {
    this.content = new DOMContentApi(domapi.k.EDITOR_CONTENT_ELEMENT_ID);
  }

  getNodeIdsFromPointerEvent(event: {
    clientX: number;
    clientY: number;
  }): string[] {
    const hits = window.document.elementsFromPoint(
      event.clientX,
      event.clientY
    );

    const node_elements = hits.filter((h) =>
      h.attributes.getNamedItem(
        grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY
      )
    );

    return node_elements.map((el) => el.id);
  }

  getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    const _p = this.editor.camera.canvasPointToClientPoint(point);
    return this.getNodeIdsFromPointerEvent({
      clientX: _p[0],
      clientY: _p[1],
    });
  }

  getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    const contained: string[] = [];
    const all_els = this.content.getElements();

    all_els?.forEach((el: domapi.INode) => {
      const rect = this.getNodeAbsoluteBoundingRect(el.id);
      if (!rect) return;
      if (cmath.rect.intersects(rect, envelope)) {
        contained.push(el.id);
      }
    });

    return contained;
  }

  getNodeAbsoluteBoundingRect(
    target: (string & {}) | "<scene>"
  ): cmath.Rectangle | null {
    // DOM backend does not support "<scene>" — fall back to null
    if (target === "<scene>") return null;
    const node_id = target;
    const contentrect = this.content.getBoundingClientRect()!;
    const noderect = window.document
      .getElementById(node_id)
      ?.getBoundingClientRect();

    if (!contentrect) {
      throw new Error("renderer missing - content element rect is null");
    }

    if (!noderect) {
      return null;
    }

    const domrect = {
      x: noderect.x - contentrect.x,
      y: noderect.y - contentrect.y,
      width: noderect.width,
      height: noderect.height,
    } satisfies cmath.Rectangle;

    const scale = cmath.transform.getScale(this.editor.transform);
    const rect = cmath.rect.scale(
      domrect,
      [0, 0],
      [1 / scale[0], 1 / scale[1]]
    );

    // ignore floating point to 0.001 precision
    // // quantized to 0.01 precision
    // const qrect = {
    //   x: Math.round(rect.x * 1000) / 1000,
    //   y: Math.round(rect.y * 1000) / 1000,
    //   width: Math.round(rect.width * 1000) / 1000,
    //   height: Math.round(rect.height * 1000) / 1000,
    // };
    // return qrect

    return rect;
  }
}

export class DOMPropertiesQueryProvider
  implements editor.api.IDocumentPropertiesQueryProvider
{
  constructor(readonly editor: Editor) {}

  queryPaintGroups(
    ids: string[],
    target: "fill" | "stroke",
    options?: { recursive?: boolean; limit?: number }
  ): editor.api.PaintGroup[] {
    const recursive = options?.recursive ?? true;
    const limit = options?.limit ?? 0;
    const state = this.editor.getSnapshot();

    // Expand into subtrees if recursive
    const nodeIds = new Set<string>();
    for (const id of ids) {
      nodeIds.add(id);
      if (recursive) {
        for (const childId of dq.getChildren(state.document_ctx, id, true)) {
          nodeIds.add(childId);
        }
      }
    }

    // Collect active paints per node
    const paintEntries: Array<{ nodeId: string; paint: cg.Paint }> = [];
    for (const nodeId of nodeIds) {
      const node = state.document.nodes[
        nodeId
      ] as grida.program.nodes.UnknownNode;
      if (!node) continue;

      const { paints } = editorUtils.resolvePaints(node, target, 0);
      const activePaints = paints.filter((p) => p?.active !== false);
      for (const paint of activePaints) {
        paintEntries.push({ nodeId, paint });
      }
    }

    // Group by paint value (deep equality)
    const groups: editor.api.PaintGroup[] = [];
    for (const { nodeId, paint } of paintEntries) {
      if (limit > 0 && groups.length >= limit) {
        const existing = groups.find((g) => equal(g.value, paint));
        if (existing && !existing.ids.includes(nodeId)) {
          existing.ids.push(nodeId);
        }
        continue;
      }

      const existing = groups.find((g) => equal(g.value, paint));
      if (existing) {
        if (!existing.ids.includes(nodeId)) {
          existing.ids.push(nodeId);
        }
      } else {
        groups.push({ value: paint, ids: [nodeId] });
      }
    }

    return groups;
  }
}
