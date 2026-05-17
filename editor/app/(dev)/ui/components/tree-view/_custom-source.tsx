"use client";

import {
  TreeController,
  type Listener,
  type NodeId,
  type TreeSource,
} from "@grida/tree-view";
import { DemoPanel, useDemoController } from "./_panel";

/**
 * A JSON tree of arbitrary shape, adapted to `TreeSource` without copying.
 */
interface JsonNode {
  id: string;
  name: string;
  kind: "frame" | "group" | "rect" | "text" | "image";
  children?: JsonNode[];
}

const jsonDoc: JsonNode = {
  id: "doc",
  name: "JSON document",
  kind: "frame",
  children: [
    {
      id: "page",
      name: "Page 1",
      kind: "frame",
      children: [
        { id: "rect-a", name: "Background", kind: "rect" },
        {
          id: "g",
          name: "Group A",
          kind: "group",
          children: [
            { id: "rect-b", name: "Card", kind: "rect" },
            { id: "t-1", name: "Title", kind: "text" },
          ],
        },
      ],
    },
    { id: "img-1", name: "Photo", kind: "image" },
  ],
};

type AdaptedNode = {
  id: string;
  parent: string | null;
  children: readonly string[];
  meta: { kind: JsonNode["kind"]; label: string };
};

class JsonSource implements TreeSource<{
  kind: JsonNode["kind"];
  label: string;
}> {
  /**
   * Pre-built, frozen adapted nodes. Stable references are critical:
   * selectors like `c.source.getNode(id).meta` are called on every render,
   * and useSyncExternalStore treats a fresh reference as a store change —
   * which would create an infinite update loop.
   */
  private adapted = new Map<string, AdaptedNode>();
  private version = 0;
  private listeners = new Set<Listener>();

  constructor(root: JsonNode) {
    const visit = (node: JsonNode, parent: string | null) => {
      this.adapted.set(node.id, {
        id: node.id,
        parent,
        children: (node.children ?? []).map((c) => c.id),
        meta: { kind: node.kind, label: node.name },
      });
      for (const c of node.children ?? []) visit(c, node.id);
    };
    visit(root, null);
  }

  getRoot(): NodeId {
    return "doc";
  }

  getNode(id: NodeId) {
    const n = this.adapted.get(id);
    if (!n) throw new Error(`unknown: ${id}`);
    return n;
  }

  getVersion(): number {
    return this.version;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isContainer(id: NodeId): boolean {
    const n = this.adapted.get(id);
    return !!n && n.children.length > 0;
  }

  getLabel(id: NodeId): string {
    return this.adapted.get(id)?.meta.label ?? id;
  }

  showRoot(): boolean {
    return false;
  }
}

export function CustomSourcePanel() {
  const controller = useDemoController(
    () =>
      new TreeController({
        source: new JsonSource(jsonDoc),
        expanded: ["page", "g"],
      })
  );
  return (
    <div className="w-full max-w-md">
      <DemoPanel controller={controller} keymap={null} />
    </div>
  );
}
