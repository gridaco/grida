import * as Y from "yjs";
import type { Patch } from "immer";

import { YPatchBinder, applyPatchToTarget } from "../sync-y-patches";
import { extractDocumentPatches } from "../sync-y";

describe("applyPatchToTarget", () => {
  it("updates nested values without clobbering siblings", () => {
    const doc = new Y.Doc();
    const target = doc.getMap("test");

    applyPatchToTarget(target, {
      op: "replace",
      path: [],
      value: {
        node: { id: "node", x: 0, y: 0 },
      },
    });

    applyPatchToTarget(target, {
      op: "replace",
      path: ["node", "x"],
      value: 42,
    });

    const node = target.get("node") as Y.Map<any>;
    expect(node.get("x")).toBe(42);
    expect(node.get("y")).toBe(0);
  });

  it("handles array operations", () => {
    const doc = new Y.Doc();
    const target = doc.getArray("test");

    applyPatchToTarget(target, {
      op: "replace",
      path: [],
      value: [1, 2, 3],
    });

    applyPatchToTarget(target, {
      op: "add",
      path: [1],
      value: 99,
    });

    expect(target.toArray()).toEqual([1, 99, 2, 3]);
  });

  it("handles empty patches gracefully", () => {
    const doc = new Y.Doc();
    const target = doc.getMap("test");

    expect(() => {
      applyPatchToTarget(target, {
        op: "replace",
        path: [],
        value: {},
      });
    }).not.toThrow();
  });
});

describe("YPatchBinder", () => {
  it("applies local patches to Y structures", () => {
    const doc = new Y.Doc();
    const nodes = doc.getMap("nodes");
    const binder = new YPatchBinder(nodes, {}, "client-a", () => {});

    binder.applyLocalPatches([
      {
        op: "add",
        path: ["node-1"],
        value: { id: "node-1", x: 0, y: 0 },
      },
    ]);

    binder.applyLocalPatches([
      {
        op: "replace",
        path: ["node-1", "x"],
        value: 100,
      },
    ]);

    const node = nodes.get("node-1") as Y.Map<any>;
    expect(node.get("x")).toBe(100);
    expect(node.get("y")).toBe(0);
  });

  it("handles empty patch arrays", () => {
    const doc = new Y.Doc();
    const nodes = doc.getMap("nodes");
    const binder = new YPatchBinder(nodes, {}, "client-a", () => {});

    expect(() => {
      binder.applyLocalPatches([]);
    }).not.toThrow();
  });

  it("maintains snapshot consistency", () => {
    const doc = new Y.Doc();
    const nodes = doc.getMap("nodes");
    const binder = new YPatchBinder(
      nodes,
      { existing: "data" },
      "client-a",
      () => {}
    );

    const snapshot = binder.getSnapshot();
    expect(snapshot).toEqual({ existing: "data" });
  });

  it("emits patches for remote updates", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const nodesA = docA.getMap("nodes");
    const nodesB = docB.getMap("nodes");

    const received: Patch[][] = [];
    const binder = new YPatchBinder(nodesA, {}, "client-a", (patches) => {
      received.push(patches);
    });

    binder.applyLocalPatches([
      {
        op: "add",
        path: ["node-1"],
        value: { id: "node-1", x: 0, y: 0 },
      },
    ]);

    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    docB.transact(() => {
      const node = nodesB.get("node-1") as Y.Map<any>;
      node.set("y", 88);
    }, "client-b");

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    expect(received).toHaveLength(1);
    expect(received[0][0]).toMatchObject({
      path: ["node-1", "y"],
      value: 88,
    });
  });
});

describe("extractDocumentPatches", () => {
  it("splits document patches into nodes and scenes", () => {
    const patches: Patch[] = [
      {
        op: "replace",
        path: ["document", "nodes", "node-1", "x"],
        value: 10,
      },
      {
        op: "replace",
        path: ["document", "scenes", "scene-1"],
        value: { id: "scene-1" },
      },
      {
        op: "replace",
        path: ["document"],
        value: {
          nodes: { "node-2": { id: "node-2" } },
          scenes: { "scene-2": { id: "scene-2" } },
        },
      },
    ];

    const result = extractDocumentPatches(patches);

    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["node-1", "x"], value: 10 }),
        expect.objectContaining({
          path: [],
          value: { "node-2": { id: "node-2" } },
        }),
      ])
    );
    expect(result.scenes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["scene-1"],
          value: { id: "scene-1" },
        }),
        expect.objectContaining({
          path: [],
          value: { "scene-2": { id: "scene-2" } },
        }),
      ])
    );
  });

  it("handles non-document patches", () => {
    const patches: Patch[] = [
      {
        op: "replace",
        path: ["selection"],
        value: ["node-1"],
      },
      {
        op: "replace",
        path: ["document", "nodes", "node-1"],
        value: { id: "node-1" },
      },
    ];

    const result = extractDocumentPatches(patches);

    expect(result.nodes).toHaveLength(1);
    expect(result.scenes).toHaveLength(0);
  });

  it("handles empty patches", () => {
    const result = extractDocumentPatches([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.scenes).toHaveLength(0);
  });
});
