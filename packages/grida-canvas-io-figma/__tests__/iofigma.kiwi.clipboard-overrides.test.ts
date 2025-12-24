import { readFileSync } from "fs";
import { readHTMLMessage } from "../fig-kiwi";
import { iofigma } from "../lib";

const FIXTURES_BASE = __dirname + "/../../../fixtures/test-fig/clipboard";

const FILES = [
  "component-component-instance-blue-with-overrides.clipboard.html",
  "component-component-instance-red-with-overrides.clipboard.html",
  "component-component-set-component-instance-blue-with-overrides.clipboard.html",
  "component-component-set-component-instance-red-with-overrides.clipboard.html",
];

function findInstanceNc(nodeChanges: any[]) {
  return nodeChanges.find((nc) => nc.type === "INSTANCE");
}

describe("iofigma.kiwi clipboard overrides (fixtures)", () => {
  it("applies root-level paint overrides from symbolData.symbolOverrides onto INSTANCE", () => {
    for (const file of FILES) {
      const html = readFileSync(`${FIXTURES_BASE}/${file}`, "utf-8");
      const parsed = readHTMLMessage(html);
      const nodeChanges = parsed.message.nodeChanges ?? [];

      const instNc = findInstanceNc(nodeChanges);
      expect(instNc).toBeDefined();

      const o0 = instNc.symbolData?.symbolOverrides?.[0];
      expect(o0).toBeDefined();

      // Build just the node conversion (no flattening concerns)
      const instRest = iofigma.kiwi.factory.node(instNc, parsed.message) as any;
      expect(instRest?.type).toBe("INSTANCE");

      if (o0.fillPaints !== undefined) {
        expect(Array.isArray(instRest.fills)).toBe(true);
        expect(instRest.fills.length).toBe(o0.fillPaints.length);
      }

      if (o0.strokePaints !== undefined) {
        expect(Array.isArray(instRest.strokes)).toBe(true);
        expect(instRest.strokes.length).toBe(o0.strokePaints.length);
      }
    }
  });

  it("preserves applied overrides when building clipboard roots with flattenInstances=true", () => {
    for (const file of FILES) {
      const html = readFileSync(`${FIXTURES_BASE}/${file}`, "utf-8");
      const parsed = readHTMLMessage(html);

      const roots = iofigma.kiwi.buildClipboardRootNodes({
        nodeChanges: parsed.message.nodeChanges ?? [],
        message: parsed.message,
        options: { flattenInstances: true },
      });

      // All these fixtures are instance copies; internal master nodes must not be roots.
      expect(roots.length).toBe(1);
      expect((roots[0] as any).type).toBe("INSTANCE");

      // If overrides produced paints, ensure they are still present after flattening.
      const instNc = findInstanceNc(parsed.message.nodeChanges ?? []);
      const o0 = instNc?.symbolData?.symbolOverrides?.[0];

      if (o0?.fillPaints !== undefined) {
        expect(Array.isArray((roots[0] as any).fills)).toBe(true);
        expect((roots[0] as any).fills.length).toBe(o0.fillPaints.length);
      }
      if (o0?.strokePaints !== undefined) {
        expect(Array.isArray((roots[0] as any).strokes)).toBe(true);
        expect((roots[0] as any).strokes.length).toBe(o0.strokePaints.length);
      }
    }
  });
});


