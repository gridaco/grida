/**
 * Focused bench for the per-node WASM sync path.
 *
 * Mirrors a subset of the discrete scenarios from `perf-editor.test.ts`
 * but uses the default `recording: "record"` mode — which emits real
 * Immer patches, so `__wasm_on_document_change` exercises the
 * `replaceNode(bytes)` per-node path instead of falling back to a
 * full `sync_document`. Use this to validate the per-node path end-to-end.
 *
 * ```sh
 * NODE_OPTIONS="--max-old-space-size=8192" GRIDA_PERF=1 \
 *   pnpm vitest run grida-canvas/__tests__/bench/perf-per-node-sync.test.ts
 * ```
 *
 * @vitest-environment node
 */
import { describe, test, beforeAll, afterAll } from "vitest";
import type { Action } from "@/grida-canvas/action";
import { sceneNode, rectNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";
import {
  createEditorWithWasmSync,
  type WasmEditorHandle,
  bench,
  logBench,
  dumpPerfAndReset,
} from "./_utils";

const SCENE_TIMEOUT = 300_000;

function generateGridDocument(n: number): grida.program.document.Document {
  const children: string[] = [];
  const nodes: Record<string, grida.program.nodes.Node> = {
    scene: sceneNode("scene", "Scene"),
  };
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const id = `r${i}`;
    children.push(id);
    nodes[id] = rectNode(id, {
      name: `Rect ${i}`,
      x: (i % cols) * 120,
      y: Math.floor(i / cols) * 120,
      width: 100,
      height: 100,
    });
  }
  return {
    scenes_ref: ["scene"],
    links: { scene: children },
    nodes,
    entry_scene_id: "scene",
    images: {},
    bitmaps: {},
    properties: {},
  };
}

describe("per-node sync (immer patches on)", () => {
  for (const size of [1_000, 10_000] as const) {
    describe(`${size.toLocaleString()} node grid`, () => {
      let handle: WasmEditorHandle;
      let target: string;

      beforeAll(async () => {
        handle = await createEditorWithWasmSync(generateGridDocument(size));
        target = `r${Math.floor(size / 2)}`;
      }, SCENE_TIMEOUT);

      afterAll(() => {
        console.log(`\n[perf] per-node sync: ${size} nodes`);
        dumpPerfAndReset(["dispatch."]);
        handle.dispose();
      });

      test("rename", { timeout: SCENE_TIMEOUT }, async () => {
        let i = 0;
        const result = await bench(() => {
          handle.ed.doc.dispatch(
            {
              type: "node/change/*",
              node_id: target,
              name: `n${i++}`,
            } as unknown as Action,
            { recording: "record" }
          );
        });
        logBench(`rename (${size})`, result);
      });

      test("fill color change", { timeout: SCENE_TIMEOUT }, async () => {
        const result = await bench(() => {
          handle.ed.doc.dispatch(
            {
              type: "node/change/*",
              node_id: target,
              fill: {
                type: "solid",
                color: { r: Math.random(), g: 0, b: 0, a: 1 },
                active: true,
              },
            } as unknown as Action,
            { recording: "record" }
          );
        });
        logBench(`fill color (${size})`, result);
      });

      test("opacity change", { timeout: SCENE_TIMEOUT }, async () => {
        const result = await bench(() => {
          handle.ed.doc.dispatch(
            {
              type: "node/change/*",
              node_id: target,
              opacity: Math.random(),
            } as unknown as Action,
            { recording: "record" }
          );
        });
        logBench(`opacity (${size})`, result);
      });
    });
  }
});
